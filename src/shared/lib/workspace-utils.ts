import type {
  ConnectionSummary,
  DatabaseEngine,
  TableRef,
  TableSchema,
} from '../../../shared/db-types'
import { parse as parsePostgresArray } from 'postgres-array'
import { DEFAULT_ENVIRONMENT_COLOR } from '../constants/app'
import { pointerApi } from '../api/pointer-api'
import type { InsertDraftRow } from '../../entities/workspace/types'

export function createInitialInsertDraft(schema: TableSchema): InsertDraftRow {
  const draft: InsertDraftRow = {}
  const nowIso = new Date().toISOString()

  for (const column of schema.columns) {
    const normalizedName = column.name.toLowerCase()

    if (column.isPrimaryKey) {
      const primaryKeyDefault = generatePrimaryKeyDefault(column.dataType)
      if (primaryKeyDefault !== undefined) {
        draft[column.name] = primaryKeyDefault
      }
    }

    if ((normalizedName === 'created_at' || normalizedName === 'updated_at') && isDateTimeDataType(column.dataType)) {
      draft[column.name] = nowIso
    }

    if (column.enumValues && column.enumValues.length > 0 && draft[column.name] === undefined) {
      draft[column.name] = column.nullable ? null : column.enumValues[0]
    }

    if (isBooleanDataType(column.dataType) && column.nullable && draft[column.name] === undefined) {
      draft[column.name] = null
    }
  }

  return draft
}

export function buildInsertPayload(draft: InsertDraftRow, schema: TableSchema): Record<string, unknown> {
  const payload: Record<string, unknown> = {}

  for (const column of schema.columns) {
    const normalizedValue = normalizeInsertValue(draft[column.name], column.dataType)
    if (normalizedValue === undefined) {
      continue
    }

    payload[column.name] = normalizedValue
  }

  return payload
}

export function normalizeInsertValue(rawValue: unknown, dataType: string): unknown {
  if (rawValue === undefined) {
    return undefined
  }

  if (rawValue === null) {
    return null
  }

  if (typeof rawValue !== 'string') {
    return rawValue
  }

  const trimmed = rawValue.trim()
  if (!trimmed) {
    return undefined
  }

  if (trimmed.toLowerCase() === 'null') {
    return null
  }

  if (isBooleanDataType(dataType)) {
    if (trimmed.toLowerCase() === 'true') {
      return true
    }

    if (trimmed.toLowerCase() === 'false') {
      return false
    }
  }

  if (isNumericDataType(dataType)) {
    const parsedNumber = Number(trimmed)
    if (!Number.isNaN(parsedNumber) && Number.isFinite(parsedNumber)) {
      return parsedNumber
    }
  }

  if (isArrayDataType(dataType)) {
    const parsedArray = parseArrayInputValue(trimmed)
    if (parsedArray !== undefined) {
      return parsedArray
    }

    return trimmed
  }

  if (isJsonLikeDataType(dataType)) {
    try {
      return JSON.parse(trimmed)
    } catch {
      return trimmed
    }
  }

  return trimmed
}

export function formatDraftInputValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  if (value instanceof Date) {
    const timestamp = value.getTime()
    if (!Number.isNaN(timestamp)) {
      return formatLocalDateTime(value)
    }
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}

export function cloneRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) => ({ ...row }))
}

export function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true
  }

  return JSON.stringify(left) === JSON.stringify(right)
}

export function resolveCommandScopedColumn(schema: TableSchema, draftColumn: string): string | null {
  const candidate = draftColumn.trim().toLowerCase()
  if (!candidate) {
    return schema.columns[0]?.name ?? null
  }

  const exact = schema.columns.find((column) => column.name.toLowerCase() === candidate)
  if (exact) {
    return exact.name
  }

  const startsWith = schema.columns.find((column) => column.name.toLowerCase().startsWith(candidate))
  if (startsWith) {
    return startsWith.name
  }

  return null
}

