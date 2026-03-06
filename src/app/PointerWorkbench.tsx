/* eslint-disable react-hooks/exhaustive-deps */
import { useCallback, useEffect, useMemo, useRef } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { sql } from '@codemirror/lang-sql'
import {
  autocompletion,
  type Completion,
  type CompletionContext,
  startCompletion,
} from '@codemirror/autocomplete'
import { keymap } from '@codemirror/view'
import { oneDark } from '@codemirror/theme-one-dark'
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Copy,
  Database,
  FileCode2,
  FolderOpen,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Table2,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import type {
  ConnectionInput,
  ConnectionSummary,
  DatabaseEngine,
  SqlExecutionResult,
  TableFilterOperator,
  TableSearchHit,
  TableSort,
} from '../../shared/db-types'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '../components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu'
import { Input } from '../components/ui/input'
import { cn } from '../lib/utils'
import {
  createConnectionDraft,
  createConnectionDraftFromConnection,
  createSqlTab,
  type EnvironmentWorkspaceSnapshot,
  type PersistedWorkspaceStorage,
  type RowPendingUpdates,
  type SqlTab,
  type TableReloadOverrides,
  type TableTab,
} from '../entities/workspace/types'
import { useAppUpdate } from '../features/app-update/model/useAppUpdate'
import { useCommandPalette } from '../features/command-palette/model/useCommandPalette'
import { useConnections } from '../features/connections/model/useConnections'
import { useEnvironments } from '../features/environments/model/useEnvironments'
import { useWorkspace } from '../features/workspace/model/useWorkspace'
import { pointerApi } from '../shared/api/pointer-api'
import {
  DEFAULT_ENVIRONMENT_COLOR,
  ENVIRONMENT_COLOR_PRESETS,
  PAGE_SIZE,
  SAFE_CONFIRM_WORD,
  SIDEBAR_SECTION_LABEL_CLASS,
  WORKSPACE_STORAGE_KEY,
} from '../shared/constants/app'
import {
  buildClickHouseUnknownTableFallbackSql,
  buildCreateTableTemplateSql,
  buildInsertPayload,
  buildInsertTemplateSql,
  cloneRows,
  coerceValueByOriginal,
  defaultPortByEngine,
  engineLabel,
  engineShortLabel,
  extractSqliteDatabaseName,
  formatCell,
  formatDraftInputValue,
  formatSidebarTableName,
  formatTableLabel,
  getErrorMessage,
  getSqlStatementAtCursor,
  hexToRgb,
  normalizeHexColor,
  resolveCommandScopedColumn,
  valuesEqual,
  createInitialInsertDraft,
} from '../shared/lib/workspace-utils'
import {
  buildPersistedWorkspaceStorage,
  restorePersistedWorkspaceStorage,
} from '../shared/storage/workspace-storage'

