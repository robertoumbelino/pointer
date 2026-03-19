import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { sql } from '@codemirror/lang-sql'
import {
  autocompletion,
  type Completion,
  type CompletionContext,
  startCompletion,
} from '@codemirror/autocomplete'
import { EditorView, keymap } from '@codemirror/view'
import { toast } from 'sonner'
import type { AiConfig, AiProvider, ConnectionSummary, TableRef, TableSchema, TableSearchHit } from '../../shared/db-types'
import { useAppUpdate } from '../features/app-update/model/useAppUpdate'
import { AppTopBar } from '../features/app-update/ui/AppTopBar'
import { ChangelogDialog } from '../features/app-update/ui/ChangelogDialog'
import { useCommandPalette } from '../features/command-palette/model/useCommandPalette'
import { useCommandPaletteActions } from '../features/command-palette/model/useCommandPaletteActions'
import { AiConfigDialog, type AiConfigDialogMode } from '../features/command-palette/ui/AiConfigDialog'
import { TableCommandDialog } from '../features/command-palette/ui/TableCommandDialog'
import { useConnections } from '../features/connections/model/useConnections'
import { useEnvironments } from '../features/environments/model/useEnvironments'
import { useEnvironmentSwitcherActions } from '../features/environments/model/useEnvironmentSwitcherActions'
import { EnvironmentCreateDialog } from '../features/environments/ui/EnvironmentCreateDialog'
import { EnvironmentSidebar } from '../features/environments/ui/EnvironmentSidebar'
import { EnvironmentSwitcherDialog } from '../features/environments/ui/EnvironmentSwitcherDialog'
import { useWorkspace } from '../features/workspace/model/useWorkspace'
import { useSchemaSelectionGuard } from '../features/workspace/model/useSchemaSelectionGuard'
import { useWorkspaceActions } from '../features/workspace/model/useWorkspaceActions'
import { useWorkspaceShortcuts } from '../features/workspace/model/useWorkspaceShortcuts'
import { SqlAutoConnectionResolveDialog } from '../features/workspace/ui/SqlAutoConnectionResolveDialog'
import {
  TableStructureConnectionResolveDialog,
  type PendingTableStructureConnectionResolution,
  type TableStructureConnectionOption,
} from '../features/workspace/ui/TableStructureConnectionResolveDialog'
import { SqlRiskConfirmDialog } from '../features/workspace/ui/SqlRiskConfirmDialog'
import { SqlTabRenameDialog } from '../features/workspace/ui/SqlTabRenameDialog'
import { TableContextMenu } from '../features/workspace/ui/TableContextMenu'
import { TableStructureSheet, type TableStructureSheetTarget } from '../features/workspace/ui/TableStructureSheet'
import { WorkspaceEmptyState } from '../features/workspace/ui/WorkspaceEmptyState'
import { WorkspaceMain } from '../features/workspace/ui/WorkspaceMain'
import { pointerApi } from '../shared/api/pointer-api'
import { AUTO_SQL_CONNECTION_ID, DEFAULT_ENVIRONMENT_COLOR } from '../shared/constants/app'
import {
  engineLabel,
  engineShortLabel,
  extractFromJoinTableReferenceAtCursor,
  formatCell,
  formatDraftInputValue,
  formatTableLabel,
  getErrorMessage,
  hexToRgb,
  normalizeHexColor,
  type SqlFromTableReference,
} from '../shared/lib/workspace-utils'
import { useWorkbenchFlows } from './model/useWorkbenchFlows'
import { useWorkbenchPersistence } from './model/useWorkbenchPersistence'

const AI_PROVIDER = 'vercel-gateway' as const
const AI_MODEL = 'minimax/minimax-m2.1'

function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase()
}

