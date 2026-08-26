import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { toast } from 'sonner'
import type {
  AiSqlChatMessage,
  ColumnForeignKeyRef,
  ConnectionSummary,
  SqlExecutionResult,
  TableFilter,
  TableFilterOperator,
  TableSearchHit,
} from '../../../../shared/db-types'
import { SQL_EXECUTION_CANCELED_MESSAGE } from '../../../../shared/db-types'
import { pointerApi } from '../../../shared/api/pointer-api'
import { AUTO_SQL_CONNECTION_ID, PAGE_SIZE, TABLE_PAGE_SIZE_MAX } from '../../../shared/constants/app'
import { buildCsvContent } from '../../../shared/lib/csv'
import { buildJsonContent } from '../../../shared/lib/json'
import {
  buildClickHouseUnknownTableFallbackSql,
  buildInsertSqlFromRow,
  buildInsertPayload,
  cloneRows,
  coerceValueByOriginal,
  createInitialInsertDraft,
  extractFirstFromTableReference,
  formatDraftInputValue,
  formatTableLabel,
  getErrorMessage,
  isJsonLikeDataType,
  getSqlStatementAtCursor,
  valuesEqual,
} from '../../../shared/lib/workspace-utils'
import {
  createDashboardTab,
  createTableDashboardTab,
  createSqlTab,
  type ClosedSqlTabHistoryEntry,
  type DashboardTab,
  type EditingCell,
  type RowPendingUpdates,
  type SqlTab,
  type TableReloadOverrides,
  type TableTab,
  type WorkTab,
} from '../../../entities/workspace/types'
import type { SqlSelectionRange } from './useWorkspace'

type UseWorkspaceActionsParams = {
  activeTabId: string
  setActiveTabId: Dispatch<SetStateAction<string>>
  selectedEnvironmentId: string
  connections: ConnectionSummary[]
  activeTableTab: TableTab | null
  editingCell: EditingCell | null
  setEditingCell: Dispatch<SetStateAction<EditingCell | null>>
  resizingSqlTabId: string | null
  setResizingSqlTabId: Dispatch<SetStateAction<string | null>>
  setIsRenameSqlTabOpen: Dispatch<SetStateAction<boolean>>
  renamingSqlTabId: string
  setRenamingSqlTabId: Dispatch<SetStateAction<string>>
  sqlTabNameDraft: string
  setSqlTabNameDraft: Dispatch<SetStateAction<string>>
  setSqlConfirmOpen: Dispatch<SetStateAction<boolean>>
  setPendingSqlExecution: Dispatch<SetStateAction<{ tabId: string; sql: string; connectionId?: string } | null>>
  setSqlAutoConnectionResolveOpen: Dispatch<SetStateAction<boolean>>
  setPendingAutoSqlConnectionResolution: Dispatch<
    SetStateAction<{ tabId: string; sql: string; tableLabel: string; candidateConnectionIds: string[] } | null>
  >
  sqlTabCounterRef: MutableRefObject<number>
  sqlSplitContainerRef: MutableRefObject<HTMLDivElement | null>
  sqlSelectionByTabRef: MutableRefObject<Record<string, SqlSelectionRange | undefined>>
  sqlExecutionByTabRef: MutableRefObject<Record<string, string>>
  closedSqlTabsByEnvironmentRef: MutableRefObject<Record<string, ClosedSqlTabHistoryEntry[]>>
  workTabsRef: MutableRefObject<WorkTab[]>
  getTableTab: (tabId: string) => TableTab | null
  getSqlTab: (tabId: string) => SqlTab | null
  setWorkTabs: Dispatch<SetStateAction<WorkTab[]>>
  updateTableTab: (tabId: string, updater: (tab: TableTab) => TableTab) => void
  updateSqlTab: (tabId: string, updater: (tab: SqlTab) => SqlTab) => void
}

type UseWorkspaceActionsResult = {
  openNewSqlTab: () => void
  openConnectionDashboardTab: (connection: ConnectionSummary) => void
  openTableDashboardTab: (hit: TableSearchHit) => void
  loadSqlFileToNewTab: () => Promise<void>
  saveActiveSqlFile: () => Promise<void>
  openRenameSqlTabDialog: (tab: SqlTab) => void
  handleRenameSqlTab: () => void
  openTableTab: (hit: TableSearchHit, initialLoad?: TableReloadOverrides) => Promise<void>
  navigateToForeignKey: (sourceTab: TableTab, foreignKey: ColumnForeignKeyRef | undefined, value: unknown) => Promise<void>
  reloadTableTab: (tabId: string, overrides?: TableReloadOverrides) => Promise<void>
  reorderWorkTabs: (draggedTabId: string, targetTabId: string, position?: 'before' | 'after') => void
  closeTableTab: (tabId: string) => void
  closeDashboardTab: (tabId: string) => void
  closeSqlTab: (tabId: string) => void
  closeActiveTab: () => void
  restoreClosedSqlTab: () => void
  beginInlineEdit: (rowIndex: number, column: string) => void
  commitInlineEdit: (override?: EditingCell) => void
  cancelInlineEdit: () => void
  saveActiveTableChanges: () => Promise<void>
  isSavingTableChanges: boolean
  handleToggleInsertDraftRow: () => void
  updateInsertDraftValue: (columnName: string, value: string | null) => void
  handleDeleteRow: () => void
  copyInsertSqlFromTableRow: (tabId: string, rowIndex: number) => Promise<void>
  copyTableSelection: () => Promise<void>
  pasteIntoTableSelection: (rawClipboardText: string) => void
  exportSqlResultSetVisibleCsv: (params: {
    tabId: string
    resultSetIndex: number
    fields: string[]
    rows: Record<string, unknown>[]
    selectedColumns: string[]
  }) => void
  exportSqlResultSetVisibleJson: (params: {
    tabId: string
    resultSetIndex: number
    fields: string[]
    rows: Record<string, unknown>[]
    selectedColumns: string[]
  }) => void
  exportTableCurrentPageCsv: (tabId: string, selectedColumns: string[]) => void
  exportTableAllPagesCsv: (tabId: string, selectedColumns: string[]) => Promise<void>
  exportTableCurrentPageJson: (tabId: string, selectedColumns: string[]) => void
  exportTableAllPagesJson: (tabId: string, selectedColumns: string[]) => Promise<void>
  openAiSqlTabWithPrompt: (prompt: string) => Promise<void>
  sendAiPromptToSqlTab: (tabId: string, prompt: string) => Promise<void>
  setAiDraftOnSqlTab: (tabId: string, value: string) => void
  runSql: (
    force?: boolean,
    cursorOffset?: number,
    explicitSql?: string,
    targetTabId?: string,
    resolvedConnectionId?: string,
  ) => Promise<void>
  cancelSqlExecution: (targetTabId?: string) => Promise<void>
}

function normalizeRequestedPageSize(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return PAGE_SIZE
  }

  return Math.min(TABLE_PAGE_SIZE_MAX, Math.max(1, Math.trunc(value)))
}

function sanitizeFilenamePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function fileNameFromPath(filePath: string): string {
  const normalized = filePath.trim().replace(/[/\\]+$/g, '')
  if (!normalized) {
    return ''
  }

  const segments = normalized.split(/[/\\]/)
  return segments[segments.length - 1] ?? ''
}

function ensureSqlFilename(filename: string): string {
  const normalized = filename.trim()
  if (!normalized) {
    return 'query.sql'
  }

  return normalized.toLowerCase().endsWith('.sql') ? normalized : `${normalized}.sql`
}

function buildTimestamp(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')

  return `${year}${month}${day}-${hours}${minutes}${seconds}`
}

function buildSqlExecutionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `sql-exec-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getSelectedSqlText(sqlText: string, selection: SqlSelectionRange | undefined): string | null {
  if (!selection) {
    return null
  }

  const start = Math.max(0, Math.min(selection.from, selection.to, sqlText.length))
  const end = Math.max(0, Math.min(Math.max(selection.from, selection.to), sqlText.length))
  return sqlText.slice(start, end)
}

function buildAiMessage(role: 'user' | 'assistant', content: string): { id: string; role: 'user' | 'assistant'; content: string; createdAt: string } {
  return {
    id: buildSqlExecutionId(),
    role,
    content,
    createdAt: new Date().toISOString(),
  }
}

function isSqlExecutionCanceledError(error: unknown): boolean {
  return getErrorMessage(error) === SQL_EXECUTION_CANCELED_MESSAGE
}

const CANCEL_UNLOCK_TIMEOUT_MS = 6_000

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve())
    })
  })
}

function triggerCsvDownload(filename: string, csvContent: string): void {
  const blob = new Blob(['\uFEFF', csvContent], { type: 'text/csv;charset=utf-8' })
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
}

function triggerJsonDownload(filename: string, jsonContent: string): void {
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' })
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
}

function buildTableFilters(tab: TableTab): TableFilter[] {
  return buildSingleTableFilter(tab.filterColumn, tab.filterOperator, tab.filterValue)
}

function shouldApplyTableFilter(filterColumn: string, filterOperator: TableFilterOperator, filterValue: string): boolean {
  if (!filterColumn) {
    return false
  }

  if (filterOperator === 'is_not_null') {
    return true
  }

  return Boolean(filterValue)
}

function buildSingleTableFilter(filterColumn: string, filterOperator: TableFilterOperator, filterValue: string): TableFilter[] {
  if (!shouldApplyTableFilter(filterColumn, filterOperator, filterValue)) {
    return []
  }

  return [
    {
      column: filterColumn,
      operator: filterOperator,
      value: filterOperator === 'is_not_null' ? '' : filterValue,
    },
  ]
}

function resolveForeignKeyFilterValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }

  const stringified = String(value).trim()
  return stringified ? stringified : null
}

function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase()
}

function looksLikeJsonObjectOrArray(value: string): boolean {
  return (
    (value.startsWith('{') && value.endsWith('}')) ||
    (value.startsWith('[') && value.endsWith(']'))
  )
}

function parseClipboardNestedJson(value: unknown): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed || !looksLikeJsonObjectOrArray(trimmed)) {
      return value
    }

    try {
      return parseClipboardNestedJson(JSON.parse(trimmed))
    } catch {
      return value
    }
  }

  if (Array.isArray(value)) {
    return value.map((item) => parseClipboardNestedJson(item))
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        parseClipboardNestedJson(nestedValue),
      ]),
    )
  }

  return value
}

function isClipboardJsonLikeDataType(dataType: string): boolean {
  return isJsonLikeDataType(dataType) || /\bnested\s*\(/i.test(dataType)
}

function formatClipboardValue(value: unknown, dataType?: string, options?: { prettyJson?: boolean }): string {
  const prettyJson = options?.prettyJson === true

  if (value === null || value === undefined) {
    return ''
  }

  if (value instanceof Date) {
    const timestamp = value.getTime()
    if (!Number.isNaN(timestamp)) {
      const year = value.getFullYear()
      const month = String(value.getMonth() + 1).padStart(2, '0')
      const day = String(value.getDate()).padStart(2, '0')
      const hours = String(value.getHours()).padStart(2, '0')
      const minutes = String(value.getMinutes()).padStart(2, '0')
      const seconds = String(value.getSeconds()).padStart(2, '0')
      const millis = String(value.getMilliseconds()).padStart(3, '0')
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${millis}`
    }
  }

  if (dataType && isClipboardJsonLikeDataType(dataType)) {
    const indentation = prettyJson ? 2 : undefined
    const normalizedJsonValue = parseClipboardNestedJson(value)

    if (typeof normalizedJsonValue === 'string') {
      return normalizedJsonValue
    }

    try {
      return JSON.stringify(normalizedJsonValue, null, indentation)
    } catch {
      return String(normalizedJsonValue)
    }
  }

  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function escapeTsvCell(value: string): string {
  if (!/[\t\n\r"]/.test(value)) {
    return value
  }

  return `"${value.replace(/"/g, '""')}"`
}

function buildTsv(rows: string[][]): string {
  return rows.map((row) => row.map((value) => escapeTsvCell(value)).join('\t')).join('\n')
}

function parseDelimited(raw: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index]

    if (char === '"') {
      if (inQuotes && raw[index + 1] === '"') {
        cell += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (!inQuotes && char === delimiter) {
      row.push(cell)
      cell = ''
      continue
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      if (char === '\r' && raw[index + 1] === '\n') {
        index += 1
      }
      continue
    }

    cell += char
  }

  row.push(cell)
  rows.push(row)

  while (rows.length > 1 && rows[rows.length - 1]?.every((value) => value === '')) {
    rows.pop()
  }

  return rows
}

function countUnquotedDelimiter(line: string, delimiter: string): number {
  let inQuotes = false
  let count = 0

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (!inQuotes && char === delimiter) {
      count += 1
    }
  }

  return count
}

function detectClipboardDelimiter(raw: string): string {
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0)
  const sampleLine = lines[0] ?? ''

  const tabCount = countUnquotedDelimiter(sampleLine, '\t')
  if (tabCount > 0) {
    return '\t'
  }

  const semicolonCount = countUnquotedDelimiter(sampleLine, ';')
  const commaCount = countUnquotedDelimiter(sampleLine, ',')

  if (semicolonCount > commaCount && semicolonCount > 0) {
    return ';'
  }

  if (commaCount > 0) {
    return ','
  }

  return '\t'
}

function parseClipboardMatrix(raw: string): string[][] {
  const delimiter = detectClipboardDelimiter(raw)
  return parseDelimited(raw, delimiter)
}

