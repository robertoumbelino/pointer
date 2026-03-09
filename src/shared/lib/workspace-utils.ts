import type {
  ConnectionSummary,
  DatabaseEngine,
  TableRef,
  TableSchema,
} from '../../../shared/db-types'
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

export function splitSqlSegmentsWithRange(sqlText: string): Array<{ sql: string; start: number; end: number }> {
  const segments: Array<{ sql: string; start: number; end: number }> = []
  const source = sqlText

  let chunkStart = 0
  let inSingleQuote = false
  let inDoubleQuote = false
  let inLineComment = false
  let inBlockComment = false

  const pushChunk = (start: number, end: number): void => {
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
      pushChunk(chunkStart, index)
      chunkStart = index + 1
    }
  }

  pushChunk(chunkStart, source.length)

  return segments
}

export type SqlFromTableReference = {
  schema?: string
  name: string
  fqName: string
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

function readFromTableReference(
  source: string,
  fromKeywordStart: number,
): { reference: SqlFromTableReference | null; nextIndex: number } {
  let cursor = skipWhitespace(source, fromKeywordStart + 4)
  if (cursor >= source.length) {
    return {
      reference: null,
      nextIndex: source.length,
    }
  }

  if (source[cursor] === '(') {
    return {
      reference: null,
      nextIndex: cursor + 1,
    }
  }

  const firstPart = readSqlIdentifierPart(source, cursor)
  if (!firstPart) {
    return {
      reference: null,
      nextIndex: cursor + 1,
    }
  }

  cursor = skipWhitespace(source, firstPart.nextIndex)
  if (source[cursor] === '(') {
    return {
      reference: null,
      nextIndex: cursor + 1,
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
    }
  }

  return {
    reference: {
      schema: normalizedSchema || undefined,
      name: normalizedName,
      fqName: normalizedSchema ? `${normalizedSchema}.${normalizedName}` : normalizedName,
    },
    nextIndex: cursor,
  }
}

export function extractFirstFromTableReference(sqlText: string): SqlFromTableReference | null {
  const source = sqlText

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

    if (source.slice(index, index + 4).toLowerCase() !== 'from') {
      continue
    }

    const previousChar = source[index - 1] ?? ''
    const followingChar = source[index + 4] ?? ''
    if ((previousChar && isSqlIdentifierChar(previousChar)) || (followingChar && isSqlIdentifierChar(followingChar))) {
      continue
    }

    const parsed = readFromTableReference(source, index)
    if (parsed.reference) {
      return parsed.reference
    }

    index = Math.max(index, parsed.nextIndex - 1)
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

function isTextualDataType(dataType: string): boolean {
  return /(char|text|string)/i.test(dataType)
}

function isUuidDataType(dataType: string): boolean {
  return /uuid/i.test(dataType)
}

function isDateTimeDataType(dataType: string): boolean {
  return /(date|time)/i.test(dataType)
}

function isBooleanDataType(dataType: string): boolean {
  return /bool/i.test(dataType)
}

function isNumericDataType(dataType: string): boolean {
  return /(int|numeric|decimal|float|double|real|serial)/i.test(dataType)
}

export function isJsonLikeDataType(dataType: string): boolean {
  return /(json|map|array|object)/i.test(dataType)
}
