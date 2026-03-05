import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  AppUpdateInfo,
  ConnectionInput,
  ConnectionSummary,
  DatabaseEngine,
  EnvironmentSummary,
  SqlExecutionResult,
  TableReadResult,
  TableRef,
  TableFilterOperator,
  TableSchema,
  TableSearchHit,
  TableSort,
} from '../shared/db-types'
import { Badge } from './components/ui/badge'
import { Button } from './components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from './components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './components/ui/dropdown-menu'
import { Input } from './components/ui/input'
import { cn } from './lib/utils'

type ConnectionDraft = ConnectionInput

type SqlTab = {
  id: string
  type: 'sql'
  title: string
  connectionId: string
  sqlText: string
  sqlResult: SqlExecutionResult | null
  sqlRunning: boolean
  splitRatio: number
}

type RowPendingUpdates = Record<number, Record<string, unknown>>
type InsertDraftRow = Record<string, unknown>

type TableTab = {
  id: string
  type: 'table'
  title: string
  engine: DatabaseEngine
  connectionId: string
  connectionName: string
  table: TableRef
  schema: TableSchema | null
  data: TableReadResult | null
  page: number
  sort?: TableSort
  filterColumn: string
  filterOperator: TableFilterOperator
  filterValue: string
  selectedRowIndex: number | null
  pendingUpdates: RowPendingUpdates
  pendingDeletes: number[]
  insertDraft: InsertDraftRow | null
  baseRows: Record<string, unknown>[] | null
  loading: boolean
}

type WorkTab = SqlTab | TableTab

type EditingCell = {
  tabId: string
  rowIndex: number
  column: string
  value: string
}

type SidebarTableContextMenuState = {
  hit: TableSearchHit
  x: number
  y: number
}

type TableReloadOverrides = {
  page?: number
  sort?: TableSort
  filterColumn?: string
  filterOperator?: TableFilterOperator
  filterValue?: string
}

type EnvironmentWorkspaceSnapshot = {
  workTabs: WorkTab[]
  activeTabId: string
  sqlTabCounter: number
  selectedSchema: string
}

type PersistedSqlTab = {
  type: 'sql'
  id: string
  title: string
  connectionId: string
  sqlText: string
  splitRatio: number
}

type PersistedTableTab = {
  type: 'table'
  id: string
  title: string
  engine: DatabaseEngine
  connectionId: string
  connectionName: string
  table: TableRef
  page: number
  sort?: TableSort
  filterColumn: string
  filterOperator: TableFilterOperator
  filterValue: string
}

type PersistedWorkTab = PersistedSqlTab | PersistedTableTab

type PersistedEnvironmentWorkspaceSnapshot = {
  workTabs: PersistedWorkTab[]
  activeTabId: string
  sqlTabCounter: number
  selectedSchema: string
}

type PersistedWorkspaceStorage = {
  version: 1
  lastEnvironmentId: string
  environments: Record<string, PersistedEnvironmentWorkspaceSnapshot>
}

const PAGE_SIZE = 500
const SAFE_CONFIRM_WORD = 'EXECUTAR'
const DEFAULT_SQL = 'SELECT NOW() AS current_time;'
const DEFAULT_ENVIRONMENT_COLOR = '#0EA5E9'
const WORKSPACE_STORAGE_KEY = 'pointer.workspace.v1'
const ENVIRONMENT_COLOR_PRESETS = [
  '#0EA5E9',
  '#22C55E',
  '#EF4444',
  '#F59E0B',
  '#8B5CF6',
  '#EC4899',
]
const SIDEBAR_SECTION_LABEL_CLASS =
  'mb-1.5 block text-[11px] leading-none font-semibold uppercase tracking-[0.18em] text-slate-500'

function createSqlTab(id: string, title: string, connectionId = ''): SqlTab {
  return {
    id,
    type: 'sql',
    title,
    connectionId,
    sqlText: DEFAULT_SQL,
    sqlResult: null,
    sqlRunning: false,
    splitRatio: 56,
  }
}

