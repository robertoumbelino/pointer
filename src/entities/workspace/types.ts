import type {
  ConnectionInput,
  ConnectionSummary,
  DatabaseEngine,
  SqlExecutionResult,
  TableFilterOperator,
  TableReadResult,
  TableRef,
  TableSchema,
  TableSearchHit,
  TableSort,
} from '../../../shared/db-types'
import { AUTO_SQL_CONNECTION_ID, DEFAULT_SQL } from '../../shared/constants/app'

export type ConnectionDraft = ConnectionInput

export type AiChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export type SqlTab = {
  id: string
  type: 'sql'
  title: string
  connectionId: string
  filePath: string | null
  sqlText: string
  sqlResult: SqlExecutionResult | null
  sqlRunning: boolean
  sqlCanceling: boolean
  splitRatio: number
  isAiTab: boolean
  aiMessages: AiChatMessage[]
  aiDraft: string
  aiLoading: boolean
}

export type RowPendingUpdates = Record<number, Record<string, unknown>>
export type InsertDraftRow = Record<string, unknown>
export type TableSelectionMode = 'row' | 'cell'

export type TableCellPosition = {
  rowIndex: number
  columnIndex: number
}

export type TableCellRange = {
  start: TableCellPosition
  end: TableCellPosition
}

export type TableTab = {
  id: string
  type: 'table'
  title: string
  engine: DatabaseEngine
  connectionId: string
  connectionName: string
  table: TableRef
  schema: TableSchema | null
  data: TableReadResult | null
  page: number
  pageSize: number
  sort?: TableSort
  filterColumn: string
  filterOperator: TableFilterOperator
  filterValue: string
  selectedRowIndexes: number[]
  rowAnchorIndex: number | null
  activeRowIndex: number | null
  activeCell: TableCellPosition | null
  cellAnchor: TableCellPosition | null
  selectedCellRange: TableCellRange | null
  selectionMode: TableSelectionMode
  columnWidths: Record<string, number>
  pendingUpdates: RowPendingUpdates
  pendingDeletes: number[]
  insertDraft: InsertDraftRow | null
  baseRows: Record<string, unknown>[] | null
  loading: boolean
  loadError: string | null
}

export type PostgresDashboardCounters = {
  collectedAt: string
  xactTotal: number
  blksRead: number
}

export type PostgresDashboardMetrics = {
  collectedAt: string
  activeSessions: number
  totalSessions: number
  maxConnections: number
  dbSizeBytes: number
  tps: number | null
  cacheHitRatio: number | null
  diskReadPerSecond: number | null
  healthScore: number
  healthStatus: 'healthy' | 'warning' | 'critical'
  healthReasons: string[]
}

export type PostgresDashboardSeriesPoint = {
  timeLabel: string
  tps: number | null
  cacheHitRatio: number | null
  healthScore: number
}

export type PostgresSessionStatePoint = {
  state: string
  count: number
}

export type ClickHouseDashboardSeriesPoint = {
  timeLabel: string
  queries: number
  failures: number
  healthScore: number
}

export type ClickHouseQueryKindPoint = {
  kind: string
  count: number
}

export type ClickHouseDashboardMetrics = {
  collectedAt: string
  runningQueries: number
  runningQueryMemoryBytes: number
  insertQueries: number
  selectQueries: number
  analyticalQueries: number
  ddlQueries: number
  activeParts: number
  totalRows: number
  bytesOnDisk: number
  queryCount15m: number
  failedQueries15m: number
  p95QueryDurationMs: number | null
  selectQueries15m: number
  insertQueries15m: number
  otherQueries15m: number
  healthScore: number
  healthStatus: 'healthy' | 'warning' | 'critical'
  healthReasons: string[]
}

export type SqliteDashboardSeriesPoint = {
  timeLabel: string
  healthScore: number
  fragmentationRatio: number
}

export type SqliteDashboardMetrics = {
  collectedAt: string
  sqliteVersion: string
  tableCount: number
  viewCount: number
  indexCount: number
  triggerCount: number
  pageCount: number
  pageSize: number
  freelistCount: number
  journalMode: string
  synchronousLevel: number
  autoVacuumLevel: number
  cacheSize: number | null
  estimatedSizeBytes: number
  freeBytes: number
  fragmentationRatio: number
  healthScore: number
  healthStatus: 'healthy' | 'warning' | 'critical'
  healthReasons: string[]
}

type DashboardTabBase = {
  id: string
  type: 'dashboard'
  title: string
  engine: DatabaseEngine
  connectionId: string
  connectionName: string
  loading: boolean
  loadError: string | null
  lastUpdatedAt: string | null
}

export type PostgresDashboardTab = DashboardTabBase & {
  engine: 'postgres'
  metrics: PostgresDashboardMetrics | null
  history: PostgresDashboardSeriesPoint[]
  sessionsByState: PostgresSessionStatePoint[]
  lastCounters: PostgresDashboardCounters | null
}