export function useWorkspaceActions({
  activeTabId,
  setActiveTabId,
  selectedEnvironmentId,
  connections,
  activeTableTab,
  editingCell,
  setEditingCell,
  resizingSqlTabId,
  setResizingSqlTabId,
  setIsRenameSqlTabOpen,
  renamingSqlTabId,
  setRenamingSqlTabId,
  sqlTabNameDraft,
  setSqlTabNameDraft,
  setSqlConfirmOpen,
  setPendingSqlExecution,
  setSqlAutoConnectionResolveOpen,
  setPendingAutoSqlConnectionResolution,
  sqlTabCounterRef,
  sqlSplitContainerRef,
  sqlSelectionByTabRef,
  sqlExecutionByTabRef,
  closedSqlTabsByEnvironmentRef,
  workTabsRef,
  getTableTab,
  getSqlTab,
  setWorkTabs,
  updateTableTab,
  updateSqlTab,
}: UseWorkspaceActionsParams): UseWorkspaceActionsResult {
  const [isSavingTableChanges, setIsSavingTableChanges] = useState(false)
  const isSavingTableChangesRef = useRef(false)
  const tableLoadSequenceRef = useRef(0)
  const tableLoadRequestByTabRef = useRef<Record<string, number>>({})
  const sqlCancelRequestByTabRef = useRef<Record<string, string>>({})
  const sqlCancelUnlockTimerByTabRef = useRef<Record<string, number>>({})
  const autoConnectionFailureNotifiedRef = useRef<Set<string>>(new Set())
  const closedSqlHistoryKey = selectedEnvironmentId || '__no_environment__'

  useEffect(() => {
    const activeConnectionIds = new Set(connections.map((connection) => connection.id))
    for (const connectionId of autoConnectionFailureNotifiedRef.current) {
      if (!activeConnectionIds.has(connectionId)) {
        autoConnectionFailureNotifiedRef.current.delete(connectionId)
      }
    }
  }, [connections])

  const clearSqlCancelFallback = useCallback((tabId: string): void => {
    const timeoutId = sqlCancelUnlockTimerByTabRef.current[tabId]
    if (typeof timeoutId === 'number') {
      window.clearTimeout(timeoutId)
      delete sqlCancelUnlockTimerByTabRef.current[tabId]
    }
    delete sqlCancelRequestByTabRef.current[tabId]
  }, [])

  function beginTableLoad(tabId: string): number {
    tableLoadSequenceRef.current += 1
    tableLoadRequestByTabRef.current[tabId] = tableLoadSequenceRef.current
    return tableLoadSequenceRef.current
  }

  function isLatestTableLoad(tabId: string, requestId: number): boolean {
    return tableLoadRequestByTabRef.current[tabId] === requestId
  }

  function pushClosedSqlTab(tab: SqlTab, index: number): void {
    const normalizedTab: SqlTab = {
      ...tab,
      sqlRunning: false,
      sqlCanceling: false,
    }
    const currentHistory = closedSqlTabsByEnvironmentRef.current[closedSqlHistoryKey] ?? []
    closedSqlTabsByEnvironmentRef.current[closedSqlHistoryKey] = [
      ...currentHistory.filter((entry) => entry.tab.id !== normalizedTab.id),
      { tab: normalizedTab, index },
    ].slice(-3)
  }

  function restoreClosedSqlTab(): void {
    const currentHistory = closedSqlTabsByEnvironmentRef.current[closedSqlHistoryKey] ?? []
    const entry = currentHistory[currentHistory.length - 1]
    if (!entry) {
      return
    }

    closedSqlTabsByEnvironmentRef.current[closedSqlHistoryKey] = currentHistory.slice(0, -1)
    const existingTabIds = new Set(workTabsRef.current.map((tab) => tab.id))
    let restoredTab = entry.tab
    if (existingTabIds.has(restoredTab.id)) {
      let nextId = `sql:${sqlTabCounterRef.current}`
      while (existingTabIds.has(nextId)) {
        sqlTabCounterRef.current += 1
        nextId = `sql:${sqlTabCounterRef.current}`
      }

      restoredTab = {
        ...restoredTab,
        id: nextId,
      }
      sqlTabCounterRef.current += 1
    }

    const boundedIndex = Math.max(0, Math.min(workTabsRef.current.length, entry.index))
    setWorkTabs((current) => [
      ...current.slice(0, boundedIndex),
      restoredTab,
      ...current.slice(boundedIndex),
    ])
    setActiveTabId(restoredTab.id)
  }

  const initializeTableTab = useCallback(
    async (tabId: string, hit: TableSearchHit, initialLoad?: TableReloadOverrides): Promise<void> => {
      const requestId = beginTableLoad(tabId)

      setWorkTabs((current) =>
        current.map((tab) =>
          tab.id === tabId && tab.type === 'table' ? { ...tab, loading: true, loadError: null } : tab,
        ),
      )

      try {
        const nextPage = initialLoad?.page ?? 0
        const existingTab = getTableTab(tabId)
        const nextPageSize = normalizeRequestedPageSize(initialLoad?.pageSize ?? existingTab?.pageSize)
        const nextSort = initialLoad?.sort
        const nextFilterColumn = initialLoad?.filterColumn ?? ''
        const nextFilterOperator = initialLoad?.filterOperator ?? 'ilike'
        const nextFilterValue = initialLoad?.filterValue ?? ''
        const schema = await pointerApi.listTableColumns(hit.connectionId, hit.table)

        if (!isLatestTableLoad(tabId, requestId)) {
          return
        }

        const resolvedFilterColumn = nextFilterColumn || schema.columns[0]?.name || ''

        setWorkTabs((current) =>
          current.map((tab) => {
            if (tab.id !== tabId || tab.type !== 'table') {
              return tab
            }

            return {
              ...tab,
              schema,
              page: nextPage,
              pageSize: nextPageSize,
              sort: nextSort,
              filterColumn: resolvedFilterColumn,
              filterOperator: nextFilterOperator,
              filterValue: nextFilterValue,
              loading: true,
              loadError: null,
            }
          }),
        )

        await waitForNextPaint()

        if (!isLatestTableLoad(tabId, requestId)) {
          return
        }

        void pointerApi
          .describeTable(hit.connectionId, hit.table)
          .then((fullSchema) => {
            const currentTab = getTableTab(tabId)
            if (
              !currentTab ||
              currentTab.connectionId !== hit.connectionId ||
              currentTab.table.fqName !== hit.table.fqName
            ) {
              return
            }

            updateTableTab(tabId, (current) => ({
              ...current,
              schema: fullSchema,
            }))
          })
          .catch((error: unknown) => {
            if (!isLatestTableLoad(tabId, requestId)) {
              return
            }

            toast.error(getErrorMessage(error))
          })

        const filters = buildSingleTableFilter(resolvedFilterColumn, nextFilterOperator, nextFilterValue)
        const data = await pointerApi.readTable(hit.connectionId, hit.table, {
          page: nextPage,
          pageSize: nextPageSize,
          sort: nextSort,
          filters,
        })

        if (!isLatestTableLoad(tabId, requestId)) {
          return
        }

        setWorkTabs((current) =>
          current.map((tab) => {
            if (tab.id !== tabId || tab.type !== 'table') {
              return tab
            }

            return {
              ...tab,
              data,
              selectedRowIndexes: [],
              rowAnchorIndex: null,
              activeRowIndex: null,
              activeCell: null,
              cellAnchor: null,
              selectedCellRange: null,
              selectionMode: 'cell',
              pendingUpdates: {},
              pendingDeletes: [],
              insertDraft: null,
              baseRows: cloneRows(data.rows),
              pageSize: data.pageSize,
              loading: false,
              loadError: null,
            }
          }),
        )
      } catch (error) {
        if (!isLatestTableLoad(tabId, requestId)) {
          return
        }

        const message = getErrorMessage(error)
        setWorkTabs((current) =>
          current.map((tab) =>
            tab.id === tabId && tab.type === 'table' ? { ...tab, loading: false, loadError: message } : tab,
          ),
        )
        toast.error(message)
      }
    },
    [getTableTab, setWorkTabs, updateTableTab],
  )

  useEffect(() => {
    if (!activeTableTab || activeTableTab.loading) {
      return
    }

    if (activeTableTab.loadError) {
      return
    }

    if (activeTableTab.schema && activeTableTab.data) {
      return
    }

    void initializeTableTab(activeTableTab.id, {
      connectionId: activeTableTab.connectionId,
      connectionName: activeTableTab.connectionName,
      engine: activeTableTab.engine,
      table: activeTableTab.table,
    })
  }, [activeTableTab, initializeTableTab])

  useEffect(() => {
    if (!resizingSqlTabId) {
      return
    }

    const onMouseMove = (event: MouseEvent): void => {
      const container = sqlSplitContainerRef.current
      if (!container) {
        return
      }

      const rect = container.getBoundingClientRect()
      const nextRatio = ((event.clientY - rect.top) / rect.height) * 100
      const clampedRatio = Math.max(22, Math.min(82, nextRatio))

      updateSqlTab(resizingSqlTabId, (tab) => ({ ...tab, splitRatio: clampedRatio }))
    }

    const stop = (): void => setResizingSqlTabId(null)

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', stop)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', stop)
    }
  }, [resizingSqlTabId, setResizingSqlTabId, sqlSplitContainerRef, updateSqlTab])

  async function openTableTab(hit: TableSearchHit, initialLoad?: TableReloadOverrides): Promise<void> {
    const tabId = `table:${hit.connectionId}:${hit.table.fqName}`

    const existing = getTableTab(tabId)
    setActiveTabId(tabId)

    if (existing) {
      if (initialLoad) {
        updateTableTab(tabId, (tab) => ({
          ...tab,
          page: initialLoad.page ?? tab.page,
          pageSize: normalizeRequestedPageSize(initialLoad.pageSize ?? tab.pageSize),
          sort: initialLoad.sort ?? tab.sort,
          filterColumn: initialLoad.filterColumn ?? tab.filterColumn,
          filterOperator: initialLoad.filterOperator ?? tab.filterOperator,
          filterValue: initialLoad.filterValue ?? tab.filterValue,
        }))
      }

      if (!existing.schema || !existing.data) {
        await initializeTableTab(tabId, hit, initialLoad)
      } else if (initialLoad) {
        void reloadTableTab(tabId, initialLoad)
      }
      return
    }

    setWorkTabs((current) => [
      ...current,
      {
        id: tabId,
        type: 'table',
        title: formatTableLabel(hit.table),
        engine: hit.engine,
        connectionId: hit.connectionId,
        connectionName: hit.connectionName,
        table: hit.table,
        schema: null,
        data: null,
        page: initialLoad?.page ?? 0,
        pageSize: normalizeRequestedPageSize(initialLoad?.pageSize),
        sort: initialLoad?.sort,
        filterColumn: initialLoad?.filterColumn ?? '',
        filterOperator: initialLoad?.filterOperator ?? 'ilike',
        filterValue: initialLoad?.filterValue ?? '',
        selectedRowIndexes: [],
        rowAnchorIndex: null,
        activeRowIndex: null,
        activeCell: null,
        cellAnchor: null,
        selectedCellRange: null,
        selectionMode: 'cell',
        columnWidths: {},
        pendingUpdates: {},
        pendingDeletes: [],
        insertDraft: null,
        baseRows: null,
        loading: true,
        loadError: null,
      },
    ])

    await initializeTableTab(tabId, hit, initialLoad)
  }

  async function navigateToForeignKey(
    sourceTab: TableTab,
    foreignKey: ColumnForeignKeyRef | undefined,
    value: unknown,
  ): Promise<void> {
    const filterValue = resolveForeignKeyFilterValue(value)
    if (!filterValue) {
      return
    }

    if (
      !foreignKey ||
      !foreignKey.column?.trim() ||
      !foreignKey.table?.schema?.trim() ||
      !foreignKey.table?.name?.trim() ||
      !foreignKey.table?.fqName?.trim()
    ) {
      toast.error('Referência de chave estrangeira inválida.')
      return
    }

    await openTableTab(
      {
        connectionId: sourceTab.connectionId,
        connectionName: sourceTab.connectionName,
        engine: sourceTab.engine,
        table: foreignKey.table,
      },
      {
        page: 0,
        filterColumn: foreignKey.column.trim(),
        filterOperator: 'eq',
        filterValue,
      },
    )
  }

  async function reloadTableTab(tabId: string, overrides?: TableReloadOverrides): Promise<void> {
    const tab = getTableTab(tabId)

    if (!tab) {
      return
    }

    const nextPage = overrides?.page ?? tab.page
    const nextPageSize = normalizeRequestedPageSize(overrides?.pageSize ?? tab.pageSize)
    const hasSortOverride = Boolean(overrides && Object.prototype.hasOwnProperty.call(overrides, 'sort'))
    const nextSort = hasSortOverride ? overrides?.sort : tab.sort
    const nextFilterColumn = overrides?.filterColumn ?? tab.filterColumn
    const nextFilterOperator = overrides?.filterOperator ?? tab.filterOperator
    const nextFilterValue = overrides?.filterValue ?? tab.filterValue
    const requestId = beginTableLoad(tabId)

    updateTableTab(tabId, (current) => ({
      ...current,
      page: nextPage,
      pageSize: nextPageSize,
      sort: nextSort,
      filterColumn: nextFilterColumn,
      filterOperator: nextFilterOperator,
      filterValue: nextFilterValue,
      loading: true,
      loadError: null,
    }))

    try {
      const filters = buildSingleTableFilter(nextFilterColumn, nextFilterOperator, nextFilterValue)

      const result = await pointerApi.readTable(tab.connectionId, tab.table, {
        page: nextPage,
        pageSize: nextPageSize,
        sort: nextSort,
        filters,
      })

      if (!isLatestTableLoad(tabId, requestId)) {
        return
      }

      updateTableTab(tabId, (current) => ({
        ...current,
        data: result,
        selectedRowIndexes: [],
        rowAnchorIndex: null,
        activeRowIndex: null,
        activeCell: null,
        cellAnchor: null,
        selectedCellRange: null,
        selectionMode: 'cell',
        pendingUpdates: {},
        pendingDeletes: [],
        insertDraft: null,
        baseRows: cloneRows(result.rows),
        pageSize: result.pageSize,
        loading: false,
        loadError: null,
      }))
      setEditingCell(null)
    } catch (error) {
      if (!isLatestTableLoad(tabId, requestId)) {
        return
      }

      const message = getErrorMessage(error)
      updateTableTab(tabId, (current) => ({ ...current, loading: false, loadError: message }))
      toast.error(message)
    }
  }

  function closeTableTab(tabId: string): void {
    delete tableLoadRequestByTabRef.current[tabId]
    setWorkTabs((current) => current.filter((tab) => tab.id !== tabId))

    if (activeTabId === tabId) {
      const firstSqlTab = workTabsRef.current.find((tab) => tab.type === 'sql')
      setActiveTabId(firstSqlTab?.id ?? 'sql:1')
    }

    setEditingCell((current) => (current?.tabId === tabId ? null : current))
  }

  function closeDashboardTab(tabId: string): void {
    setWorkTabs((current) => current.filter((tab) => tab.id !== tabId))

    if (activeTabId === tabId) {
      const firstSqlTab = workTabsRef.current.find((tab) => tab.type === 'sql')
      setActiveTabId(firstSqlTab?.id ?? 'sql:1')
    }
  }

  async function cancelSqlExecution(targetTabId?: string): Promise<void> {
    const tabId = targetTabId ?? activeTabId
    const sqlTab = getSqlTab(tabId)
    if (!sqlTab?.sqlRunning) {
      console.info('[ui][sql-cancel] ignored because tab is not running', { tabId })
      return
    }

    const executionId = sqlExecutionByTabRef.current[tabId]
    if (!executionId) {
      console.info('[ui][sql-cancel] missing execution id, forcing stop flag', { tabId })
      clearSqlCancelFallback(tabId)
      updateSqlTab(tabId, (tab) => ({ ...tab, sqlRunning: false, sqlCanceling: false }))
      return
    }

    if (sqlCancelRequestByTabRef.current[tabId] === executionId) {
      console.info('[ui][sql-cancel] duplicate click ignored', { tabId, executionId })
      return
    }

    sqlCancelRequestByTabRef.current[tabId] = executionId
    updateSqlTab(tabId, (tab) => ({ ...tab, sqlCanceling: true }))
    const existingTimeoutId = sqlCancelUnlockTimerByTabRef.current[tabId]
    if (typeof existingTimeoutId === 'number') {
      window.clearTimeout(existingTimeoutId)
    }
    sqlCancelUnlockTimerByTabRef.current[tabId] = window.setTimeout(() => {
      const latestExecutionId = sqlExecutionByTabRef.current[tabId]
      const latestTab = getSqlTab(tabId)
      if (!latestTab?.sqlRunning || latestExecutionId !== executionId) {
        clearSqlCancelFallback(tabId)
        return
      }

      console.info('[ui][sql-cancel] timeout unlock fallback', { tabId, executionId })
      delete sqlExecutionByTabRef.current[tabId]
      clearSqlCancelFallback(tabId)
      updateSqlTab(tabId, (tab) => ({ ...tab, sqlRunning: false, sqlCanceling: false }))
      toast.info('Cancelamento demorou para responder. A aba foi destravada.')
    }, CANCEL_UNLOCK_TIMEOUT_MS)

    try {
      console.info('[ui][sql-cancel] sending cancel', { tabId, executionId })
      await pointerApi.cancelSqlExecution(executionId)
      console.info('[ui][sql-cancel] cancel request resolved', { tabId, executionId })
    } catch (error) {
      clearSqlCancelFallback(tabId)
      updateSqlTab(tabId, (tab) => ({ ...tab, sqlCanceling: false }))
      toast.error(getErrorMessage(error))
    }
  }

  function closeSqlTab(tabId: string): void {
    const sqlTabs = workTabsRef.current.filter((tab): tab is SqlTab => tab.type === 'sql')
    if (sqlTabs.length <= 1) {
      return
    }

    const closingTab = getSqlTab(tabId)
    if (!closingTab) {
      return
    }

    const closingIndex = workTabsRef.current.findIndex((tab) => tab.id === tabId)
    pushClosedSqlTab(closingTab, closingIndex >= 0 ? closingIndex : workTabsRef.current.length)

    if (closingTab.sqlRunning) {
      void cancelSqlExecution(tabId)
    }
    delete sqlExecutionByTabRef.current[tabId]

    setWorkTabs((current) => current.filter((tab) => tab.id !== tabId))

    if (activeTabId === tabId) {
      const fallback = sqlTabs.find((tab) => tab.id !== tabId)
      setActiveTabId(fallback?.id ?? sqlTabs[0].id)
    }
  }

  function closeActiveTab(): void {
    const activeId = activeTabId
    const currentTabs = workTabsRef.current

    if (currentTabs.length <= 1) {
      return
    }

    const activeIndex = currentTabs.findIndex((tab) => tab.id === activeId)
    if (activeIndex < 0) {
      return
    }

    const activeSqlTab = getSqlTab(activeId)
    if (activeSqlTab) {
      const sqlTabsCount = currentTabs.filter((tab) => tab.type === 'sql').length
      if (sqlTabsCount <= 1) {
        return
      }
    }

    const nextTabs = currentTabs.filter((tab) => tab.id !== activeId)
    if (nextTabs.length === 0) {
      return
    }

    const fallbackTab = nextTabs[activeIndex] ?? nextTabs[activeIndex - 1] ?? nextTabs[0]

    if (activeSqlTab) {
      pushClosedSqlTab(activeSqlTab, activeIndex)
    }

    if (activeSqlTab?.sqlRunning) {
      void cancelSqlExecution(activeSqlTab.id)
    }
    delete sqlExecutionByTabRef.current[activeId]

    setWorkTabs(nextTabs)
    setActiveTabId(fallbackTab.id)
    setEditingCell((current) => (current?.tabId === activeId ? null : current))
  }

  function reorderWorkTabs(draggedTabId: string, targetTabId: string, position: 'before' | 'after' = 'before'): void {
    if (!draggedTabId || !targetTabId || draggedTabId === targetTabId) {
      return
    }

    setWorkTabs((current) => {
      const draggedIndex = current.findIndex((tab) => tab.id === draggedTabId)
      const targetIndex = current.findIndex((tab) => tab.id === targetTabId)
      if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) {
        return current
      }

      const nextTabs = [...current]
      const [draggedTab] = nextTabs.splice(draggedIndex, 1)
      if (!draggedTab) {
        return current
      }

      let insertionIndex = targetIndex + (position === 'after' ? 1 : 0)
      if (draggedIndex < insertionIndex) {
        insertionIndex -= 1
      }

      const boundedInsertionIndex = Math.max(0, Math.min(nextTabs.length, insertionIndex))
      nextTabs.splice(boundedInsertionIndex, 0, draggedTab)
      return nextTabs
    })
  }

  function openNewSqlTab(): void {
    const nextId = `sql:${sqlTabCounterRef.current}`
    const title = `SQL ${sqlTabCounterRef.current}`
    sqlTabCounterRef.current += 1

    setWorkTabs((current) => [...current, createSqlTab(nextId, title)])
    setActiveTabId(nextId)
  }

  function openConnectionDashboardTab(connection: ConnectionSummary): void {
    const tabId = `dashboard:${connection.engine}:${connection.id}`
    const existing = workTabsRef.current.find(
      (tab): tab is DashboardTab => tab.id === tabId && tab.type === 'dashboard',
    )
    if (existing) {
      setActiveTabId(existing.id)
      return
    }

    setWorkTabs((current) => [
      ...current,
      createDashboardTab(tabId, connection.engine, connection.id, connection.name),
    ])
    setActiveTabId(tabId)
  }

  function openTableDashboardTab(hit: TableSearchHit): void {
    const tabId = `dashboard:table:${hit.engine}:${hit.connectionId}:${hit.table.fqName}`
    const existing = workTabsRef.current.find(
      (tab): tab is DashboardTab => tab.id === tabId && tab.type === 'dashboard',
    )
    if (existing) {
      setActiveTabId(existing.id)
      return
    }

    setWorkTabs((current) => [
      ...current,
      createTableDashboardTab(tabId, hit.engine, hit.connectionId, hit.connectionName, hit.table),
    ])
    setActiveTabId(tabId)
  }

  async function loadSqlFileToNewTab(): Promise<void> {
    try {
      const openedFile = await pointerApi.openSqlFile()
      if (!openedFile) {
        return
      }

      const nextId = `sql:${sqlTabCounterRef.current}`
      const activeSqlTab = getSqlTab(activeTabId)
      const connectionId =
        typeof activeSqlTab?.connectionId === 'string' && activeSqlTab.connectionId.length > 0
          ? activeSqlTab.connectionId
          : AUTO_SQL_CONNECTION_ID
      const title = fileNameFromPath(openedFile.filePath) || `SQL ${sqlTabCounterRef.current}`
      const nextTab: SqlTab = {
        ...createSqlTab(nextId, title, connectionId, { sqlText: openedFile.sqlText }),
        filePath: openedFile.filePath,
      }

      sqlTabCounterRef.current += 1
      setWorkTabs((current) => [...current, nextTab])
      setActiveTabId(nextId)
      toast.success(`Arquivo SQL carregado: ${title}.`)
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  async function saveActiveSqlFile(): Promise<void> {
    const activeSqlTab = getSqlTab(activeTabId)
    if (!activeSqlTab) {
      return
    }

    try {
      const suggestedFileName = ensureSqlFilename(sanitizeFilenamePart(activeSqlTab.title) || 'query')
      const savedPath = await pointerApi.saveSqlFile({
        sqlText: activeSqlTab.sqlText,
        filePath: activeSqlTab.filePath ?? undefined,
        suggestedFileName,
      })
      if (!savedPath) {
        return
      }

      const nextTitle = fileNameFromPath(savedPath) || activeSqlTab.title
      updateSqlTab(activeSqlTab.id, (tab) => ({
        ...tab,
        filePath: savedPath,
        title: nextTitle,
      }))
      toast.success(`SQL salvo em ${nextTitle}.`)
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  async function completeAiSqlTurn(params: {
    tabId: string
    prompt: string
    messages: AiSqlChatMessage[]
    currentSql?: string
  }): Promise<void> {
    const { tabId, prompt, messages, currentSql } = params

    if (!selectedEnvironmentId) {
      updateSqlTab(tabId, (tab) => ({ ...tab, aiLoading: false }))
      toast.error('Selecione um ambiente para usar a IA.')
      return
    }

    try {
      const result = await pointerApi.generateAiSqlTurn({
        environmentId: selectedEnvironmentId,
        prompt,
        messages,
        currentSql,
      })

      const assistantMessage = buildAiMessage('assistant', result.assistantMessage.trim() || 'Posso te ajudar a refinar essa consulta.')
      updateSqlTab(tabId, (tab) => {
        return {
          ...tab,
          sqlText: result.sql?.trim() ? result.sql.trim() : tab.sqlText,
          aiLoading: false,
          aiMessages: [...tab.aiMessages, assistantMessage],
        }
      })
    } catch (error) {
      const message = getErrorMessage(error)
      const assistantMessage = buildAiMessage('assistant', message)
      updateSqlTab(tabId, (tab) => ({
        ...tab,
        aiLoading: false,
        aiMessages: [...tab.aiMessages, assistantMessage],
      }))
      toast.error(message)
    }
  }

  async function sendAiPromptToSqlTab(tabId: string, prompt: string): Promise<void> {
    const sqlTab = getSqlTab(tabId)
    if (!sqlTab || !sqlTab.isAiTab) {
      return
    }

    if (sqlTab.aiLoading) {
      return
    }

    const normalizedPrompt = prompt.trim()
    if (!normalizedPrompt) {
      toast.info('Descreva o que você quer que a IA ajuste na consulta.')
      return
    }

    const userMessage = buildAiMessage('user', normalizedPrompt)
    const messages = [...sqlTab.aiMessages, userMessage].map((message) => ({
      role: message.role,
      content: message.content,
    }))

    updateSqlTab(tabId, (tab) => ({
      ...tab,
      aiLoading: true,
      aiDraft: '',
      aiMessages: [...tab.aiMessages, userMessage],
    }))

    await completeAiSqlTurn({
      tabId,
      prompt: normalizedPrompt,
      messages,
      currentSql: sqlTab.sqlText,
    })
  }

  function setAiDraftOnSqlTab(tabId: string, value: string): void {
    updateSqlTab(tabId, (tab) => ({
      ...tab,
      aiDraft: value,
    }))
  }

  async function openAiSqlTabWithPrompt(prompt: string): Promise<void> {
    const normalizedPrompt = prompt.trim()
    if (!normalizedPrompt) {
      toast.info('Descreva o que você quer consultar com a IA.')
      return
    }

    const nextId = `sql:${sqlTabCounterRef.current}`
    const title = `IA ${sqlTabCounterRef.current}`
    const userMessage = buildAiMessage('user', normalizedPrompt)
    const initialTab: SqlTab = {
      ...createSqlTab(nextId, title, AUTO_SQL_CONNECTION_ID, { isAiTab: true, sqlText: '' }),
      aiLoading: true,
      aiMessages: [userMessage],
    }

    sqlTabCounterRef.current += 1
    setWorkTabs((current) => [...current, initialTab])
    setActiveTabId(nextId)

    await completeAiSqlTurn({
      tabId: nextId,
      prompt: normalizedPrompt,
      messages: [{ role: 'user', content: normalizedPrompt }],
      currentSql: '',
    })
  }

  function openRenameSqlTabDialog(tab: SqlTab): void {
    setRenamingSqlTabId(tab.id)
    setSqlTabNameDraft(tab.title)
    setIsRenameSqlTabOpen(true)
  }

  function handleRenameSqlTab(): void {
    const nextName = sqlTabNameDraft.trim()
    if (!renamingSqlTabId || !nextName) {
      toast.error('Informe um nome para a aba SQL.')
      return
    }

    updateSqlTab(renamingSqlTabId, (tab) => ({
      ...tab,
      title: nextName,
    }))

    setIsRenameSqlTabOpen(false)
    setRenamingSqlTabId('')
    setSqlTabNameDraft('')
  }

  function beginInlineEdit(rowIndex: number, column: string): void {
    if (!activeTableTab?.data || !activeTableTab.schema?.supportsRowEdit) {
      return
    }

    if (activeTableTab.pendingDeletes.includes(rowIndex)) {
      return
    }

    const original = activeTableTab.data.rows[rowIndex]?.[column]
    setEditingCell({
      tabId: activeTableTab.id,
      rowIndex,
      column,
      value: formatDraftInputValue(original),
    })
  }

  function commitInlineEdit(override?: EditingCell): void {
    const targetEdit = override ?? editingCell
    if (!targetEdit) {
      return
    }

    const tab = getTableTab(targetEdit.tabId)

    if (!tab?.data) {
      setEditingCell(null)
      return
    }

    const row = tab.data.rows[targetEdit.rowIndex]
    if (!row) {
      setEditingCell(null)
      return
    }

    const currentValue = row[targetEdit.column]
    const baseRow = tab.baseRows?.[targetEdit.rowIndex] ?? null
    const baseValue = baseRow ? baseRow[targetEdit.column] : undefined
    const columnDataType = tab.schema?.columns.find((column) => column.name === targetEdit.column)?.dataType
    const nextValue = coerceValueByOriginal(targetEdit.value, currentValue, columnDataType)
    const hasChanged = !valuesEqual(currentValue, nextValue)

    if (!hasChanged) {
      setEditingCell(null)
      return
    }

    updateTableTab(targetEdit.tabId, (current) => {
      if (!current.data) {
        return current
      }

      const nextRows = current.data.rows.map((currentRow, index) => {
        if (index !== targetEdit.rowIndex) {
          return currentRow
        }

        return {
          ...currentRow,
          [targetEdit.column]: nextValue,
        }
      })

      return {
        ...current,
        data: {
          ...current.data,
          rows: nextRows,
        },
        pendingUpdates: (() => {
          const nextPendingUpdates: RowPendingUpdates = { ...current.pendingUpdates }
          const rowPendingUpdate = { ...(nextPendingUpdates[targetEdit.rowIndex] ?? {}) }

          if (valuesEqual(nextValue, baseValue)) {
            delete rowPendingUpdate[targetEdit.column]
          } else {
            rowPendingUpdate[targetEdit.column] = nextValue
          }

          if (Object.keys(rowPendingUpdate).length === 0) {
            delete nextPendingUpdates[targetEdit.rowIndex]
          } else {
            nextPendingUpdates[targetEdit.rowIndex] = rowPendingUpdate
          }

          return nextPendingUpdates
        })(),
      }
    })

    setEditingCell(null)
  }

  function cancelInlineEdit(): void {
    setEditingCell(null)
  }

  async function saveActiveTableChanges(): Promise<void> {
    if (isSavingTableChangesRef.current) {
      return
    }

    const tab = getTableTab(activeTabId)
    if (!tab || !tab.data) {
      return
    }

    const pendingDeleteRows = Array.from(new Set(tab.pendingDeletes)).sort((a, b) => a - b)
    const pendingUpdateRows = Object.keys(tab.pendingUpdates)
      .map((value) => Number(value))
      .filter((rowIndex) => Number.isInteger(rowIndex) && rowIndex >= 0 && !pendingDeleteRows.includes(rowIndex))
    const hasPendingInsert = Boolean(tab.insertDraft)
    const hasPendingWriteRows = pendingDeleteRows.length > 0 || pendingUpdateRows.length > 0

    if (!hasPendingInsert && !hasPendingWriteRows) {
      toast.info('Nenhuma alteração pendente para salvar.')
      return
    }

    isSavingTableChangesRef.current = true
    setIsSavingTableChanges(true)

    try {
      let affected = 0
      let updated = 0
      let deleted = 0

      if (tab.insertDraft && tab.schema) {
        const insertPayload = buildInsertPayload(tab.insertDraft, tab.schema)
        if (Object.keys(insertPayload).length === 0) {
          throw new Error('Preencha ao menos uma coluna para inserir.')
        }

        await pointerApi.insertRow(tab.connectionId, tab.table, insertPayload)
        affected += 1
      }

      if (tab.schema?.supportsRowEdit) {
        for (const rowIndex of pendingUpdateRows) {
          const row = tab.data.rows[rowIndex]
          if (!row) {
            continue
          }

          const pendingColumns = tab.pendingUpdates[rowIndex] ?? {}
          const patchKeys = Object.keys(pendingColumns)
          if (patchKeys.length === 0) {
            continue
          }

          const payload: Record<string, unknown> = {}
          for (const pkColumn of tab.schema.primaryKey) {
            payload[pkColumn] = row[pkColumn]
          }
          for (const key of patchKeys) {
            payload[key] = pendingColumns[key]
          }

          const result = await pointerApi.updateRow(tab.connectionId, tab.table, payload)
          affected += result.affected
          updated += result.affected
        }

        for (const rowIndex of pendingDeleteRows) {
          const row = tab.data.rows[rowIndex]
          if (!row) {
            continue
          }

          const payload: Record<string, unknown> = {}
          for (const pkColumn of tab.schema.primaryKey) {
            payload[pkColumn] = row[pkColumn]
          }

          const result = await pointerApi.deleteRow(tab.connectionId, tab.table, payload)
          affected += result.affected
          deleted += result.affected
        }
      } else if (hasPendingWriteRows) {
        toast.info('Update/Delete por linha não está disponível para este banco.')
      }

      toast.success(`${affected} registro(s) salvo(s).`)
      const canCommitWritesLocally =
        !hasPendingInsert &&
        hasPendingWriteRows &&
        updated === pendingUpdateRows.length &&
        deleted === pendingDeleteRows.length

      if (canCommitWritesLocally) {
        const deletedRowIndexes = new Set(pendingDeleteRows)

        updateTableTab(tab.id, (current) => {
          if (!current.data) {
            return current
          }

          const nextRows = current.data.rows.filter((_row, rowIndex) => !deletedRowIndexes.has(rowIndex))

          return {
            ...current,
            data: {
              ...current.data,
              rows: nextRows,
            },
            pendingUpdates: {},
            pendingDeletes: [],
            baseRows: cloneRows(nextRows),
            ...(deletedRowIndexes.size > 0
              ? {
                  selectedRowIndexes: [],
                  rowAnchorIndex: null,
                  activeRowIndex: null,
                  activeCell: null,
                  cellAnchor: null,
                  selectedCellRange: null,
                  selectionMode: 'cell' as const,
                }
              : {}),
          }
        })
      } else {
        await reloadTableTab(tab.id)
      }
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      isSavingTableChangesRef.current = false
      setIsSavingTableChanges(false)
    }
  }

  function handleToggleInsertDraftRow(): void {
    if (!activeTableTab || !activeTableTab.schema) {
      return
    }

    setEditingCell(null)

    updateTableTab(activeTableTab.id, (tab) => {
      if (!tab.schema) {
        return tab
      }

      if (tab.insertDraft) {
        return {
          ...tab,
          insertDraft: null,
        }
      }

      return {
        ...tab,
        insertDraft: createInitialInsertDraft(tab.schema),
      }
    })
  }

  function updateInsertDraftValue(columnName: string, value: string | null): void {
    if (!activeTableTab?.insertDraft) {
      return
    }

    updateTableTab(activeTableTab.id, (tab) => {
      if (!tab.insertDraft) {
        return tab
      }

      return {
        ...tab,
        insertDraft: {
          ...tab.insertDraft,
          [columnName]: value,
        },
      }
    })
  }

  function handleDeleteRow(): void {
    if (!activeTableTab) {
      return
    }

    if (!activeTableTab.schema?.supportsRowEdit) {
      toast.info('Delete por linha não está disponível para este banco.')
      return
    }

    const selectedRows = Array.from(new Set(activeTableTab.selectedRowIndexes))
      .filter((rowIndex) => Number.isInteger(rowIndex) && rowIndex >= 0)
      .sort((a, b) => a - b)

    if (selectedRows.length === 0) {
      return
    }
    const shouldUnmarkAll = selectedRows.every((rowIndex) => activeTableTab.pendingDeletes.includes(rowIndex))

    updateTableTab(activeTableTab.id, (tab) => {
      if (!tab.data) {
        return tab
      }

      const nextPendingDeletes = shouldUnmarkAll
        ? tab.pendingDeletes.filter((index) => !selectedRows.includes(index))
        : Array.from(new Set([...tab.pendingDeletes, ...selectedRows])).sort((a, b) => a - b)

      const nextPendingUpdates: RowPendingUpdates = { ...tab.pendingUpdates }
      if (!shouldUnmarkAll) {
        for (const rowIndex of selectedRows) {
          delete nextPendingUpdates[rowIndex]
        }
      }

      return {
        ...tab,
        pendingDeletes: nextPendingDeletes,
        pendingUpdates: nextPendingUpdates,
      }
    })

    setEditingCell((current) => {
      if (!current || current.tabId !== activeTableTab.id || !selectedRows.includes(current.rowIndex)) {
        return current
      }
      return null
    })

    if (shouldUnmarkAll) {
      toast.info('Delete pendente removido das linhas selecionadas.')
    } else {
      toast.info('Linhas marcadas para exclusão. Use Cmd+S para salvar.')
    }
  }

  async function copyInsertSqlFromTableRow(tabId: string, rowIndex: number): Promise<void> {
    const tab = getTableTab(tabId)
    if (!tab?.schema || !tab.data) {
      toast.info('Carregue a tabela antes de copiar SQL de insert.')
      return
    }

    const normalizedRowIndex = Math.trunc(rowIndex)
    if (!Number.isInteger(normalizedRowIndex) || normalizedRowIndex < 0 || normalizedRowIndex >= tab.data.rows.length) {
      toast.error('Linha inválida para copiar SQL de insert.')
      return
    }

    const row = tab.data.rows[normalizedRowIndex]
    if (!row) {
      toast.error('Linha não encontrada para copiar SQL de insert.')
      return
    }

    try {
      const sql = buildInsertSqlFromRow(tab.engine, tab.schema, row)
      await pointerApi.copyToClipboard(sql)
      toast.success('SQL de insert copiado.')
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  async function copyTableSelection(): Promise<void> {
    const tab = getTableTab(activeTabId)
    if (!tab?.data || !tab.schema) {
      return
    }

    const rowCount = tab.data.rows.length
    const columnCount = tab.schema.columns.length
    if (rowCount === 0 || columnCount === 0) {
      return
    }

    let matrix: string[][] = []
    let directCopyValue: string | null = null

    if (tab.selectedCellRange) {
      const startRow = Math.max(0, Math.min(tab.selectedCellRange.start.rowIndex, rowCount - 1))
      const endRow = Math.max(0, Math.min(tab.selectedCellRange.end.rowIndex, rowCount - 1))
      const startCol = Math.max(0, Math.min(tab.selectedCellRange.start.columnIndex, columnCount - 1))
      const endCol = Math.max(0, Math.min(tab.selectedCellRange.end.columnIndex, columnCount - 1))
      const minRow = Math.min(startRow, endRow)
      const maxRow = Math.max(startRow, endRow)
      const minCol = Math.min(startCol, endCol)
      const maxCol = Math.max(startCol, endCol)

      if (minRow === maxRow && minCol === maxCol) {
        const row = tab.data.rows[minRow]
        const column = tab.schema.columns[minCol]
        if (row && column) {
          if (isClipboardJsonLikeDataType(column.dataType)) {
            directCopyValue = formatClipboardValue(row[column.name], column.dataType, { prettyJson: true })
          } else {
            matrix = [[formatClipboardValue(row[column.name], column.dataType)]]
          }
        }
      } else {
        for (let rowIndex = minRow; rowIndex <= maxRow; rowIndex += 1) {
          const row = tab.data.rows[rowIndex]
          if (!row) {
            continue
          }
          const line: string[] = []
          for (let columnIndex = minCol; columnIndex <= maxCol; columnIndex += 1) {
            const column = tab.schema.columns[columnIndex]
            if (!column) {
              continue
            }
            line.push(formatClipboardValue(row[column.name], column.dataType))
          }
          matrix.push(line)
        }
      }
    } else if (tab.selectedRowIndexes.length > 0) {
      const selectedRows = Array.from(new Set(tab.selectedRowIndexes))
        .filter((rowIndex) => Number.isInteger(rowIndex) && rowIndex >= 0 && rowIndex < rowCount)
        .sort((a, b) => a - b)

      matrix = selectedRows.map((rowIndex) => {
        const row = tab.data?.rows[rowIndex] ?? {}
        return tab.schema?.columns.map((column) => formatClipboardValue(row[column.name], column.dataType)) ?? []
      })
    } else if (tab.activeCell) {
      const rowIndex = tab.activeCell.rowIndex
      const columnIndex = tab.activeCell.columnIndex
      const row = tab.data.rows[rowIndex]
      const column = tab.schema.columns[columnIndex]
      if (row && column) {
        if (isClipboardJsonLikeDataType(column.dataType)) {
          directCopyValue = formatClipboardValue(row[column.name], column.dataType, { prettyJson: true })
        } else {
          matrix = [[formatClipboardValue(row[column.name], column.dataType)]]
        }
      }
    }

    if (directCopyValue !== null) {
      try {
        await pointerApi.copyToClipboard(directCopyValue)
        toast.success('Seleção copiada.')
      } catch (error) {
        toast.error(getErrorMessage(error))
      }
      return
    }

    if (matrix.length === 0 || matrix.every((line) => line.length === 0)) {
      return
    }

    try {
      await pointerApi.copyToClipboard(buildTsv(matrix))
      toast.success('Seleção copiada.')
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  function pasteIntoTableSelection(rawClipboardText: string): void {
    const tab = getTableTab(activeTabId)
    if (!tab?.data || !tab.schema) {
      return
    }

    if (!tab.schema.supportsRowEdit) {
      toast.info('Paste por célula não está disponível para este banco.')
      return
    }

    const parsed = parseClipboardMatrix(rawClipboardText)
    if (parsed.length === 0) {
      return
    }

    const matrix = parsed.map((row) => row.map((value) => value ?? ''))
    const sourceHeight = matrix.length
    const sourceWidth = Math.max(...matrix.map((row) => row.length), 0)
    if (sourceWidth <= 0) {
      return
    }

    const rowCount = tab.data.rows.length
    const columnCount = tab.schema.columns.length
    if (rowCount === 0 || columnCount === 0) {
      return
    }

    const hasCellRange = tab.selectionMode === 'cell' && Boolean(tab.selectedCellRange)
    const rangeStart = tab.selectedCellRange?.start ?? tab.activeCell
    const rangeEnd = tab.selectedCellRange?.end ?? tab.activeCell
    if (!rangeStart || !rangeEnd) {
      return
    }

    const minRow = Math.max(0, Math.min(rangeStart.rowIndex, rangeEnd.rowIndex))
    const maxRow = Math.min(rowCount - 1, Math.max(rangeStart.rowIndex, rangeEnd.rowIndex))
    const minCol = Math.max(0, Math.min(rangeStart.columnIndex, rangeEnd.columnIndex))
    const maxCol = Math.min(columnCount - 1, Math.max(rangeStart.columnIndex, rangeEnd.columnIndex))
    const targetHeight = maxRow - minRow + 1
    const targetWidth = maxCol - minCol + 1
    const fillSelection = hasCellRange && sourceHeight === 1 && sourceWidth === 1 && (targetHeight > 1 || targetWidth > 1)

    let changedCount = 0
    let attemptedCount = 0
    let skippedCount = 0

    updateTableTab(tab.id, (current) => {
      if (!current.data || !current.schema) {
        return current
      }

      const nextRows = current.data.rows.map((row) => ({ ...row }))
      const nextPendingUpdates: RowPendingUpdates = { ...current.pendingUpdates }

      const maxTargetRowExclusive = fillSelection ? maxRow + 1 : Math.min(rowCount, minRow + sourceHeight)
      const maxTargetColExclusive = fillSelection ? maxCol + 1 : Math.min(columnCount, minCol + sourceWidth)

      for (let targetRow = minRow; targetRow < maxTargetRowExclusive; targetRow += 1) {
        if (current.pendingDeletes.includes(targetRow)) {
          skippedCount += 1
          continue
        }

        const row = nextRows[targetRow]
        if (!row) {
          continue
        }

        for (let targetCol = minCol; targetCol < maxTargetColExclusive; targetCol += 1) {
          const sourceRow = fillSelection ? 0 : targetRow - minRow
          const sourceCol = fillSelection ? 0 : targetCol - minCol
          const sourceValue = matrix[sourceRow]?.[sourceCol]
          if (sourceValue === undefined) {
            continue
          }

          const column = current.schema.columns[targetCol]
          if (!column || column.isPrimaryKey) {
            skippedCount += 1
            continue
          }

          attemptedCount += 1
          const currentValue = row[column.name]
          const baseRow = current.baseRows?.[targetRow] ?? null
          const baseValue = baseRow ? baseRow[column.name] : undefined
          const nextValue = coerceValueByOriginal(sourceValue, currentValue, column.dataType)

          if (valuesEqual(currentValue, nextValue)) {
            const rowPendingUpdate = { ...(nextPendingUpdates[targetRow] ?? {}) }
            if (valuesEqual(nextValue, baseValue)) {
              delete rowPendingUpdate[column.name]
            } else {
              rowPendingUpdate[column.name] = nextValue
            }

            if (Object.keys(rowPendingUpdate).length === 0) {
              delete nextPendingUpdates[targetRow]
            } else {
              nextPendingUpdates[targetRow] = rowPendingUpdate
            }
            continue
          }

          row[column.name] = nextValue
          changedCount += 1

          const rowPendingUpdate = { ...(nextPendingUpdates[targetRow] ?? {}) }
          if (valuesEqual(nextValue, baseValue)) {
            delete rowPendingUpdate[column.name]
          } else {
            rowPendingUpdate[column.name] = nextValue
          }

          if (Object.keys(rowPendingUpdate).length === 0) {
            delete nextPendingUpdates[targetRow]
          } else {
            nextPendingUpdates[targetRow] = rowPendingUpdate
          }
        }
      }

      if (changedCount === 0 && attemptedCount === 0) {
        return current
      }

      return {
        ...current,
        data: {
          ...current.data,
          rows: nextRows,
        },
        pendingUpdates: nextPendingUpdates,
      }
    })

    if (changedCount > 0) {
      const skippedLabel = skippedCount > 0 ? ` • ${skippedCount} ignorada(s)` : ''
      toast.success(`${changedCount} célula(s) atualizada(s)${skippedLabel}. Use Cmd+S para salvar.`)
      return
    }

    if (attemptedCount > 0) {
      toast.info('Nenhuma célula alterada (valores já estavam iguais).')
      return
    }

    toast.info('Nenhuma célula válida para colar na seleção atual.')
  }

  function resolveExportColumns(allColumns: string[], selectedColumns: string[]): string[] {
    const selectedColumnSet = new Set(selectedColumns)
    return allColumns.filter((column) => selectedColumnSet.has(column))
  }

  function exportSqlResultSetVisibleCsv({
    tabId,
    resultSetIndex,
    fields,
    rows,
    selectedColumns,
  }: {
    tabId: string
    resultSetIndex: number
    fields: string[]
    rows: Record<string, unknown>[]
    selectedColumns: string[]
  }): void {
    const sqlTab = getSqlTab(tabId)
    if (!sqlTab) {
      return
    }

    try {
      const columns = resolveExportColumns(fields, selectedColumns)
      if (columns.length === 0) {
        toast.info('Selecione ao menos uma coluna para exportar.')
        return
      }

      const csvContent = buildCsvContent(columns, rows)
      const tabPart = sanitizeFilenamePart(sqlTab.title) || 'sql'
      const filename = `pointer-sql-${tabPart}-resultset-${resultSetIndex + 1}-${buildTimestamp()}.csv`
      triggerCsvDownload(filename, csvContent)
      toast.success(`CSV exportado (${rows.length} linha(s)).`)
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  function exportSqlResultSetVisibleJson({
    tabId,
    resultSetIndex,
    fields,
    rows,
    selectedColumns,
  }: {
    tabId: string
    resultSetIndex: number
    fields: string[]
    rows: Record<string, unknown>[]
    selectedColumns: string[]
  }): void {
    const sqlTab = getSqlTab(tabId)
    if (!sqlTab) {
      return
    }

    try {
      const columns = resolveExportColumns(fields, selectedColumns)
      if (columns.length === 0) {
        toast.info('Selecione ao menos uma coluna para exportar.')
        return
      }

      const jsonContent = buildJsonContent(columns, rows)
      const tabPart = sanitizeFilenamePart(sqlTab.title) || 'sql'
      const filename = `pointer-sql-${tabPart}-resultset-${resultSetIndex + 1}-${buildTimestamp()}.json`
      triggerJsonDownload(filename, jsonContent)
      toast.success(`JSON exportado (${rows.length} linha(s)).`)
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  function exportTableCurrentPageCsv(tabId: string, selectedColumns: string[]): void {
    const tab = getTableTab(tabId)
    if (!tab?.schema || !tab.data) {
      toast.info('Carregue a tabela antes de exportar.')
      return
    }

    try {
      const columns = resolveExportColumns(
        tab.schema.columns.map((column) => column.name),
        selectedColumns,
      )
      if (columns.length === 0) {
        toast.info('Selecione ao menos uma coluna para exportar.')
        return
      }

      const rows = tab.baseRows ?? tab.data.rows
      const csvContent = buildCsvContent(columns, rows)
      const tablePart = sanitizeFilenamePart(formatTableLabel(tab.table)) || 'table'
      const filename = `pointer-table-${tablePart}-page-${tab.page + 1}-${buildTimestamp()}.csv`
      triggerCsvDownload(filename, csvContent)
      toast.success(`Página atual exportada (${rows.length} linha(s)).`)
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  function exportTableCurrentPageJson(tabId: string, selectedColumns: string[]): void {
    const tab = getTableTab(tabId)
    if (!tab?.schema || !tab.data) {
      toast.info('Carregue a tabela antes de exportar.')
      return
    }

    try {
      const columns = resolveExportColumns(
        tab.schema.columns.map((column) => column.name),
        selectedColumns,
      )
      if (columns.length === 0) {
        toast.info('Selecione ao menos uma coluna para exportar.')
        return
      }

      const rows = tab.baseRows ?? tab.data.rows
      const jsonContent = buildJsonContent(columns, rows)
      const tablePart = sanitizeFilenamePart(formatTableLabel(tab.table)) || 'table'
      const filename = `pointer-table-${tablePart}-page-${tab.page + 1}-${buildTimestamp()}.json`
      triggerJsonDownload(filename, jsonContent)
      toast.success(`Página atual exportada (${rows.length} linha(s)).`)
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  async function exportTableAllPagesCsv(tabId: string, selectedColumns: string[]): Promise<void> {
    const tab = getTableTab(tabId)
    if (!tab?.schema) {
      toast.info('Carregue a tabela antes de exportar.')
      return
    }

    const columns = resolveExportColumns(
      tab.schema.columns.map((column) => column.name),
      selectedColumns,
    )
    if (columns.length === 0) {
      toast.info('Selecione ao menos uma coluna para exportar.')
      return
    }

    const filters = buildTableFilters(tab)
    const pageSize = normalizeRequestedPageSize(tab.pageSize)

    let page = 0
    let pageCount = 0
    let rowCount = 0
    const rows: Record<string, unknown>[] = []
    let hasMorePages = true

    toast.info('Exportando todas as páginas em CSV...')

    try {
      while (hasMorePages) {
        const result = await pointerApi.readTable(tab.connectionId, tab.table, {
          page,
          pageSize,
          sort: tab.sort,
          filters,
        })

        rows.push(...result.rows)
        rowCount += result.rows.length
        pageCount += 1

        hasMorePages = result.rows.length === result.pageSize
        if (hasMorePages) {
          page += 1
        }
      }

      const csvContent = buildCsvContent(columns, rows)
      const tablePart = sanitizeFilenamePart(formatTableLabel(tab.table)) || 'table'
      const filename = `pointer-table-${tablePart}-all-pages-${buildTimestamp()}.csv`
      triggerCsvDownload(filename, csvContent)
      toast.success(`CSV exportado com ${rowCount} linha(s) em ${pageCount} página(s).`)
    } catch (error) {
      toast.error(getErrorMessage(error))
      throw error
    }
  }

  async function exportTableAllPagesJson(tabId: string, selectedColumns: string[]): Promise<void> {
    const tab = getTableTab(tabId)
    if (!tab?.schema) {
      toast.info('Carregue a tabela antes de exportar.')
      return
    }

    const columns = resolveExportColumns(
      tab.schema.columns.map((column) => column.name),
      selectedColumns,
    )
    if (columns.length === 0) {
      toast.info('Selecione ao menos uma coluna para exportar.')
      return
    }

    const filters = buildTableFilters(tab)
    const pageSize = normalizeRequestedPageSize(tab.pageSize)

    let page = 0
    let pageCount = 0
    let rowCount = 0
    const rows: Record<string, unknown>[] = []
    let hasMorePages = true

    toast.info('Exportando todas as páginas em JSON...')

    try {
      while (hasMorePages) {
        const result = await pointerApi.readTable(tab.connectionId, tab.table, {
          page,
          pageSize,
          sort: tab.sort,
          filters,
        })

        rows.push(...result.rows)
        rowCount += result.rows.length
        pageCount += 1

        hasMorePages = result.rows.length === result.pageSize
        if (hasMorePages) {
          page += 1
        }
      }

      const jsonContent = buildJsonContent(columns, rows)
      const tablePart = sanitizeFilenamePart(formatTableLabel(tab.table)) || 'table'
      const filename = `pointer-table-${tablePart}-all-pages-${buildTimestamp()}.json`
      triggerJsonDownload(filename, jsonContent)
      toast.success(`JSON exportado com ${rowCount} linha(s) em ${pageCount} página(s).`)
    } catch (error) {
      toast.error(getErrorMessage(error))
      throw error
    }
  }

  async function resolveAutoConnectionCandidates(
    tableReference: ReturnType<typeof extractFirstFromTableReference>,
  ): Promise<{ candidates: ConnectionSummary[]; failedConnections: ConnectionSummary[] }> {
    if (!tableReference) {
      return {
        candidates: [],
        failedConnections: [],
      }
    }

    const normalizedName = normalizeIdentifier(tableReference.name)
    const normalizedSchema = tableReference.schema ? normalizeIdentifier(tableReference.schema) : null

    const candidatesById = new Map<string, ConnectionSummary>()
    const healthyConnectionIds = new Set<string>()
    const failedConnections: ConnectionSummary[] = []

    const matches = await Promise.all(
      connections.map(async (connection) => {
        try {
          const tables = await pointerApi.searchTables(connection.id, tableReference.fqName)
          healthyConnectionIds.add(connection.id)

          const found = tables.some((table) => {
            const tableName = normalizeIdentifier(table.name)
            if (tableName !== normalizedName) {
              return false
            }

            if (!normalizedSchema) {
              return true
            }

            return normalizeIdentifier(table.schema) === normalizedSchema
          })

          return found ? connection : null
        } catch (error) {
          console.warn('[ui][sql][auto] falha ao buscar tabelas da conexão', {
            connectionId: connection.id,
            connectionName: connection.name,
            message: getErrorMessage(error),
          })
          failedConnections.push(connection)
          return null
        }
      }),
    )

    for (const connection of matches) {
      if (!connection) {
        continue
      }

      candidatesById.set(connection.id, connection)
    }

    for (const connectionId of healthyConnectionIds) {
      autoConnectionFailureNotifiedRef.current.delete(connectionId)
    }

    return {
      candidates: Array.from(candidatesById.values()),
      failedConnections,
    }
  }

  async function resolveSqlConnectionId(
    sqlTab: SqlTab,
    sqlToExecute: string,
    resolvedConnectionId?: string,
  ): Promise<string | null> {
    if (resolvedConnectionId) {
      if (!connections.some((connection) => connection.id === resolvedConnectionId)) {
        toast.error('A conexão escolhida não está mais disponível.')
        return null
      }
      return resolvedConnectionId
    }

    if (!sqlTab.connectionId) {
      toast.error('Selecione uma conexão para esta aba SQL.')
      return null
    }

    if (sqlTab.connectionId !== AUTO_SQL_CONNECTION_ID) {
      return sqlTab.connectionId
    }

    if (connections.length === 0) {
      toast.error('Nenhuma conexão disponível neste ambiente para executar no modo Auto.')
      return null
    }

    const tableReference = extractFirstFromTableReference(sqlToExecute)
    if (!tableReference) {
      toast.error('No modo Auto, informe uma query com tabela para inferir a conexão.')
      return null
    }

    const { candidates, failedConnections } = await resolveAutoConnectionCandidates(tableReference)
    const newlyFailedConnections = failedConnections.filter(
      (connection) => !autoConnectionFailureNotifiedRef.current.has(connection.id),
    )
    if (newlyFailedConnections.length > 0) {
      const failedNames = newlyFailedConnections.map((connection) => connection.name)
      const failedLabel = failedNames.join(', ')
      const plural = newlyFailedConnections.length > 1
      toast.error(
        plural
          ? `Modo Auto: conexões com falha/disconectadas: ${failedLabel}.`
          : `Modo Auto: conexão com falha/disconectada: ${failedLabel}.`,
      )

      for (const connection of newlyFailedConnections) {
        autoConnectionFailureNotifiedRef.current.add(connection.id)
      }
    }

    if (candidates.length === 0) {
      toast.error(`Nenhuma conexão encontrada para a tabela "${tableReference.fqName}".`)
      return null
    }

    if (candidates.length > 1) {
      setPendingAutoSqlConnectionResolution({
        tabId: sqlTab.id,
        sql: sqlToExecute,
        tableLabel: tableReference.fqName,
        candidateConnectionIds: candidates.map((connection) => connection.id),
      })
      setSqlAutoConnectionResolveOpen(true)
      return null
    }

    return candidates[0].id
  }

  async function runSql(
    force = false,
    cursorOffset?: number,
    explicitSql?: string,
    targetTabId?: string,
    resolvedConnectionId?: string,
  ): Promise<void> {
    const tabId = targetTabId ?? activeTabId
    const sqlTab = getSqlTab(tabId)

    if (!sqlTab) {
      return
    }

    if (sqlTab.sqlRunning) {
      return
    }

    const executionId = buildSqlExecutionId()

    try {
      const selectedSql = getSelectedSqlText(sqlTab.sqlText, sqlSelectionByTabRef.current[sqlTab.id])
      const hasExplicitSql = typeof explicitSql === 'string'
      const hasSelectedSql = selectedSql !== null
      const scopedSql =
        !hasExplicitSql && !hasSelectedSql && typeof cursorOffset === 'number'
          ? getSqlStatementAtCursor(sqlTab.sqlText, cursorOffset)
          : null

      const sqlToExecute = (hasExplicitSql ? explicitSql : hasSelectedSql ? selectedSql : scopedSql ?? sqlTab.sqlText).trim()
      if (!sqlToExecute) {
        toast.info('Posicione o cursor em uma query válida para executar.')
        return
      }

      updateSqlTab(sqlTab.id, (tab) => ({ ...tab, sqlRunning: true, sqlCanceling: false }))
      const effectiveConnectionId = await resolveSqlConnectionId(sqlTab, sqlToExecute, resolvedConnectionId)
      if (!effectiveConnectionId) {
        return
      }

      if (!force) {
        const risk = await pointerApi.previewSqlRisk(sqlToExecute)

        if (risk.level !== 'safe') {
          setPendingSqlExecution({
            tabId: sqlTab.id,
            sql: sqlToExecute,
            connectionId: effectiveConnectionId,
          })
          setSqlConfirmOpen(true)
          return
        }
      }

      sqlExecutionByTabRef.current[sqlTab.id] = executionId
      clearSqlCancelFallback(sqlTab.id)
      console.info('[ui][sql] execute start', { tabId: sqlTab.id, executionId, connectionId: effectiveConnectionId })
      let result: SqlExecutionResult

      try {
        result = await pointerApi.executeSqlWithExecutionId(effectiveConnectionId, sqlToExecute, executionId)
      } catch (executionError) {
        if (isSqlExecutionCanceledError(executionError)) {
          throw executionError
        }

        const fallbackSql = await buildClickHouseUnknownTableFallbackSql(
          connections,
          effectiveConnectionId,
          sqlToExecute,
          executionError,
        )

        if (!fallbackSql) {
          throw executionError
        }

        result = await pointerApi.executeSqlWithExecutionId(effectiveConnectionId, fallbackSql, executionId)
        toast.info('Tabela qualificada automaticamente com schema para ClickHouse.')
      }

      if (sqlExecutionByTabRef.current[sqlTab.id] === executionId) {
        updateSqlTab(sqlTab.id, (tab) => ({ ...tab, sqlResult: result }))
        setSqlConfirmOpen(false)
        setPendingSqlExecution(null)
        toast.success(`Query executada em ${result.durationMs}ms`)

        const currentTableTab = getTableTab(activeTabId)
        if (currentTableTab) {
          await reloadTableTab(currentTableTab.id)
        }
      } else {
        console.info('[ui][sql] stale result ignored', { tabId: sqlTab.id, executionId })
      }
    } catch (error) {
      if (isSqlExecutionCanceledError(error)) {
        toast.info('Execução cancelada.')
      } else {
        toast.error(getErrorMessage(error))
      }
    } finally {
      clearSqlCancelFallback(sqlTab.id)
      if (sqlExecutionByTabRef.current[sqlTab.id] === executionId) {
        delete sqlExecutionByTabRef.current[sqlTab.id]
      }

      console.info('[ui][sql] execute finalize', { tabId: sqlTab.id, executionId })
      updateSqlTab(sqlTab.id, (tab) => ({ ...tab, sqlRunning: false, sqlCanceling: false }))
    }
  }

  return {
    openNewSqlTab,
    openConnectionDashboardTab,
    openTableDashboardTab,
    loadSqlFileToNewTab,
    saveActiveSqlFile,
    openRenameSqlTabDialog,
    handleRenameSqlTab,
    openTableTab,
    navigateToForeignKey,
    reloadTableTab,
    reorderWorkTabs,
    closeTableTab,
    closeDashboardTab,
    closeSqlTab,
    closeActiveTab,
    restoreClosedSqlTab,
    beginInlineEdit,
    commitInlineEdit,
    cancelInlineEdit,
    saveActiveTableChanges,
    isSavingTableChanges,
    handleToggleInsertDraftRow,
    updateInsertDraftValue,
    handleDeleteRow,
    copyInsertSqlFromTableRow,
    copyTableSelection,
    pasteIntoTableSelection,
    exportSqlResultSetVisibleCsv,
    exportSqlResultSetVisibleJson,
    exportTableCurrentPageCsv,
    exportTableAllPagesCsv,
    exportTableCurrentPageJson,
    exportTableAllPagesJson,
    openAiSqlTabWithPrompt,
    sendAiPromptToSqlTab,
    setAiDraftOnSqlTab,
    runSql,
    cancelSqlExecution,
  }
}