function createConnectionDraft(environmentId: string): ConnectionDraft {
  return {
    environmentId,
    engine: 'postgres',
    name: '',
    host: 'localhost',
    port: 5432,
    database: '',
    user: '',
    password: '',
    sslMode: 'disable',
  }
}

function createConnectionDraftFromConnection(connection: ConnectionSummary): ConnectionDraft {
  return {
    environmentId: connection.environmentId,
    engine: connection.engine,
    name: connection.name,
    host: connection.host,
    port: connection.port,
    database: connection.database,
    user: connection.user,
    password: '',
    sslMode: connection.sslMode,
  }
}

function App(): JSX.Element {
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([])
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<string>('')

  const [connections, setConnections] = useState<ConnectionSummary[]>([])
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>('')

  const [selectedSchema, setSelectedSchema] = useState<string>('all')

  const [catalogHits, setCatalogHits] = useState<TableSearchHit[]>([])
  const [commandHits, setCommandHits] = useState<TableSearchHit[]>([])

  const [workTabs, setWorkTabs] = useState<WorkTab[]>([createSqlTab('sql:1', 'SQL 1')])
  const [activeTabId, setActiveTabId] = useState<string>('sql:1')

  const [isCreateEnvironmentOpen, setIsCreateEnvironmentOpen] = useState(false)
  const [environmentNameDraft, setEnvironmentNameDraft] = useState('')
  const [environmentColorDraft, setEnvironmentColorDraft] = useState(DEFAULT_ENVIRONMENT_COLOR)
  const [isEnvironmentSaving, setIsEnvironmentSaving] = useState(false)
  const [isEditEnvironmentOpen, setIsEditEnvironmentOpen] = useState(false)
  const [environmentEditNameDraft, setEnvironmentEditNameDraft] = useState('')
  const [environmentEditColorDraft, setEnvironmentEditColorDraft] = useState(DEFAULT_ENVIRONMENT_COLOR)
  const [isEnvironmentUpdating, setIsEnvironmentUpdating] = useState(false)

  const [isCreateConnectionOpen, setIsCreateConnectionOpen] = useState(false)
  const [connectionDraft, setConnectionDraft] = useState<ConnectionDraft>(createConnectionDraft(''))
  const [isConnectionSaving, setIsConnectionSaving] = useState(false)
  const [isCreateConnectionTesting, setIsCreateConnectionTesting] = useState(false)
  const [isEditConnectionOpen, setIsEditConnectionOpen] = useState(false)
  const [editingConnectionId, setEditingConnectionId] = useState<string>('')
  const [connectionEditDraft, setConnectionEditDraft] = useState<ConnectionDraft>(createConnectionDraft(''))
  const [isConnectionUpdating, setIsConnectionUpdating] = useState(false)
  const [isEditConnectionTesting, setIsEditConnectionTesting] = useState(false)

  const [isCommandOpen, setIsCommandOpen] = useState(false)
  const [commandQuery, setCommandQuery] = useState('')
  const [commandIndex, setCommandIndex] = useState(0)
  const [commandScopedTarget, setCommandScopedTarget] = useState<TableSearchHit | null>(null)
  const [commandScopedSchema, setCommandScopedSchema] = useState<TableSchema | null>(null)
  const [commandScopedColumn, setCommandScopedColumn] = useState('')
  const [commandScopedValue, setCommandScopedValue] = useState('')

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
  const [appUpdateInfo, setAppUpdateInfo] = useState<AppUpdateInfo | null>(null)
  const [isCheckingAppUpdate, setIsCheckingAppUpdate] = useState(false)
  const [isInstallingAppUpdate, setIsInstallingAppUpdate] = useState(false)
  const [appVersion, setAppVersion] = useState('0.0.0')
  const [tableContextMenu, setTableContextMenu] = useState<SidebarTableContextMenuState | null>(null)

  const [resizingSqlTabId, setResizingSqlTabId] = useState<string | null>(null)

  const workTabsRef = useRef<WorkTab[]>(workTabs)
  const activeTabIdRef = useRef<string>(activeTabId)
  const selectedSchemaRef = useRef<string>(selectedSchema)
  const sqlTabCounterRef = useRef<number>(2)
  const sqlSplitContainerRef = useRef<HTMLDivElement | null>(null)
  const commandColumnInputRef = useRef<HTMLSelectElement | null>(null)
  const commandValueInputRef = useRef<HTMLInputElement | null>(null)
  const sqlCursorByTabRef = useRef<Record<string, number>>({})
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
      { connectionId: string; heading: string; items: Array<{ hit: TableSearchHit; index: number }> }
    >()

    commandHits.forEach((hit, index) => {
      const existing = groups.get(hit.connectionId)
      if (existing) {
        existing.items.push({ hit, index })
        return
      }

      groups.set(hit.connectionId, {
        connectionId: hit.connectionId,
        heading: hit.connectionName,
        items: [{ hit, index }],
      })
    })

    return Array.from(groups.values())
  }, [commandHits])

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
        const version = await window.pointerApi.getAppVersion()
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

    if (commandHits.length === 0) {
      setCommandIndex(0)
      return
    }

    setCommandIndex((current) => Math.max(0, Math.min(current, commandHits.length - 1)))
  }, [commandHits, commandScopedTarget, isCommandOpen])

  useEffect(() => {
    if (!isCommandOpen || commandScopedTarget) {
      return
    }

    setCommandIndex(0)
  }, [commandQuery, commandScopedTarget, isCommandOpen])

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
      const all = await window.pointerApi.listEnvironments()
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
      const info = await window.pointerApi.checkForAppUpdate()
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
      const result = await window.pointerApi.installLatestUpdate()

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
      const all = await window.pointerApi.listConnections(environmentId)
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
      const hits = await window.pointerApi.searchTablesInEnvironment(environmentId, '')
      setCatalogHits(hits)
      setCommandHits(hits.slice(0, 220))
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  async function searchTablesForCommand(environmentId: string, query: string): Promise<void> {
    try {
      const hits = await window.pointerApi.searchTablesInEnvironment(environmentId, query.trim())
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

      const schema = await window.pointerApi.describeTable(hit.connectionId, hit.table)
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

    if (commandHits.length === 0) {
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setCommandIndex((current) => Math.max(0, Math.min(current + 1, commandHits.length - 1)))
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setCommandIndex((current) => Math.max(0, current - 1))
      return
    }

    if (event.key === 'Tab') {
      event.preventDefault()
      const target = commandHits[commandIndex] ?? commandHits[0]
      if (target) {
        void enterCommandScopedMode(target)
      }
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      const target = commandHits[commandIndex] ?? commandHits[0]
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
      const schema = await window.pointerApi.describeTable(hit.connectionId, hit.table)
      const sql = buildCreateTableTemplateSql(hit.engine, schema)
      await window.pointerApi.copyToClipboard(sql)
      setTableContextMenu(null)
      toast.success('Estrutura da tabela copiada.')
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  async function handleCopyInsertTemplateSql(hit: TableSearchHit): Promise<void> {
    try {
      const schema = await window.pointerApi.describeTable(hit.connectionId, hit.table)
      const sql = buildInsertTemplateSql(hit.engine, schema)
      await window.pointerApi.copyToClipboard(sql)
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
      const created = await window.pointerApi.createEnvironment(name, environmentColorDraft)

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
      const updated = await window.pointerApi.updateEnvironment(
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
      await window.pointerApi.deleteEnvironment(selectedEnvironment.id)
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
        host: connectionDraft.host.trim(),
        database: connectionDraft.database.trim(),
        user: connectionDraft.user.trim(),
      }

      if (!selectedEnvironmentId) {
        throw new Error('Selecione um ambiente antes de criar conexão.')
      }

      if (!payload.name || !payload.host || !payload.database || !payload.user) {
        throw new Error('Preencha os campos obrigatórios da conexão.')
      }

      const created = await window.pointerApi.createConnection(payload)
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
        host: connectionDraft.host.trim(),
        database: connectionDraft.database.trim(),
        user: connectionDraft.user.trim(),
      }

      const result = await window.pointerApi.testConnectionInput(payload)
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
        host: connectionEditDraft.host.trim(),
        database: connectionEditDraft.database.trim(),
        user: connectionEditDraft.user.trim(),
      }

      if (!payload.name || !payload.host || !payload.database || !payload.user) {
        throw new Error('Preencha os campos obrigatórios da conexão.')
      }

      const updated = await window.pointerApi.updateConnection(editingConnectionId, payload)
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
        host: connectionEditDraft.host.trim(),
        database: connectionEditDraft.database.trim(),
        user: connectionEditDraft.user.trim(),
      }

      const result = await window.pointerApi.testConnectionInput(payload, editingConnectionId)
      toast.success(`Conexão OK em ${result.latencyMs}ms`)
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setIsEditConnectionTesting(false)
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
      await window.pointerApi.deleteConnection(target.id)
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

      const schema = await window.pointerApi.describeTable(hit.connectionId, hit.table)
      const resolvedFilterColumn = nextFilterColumn || schema.columns[0]?.name || ''
      const filters =
        resolvedFilterColumn && nextFilterValue
          ? [{ column: resolvedFilterColumn, operator: nextFilterOperator, value: nextFilterValue }]
          : []

      const data = await window.pointerApi.readTable(hit.connectionId, hit.table, {
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

      const result = await window.pointerApi.readTable(tab.connectionId, tab.table, {
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

        await window.pointerApi.insertRow(tab.connectionId, tab.table, insertPayload)
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

          const result = await window.pointerApi.updateRow(tab.connectionId, tab.table, payload)
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

          const result = await window.pointerApi.deleteRow(tab.connectionId, tab.table, payload)
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
        const risk = await window.pointerApi.previewSqlRisk(sqlToExecute)

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
        result = await window.pointerApi.executeSql(sqlTab.connectionId, sqlToExecute)
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

        result = await window.pointerApi.executeSql(sqlTab.connectionId, fallbackSql)
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
                          {connection.engine === 'postgres' ? 'PG' : 'CH'}
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
                          }))
                        }}
                      >
                        <option value='postgres'>PostgreSQL</option>
                        <option value='clickhouse'>ClickHouse</option>
                      </select>
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
                          }))
                        }}
                      >
                        <option value='postgres'>PostgreSQL</option>
                        <option value='clickhouse'>ClickHouse</option>
                      </select>
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
                        {hit.engine === 'postgres' ? 'PG' : 'CH'}
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
                    Crie um ambiente (ex: Local, Produção) e depois adicione conexões PostgreSQL e/ou ClickHouse.
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
                    <p>2. Adicionar conexão Postgres/ClickHouse</p>
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
                  {group.items.map(({ hit, index }) => (
                    <CommandItem
                      key={`${hit.connectionId}:${hit.table.fqName}`}
                      value={`${hit.connectionName} ${hit.table.fqName}`}
                      onSelect={() => {
                        setIsCommandOpen(false)
                        void openTableTab(hit)
                      }}
                      onMouseEnter={() => setCommandIndex(index)}
                      onFocus={() => setCommandIndex(index)}
                      className={cn('cursor-pointer', commandIndex === index && 'bg-slate-700/40')}
                    >
                      <Table2 className='h-4 w-4' />
                      <span className='truncate'>{formatTableLabel(hit.table)}</span>
                      <span className='ml-auto text-[10px] uppercase tracking-wide text-slate-400'>
                        {hit.engine === 'postgres' ? 'PG' : 'CH'}
                      </span>
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

function buildPersistedWorkspaceStorage(
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

function restorePersistedWorkspaceStorage(parsed: PersistedWorkspaceStorage): {
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
      sqlText: tab.sqlText,
      splitRatio: tab.splitRatio,
    }
  }

  return {
    type: 'table',
    id: tab.id,
    title: tab.title,
    engine: tab.engine,
    connectionId: tab.connectionId,
    connectionName: tab.connectionName,
    table: tab.table,
    page: tab.page,
    sort: tab.sort,
    filterColumn: tab.filterColumn,
    filterOperator: tab.filterOperator,
    filterValue: tab.filterValue,
  }
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
            sqlText: tab.sqlText,
            sqlResult: null,
            sqlRunning: false,
            splitRatio: typeof tab.splitRatio === 'number' ? tab.splitRatio : 56,
          } as SqlTab
        }

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
          sort: tab.sort,
          filterColumn: tab.filterColumn ?? '',
          filterOperator: tab.filterOperator ?? 'ilike',
          filterValue: tab.filterValue ?? '',
          selectedRowIndex: null,
          pendingUpdates: {},
          pendingDeletes: [],
          insertDraft: null,
          baseRows: null,
          loading: false,
        } as TableTab
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