export function buildCreateTableTemplateSql(engine: DatabaseEngine, schema: TableSchema): string {
  const columnsSql = schema.columns
    .map((column) => {
      const nullability = column.nullable ? '' : ' NOT NULL'
      return `  ${quoteSqlIdentifier(engine, column.name)} ${column.dataType}${nullability}`
    })
    .join(',\n')

  const primaryKeySql =
    schema.primaryKey.length > 0
      ? `,\n  PRIMARY KEY (${schema.primaryKey.map((column) => quoteSqlIdentifier(engine, column)).join(', ')})`
      : ''

  return `CREATE TABLE ${quoteSqlIdentifier(engine, schema.table.schema)}.${quoteSqlIdentifier(engine, schema.table.name)} (\n${columnsSql}${primaryKeySql}\n);`
}

export function buildInsertTemplateSql(engine: DatabaseEngine, schema: TableSchema): string {
  const columns = schema.columns.map((column) => quoteSqlIdentifier(engine, column.name))
  const placeholders = schema.columns.map(() => '?')

  return `INSERT INTO ${quoteSqlIdentifier(engine, schema.table.schema)}.${quoteSqlIdentifier(engine, schema.table.name)} (\n  ${columns.join(',\n  ')}\n)\nVALUES (\n  ${placeholders.join(',\n  ')}\n);`
}

