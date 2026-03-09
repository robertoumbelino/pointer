import { useRef, useState } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { TableSearchHit } from '../../../../shared/db-types'
import type {
  EditingCell,
  EnvironmentWorkspaceSnapshot,
  SidebarTableContextMenuState,
  SqlTab,
  TableTab,
  WorkTab,
} from '../../../entities/workspace/types'
import { createSqlTab } from '../../../entities/workspace/types'

type UseWorkspaceResult = {
  selectedSchema: string
  setSelectedSchema: Dispatch<SetStateAction<string>>
  catalogHits: TableSearchHit[]
  setCatalogHits: Dispatch<SetStateAction<TableSearchHit[]>>
  commandHits: TableSearchHit[]
  setCommandHits: Dispatch<SetStateAction<TableSearchHit[]>>
  workTabs: WorkTab[]
  setWorkTabs: Dispatch<SetStateAction<WorkTab[]>>
  activeTabId: string
  setActiveTabId: Dispatch<SetStateAction<string>>
  isEnvironmentCommandOpen: boolean
  setIsEnvironmentCommandOpen: Dispatch<SetStateAction<boolean>>
  environmentCommandQuery: string
  setEnvironmentCommandQuery: Dispatch<SetStateAction<string>>
  environmentCommandIndex: number
  setEnvironmentCommandIndex: Dispatch<SetStateAction<number>>
  isRenameSqlTabOpen: boolean
  setIsRenameSqlTabOpen: Dispatch<SetStateAction<boolean>>
  renamingSqlTabId: string
  setRenamingSqlTabId: Dispatch<SetStateAction<string>>
  sqlTabNameDraft: string
  setSqlTabNameDraft: Dispatch<SetStateAction<string>>
  editingCell: EditingCell | null
  setEditingCell: Dispatch<SetStateAction<EditingCell | null>>
  sqlConfirmOpen: boolean
  setSqlConfirmOpen: Dispatch<SetStateAction<boolean>>
  sqlConfirmText: string
  setSqlConfirmText: Dispatch<SetStateAction<string>>
  pendingSqlExecution: { tabId: string; sql: string } | null
  setPendingSqlExecution: Dispatch<SetStateAction<{ tabId: string; sql: string } | null>>
  tableContextMenu: SidebarTableContextMenuState | null
  setTableContextMenu: Dispatch<SetStateAction<SidebarTableContextMenuState | null>>
  resizingSqlTabId: string | null
  setResizingSqlTabId: Dispatch<SetStateAction<string | null>>
  workTabsRef: MutableRefObject<WorkTab[]>
  activeTabIdRef: MutableRefObject<string>
  selectedSchemaRef: MutableRefObject<string>
  sqlTabCounterRef: MutableRefObject<number>
  sqlSplitContainerRef: MutableRefObject<HTMLDivElement | null>
  sqlCursorByTabRef: MutableRefObject<Record<string, number>>
  sqlExecutionByTabRef: MutableRefObject<Record<string, string>>
  environmentWorkspaceRef: MutableRefObject<Record<string, EnvironmentWorkspaceSnapshot>>
  previousEnvironmentIdRef: MutableRefObject<string>
  preferredEnvironmentIdRef: MutableRefObject<string>
  runSqlRef: MutableRefObject<((force?: boolean, cursorOffset?: number, explicitSql?: string, targetTabId?: string) => Promise<void>) | undefined>
  saveActiveTableChangesRef: MutableRefObject<(() => Promise<void>) | undefined>
  commitInlineEditRef: MutableRefObject<(() => void) | undefined>
  toggleSelectedRowDeleteRef: MutableRefObject<(() => void) | undefined>
  openNewSqlTabRef: MutableRefObject<(() => void) | undefined>
  closeActiveTabRef: MutableRefObject<(() => void) | undefined>
  getTableTab: (tabId: string) => TableTab | null
  getSqlTab: (tabId: string) => SqlTab | null
  updateTableTab: (tabId: string, updater: (tab: TableTab) => TableTab) => void
  updateSqlTab: (tabId: string, updater: (tab: SqlTab) => SqlTab) => void
}

export function useWorkspace(): UseWorkspaceResult {
  const [selectedSchema, setSelectedSchema] = useState<string>('all')
  const [catalogHits, setCatalogHits] = useState<TableSearchHit[]>([])
  const [commandHits, setCommandHits] = useState<TableSearchHit[]>([])

  const [workTabs, setWorkTabs] = useState<WorkTab[]>([createSqlTab('sql:1', 'SQL 1')])
  const [activeTabId, setActiveTabId] = useState<string>('sql:1')

  const [isEnvironmentCommandOpen, setIsEnvironmentCommandOpen] = useState(false)
  const [environmentCommandQuery, setEnvironmentCommandQuery] = useState('')
  const [environmentCommandIndex, setEnvironmentCommandIndex] = useState(0)
  const [isRenameSqlTabOpen, setIsRenameSqlTabOpen] = useState(false)
  const [renamingSqlTabId, setRenamingSqlTabId] = useState('')
  const [sqlTabNameDraft, setSqlTabNameDraft] = useState('')

  const [editingCell, setEditingCell] = useState<EditingCell | null>(null)

  const [sqlConfirmOpen, setSqlConfirmOpen] = useState(false)
  const [sqlConfirmText, setSqlConfirmText] = useState('')
  const [pendingSqlExecution, setPendingSqlExecution] = useState<{ tabId: string; sql: string } | null>(null)
  const [tableContextMenu, setTableContextMenu] = useState<SidebarTableContextMenuState | null>(null)

  const [resizingSqlTabId, setResizingSqlTabId] = useState<string | null>(null)

  const workTabsRef = useRef<WorkTab[]>(workTabs)
  const activeTabIdRef = useRef<string>(activeTabId)
  const selectedSchemaRef = useRef<string>(selectedSchema)
  const sqlTabCounterRef = useRef<number>(2)
  const sqlSplitContainerRef = useRef<HTMLDivElement | null>(null)
  const sqlCursorByTabRef = useRef<Record<string, number>>({})
  const sqlExecutionByTabRef = useRef<Record<string, string>>({})
  const environmentWorkspaceRef = useRef<Record<string, EnvironmentWorkspaceSnapshot>>({})
  const previousEnvironmentIdRef = useRef<string>('')
  const preferredEnvironmentIdRef = useRef<string>('')

  const runSqlRef = useRef<
    (force?: boolean, cursorOffset?: number, explicitSql?: string, targetTabId?: string) => Promise<void>
  >()
  const saveActiveTableChangesRef = useRef<() => Promise<void>>()
  const commitInlineEditRef = useRef<() => void>()
  const toggleSelectedRowDeleteRef = useRef<() => void>()
  const openNewSqlTabRef = useRef<() => void>()
  const closeActiveTabRef = useRef<() => void>()

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

  return {
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
    sqlExecutionByTabRef,
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
    getSqlTab,
    updateTableTab,
    updateSqlTab,
  }
}