function createInitialInsertDraft(schema: TableSchema): InsertDraftRow {
  const draft: InsertDraftRow = {}
  const nowIso = new Date().toISOString()

  for (const column of schema.columns) {
    const normalizedName = column.name.toLowerCase()

    if (column.isPrimaryKey) {
      const primaryKeyDefault = generatePrimaryKeyDefault(column.dataType)
      if (primaryKeyDefault !== undefined) {
        draft[column.name] = primaryKeyDefault
      }
    }

    if ((normalizedName === 'created_at' || normalizedName === 'updated_at') && isDateTimeDataType(column.dataType)) {
      draft[column.name] = nowIso
    }
  }

  return draft
}

function buildInsertPayload(draft: InsertDraftRow, schema: TableSchema): Record<string, unknown> {
  const payload: Record<string, unknown> = {}

  for (const column of schema.columns) {
    const normalizedValue = normalizeInsertValue(draft[column.name], column.dataType)
    if (normalizedValue === undefined) {
      continue
    }

    payload[column.name] = normalizedValue
  }

  return payload
}

function normalizeInsertValue(rawValue: unknown, dataType: string): unknown {
  if (rawValue === undefined) {
    return undefined
  }

  if (rawValue === null) {
    return null
  }

  if (typeof rawValue !== 'string') {
    return rawValue
  }

  const trimmed = rawValue.trim()
  if (!trimmed) {
    return undefined
  }

  if (trimmed.toLowerCase() === 'null') {
    return null
  }

  if (isBooleanDataType(dataType)) {
    if (trimmed.toLowerCase() === 'true') {
      return true
    }

    if (trimmed.toLowerCase() === 'false') {
      return false
    }
  }

  if (isNumericDataType(dataType)) {
    const parsedNumber = Number(trimmed)
    if (!Number.isNaN(parsedNumber) && Number.isFinite(parsedNumber)) {
      return parsedNumber
    }
  }

  if (isJsonLikeDataType(dataType)) {
    try {
      return JSON.parse(trimmed)
    } catch {
      return trimmed
    }
  }

  return trimmed
}

function formatDraftInputValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}

function generatePrimaryKeyDefault(dataType: string): string | undefined {
  if (isUuidDataType(dataType)) {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }

    return generateCuid()
  }

  if (isTextualDataType(dataType)) {
    return generateCuid()
  }

  return undefined
}

function generateCuid(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 12)
  return `c${timestamp}${random}`.slice(0, 25)
}

function isTextualDataType(dataType: string): boolean {
  return /(char|text|string)/i.test(dataType)
}

function isUuidDataType(dataType: string): boolean {
  return /uuid/i.test(dataType)
}

function isDateTimeDataType(dataType: string): boolean {
  return /(date|time)/i.test(dataType)
}

function isBooleanDataType(dataType: string): boolean {
  return /bool/i.test(dataType)
}

function isNumericDataType(dataType: string): boolean {
  return /(int|numeric|decimal|float|double|real|serial)/i.test(dataType)
}

function isJsonLikeDataType(dataType: string): boolean {
  return /(json|map|array|object)/i.test(dataType)
}

function cloneRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) => ({ ...row }))
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true
  }

  return JSON.stringify(left) === JSON.stringify(right)
}

function resolveCommandScopedColumn(schema: TableSchema, draftColumn: string): string | null {
  const candidate = draftColumn.trim().toLowerCase()
  if (!candidate) {
    return schema.columns[0]?.name ?? null
  }

  const exact = schema.columns.find((column) => column.name.toLowerCase() === candidate)
  if (exact) {
    return exact.name
  }

  const startsWith = schema.columns.find((column) => column.name.toLowerCase().startsWith(candidate))
  if (startsWith) {
    return startsWith.name
  }

  return null
}

