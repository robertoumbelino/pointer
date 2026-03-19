import type { TableRef, TableSearchHit } from './db-types'

type TableMatchScore = {
  matched: boolean
  score: number
  compactness: number
}

type FuzzyTargetScore = {
  matched: boolean
  score: number
  positions: number[]
}

export function rankTableSearchHits(hits: TableSearchHit[], query: string, limit = 300): TableSearchHit[] {
  const normalizedQuery = query.trim().toLowerCase()

  const scoredResults = hits.map((hit) => ({
    hit,
    match: scoreTableMatch(hit.table, normalizedQuery),
  }))

  const filteredResults = normalizedQuery
    ? scoredResults.filter((candidate) => candidate.match.matched)
    : scoredResults

  return filteredResults
    .sort((a, b) => {
      const scoreDiff = b.match.score - a.match.score
      if (scoreDiff !== 0) {
        return scoreDiff
      }

      const compactnessDiff = a.match.compactness - b.match.compactness
      if (compactnessDiff !== 0) {
        return compactnessDiff
      }

      const lengthDiff = a.hit.table.name.length - b.hit.table.name.length
      if (lengthDiff !== 0) {
        return lengthDiff
      }

      const byConnection = a.hit.connectionName.localeCompare(b.hit.connectionName)
      if (byConnection !== 0) {
        return byConnection
      }

      return a.hit.table.fqName.localeCompare(b.hit.table.fqName)
    })
    .map((candidate) => candidate.hit)
    .slice(0, limit)
}

export function compactTableSearchValue(value: string): string {
  return value.toLowerCase().replace(/[_. -]+/g, '')
}

export function isSubsequenceMatch(query: string, target: string): boolean {
  if (!query) {
    return true
  }

  let queryIndex = 0
  for (let targetIndex = 0; targetIndex < target.length; targetIndex += 1) {
    if (target[targetIndex] === query[queryIndex]) {
      queryIndex += 1
      if (queryIndex >= query.length) {
        return true
      }
    }
  }

  return false
}

function scoreTableMatch(table: TableRef, queryLower: string): TableMatchScore {
  if (!queryLower) {
    return {
      matched: true,
      score: 0,
      compactness: Number.MAX_SAFE_INTEGER,
    }
  }

  const compactQuery = compactTableSearchValue(queryLower)
  const candidates: FuzzyTargetScore[] = [
    boostFuzzyTarget(scoreFuzzyTarget(table.name, queryLower), 40),
    boostFuzzyTarget(scoreFuzzyTarget(table.fqName, queryLower), 20),
  ]

  if (compactQuery) {
    candidates.push(boostFuzzyTarget(scoreFuzzyTarget(compactTableSearchValue(table.name), compactQuery), 60))
    candidates.push(boostFuzzyTarget(scoreFuzzyTarget(compactTableSearchValue(table.fqName), compactQuery), 30))
  }

  const matchedCandidates = candidates.filter((candidate) => candidate.matched)
  if (matchedCandidates.length === 0) {
    return {
      matched: false,
      score: 0,
      compactness: Number.MAX_SAFE_INTEGER,
    }
  }

  const bestCandidate = matchedCandidates.reduce((best, current) => {
    if (current.score > best.score) {
      return current
    }

    if (current.score < best.score) {
      return best
    }

    const currentCompactness = computePositionsCompactness(current.positions)
    const bestCompactness = computePositionsCompactness(best.positions)
    return currentCompactness < bestCompactness ? current : best
  })

  return {
    matched: true,
    score: bestCandidate.score,
    compactness: computePositionsCompactness(bestCandidate.positions),
  }
}

function boostFuzzyTarget(candidate: FuzzyTargetScore, boost: number): FuzzyTargetScore {
  if (!candidate.matched) {
    return candidate
  }

  return {
    ...candidate,
    score: candidate.score + boost,
  }
}

