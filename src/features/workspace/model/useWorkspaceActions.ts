import { useCallback, useEffect } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { toast } from 'sonner'
import type { ConnectionSummary, SqlExecutionResult, TableSearchHit } from '../../../../shared/db-types'
import { pointerApi } from '../../../shared/api/pointer-api'
import { PAGE_SIZE } from '../../../shared/constants/app'
import {
  buildClickHouseUnknownTableFallbackSql,
  buildInsertPayload,
  cloneRows,
  coerceValueByOriginal,
  createInitialInsertDraft,
  formatDraftInputValue,
  formatTableLabel,
  getErrorMessage,
  getSqlStatementAtCursor,
  valuesEqual,
} from '../../../shared/lib/workspace-utils'
import { createSqlTab, type EditingCell, type RowPendingUpdates, type SqlTab, type TableReloadOverrides, type TableTab, type WorkTab } from '../../../entities/workspace/types'

type UseWorkspaceActionsParams = {
  activeTabId: string
  setActiveTabId: Dispatch<SetStateAction<string>>
  selectedConnectionId: string
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
  setPendingSqlExecution: Dispatch<SetStateAction<{ tabId: string; sql: string } | null>>
  sqlTabCounterRef: MutableRefObject<number>
  sqlSplitContainerRef: MutableRefObject<HTMLDivElement | null>
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
  reloadTableTab: (tabId: string, overrides?: TableReloadOverrides) => Promise<void>
  closeTableTab: (tabId: string) => void
  closeSqlTab: (tabId: string) => void
  closeActiveTab: () => void
  beginInlineEdit: (rowIndex: number, column: string) => void
  commitInlineEdit: (override?: EditingCell) => void
  cancelInlineEdit: () => void
  saveActiveTableChanges: () => Promise<void>
  handleToggleInsertDraftRow: () => void
  updateInsertDraftValue: (columnName: string, value: string) => void
  handleDeleteRow: () => void
  runSql: (force?: boolean, cursorOffset?: number, explicitSql?: string, targetTabId?: string) => Promise<void>
}