function buildCreateTableTemplateSql(engine: DatabaseEngine, schema: TableSchema): string {
  const columnsSql = schema.columns
    .map((column) => {
      const nullability = column.nullable ? '' : ' NOT NULL'
      return `  ${quoteSqlIdentifier(engine, column.name)} ${column.dataType}${nullability}`
    })
    .join(',\n')

  const primaryKeySql =
    schema.primaryKey.length > 0
      ? `,\n  PRIMARY KEY (${schema.primaryKey.map((column) => quoteSqlIdentifier(engine, column)).join(', ')})`
      : ''

  return `CREATE TABLE ${quoteSqlIdentifier(engine, schema.table.schema)}.${quoteSqlIdentifier(engine, schema.table.name)} (\n${columnsSql}${primaryKeySql}\n);`
}

function buildInsertTemplateSql(engine: DatabaseEngine, schema: TableSchema): string {
  const columns = schema.columns.map((column) => quoteSqlIdentifier(engine, column.name))
  const placeholders = schema.columns.map(() => '?')

  return `INSERT INTO ${quoteSqlIdentifier(engine, schema.table.schema)}.${quoteSqlIdentifier(engine, schema.table.name)} (\n  ${columns.join(',\n  ')}\n)\nVALUES (\n  ${placeholders.join(',\n  ')}\n);`
}

