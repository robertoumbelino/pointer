export type ChangelogSection = {
  title: string
  items: string[]
}

export type ChangelogEntry = {
  version: string
  title: string
  status: string | null
  date: string | null
  sections: ChangelogSection[]
}

const DEFAULT_SECTION_TITLE = '📌 Alterações'

export function normalizeVersion(value: string): string {
  return value.trim().replace(/^v/i, '')
}

export function isSameVersion(left: string, right: string): boolean {
  return normalizeVersion(left) !== '' && normalizeVersion(left) === normalizeVersion(right)
}

export function parseChangelog(markdown: string): ChangelogEntry[] {
  const lines = markdown.split(/\r?\n/)
  const entries: ChangelogEntry[] = []

  let currentEntry: ChangelogEntry | null = null
  let currentSection: ChangelogSection | null = null

  function ensureSection(): ChangelogSection | null {
    if (!currentEntry) {
      return null
    }

    if (!currentSection) {
      currentSection = {
        title: DEFAULT_SECTION_TITLE,
        items: [],
      }
      currentEntry.sections.push(currentSection)
    }

    return currentSection
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()

    if (line.length === 0 || line.startsWith('# ')) {
      continue
    }

    if (line.startsWith('## ')) {
      const parsedHeading = parseVersionHeading(line.slice(3).trim())
      currentEntry = {
        version: parsedHeading.version,
        title: parsedHeading.title,
        status: parsedHeading.status,
        date: parsedHeading.date,
        sections: [],
      }
      currentSection = null
      entries.push(currentEntry)
      continue
    }

    if (!currentEntry) {
      continue
    }

    if (line.startsWith('### ')) {
      currentSection = {
        title: line.slice(4).trim() || DEFAULT_SECTION_TITLE,
        items: [],
      }
      currentEntry.sections.push(currentSection)
      continue
    }

    if (line.startsWith('- ')) {
      const section = ensureSection()
      if (!section) {
        continue
      }

      section.items.push(line.slice(2).trim())
    }
  }

  return entries
    .map((entry) => ({
      ...entry,
      sections: entry.sections.filter((section) => section.items.length > 0),
    }))
    .filter((entry) => entry.sections.length > 0)
}

function parseVersionHeading(heading: string): {
  version: string
  title: string
  status: string | null
  date: string | null
} {
  const splitIndex = heading.indexOf(' - ')
  const left = splitIndex > -1 ? heading.slice(0, splitIndex).trim() : heading.trim()
  const right = splitIndex > -1 ? heading.slice(splitIndex + 3).trim() : ''

  const match = left.match(/^v?(\d+\.\d+\.\d+)(?:\s*\(([^)]+)\))?$/i)
  if (!match) {
    return {
      version: left,
      title: left,
      status: null,
      date: right || null,
    }
  }

  const version = `v${match[1]}`
  const status = match[2]?.trim() || null

  return {
    version,
    title: status ? `${version} (${status})` : version,
    status,
    date: right || null,
  }
}