export type ClickHouseDashboardTab = DashboardTabBase & {
  engine: 'clickhouse'
  metrics: ClickHouseDashboardMetrics | null
  history: ClickHouseDashboardSeriesPoint[]
  sessionsByState: []
  lastCounters: null
  queryTrend: ClickHouseDashboardSeriesPoint[]
  queriesByKind: ClickHouseQueryKindPoint[]
}

export type SqliteDashboardTab = DashboardTabBase & {
  engine: 'sqlite'
  metrics: SqliteDashboardMetrics | null
  history: SqliteDashboardSeriesPoint[]
  sessionsByState: []
  lastCounters: null
}

export type DashboardTab = PostgresDashboardTab | ClickHouseDashboardTab | SqliteDashboardTab

export type WorkTab = SqlTab | TableTab | DashboardTab

export type EditingCell = {
  tabId: string
  rowIndex: number
  column: string
  value: string
}

export type SidebarTableContextMenuState = {
  hit: TableSearchHit
  x: number
  y: number
}

export type TableReloadOverrides = {
  page?: number
  pageSize?: number
  sort?: TableSort
  filterColumn?: string
  filterOperator?: TableFilterOperator
  filterValue?: string
}

export type EnvironmentWorkspaceSnapshot = {
  workTabs: WorkTab[]
  activeTabId: string
  sqlTabCounter: number
  selectedSchema: string
}

export type PersistedSqlTab = {
  type: 'sql'
  id: string
  title: string
  connectionId: string
  filePath?: string | null
  sqlText: string
  splitRatio: number
  isAiTab?: boolean
}

export type PersistedTableTab = {
  type: 'table'
  id: string
  title: string
  engine: DatabaseEngine
  connectionId: string
  connectionName: string
  table: TableRef
  page: number
  pageSize?: number
  sort?: TableSort
  filterColumn: string
  filterOperator: TableFilterOperator
  filterValue: string
  columnWidths?: Record<string, number>
}

export type PersistedDashboardTab = {
  type: 'dashboard'
  id: string
  title: string
  engine: DatabaseEngine
  connectionId: string
  connectionName: string
}

export type PersistedWorkTab = PersistedSqlTab | PersistedTableTab | PersistedDashboardTab

export type PersistedEnvironmentWorkspaceSnapshot = {
  workTabs: PersistedWorkTab[]
  activeTabId: string
  sqlTabCounter: number
  selectedSchema: string
}

export type PersistedWorkspaceStorage = {
  version: 1
  lastEnvironmentId: string
  environments: Record<string, PersistedEnvironmentWorkspaceSnapshot>
}

export function createSqlTab(
  id: string,
  title: string,
  connectionId = AUTO_SQL_CONNECTION_ID,
  options?: {
    isAiTab?: boolean
    sqlText?: string
  },
): SqlTab {
  return {
    id,
    type: 'sql',
    title,
    connectionId,
    filePath: null,
    sqlText: options?.sqlText ?? DEFAULT_SQL,
    sqlResult: null,
    sqlRunning: false,
    sqlCanceling: false,
    splitRatio: 56,
    isAiTab: Boolean(options?.isAiTab),
    aiMessages: [],
    aiDraft: '',
    aiLoading: false,
  }
}

export function createDashboardTab(
  id: string,
  engine: DatabaseEngine,
  connectionId: string,
  connectionName: string,
): DashboardTab {
  const baseTab: DashboardTabBase = {
    id,
    type: 'dashboard',
    title: `Dashboard ${connectionName}`,
    engine,
    connectionId,
    connectionName,
    loading: false,
    loadError: null,
    lastUpdatedAt: null,
  }

  if (engine === 'clickhouse') {
    return {
      ...baseTab,
      engine,
      metrics: null,
      history: [],
      sessionsByState: [],
      lastCounters: null,
      queryTrend: [],
      queriesByKind: [],
    }
  }

  if (engine === 'sqlite') {
    return {
      ...baseTab,
      engine,
      metrics: null,
      history: [],
      sessionsByState: [],
      lastCounters: null,
    }
  }

  return {
    ...baseTab,
    engine: 'postgres',
    metrics: null,
    history: [],
    sessionsByState: [],
    lastCounters: null,
  }
}

export function createPostgresDashboardTab(
  id: string,
  connectionId: string,
  connectionName: string,
): DashboardTab {
  return createDashboardTab(id, 'postgres', connectionId, connectionName)
}

export function createConnectionDraft(environmentId: string): ConnectionDraft {
  return {
    environmentId,
    engine: 'postgres',
    name: '',
    filePath: '',
    host: 'localhost',
    port: 5432,
    database: '',
    user: '',
    password: '',
    sslMode: 'disable',
  }
}

export function createConnectionDraftFromConnection(connection: ConnectionSummary): ConnectionDraft {
  return {
    environmentId: connection.environmentId,
    engine: connection.engine,
    name: connection.name,
    filePath: connection.filePath,
    host: connection.host,
    port: connection.port,
    database: connection.database,
    user: connection.user,
    password: '',
    sslMode: connection.sslMode,
  }
}