export function quoteSqlIdentifier(engine: DatabaseEngine, identifier: string): string {
  if (engine === 'clickhouse') {
    return '`' + identifier.replace(/`/g, '``') + '`'
  }

  return `"${identifier.replace(/"/g, '""')}"`
}

export function formatCell(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL'
  }

  if (value instanceof Date) {
    const timestamp = value.getTime()
    if (!Number.isNaN(timestamp)) {
      return formatLocalDateTime(value)
    }
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}

export function formatTableLabel(table: TableRef): string {
  if (table.schema === 'public' || table.schema === 'default') {
    return table.name
  }

  return `${table.schema}.${table.name}`
}

export function formatSidebarTableName(table: TableRef): string {
  return table.name
}

export function engineLabel(engine: DatabaseEngine): string {
  if (engine === 'postgres') {
    return 'Postgres'
  }

  if (engine === 'clickhouse') {
    return 'ClickHouse'
  }

  return 'SQLite'
}

export function engineShortLabel(engine: DatabaseEngine): string {
  if (engine === 'postgres') {
    return 'PG'
  }

  if (engine === 'clickhouse') {
    return 'CH'
  }

  return 'SQ'
}

export function defaultPortByEngine(engine: DatabaseEngine): number {
  if (engine === 'postgres') {
    return 5432
  }

  if (engine === 'clickhouse') {
    return 8123
  }

  return 0
}

export function extractSqliteDatabaseName(filePath: string): string {
  const filename = filePath.split(/[/\\]/).pop() ?? filePath
  return filename.replace(/\.(sqlite3?|db)$/i, '')
}

export function normalizeHexColor(color?: string): string {
  const normalized = color?.trim().toUpperCase()
  if (!normalized) {
    return DEFAULT_ENVIRONMENT_COLOR
  }

  const hexMatch = normalized.match(/^#([0-9A-F]{6})$/)
  if (hexMatch) {
    return `#${hexMatch[1]}`
  }

  const shortHexMatch = normalized.match(/^#([0-9A-F]{3})$/)
  if (shortHexMatch) {
    const [r, g, b] = shortHexMatch[1].split('')
    return `#${r}${r}${g}${g}${b}${b}`
  }

  return DEFAULT_ENVIRONMENT_COLOR
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = normalizeHexColor(hex).slice(1)

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  }
}

export function getSqlStatementAtCursor(sqlText: string, cursorOffset: number): string | null {
  const segments = splitSqlSegmentsWithRange(sqlText)
  if (segments.length === 0) {
    return null
  }

  const cursor = Math.max(0, Math.min(cursorOffset, sqlText.length))
  const exact = segments.find((segment) => cursor >= segment.start && cursor <= segment.end)
  if (exact) {
    return exact.sql
  }

  const previous = [...segments].reverse().find((segment) => segment.start <= cursor)
  if (previous) {
    return previous.sql
  }

  return segments[0].sql
}

const SQL_STATEMENT_START_KEYWORDS = new Set([
  'SELECT',
  'WITH',
  'INSERT',
  'UPDATE',
  'DELETE',
  'CREATE',
  'ALTER',
  'DROP',
  'TRUNCATE',
  'MERGE',
  'EXPLAIN',
  'SHOW',
  'DESCRIBE',
  'DESC',
  'USE',
  'SET',
  'CALL',
  'PRAGMA',
])

function isSqlStatementStartKeyword(source: string, start: number, end: number): boolean {
  let index = start

  while (index < end) {
    while (index < end && /\s/.test(source[index])) {
      index += 1
    }

    if (index >= end) {
      return false
    }

    const char = source[index]
    const nextChar = source[index + 1]

    if (char === '-' && nextChar === '-') {
      index += 2
      while (index < end && source[index] !== '\n') {
        index += 1
      }
      continue
    }

    if (char === '/' && nextChar === '*') {
      index += 2
      while (index < end) {
        if (source[index] === '*' && source[index + 1] === '/') {
          index += 2
          break
        }

        index += 1
      }
      continue
    }

    break
  }

  if (index >= end || !/[A-Za-z_]/.test(source[index])) {
    return false
  }

  let keywordEnd = index + 1
  while (keywordEnd < end && /[A-Za-z_]/.test(source[keywordEnd])) {
    keywordEnd += 1
  }

  const keyword = source.slice(index, keywordEnd).toUpperCase()
  return SQL_STATEMENT_START_KEYWORDS.has(keyword)
}

function splitChunkByBlankLineConservative(
  source: string,
  start: number,
  end: number,
): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = []
  if (start >= end) {
    return ranges
  }

  let statementStart = start
  let lineStart = start
  let lineHasNonWhitespace = false
  let blankRunStart: number | null = null
  let sawContentSinceStatementStart = false

  let inSingleQuote = false
  let inDoubleQuote = false
  let inLineComment = false
  let inBlockComment = false

  const finalizeLine = (nextLineStart: number): void => {
    const lineIsBlank = !lineHasNonWhitespace && !inSingleQuote && !inDoubleQuote && !inBlockComment

    if (lineIsBlank) {
      if (blankRunStart === null && sawContentSinceStatementStart) {
        blankRunStart = lineStart
      }
    } else {
      sawContentSinceStatementStart = true

      if (blankRunStart !== null) {
        if (isSqlStatementStartKeyword(source, lineStart, end)) {
          ranges.push({ start: statementStart, end: blankRunStart })
          statementStart = lineStart
        }

        blankRunStart = null
      }
    }

    lineStart = nextLineStart
    lineHasNonWhitespace = false
  }

  for (let index = start; index < end; index += 1) {
    const char = source[index]
    const nextChar = source[index + 1]

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false
        finalizeLine(index + 1)
      } else {
        lineHasNonWhitespace = true
      }
      continue
    }

    if (inBlockComment) {
      lineHasNonWhitespace = true

      if (char === '*' && nextChar === '/') {
        inBlockComment = false
        index += 1
        continue
      }

      if (char === '\n') {
        finalizeLine(index + 1)
      }
      continue
    }

    if (inSingleQuote) {
      lineHasNonWhitespace = true

      if (char === "'" && nextChar === "'") {
        index += 1
        continue
      }

      if (char === "'") {
        inSingleQuote = false
        continue
      }

      if (char === '\n') {
        finalizeLine(index + 1)
      }
      continue
    }

    if (inDoubleQuote) {
      lineHasNonWhitespace = true

      if (char === '"' && nextChar === '"') {
        index += 1
        continue
      }

      if (char === '"') {
        inDoubleQuote = false
        continue
      }

      if (char === '\n') {
        finalizeLine(index + 1)
      }
      continue
    }

    if (char === '\n') {
      finalizeLine(index + 1)
      continue
    }

    if (char === '-' && nextChar === '-') {
      inLineComment = true
      lineHasNonWhitespace = true
      index += 1
      continue
    }

    if (char === '/' && nextChar === '*') {
      inBlockComment = true
      lineHasNonWhitespace = true
      index += 1
      continue
    }

    if (char === "'") {
      inSingleQuote = true
      lineHasNonWhitespace = true
      continue
    }

    if (char === '"') {
      inDoubleQuote = true
      lineHasNonWhitespace = true
      continue
    }

    if (!/\s/.test(char)) {
      lineHasNonWhitespace = true
    }
  }

  finalizeLine(end)
  ranges.push({ start: statementStart, end })

  return ranges
}

