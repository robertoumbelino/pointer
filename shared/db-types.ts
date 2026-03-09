export type RiskLevel = 'safe' | 'write' | 'destructive'
export type SortDirection = 'asc' | 'desc'
export type DatabaseEngine = 'postgres' | 'clickhouse' | 'sqlite'

export interface EnvironmentSummary {
  id: string
  name: string
  color: string
  createdAt: string
}

export interface ConnectionInput {
  environmentId: string
  engine: DatabaseEngine
  name: string
  filePath: string
  host: string
  port: number
  database: string
  user: string
  password: string
  sslMode: 'disable' | 'require'
}

export interface ConnectionSummary {
  id: string
  environmentId: string
  engine: DatabaseEngine
  name: string
  filePath: string
  host: string
  port: number
  database: string
  user: string
  sslMode: 'disable' | 'require'
  createdAt: string
}

export interface SchemaInfo {
  name: string
}

export interface TableRef {
  schema: string
  name: string
  fqName: string
}

export interface TableSearchHit {
  connectionId: string
  connectionName: string
  engine: DatabaseEngine
  table: TableRef
}

export interface ColumnForeignKeyRef {
  table: TableRef
  column: string
}

export interface ColumnDef {
  name: string
  dataType: string
  enumValues?: string[]
  nullable: boolean
  defaultValue: string | null
  isPrimaryKey: boolean
  foreignKey?: ColumnForeignKeyRef
}

export interface TableSchema {
  table: TableRef
  columns: ColumnDef[]
  primaryKey: string[]
  engine: DatabaseEngine
  supportsRowEdit: boolean
}

export interface TableSort {
  column: string
  direction: SortDirection
}

export type TableFilterOperator = 'eq' | 'ilike'

export interface TableFilter {
  column: string
  operator: TableFilterOperator
  value: string
}

export interface TableReadInput {
  page: number
  pageSize: number
  sort?: TableSort
  filters?: TableFilter[]
}

export interface TableReadResult {
  rows: Record<string, unknown>[]
  total: number
  page: number
  pageSize: number
}

export interface SqlPreviewRiskResult {
  level: RiskLevel
  reason: string
}

export interface SqlResultSet {
  command: string
  rowCount: number
  fields: string[]
  rows: Record<string, unknown>[]
}

export interface SqlExecutionResult {
  durationMs: number
  resultSets: SqlResultSet[]
}

export interface AppUpdateInfo {
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
  releaseUrl: string | null
  publishedAt: string | null
  notes: string | null
}

export interface AppUpdateInstallResult {
  started: boolean
  message: string
}

export interface PointerApi {
  getAppVersion: () => Promise<string>
  copyToClipboard: (text: string) => Promise<void>
  pickSqliteFile: () => Promise<string | null>

  listEnvironments: () => Promise<EnvironmentSummary[]>
  createEnvironment: (name: string, color?: string) => Promise<EnvironmentSummary>
  updateEnvironment: (id: string, name: string, color?: string) => Promise<EnvironmentSummary>
  deleteEnvironment: (id: string) => Promise<void>

  listConnections: (environmentId: string) => Promise<ConnectionSummary[]>
  createConnection: (input: ConnectionInput) => Promise<ConnectionSummary>
  updateConnection: (id: string, input: ConnectionInput) => Promise<ConnectionSummary>
  testConnectionInput: (input: ConnectionInput, existingConnectionId?: string) => Promise<{ ok: boolean; latencyMs: number }>
  deleteConnection: (id: string) => Promise<void>
  testConnection: (id: string) => Promise<{ ok: boolean; latencyMs: number }>

  listSchemas: (connectionId: string) => Promise<SchemaInfo[]>
  listTables: (connectionId: string, schema?: string) => Promise<TableRef[]>
  searchTables: (connectionId: string, query: string) => Promise<TableRef[]>
  searchTablesInEnvironment: (environmentId: string, query: string) => Promise<TableSearchHit[]>

  describeTable: (connectionId: string, table: TableRef) => Promise<TableSchema>
  readTable: (connectionId: string, table: TableRef, input: TableReadInput) => Promise<TableReadResult>
  insertRow: (connectionId: string, table: TableRef, row: Record<string, unknown>) => Promise<Record<string, unknown>>
  updateRow: (connectionId: string, table: TableRef, row: Record<string, unknown>) => Promise<{ affected: number }>
  deleteRow: (connectionId: string, table: TableRef, row: Record<string, unknown>) => Promise<{ affected: number }>

  previewSqlRisk: (sql: string) => Promise<SqlPreviewRiskResult>
  executeSql: (connectionId: string, sql: string) => Promise<SqlExecutionResult>

  checkForAppUpdate: () => Promise<AppUpdateInfo>
  installLatestUpdate: () => Promise<AppUpdateInstallResult>
}
