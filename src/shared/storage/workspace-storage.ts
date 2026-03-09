import type {
  EnvironmentWorkspaceSnapshot,
  PersistedEnvironmentWorkspaceSnapshot,
  PersistedWorkspaceStorage,
  PersistedWorkTab,
  SqlTab,
  TableTab,
  WorkTab,
} from '../../entities/workspace/types'
import { createSqlTab } from '../../entities/workspace/types'
import { PAGE_SIZE, TABLE_PAGE_SIZE_MAX } from '../constants/app'

export function buildPersistedWorkspaceStorage(
  snapshots: Record<string, EnvironmentWorkspaceSnapshot>,
  lastEnvironmentId: string,
): PersistedWorkspaceStorage {
  const environments: Record<string, PersistedEnvironmentWorkspaceSnapshot> = {}

  for (const [environmentId, snapshot] of Object.entries(snapshots)) {
    environments[environmentId] = {
      workTabs: snapshot.workTabs.map(serializeWorkTab),
      activeTabId: snapshot.activeTabId,
      sqlTabCounter: Math.max(2, snapshot.sqlTabCounter),
      selectedSchema: snapshot.selectedSchema || 'all',
    }
  }

  return {
    version: 1,
    lastEnvironmentId,
    environments,
  }
}

export function restorePersistedWorkspaceStorage(parsed: PersistedWorkspaceStorage): {
  lastEnvironmentId: string
  environments: Record<string, EnvironmentWorkspaceSnapshot>
} {
  if (!parsed || parsed.version !== 1 || typeof parsed.environments !== 'object' || parsed.environments === null) {
    return {
      lastEnvironmentId: '',
      environments: {},
    }
  }

  const environments: Record<string, EnvironmentWorkspaceSnapshot> = {}
  for (const [environmentId, snapshot] of Object.entries(parsed.environments)) {
    environments[environmentId] = deserializeEnvironmentWorkspaceSnapshot(snapshot)
  }

  return {
    lastEnvironmentId: typeof parsed.lastEnvironmentId === 'string' ? parsed.lastEnvironmentId : '',
    environments,
  }
}

function serializeWorkTab(tab: WorkTab): PersistedWorkTab {
  if (tab.type === 'sql') {
    return {
      type: 'sql',
      id: tab.id,
      title: tab.title,
      connectionId: tab.connectionId,
      sqlText: tab.sqlText,
      splitRatio: tab.splitRatio,
    }
  }

  return {
    type: 'table',
    id: tab.id,
    title: tab.title,
    engine: tab.engine,
    connectionId: tab.connectionId,
    connectionName: tab.connectionName,
    table: tab.table,
    page: tab.page,
    pageSize: tab.pageSize,
    sort: tab.sort,
    filterColumn: tab.filterColumn,
    filterOperator: tab.filterOperator,
    filterValue: tab.filterValue,
  }
}

function normalizeTablePageSize(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return PAGE_SIZE
  }

  return Math.min(TABLE_PAGE_SIZE_MAX, Math.max(1, Math.trunc(value)))
}

function deserializeEnvironmentWorkspaceSnapshot(
  snapshot: PersistedEnvironmentWorkspaceSnapshot,
): EnvironmentWorkspaceSnapshot {
  const restoredTabs = Array.isArray(snapshot.workTabs)
    ? snapshot.workTabs.map((tab) => {
        if (tab.type === 'sql') {
          return {
            id: tab.id,
            type: 'sql',
            title: tab.title,
            connectionId: tab.connectionId,
            sqlText: tab.sqlText,
            sqlResult: null,
            sqlRunning: false,
            sqlCanceling: false,
            splitRatio: typeof tab.splitRatio === 'number' ? tab.splitRatio : 56,
          } as SqlTab
        }

        return {
          id: tab.id,
          type: 'table',
          title: tab.title,
          engine: tab.engine,
          connectionId: tab.connectionId,
          connectionName: tab.connectionName,
          table: tab.table,
          schema: null,
          data: null,
          page: typeof tab.page === 'number' ? tab.page : 0,
          pageSize: normalizeTablePageSize(tab.pageSize),
          sort: tab.sort,
          filterColumn: tab.filterColumn ?? '',
          filterOperator: tab.filterOperator ?? 'ilike',
          filterValue: tab.filterValue ?? '',
          selectedRowIndex: null,
          pendingUpdates: {},
          pendingDeletes: [],
          insertDraft: null,
          baseRows: null,
          loading: false,
          loadError: null,
        } as TableTab
      })
    : []

  const workTabs = restoredTabs.length > 0 ? restoredTabs : [createSqlTab('sql:1', 'SQL 1')]
  const activeTabId = workTabs.some((tab) => tab.id === snapshot.activeTabId)
    ? snapshot.activeTabId
    : workTabs[0].id

  return {
    workTabs,
    activeTabId,
    sqlTabCounter: Math.max(
      2,
      typeof snapshot.sqlTabCounter === 'number'
        ? snapshot.sqlTabCounter
        : workTabs.filter((tab) => tab.type === 'sql').length + 1,
    ),
    selectedSchema: snapshot.selectedSchema || 'all',
  }
}
