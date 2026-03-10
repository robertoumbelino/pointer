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
  selectedRowIndex: number | null
  pendingUpdates: RowPendingUpdates
  pendingDeletes: number[]
  insertDraft: InsertDraftRow | null
  baseRows: Record<string, unknown>[] | null
  loading: boolean
  loadError: string | null
}

export type WorkTab = SqlTab | TableTab

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
}

export type PersistedWorkTab = PersistedSqlTab | PersistedTableTab

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