export function useWorkspaceActions({
  activeTabId,
  setActiveTabId,
  selectedConnectionId,
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
  sqlTabCounterRef,
  sqlSplitContainerRef,
  workTabsRef,
  getTableTab,
  getSqlTab,
  setWorkTabs,
  updateTableTab,
  updateSqlTab,
}: UseWorkspaceActionsParams): UseWorkspaceActionsResult {
  const initializeTableTab = useCallback(
    async (tabId: string, hit: TableSearchHit, initialLoad?: TableReloadOverrides): Promise<void> => {
      setWorkTabs((current) =>
        current.map((tab) => (tab.id === tabId && tab.type === 'table' ? { ...tab, loading: true } : tab)),
      )

      try {
        const nextPage = initialLoad?.page ?? 0
        const nextSort = initialLoad?.sort
        const nextFilterColumn = initialLoad?.filterColumn ?? ''
        const nextFilterOperator = initialLoad?.filterOperator ?? 'ilike'
        const nextFilterValue = initialLoad?.filterValue ?? ''

        const schema = await pointerApi.describeTable(hit.connectionId, hit.table)
        const resolvedFilterColumn = nextFilterColumn || schema.columns[0]?.name || ''
        const filters =
          resolvedFilterColumn && nextFilterValue
            ? [{ column: resolvedFilterColumn, operator: nextFilterOperator, value: nextFilterValue }]
            : []

        const data = await pointerApi.readTable(hit.connectionId, hit.table, {
          page: nextPage,
          pageSize: PAGE_SIZE,
          sort: nextSort,
          filters,
        })

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
            }
          }),
        )
      } catch (error) {
        setWorkTabs((current) =>
          current.map((tab) => (tab.id === tabId && tab.type === 'table' ? { ...tab, loading: false } : tab)),
        )
        toast.error(getErrorMessage(error))
      }
    },
    [setWorkTabs],
  )

  useEffect(() => {
    if (!activeTableTab || activeTableTab.loading) {
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
      },
    ])

    await initializeTableTab(tabId, hit, initialLoad)
  }

  async function reloadTableTab(tabId: string, overrides?: TableReloadOverrides): Promise<void> {
    const tab = getTableTab(tabId)

    if (!tab) {
      return
    }

    const nextPage = overrides?.page ?? tab.page
    const nextSort = overrides?.sort ?? tab.sort
    const nextFilterColumn = overrides?.filterColumn ?? tab.filterColumn
    const nextFilterOperator = overrides?.filterOperator ?? tab.filterOperator
    const nextFilterValue = overrides?.filterValue ?? tab.filterValue

    updateTableTab(tabId, (current) => ({ ...current, loading: true }))

    try {
      const filters =
        nextFilterColumn && nextFilterValue
          ? [{ column: nextFilterColumn, operator: nextFilterOperator, value: nextFilterValue }]
          : []

      const result = await pointerApi.readTable(tab.connectionId, tab.table, {
        page: nextPage,
        pageSize: PAGE_SIZE,
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
        loading: false,
      }))
      setEditingCell(null)
    } catch (error) {
      updateTableTab(tabId, (current) => ({ ...current, loading: false }))
      toast.error(getErrorMessage(error))
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

  function closeSqlTab(tabId: string): void {
    const sqlTabs = workTabsRef.current.filter((tab): tab is SqlTab => tab.type === 'sql')
    if (sqlTabs.length <= 1) {
      return
    }

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

    setWorkTabs(nextTabs)
    setActiveTabId(fallbackTab.id)
    setEditingCell((current) => (current?.tabId === activeId ? null : current))
  }

  function openNewSqlTab(): void {
    const nextId = `sql:${sqlTabCounterRef.current}`
    const title = `SQL ${sqlTabCounterRef.current}`
    sqlTabCounterRef.current += 1

    setWorkTabs((current) => [...current, createSqlTab(nextId, title, selectedConnectionId)])
    setActiveTabId(nextId)
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

  function updateInsertDraftValue(columnName: string, value: string): void {
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

  async function runSql(
    force = false,
    cursorOffset?: number,
    explicitSql?: string,
    targetTabId?: string,
  ): Promise<void> {
    const tabId = targetTabId ?? activeTabId
    const sqlTab = getSqlTab(tabId)

    if (!sqlTab) {
      return
    }

    if (!sqlTab.connectionId) {
      toast.error('Selecione uma conexão para esta aba SQL.')
      return
    }

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

      if (!force) {
        const risk = await pointerApi.previewSqlRisk(sqlToExecute)

        if (risk.level !== 'safe') {
          setSqlConfirmText('')
          setPendingSqlExecution({
            tabId: sqlTab.id,
            sql: sqlToExecute,
          })
          setSqlConfirmOpen(true)
          return
        }
      }

      updateSqlTab(sqlTab.id, (tab) => ({ ...tab, sqlRunning: true }))
      let result: SqlExecutionResult

      try {
        result = await pointerApi.executeSql(sqlTab.connectionId, sqlToExecute)
      } catch (executionError) {
        const fallbackSql = await buildClickHouseUnknownTableFallbackSql(
          connections,
          sqlTab.connectionId,
          sqlToExecute,
          executionError,
        )

        if (!fallbackSql) {
          throw executionError
        }

        result = await pointerApi.executeSql(sqlTab.connectionId, fallbackSql)
        toast.info('Tabela qualificada automaticamente com schema para ClickHouse.')
      }

      updateSqlTab(sqlTab.id, (tab) => ({ ...tab, sqlResult: result }))
      setSqlConfirmOpen(false)
      setSqlConfirmText('')
      setPendingSqlExecution(null)
      toast.success(`Query executada em ${result.durationMs}ms`)

      const currentTableTab = getTableTab(activeTabId)
      if (currentTableTab) {
        await reloadTableTab(currentTableTab.id)
      }
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      updateSqlTab(sqlTab.id, (tab) => ({ ...tab, sqlRunning: false }))
    }
  }

  return {
    openNewSqlTab,
    openRenameSqlTabDialog,
    handleRenameSqlTab,
    openTableTab,
    reloadTableTab,
    closeTableTab,
    closeSqlTab,
    closeActiveTab,
    beginInlineEdit,
    commitInlineEdit,
    cancelInlineEdit,
    saveActiveTableChanges,
    handleToggleInsertDraftRow,
    updateInsertDraftValue,
    handleDeleteRow,
    runSql,
  }
}