function App(): JSX.Element {
  const {
    environments,
    setEnvironments,
    selectedEnvironmentId,
    setSelectedEnvironmentId,
    isCreateEnvironmentOpen,
    setIsCreateEnvironmentOpen,
    environmentNameDraft,
    setEnvironmentNameDraft,
    environmentColorDraft,
    setEnvironmentColorDraft,
    isEnvironmentSaving,
    setIsEnvironmentSaving,
    isEditEnvironmentOpen,
    setIsEditEnvironmentOpen,
    environmentEditNameDraft,
    setEnvironmentEditNameDraft,
    environmentEditColorDraft,
    setEnvironmentEditColorDraft,
    isEnvironmentUpdating,
    setIsEnvironmentUpdating,
  } = useEnvironments()

  const {
    connections,
    setConnections,
    selectedConnectionId,
    setSelectedConnectionId,
    isCreateConnectionOpen,
    setIsCreateConnectionOpen,
    connectionDraft,
    setConnectionDraft,
    isConnectionSaving,
    setIsConnectionSaving,
    isCreateConnectionTesting,
    setIsCreateConnectionTesting,
    isEditConnectionOpen,
    setIsEditConnectionOpen,
    editingConnectionId,
    setEditingConnectionId,
    connectionEditDraft,
    setConnectionEditDraft,
    isConnectionUpdating,
    setIsConnectionUpdating,
    isEditConnectionTesting,
    setIsEditConnectionTesting,
  } = useConnections()

  const {
    isCommandOpen,
    setIsCommandOpen,
    commandQuery,
    setCommandQuery,
    commandIndex,
    setCommandIndex,
    commandScopedTarget,
    setCommandScopedTarget,
    commandScopedSchema,
    setCommandScopedSchema,
    commandScopedColumn,
    setCommandScopedColumn,
    commandScopedValue,
    setCommandScopedValue,
    commandItemRefs,
  } = useCommandPalette()

  const {
    selectedSchema,
    setSelectedSchema,
    catalogHits,
    setCatalogHits,
    commandHits,
    setCommandHits,
    workTabs,
    setWorkTabs,
    activeTabId,
    setActiveTabId,
    isEnvironmentCommandOpen,
    setIsEnvironmentCommandOpen,
    environmentCommandQuery,
    setEnvironmentCommandQuery,
    environmentCommandIndex,
    setEnvironmentCommandIndex,
    isRenameSqlTabOpen,
    setIsRenameSqlTabOpen,
    renamingSqlTabId,
    setRenamingSqlTabId,
    sqlTabNameDraft,
    setSqlTabNameDraft,
    editingCell,
    setEditingCell,
    sqlConfirmOpen,
    setSqlConfirmOpen,
    sqlConfirmText,
    setSqlConfirmText,
    pendingSqlExecution,
    setPendingSqlExecution,
    tableContextMenu,
    setTableContextMenu,
    resizingSqlTabId,
    setResizingSqlTabId,
    workTabsRef,
    activeTabIdRef,
    selectedSchemaRef,
    sqlTabCounterRef,
    sqlSplitContainerRef,
    sqlCursorByTabRef,
    environmentWorkspaceRef,
    previousEnvironmentIdRef,
    preferredEnvironmentIdRef,
    runSqlRef,
    saveActiveTableChangesRef,
    commitInlineEditRef,
    toggleSelectedRowDeleteRef,
    openNewSqlTabRef,
    closeActiveTabRef,
  } = useWorkspace()

  const {
    appUpdateInfo,
    setAppUpdateInfo,
    isCheckingAppUpdate,
    setIsCheckingAppUpdate,
    isInstallingAppUpdate,
    setIsInstallingAppUpdate,
    appVersion,
    setAppVersion,
  } = useAppUpdate()

  const commandColumnInputRef = useRef<HTMLSelectElement | null>(null)
  const commandValueInputRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    workTabsRef.current = workTabs
  }, [workTabs])

  useEffect(() => {
    activeTabIdRef.current = activeTabId
  }, [activeTabId])

  useEffect(() => {
    selectedSchemaRef.current = selectedSchema
  }, [selectedSchema])

  const selectedEnvironment = useMemo(
    () => environments.find((environment) => environment.id === selectedEnvironmentId) ?? null,
    [environments, selectedEnvironmentId],
  )

  const selectedEnvironmentRgb = useMemo(
    () => hexToRgb(normalizeHexColor(selectedEnvironment?.color ?? DEFAULT_ENVIRONMENT_COLOR)),
    [selectedEnvironment?.color],
  )

  const sidebarBackgroundStyle = useMemo(() => {
    return {
      backgroundImage: `
        radial-gradient(circle at 0% 0%, rgba(${selectedEnvironmentRgb.r}, ${selectedEnvironmentRgb.g}, ${selectedEnvironmentRgb.b}, 0.24), transparent 45%),
        radial-gradient(circle at 100% 0%, rgba(${selectedEnvironmentRgb.r}, ${selectedEnvironmentRgb.g}, ${selectedEnvironmentRgb.b}, 0.1), transparent 32%),
        linear-gradient(to bottom, #0b1320, #070d18)
      `,
    }
  }, [selectedEnvironmentRgb.b, selectedEnvironmentRgb.g, selectedEnvironmentRgb.r])

  const schemaOptions = useMemo(() => {
    const uniqueSchemas = new Set(catalogHits.map((hit) => hit.table.schema))
    return Array.from(uniqueSchemas).sort((a, b) => a.localeCompare(b))
  }, [catalogHits])

  const filteredSidebarTables = useMemo(() => {
    if (selectedSchema === 'all') {
      return catalogHits
    }

    return catalogHits.filter((hit) => hit.table.schema === selectedSchema)
  }, [catalogHits, selectedSchema])

  const environmentCommandResults = useMemo(
    () =>
      environments.filter((environment) =>
        environment.name.toLowerCase().includes(environmentCommandQuery.trim().toLowerCase()),
      ),
    [environments, environmentCommandQuery],
  )

  const activeTableTab = useMemo(() => {
    const tab = workTabs.find((candidate) => candidate.id === activeTabId)
    return tab?.type === 'table' ? tab : null
  }, [activeTabId, workTabs])

  const activeSqlTab = useMemo(() => {
    const tab = workTabs.find((candidate) => candidate.id === activeTabId)
    return tab?.type === 'sql' ? tab : null
  }, [activeTabId, workTabs])

  const selectedRow = useMemo(() => {
    if (!activeTableTab?.data || activeTableTab.selectedRowIndex === null) {
      return null
    }

    return activeTableTab.data.rows[activeTableTab.selectedRowIndex] ?? null
  }, [activeTableTab])

  const sqlCompletions = useMemo<Completion[]>(() => {
    const completionMap = new Map<string, Completion>()

    for (const hit of catalogHits) {
      const display = `${formatTableLabel(hit.table)} • ${hit.connectionName}`
      completionMap.set(`table:${hit.connectionId}:${hit.table.fqName}`, {
        label: display,
        type: 'variable',
        detail: engineLabel(hit.engine),
        apply: hit.table.name,
      })
    }

    for (const tab of workTabs) {
      if (tab.type !== 'table' || !tab.schema) {
        continue
      }

      for (const column of tab.schema.columns) {
        const plainKey = `column:${column.name}`
        if (!completionMap.has(plainKey)) {
          completionMap.set(plainKey, {
            label: column.name,
            type: 'property',
            detail: `column (${tab.title})`,
            apply: column.name,
          })
        }

        const scoped = `${tab.table.name}.${column.name}`
        completionMap.set(`scoped:${tab.id}:${scoped}`, {
          label: scoped,
          type: 'property',
          detail: 'column',
          apply: scoped,
        })
      }
    }

    return Array.from(completionMap.values())
  }, [catalogHits, workTabs])

  const groupedCommandHits = useMemo(() => {
    const groups = new Map<
      string,
      { connectionId: string; heading: string; items: TableSearchHit[] }
    >()

    commandHits.forEach((hit) => {
      const existing = groups.get(hit.connectionId)
      if (existing) {
        existing.items.push(hit)
        return
      }

      groups.set(hit.connectionId, {
        connectionId: hit.connectionId,
        heading: hit.connectionName,
        items: [hit],
      })
    })

    const grouped = Array.from(groups.values())
    let displayIndex = 0

    return grouped.map((group) => ({
      ...group,
      items: group.items.map((hit) => {
        const indexed = { hit, displayIndex }
        displayIndex += 1
        return indexed
      }),
    }))
  }, [commandHits])

  const orderedCommandHits = useMemo(
    () => groupedCommandHits.flatMap((group) => group.items.map((item) => item.hit)),
    [groupedCommandHits],
  )

  const sqlCompletionSource = useMemo(() => {
    return (context: CompletionContext) => {
      const word = context.matchBefore(/[\w.]+/)
      if (!word && !context.explicit) {
        return null
      }

      const from = word ? word.from : context.pos
      const search = word?.text.toLowerCase() ?? ''
      const options =
        search.length === 0
          ? sqlCompletions
          : sqlCompletions.filter((item) => item.label.toLowerCase().includes(search))

      return {
        from,
        options: options.slice(0, 220),
      }
    }
  }, [sqlCompletions])

  const sqlEditorExtensions = useMemo(
    () => [
      sql(),
      autocompletion({
        override: [sqlCompletionSource],
        activateOnTyping: true,
      }),
      keymap.of([
        {
          key: 'Mod-/',
          run: (view) => {
            startCompletion(view)
            return true
          },
        },
      ]),
    ],
    [sqlCompletionSource],
  )

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY)
      if (!raw) {
        return
      }

      const parsed = JSON.parse(raw) as PersistedWorkspaceStorage
      const restored = restorePersistedWorkspaceStorage(parsed)

      environmentWorkspaceRef.current = restored.environments
      preferredEnvironmentIdRef.current = restored.lastEnvironmentId
    } catch {
      environmentWorkspaceRef.current = {}
      preferredEnvironmentIdRef.current = ''
    }
  }, [])

  useEffect(() => {
    void loadEnvironments()
  }, [])

  useEffect(() => {
    void checkForAppUpdate()
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const version = await pointerApi.getAppVersion()
        setAppVersion(version)
      } catch {
        setAppVersion('0.0.0')
      }
    })()
  }, [])

  useEffect(() => {
    const previousEnvironmentId = previousEnvironmentIdRef.current
    if (previousEnvironmentId) {
      environmentWorkspaceRef.current[previousEnvironmentId] = {
        workTabs: workTabsRef.current,
        activeTabId: activeTabIdRef.current,
        sqlTabCounter: sqlTabCounterRef.current,
        selectedSchema: selectedSchemaRef.current,
      }
    }

    if (!selectedEnvironmentId) {
      setConnections([])
      setSelectedConnectionId('')
      setSelectedSchema('all')
      setCatalogHits([])
      setCommandHits([])
      setWorkTabs([createSqlTab('sql:1', 'SQL 1')])
      setActiveTabId('sql:1')
      sqlTabCounterRef.current = 2
      setEditingCell(null)
      previousEnvironmentIdRef.current = ''
      return
    }

    setConnectionDraft(createConnectionDraft(selectedEnvironmentId))
    const snapshot = environmentWorkspaceRef.current[selectedEnvironmentId]
    if (snapshot) {
      setWorkTabs(snapshot.workTabs)
      setActiveTabId(snapshot.activeTabId)
      sqlTabCounterRef.current = Math.max(2, snapshot.sqlTabCounter)
      setSelectedSchema(snapshot.selectedSchema || 'all')
    } else {
      setSelectedSchema('all')
      setWorkTabs([createSqlTab('sql:1', 'SQL 1')])
      setActiveTabId('sql:1')
      sqlTabCounterRef.current = 2
    }
    setEditingCell(null)

    void loadConnections(selectedEnvironmentId)
    void loadEnvironmentCatalog(selectedEnvironmentId)
    previousEnvironmentIdRef.current = selectedEnvironmentId
  }, [selectedEnvironmentId])

  useEffect(() => {
    try {
      const snapshots: Record<string, EnvironmentWorkspaceSnapshot> = {
        ...environmentWorkspaceRef.current,
      }

      if (selectedEnvironmentId) {
        snapshots[selectedEnvironmentId] = {
          workTabs,
          activeTabId,
          sqlTabCounter: sqlTabCounterRef.current,
          selectedSchema,
        }
      }

      const storage = buildPersistedWorkspaceStorage(snapshots, selectedEnvironmentId)
      window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(storage))
    } catch {
      // best effort persistence
    }
  }, [activeTabId, selectedEnvironmentId, selectedSchema, workTabs])

  useEffect(() => {
    if (!isCommandOpen || !selectedEnvironmentId) {
      return
    }

    const timeout = setTimeout(() => {
      void searchTablesForCommand(selectedEnvironmentId, commandQuery)
    }, 180)

    return () => clearTimeout(timeout)
  }, [commandQuery, isCommandOpen, selectedEnvironmentId])

  useEffect(() => {
    if (!isCommandOpen || commandScopedTarget) {
      return
    }

    if (orderedCommandHits.length === 0) {
      setCommandIndex(0)
      return
    }

    setCommandIndex((current) => Math.max(0, Math.min(current, orderedCommandHits.length - 1)))
  }, [commandScopedTarget, isCommandOpen, orderedCommandHits.length])

  useEffect(() => {
    if (!isCommandOpen || commandScopedTarget) {
      return
    }

    setCommandIndex(0)
  }, [commandQuery, commandScopedTarget, isCommandOpen])

  useEffect(() => {
    if (!isCommandOpen || commandScopedTarget) {
      return
    }

    const activeItem = commandItemRefs.current[commandIndex]
    activeItem?.scrollIntoView({ block: 'nearest' })
  }, [commandIndex, commandScopedTarget, isCommandOpen, orderedCommandHits.length])

  useEffect(() => {
    if (selectedSchema === 'all') {
      return
    }

    if (!schemaOptions.includes(selectedSchema)) {
      setSelectedSchema('all')
    }
  }, [schemaOptions, selectedSchema])

  useEffect(() => {
    if (!isEnvironmentCommandOpen) {
      return
    }

    setEnvironmentCommandIndex(0)
  }, [environmentCommandQuery, isEnvironmentCommandOpen])

  useEffect(() => {
    if (!isEnvironmentCommandOpen) {
      return
    }

    if (environmentCommandResults.length === 0) {
      setEnvironmentCommandIndex(0)
      return
    }

    setEnvironmentCommandIndex((current) =>
      Math.max(0, Math.min(current, environmentCommandResults.length - 1)),
    )
  }, [environmentCommandResults, isEnvironmentCommandOpen])

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
  }, [resizingSqlTabId])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent): void => {
      const isModEnter =
        (event.metaKey || event.ctrlKey) &&
        (event.key === 'Enter' || event.code === 'Enter' || event.code === 'NumpadEnter')

      if (isModEnter) {
        const target = event.target instanceof HTMLElement ? event.target : null
        const isEditorEvent = Boolean(target?.closest('.cm-editor'))

        if (isEditorEvent && activeTabId.startsWith('sql:')) {
          event.preventDefault()
          event.stopPropagation()

          const cursorOffset = sqlCursorByTabRef.current[activeTabId]
          void runSqlRef.current?.(
            false,
            typeof cursorOffset === 'number' ? cursorOffset : undefined,
            undefined,
            activeTabId,
          )
        }

        return
      }

      const isDeleteKey =
        (event.key === 'Delete' || event.key === 'Backspace') && !event.metaKey && !event.ctrlKey && !event.altKey
      if (isDeleteKey) {
        const target = event.target instanceof HTMLElement ? event.target : null
        const isTypingTarget = Boolean(
          target?.closest('input, textarea, select, [contenteditable="true"], .cm-editor'),
        )
        if (isTypingTarget) {
          return
        }

        const activeTable = getTableTab(activeTabIdRef.current)
        if (activeTable?.schema?.supportsRowEdit && activeTable.selectedRowIndex !== null) {
          event.preventDefault()
          toggleSelectedRowDeleteRef.current?.()
        }
        return
      }

      if (
        (event.metaKey || event.ctrlKey) &&
        (event.key.toLowerCase() === 'k' || event.key.toLowerCase() === 'p')
      ) {
        event.preventDefault()
        setIsCommandOpen(true)
        return
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'r') {
        event.preventDefault()
        setIsEnvironmentCommandOpen(true)
        return
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 't') {
        event.preventDefault()
        openNewSqlTabRef.current?.()
        return
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'w') {
        event.preventDefault()
        event.stopPropagation()
        closeActiveTabRef.current?.()
        return
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()

        if (activeTabId.startsWith('sql:')) {
          void runSqlRef.current?.()
        } else {
          commitInlineEditRef.current?.()
          void saveActiveTableChangesRef.current?.()
        }
      }
    }

    window.addEventListener('keydown', handleShortcut, true)
    return () => window.removeEventListener('keydown', handleShortcut, true)
  }, [activeTabId])

  function getTableTab(tabId: string): TableTab | null {
    const tab = workTabsRef.current.find((candidate) => candidate.id === tabId)
    return tab?.type === 'table' ? tab : null
  }

  function getSqlTab(tabId: string): SqlTab | null {
    const tab = workTabsRef.current.find((candidate) => candidate.id === tabId)
    return tab?.type === 'sql' ? tab : null
  }

  function updateTableTab(tabId: string, updater: (tab: TableTab) => TableTab): void {
    setWorkTabs((current) =>
      current.map((tab) => {
        if (tab.id !== tabId || tab.type !== 'table') {
          return tab
        }

        return updater(tab)
      }),
    )
  }

  function updateSqlTab(tabId: string, updater: (tab: SqlTab) => SqlTab): void {
    setWorkTabs((current) =>
      current.map((tab) => {
        if (tab.id !== tabId || tab.type !== 'sql') {
          return tab
        }

        return updater(tab)
      }),
    )
  }

  async function loadEnvironments(): Promise<void> {
    try {
      const all = await pointerApi.listEnvironments()
      setEnvironments(all)

      if (all.length > 0) {
        setSelectedEnvironmentId((current) => {
          if (current && all.some((environment) => environment.id === current)) {
            return current
          }

          const preferred = preferredEnvironmentIdRef.current
          if (preferred && all.some((environment) => environment.id === preferred)) {
            return preferred
          }

          return all[0].id
        })
      } else {
        setSelectedEnvironmentId('')
      }
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  async function checkForAppUpdate(showToastWhenCurrent = false): Promise<void> {
    try {
      setIsCheckingAppUpdate(true)
      const info = await pointerApi.checkForAppUpdate()
      setAppUpdateInfo(info)

      if (showToastWhenCurrent && !info.hasUpdate) {
        toast.success(`Você já está na versão ${info.currentVersion}.`)
      }
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setIsCheckingAppUpdate(false)
    }
  }

  async function handleInstallAppUpdate(): Promise<void> {
    try {
      if (!appUpdateInfo?.hasUpdate) {
        toast.info('Nenhuma atualização disponível.')
        return
      }

      if (
        !window.confirm(
          `Atualizar da versão ${appUpdateInfo.currentVersion} para ${appUpdateInfo.latestVersion}? O app será reiniciado.`,
        )
      ) {
        return
      }

      setIsInstallingAppUpdate(true)
      const result = await pointerApi.installLatestUpdate()

      if (result.started) {
        toast.success(result.message)
        return
      }

      toast.info(result.message)
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setIsInstallingAppUpdate(false)
    }
  }

  async function loadConnections(environmentId: string): Promise<void> {
    try {
      const all = await pointerApi.listConnections(environmentId)
      setConnections(all)

      if (all.length > 0) {
        setSelectedConnectionId((current) => {
          if (current && all.some((connection) => connection.id === current)) {
            return current
          }

          return all[0].id
        })

        setWorkTabs((current) =>
          current.map((tab) => {
            if (tab.type !== 'sql') {
              return tab
            }

            if (all.some((connection) => connection.id === tab.connectionId)) {
              return tab
            }

            return {
              ...tab,
              connectionId: all[0].id,
            }
          }),
        )
      } else {
        setSelectedConnectionId('')
      }
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  async function loadEnvironmentCatalog(environmentId: string): Promise<void> {
    try {
      const hits = await pointerApi.searchTablesInEnvironment(environmentId, '')
      setCatalogHits(hits)
      setCommandHits(hits.slice(0, 220))
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  async function searchTablesForCommand(environmentId: string, query: string): Promise<void> {
    try {
      const hits = await pointerApi.searchTablesInEnvironment(environmentId, query.trim())
      setCommandHits(hits)

      if (!query.trim()) {
        setCatalogHits(hits)
      }
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  async function enterCommandScopedMode(hit: TableSearchHit): Promise<void> {
    try {
      setCommandScopedTarget(hit)
      setCommandScopedColumn('')
      setCommandScopedValue('')
      setCommandScopedSchema(null)

      const schema = await pointerApi.describeTable(hit.connectionId, hit.table)
      setCommandScopedSchema(schema)
      setCommandScopedColumn(schema.columns[0]?.name ?? '')

      window.requestAnimationFrame(() => {
        commandColumnInputRef.current?.focus()
      })
    } catch (error) {
      setCommandScopedTarget(null)
      setCommandScopedSchema(null)
      toast.error(getErrorMessage(error))
    }
  }

  function handleCommandInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (commandScopedTarget) {
      return
    }

    if (orderedCommandHits.length === 0) {
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      event.stopPropagation()
      setCommandIndex((current) => Math.max(0, Math.min(current + 1, orderedCommandHits.length - 1)))
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      event.stopPropagation()
      setCommandIndex((current) => Math.max(0, current - 1))
      return
    }

    if (event.key === 'Tab') {
      event.preventDefault()
      event.stopPropagation()
      const target = orderedCommandHits[commandIndex] ?? orderedCommandHits[0]
      if (target) {
        void enterCommandScopedMode(target)
      }
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      const target = orderedCommandHits[commandIndex] ?? orderedCommandHits[0]
      if (target) {
        setIsCommandOpen(false)
        void openTableTab(target)
      }
    }
  }

  async function applyCommandScopedFilter(): Promise<void> {
    if (!commandScopedTarget || !commandScopedSchema) {
      return
    }

    const resolvedColumn = resolveCommandScopedColumn(commandScopedSchema, commandScopedColumn)
    if (!resolvedColumn) {
      toast.error('Coluna inválida para filtro.')
      return
    }

    if (!commandScopedValue.trim()) {
      toast.error('Informe um valor para buscar.')
      return
    }

    setIsCommandOpen(false)
    void openTableTab(commandScopedTarget, {
      page: 0,
      filterColumn: resolvedColumn,
      filterOperator: 'ilike',
      filterValue: commandScopedValue.trim(),
    })
    setCommandScopedTarget(null)
    setCommandScopedSchema(null)
    setCommandScopedColumn('')
    setCommandScopedValue('')
  }

  async function handleCopyTableStructureSql(hit: TableSearchHit): Promise<void> {
    try {
      const schema = await pointerApi.describeTable(hit.connectionId, hit.table)
      const sql = buildCreateTableTemplateSql(hit.engine, schema)
      await pointerApi.copyToClipboard(sql)
      setTableContextMenu(null)
      toast.success('Estrutura da tabela copiada.')
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  async function handleCopyInsertTemplateSql(hit: TableSearchHit): Promise<void> {
    try {
      const schema = await pointerApi.describeTable(hit.connectionId, hit.table)
      const sql = buildInsertTemplateSql(hit.engine, schema)
      await pointerApi.copyToClipboard(sql)
      setTableContextMenu(null)
      toast.success('SQL de insert copiado.')
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  async function handleCreateEnvironment(): Promise<void> {
    try {
      const name = environmentNameDraft.trim()
      if (!name) {
        throw new Error('Informe o nome do ambiente.')
      }

      setIsEnvironmentSaving(true)
      const created = await pointerApi.createEnvironment(name, environmentColorDraft)

      setIsCreateEnvironmentOpen(false)
      setEnvironmentNameDraft('')
      setEnvironmentColorDraft(DEFAULT_ENVIRONMENT_COLOR)
      toast.success(`Ambiente ${created.name} criado.`)

      await loadEnvironments()
      setSelectedEnvironmentId(created.id)
      setConnectionDraft(createConnectionDraft(created.id))
      setIsCreateConnectionOpen(true)
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setIsEnvironmentSaving(false)
    }
  }

  function openEditEnvironmentDialog(): void {
    if (!selectedEnvironment) {
      return
    }

    setEnvironmentEditNameDraft(selectedEnvironment.name)
    setEnvironmentEditColorDraft(selectedEnvironment.color)
    setIsEditEnvironmentOpen(true)
  }

  async function handleUpdateEnvironment(): Promise<void> {
    if (!selectedEnvironment) {
      return
    }

    try {
      const name = environmentEditNameDraft.trim()
      if (!name) {
        throw new Error('Informe o nome do ambiente.')
      }

      setIsEnvironmentUpdating(true)
      const updated = await pointerApi.updateEnvironment(
        selectedEnvironment.id,
        name,
        environmentEditColorDraft,
      )

      setIsEditEnvironmentOpen(false)
      toast.success(`Ambiente ${updated.name} atualizado.`)
      await loadEnvironments()
      setSelectedEnvironmentId(updated.id)
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setIsEnvironmentUpdating(false)
    }
  }

  async function handleDeleteEnvironment(): Promise<void> {
    if (!selectedEnvironment) {
      return
    }

    if (!window.confirm(`Excluir ambiente "${selectedEnvironment.name}" e suas conexões?`)) {
      return
    }

    try {
      await pointerApi.deleteEnvironment(selectedEnvironment.id)
      toast.success('Ambiente removido.')
      await loadEnvironments()
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  async function handleCreateConnection(): Promise<void> {
    try {
      setIsConnectionSaving(true)
      const payload: ConnectionInput = {
        ...connectionDraft,
        environmentId: selectedEnvironmentId,
        name: connectionDraft.name.trim(),
        filePath: connectionDraft.filePath.trim(),
        host: connectionDraft.host.trim(),
        database: connectionDraft.database.trim(),
        user: connectionDraft.user.trim(),
      }

      if (!selectedEnvironmentId) {
        throw new Error('Selecione um ambiente antes de criar conexão.')
      }

      if (!payload.name) {
        throw new Error('Informe o nome da conexão.')
      }

      if (payload.engine === 'sqlite') {
        if (!payload.filePath) {
          throw new Error('Selecione o arquivo do banco SQLite.')
        }
      } else if (!payload.host || !payload.database || !payload.user) {
        throw new Error('Preencha os campos obrigatórios da conexão.')
      }

      const created = await pointerApi.createConnection(payload)
      toast.success(`Conexão ${created.name} criada.`)

      setIsCreateConnectionOpen(false)
      setConnectionDraft(createConnectionDraft(selectedEnvironmentId))

      await loadConnections(selectedEnvironmentId)
      await loadEnvironmentCatalog(selectedEnvironmentId)
      setSelectedConnectionId(created.id)
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setIsConnectionSaving(false)
    }
  }

  async function handleTestCreateConnection(): Promise<void> {
    if (!selectedEnvironmentId) {
      toast.error('Selecione um ambiente antes de testar a conexão.')
      return
    }

    try {
      setIsCreateConnectionTesting(true)
      const payload: ConnectionInput = {
        ...connectionDraft,
        environmentId: selectedEnvironmentId,
        name: connectionDraft.name.trim(),
        filePath: connectionDraft.filePath.trim(),
        host: connectionDraft.host.trim(),
        database: connectionDraft.database.trim(),
        user: connectionDraft.user.trim(),
      }

      const result = await pointerApi.testConnectionInput(payload)
      toast.success(`Conexão OK em ${result.latencyMs}ms`)
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setIsCreateConnectionTesting(false)
    }
  }

  function openEditConnectionDialog(connection: ConnectionSummary): void {
    setEditingConnectionId(connection.id)
    setConnectionEditDraft(createConnectionDraftFromConnection(connection))
    setIsEditConnectionOpen(true)
  }

  async function handleUpdateConnection(): Promise<void> {
    if (!editingConnectionId || !selectedEnvironmentId) {
      return
    }

    try {
      setIsConnectionUpdating(true)
      const payload: ConnectionInput = {
        ...connectionEditDraft,
        environmentId: selectedEnvironmentId,
        name: connectionEditDraft.name.trim(),
        filePath: connectionEditDraft.filePath.trim(),
        host: connectionEditDraft.host.trim(),
        database: connectionEditDraft.database.trim(),
        user: connectionEditDraft.user.trim(),
      }

      if (!payload.name) {
        throw new Error('Informe o nome da conexão.')
      }

      if (payload.engine === 'sqlite') {
        if (!payload.filePath) {
          throw new Error('Selecione o arquivo do banco SQLite.')
        }
      } else if (!payload.host || !payload.database || !payload.user) {
        throw new Error('Preencha os campos obrigatórios da conexão.')
      }

      const updated = await pointerApi.updateConnection(editingConnectionId, payload)
      toast.success(`Conexão ${updated.name} atualizada.`)
      setIsEditConnectionOpen(false)
      setEditingConnectionId('')
      setConnectionEditDraft(createConnectionDraft(selectedEnvironmentId))
      await loadConnections(selectedEnvironmentId)
      await loadEnvironmentCatalog(selectedEnvironmentId)
      setSelectedConnectionId(updated.id)
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setIsConnectionUpdating(false)
    }
  }

  async function handleTestEditConnection(): Promise<void> {
    if (!editingConnectionId || !selectedEnvironmentId) {
      return
    }

    try {
      setIsEditConnectionTesting(true)
      const payload: ConnectionInput = {
        ...connectionEditDraft,
        environmentId: selectedEnvironmentId,
        name: connectionEditDraft.name.trim(),
        filePath: connectionEditDraft.filePath.trim(),
        host: connectionEditDraft.host.trim(),
        database: connectionEditDraft.database.trim(),
        user: connectionEditDraft.user.trim(),
      }

      const result = await pointerApi.testConnectionInput(payload, editingConnectionId)
      toast.success(`Conexão OK em ${result.latencyMs}ms`)
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setIsEditConnectionTesting(false)
    }
  }

  async function handlePickSqliteFile(target: 'create' | 'edit'): Promise<void> {
    try {
      const selectedPath = await pointerApi.pickSqliteFile()
      if (!selectedPath) {
        return
      }

      if (target === 'create') {
        setConnectionDraft((current) => ({
          ...current,
          filePath: selectedPath,
          database: current.database || extractSqliteDatabaseName(selectedPath),
        }))
        return
      }

      setConnectionEditDraft((current) => ({
        ...current,
        filePath: selectedPath,
        database: current.database || extractSqliteDatabaseName(selectedPath),
      }))
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  async function handleDeleteConnection(connectionId: string): Promise<void> {
    if (!selectedEnvironmentId) {
      return
    }

    const target = connections.find((connection) => connection.id === connectionId) ?? null

    if (!target) {
      return
    }

    if (!window.confirm(`Remover a conexão "${target.name}"?`)) {
      return
    }

    try {
      await pointerApi.deleteConnection(target.id)
      toast.success('Conexão removida.')
      await loadConnections(selectedEnvironmentId)
      await loadEnvironmentCatalog(selectedEnvironmentId)
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  function selectEnvironmentFromCommand(environmentId: string): void {
    setSelectedEnvironmentId(environmentId)
    setIsEnvironmentCommandOpen(false)
    setEnvironmentCommandQuery('')
    setEnvironmentCommandIndex(0)
  }

  function handleEnvironmentCommandInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (environmentCommandResults.length === 0) {
      return
    }

    const keyCode = (event as React.KeyboardEvent<HTMLInputElement> & { which?: number; keyCode?: number }).keyCode
    const which = (event as React.KeyboardEvent<HTMLInputElement> & { which?: number; keyCode?: number }).which
    const isArrowDown = event.key === 'ArrowDown' || event.code === 'ArrowDown' || keyCode === 40 || which === 40
    const isArrowUp = event.key === 'ArrowUp' || event.code === 'ArrowUp' || keyCode === 38 || which === 38
    const isEnter = event.key === 'Enter' || event.code === 'Enter' || keyCode === 13 || which === 13

    if (isArrowDown) {
      event.preventDefault()
      setEnvironmentCommandIndex((current) =>
        Math.max(0, Math.min(current + 1, environmentCommandResults.length - 1)),
      )
      return
    }

    if (isArrowUp) {
      event.preventDefault()
      setEnvironmentCommandIndex((current) => Math.max(0, current - 1))
      return
    }

    if (isEnter) {
      event.preventDefault()
      const picked = environmentCommandResults[environmentCommandIndex] ?? environmentCommandResults[0]
      if (picked) {
        selectEnvironmentFromCommand(picked.id)
      }
    }
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

  const initializeTableTab = useCallback(async (tabId: string, hit: TableSearchHit, initialLoad?: TableReloadOverrides): Promise<void> => {
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
  }, [])

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
    const activeId = activeTabIdRef.current
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
      value: original === null || original === undefined ? '' : String(original),
    })
  }

  function commitInlineEdit(): void {
    if (!editingCell) {
      return
    }

    const tab = getTableTab(editingCell.tabId)

    if (!tab?.data) {
      setEditingCell(null)
      return
    }

    const row = tab.data.rows[editingCell.rowIndex]
    if (!row) {
      setEditingCell(null)
      return
    }

    const currentValue = row[editingCell.column]
    const baseRow = tab.baseRows?.[editingCell.rowIndex] ?? null
    const baseValue = baseRow ? baseRow[editingCell.column] : undefined
    const nextValue = coerceValueByOriginal(editingCell.value, currentValue)
    const hasChanged = !valuesEqual(currentValue, nextValue)

    if (!hasChanged) {
      setEditingCell(null)
      return
    }

    updateTableTab(editingCell.tabId, (current) => {
      if (!current.data) {
        return current
      }

      const nextRows = current.data.rows.map((currentRow, index) => {
        if (index !== editingCell.rowIndex) {
          return currentRow
        }

        return {
          ...currentRow,
          [editingCell.column]: nextValue,
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
          const rowPendingUpdate = { ...(nextPendingUpdates[editingCell.rowIndex] ?? {}) }

          if (valuesEqual(nextValue, baseValue)) {
            delete rowPendingUpdate[editingCell.column]
          } else {
            rowPendingUpdate[editingCell.column] = nextValue
          }

          if (Object.keys(rowPendingUpdate).length === 0) {
            delete nextPendingUpdates[editingCell.rowIndex]
          } else {
            nextPendingUpdates[editingCell.rowIndex] = rowPendingUpdate
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

  const shortcutLabel = navigator.platform.includes('Mac') ? '⌘K' : 'Ctrl+K'

  runSqlRef.current = runSql
  saveActiveTableChangesRef.current = saveActiveTableChanges
  commitInlineEditRef.current = commitInlineEdit
  toggleSelectedRowDeleteRef.current = handleDeleteRow
  openNewSqlTabRef.current = openNewSqlTab
  closeActiveTabRef.current = closeActiveTab

  return (
    <div className='h-screen w-screen overflow-hidden text-[13px] text-slate-100'>
      <div className='h-full w-full overflow-hidden border border-slate-800/70 bg-slate-950'>
        <div className='drag-region flex h-9 items-center justify-end border-b border-slate-800/70 bg-gradient-to-r from-slate-900/90 via-slate-900/70 to-slate-950/90 pl-24 pr-4'>
          <div className='no-drag flex items-center gap-2'>
            <span className='select-none text-[11px] tracking-wide text-slate-500'>v{appVersion}</span>
            <Button
              variant={appUpdateInfo?.hasUpdate ? 'default' : 'ghost'}
              size='sm'
              className='h-6 px-2 text-[11px]'
              onClick={() => {
                if (appUpdateInfo?.hasUpdate) {
                  void handleInstallAppUpdate()
                } else {
                  void checkForAppUpdate(true)
                }
              }}
              disabled={isCheckingAppUpdate || isInstallingAppUpdate}
            >
              {isInstallingAppUpdate
                ? 'Atualizando...'
                : isCheckingAppUpdate
                  ? 'Checando...'
                  : appUpdateInfo?.hasUpdate
                    ? `Upgrade ${appUpdateInfo.latestVersion}`
                    : 'Checar update'}
            </Button>
          </div>
        </div>

        <div className='no-drag flex h-[calc(100%-2.25rem)]'>
          <aside
            className={cn(
              'flex w-[292px] flex-col border-r border-slate-800/70 shadow-[inset_1px_0_0_rgba(30,41,59,0.8),inset_0_1px_0_rgba(30,41,59,0.8)]',
              environments.length === 0 && 'hidden',
            )}
            style={sidebarBackgroundStyle}
          >
            <div className='border-b border-slate-800/70 p-3.5'>
              <div className='mb-3 flex items-center justify-between'>
                <div className='flex items-center gap-2'>
                  <div className='flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-md border border-slate-700 bg-slate-800/70'>
                    <span className='h-2.5 w-2.5 rounded-full bg-slate-100' />
                  </div>
                  <div>
                    <p className='text-[19px] leading-none font-semibold tracking-tight'>Pointer</p>
                    <p className='text-[12px] text-slate-500'>Ambientes e Bancos</p>
                  </div>
                </div>
                <Badge variant='secondary'>{connections.length}</Badge>
              </div>

              <label className={SIDEBAR_SECTION_LABEL_CLASS}>
                AMBIENTE
              </label>
              <div className='flex gap-2'>
                <select
                  value={selectedEnvironmentId}
                  onChange={(event) => setSelectedEnvironmentId(event.target.value)}
                  className='h-8 w-full rounded-md border border-slate-700/90 bg-slate-900/90 px-2.5 text-[13px] outline-none ring-slate-300/45 focus:ring-2'
                >
                  <option value=''>Selecione um ambiente</option>
                  {environments.map((environment) => (
                    <option key={environment.id} value={environment.id}>
                      {environment.name}
                    </option>
                  ))}
                </select>
                <Dialog
                  open={isCreateEnvironmentOpen}
                  onOpenChange={(open) => {
                    setIsCreateEnvironmentOpen(open)
                    if (!open) {
                      setEnvironmentNameDraft('')
                      setEnvironmentColorDraft(DEFAULT_ENVIRONMENT_COLOR)
                    }
                  }}
                >
                  <DialogTrigger asChild>
                    <Button size='icon' className='h-8 w-8' variant='ghost'>
                      <Plus className='h-3.5 w-3.5' />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className='max-w-[510px]'>
                    <DialogHeader className='space-y-2'>
                      <DialogTitle>Novo ambiente</DialogTitle>
                      <DialogDescription>Exemplo: Local, Staging, Produção.</DialogDescription>
                    </DialogHeader>
                    <div className='mt-4 space-y-4'>
                      <Input
                        placeholder='Nome do ambiente'
                        value={environmentNameDraft}
                        onChange={(event) => setEnvironmentNameDraft(event.target.value)}
                      />
                      <div className='space-y-2'>
                        <label className='block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500'>
                          Cor do ambiente
                        </label>
                        <div className='flex items-center gap-2'>
                          {ENVIRONMENT_COLOR_PRESETS.map((color) => (
                            <button
                              key={color}
                              type='button'
                              className={cn(
                                'h-6 w-6 rounded-full border transition',
                                normalizeHexColor(environmentColorDraft) === color
                                  ? 'scale-105 border-slate-100 shadow-[0_0_0_2px_rgba(15,23,42,0.9)]'
                                  : 'border-slate-700 hover:border-slate-500',
                              )}
                              style={{ backgroundColor: color }}
                              onClick={() => setEnvironmentColorDraft(color)}
                            />
                          ))}
                          <Input
                            type='color'
                            className='h-8 w-10 cursor-pointer border-slate-700 bg-slate-900 p-1'
                            value={normalizeHexColor(environmentColorDraft)}
                            onChange={(event) => setEnvironmentColorDraft(event.target.value)}
                          />
                        </div>
                      </div>
                      <DialogFooter className='pt-1'>
                        <Button variant='secondary' onClick={() => setIsCreateEnvironmentOpen(false)}>
                          Cancelar
                        </Button>
                        <Button onClick={() => void handleCreateEnvironment()} disabled={isEnvironmentSaving}>
                          {isEnvironmentSaving ? 'Criando...' : 'Criar'}
                        </Button>
                      </DialogFooter>
                    </div>
                  </DialogContent>
                </Dialog>
                <Dialog
                  open={isEditEnvironmentOpen}
                  onOpenChange={(open) => {
                    setIsEditEnvironmentOpen(open)
                    if (!open) {
                      setEnvironmentEditNameDraft('')
                      setEnvironmentEditColorDraft(DEFAULT_ENVIRONMENT_COLOR)
                    }
                  }}
                >
                  <DialogTrigger asChild>
                    <Button
                      size='icon'
                      className='h-8 w-8'
                      variant='ghost'
                      onClick={openEditEnvironmentDialog}
                      disabled={!selectedEnvironmentId}
                    >
                      <Pencil className='h-3.5 w-3.5' />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className='max-w-[510px]'>
                    <DialogHeader className='space-y-2'>
                      <DialogTitle>Editar ambiente</DialogTitle>
                      <DialogDescription>Atualize nome e cor do ambiente selecionado.</DialogDescription>
                    </DialogHeader>
                    <div className='mt-4 space-y-4'>
                      <Input
                        placeholder='Nome do ambiente'
                        value={environmentEditNameDraft}
                        onChange={(event) => setEnvironmentEditNameDraft(event.target.value)}
                      />
                      <div className='space-y-2'>
                        <label className='block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500'>
                          Cor do ambiente
                        </label>
                        <div className='flex items-center gap-2'>
                          {ENVIRONMENT_COLOR_PRESETS.map((color) => (
                            <button
                              key={color}
                              type='button'
                              className={cn(
                                'h-6 w-6 rounded-full border transition',
                                normalizeHexColor(environmentEditColorDraft) === color
                                  ? 'scale-105 border-slate-100 shadow-[0_0_0_2px_rgba(15,23,42,0.9)]'
                                  : 'border-slate-700 hover:border-slate-500',
                              )}
                              style={{ backgroundColor: color }}
                              onClick={() => setEnvironmentEditColorDraft(color)}
                            />
                          ))}
                          <Input
                            type='color'
                            className='h-8 w-10 cursor-pointer border-slate-700 bg-slate-900 p-1'
                            value={normalizeHexColor(environmentEditColorDraft)}
                            onChange={(event) => setEnvironmentEditColorDraft(event.target.value)}
                          />
                        </div>
                      </div>
                      <DialogFooter className='pt-1'>
                        <Button variant='secondary' onClick={() => setIsEditEnvironmentOpen(false)}>
                          Cancelar
                        </Button>
                        <Button onClick={() => void handleUpdateEnvironment()} disabled={isEnvironmentUpdating}>
                          {isEnvironmentUpdating ? 'Salvando...' : 'Salvar'}
                        </Button>
                      </DialogFooter>
                    </div>
                  </DialogContent>
                </Dialog>
                <Button
                  size='icon'
                  className='h-8 w-8'
                  variant='ghost'
                  onClick={() => void handleDeleteEnvironment()}
                  disabled={!selectedEnvironmentId}
                >
                  <Trash2 className='h-3.5 w-3.5' />
                </Button>
              </div>

              <label className={cn(SIDEBAR_SECTION_LABEL_CLASS, 'mt-3')}>
                CONEXÕES
              </label>
              <div className='max-h-36 space-y-1.5 overflow-y-auto pr-1'>
                {connections.map((connection) => {
                  return (
                    <div
                      key={connection.id}
                      className='flex w-full items-center gap-2 rounded-md border border-slate-800/70 bg-slate-900/40 px-2 py-1.5 text-left text-[12.5px] text-slate-300 transition-colors hover:bg-slate-800/50'
                    >
                      <div className='flex min-w-0 flex-1 items-center gap-2'>
                        <Database className='h-3.5 w-3.5 shrink-0' />
                        <span className='truncate'>{connection.name}</span>
                        <span className='ml-auto rounded border border-slate-700/80 bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-300'>
                          {engineShortLabel(connection.engine)}
                        </span>
                      </div>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        className='h-7 w-7 shrink-0'
                        onClick={() => openEditConnectionDialog(connection)}
                      >
                        <Pencil className='h-3.5 w-3.5' />
                      </Button>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        className='h-7 w-7 shrink-0'
                        onClick={() => void handleDeleteConnection(connection.id)}
                      >
                        <Trash2 className='h-3.5 w-3.5' />
                      </Button>
                    </div>
                  )
                })}

                {connections.length === 0 && <p className='text-[12.5px] text-slate-500'>Nenhuma conexão criada.</p>}
              </div>

              <div className='mt-2.5 flex gap-2'>
                <Dialog
                  open={isCreateConnectionOpen}
                  onOpenChange={(open) => {
                    setIsCreateConnectionOpen(open)
                    if (!open) {
                      setIsCreateConnectionTesting(false)
                      setConnectionDraft(createConnectionDraft(selectedEnvironmentId))
                    }
                  }}
                >
                  <DialogTrigger asChild>
                    <Button className='h-8 flex-1 text-[13px]' size='sm' disabled={!selectedEnvironmentId}>
                      <Plus className='mr-1.5 h-3.5 w-3.5' /> Nova
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Nova conexão</DialogTitle>
                      <DialogDescription>
                        Adicione sua nova conexão com o banco de dados.
                      </DialogDescription>
                    </DialogHeader>

                    <div className='grid grid-cols-2 gap-3 py-2'>
                      <div className='col-span-2'>
                        <Input
                          placeholder='Nome da conexão'
                          value={connectionDraft.name}
                          onChange={(event) =>
                            setConnectionDraft((current) => ({ ...current, name: event.target.value }))
                          }
                        />
                      </div>
                      <select
                        className='h-9 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm outline-none ring-slate-300/45 focus:ring-2'
                        value={connectionDraft.engine}
                        onChange={(event) => {
                          const engine = event.target.value as DatabaseEngine
                          setConnectionDraft((current) => ({
                            ...current,
                            engine,
                            port: defaultPortByEngine(engine),
                            host: engine === 'sqlite' ? '' : current.host || 'localhost',
                            user: engine === 'sqlite' ? '' : current.user,
                            sslMode: engine === 'sqlite' ? 'disable' : current.sslMode,
                            password: engine === 'sqlite' ? '' : current.password,
                          }))
                        }}
                      >
                        <option value='postgres'>PostgreSQL</option>
                        <option value='clickhouse'>ClickHouse</option>
                        <option value='sqlite'>SQLite</option>
                      </select>
                      {connectionDraft.engine === 'sqlite' ? (
                        <div className='col-span-2 flex items-center gap-2'>
                          <Input
                            className='flex-1'
                            placeholder='Arquivo SQLite (.db, .sqlite, .sqlite3)'
                            value={connectionDraft.filePath}
                            onChange={(event) =>
                              setConnectionDraft((current) => ({ ...current, filePath: event.target.value }))
                            }
                          />
                          <Button
                            type='button'
                            variant='outline'
                            className='h-9 shrink-0'
                            onClick={() => void handlePickSqliteFile('create')}
                          >
                            <FolderOpen className='mr-1.5 h-3.5 w-3.5' />
                            Selecionar arquivo
                          </Button>
                        </div>
                      ) : (
                        <>
                          <select
                            className='h-9 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm outline-none ring-slate-300/45 focus:ring-2'
                            value={connectionDraft.sslMode}
                            onChange={(event) =>
                              setConnectionDraft((current) => ({
                                ...current,
                                sslMode: event.target.value as ConnectionInput['sslMode'],
                              }))
                            }
                          >
                            <option value='disable'>SSL desabilitado</option>
                            <option value='require'>SSL obrigatório</option>
                          </select>
                          <div className='col-span-2'>
                            <Input
                              placeholder='Host'
                              value={connectionDraft.host}
                              onChange={(event) =>
                                setConnectionDraft((current) => ({ ...current, host: event.target.value }))
                              }
                            />
                          </div>
                          <Input
                            placeholder='Porta'
                            type='number'
                            value={connectionDraft.port}
                            onChange={(event) =>
                              setConnectionDraft((current) => ({
                                ...current,
                                port: Number(event.target.value) || defaultPortByEngine(current.engine),
                              }))
                            }
                          />
                          <Input
                            placeholder={connectionDraft.engine === 'clickhouse' ? 'Database (ex: default)' : 'Database'}
                            value={connectionDraft.database}
                            onChange={(event) =>
                              setConnectionDraft((current) => ({ ...current, database: event.target.value }))
                            }
                          />
                          <Input
                            placeholder='Usuário'
                            value={connectionDraft.user}
                            onChange={(event) =>
                              setConnectionDraft((current) => ({ ...current, user: event.target.value }))
                            }
                          />
                          <Input
                            placeholder='Senha'
                            type='password'
                            value={connectionDraft.password}
                            onChange={(event) =>
                              setConnectionDraft((current) => ({ ...current, password: event.target.value }))
                            }
                          />
                        </>
                      )}
                    </div>

                    <DialogFooter>
                      <Button
                        variant='secondary'
                        className='h-9 w-[132px]'
                        onClick={() => setIsCreateConnectionOpen(false)}
                      >
                        Cancelar
                      </Button>
                      <Button
                        variant='outline'
                        className='h-9 w-[132px]'
                        onClick={() => void handleTestCreateConnection()}
                        disabled={isConnectionSaving || isCreateConnectionTesting}
                      >
                        {isCreateConnectionTesting ? 'Testando...' : 'Testar conexão'}
                      </Button>
                      <Button
                        className='h-9 w-[132px]'
                        onClick={() => void handleCreateConnection()}
                        disabled={isConnectionSaving || isCreateConnectionTesting}
                      >
                        {isConnectionSaving ? 'Salvando...' : 'Salvar conexão'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <Dialog
                  open={isEditConnectionOpen}
                  onOpenChange={(open) => {
                    setIsEditConnectionOpen(open)
                    if (!open) {
                      setIsEditConnectionTesting(false)
                      setEditingConnectionId('')
                      setConnectionEditDraft(createConnectionDraft(selectedEnvironmentId))
                    }
                  }}
                >
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Editar conexão</DialogTitle>
                      <DialogDescription>
                        Atualize os dados da conexão selecionada. A senha só muda se você preencher o campo.
                      </DialogDescription>
                    </DialogHeader>

                    <div className='grid grid-cols-2 gap-3 py-2'>
                      <div className='col-span-2'>
                        <Input
                          placeholder='Nome da conexão'
                          value={connectionEditDraft.name}
                          onChange={(event) =>
                            setConnectionEditDraft((current) => ({ ...current, name: event.target.value }))
                          }
                        />
                      </div>
                      <select
                        className='h-9 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm outline-none ring-slate-300/45 focus:ring-2'
                        value={connectionEditDraft.engine}
                        onChange={(event) => {
                          const engine = event.target.value as DatabaseEngine
                          setConnectionEditDraft((current) => ({
                            ...current,
                            engine,
                            port: defaultPortByEngine(engine),
                            host: engine === 'sqlite' ? '' : current.host || 'localhost',
                            user: engine === 'sqlite' ? '' : current.user,
                            sslMode: engine === 'sqlite' ? 'disable' : current.sslMode,
                            password: engine === 'sqlite' ? '' : current.password,
                          }))
                        }}
                      >
                        <option value='postgres'>PostgreSQL</option>
                        <option value='clickhouse'>ClickHouse</option>
                        <option value='sqlite'>SQLite</option>
                      </select>
                      {connectionEditDraft.engine === 'sqlite' ? (
                        <div className='col-span-2 flex items-center gap-2'>
                          <Input
                            className='flex-1'
                            placeholder='Arquivo SQLite (.db, .sqlite, .sqlite3)'
                            value={connectionEditDraft.filePath}
                            onChange={(event) =>
                              setConnectionEditDraft((current) => ({ ...current, filePath: event.target.value }))
                            }
                          />
                          <Button
                            type='button'
                            variant='outline'
                            className='h-9 shrink-0'
                            onClick={() => void handlePickSqliteFile('edit')}
                          >
                            <FolderOpen className='mr-1.5 h-3.5 w-3.5' />
                            Selecionar arquivo
                          </Button>
                        </div>
                      ) : (
                        <>
                          <select
                            className='h-9 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm outline-none ring-slate-300/45 focus:ring-2'
                            value={connectionEditDraft.sslMode}
                            onChange={(event) =>
                              setConnectionEditDraft((current) => ({
                                ...current,
                                sslMode: event.target.value as ConnectionInput['sslMode'],
                              }))
                            }
                          >
                            <option value='disable'>SSL desabilitado</option>
                            <option value='require'>SSL obrigatório</option>
                          </select>
                          <div className='col-span-2'>
                            <Input
                              placeholder='Host'
                              value={connectionEditDraft.host}
                              onChange={(event) =>
                                setConnectionEditDraft((current) => ({ ...current, host: event.target.value }))
                              }
                            />
                          </div>
                          <Input
                            placeholder='Porta'
                            type='number'
                            value={connectionEditDraft.port}
                            onChange={(event) =>
                              setConnectionEditDraft((current) => ({
                                ...current,
                                port: Number(event.target.value) || defaultPortByEngine(current.engine),
                              }))
                            }
                          />
                          <Input
                            placeholder={connectionEditDraft.engine === 'clickhouse' ? 'Database (ex: default)' : 'Database'}
                            value={connectionEditDraft.database}
                            onChange={(event) =>
                              setConnectionEditDraft((current) => ({ ...current, database: event.target.value }))
                            }
                          />
                          <Input
                            placeholder='Usuário'
                            value={connectionEditDraft.user}
                            onChange={(event) =>
                              setConnectionEditDraft((current) => ({ ...current, user: event.target.value }))
                            }
                          />
                          <Input
                            placeholder='Nova senha (opcional)'
                            type='password'
                            value={connectionEditDraft.password}
                            onChange={(event) =>
                              setConnectionEditDraft((current) => ({ ...current, password: event.target.value }))
                            }
                          />
                        </>
                      )}
                    </div>

                    <DialogFooter>
                      <Button
                        variant='secondary'
                        className='h-9 w-[132px]'
                        onClick={() => setIsEditConnectionOpen(false)}
                      >
                        Cancelar
                      </Button>
                      <Button
                        variant='outline'
                        className='h-9 w-[132px]'
                        onClick={() => void handleTestEditConnection()}
                        disabled={isConnectionUpdating || isEditConnectionTesting}
                      >
                        {isEditConnectionTesting ? 'Testando...' : 'Testar conexão'}
                      </Button>
                      <Button
                        className='h-9 w-[132px]'
                        onClick={() => void handleUpdateConnection()}
                        disabled={isConnectionUpdating || isEditConnectionTesting}
                      >
                        {isConnectionUpdating ? 'Salvando...' : 'Salvar conexão'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <div className='border-b border-slate-800/70 p-3'>
              <label className={SIDEBAR_SECTION_LABEL_CLASS}>
                SCHEMA
              </label>
              <select
                value={selectedSchema}
                onChange={(event) => setSelectedSchema(event.target.value)}
                className='h-8 w-full rounded-md border border-slate-700/90 bg-slate-900/90 px-2.5 text-[13px] outline-none ring-slate-300/45 focus:ring-2'
              >
                <option value='all'>Todos</option>
                {schemaOptions.map((schemaName) => (
                  <option key={schemaName} value={schemaName}>
                    {schemaName}
                  </option>
                ))}
              </select>
            </div>

            <div className='relative flex-1 overflow-hidden p-3'>
              <div className='mb-2.5 flex items-center gap-2 rounded-md border border-slate-700/90 bg-slate-900/85 px-2.5'>
                <Search className='h-3.5 w-3.5 text-slate-500' />
                <button
                  className='h-8 w-full text-left text-[13px] text-slate-400'
                  onClick={() => setIsCommandOpen(true)}
                  type='button'
                >
                  Buscar tabela... ({shortcutLabel})
                </button>
              </div>

              <div className='h-[calc(100%-3.25rem)] overflow-y-auto pr-1'>
                {filteredSidebarTables.map((hit) => {
                  const tabId = `table:${hit.connectionId}:${hit.table.fqName}`
                  const isOpen = activeTabId === tabId

                  return (
                    <button
                      key={`${hit.connectionId}:${hit.table.fqName}`}
                      className={cn(
                        'mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors',
                        isOpen ? 'bg-slate-200/12 text-slate-100' : 'text-slate-300 hover:bg-slate-800',
                      )}
                      onClick={() => {
                        setTableContextMenu(null)
                        void openTableTab(hit)
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        setTableContextMenu({
                          hit,
                          x: event.clientX,
                          y: event.clientY,
                        })
                      }}
                      type='button'
                    >
                      <Table2 className='h-3.5 w-3.5 shrink-0' />
                      <span className='truncate'>{formatSidebarTableName(hit.table)}</span>
                      <span className='ml-auto rounded border border-slate-700/80 bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-300'>
                        {engineShortLabel(hit.engine)}
                      </span>
                    </button>
                  )
                })}

                {filteredSidebarTables.length === 0 && (
                  <p className='text-[13px] text-slate-500'>Nenhuma tabela encontrada.</p>
                )}
              </div>
            </div>
          </aside>

          <main className='flex flex-1 flex-col overflow-hidden bg-slate-950'>
            {environments.length === 0 ? (
              <div className='flex flex-1 items-center justify-center p-8'>
                <div className='w-full max-w-xl rounded-xl border border-slate-800/70 bg-slate-900/40 p-6'>
                  <p className='text-[11px] uppercase tracking-[0.2em] text-slate-500'>Primeiros passos</p>
                  <h2 className='mt-2 text-xl font-semibold tracking-tight'>Configure seu primeiro ambiente</h2>
                  <p className='mt-2 text-sm text-slate-400'>
                    Crie um ambiente (ex: Local, Produção) e depois adicione conexões PostgreSQL, ClickHouse e/ou SQLite.
                  </p>
                  <div className='mt-5 flex flex-wrap items-center gap-2'>
                    <Button onClick={() => setIsCreateEnvironmentOpen(true)}>
                      <Plus className='mr-1.5 h-3.5 w-3.5' /> Criar ambiente
                    </Button>
                    <span className='text-xs text-slate-500'>Depois você poderá trocar com Cmd+R</span>
                  </div>
                  <div className='mt-6 rounded-lg border border-slate-800/70 bg-slate-950/60 p-4 text-xs text-slate-400'>
                    <p className='mb-1 font-medium text-slate-300'>Fluxo sugerido</p>
                    <p>1. Criar ambiente</p>
                    <p>2. Adicionar conexão Postgres/ClickHouse/SQLite</p>
                    <p>3. Usar Cmd+K para buscar tabelas no ambiente</p>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className='border-b border-slate-800/70 px-3 pt-1.5'>
                  <div className='flex items-center gap-2 pb-1.5'>
                    <div className='min-w-0 flex-1 overflow-x-auto'>
                      <div className='flex gap-1'>
                        {workTabs.map((tab) => {
                          const sqlTabsCount = workTabs.filter((item) => item.type === 'sql').length

                          return (
                            <button
                              key={tab.id}
                              type='button'
                              className={cn(
                                'flex items-center gap-2 rounded-md border px-2.5 py-1 text-[12px] whitespace-nowrap',
                                activeTabId === tab.id
                                  ? 'border-slate-300/35 bg-slate-200/10 text-slate-100'
                                  : 'border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800',
                              )}
                              onClick={() => setActiveTabId(tab.id)}
                              onDoubleClick={() => {
                                if (tab.type === 'sql') {
                                  openRenameSqlTabDialog(tab)
                                }
                              }}
                            >
                              {tab.type === 'sql' ? <Database className='h-3.5 w-3.5' /> : <Table2 className='h-3.5 w-3.5' />}
                              <span>{tab.title}</span>
                              {(tab.type === 'table' || (tab.type === 'sql' && sqlTabsCount > 1)) && (
                                <span
                                  role='button'
                                  tabIndex={0}
                                  className='rounded p-0.5 hover:bg-slate-700'
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    if (tab.type === 'table') {
                                      closeTableTab(tab.id)
                                    } else {
                                      closeSqlTab(tab.id)
                                    }
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                      event.preventDefault()
                                      if (tab.type === 'table') {
                                        closeTableTab(tab.id)
                                      } else {
                                        closeSqlTab(tab.id)
                                      }
                                    }
                                  }}
                                >
                                  <X className='h-3.5 w-3.5' />
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    {activeTableTab && (
                      <Button
                        variant='outline'
                        size='sm'
                        className='h-8 shrink-0 text-[13px]'
                        onClick={() => void saveActiveTableChanges()}
                      >
                        <Save className='mr-1.5 h-3.5 w-3.5' /> Salvar (Cmd+S)
                      </Button>
                    )}
                  </div>
                </div>

            <div className='flex-1 overflow-hidden p-3'>
              {activeSqlTab ? (
                <div className='flex h-full flex-col rounded-lg border border-slate-800/65 bg-[#0b1220]'>
                  <div className='flex items-center justify-between border-b border-slate-800/70 px-3 py-2.5'>
                    <div>
                      <h2 className='text-sm font-semibold'>{activeSqlTab.title}</h2>
                      <p className='text-[12px] text-slate-400'>
                        Executar escopo: Cmd+Enter • Autocomplete: Cmd+/ • Ambiente: Cmd+R • Nova aba SQL: Cmd+T
                      </p>
                    </div>
                    <div className='flex items-center gap-2'>
                      <select
                        value={activeSqlTab.connectionId}
                        onChange={(event) =>
                          updateSqlTab(activeSqlTab.id, (tab) => ({
                            ...tab,
                            connectionId: event.target.value,
                          }))
                        }
                        className='h-8 rounded-md border border-slate-700 bg-slate-900 px-2.5 text-[12px] outline-none ring-slate-300/45 focus:ring-2'
                      >
                        <option value=''>Selecione conexão</option>
                        {connections.map((connection) => (
                          <option key={connection.id} value={connection.id}>
                            {connection.name}
                          </option>
                        ))}
                      </select>
                      <Button
                        size='sm'
                        className='h-8 text-[13px]'
                        onClick={() => void runSql()}
                        disabled={activeSqlTab.sqlRunning || !activeSqlTab.connectionId}
                      >
                        <Play className='mr-1.5 h-3.5 w-3.5' /> {activeSqlTab.sqlRunning ? 'Executando...' : 'Executar'}
                      </Button>
                    </div>
                  </div>

                  <div ref={sqlSplitContainerRef} className='flex h-full flex-1 flex-col overflow-hidden'>
                    <div
                      className='min-h-[180px] border-b border-slate-800/80'
                      style={{ height: `${activeSqlTab.splitRatio}%` }}
                    >
                      <CodeMirror
                        value={activeSqlTab.sqlText}
                        height='100%'
                        theme={oneDark}
                        basicSetup={{
                          lineNumbers: true,
                          foldGutter: true,
                          highlightActiveLine: true,
                          autocompletion: true,
                        }}
                        extensions={sqlEditorExtensions}
                        onChange={(value) =>
                          updateSqlTab(activeSqlTab.id, (tab) => ({
                            ...tab,
                            sqlText: value,
                          }))
                        }
                        onUpdate={(update) => {
                          sqlCursorByTabRef.current[activeSqlTab.id] = update.state.selection.main.head
                        }}
                      />
                    </div>

                    <div
                      className='group flex h-2 cursor-row-resize items-center justify-center bg-slate-900/55'
                      onMouseDown={(event) => {
                        event.preventDefault()
                        setResizingSqlTabId(activeSqlTab.id)
                      }}
                    >
                      <div className='h-1 w-16 rounded-full bg-slate-700 transition-colors group-hover:bg-slate-300/55' />
                    </div>

                    <div className='flex-1 overflow-auto px-3 py-2'>
                      <div className='mb-2 flex items-center justify-between text-xs uppercase tracking-[0.15em] text-slate-500'>
                        <span>Resultado</span>
                        {activeSqlTab.sqlResult && (
                          <span className='text-[11px] text-slate-400 normal-case'>
                            {activeSqlTab.sqlResult.resultSets.length} result set(s) em {activeSqlTab.sqlResult.durationMs}ms
                          </span>
                        )}
                      </div>

                      {activeSqlTab.sqlResult ? (
                        <div className='space-y-3 pb-2'>
                          {activeSqlTab.sqlResult.resultSets.map((resultSet, index) => (
                            <div key={`${resultSet.command}-${index}`} className='rounded-md border border-slate-800/65 bg-slate-950/35'>
                              <div className='flex items-center justify-between border-b border-slate-800/80 px-3 py-1.5 text-xs text-slate-400'>
                                <span>{resultSet.command}</span>
                                <span>{resultSet.rowCount} linhas</span>
                              </div>
                              <div className='max-h-56 overflow-auto'>
                                <table className='w-full min-w-max text-xs'>
                                  <thead className='bg-slate-900'>
                                    <tr>
                                      {resultSet.fields.map((field) => (
                                        <th key={field} className='px-2 py-1 text-left font-semibold text-slate-300'>
                                          {field}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {resultSet.rows.slice(0, 300).map((row, rowIndex) => (
                                      <tr key={`${rowIndex}-${JSON.stringify(row)}`} className='border-t border-slate-800/70'>
                                        {resultSet.fields.map((field) => (
                                          <td key={`${field}-${rowIndex}`} className='px-2 py-1 text-slate-200 whitespace-nowrap'>
                                            {formatCell(row[field])}
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className='text-sm text-slate-500'>Execute uma query para ver o resultado.</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : activeTableTab ? (
                <div className='flex h-full flex-col rounded-lg border border-slate-800/65 bg-[#0b1220]'>
                  <div className='flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/70 px-3 py-2.5'>
                    <div>
                      <p className='text-[11px] uppercase tracking-[0.2em] text-slate-500'>Tabela atual</p>
                      <h2 className='text-sm font-semibold'>
                        {formatTableLabel(activeTableTab.table)}
                        <span className='ml-2 text-xs text-slate-400'>
                          ({activeTableTab.connectionName} • {engineLabel(activeTableTab.engine)})
                        </span>
                      </h2>
                    </div>
                    <div className='flex flex-wrap items-center gap-2'>
                      <div className='flex items-center gap-2'>
                        <select
                          className='h-8 rounded-md border border-slate-700 bg-slate-900 px-2.5 text-[13px] outline-none ring-slate-300/45 focus:ring-2'
                          value={activeTableTab.filterColumn}
                          onChange={(event) =>
                            updateTableTab(activeTableTab.id, (tab) => ({
                              ...tab,
                              filterColumn: event.target.value,
                              page: 0,
                            }))
                          }
                        >
                          {activeTableTab.schema?.columns.map((column) => (
                            <option key={column.name} value={column.name}>
                              {column.name}
                            </option>
                          ))}
                        </select>
                        <select
                          className='h-8 w-[112px] rounded-md border border-slate-700 bg-slate-900 px-2.5 pr-8 text-[13px] outline-none ring-slate-300/45 focus:ring-2'
                          value={activeTableTab.filterOperator}
                          onChange={(event) =>
                            updateTableTab(activeTableTab.id, (tab) => ({
                              ...tab,
                              filterOperator: event.target.value as TableFilterOperator,
                              page: 0,
                            }))
                          }
                        >
                          <option value='ilike'>ilike</option>
                          <option value='eq'>equal</option>
                        </select>
                        <Input
                          className='h-8 w-44 text-[13px]'
                          placeholder='Filtrar por valor'
                          value={activeTableTab.filterValue}
                          onChange={(event) =>
                            updateTableTab(activeTableTab.id, (tab) => ({
                              ...tab,
                              filterValue: event.target.value,
                              page: 0,
                            }))
                          }
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              void reloadTableTab(activeTableTab.id, {
                                page: 0,
                                filterColumn: activeTableTab.filterColumn,
                                filterOperator: activeTableTab.filterOperator,
                                filterValue: event.currentTarget.value,
                              })
                            }
                          }}
                        />
                        <Button
                          variant='outline'
                          size='sm'
                          className='h-8 text-[13px]'
                          onClick={() =>
                            void reloadTableTab(activeTableTab.id, {
                              page: 0,
                              filterColumn: activeTableTab.filterColumn,
                              filterOperator: activeTableTab.filterOperator,
                              filterValue: activeTableTab.filterValue,
                            })
                          }
                        >
                          Aplicar
                        </Button>
                      </div>
                      <Button
                        variant='outline'
                        size='sm'
                        className='h-8 text-[13px]'
                        onClick={() => void reloadTableTab(activeTableTab.id)}
                      >
                        <RefreshCw className='mr-1.5 h-3.5 w-3.5' /> Atualizar
                      </Button>
                      <Button variant='secondary' size='sm' className='h-8 text-[13px]' onClick={handleToggleInsertDraftRow}>
                        <Plus className='mr-1.5 h-3.5 w-3.5' /> {activeTableTab.insertDraft ? 'Cancelar insert' : 'Inserir'}
                      </Button>
                      <Button
                        variant='destructive'
                        size='sm'
                        className='h-8 text-[13px]'
                        disabled={!selectedRow || !activeTableTab.schema?.supportsRowEdit}
                        onClick={() => void handleDeleteRow()}
                      >
                        <Trash2 className='mr-1.5 h-3.5 w-3.5' /> Excluir
                      </Button>
                    </div>
                  </div>

                  <div className='flex-1 overflow-auto'>
                    {activeTableTab.loading && (
                      <div className='flex items-center gap-2 border-b border-slate-800/80 px-4 py-2 text-sm text-slate-400'>
                        <RefreshCw className='h-3.5 w-3.5 animate-spin' />
                        <span>Carregando...</span>
                      </div>
                    )}

                    <div className='h-full overflow-auto'>
                      <table className='min-w-max border-collapse text-sm'>
                        <thead className='sticky top-0 z-10 bg-slate-900'>
                          <tr>
                            {activeTableTab.schema?.columns.map((column) => (
                              <th
                                key={column.name}
                                className='border-b border-slate-800/80 px-3 py-2 text-left font-semibold text-slate-300 whitespace-nowrap'
                              >
                                <button
                                  type='button'
                                  className='flex items-center gap-1'
                                  onClick={() => {
                                    updateTableTab(activeTableTab.id, (tab) => {
                                      let nextSort: TableSort | undefined

                                      if (!tab.sort || tab.sort.column !== column.name) {
                                        nextSort = { column: column.name, direction: 'asc' }
                                      } else if (tab.sort.direction === 'asc') {
                                        nextSort = { column: column.name, direction: 'desc' }
                                      }

                                      return {
                                        ...tab,
                                        page: 0,
                                        sort: nextSort,
                                      }
                                    })

                                    let nextSort: TableSort | undefined
                                    if (!activeTableTab.sort || activeTableTab.sort.column !== column.name) {
                                      nextSort = { column: column.name, direction: 'asc' }
                                    } else if (activeTableTab.sort.direction === 'asc') {
                                      nextSort = { column: column.name, direction: 'desc' }
                                    }

                                    void reloadTableTab(activeTableTab.id, {
                                      page: 0,
                                      sort: nextSort,
                                    })
                                  }}
                                >
                                  <span>{column.name}</span>
                                  {activeTableTab.sort?.column === column.name && (
                                    <span className='text-slate-300'>
                                      {activeTableTab.sort.direction === 'asc' ? '↑' : '↓'}
                                    </span>
                                  )}
                                  {column.isPrimaryKey && <Badge className='ml-1'>PK</Badge>}
                                </button>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {activeTableTab.data?.rows.map((row, rowIndex) => {
                            const isSelected = activeTableTab.selectedRowIndex === rowIndex
                            const isPendingDelete = activeTableTab.pendingDeletes.includes(rowIndex)
                            const isPendingUpdate = Boolean(activeTableTab.pendingUpdates[rowIndex])

                            return (
                              <tr
                                key={`${rowIndex}-${JSON.stringify(row)}`}
                                className={cn(
                                  'border-b border-slate-800/70 transition-colors',
                                  isPendingDelete
                                    ? 'bg-red-500/22 hover:bg-red-500/28 shadow-[inset_0_0_0_1px_rgba(248,113,113,0.48)]'
                                    : isPendingUpdate
                                      ? 'bg-amber-400/20 hover:bg-amber-400/28 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.42)]'
                                      : isSelected
                                        ? 'bg-slate-200/10'
                                        : 'hover:bg-slate-800/50',
                                  isSelected && 'shadow-[inset_0_0_0_1px_rgba(148,163,184,0.45)]',
                                )}
                              >
                                {activeTableTab.schema?.columns.map((column) => {
                                const isEditing =
                                  editingCell?.tabId === activeTableTab.id &&
                                  editingCell.rowIndex === rowIndex &&
                                  editingCell.column === column.name

                                return (
                                  <td
                                    key={column.name}
                                    className={cn(
                                      'min-w-[190px] px-3 py-2 text-slate-200 whitespace-nowrap',
                                      isPendingDelete
                                        ? 'bg-red-500/20'
                                        : isPendingUpdate
                                          ? 'bg-amber-400/18'
                                          : '',
                                    )}
                                    onClick={() => {
                                      updateTableTab(activeTableTab.id, (tab) => ({
                                        ...tab,
                                        selectedRowIndex: rowIndex,
                                      }))

                                      if (
                                        !column.isPrimaryKey &&
                                        activeTableTab.schema?.supportsRowEdit &&
                                        !isPendingDelete
                                      ) {
                                        beginInlineEdit(rowIndex, column.name)
                                      }
                                    }}
                                  >
                                    {isEditing ? (
                                      <Input
                                        value={editingCell.value}
                                        autoFocus
                                        onChange={(event) =>
                                          setEditingCell((current) => {
                                            if (!current) {
                                              return null
                                            }

                                            return {
                                              ...current,
                                              value: event.target.value,
                                            }
                                          })
                                        }
                                        onBlur={commitInlineEdit}
                                        onKeyDown={(event) => {
                                          if (event.key === 'Enter') {
                                            event.preventDefault()
                                            commitInlineEdit()
                                          }

                                          if (event.key === 'Escape') {
                                            event.preventDefault()
                                            cancelInlineEdit()
                                          }
                                        }}
                                        className='h-8'
                                      />
                                    ) : (
                                      <span>{formatCell(row[column.name])}</span>
                                    )}
                                  </td>
                                )
                              })}
                              </tr>
                            )
                          })}
                          {activeTableTab.insertDraft && (
                            <tr className='border-b border-emerald-400/35 bg-emerald-500/10 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.35)]'>
                              {activeTableTab.schema?.columns.map((column) => (
                                <td key={`insert-${column.name}`} className='min-w-[190px] bg-emerald-500/10 px-2 py-1.5'>
                                  <Input
                                    value={formatDraftInputValue(activeTableTab.insertDraft?.[column.name])}
                                    placeholder={column.isPrimaryKey ? 'PK' : column.name}
                                    onChange={(event) => updateInsertDraftValue(column.name, event.target.value)}
                                    className='h-7 border-emerald-500/35 bg-slate-900/90 text-[12px] text-slate-100'
                                  />
                                </td>
                              ))}
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {(activeTableTab.data?.rows.length ?? 0) === 0 && !activeTableTab.loading && (
                      <div className='flex h-40 items-center justify-center text-sm text-slate-500'>
                        Nenhum registro encontrado.
                      </div>
                    )}
                  </div>

                  <div className='flex items-center justify-between border-t border-slate-800/80 p-3 text-sm text-slate-400'>
                    <p>
                      Página {activeTableTab.page + 1} • {activeTableTab.data?.total ?? 0} registros
                      {(Object.keys(activeTableTab.pendingUpdates).length > 0 ||
                        activeTableTab.pendingDeletes.length > 0 ||
                        Boolean(activeTableTab.insertDraft)) && (
                        <span className='ml-2 text-slate-300'>
                          • {Object.keys(activeTableTab.pendingUpdates).length} update(s) •{' '}
                          {activeTableTab.pendingDeletes.length} delete(s) • {activeTableTab.insertDraft ? 1 : 0} insert(s) pendente(s)
                        </span>
                      )}
                    </p>
                    <div className='flex items-center gap-1'>
                      <Button
                        size='icon'
                        variant='ghost'
                        onClick={() => {
                          const nextPage = Math.max(0, activeTableTab.page - 1)
                          updateTableTab(activeTableTab.id, (tab) => ({
                            ...tab,
                            page: nextPage,
                          }))

                          if (activeTableTab.page > 0) {
                            void reloadTableTab(activeTableTab.id, { page: nextPage })
                          }
                        }}
                        disabled={activeTableTab.page === 0}
                      >
                        <ChevronLeft className='h-4 w-4' />
                      </Button>
                      <Button
                        size='icon'
                        variant='ghost'
                        onClick={() => {
                          const nextPage = activeTableTab.page + 1
                          updateTableTab(activeTableTab.id, (tab) => ({
                            ...tab,
                            page: nextPage,
                          }))

                          if ((activeTableTab.data?.rows.length ?? 0) === PAGE_SIZE) {
                            void reloadTableTab(activeTableTab.id, { page: nextPage })
                          }
                        }}
                        disabled={(activeTableTab.data?.rows.length ?? 0) < PAGE_SIZE}
                      >
                        <ChevronRight className='h-4 w-4' />
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className='flex h-full items-center justify-center rounded-lg border border-dashed border-slate-800 bg-slate-900/30 text-slate-500'>
                  Aba não encontrada.
                </div>
              )}
            </div>
              </>
            )}
          </main>
        </div>
      </div>

      <DropdownMenu
        open={Boolean(tableContextMenu)}
        onOpenChange={(open) => {
          if (!open) {
            setTableContextMenu(null)
          }
        }}
      >
        <DropdownMenuTrigger asChild>
          <button
            type='button'
            aria-hidden
            tabIndex={-1}
            className='fixed h-0 w-0 opacity-0 pointer-events-none'
            style={{
              left: tableContextMenu?.x ?? -9999,
              top: tableContextMenu?.y ?? -9999,
            }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align='start'
          side='right'
          sideOffset={8}
          className='w-[238px]'
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <DropdownMenuLabel className='flex items-center gap-2'>
            <Table2 className='h-3.5 w-3.5 text-slate-400' />
            TABELA
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault()
              if (!tableContextMenu) {
                return
              }

              void handleCopyTableStructureSql(tableContextMenu.hit)
            }}
          >
            <FileCode2 className='h-3.5 w-3.5 text-slate-400' />
            Copiar estrutura da tabela
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault()
              if (!tableContextMenu) {
                return
              }

              void handleCopyInsertTemplateSql(tableContextMenu.hit)
            }}
          >
            <Copy className='h-3.5 w-3.5 text-slate-400' />
            Copiar SQL de Insert
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={isRenameSqlTabOpen}
        onOpenChange={(open) => {
          setIsRenameSqlTabOpen(open)
          if (!open) {
            setRenamingSqlTabId('')
            setSqlTabNameDraft('')
          }
        }}
      >
        <DialogContent className='max-w-md'>
          <DialogHeader>
            <DialogTitle>Renomear aba SQL</DialogTitle>
            <DialogDescription>Escolha um novo nome para a aba selecionada.</DialogDescription>
          </DialogHeader>
          <Input
            value={sqlTabNameDraft}
            onChange={(event) => setSqlTabNameDraft(event.target.value)}
            placeholder='Ex: Relatório de pedidos'
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                handleRenameSqlTab()
              }
            }}
          />
          <DialogFooter className='pt-2'>
            <Button variant='secondary' onClick={() => setIsRenameSqlTabOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleRenameSqlTab}>Salvar nome</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={sqlConfirmOpen}
        onOpenChange={(open) => {
          setSqlConfirmOpen(open)
          if (!open) {
            setSqlConfirmText('')
            setPendingSqlExecution(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2'>
              <AlertTriangle className='h-5 w-5 text-slate-300' />
              Confirmar execução de escrita
            </DialogTitle>
            <DialogDescription>
              Essa query pode alterar dados. Digite <strong>{SAFE_CONFIRM_WORD}</strong> para confirmar.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={sqlConfirmText}
            onChange={(event) => setSqlConfirmText(event.target.value)}
            placeholder={SAFE_CONFIRM_WORD}
          />
          <DialogFooter>
            <Button variant='secondary' onClick={() => setSqlConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant='destructive'
              onClick={() => {
                if (!pendingSqlExecution) {
                  return
                }

                void runSql(true, undefined, pendingSqlExecution.sql, pendingSqlExecution.tabId)
              }}
              disabled={sqlConfirmText.trim().toUpperCase() !== SAFE_CONFIRM_WORD}
            >
              Executar mesmo assim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isCommandOpen}
        onOpenChange={(open) => {
          setIsCommandOpen(open)
          if (!open) {
            setCommandQuery('')
            setCommandIndex(0)
            setCommandScopedTarget(null)
            setCommandScopedSchema(null)
            setCommandScopedColumn('')
            setCommandScopedValue('')
          }
        }}
      >
        <DialogContent className='max-w-xl overflow-hidden p-0'>
          <Command
            className='bg-slate-900 text-slate-100 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.12em] [&_[cmdk-group-heading]]:text-slate-500'
            shouldFilter={false}
          >
            <CommandInput
              value={commandQuery}
              onValueChange={setCommandQuery}
              placeholder={
                commandScopedTarget
                  ? `Filtro rápido em ${formatTableLabel(commandScopedTarget.table)}`
                  : 'Buscar tabela em todo o ambiente...'
              }
              onKeyDown={handleCommandInputKeyDown}
            />
            <CommandList className='max-h-[380px]'>
              {commandScopedTarget && (
                <div className='space-y-2 border-b border-slate-800 px-3 py-2.5'>
                  <p className='text-[11px] uppercase tracking-[0.16em] text-slate-500'>
                    Filtro rápido (Tab)
                  </p>
                  <p className='truncate text-xs text-slate-300'>{formatTableLabel(commandScopedTarget.table)}</p>
                  <div className='flex items-center gap-2'>
                    <select
                      ref={commandColumnInputRef}
                      value={commandScopedColumn}
                      onChange={(event) => setCommandScopedColumn(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === 'Tab') {
                          event.preventDefault()
                          commandValueInputRef.current?.focus()
                        }
                      }}
                      className='h-8 min-w-[220px] rounded-md border border-slate-700 bg-slate-900 px-2.5 pr-8 text-[13px] outline-none ring-slate-300/45 focus:ring-2'
                    >
                      {(commandScopedSchema?.columns ?? []).map((column) => (
                        <option key={column.name} value={column.name}>
                          {column.name}
                        </option>
                      ))}
                    </select>
                    <Input
                      ref={commandValueInputRef}
                      placeholder='Valor (ilike)'
                      value={commandScopedValue}
                      onChange={(event) => setCommandScopedValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          void applyCommandScopedFilter()
                        }
                      }}
                      className='h-8'
                    />
                    <Button size='sm' className='h-8' onClick={() => void applyCommandScopedFilter()}>
                      Aplicar
                    </Button>
                  </div>
                </div>
              )}
              <CommandEmpty>Nenhuma tabela encontrada.</CommandEmpty>
              {groupedCommandHits.map((group, groupIndex) => (
                <CommandGroup
                  key={group.connectionId}
                  heading={group.heading}
                  className={cn(groupIndex > 0 && 'mt-1 border-t border-slate-800 pt-2')}
                >
                  {group.items.map(({ hit, displayIndex }) => (
                    <CommandItem
                      key={`${hit.connectionId}:${hit.table.fqName}`}
                      ref={(node) => {
                        commandItemRefs.current[displayIndex] = node
                      }}
                      value={`${hit.connectionName} ${hit.table.fqName}`}
                      onSelect={() => {
                        setIsCommandOpen(false)
                        void openTableTab(hit)
                      }}
                      onMouseMove={() => setCommandIndex(displayIndex)}
                      data-manual-active={commandIndex === displayIndex ? 'true' : 'false'}
                      className={cn(
                        'cursor-pointer text-slate-300 data-[selected=true]:bg-transparent data-[selected=true]:text-slate-300 data-[selected=true]:shadow-none aria-selected:bg-transparent aria-selected:text-slate-300',
                        'data-[manual-active=true]:!bg-slate-700/55 data-[manual-active=true]:!text-slate-50 data-[manual-active=true]:shadow-[inset_0_0_0_1px_rgba(148,163,184,0.45)]',
                      )}
                    >
                      <Table2 className='h-4 w-4' />
                      <span className='truncate'>{formatTableLabel(hit.table)}</span>
                      <div className='ml-auto flex items-center gap-2'>
                        {commandIndex === displayIndex && (
                          <CommandShortcut className='ml-0 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.08em] text-slate-300'>
                            <kbd className='inline-flex h-5 min-w-6 items-center justify-center rounded border border-slate-600/70 bg-slate-800/80 px-1.5 text-[10px] font-semibold tracking-[0.02em] text-slate-100'>
                              Tab
                            </kbd>
                            <span className='text-slate-400'>filtrar</span>
                          </CommandShortcut>
                        )}
                        <span className='text-[10px] uppercase tracking-wide text-slate-400'>
                          {engineShortLabel(hit.engine)}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isEnvironmentCommandOpen}
        onOpenChange={(open) => {
          setIsEnvironmentCommandOpen(open)
          if (!open) {
            setEnvironmentCommandQuery('')
          }
        }}
      >
        <DialogContent className='max-w-md overflow-hidden p-0'>
          <Command className='bg-slate-900 text-slate-100' loop shouldFilter={false}>
            <CommandInput
              autoFocus
              value={environmentCommandQuery}
              onValueChange={setEnvironmentCommandQuery}
              placeholder='Trocar ambiente... (Cmd+R)'
              onKeyDown={handleEnvironmentCommandInputKeyDown}
            />
            <CommandList>
              <CommandEmpty>Nenhum ambiente encontrado.</CommandEmpty>
              <CommandGroup heading='Ambientes'>
              {environmentCommandResults.map((environment, index) => (
                <CommandItem
                  key={environment.id}
                  value={`${environment.name} ${index}`}
                  data-manual-active={environmentCommandIndex === index ? 'true' : 'false'}
                  onSelect={() => selectEnvironmentFromCommand(environment.id)}
                  onMouseEnter={() => setEnvironmentCommandIndex(index)}
                  onFocus={() => setEnvironmentCommandIndex(index)}
                  className={cn(
                    'cursor-pointer data-[selected=true]:bg-transparent data-[selected=true]:text-slate-300 data-[selected=true]:shadow-none aria-selected:bg-transparent aria-selected:text-slate-300',
                    'data-[manual-active=true]:!bg-slate-700/55 data-[manual-active=true]:!text-slate-50 data-[manual-active=true]:shadow-[inset_0_0_0_1px_rgba(148,163,184,0.45)]',
                    'text-slate-300',
                  )}
                >
                  <Database className='h-4 w-4' />
                  <span>{environment.name}</span>
                  {environment.id === selectedEnvironmentId && (
                    <Badge variant='secondary' className='ml-auto border-slate-500/40 bg-slate-100/10 text-slate-100'>
                      Ativo
                    </Badge>
                  )}
                </CommandItem>
              ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </div>
  )
}


export default App
