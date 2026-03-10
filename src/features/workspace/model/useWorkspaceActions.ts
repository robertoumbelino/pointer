import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { toast } from 'sonner'
import type {
  AiSqlChatMessage,
  ColumnForeignKeyRef,
  ConnectionSummary,
  SqlExecutionResult,
  TableRef,
  TableFilter,
  TableSearchHit,
} from '../../../../shared/db-types'
import { SQL_EXECUTION_CANCELED_MESSAGE } from '../../../../shared/db-types'
import { pointerApi } from '../../../shared/api/pointer-api'
import { AUTO_SQL_CONNECTION_ID, PAGE_SIZE, TABLE_PAGE_SIZE_MAX } from '../../../shared/constants/app'
import { buildCsvContent } from '../../../shared/lib/csv'
import {
  buildClickHouseUnknownTableFallbackSql,
  buildInsertPayload,
  cloneRows,
  coerceValueByOriginal,
  createInitialInsertDraft,
  extractFirstFromTableReference,
  formatDraftInputValue,
  formatTableLabel,
  getErrorMessage,
  getSqlStatementAtCursor,
  valuesEqual,
} from '../../../shared/lib/workspace-utils'
import {
  createSqlTab,
  type EditingCell,
  type RowPendingUpdates,
  type SqlTab,
  type TableReloadOverrides,
  type TableTab,
  type WorkTab,
} from '../../../entities/workspace/types'

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
  setSqlConfirmText: Dispatch<SetStateAction<string>>
  setPendingSqlExecution: Dispatch<SetStateAction<{ tabId: string; sql: string; connectionId?: string } | null>>
  setSqlAutoConnectionResolveOpen: Dispatch<SetStateAction<boolean>>
  setPendingAutoSqlConnectionResolution: Dispatch<
    SetStateAction<{ tabId: string; sql: string; tableLabel: string; candidateConnectionIds: string[] } | null>
  >
  sqlTabCounterRef: MutableRefObject<number>
  sqlSplitContainerRef: MutableRefObject<HTMLDivElement | null>
  sqlExecutionByTabRef: MutableRefObject<Record<string, string>>
  workTabsRef: MutableRefObject<WorkTab[]>
  getTableTab: (tabId: string) => TableTab | null
  getSqlTab: (tabId: string) => SqlTab | null
  setWorkTabs: Dispatch<SetStateAction<WorkTab[]>>
  updateTableTab: (tabId: string, updater: (tab: TableTab) => TableTab) => void
  updateSqlTab: (tabId: string, updater: (tab: SqlTab) => SqlTab) => void
}