export function splitSqlSegmentsWithRange(sqlText: string): Array<{ sql: string; start: number; end: number }> {
  const segments: Array<{ sql: string; start: number; end: number }> = []
  const source = sqlText
  const semicolonChunks: Array<{ start: number; end: number }> = []

  let chunkStart = 0
  let inSingleQuote = false
  let inDoubleQuote = false
  let inLineComment = false
  let inBlockComment = false

  const pushSegment = (start: number, end: number): void => {
    const chunk = source.slice(start, end)
    if (!chunk.trim()) {
      return
    }

    const leftOffset = chunk.search(/\S/)
    if (leftOffset < 0) {
      return
    }

    const rightOffset = chunk.length - chunk.trimEnd().length
    const statementStart = start + leftOffset
    const statementEnd = end - rightOffset

    segments.push({
      sql: source.slice(statementStart, statementEnd),
      start: statementStart,
      end: statementEnd,
    })
  }

  const pushSemicolonChunk = (start: number, end: number): void => {
    const chunk = source.slice(start, end)
    if (!chunk.trim()) {
      return
    }

    semicolonChunks.push({ start, end })
  }

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const nextChar = source[index + 1]

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false
      }
      continue
    }

    if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        inBlockComment = false
        index += 1
      }
      continue
    }

    if (inSingleQuote) {
      if (char === "'" && nextChar === "'") {
        index += 1
        continue
      }

      if (char === "'") {
        inSingleQuote = false
      }
      continue
    }

    if (inDoubleQuote) {
      if (char === '"' && nextChar === '"') {
        index += 1
        continue
      }

      if (char === '"') {
        inDoubleQuote = false
      }
      continue
    }

    if (char === '-' && nextChar === '-') {
      inLineComment = true
      index += 1
      continue
    }

    if (char === '/' && nextChar === '*') {
      inBlockComment = true
      index += 1
      continue
    }

    if (char === "'") {
      inSingleQuote = true
      continue
    }

    if (char === '"') {
      inDoubleQuote = true
      continue
    }

    if (char === ';') {
      pushSemicolonChunk(chunkStart, index)
      chunkStart = index + 1
    }
  }

  pushSemicolonChunk(chunkStart, source.length)

  for (const chunk of semicolonChunks) {
    const splitRanges = splitChunkByBlankLineConservative(source, chunk.start, chunk.end)

    for (const range of splitRanges) {
      pushSegment(range.start, range.end)
    }
  }

  return segments
}

export type SqlFromTableReference = {
  schema?: string
  name: string
  fqName: string
}

type SqlTableReferenceKeyword = 'from' | 'join'

type SqlFromTableReferenceRange = {
  reference: SqlFromTableReference
  start: number
  end: number
  keyword: SqlTableReferenceKeyword
}

function isSqlIdentifierChar(char: string): boolean {
  return /[A-Za-z0-9_$]/.test(char)
}

function skipWhitespace(source: string, start: number): number {
  let index = start
  while (index < source.length && /\s/.test(source[index])) {
    index += 1
  }
  return index
}

function readSqlIdentifierPart(source: string, start: number): { value: string; nextIndex: number } | null {
  const firstChar = source[start]
  if (!firstChar) {
    return null
  }

  if (firstChar === '"') {
    let index = start + 1
    let value = ''

    while (index < source.length) {
      const char = source[index]
      const nextChar = source[index + 1]
      if (char === '"' && nextChar === '"') {
        value += '"'
        index += 2
        continue
      }

      if (char === '"') {
        return {
          value,
          nextIndex: index + 1,
        }
      }

      value += char
      index += 1
    }

    return null
  }

  if (firstChar === '`') {
    let index = start + 1
    let value = ''

    while (index < source.length) {
      const char = source[index]
      const nextChar = source[index + 1]
      if (char === '`' && nextChar === '`') {
        value += '`'
        index += 2
        continue
      }

      if (char === '`') {
        return {
          value,
          nextIndex: index + 1,
        }
      }

      value += char
      index += 1
    }

    return null
  }

  if (firstChar === '[') {
    const end = source.indexOf(']', start + 1)
    if (end < 0) {
      return null
    }

    return {
      value: source.slice(start + 1, end),
      nextIndex: end + 1,
    }
  }

  if (!/[A-Za-z_]/.test(firstChar)) {
    return null
  }

  let index = start + 1
  while (index < source.length && isSqlIdentifierChar(source[index])) {
    index += 1
  }

  return {
    value: source.slice(start, index),
    nextIndex: index,
  }
}

