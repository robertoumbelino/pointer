import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type {
  ColumnForeignKeyRef,
  ConnectionSummary,
  DatabaseEngine,
  EnvironmentSummary,
  TableRef,
} from '../../../../shared/db-types'
import type {
  EditingCell,
  SqlTab,
  TableReloadOverrides,
  TableTab,
  WorkTab,
} from '../../../entities/workspace/types'
import { WorkspaceEmptyState } from './WorkspaceEmptyState'
import { WorkspaceTabsBar } from './WorkspaceTabsBar'
import { SqlWorkspacePanel } from './SqlWorkspacePanel'
import { TableWorkspacePanel } from './TableWorkspacePanel'

type WorkspaceMainProps = {
  environments: EnvironmentSummary[]
  setIsCreateEnvironmentOpen: Dispatch<SetStateAction<boolean>>
  workTabs: WorkTab[]
  activeTabId: string
  setActiveTabId: Dispatch<SetStateAction<string>>
  openRenameSqlTabDialog: (tab: SqlTab) => void
  reorderWorkTabs: (draggedTabId: string, targetTabId: string, position?: 'before' | 'after') => void
  closeTableTab: (tabId: string) => void
  closeSqlTab: (tabId: string) => void
  activeTableTab: TableTab | null
  saveActiveTableChanges: () => Promise<void>
  isSavingTableChanges: boolean
  activeSqlTab: SqlTab | null
  updateSqlTab: (tabId: string, updater: (tab: SqlTab) => SqlTab) => void
  connections: ConnectionSummary[]
  runSql: () => Promise<void>
  cancelSqlExecution: () => Promise<void>
  sqlSplitContainerRef: MutableRefObject<HTMLDivElement | null>
  sqlEditorExtensions: unknown[]
  sqlCursorByTabRef: MutableRefObject<Record<string, number>>
  setResizingSqlTabId: Dispatch<SetStateAction<string | null>>
  reloadTableTab: (tabId: string, overrides?: TableReloadOverrides) => Promise<void>
  navigateToForeignKey: (sourceTab: TableTab, foreignKey: ColumnForeignKeyRef | undefined, value: unknown) => Promise<void>
  handleToggleInsertDraftRow: () => void
  handleDeleteRow: () => void
  updateTableTab: (tabId: string, updater: (tab: TableTab) => TableTab) => void
  beginInlineEdit: (rowIndex: number, column: string) => void
  editingCell: EditingCell | null
  setEditingCell: Dispatch<SetStateAction<EditingCell | null>>
  commitInlineEdit: (override?: EditingCell) => void
  cancelInlineEdit: () => void
  updateInsertDraftValue: (columnName: string, value: string | null) => void
  formatDraftInputValue: (value: unknown) => string
  formatCell: (value: unknown) => string
  formatTableLabel: (table: TableRef) => string
  engineLabel: (engine: DatabaseEngine) => string
  exportSqlResultSetVisibleCsv: (params: {
    tabId: string
    resultSetIndex: number
    fields: string[]
    rows: Record<string, unknown>[]
  }) => void
  exportTableCurrentPageCsv: (tabId: string) => void
  exportTableAllPagesCsv: (tabId: string) => Promise<void>
  sendAiPromptToSqlTab: (tabId: string, prompt: string) => Promise<void>
  setAiDraftOnSqlTab: (tabId: string, value: string) => void
  onRequestSqlTableStructure: (params: {
    tabId: string
    connectionId: string
    sqlText: string
    cursorOffset: number
  }) => Promise<void>
}

export function WorkspaceMain(props: WorkspaceMainProps): JSX.Element {
  const {
    environments,
    setIsCreateEnvironmentOpen,
    workTabs,
    activeTabId,
    setActiveTabId,
    openRenameSqlTabDialog,
    reorderWorkTabs,
    closeTableTab,
    closeSqlTab,
    activeTableTab,
    saveActiveTableChanges,
    isSavingTableChanges,
    activeSqlTab,
    updateSqlTab,
    connections,
    runSql,
    cancelSqlExecution,
    sqlSplitContainerRef,
    sqlEditorExtensions,
    sqlCursorByTabRef,
    setResizingSqlTabId,
    reloadTableTab,
    navigateToForeignKey,
    handleToggleInsertDraftRow,
    handleDeleteRow,
    updateTableTab,
    beginInlineEdit,
    editingCell,
    setEditingCell,
    commitInlineEdit,
    cancelInlineEdit,
    updateInsertDraftValue,
    formatDraftInputValue,
    formatCell,
    formatTableLabel,
    engineLabel,
    exportSqlResultSetVisibleCsv,
    exportTableCurrentPageCsv,
    exportTableAllPagesCsv,
    sendAiPromptToSqlTab,
    setAiDraftOnSqlTab,
    onRequestSqlTableStructure,
  } = props

  return (
    <main className='flex min-w-0 flex-1 flex-col overflow-hidden'>
      {environments.length === 0 ? (
        <WorkspaceEmptyState onCreateEnvironment={() => setIsCreateEnvironmentOpen(true)} />
      ) : (
        <>
          <div className='pointer-card overflow-hidden'>
            <WorkspaceTabsBar
              workTabs={workTabs}
              activeTabId={activeTabId}
              setActiveTabId={setActiveTabId}
              openRenameSqlTabDialog={openRenameSqlTabDialog}
              reorderWorkTabs={reorderWorkTabs}
              closeTableTab={closeTableTab}
              closeSqlTab={closeSqlTab}
            />
          </div>

          <div className='mt-3 min-h-0 flex-1 overflow-hidden'>
            {activeSqlTab ? (
              <SqlWorkspacePanel
                activeSqlTab={activeSqlTab}
                updateSqlTab={updateSqlTab}
                connections={connections}
                runSql={runSql}
                cancelSqlExecution={cancelSqlExecution}
                sqlSplitContainerRef={sqlSplitContainerRef}
                sqlEditorExtensions={sqlEditorExtensions}
                sqlCursorByTabRef={sqlCursorByTabRef}
                setResizingSqlTabId={setResizingSqlTabId}
                formatCell={formatCell}
                exportSqlResultSetVisibleCsv={exportSqlResultSetVisibleCsv}
                sendAiPromptToSqlTab={sendAiPromptToSqlTab}
                setAiDraftOnSqlTab={setAiDraftOnSqlTab}
                onRequestSqlTableStructure={onRequestSqlTableStructure}
              />
            ) : activeTableTab ? (
              <TableWorkspacePanel
                activeTableTab={activeTableTab}
                saveActiveTableChanges={saveActiveTableChanges}
                isSavingTableChanges={isSavingTableChanges}
                reloadTableTab={reloadTableTab}
                navigateToForeignKey={navigateToForeignKey}
                closeTableTab={closeTableTab}
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
                exportTableCurrentPageCsv={exportTableCurrentPageCsv}
                exportTableAllPagesCsv={exportTableAllPagesCsv}
              />
            ) : (
              <div className='pointer-card-soft flex h-full items-center justify-center border-dashed text-slate-500'>
                Aba não encontrada.
              </div>
            )}
          </div>
        </>
      )}
    </main>
  )
}
