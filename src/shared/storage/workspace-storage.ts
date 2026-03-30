import type {
  DashboardTab,
  EnvironmentWorkspaceSnapshot,
  PersistedEnvironmentWorkspaceSnapshot,
  PersistedWorkspaceStorage,
  PersistedWorkTab,
  SqlTab,
  TableTab,
  WorkTab,
} from '../../entities/workspace/types'
import { createDashboardTab, createSqlTab } from '../../entities/workspace/types'
import {
  PAGE_SIZE,
  TABLE_COLUMN_WIDTH_MAX,
  TABLE_COLUMN_WIDTH_MIN,
  TABLE_PAGE_SIZE_MAX,
} from '../constants/app'

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
      filePath: tab.filePath,
      sqlText: tab.sqlText,
      splitRatio: tab.splitRatio,
      isAiTab: tab.isAiTab,
    }
  }

  if (tab.type === 'table') {
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
      columnWidths: tab.columnWidths,
    }
  }

  return {
    type: 'dashboard',
    id: tab.id,
    title: tab.title,
    engine: tab.engine,
    connectionId: tab.connectionId,
    connectionName: tab.connectionName,
  }
}

function normalizeTablePageSize(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return PAGE_SIZE
  }

  return Math.min(TABLE_PAGE_SIZE_MAX, Math.max(1, Math.trunc(value)))
}

function normalizeTableColumnWidths(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') {
    return {}
  }

  const entries: [string, number][] = []

  for (const [columnName, rawWidth] of Object.entries(value)) {
    if (!columnName.trim() || typeof rawWidth !== 'number' || !Number.isFinite(rawWidth)) {
      continue
    }

    const normalizedWidth = Math.min(TABLE_COLUMN_WIDTH_MAX, Math.max(TABLE_COLUMN_WIDTH_MIN, Math.trunc(rawWidth)))
    entries.push([columnName, normalizedWidth])
  }

  return Object.fromEntries(entries)
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
            filePath: typeof tab.filePath === 'string' ? tab.filePath : null,
            sqlText: tab.sqlText,
            sqlResult: null,
            sqlRunning: false,
            sqlCanceling: false,
            splitRatio: typeof tab.splitRatio === 'number' ? tab.splitRatio : 56,
            isAiTab: Boolean(tab.isAiTab),
            aiMessages: [],
            aiDraft: '',
            aiLoading: false,
          } as SqlTab
        }

        if (tab.type === 'table') {
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
            selectedRowIndexes: [],
            rowAnchorIndex: null,
            activeRowIndex: null,
            activeCell: null,
            cellAnchor: null,
            selectedCellRange: null,
            selectionMode: 'cell',
            columnWidths: normalizeTableColumnWidths(tab.columnWidths),
            pendingUpdates: {},
            pendingDeletes: [],
            insertDraft: null,
            baseRows: null,
            loading: false,
            loadError: null,
          } as TableTab
        }

        return {
          ...createDashboardTab(tab.id, tab.engine, tab.connectionId, tab.connectionName),
          title: tab.title,
        } as DashboardTab
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