function readTableReferenceAfterKeyword(
  source: string,
  keywordStart: number,
  keywordLength: number,
): { reference: SqlFromTableReference | null; nextIndex: number; start: number; end: number } {
  let cursor = skipWhitespace(source, keywordStart + keywordLength)
  if (cursor >= source.length) {
    return {
      reference: null,
      nextIndex: source.length,
      start: cursor,
      end: cursor,
    }
  }

  if (source[cursor] === '(') {
    return {
      reference: null,
      nextIndex: cursor + 1,
      start: cursor,
      end: cursor,
    }
  }

  const referenceStart = cursor
  const firstPart = readSqlIdentifierPart(source, cursor)
  if (!firstPart) {
    return {
      reference: null,
      nextIndex: cursor + 1,
      start: cursor,
      end: cursor,
    }
  }

  cursor = skipWhitespace(source, firstPart.nextIndex)
  if (source[cursor] === '(') {
    return {
      reference: null,
      nextIndex: cursor + 1,
      start: referenceStart,
      end: cursor,
    }
  }

  let schema: string | undefined
  let name = firstPart.value

  if (source[cursor] === '.') {
    cursor = skipWhitespace(source, cursor + 1)
    const secondPart = readSqlIdentifierPart(source, cursor)
    if (!secondPart) {
      return {
        reference: null,
        nextIndex: cursor + 1,
        start: referenceStart,
        end: cursor,
      }
    }

    schema = firstPart.value
    name = secondPart.value
    cursor = secondPart.nextIndex
  }

  const normalizedSchema = schema?.trim()
  const normalizedName = name.trim()
  if (!normalizedName) {
    return {
      reference: null,
      nextIndex: cursor,
      start: referenceStart,
      end: cursor,
    }
  }

  return {
    reference: {
      schema: normalizedSchema || undefined,
      name: normalizedName,
      fqName: normalizedSchema ? `${normalizedSchema}.${normalizedName}` : normalizedName,
    },
    nextIndex: cursor,
    start: referenceStart,
    end: cursor,
  }
}

function isSqlKeywordAt(source: string, index: number, keyword: SqlTableReferenceKeyword): boolean {
  if (source.slice(index, index + keyword.length).toLowerCase() !== keyword) {
    return false
  }

  const previousChar = source[index - 1] ?? ''
  const followingChar = source[index + keyword.length] ?? ''
  if ((previousChar && isSqlIdentifierChar(previousChar)) || (followingChar && isSqlIdentifierChar(followingChar))) {
    return false
  }

  return true
}

function collectSqlTableReferences(
  sqlText: string,
  keywords: SqlTableReferenceKeyword[],
): SqlFromTableReferenceRange[] {
  const source = sqlText
  const results: SqlFromTableReferenceRange[] = []

  let inSingleQuote = false
  let inDoubleQuote = false
  let inLineComment = false
  let inBlockComment = false

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const nextChar = source[index + 1]

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false
      }
      continue
    }

    if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        inBlockComment = false
        index += 1
      }
      continue
    }

    if (inSingleQuote) {
      if (char === "'" && nextChar === "'") {
        index += 1
        continue
      }

      if (char === "'") {
        inSingleQuote = false
      }
      continue
    }

    if (inDoubleQuote) {
      if (char === '"' && nextChar === '"') {
        index += 1
        continue
      }

      if (char === '"') {
        inDoubleQuote = false
      }
      continue
    }

    if (char === '-' && nextChar === '-') {
      inLineComment = true
      index += 1
      continue
    }

    if (char === '/' && nextChar === '*') {
      inBlockComment = true
      index += 1
      continue
    }

    if (char === "'") {
      inSingleQuote = true
      continue
    }

    if (char === '"') {
      inDoubleQuote = true
      continue
    }

    for (const keyword of keywords) {
      if (!isSqlKeywordAt(source, index, keyword)) {
        continue
      }

      const parsed = readTableReferenceAfterKeyword(source, index, keyword.length)
      if (parsed.reference) {
        results.push({
          reference: parsed.reference,
          start: parsed.start,
          end: parsed.end,
          keyword,
        })
      }
      index = Math.max(index, parsed.nextIndex - 1)
      break
    }
  }

  return results
}