type UseWorkspaceActionsResult = {
  openNewSqlTab: () => void
  openRenameSqlTabDialog: (tab: SqlTab) => void
  handleRenameSqlTab: () => void
  openTableTab: (hit: TableSearchHit, initialLoad?: TableReloadOverrides) => Promise<void>
  navigateToForeignKey: (sourceTab: TableTab, foreignKey: ColumnForeignKeyRef | undefined, value: unknown) => Promise<void>
  reloadTableTab: (tabId: string, overrides?: TableReloadOverrides) => Promise<void>
  closeTableTab: (tabId: string) => void
  closeSqlTab: (tabId: string) => void
  closeActiveTab: () => void
  beginInlineEdit: (rowIndex: number, column: string) => void
  commitInlineEdit: (override?: EditingCell) => void
  cancelInlineEdit: () => void
  saveActiveTableChanges: () => Promise<void>
  isSavingTableChanges: boolean
  handleToggleInsertDraftRow: () => void
  updateInsertDraftValue: (columnName: string, value: string | null) => void
  handleDeleteRow: () => void
  exportSqlResultSetVisibleCsv: (params: {
    tabId: string
    resultSetIndex: number
    fields: string[]
    rows: Record<string, unknown>[]
  }) => void
  exportTableCurrentPageCsv: (tabId: string) => void
  exportTableAllPagesCsv: (tabId: string) => Promise<void>
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

function buildTableFilters(tab: TableTab): TableFilter[] {
  if (!tab.filterColumn || !tab.filterValue) {
    return []
  }

  return [
    {
      column: tab.filterColumn,
      operator: tab.filterOperator,
      value: tab.filterValue,
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
  setSqlConfirmText,
  setPendingSqlExecution,
  setSqlAutoConnectionResolveOpen,
  setPendingAutoSqlConnectionResolution,
  sqlTabCounterRef,
  sqlSplitContainerRef,
  sqlExecutionByTabRef,
  workTabsRef,
  getTableTab,
  getSqlTab,
  setWorkTabs,
  updateTableTab,
  updateSqlTab,
}: UseWorkspaceActionsParams): UseWorkspaceActionsResult {
  const [isSavingTableChanges, setIsSavingTableChanges] = useState(false)
  const isSavingTableChangesRef = useRef(false)
  const sqlCancelRequestByTabRef = useRef<Record<string, string>>({})
  const sqlCancelUnlockTimerByTabRef = useRef<Record<string, number>>({})
  const tablesByConnectionRef = useRef<Record<string, TableRef[]>>({})

  useEffect(() => {
    tablesByConnectionRef.current = {}
  }, [connections])

  const clearSqlCancelFallback = useCallback((tabId: string): void => {
    const timeoutId = sqlCancelUnlockTimerByTabRef.current[tabId]
    if (typeof timeoutId === 'number') {
      window.clearTimeout(timeoutId)
      delete sqlCancelUnlockTimerByTabRef.current[tabId]
    }
    delete sqlCancelRequestByTabRef.current[tabId]
  }, [])

  const initializeTableTab = useCallback(
    async (tabId: string, hit: TableSearchHit, initialLoad?: TableReloadOverrides): Promise<void> => {
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
        const needsSchemaBeforeRead = Boolean(nextFilterValue && !nextFilterColumn)
        const schemaPromise = pointerApi.describeTable(hit.connectionId, hit.table)

        let schema: Awaited<ReturnType<typeof pointerApi.describeTable>>
        let resolvedFilterColumn = nextFilterColumn
        let data: Awaited<ReturnType<typeof pointerApi.readTable>>

        if (needsSchemaBeforeRead) {
          schema = await schemaPromise
          resolvedFilterColumn = nextFilterColumn || schema.columns[0]?.name || ''
          const filters =
            resolvedFilterColumn && nextFilterValue
              ? [{ column: resolvedFilterColumn, operator: nextFilterOperator, value: nextFilterValue }]
              : []

          data = await pointerApi.readTable(hit.connectionId, hit.table, {
            page: nextPage,
            pageSize: nextPageSize,
            sort: nextSort,
            filters,
          })
        } else {
          const filters =
            nextFilterColumn && nextFilterValue
              ? [{ column: nextFilterColumn, operator: nextFilterOperator, value: nextFilterValue }]
              : []

          const [resolvedSchema, resolvedData] = await Promise.all([
            schemaPromise,
            pointerApi.readTable(hit.connectionId, hit.table, {
              page: nextPage,
              pageSize: nextPageSize,
              sort: nextSort,
              filters,
            }),
          ])

          schema = resolvedSchema
          data = resolvedData
          resolvedFilterColumn = nextFilterColumn || schema.columns[0]?.name || ''
        }

        setWorkTabs((current) =>
          current.map((tab) => {
            if (tab.id !== tabId || tab.type !== 'table') {
              return tab
            }

            return {
              ...tab,
              schema,
              data,
              page: nextPage,
              pageSize: data.pageSize,
              sort: nextSort,
              filterColumn: resolvedFilterColumn,
              filterOperator: nextFilterOperator,
              filterValue: nextFilterValue,
              selectedRowIndex: null,
              pendingUpdates: {},
              pendingDeletes: [],
              insertDraft: null,
              baseRows: cloneRows(data.rows),
              loading: false,
              loadError: null,
            }
          }),
        )
      } catch (error) {
        const message = getErrorMessage(error)
        setWorkTabs((current) =>
          current.map((tab) =>
            tab.id === tabId && tab.type === 'table' ? { ...tab, loading: false, loadError: message } : tab,
          ),
        )
        toast.error(message)
      }
    },
    [getTableTab, setWorkTabs],
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
        selectedRowIndex: null,
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

    updateTableTab(tabId, (current) => ({ ...current, loading: true, loadError: null }))

    try {
      const filters =
        nextFilterColumn && nextFilterValue
          ? [{ column: nextFilterColumn, operator: nextFilterOperator, value: nextFilterValue }]
          : []

      const result = await pointerApi.readTable(tab.connectionId, tab.table, {
        page: nextPage,
        pageSize: nextPageSize,
        sort: nextSort,
        filters,
      })

      updateTableTab(tabId, (current) => ({
        ...current,
        page: nextPage,
        sort: nextSort,
        filterColumn: nextFilterColumn,
        filterOperator: nextFilterOperator,
        filterValue: nextFilterValue,
        data: result,
        selectedRowIndex: null,
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
      const message = getErrorMessage(error)
      updateTableTab(tabId, (current) => ({ ...current, loading: false, loadError: message }))
      toast.error(message)
    }
  }

  function closeTableTab(tabId: string): void {
    setWorkTabs((current) => current.filter((tab) => tab.id !== tabId))

    if (activeTabId === tabId) {
      const firstSqlTab = workTabsRef.current.find((tab) => tab.type === 'sql')
      setActiveTabId(firstSqlTab?.id ?? 'sql:1')
    }

    setEditingCell((current) => (current?.tabId === tabId ? null : current))
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

    if (getSqlTab(tabId)?.sqlRunning) {
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

    const nextTabs = currentTabs.filter((tab) => tab.id !== activeId)
    if (nextTabs.length === 0) {
      return
    }

    const fallbackTab = nextTabs[activeIndex] ?? nextTabs[activeIndex - 1] ?? nextTabs[0]

    const activeSqlTab = getSqlTab(activeId)
    if (activeSqlTab?.sqlRunning) {
      void cancelSqlExecution(activeSqlTab.id)
    }
    delete sqlExecutionByTabRef.current[activeId]

    setWorkTabs(nextTabs)
    setActiveTabId(fallbackTab.id)
    setEditingCell((current) => (current?.tabId === activeId ? null : current))
  }

  function openNewSqlTab(): void {
    const nextId = `sql:${sqlTabCounterRef.current}`
    const title = `SQL ${sqlTabCounterRef.current}`
    sqlTabCounterRef.current += 1

    setWorkTabs((current) => [...current, createSqlTab(nextId, title)])
    setActiveTabId(nextId)
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
        }
      } else if (hasPendingWriteRows) {
        toast.info('Update/Delete por linha não está disponível para este banco.')
      }

      toast.success(`${affected} registro(s) salvo(s).`)
      await reloadTableTab(tab.id)
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

    if (activeTableTab.selectedRowIndex === null) {
      return
    }

    const rowIndex = activeTableTab.selectedRowIndex
    const isAlreadyMarked = activeTableTab.pendingDeletes.includes(rowIndex)

    updateTableTab(activeTableTab.id, (tab) => {
      if (!tab.data) {
        return tab
      }

      const nextPendingDeletes = isAlreadyMarked
        ? tab.pendingDeletes.filter((index) => index !== rowIndex)
        : Array.from(new Set([...tab.pendingDeletes, rowIndex]))

      const nextPendingUpdates: RowPendingUpdates = { ...tab.pendingUpdates }
      if (!isAlreadyMarked) {
        delete nextPendingUpdates[rowIndex]
      }

      return {
        ...tab,
        pendingDeletes: nextPendingDeletes,
        pendingUpdates: nextPendingUpdates,
      }
    })

    setEditingCell((current) => {
      if (!current || current.tabId !== activeTableTab.id || current.rowIndex !== rowIndex) {
        return current
      }
      return null
    })

    if (isAlreadyMarked) {
      toast.info('Delete pendente removido da linha selecionada.')
    } else {
      toast.info('Linha marcada para exclusão. Use Cmd+S para salvar.')
    }
  }

  function exportSqlResultSetVisibleCsv({
    tabId,
    resultSetIndex,
    fields,
    rows,
  }: {
    tabId: string
    resultSetIndex: number
    fields: string[]
    rows: Record<string, unknown>[]
  }): void {
    const sqlTab = getSqlTab(tabId)
    if (!sqlTab) {
      return
    }

    try {
      const csvContent = buildCsvContent(fields, rows)
      const tabPart = sanitizeFilenamePart(sqlTab.title) || 'sql'
      const filename = `pointer-sql-${tabPart}-resultset-${resultSetIndex + 1}-${buildTimestamp()}.csv`
      triggerCsvDownload(filename, csvContent)
      toast.success(`CSV exportado (${rows.length} linha(s)).`)
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  function exportTableCurrentPageCsv(tabId: string): void {
    const tab = getTableTab(tabId)
    if (!tab?.schema || !tab.data) {
      toast.info('Carregue a tabela antes de exportar.')
      return
    }

    try {
      const columns = tab.schema.columns.map((column) => column.name)
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

  async function exportTableAllPagesCsv(tabId: string): Promise<void> {
    const tab = getTableTab(tabId)
    if (!tab?.schema) {
      toast.info('Carregue a tabela antes de exportar.')
      return
    }

    const columns = tab.schema.columns.map((column) => column.name)
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

  async function listTablesWithCache(connectionId: string): Promise<TableRef[]> {
    const cached = tablesByConnectionRef.current[connectionId]
    if (cached) {
      return cached
    }

    const tables = await pointerApi.listTables(connectionId)
    tablesByConnectionRef.current[connectionId] = tables
    return tables
  }

  async function resolveAutoConnectionCandidates(
    tableReference: ReturnType<typeof extractFirstFromTableReference>,
  ): Promise<ConnectionSummary[]> {
    if (!tableReference) {
      return []
    }

    const normalizedName = normalizeIdentifier(tableReference.name)
    const normalizedSchema = tableReference.schema ? normalizeIdentifier(tableReference.schema) : null

    const matches = await Promise.all(
      connections.map(async (connection) => {
        const tables = await listTablesWithCache(connection.id)
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
      }),
    )

    return matches.filter((connection): connection is ConnectionSummary => Boolean(connection))
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
      toast.error('No modo Auto, informe uma query com FROM tabela para inferir a conexão.')
      return null
    }

    const candidates = await resolveAutoConnectionCandidates(tableReference)
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
      const scopedSql =
        typeof cursorOffset === 'number'
          ? getSqlStatementAtCursor(sqlTab.sqlText, cursorOffset)
          : null

      const sqlToExecute = (explicitSql ?? scopedSql ?? sqlTab.sqlText).trim()
      if (!sqlToExecute) {
        toast.info('Posicione o cursor em uma query válida para executar.')
        return
      }

      const effectiveConnectionId = await resolveSqlConnectionId(sqlTab, sqlToExecute, resolvedConnectionId)
      if (!effectiveConnectionId) {
        return
      }

      if (!force) {
        const risk = await pointerApi.previewSqlRisk(sqlToExecute)

        if (risk.level !== 'safe') {
          setSqlConfirmText('')
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
      updateSqlTab(sqlTab.id, (tab) => ({ ...tab, sqlRunning: true, sqlCanceling: false }))
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
        setSqlConfirmText('')
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
    openRenameSqlTabDialog,
    handleRenameSqlTab,
    openTableTab,
    navigateToForeignKey,
    reloadTableTab,
    closeTableTab,
    closeSqlTab,
    closeActiveTab,
    beginInlineEdit,
    commitInlineEdit,
    cancelInlineEdit,
    saveActiveTableChanges,
    isSavingTableChanges,
    handleToggleInsertDraftRow,
    updateInsertDraftValue,
    handleDeleteRow,
    exportSqlResultSetVisibleCsv,
    exportTableCurrentPageCsv,
    exportTableAllPagesCsv,
    openAiSqlTabWithPrompt,
    sendAiPromptToSqlTab,
    setAiDraftOnSqlTab,
    runSql,
    cancelSqlExecution,
  }
}
