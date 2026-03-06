import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { ConnectionSummary, DatabaseEngine, EnvironmentSummary, TableRef } from '../../../../shared/db-types'
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
  closeTableTab: (tabId: string) => void
  closeSqlTab: (tabId: string) => void
  activeTableTab: TableTab | null
  saveActiveTableChanges: () => Promise<void>
  activeSqlTab: SqlTab | null
  updateSqlTab: (tabId: string, updater: (tab: SqlTab) => SqlTab) => void
  connections: ConnectionSummary[]
  runSql: () => Promise<void>
  sqlSplitContainerRef: MutableRefObject<HTMLDivElement | null>
  sqlEditorExtensions: unknown[]
  sqlCursorByTabRef: MutableRefObject<Record<string, number>>
  setResizingSqlTabId: Dispatch<SetStateAction<string | null>>
  reloadTableTab: (tabId: string, overrides?: TableReloadOverrides) => Promise<void>
  handleToggleInsertDraftRow: () => void
  selectedRow: Record<string, unknown> | null
  handleDeleteRow: () => void
  updateTableTab: (tabId: string, updater: (tab: TableTab) => TableTab) => void
  beginInlineEdit: (rowIndex: number, column: string) => void
  editingCell: EditingCell | null
  setEditingCell: Dispatch<SetStateAction<EditingCell | null>>
  commitInlineEdit: () => void
  cancelInlineEdit: () => void
  updateInsertDraftValue: (columnName: string, value: string) => void
  formatDraftInputValue: (value: unknown) => string
  formatCell: (value: unknown) => string
  formatTableLabel: (table: TableRef) => string
  engineLabel: (engine: DatabaseEngine) => string
  pageSize: number
}

export function WorkspaceMain(props: WorkspaceMainProps): JSX.Element {
  const {
    environments,
    setIsCreateEnvironmentOpen,
    workTabs,
    activeTabId,
    setActiveTabId,
    openRenameSqlTabDialog,
    closeTableTab,
    closeSqlTab,
    activeTableTab,
    saveActiveTableChanges,
    activeSqlTab,
    updateSqlTab,
    connections,
    runSql,
    sqlSplitContainerRef,
    sqlEditorExtensions,
    sqlCursorByTabRef,
    setResizingSqlTabId,
    reloadTableTab,
    handleToggleInsertDraftRow,
    selectedRow,
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
    pageSize,
  } = props

  return (
    <main className='flex flex-1 flex-col overflow-hidden bg-slate-950'>
      {environments.length === 0 ? (
        <WorkspaceEmptyState onCreateEnvironment={() => setIsCreateEnvironmentOpen(true)} />
      ) : (
        <>
          <WorkspaceTabsBar
            workTabs={workTabs}
            activeTabId={activeTabId}
            setActiveTabId={setActiveTabId}
            openRenameSqlTabDialog={openRenameSqlTabDialog}
            closeTableTab={closeTableTab}
            closeSqlTab={closeSqlTab}
            activeTableTab={activeTableTab}
            saveActiveTableChanges={saveActiveTableChanges}
          />

          <div className='flex-1 overflow-hidden p-3'>
            {activeSqlTab ? (
              <SqlWorkspacePanel
                activeSqlTab={activeSqlTab}
                updateSqlTab={updateSqlTab}
                connections={connections}
                runSql={runSql}
                sqlSplitContainerRef={sqlSplitContainerRef}
                sqlEditorExtensions={sqlEditorExtensions}
                sqlCursorByTabRef={sqlCursorByTabRef}
                setResizingSqlTabId={setResizingSqlTabId}
                formatCell={formatCell}
              />
            ) : activeTableTab ? (
              <TableWorkspacePanel
                activeTableTab={activeTableTab}
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
                pageSize={pageSize}
              />
            ) : (
              <div className='flex h-full items-center justify-center rounded-lg border border-dashed border-slate-800 bg-slate-900/30 text-slate-500'>
                Aba não encontrada.
              </div>
            )}
          </div>
        </>
      )}
    </main>
  )
}