function scoreFuzzyTarget(target: string, queryLower: string): FuzzyTargetScore {
  if (!target || !queryLower) {
    return { matched: false, score: 0, positions: [] }
  }

  const targetLower = target.toLowerCase()

  if (targetLower === queryLower) {
    return {
      matched: true,
      score: 20_000 + queryLower.length * 100,
      positions: Array.from({ length: queryLower.length }, (_, index) => index),
    }
  }

  if (targetLower.startsWith(queryLower)) {
    return {
      matched: true,
      score: 12_000 + queryLower.length * 80,
      positions: Array.from({ length: queryLower.length }, (_, index) => index),
    }
  }

  const queryLength = queryLower.length
  const targetLength = target.length
  if (queryLength > targetLength) {
    return { matched: false, score: 0, positions: [] }
  }

  const scores = new Array<number>(queryLength * targetLength).fill(0)
  const matches = new Array<number>(queryLength * targetLength).fill(0)

  for (let queryIndex = 0; queryIndex < queryLength; queryIndex += 1) {
    const queryOffset = queryIndex * targetLength
    const previousOffset = queryOffset - targetLength
    const queryChar = queryLower[queryIndex]

    for (let targetIndex = 0; targetIndex < targetLength; targetIndex += 1) {
      const currentIndex = queryOffset + targetIndex
      const leftIndex = currentIndex - 1
      const diagIndex = previousOffset + targetIndex - 1
      const leftScore = targetIndex > 0 ? scores[leftIndex] : 0
      const diagScore = queryIndex > 0 && targetIndex > 0 ? scores[diagIndex] : 0
      const matchSequenceLength = queryIndex > 0 && targetIndex > 0 ? matches[diagIndex] : 0

      let charScore = 0
      if (queryIndex === 0 || diagScore > 0) {
        charScore = computeFuzzyCharScore(queryChar, target, targetLower, targetIndex, matchSequenceLength)
      }

      const nextScore = diagScore + charScore
      if (charScore > 0 && nextScore >= leftScore) {
        scores[currentIndex] = nextScore
        matches[currentIndex] = matchSequenceLength + 1
      } else {
        scores[currentIndex] = leftScore
        matches[currentIndex] = 0
      }
    }
  }

  const finalScore = scores[queryLength * targetLength - 1]
  if (finalScore <= 0) {
    return { matched: false, score: 0, positions: [] }
  }

  const positions: number[] = []
  let queryIndex = queryLength - 1
  let targetIndex = targetLength - 1
  while (queryIndex >= 0 && targetIndex >= 0) {
    const currentIndex = queryIndex * targetLength + targetIndex
    if (matches[currentIndex] === 0) {
      targetIndex -= 1
      continue
    }

    positions.push(targetIndex)
    queryIndex -= 1
    targetIndex -= 1
  }

  if (positions.length !== queryLength) {
    return { matched: false, score: 0, positions: [] }
  }

  positions.reverse()

  const span = computePositionsSpan(positions)
  const compactnessBonus = Math.max(0, queryLength * 3 - (span - queryLength))

  return {
    matched: true,
    score: finalScore + compactnessBonus * 4,
    positions,
  }
}

function computeFuzzyCharScore(
  queryChar: string,
  target: string,
  targetLower: string,
  targetIndex: number,
  sequenceLength: number,
): number {
  if (queryChar !== targetLower[targetIndex]) {
    return 0
  }

  let score = 1

  if (sequenceLength > 0) {
    score += Math.min(sequenceLength, 3) * 6
    score += Math.max(0, sequenceLength - 3) * 3
  }

  if (targetIndex === 0) {
    score += 8
    return score
  }

  const separatorBonus = separatorBonusForChar(target[targetIndex - 1] ?? '')
  if (separatorBonus > 0) {
    score += separatorBonus
    return score
  }

  if (isUppercaseAscii(target[targetIndex] ?? '') && sequenceLength === 0) {
    score += 2
  }

  return score
}

function separatorBonusForChar(char: string): number {
  if (char === '/' || char === '\\') {
    return 5
  }

  if (char === '_' || char === '-' || char === '.' || char === ' ' || char === '\'' || char === '"' || char === ':') {
    return 4
  }

  return 0
}

function isUppercaseAscii(char: string): boolean {
  if (!char) {
    return false
  }

  const code = char.charCodeAt(0)
  return code >= 65 && code <= 90
}

function computePositionsSpan(positions: number[]): number {
  if (positions.length === 0) {
    return Number.MAX_SAFE_INTEGER
  }

  return positions[positions.length - 1] - positions[0] + 1
}

function computePositionsCompactness(positions: number[]): number {
  const span = computePositionsSpan(positions)
  if (span === Number.MAX_SAFE_INTEGER) {
    return span
  }

  return span - positions.length
}