export function extractFirstFromTableReference(sqlText: string): SqlFromTableReference | null {
  const firstFrom = collectSqlTableReferences(sqlText, ['from'])[0]
  if (firstFrom) {
    return firstFrom.reference
  }

  return null
}

export function extractFromJoinTableReferenceAtCursor(
  sqlText: string,
  cursorOffset: number,
): SqlFromTableReference | null {
  if (!sqlText) {
    return null
  }

  const normalizedCursor = Math.max(0, Math.min(cursorOffset, sqlText.length))
  const references = collectSqlTableReferences(sqlText, ['from', 'join'])
  if (references.length === 0) {
    return null
  }

  const match =
    references.find((reference) => normalizedCursor >= reference.start && normalizedCursor <= reference.end) ??
    references.find((reference) => normalizedCursor > reference.start && normalizedCursor < reference.end)

  if (match) {
    return match.reference
  }

  return null
}

export async function buildClickHouseUnknownTableFallbackSql(
  connections: ConnectionSummary[],
  connectionId: string,
  sqlText: string,
  error: unknown,
): Promise<string | null> {
  const connection = connections.find((candidate) => candidate.id === connectionId)
  if (!connection || connection.engine !== 'clickhouse') {
    return null
  }

  const message = getErrorMessage(error)
  const missingTableMatch = message.match(/Unknown table expression identifier '([^']+)'/i)
  const missingTable = missingTableMatch?.[1]?.trim()
  if (!missingTable || missingTable.includes('.')) {
    return null
  }

  const allTables = await pointerApi.listTables(connectionId)
  const matches = allTables.filter((table) => table.name.toLowerCase() === missingTable.toLowerCase())

  if (matches.length === 0) {
    return null
  }

  if (matches.length > 1) {
    throw new Error(
      `Tabela "${missingTable}" existe em múltiplos schemas. Use schema.tabela (ex: ${matches[0].fqName}).`,
    )
  }

  const replacement = `${matches[0].schema}.${matches[0].name}`
  const regex = new RegExp(
    `\\b(from|join)\\s+(?:\\\`)?${escapeRegExp(missingTable)}(?:\\\`)?(?!\\s*\\.)`,
    'gi',
  )

  const rewritten = sqlText.replace(regex, (_match, keyword: string) => `${keyword} ${replacement}`)
  if (rewritten === sqlText) {
    return null
  }

  return rewritten
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function coerceValueByOriginal(nextValue: string, originalValue: unknown, dataType?: string): unknown {
  const trimmedValue = nextValue.trim()

  if (trimmedValue === '') {
    return null
  }

  if (dataType && isDateTimeDataType(dataType)) {
    if (trimmedValue.toLowerCase() === 'null') {
      return null
    }

    return unwrapQuotedText(trimmedValue)
  }

  if (originalValue instanceof Date) {
    return unwrapQuotedText(trimmedValue)
  }

  if (dataType && isArrayDataType(dataType)) {
    if (trimmedValue.toLowerCase() === 'null') {
      return null
    }

    const parsedArray = parseArrayInputValue(trimmedValue)
    if (parsedArray !== undefined) {
      return parsedArray
    }

    return nextValue
  }

  if (dataType && isJsonLikeDataType(dataType)) {
    if (trimmedValue.toLowerCase() === 'null') {
      return null
    }

    try {
      return JSON.parse(trimmedValue)
    } catch {
      return nextValue
    }
  }

  if (dataType && isBooleanDataType(dataType)) {
    const normalized = trimmedValue.toLowerCase()
    if (normalized === 'true') {
      return true
    }

    if (normalized === 'false') {
      return false
    }
  }

  if (typeof originalValue === 'number') {
    const parsed = Number(trimmedValue)
    return Number.isNaN(parsed) ? nextValue : parsed
  }

  if (typeof originalValue === 'boolean') {
    const normalized = trimmedValue.toLowerCase()
    if (normalized === 'true') {
      return true
    }

    if (normalized === 'false') {
      return false
    }
  }

  if (typeof originalValue === 'object' && originalValue !== null) {
    try {
      return JSON.parse(nextValue)
    } catch {
      return nextValue
    }
  }

  return nextValue
}