function quoteSqlIdentifier(engine: DatabaseEngine, identifier: string): string {
  if (engine === 'clickhouse') {
    return '`' + identifier.replace(/`/g, '``') + '`'
  }

  return `"${identifier.replace(/"/g, '""')}"`
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL'
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}

function formatTableLabel(table: TableRef): string {
  if (table.schema === 'public' || table.schema === 'default') {
    return table.name
  }

  return `${table.schema}.${table.name}`
}

function formatSidebarTableName(table: TableRef): string {
  return table.name
}

function engineLabel(engine: DatabaseEngine): string {
  return engine === 'postgres' ? 'Postgres' : 'ClickHouse'
}

function defaultPortByEngine(engine: DatabaseEngine): number {
  return engine === 'postgres' ? 5432 : 8123
}

function normalizeHexColor(color?: string): string {
  const normalized = color?.trim().toUpperCase()
  if (!normalized) {
    return DEFAULT_ENVIRONMENT_COLOR
  }

  const hexMatch = normalized.match(/^#([0-9A-F]{6})$/)
  if (hexMatch) {
    return `#${hexMatch[1]}`
  }

  const shortHexMatch = normalized.match(/^#([0-9A-F]{3})$/)
  if (shortHexMatch) {
    const [r, g, b] = shortHexMatch[1].split('')
    return `#${r}${r}${g}${g}${b}${b}`
  }

  return DEFAULT_ENVIRONMENT_COLOR
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = normalizeHexColor(hex).slice(1)

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  }
}

function getSqlStatementAtCursor(sqlText: string, cursorOffset: number): string | null {
  const segments = splitSqlSegmentsWithRange(sqlText)
  if (segments.length === 0) {
    return null
  }

  const cursor = Math.max(0, Math.min(cursorOffset, sqlText.length))
  const exact = segments.find((segment) => cursor >= segment.start && cursor <= segment.end)
  if (exact) {
    return exact.sql
  }

  const previous = [...segments].reverse().find((segment) => segment.start <= cursor)
  if (previous) {
    return previous.sql
  }

  return segments[0].sql
}

function splitSqlSegmentsWithRange(sqlText: string): Array<{ sql: string; start: number; end: number }> {
  const segments: Array<{ sql: string; start: number; end: number }> = []
  const source = sqlText

  let chunkStart = 0
  let inSingleQuote = false
  let inDoubleQuote = false
  let inLineComment = false
  let inBlockComment = false

  const pushChunk = (start: number, end: number): void => {
    const chunk = source.slice(start, end)
    if (!chunk.trim()) {
      return
    }

    const leftOffset = chunk.search(/\S/)
    if (leftOffset < 0) {
      return
    }

    const rightOffset = chunk.length - chunk.trimEnd().length
    const statementStart = start + leftOffset
    const statementEnd = end - rightOffset

    segments.push({
      sql: source.slice(statementStart, statementEnd),
      start: statementStart,
      end: statementEnd,
    })
  }

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const nextChar = source[index + 1]

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false
      }
      continue
    }

    if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        inBlockComment = false
        index += 1
      }
      continue
    }

    if (inSingleQuote) {
      if (char === "'" && nextChar === "'") {
        index += 1
        continue
      }

      if (char === "'") {
        inSingleQuote = false
      }
      continue
    }

    if (inDoubleQuote) {
      if (char === '"' && nextChar === '"') {
        index += 1
        continue
      }

      if (char === '"') {
        inDoubleQuote = false
      }
      continue
    }

    if (char === '-' && nextChar === '-') {
      inLineComment = true
      index += 1
      continue
    }

    if (char === '/' && nextChar === '*') {
      inBlockComment = true
      index += 1
      continue
    }

    if (char === "'") {
      inSingleQuote = true
      continue
    }

    if (char === '"') {
      inDoubleQuote = true
      continue
    }

    if (char === ';') {
      pushChunk(chunkStart, index)
      chunkStart = index + 1
    }
  }

  pushChunk(chunkStart, source.length)

  return segments
}