function App(): JSX.Element {
  const {
    environments,
    setEnvironments,
    selectedEnvironmentId,
    setSelectedEnvironmentId,
    selectedEnvironment,
    isCreateEnvironmentOpen,
    setIsCreateEnvironmentOpen,
    environmentNameDraft,
    setEnvironmentNameDraft,
    environmentColorDraft,
    setEnvironmentColorDraft,
    isEnvironmentSaving,
    isEditEnvironmentOpen,
    setIsEditEnvironmentOpen,
    environmentEditNameDraft,
    setEnvironmentEditNameDraft,
    environmentEditColorDraft,
    setEnvironmentEditColorDraft,
    isEnvironmentUpdating,
    loadEnvironments,
    handleCreateEnvironment,
    openEditEnvironmentDialog,
    handleUpdateEnvironment,
    handleDeleteEnvironment,
  } = useEnvironments()

  const {
    connections,
    setConnections,
    setSelectedConnectionId,
    isCreateConnectionOpen,
    setIsCreateConnectionOpen,
    connectionDraft,
    setConnectionDraft,
    isConnectionSaving,
    isCreateConnectionTesting,
    setIsCreateConnectionTesting,
    isEditConnectionOpen,
    setIsEditConnectionOpen,
    setEditingConnectionId,
    connectionEditDraft,
    setConnectionEditDraft,
    isConnectionUpdating,
    isEditConnectionTesting,
    setIsEditConnectionTesting,
    isEditConnectionPasswordLoading,
    loadConnections,
    handleCreateConnection,
    handleTestCreateConnection,
    openEditConnectionDialog,
    handleUpdateConnection,
    handleTestEditConnection,
    handlePickSqliteFile,
    handleDeleteConnection,
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
    pendingSqlExecution,
    setPendingSqlExecution,
    sqlAutoConnectionResolveOpen,
    setSqlAutoConnectionResolveOpen,
    pendingAutoSqlConnectionResolution,
    setPendingAutoSqlConnectionResolution,
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
    sqlExecutionByTabRef,
    environmentWorkspaceRef,
    previousEnvironmentIdRef,
    preferredEnvironmentIdRef,
    runSqlRef,
    saveActiveTableChangesRef,
    commitInlineEditRef,
    toggleSelectedRowDeleteRef,
    copyTableSelectionRef,
    pasteIntoTableSelectionRef,
    openNewSqlTabRef,
    reloadTableTabRef,
    closeActiveTabRef,
    getTableTab,
    updateTableTab,
    updateSqlTab,
  } = useWorkspace()

  const {
    appUpdateInfo,
    isCheckingAppUpdate,
    isInstallingAppUpdate,
    appVersion,
    setAppVersion,
    changelogEntries,
    isChangelogOpen,
    setIsChangelogOpen,
    openChangelog,
    checkForAppUpdate,
    installLatestAppUpdate,
  } = useAppUpdate()

  const [currentView, setCurrentView] = useState<'home' | 'workspace'>('home')
  const [hasInitialEnvironmentLoad, setHasInitialEnvironmentLoad] = useState(false)
  const [aiConfig, setAiConfig] = useState<AiConfig | null>(null)
  const [isAiConfigOpen, setIsAiConfigOpen] = useState(false)
  const [aiConfigDialogMode, setAiConfigDialogMode] = useState<AiConfigDialogMode>('full')
  const [aiProviderDraft, setAiProviderDraft] = useState<AiProvider>(AI_PROVIDER)
  const [aiModelDraft, setAiModelDraft] = useState(AI_MODEL)
  const [aiApiKeyDraft, setAiApiKeyDraft] = useState('')
  const [isAiConfigSaving, setIsAiConfigSaving] = useState(false)
  const [pendingAiPrompt, setPendingAiPrompt] = useState('')
  const [isTableStructureSheetOpen, setIsTableStructureSheetOpen] = useState(false)
  const [isTableStructureLoading, setIsTableStructureLoading] = useState(false)
  const [tableStructureError, setTableStructureError] = useState<string | null>(null)
  const [tableStructureSchema, setTableStructureSchema] = useState<TableSchema | null>(null)
  const [tableStructureTarget, setTableStructureTarget] = useState<TableStructureSheetTarget | null>(null)
  const [isTableStructureResolveOpen, setIsTableStructureResolveOpen] = useState(false)
  const [pendingTableStructureResolution, setPendingTableStructureResolution] =
    useState<PendingTableStructureConnectionResolution | null>(null)

  const commandColumnInputRef = useRef<HTMLSelectElement | null>(null)
  const commandValueInputRef = useRef<HTMLInputElement | null>(null)
  const structureTablesByConnectionRef = useRef<Record<string, TableRef[]>>({})

  const loadAiConfig = useCallback(async (): Promise<AiConfig | null> => {
    try {
      const config = await pointerApi.getAiConfig()
      setAiConfig(config)
      setAiProviderDraft(config.provider)
      setAiModelDraft(config.model)
      return config
    } catch {
      setAiConfig(null)
      setAiProviderDraft(AI_PROVIDER)
      setAiModelDraft(AI_MODEL)
      return null
    }
  }, [])

  useEffect(() => {
    workTabsRef.current = workTabs
  }, [workTabs, workTabsRef])

  useEffect(() => {
    activeTabIdRef.current = activeTabId
  }, [activeTabId, activeTabIdRef])

  useEffect(() => {
    selectedSchemaRef.current = selectedSchema
  }, [selectedSchema, selectedSchemaRef])

  useEffect(() => {
    structureTablesByConnectionRef.current = {}
  }, [connections])

  useEffect(() => {
    if (currentView === 'workspace') {
      return
    }

    setIsTableStructureResolveOpen(false)
    setPendingTableStructureResolution(null)
    setIsTableStructureSheetOpen(false)
    setTableStructureError(null)
    setTableStructureSchema(null)
    setTableStructureTarget(null)
  }, [currentView])

  useEffect(() => {
    setIsTableStructureResolveOpen(false)
    setPendingTableStructureResolution(null)
    setIsTableStructureSheetOpen(false)
    setTableStructureError(null)
    setTableStructureSchema(null)
    setTableStructureTarget(null)
  }, [selectedEnvironmentId])

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

  useSchemaSelectionGuard({ selectedSchema, setSelectedSchema, schemaOptions })

  const filteredSidebarTables = useMemo(() => {
    if (selectedSchema === 'all') {
      return catalogHits
    }

    return catalogHits.filter((hit) => hit.table.schema === selectedSchema)
  }, [catalogHits, selectedSchema])

  const activeTableTab = useMemo(() => {
    const tab = workTabs.find((candidate) => candidate.id === activeTabId)
    return tab?.type === 'table' ? tab : null
  }, [activeTabId, workTabs])

  const activeSqlTab = useMemo(() => {
    const tab = workTabs.find((candidate) => candidate.id === activeTabId)
    return tab?.type === 'sql' ? tab : null
  }, [activeTabId, workTabs])

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
      EditorView.lineWrapping,
    ],
    [sqlCompletionSource],
  )

  const {
    loadEnvironmentsWithSelection,
    loadConnectionsWithSelection,
    loadEnvironmentCatalog,
    handleCreateEnvironmentFlow,
    handleUpdateEnvironmentFlow,
    handleDeleteEnvironmentFlow,
    handleCreateConnectionFlow,
    handleTestCreateConnectionFlow,
    handleUpdateConnectionFlow,
    handleTestEditConnectionFlow,
    handleDeleteConnectionFlow,
  } = useWorkbenchFlows({
    loadEnvironments,
    setEnvironments,
    setSelectedEnvironmentId,
    preferredEnvironmentIdRef,
    loadConnections,
    setConnections,
    setSelectedConnectionId,
    setWorkTabs,
    setCatalogHits,
    setCommandHits,
    selectedEnvironmentId,
    handleCreateEnvironment,
    handleUpdateEnvironment,
    handleDeleteEnvironment,
    setConnectionDraft,
    setIsCreateConnectionOpen,
    handleCreateConnection,
    handleTestCreateConnection,
    handleUpdateConnection,
    handleTestEditConnection,
    handleDeleteConnection,
  })

  useWorkbenchPersistence({
    selectedEnvironmentId,
    setConnections,
    setSelectedConnectionId,
    setSelectedSchema,
    setCatalogHits,
    setCommandHits,
    setWorkTabs,
    setActiveTabId,
    setEditingCell,
    setConnectionDraft,
    loadConnections: loadConnectionsWithSelection,
    loadEnvironmentCatalog,
    workTabs,
    activeTabId,
    selectedSchema,
    workTabsRef,
    activeTabIdRef,
    selectedSchemaRef,
    sqlTabCounterRef,
    environmentWorkspaceRef,
    previousEnvironmentIdRef,
    preferredEnvironmentIdRef,
  })

  useEffect(() => {
    let isMounted = true

    void (async () => {
      await loadEnvironmentsWithSelection()
      if (isMounted) {
        setHasInitialEnvironmentLoad(true)
      }
    })()

    return () => {
      isMounted = false
    }
  }, [loadEnvironmentsWithSelection])

  useEffect(() => {
    if (!hasInitialEnvironmentLoad) {
      return
    }

    setCurrentView(selectedEnvironmentId ? 'workspace' : 'home')
  }, [hasInitialEnvironmentLoad, selectedEnvironmentId])

  useEffect(() => {
    if (!selectedEnvironmentId) {
      setCurrentView('home')
    }
  }, [selectedEnvironmentId])

  useEffect(() => {
    void checkForAppUpdate()
  }, [checkForAppUpdate])

  useEffect(() => {
    void (async () => {
      try {
        const version = await pointerApi.getAppVersion()
        setAppVersion(version)
      } catch {
        setAppVersion('')
      }
    })()
  }, [setAppVersion])

  useEffect(() => {
    void loadAiConfig()
  }, [loadAiConfig])

  const {
    openNewSqlTab,
    loadSqlFileToNewTab,
    saveActiveSqlFile,
    openAiSqlTabWithPrompt,
    openRenameSqlTabDialog,
    handleRenameSqlTab,
    openTableTab,
    navigateToForeignKey,
    reloadTableTab,
    reorderWorkTabs,
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
    copyTableSelection,
    pasteIntoTableSelection,
    exportSqlResultSetVisibleCsv,
    exportTableCurrentPageCsv,
    exportTableAllPagesCsv,
    sendAiPromptToSqlTab,
    setAiDraftOnSqlTab,
    runSql,
    cancelSqlExecution,
  } = useWorkspaceActions({
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
    sqlExecutionByTabRef,
    workTabsRef,
    getTableTab,
    getSqlTab: (tabId) => {
      const tab = workTabsRef.current.find((candidate) => candidate.id === tabId)
      return tab?.type === 'sql' ? tab : null
    },
    setWorkTabs,
    updateTableTab,
    updateSqlTab,
  })

  const openTableStructureSheetByTarget = useCallback(async (target: TableStructureSheetTarget): Promise<void> => {
    setIsTableStructureSheetOpen(true)
    setIsTableStructureLoading(true)
    setTableStructureError(null)
    setTableStructureTarget(target)
    setTableStructureSchema(null)

    try {
      const schema = await pointerApi.describeTable(target.connectionId, target.table)
      setTableStructureSchema(schema)
    } catch (error) {
      const message = getErrorMessage(error)
      setTableStructureError(message)
      toast.error(message)
    } finally {
      setIsTableStructureLoading(false)
    }
  }, [])

  const listStructureTablesByConnection = useCallback(async (connectionId: string): Promise<TableRef[]> => {
    const cached = structureTablesByConnectionRef.current[connectionId]
    if (cached) {
      return cached
    }

    const tables = await pointerApi.listTables(connectionId)
    structureTablesByConnectionRef.current[connectionId] = tables
    return tables
  }, [])

  const resolveTableForConnection = useCallback(
    async (
      connection: ConnectionSummary,
      tableReference: SqlFromTableReference,
    ): Promise<TableRef | null | 'ambiguous'> => {
      const normalizedName = normalizeIdentifier(tableReference.name)
      const normalizedSchema = tableReference.schema ? normalizeIdentifier(tableReference.schema) : null
      const tables = await listStructureTablesByConnection(connection.id)

      const matches = tables.filter((table) => {
        if (normalizeIdentifier(table.name) !== normalizedName) {
          return false
        }

        if (!normalizedSchema) {
          return true
        }

        return normalizeIdentifier(table.schema) === normalizedSchema
      })

      if (matches.length === 0) {
        return null
      }

      if (!normalizedSchema && matches.length > 1) {
        return 'ambiguous'
      }

      return matches[0]
    },
    [listStructureTablesByConnection],
  )

  const handleOpenTableStructure = useCallback(
    async (hit: TableSearchHit): Promise<void> => {
      setTableContextMenu(null)
      await openTableStructureSheetByTarget({
        connectionId: hit.connectionId,
        connectionName: hit.connectionName,
        engine: hit.engine,
        table: hit.table,
      })
    },
    [openTableStructureSheetByTarget, setTableContextMenu],
  )

  const handleRequestSqlTableStructure = useCallback(
    async (params: {
      tabId: string
      connectionId: string
      sqlText: string
      cursorOffset: number
    }): Promise<void> => {
      const tableReference = extractFromJoinTableReferenceAtCursor(params.sqlText, params.cursorOffset)
      if (!tableReference) {
        return
      }

      if (!params.connectionId) {
        toast.error('Selecione uma conexão para abrir a estrutura da tabela.')
        return
      }

      if (params.connectionId !== AUTO_SQL_CONNECTION_ID) {
        const connection = connections.find((candidate) => candidate.id === params.connectionId)
        if (!connection) {
          toast.error('A conexão da aba SQL não está mais disponível.')
          return
        }

        const resolvedTable = await resolveTableForConnection(connection, tableReference)
        if (resolvedTable === 'ambiguous') {
          toast.error(
            `Tabela "${tableReference.name}" existe em múltiplos schemas na conexão "${connection.name}". Use schema.tabela no SQL.`,
          )
          return
        }

        if (!resolvedTable) {
          toast.error(`Tabela "${tableReference.fqName}" não foi encontrada na conexão "${connection.name}".`)
          return
        }

        await openTableStructureSheetByTarget({
          connectionId: connection.id,
          connectionName: connection.name,
          engine: connection.engine,
          table: resolvedTable,
        })
        return
      }

      if (connections.length === 0) {
        toast.error('Nenhuma conexão disponível para resolver a estrutura da tabela.')
        return
      }

      const options: TableStructureConnectionOption[] = []

      for (const connection of connections) {
        const resolvedTable = await resolveTableForConnection(connection, tableReference)
        if (resolvedTable === 'ambiguous') {
          toast.error(
            `Tabela "${tableReference.name}" existe em múltiplos schemas na conexão "${connection.name}". Use schema.tabela no SQL.`,
          )
          return
        }

        if (!resolvedTable) {
          continue
        }

        options.push({
          connectionId: connection.id,
          connectionName: connection.name,
          engine: connection.engine,
          table: resolvedTable,
        })
      }

      if (options.length === 0) {
        toast.error(`Nenhuma conexão encontrada para a tabela "${tableReference.fqName}".`)
        return
      }

      if (options.length === 1) {
        const option = options[0]
        await openTableStructureSheetByTarget({
          connectionId: option.connectionId,
          connectionName: option.connectionName,
          engine: option.engine,
          table: option.table,
        })
        return
      }

      setPendingTableStructureResolution({
        tableLabel: tableReference.fqName,
        options: options.sort((left, right) => left.connectionName.localeCompare(right.connectionName)),
      })
      setIsTableStructureResolveOpen(true)
    },
    [
      connections,
      openTableStructureSheetByTarget,
      resolveTableForConnection,
      setPendingTableStructureResolution,
      setIsTableStructureResolveOpen,
    ],
  )

  function handleOpenAiConfig(mode: AiConfigDialogMode = 'full'): void {
    setAiProviderDraft(aiConfig?.provider ?? AI_PROVIDER)
    setAiModelDraft(aiConfig?.model ?? AI_MODEL)
    setAiApiKeyDraft('')
    setAiConfigDialogMode(mode)
    setIsAiConfigOpen(true)
  }

  async function handleUseAiPrompt(prompt: string): Promise<void> {
    const normalizedPrompt = prompt.trim()
    if (!normalizedPrompt) {
      return
    }

    if (!aiConfig?.hasApiKey) {
      setPendingAiPrompt(normalizedPrompt)
      handleOpenAiConfig('full')
      return
    }

    await openAiSqlTabWithPrompt(normalizedPrompt)
  }

  async function handleSaveAiConfig(): Promise<void> {
    const apiKey = aiApiKeyDraft.trim()
    if (!aiConfig?.hasApiKey && !apiKey) {
      toast.error('Informe a chave do AI Gateway para continuar.')
      return
    }

    setIsAiConfigSaving(true)
    try {
      const configInput = {
        provider: aiProviderDraft,
        model: aiModelDraft.trim() || AI_MODEL,
        ...(apiKey ? { apiKey } : {}),
      }

      const config = await pointerApi.saveAiConfig(configInput)
      setAiConfig(config)
      setAiApiKeyDraft('')
      setIsAiConfigOpen(false)

      if (pendingAiPrompt) {
        const queuedPrompt = pendingAiPrompt
        setPendingAiPrompt('')
        await openAiSqlTabWithPrompt(queuedPrompt)
      }
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setIsAiConfigSaving(false)
    }
  }

  async function handleRemoveAiConfig(): Promise<void> {
    try {
      const config = await pointerApi.removeAiConfig()
      setAiConfig(config)
      setAiApiKeyDraft('')
      setPendingAiPrompt('')
      toast.success('Chave da IA removida deste app.')
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  const {
    commandActions,
    groupedCommandHits,
    handleCommandInputKeyDown,
    applyCommandScopedFilter,
    selectCommandAction,
    handleCopyTableStructureSql,
    handleCopyInsertTemplateSql,
  } = useCommandPaletteActions({
    selectedEnvironmentId,
    commandHits,
    setCommandHits,
    setCatalogHits,
    isCommandOpen,
    setIsCommandOpen,
    commandQuery,
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
    commandColumnInputRef,
    setTableContextMenu,
    openTableTab,
    openChangelog,
    checkForAppUpdate,
    onExitWorkspace: handleExitWorkspace,
    onOpenAiConfig: handleOpenAiConfig,
    onRemoveAiConfig: handleRemoveAiConfig,
    onUseAiPrompt: handleUseAiPrompt,
    aiConfig,
  })

  const {
    environmentCommandResults,
    selectEnvironmentFromCommand,
    handleEnvironmentCommandInputKeyDown,
  } = useEnvironmentSwitcherActions({
    environments,
    environmentCommandQuery,
    setEnvironmentCommandQuery,
    environmentCommandIndex,
    setEnvironmentCommandIndex,
    isEnvironmentCommandOpen,
    setIsEnvironmentCommandOpen,
    setSelectedEnvironmentId,
    onEnterWorkspace: () => setCurrentView('workspace'),
  })

  function handleEnterEnvironment(environmentId: string): void {
    setSelectedEnvironmentId(environmentId)
    setCurrentView('workspace')
  }

  function handleExitWorkspace(): void {
    setIsCommandOpen(false)
    setTableContextMenu(null)
    setCurrentView('home')
  }

  runSqlRef.current = runSql
  saveActiveTableChangesRef.current = saveActiveTableChanges
  commitInlineEditRef.current = commitInlineEdit
  toggleSelectedRowDeleteRef.current = handleDeleteRow
  copyTableSelectionRef.current = copyTableSelection
  pasteIntoTableSelectionRef.current = pasteIntoTableSelection
  openNewSqlTabRef.current = openNewSqlTab
  reloadTableTabRef.current = reloadTableTab
  closeActiveTabRef.current = closeActiveTab

  useWorkspaceShortcuts({
    isWorkspaceActive: currentView === 'workspace',
    activeTabId,
    setActiveTabId,
    setIsCommandOpen,
    setIsEnvironmentCommandOpen,
    runSqlRef,
    saveActiveTableChangesRef,
    commitInlineEditRef,
    toggleSelectedRowDeleteRef,
    copyTableSelectionRef,
    pasteIntoTableSelectionRef,
    openNewSqlTabRef,
    reloadTableTabRef,
    closeActiveTabRef,
    activeTabIdRef,
    workTabsRef,
    sqlCursorByTabRef,
    getTableTab,
  })

  const shortcutLabel = navigator.platform.includes('Mac') ? '⌘K' : 'Ctrl+K'

  return (
    <div className='flex h-screen w-screen flex-col overflow-hidden bg-slate-950 text-[13px] text-slate-100'>
      <AppTopBar
        appVersion={appVersion}
        appUpdateInfo={appUpdateInfo}
        isCheckingAppUpdate={isCheckingAppUpdate}
        isInstallingAppUpdate={isInstallingAppUpdate}
        onOpenChangelog={openChangelog}
        onCheckForUpdate={checkForAppUpdate}
        onInstallUpdate={installLatestAppUpdate}
      />

      {currentView === 'home' ? (
        <>
          <WorkspaceEmptyState
            onCreateEnvironment={() => {
              setIsCreateEnvironmentOpen(true)
            }}
            environments={environments}
            selectedEnvironmentId={selectedEnvironmentId}
            onEnterEnvironment={handleEnterEnvironment}
          />
          <EnvironmentCreateDialog
            isCreateEnvironmentOpen={isCreateEnvironmentOpen}
            setIsCreateEnvironmentOpen={setIsCreateEnvironmentOpen}
            environmentNameDraft={environmentNameDraft}
            setEnvironmentNameDraft={setEnvironmentNameDraft}
            environmentColorDraft={environmentColorDraft}
            setEnvironmentColorDraft={setEnvironmentColorDraft}
            isEnvironmentSaving={isEnvironmentSaving}
            handleCreateEnvironment={handleCreateEnvironmentFlow}
          />
        </>
      ) : (
        <div className='no-drag flex min-h-0 flex-1 gap-3 overflow-hidden p-3'>
          <EnvironmentSidebar
            environments={environments}
            connections={connections}
            sidebarBackgroundStyle={sidebarBackgroundStyle}
            selectedEnvironmentId={selectedEnvironmentId}
            setSelectedEnvironmentId={setSelectedEnvironmentId}
            isCreateEnvironmentOpen={isCreateEnvironmentOpen}
            setIsCreateEnvironmentOpen={setIsCreateEnvironmentOpen}
            environmentNameDraft={environmentNameDraft}
            setEnvironmentNameDraft={setEnvironmentNameDraft}
            environmentColorDraft={environmentColorDraft}
            setEnvironmentColorDraft={setEnvironmentColorDraft}
            isEnvironmentSaving={isEnvironmentSaving}
            isEditEnvironmentOpen={isEditEnvironmentOpen}
            setIsEditEnvironmentOpen={setIsEditEnvironmentOpen}
            environmentEditNameDraft={environmentEditNameDraft}
            setEnvironmentEditNameDraft={setEnvironmentEditNameDraft}
            environmentEditColorDraft={environmentEditColorDraft}
            setEnvironmentEditColorDraft={setEnvironmentEditColorDraft}
            isEnvironmentUpdating={isEnvironmentUpdating}
            handleCreateEnvironment={handleCreateEnvironmentFlow}
            openEditEnvironmentDialog={openEditEnvironmentDialog}
            handleUpdateEnvironment={handleUpdateEnvironmentFlow}
            handleDeleteEnvironment={handleDeleteEnvironmentFlow}
            onExitWorkspace={handleExitWorkspace}
            openEditConnectionDialog={openEditConnectionDialog}
            handleDeleteConnection={handleDeleteConnectionFlow}
            isCreateConnectionOpen={isCreateConnectionOpen}
            setIsCreateConnectionOpen={setIsCreateConnectionOpen}
            connectionDraft={connectionDraft}
            setConnectionDraft={setConnectionDraft}
            isConnectionSaving={isConnectionSaving}
            isCreateConnectionTesting={isCreateConnectionTesting}
            setIsCreateConnectionTesting={setIsCreateConnectionTesting}
            isEditConnectionOpen={isEditConnectionOpen}
            setIsEditConnectionOpen={setIsEditConnectionOpen}
            setEditingConnectionId={setEditingConnectionId}
            connectionEditDraft={connectionEditDraft}
            setConnectionEditDraft={setConnectionEditDraft}
            isConnectionUpdating={isConnectionUpdating}
            isEditConnectionTesting={isEditConnectionTesting}
            setIsEditConnectionTesting={setIsEditConnectionTesting}
            isEditConnectionPasswordLoading={isEditConnectionPasswordLoading}
            handleTestCreateConnection={handleTestCreateConnectionFlow}
            handleCreateConnection={handleCreateConnectionFlow}
            handlePickSqliteFile={handlePickSqliteFile}
            handleTestEditConnection={handleTestEditConnectionFlow}
            handleUpdateConnection={handleUpdateConnectionFlow}
            selectedSchema={selectedSchema}
            setSelectedSchema={setSelectedSchema}
            schemaOptions={schemaOptions}
            shortcutLabel={shortcutLabel}
            setIsCommandOpen={setIsCommandOpen}
            filteredSidebarTables={filteredSidebarTables}
            activeTabId={activeTabId}
            setTableContextMenu={setTableContextMenu}
            openTableTab={openTableTab}
          />

          <WorkspaceMain
            environments={environments}
            setIsCreateEnvironmentOpen={setIsCreateEnvironmentOpen}
            workTabs={workTabs}
            activeTabId={activeTabId}
            setActiveTabId={setActiveTabId}
            openRenameSqlTabDialog={openRenameSqlTabDialog}
            reorderWorkTabs={reorderWorkTabs}
            closeTableTab={closeTableTab}
            closeSqlTab={closeSqlTab}
            activeTableTab={activeTableTab}
            saveActiveTableChanges={saveActiveTableChanges}
            isSavingTableChanges={isSavingTableChanges}
            activeSqlTab={activeSqlTab}
            updateSqlTab={updateSqlTab}
            connections={connections}
            loadSqlFileToNewTab={loadSqlFileToNewTab}
            saveActiveSqlFile={saveActiveSqlFile}
            runSql={() => runSql()}
            cancelSqlExecution={() => cancelSqlExecution()}
            sqlSplitContainerRef={sqlSplitContainerRef}
            sqlEditorExtensions={sqlEditorExtensions}
            sqlCursorByTabRef={sqlCursorByTabRef}
            setResizingSqlTabId={setResizingSqlTabId}
            reloadTableTab={reloadTableTab}
            navigateToForeignKey={navigateToForeignKey}
            handleToggleInsertDraftRow={handleToggleInsertDraftRow}
            handleDeleteRow={handleDeleteRow}
            updateTableTab={updateTableTab}
            beginInlineEdit={beginInlineEdit}
            editingCell={editingCell}
            setEditingCell={setEditingCell}
            commitInlineEdit={commitInlineEdit}
            cancelInlineEdit={cancelInlineEdit}
            updateInsertDraftValue={updateInsertDraftValue}
            formatDraftInputValue={formatDraftInputValue}
            formatCell={formatCell}
            formatTableLabel={formatTableLabel}
            engineLabel={engineLabel}
            exportSqlResultSetVisibleCsv={exportSqlResultSetVisibleCsv}
            exportTableCurrentPageCsv={exportTableCurrentPageCsv}
            exportTableAllPagesCsv={exportTableAllPagesCsv}
            sendAiPromptToSqlTab={sendAiPromptToSqlTab}
            setAiDraftOnSqlTab={setAiDraftOnSqlTab}
            onRequestSqlTableStructure={handleRequestSqlTableStructure}
          />
        </div>
      )}

      <TableContextMenu
        tableContextMenu={tableContextMenu}
        setTableContextMenu={setTableContextMenu}
        onViewStructure={handleOpenTableStructure}
        onCopyStructureSql={handleCopyTableStructureSql}
        onCopyInsertSql={handleCopyInsertTemplateSql}
      />

      {currentView === 'workspace' && (
        <TableStructureSheet
          isOpen={isTableStructureSheetOpen}
          isLoading={isTableStructureLoading}
          error={tableStructureError}
          schema={tableStructureSchema}
          target={tableStructureTarget}
          onClose={() => setIsTableStructureSheetOpen(false)}
        />
      )}

      <ChangelogDialog
        isOpen={isChangelogOpen}
        onOpenChange={setIsChangelogOpen}
        appVersion={appVersion}
        entries={changelogEntries}
      />

      <SqlTabRenameDialog
        isOpen={isRenameSqlTabOpen}
        onOpenChange={(open) => {
          setIsRenameSqlTabOpen(open)
          if (!open) {
            setRenamingSqlTabId('')
            setSqlTabNameDraft('')
          }
        }}
        sqlTabNameDraft={sqlTabNameDraft}
        setSqlTabNameDraft={setSqlTabNameDraft}
        onConfirmRename={handleRenameSqlTab}
      />

      <SqlRiskConfirmDialog
        isOpen={sqlConfirmOpen}
        onOpenChange={setSqlConfirmOpen}
        pendingSqlExecution={pendingSqlExecution}
        setPendingSqlExecution={setPendingSqlExecution}
        onForceRunSql={async (tabId, sqlText, connectionId) => {
          await runSql(true, undefined, sqlText, tabId, connectionId)
        }}
      />

      <SqlAutoConnectionResolveDialog
        isOpen={sqlAutoConnectionResolveOpen}
        onOpenChange={setSqlAutoConnectionResolveOpen}
        pendingResolution={pendingAutoSqlConnectionResolution}
        setPendingResolution={setPendingAutoSqlConnectionResolution}
        connections={connections}
        onRunSqlWithConnection={async (tabId, sqlText, connectionId) => {
          await runSql(false, undefined, sqlText, tabId, connectionId)
        }}
      />

      <TableStructureConnectionResolveDialog
        isOpen={isTableStructureResolveOpen}
        onOpenChange={setIsTableStructureResolveOpen}
        pendingResolution={pendingTableStructureResolution}
        setPendingResolution={setPendingTableStructureResolution}
        onSelectOption={async (option) => {
          await openTableStructureSheetByTarget({
            connectionId: option.connectionId,
            connectionName: option.connectionName,
            engine: option.engine,
            table: option.table,
          })
        }}
      />

      <TableCommandDialog
        isOpen={isCommandOpen}
        onOpenChange={setIsCommandOpen}
        commandQuery={commandQuery}
        setCommandQuery={setCommandQuery}
        commandScopedTarget={commandScopedTarget}
        setCommandScopedTarget={setCommandScopedTarget}
        commandScopedSchema={commandScopedSchema}
        setCommandScopedSchema={setCommandScopedSchema}
        commandScopedColumn={commandScopedColumn}
        setCommandScopedColumn={setCommandScopedColumn}
        commandScopedValue={commandScopedValue}
        setCommandScopedValue={setCommandScopedValue}
        handleCommandInputKeyDown={handleCommandInputKeyDown}
        commandColumnInputRef={commandColumnInputRef}
        commandValueInputRef={commandValueInputRef}
        applyCommandScopedFilter={applyCommandScopedFilter}
        commandActions={commandActions}
        selectCommandAction={selectCommandAction}
        groupedCommandHits={groupedCommandHits}
        commandItemRefs={commandItemRefs}
        commandIndex={commandIndex}
        setCommandIndex={setCommandIndex}
        openTableTab={openTableTab}
        engineShortLabel={engineShortLabel}
      />

      <AiConfigDialog
        isOpen={isAiConfigOpen}
        onOpenChange={(open) => {
          setIsAiConfigOpen(open)
          if (!open) {
            setAiApiKeyDraft('')
            setPendingAiPrompt('')
          }
        }}
        mode={aiConfigDialogMode}
        onRequestFullConfig={() => setAiConfigDialogMode('full')}
        aiConfig={aiConfig}
        aiProviderDraft={aiProviderDraft}
        setAiProviderDraft={setAiProviderDraft}
        aiModelDraft={aiModelDraft}
        setAiModelDraft={setAiModelDraft}
        aiApiKeyDraft={aiApiKeyDraft}
        setAiApiKeyDraft={setAiApiKeyDraft}
        isSaving={isAiConfigSaving}
        onSave={handleSaveAiConfig}
      />

      <EnvironmentSwitcherDialog
        isOpen={isEnvironmentCommandOpen}
        onOpenChange={setIsEnvironmentCommandOpen}
        environmentCommandQuery={environmentCommandQuery}
        setEnvironmentCommandQuery={setEnvironmentCommandQuery}
        handleEnvironmentCommandInputKeyDown={handleEnvironmentCommandInputKeyDown}
        environmentCommandResults={environmentCommandResults}
        environmentCommandIndex={environmentCommandIndex}
        setEnvironmentCommandIndex={setEnvironmentCommandIndex}
        selectEnvironmentFromCommand={selectEnvironmentFromCommand}
        selectedEnvironmentId={selectedEnvironmentId}
      />
    </div>
  )
}

export default App