export function getErrorMessage(error: unknown): string {
  let rawMessage = ''

  if (error instanceof Error) {
    rawMessage = error.message
  } else if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    rawMessage = (error as { message: string }).message
  }

  if (!rawMessage) {
    return 'Erro inesperado.'
  }

  let message = rawMessage.trim()
  let ipcChannel = ''

  let ipcMatch = message.match(/^Error invoking remote method '([^']+)':\s*(.*)$/)
  while (ipcMatch) {
    ipcChannel = ipcMatch[1]
    message = (ipcMatch[2] || '').trim()
    ipcMatch = message.match(/^Error invoking remote method '([^']+)':\s*(.*)$/)
  }

  if (!message || message === 'Error') {
    if (
      ipcChannel === 'pointer:tables:describe' ||
      ipcChannel === 'pointer:tables:read' ||
      ipcChannel === 'pointer:sql:preview-risk' ||
      ipcChannel === 'pointer:sql:execute' ||
      ipcChannel === 'pointer:sql:execute-with-execution-id'
    ) {
      return 'Não foi possível conectar ao banco desta conexão. Verifique se o banco está online e tente reconectar.'
    }

    return 'Erro inesperado.'
  }

  return message
}

function generatePrimaryKeyDefault(dataType: string): string | undefined {
  if (isUuidDataType(dataType)) {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }

    return generateCuid()
  }

  if (isTextualDataType(dataType)) {
    return generateCuid()
  }

  return undefined
}

function generateCuid(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 12)
  return `c${timestamp}${random}`.slice(0, 25)
}

function padDatePart(value: number, size = 2): string {
  return String(value).padStart(size, '0')
}

function formatLocalDateTime(value: Date): string {
  const year = value.getFullYear()
  const month = padDatePart(value.getMonth() + 1)
  const day = padDatePart(value.getDate())
  const hours = padDatePart(value.getHours())
  const minutes = padDatePart(value.getMinutes())
  const seconds = padDatePart(value.getSeconds())
  const millis = padDatePart(value.getMilliseconds(), 3)
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${millis}`
}

function unwrapQuotedText(value: string): string {
  if (value.length < 2) {
    return value
  }

  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      const parsed = JSON.parse(value)
      return typeof parsed === 'string' ? parsed : value
    } catch {
      return value.slice(1, -1).replace(/\\"/g, '"')
    }
  }

  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/\\'/g, "'")
  }

  return value
}

function isTextualDataType(dataType: string): boolean {
  return /(char|text|string)/i.test(dataType)
}

function isUuidDataType(dataType: string): boolean {
  return /uuid/i.test(dataType)
}

function isDateTimeDataType(dataType: string): boolean {
  return /(date|time)/i.test(dataType)
}

export function isBooleanDataType(dataType: string): boolean {
  return /bool/i.test(dataType)
}

function isNumericDataType(dataType: string): boolean {
  return /(int|numeric|decimal|float|double|real|serial)/i.test(dataType)
}

export function isArrayDataType(dataType: string): boolean {
  const normalized = dataType.trim()
  if (!normalized) {
    return false
  }

  return /^array$/i.test(normalized) || /\[\]$/i.test(normalized) || /^array\s*\(/i.test(normalized)
}

export function parseArrayInputValue(value: string): unknown[] | undefined {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  try {
    const parsedJson = JSON.parse(trimmed)
    if (Array.isArray(parsedJson)) {
      return parsedJson
    }
  } catch {
    // fallback to Postgres literal parsing
  }

  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return undefined
  }

  try {
    const parsedArray = parsePostgresArray(trimmed)
    return Array.isArray(parsedArray) ? parsedArray : undefined
  } catch {
    return undefined
  }
}

export function isJsonLikeDataType(dataType: string): boolean {
  return /(json|map|object)/i.test(dataType) || isArrayDataType(dataType)
}