async function buildClickHouseUnknownTableFallbackSql(
  connections: ConnectionSummary[],
  connectionId: string,
  sqlText: string,
  error: unknown,
): Promise<string | null> {
  const connection = connections.find((candidate) => candidate.id === connectionId)
  if (!connection || connection.engine !== 'clickhouse') {
    return null
  }

  const message = getErrorMessage(error)
  const missingTableMatch = message.match(/Unknown table expression identifier '([^']+)'/i)
  const missingTable = missingTableMatch?.[1]?.trim()
  if (!missingTable || missingTable.includes('.')) {
    return null
  }

  const allTables = await window.pointerApi.listTables(connectionId)
  const matches = allTables.filter((table) => table.name.toLowerCase() === missingTable.toLowerCase())

  if (matches.length === 0) {
    return null
  }

  if (matches.length > 1) {
    throw new Error(
      `Tabela "${missingTable}" existe em múltiplos schemas. Use schema.tabela (ex: ${matches[0].fqName}).`,
    )
  }

  const replacement = `${matches[0].schema}.${matches[0].name}`
  const regex = new RegExp(
    `\\b(from|join)\\s+(?:\\\`)?${escapeRegExp(missingTable)}(?:\\\`)?(?!\\s*\\.)`,
    'gi',
  )

  const rewritten = sqlText.replace(regex, (_match, keyword: string) => `${keyword} ${replacement}`)
  if (rewritten === sqlText) {
    return null
  }

  return rewritten
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function coerceValueByOriginal(nextValue: string, originalValue: unknown): unknown {
  if (nextValue === '') {
    return null
  }

  if (typeof originalValue === 'number') {
    const parsed = Number(nextValue)
    return Number.isNaN(parsed) ? nextValue : parsed
  }

  if (typeof originalValue === 'boolean') {
    const normalized = nextValue.trim().toLowerCase()
    if (normalized === 'true') {
      return true
    }

    if (normalized === 'false') {
      return false
    }
  }

  if (typeof originalValue === 'object' && originalValue !== null) {
    try {
      return JSON.parse(nextValue)
    } catch {
      return nextValue
    }
  }

  return nextValue
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'Erro inesperado.'
}

export default App
