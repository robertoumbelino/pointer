import { useEffect, useMemo, useRef } from 'react'
import { sql } from '@codemirror/lang-sql'
import {
  autocompletion,
  type Completion,
  type CompletionContext,
  startCompletion,
} from '@codemirror/autocomplete'
import { EditorView, keymap } from '@codemirror/view'
import { useAppUpdate } from '../features/app-update/model/useAppUpdate'
import { AppTopBar } from '../features/app-update/ui/AppTopBar'
import { ChangelogDialog } from '../features/app-update/ui/ChangelogDialog'
import { useCommandPalette } from '../features/command-palette/model/useCommandPalette'
import { useCommandPaletteActions } from '../features/command-palette/model/useCommandPaletteActions'
import { TableCommandDialog } from '../features/command-palette/ui/TableCommandDialog'
import { useConnections } from '../features/connections/model/useConnections'
import { useEnvironments } from '../features/environments/model/useEnvironments'
import { useEnvironmentSwitcherActions } from '../features/environments/model/useEnvironmentSwitcherActions'
import { EnvironmentSidebar } from '../features/environments/ui/EnvironmentSidebar'
import { EnvironmentSwitcherDialog } from '../features/environments/ui/EnvironmentSwitcherDialog'
import { useWorkspace } from '../features/workspace/model/useWorkspace'
import { useSchemaSelectionGuard } from '../features/workspace/model/useSchemaSelectionGuard'
import { useWorkspaceActions } from '../features/workspace/model/useWorkspaceActions'
import { useWorkspaceShortcuts } from '../features/workspace/model/useWorkspaceShortcuts'
import { SqlRiskConfirmDialog } from '../features/workspace/ui/SqlRiskConfirmDialog'
import { SqlTabRenameDialog } from '../features/workspace/ui/SqlTabRenameDialog'
import { TableContextMenu } from '../features/workspace/ui/TableContextMenu'
import { WorkspaceMain } from '../features/workspace/ui/WorkspaceMain'
import { pointerApi } from '../shared/api/pointer-api'
import { DEFAULT_ENVIRONMENT_COLOR, PAGE_SIZE } from '../shared/constants/app'
import {
  engineLabel,
  engineShortLabel,
  formatCell,
  formatDraftInputValue,
  formatTableLabel,
  hexToRgb,
  normalizeHexColor,
} from '../shared/lib/workspace-utils'
import { useWorkbenchFlows } from './model/useWorkbenchFlows'
import { useWorkbenchPersistence } from './model/useWorkbenchPersistence'

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
    selectedConnectionId,
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

  const commandColumnInputRef = useRef<HTMLSelectElement | null>(null)
  const commandValueInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    workTabsRef.current = workTabs
  }, [workTabs, workTabsRef])

  useEffect(() => {
    activeTabIdRef.current = activeTabId
  }, [activeTabId, activeTabIdRef])

  useEffect(() => {
    selectedSchemaRef.current = selectedSchema
  }, [selectedSchema, selectedSchemaRef])

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
    void loadEnvironmentsWithSelection()
  }, [loadEnvironmentsWithSelection])

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

  const {
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
  } = useWorkspaceActions({
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
    getSqlTab: (tabId) => {
      const tab = workTabsRef.current.find((candidate) => candidate.id === tabId)
      return tab?.type === 'sql' ? tab : null
    },
    setWorkTabs,
    updateTableTab,
    updateSqlTab,
  })

  const {
    groupedCommandHits,
    handleCommandInputKeyDown,
    applyCommandScopedFilter,
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
  })

  runSqlRef.current = runSql
  saveActiveTableChangesRef.current = saveActiveTableChanges
  commitInlineEditRef.current = commitInlineEdit
  toggleSelectedRowDeleteRef.current = handleDeleteRow
  openNewSqlTabRef.current = openNewSqlTab
  closeActiveTabRef.current = closeActiveTab

  useWorkspaceShortcuts({
    activeTabId,
    setIsCommandOpen,
    setIsEnvironmentCommandOpen,
    runSqlRef,
    saveActiveTableChangesRef,
    commitInlineEditRef,
    toggleSelectedRowDeleteRef,
    openNewSqlTabRef,
    closeActiveTabRef,
    activeTabIdRef,
    workTabsRef,
    sqlCursorByTabRef,
    getTableTab,
  })

  const shortcutLabel = navigator.platform.includes('Mac') ? '⌘K' : 'Ctrl+K'

  return (
    <div className='h-screen w-screen overflow-hidden text-[13px] text-slate-100'>
      <div className='h-full w-full overflow-hidden border border-slate-800/70 bg-slate-950'>
        <AppTopBar
          appVersion={appVersion}
          appUpdateInfo={appUpdateInfo}
          isCheckingAppUpdate={isCheckingAppUpdate}
          isInstallingAppUpdate={isInstallingAppUpdate}
          onOpenChangelog={openChangelog}
          onCheckForUpdate={checkForAppUpdate}
          onInstallUpdate={installLatestAppUpdate}
        />

        <div className='no-drag flex h-[calc(100%-2.25rem)]'>
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
            closeTableTab={closeTableTab}
            closeSqlTab={closeSqlTab}
            activeTableTab={activeTableTab}
            saveActiveTableChanges={saveActiveTableChanges}
            activeSqlTab={activeSqlTab}
            updateSqlTab={updateSqlTab}
            connections={connections}
            runSql={() => runSql()}
            sqlSplitContainerRef={sqlSplitContainerRef}
            sqlEditorExtensions={sqlEditorExtensions}
            sqlCursorByTabRef={sqlCursorByTabRef}
            setResizingSqlTabId={setResizingSqlTabId}
            reloadTableTab={reloadTableTab}
            handleToggleInsertDraftRow={handleToggleInsertDraftRow}
            selectedRow={selectedRow}
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
            pageSize={PAGE_SIZE}
          />
        </div>
      </div>

      <TableContextMenu
        tableContextMenu={tableContextMenu}
        setTableContextMenu={setTableContextMenu}
        onCopyStructureSql={handleCopyTableStructureSql}
        onCopyInsertSql={handleCopyInsertTemplateSql}
      />

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
        sqlConfirmText={sqlConfirmText}
        setSqlConfirmText={setSqlConfirmText}
        pendingSqlExecution={pendingSqlExecution}
        setPendingSqlExecution={setPendingSqlExecution}
        onForceRunSql={async (tabId, sqlText) => {
          await runSql(true, undefined, sqlText, tabId)
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
        groupedCommandHits={groupedCommandHits}
        commandItemRefs={commandItemRefs}
        commandIndex={commandIndex}
        setCommandIndex={setCommandIndex}
        openTableTab={openTableTab}
        engineShortLabel={engineShortLabel}
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
