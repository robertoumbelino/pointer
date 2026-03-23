import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type SetStateAction,
} from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Download, Link2, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { ColumnForeignKeyRef, TableFilterOperator, TableSort } from '../../../../shared/db-types'
import type { EditingCell, TableCellPosition, TableReloadOverrides, TableTab } from '../../../entities/workspace/types'
import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../../components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog'
import { Input } from '../../../components/ui/input'
import { Textarea } from '../../../components/ui/textarea'
import { cn } from '../../../lib/utils'
import { TABLE_PAGE_SIZE_MAX } from '../../../shared/constants/app'
import { isArrayDataType, isBooleanDataType, isJsonLikeDataType, parseArrayInputValue } from '../../../shared/lib/workspace-utils'

type JsonEditorCellState = {
  rowIndex: number
  columnName: string
  dataType: string
  canEdit: boolean
}

const NULL_SELECT_VALUE = '__pointer_null__'
const UNSET_SELECT_VALUE = '__pointer_unset__'
const SELECT_OPTION_PREFIX = 'option:'
const BOOLEAN_SELECT_OPTIONS = ['true', 'false']

function encodeSelectOptionValue(value: string): string {
  return `${SELECT_OPTION_PREFIX}${value}`
}

function decodeSelectOptionValue(value: string): string | null {
  if (value === NULL_SELECT_VALUE) {
    return null
  }

  if (value === UNSET_SELECT_VALUE) {
    return ''
  }

  if (value.startsWith(SELECT_OPTION_PREFIX)) {
    return value.slice(SELECT_OPTION_PREFIX.length)
  }

  return value
}

function resolveSelectValue(
  rawValue: unknown,
  options: {
    nullable: boolean
    fallbackValue?: string
    allowUnset?: boolean
  },
): string {
  const { nullable, fallbackValue, allowUnset = false } = options

  if (rawValue === null) {
    return NULL_SELECT_VALUE
  }

  if (typeof rawValue === 'string') {
    if (rawValue === '' && allowUnset) {
      return UNSET_SELECT_VALUE
    }

    if (rawValue === '' && nullable) {
      return NULL_SELECT_VALUE
    }

    return encodeSelectOptionValue(rawValue)
  }

  if (rawValue === undefined) {
    if (allowUnset) {
      return UNSET_SELECT_VALUE
    }

    if (nullable) {
      return NULL_SELECT_VALUE
    }

    if (fallbackValue !== undefined) {
      return encodeSelectOptionValue(fallbackValue)
    }

    return UNSET_SELECT_VALUE
  }

  return encodeSelectOptionValue(String(rawValue))
}

function formatJsonEditorValue(value: unknown, dataType: string): string {
  if (value === null || value === undefined) {
    return ''
  }

  if (isArrayDataType(dataType)) {
    if (Array.isArray(value)) {
      return JSON.stringify(value, null, 2)
    }

    if (typeof value === 'string') {
      const parsedArray = parseArrayInputValue(value)
      if (parsedArray !== undefined) {
        return JSON.stringify(parsedArray, null, 2)
      }

      return value
    }
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return JSON.stringify(parsed, null, 2)
    } catch {
      return value
    }
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function formatJsonPreviewValue(value: unknown, dataType: string): string {
  if (value === null || value === undefined) {
    return 'NULL'
  }

  if (isArrayDataType(dataType)) {
    if (Array.isArray(value)) {
      return JSON.stringify(value)
    }

    if (typeof value === 'string') {
      const parsedArray = parseArrayInputValue(value)
      if (parsedArray !== undefined) {
        return JSON.stringify(parsedArray)
      }

      return value
    }
  }

  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value))
    } catch {
      return value
    }
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function hasForeignKeyCellValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false
  }

  return String(value).trim().length > 0
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function buildRowRange(start: number, end: number): number[] {
  const min = Math.min(start, end)
  const max = Math.max(start, end)
  const range: number[] = []
  for (let index = min; index <= max; index += 1) {
    range.push(index)
  }
  return range
}

function isInteractiveCellTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return Boolean(target.closest('input, textarea, select, button, a, [contenteditable="true"]'))
}

type TableWorkspacePanelProps = {
  activeTableTab: TableTab
  saveActiveTableChanges: () => Promise<void>
  isSavingTableChanges: boolean
  reloadTableTab: (tabId: string, overrides?: TableReloadOverrides) => Promise<void>
  navigateToForeignKey: (sourceTab: TableTab, foreignKey: ColumnForeignKeyRef | undefined, value: unknown) => Promise<void>
  closeTableTab: (tabId: string) => void
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
  formatTableLabel: (table: TableTab['table']) => string
  engineLabel: (engine: TableTab['engine']) => string
  exportTableCurrentPageCsv: (tabId: string) => void
  exportTableAllPagesCsv: (tabId: string) => Promise<void>
}

export function TableWorkspacePanel({
  activeTableTab,
  saveActiveTableChanges,
  isSavingTableChanges,
  reloadTableTab,
  navigateToForeignKey,
  closeTableTab,
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
  exportTableCurrentPageCsv,
  exportTableAllPagesCsv,
}: TableWorkspacePanelProps): JSX.Element {
  const [jsonEditorCell, setJsonEditorCell] = useState<JsonEditorCellState | null>(null)
  const [jsonEditorValue, setJsonEditorValue] = useState('')
  const [pageSizeInput, setPageSizeInput] = useState(() => String(activeTableTab.pageSize))
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false)
  const [isExportingAllPages, setIsExportingAllPages] = useState(false)
  const gridContainerRef = useRef<HTMLDivElement | null>(null)
  const insertRowRef = useRef<HTMLTableRowElement | null>(null)
  const firstInsertFieldRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null)
  const previousInsertStateRef = useRef<{ tabId: string; isOpen: boolean } | null>(null)
  const cellDragAnchorRef = useRef<TableCellPosition | null>(null)
  const didDragSelectionRef = useRef(false)
  const effectivePageSize = activeTableTab.data?.pageSize ?? activeTableTab.pageSize
  const hasLoadError = Boolean(activeTableTab.loadError)
  const isInitialTableLoading = activeTableTab.loading && !activeTableTab.data
  const isBackgroundTableReload = activeTableTab.loading && Boolean(activeTableTab.data) && !hasLoadError
  const isTableActionDisabled = activeTableTab.loading || isSavingTableChanges
  const columns = useMemo(() => activeTableTab.schema?.columns ?? [], [activeTableTab.schema?.columns])
  const rowCount = activeTableTab.data?.rows.length ?? 0
  const columnCount = columns.length
  const selectedRowsSet = useMemo(() => new Set(activeTableTab.selectedRowIndexes), [activeTableTab.selectedRowIndexes])
  const hasSelectedRows = activeTableTab.selectedRowIndexes.length > 0

  useEffect(() => {
    setPageSizeInput(String(activeTableTab.pageSize))
  }, [activeTableTab.id, activeTableTab.pageSize])

  useEffect(() => {
    const handleMouseUp = (): void => {
      cellDragAnchorRef.current = null
    }

    window.addEventListener('mouseup', handleMouseUp)
    return () => window.removeEventListener('mouseup', handleMouseUp)
  }, [])

  useEffect(() => {
    const isInsertOpen = Boolean(activeTableTab.insertDraft)
    const previousState = previousInsertStateRef.current

    if (!previousState || previousState.tabId !== activeTableTab.id) {
      previousInsertStateRef.current = {
        tabId: activeTableTab.id,
        isOpen: isInsertOpen,
      }
      return
    }

    const didOpenInsert = !previousState.isOpen && isInsertOpen
    previousInsertStateRef.current = {
      tabId: activeTableTab.id,
      isOpen: isInsertOpen,
    }

    if (!didOpenInsert) {
      return
    }

    const gridContainer = gridContainerRef.current
    if (gridContainer) {
      gridContainer.scrollTo({
        top: gridContainer.scrollHeight,
        left: gridContainer.scrollLeft,
      })
    } else {
      insertRowRef.current?.scrollIntoView({ block: 'end' })
    }

    requestAnimationFrame(() => {
      firstInsertFieldRef.current?.focus({ preventScroll: true })
    })
  }, [activeTableTab.id, activeTableTab.insertDraft])

  const closeJsonEditor = (): void => {
    setJsonEditorCell(null)
    setJsonEditorValue('')
  }

  const saveJsonEditor = (): void => {
    if (!jsonEditorCell) {
      return
    }

    if (!jsonEditorCell.canEdit) {
      closeJsonEditor()
      return
    }

    const trimmed = jsonEditorValue.trim()
    if (!trimmed) {
      commitInlineEdit({
        tabId: activeTableTab.id,
        rowIndex: jsonEditorCell.rowIndex,
        column: jsonEditorCell.columnName,
        value: '',
      })
      closeJsonEditor()
      return
    }

    try {
      if (isArrayDataType(jsonEditorCell.dataType)) {
        const parsedArray = parseArrayInputValue(trimmed)
        if (parsedArray === undefined) {
          toast.error('Array inválido. Use JSON (ex: ["WHATSAPP"]) ou literal Postgres (ex: {WHATSAPP}).')
          return
        }

        commitInlineEdit({
          tabId: activeTableTab.id,
          rowIndex: jsonEditorCell.rowIndex,
          column: jsonEditorCell.columnName,
          value: JSON.stringify(parsedArray),
        })
        closeJsonEditor()
        return
      }

      const normalizedJson = JSON.stringify(JSON.parse(trimmed))
      commitInlineEdit({
        tabId: activeTableTab.id,
        rowIndex: jsonEditorCell.rowIndex,
        column: jsonEditorCell.columnName,
        value: normalizedJson,
      })
      closeJsonEditor()
    } catch {
      toast.error('JSON inválido. Corrija o conteúdo antes de salvar.')
    }
  }

  const applyPageSize = (): void => {
    const parsed = Number.parseInt(pageSizeInput, 10)
    if (!Number.isFinite(parsed)) {
      toast.error(`Informe um limite entre 1 e ${TABLE_PAGE_SIZE_MAX}.`)
      setPageSizeInput(String(activeTableTab.pageSize))
      return
    }

    const normalized = Math.min(TABLE_PAGE_SIZE_MAX, Math.max(1, Math.trunc(parsed)))
    setPageSizeInput(String(normalized))

    if (normalized === activeTableTab.pageSize) {
      return
    }

    updateTableTab(activeTableTab.id, (tab) => ({
      ...tab,
      page: 0,
      pageSize: normalized,
    }))

    void reloadTableTab(activeTableTab.id, {
      page: 0,
      pageSize: normalized,
    })
  }

  const handleExportCurrentPage = (): void => {
    exportTableCurrentPageCsv(activeTableTab.id)
    setIsExportDialogOpen(false)
  }

  const handleExportAllPages = async (): Promise<void> => {
    setIsExportingAllPages(true)

    try {
      await exportTableAllPagesCsv(activeTableTab.id)
      setIsExportDialogOpen(false)
    } finally {
      setIsExportingAllPages(false)
    }
  }

  const focusGrid = (): void => {
    gridContainerRef.current?.focus()
  }

  const openJsonEditorForCell = (
    rowIndex: number,
    columnName: string,
    dataType: string,
    value: unknown,
    canEdit: boolean,
  ): void => {
    cancelInlineEdit()
    setJsonEditorCell({
      rowIndex,
      columnName,
      dataType,
      canEdit,
    })
    setJsonEditorValue(formatJsonEditorValue(value, dataType))
  }

  const normalizeCellPosition = (position: TableCellPosition): TableCellPosition => ({
    rowIndex: clamp(position.rowIndex, 0, Math.max(0, rowCount - 1)),
    columnIndex: clamp(position.columnIndex, 0, Math.max(0, columnCount - 1)),
  })

  const setSingleCellSelection = (position: TableCellPosition): void => {
    const nextPosition = normalizeCellPosition(position)

    updateTableTab(activeTableTab.id, (tab) => ({
      ...tab,
      selectionMode: 'cell',
      selectedRowIndexes: [],
      rowAnchorIndex: null,
      activeRowIndex: nextPosition.rowIndex,
      activeCell: nextPosition,
      cellAnchor: nextPosition,
      selectedCellRange: {
        start: nextPosition,
        end: nextPosition,
      },
    }))
  }

  const handleRowSelectorClick = (event: ReactMouseEvent<HTMLButtonElement>, rowIndex: number): void => {
    if (rowCount === 0) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    focusGrid()
    cellDragAnchorRef.current = null

    const normalizedRow = clamp(rowIndex, 0, rowCount - 1)
    const activeColumnIndex = clamp(activeTableTab.activeCell?.columnIndex ?? 0, 0, Math.max(0, columnCount - 1))
    const isMetaToggle = event.metaKey || event.ctrlKey

    updateTableTab(activeTableTab.id, (tab) => {
      if (event.shiftKey) {
        const anchor = clamp(
          tab.rowAnchorIndex ?? tab.activeRowIndex ?? tab.activeCell?.rowIndex ?? normalizedRow,
          0,
          rowCount - 1,
        )

        return {
          ...tab,
          selectionMode: 'row',
          selectedRowIndexes: buildRowRange(anchor, normalizedRow),
          rowAnchorIndex: anchor,
          activeRowIndex: normalizedRow,
          activeCell: {
            rowIndex: normalizedRow,
            columnIndex: activeColumnIndex,
          },
          cellAnchor: null,
          selectedCellRange: null,
        }
      }

      if (isMetaToggle) {
        const alreadySelected = tab.selectedRowIndexes.includes(normalizedRow)
        const nextSelected = alreadySelected
          ? tab.selectedRowIndexes.filter((index) => index !== normalizedRow)
          : [...tab.selectedRowIndexes, normalizedRow]

        return {
          ...tab,
          selectionMode: 'row',
          selectedRowIndexes: Array.from(new Set(nextSelected)).sort((a, b) => a - b),
          rowAnchorIndex: normalizedRow,
          activeRowIndex: normalizedRow,
          activeCell: {
            rowIndex: normalizedRow,
            columnIndex: activeColumnIndex,
          },
          cellAnchor: null,
          selectedCellRange: null,
        }
      }

      return {
        ...tab,
        selectionMode: 'row',
        selectedRowIndexes: [normalizedRow],
        rowAnchorIndex: normalizedRow,
        activeRowIndex: normalizedRow,
        activeCell: {
          rowIndex: normalizedRow,
          columnIndex: activeColumnIndex,
        },
        cellAnchor: null,
        selectedCellRange: null,
      }
    })
  }

  const handleCellMouseDown = (
    event: ReactMouseEvent<HTMLTableCellElement>,
    rowIndex: number,
    columnIndex: number,
  ): void => {
    if (rowCount === 0 || columnCount === 0 || event.button !== 0) {
      return
    }

    if (isInteractiveCellTarget(event.target)) {
      return
    }

    event.preventDefault()
    focusGrid()
    const position = normalizeCellPosition({ rowIndex, columnIndex })
    if (event.shiftKey) {
      cellDragAnchorRef.current = null
      return
    }

    didDragSelectionRef.current = false
    cellDragAnchorRef.current = position
    setSingleCellSelection(position)
  }

  const handleCellMouseEnter = (
    event: ReactMouseEvent<HTMLTableCellElement>,
    rowIndex: number,
    columnIndex: number,
  ): void => {
    if (rowCount === 0 || columnCount === 0) {
      return
    }

    if (isInteractiveCellTarget(event.target)) {
      return
    }

    const anchor = cellDragAnchorRef.current
    if (!anchor || (event.buttons & 1) === 0) {
      return
    }

    const current = normalizeCellPosition({ rowIndex, columnIndex })
    if (current.rowIndex !== anchor.rowIndex || current.columnIndex !== anchor.columnIndex) {
      didDragSelectionRef.current = true
    }
    updateTableTab(activeTableTab.id, (tab) => ({
      ...tab,
      selectionMode: 'cell',
      selectedRowIndexes: [],
      rowAnchorIndex: null,
      activeRowIndex: current.rowIndex,
      activeCell: current,
      cellAnchor: anchor,
      selectedCellRange: {
        start: anchor,
        end: current,
      },
    }))
  }

  const handleCellClick = (
    event: ReactMouseEvent<HTMLTableCellElement>,
    rowIndex: number,
    columnIndex: number,
  ): void => {
    if (rowCount === 0 || columnCount === 0) {
      return
    }

    if (isInteractiveCellTarget(event.target)) {
      return
    }

    focusGrid()
    const current = normalizeCellPosition({ rowIndex, columnIndex })

    if (didDragSelectionRef.current && !event.shiftKey) {
      didDragSelectionRef.current = false
      return
    }

    if (event.shiftKey) {
      const anchor = normalizeCellPosition(activeTableTab.cellAnchor ?? activeTableTab.activeCell ?? current)
      updateTableTab(activeTableTab.id, (tab) => ({
        ...tab,
        selectionMode: 'cell',
        selectedRowIndexes: [],
        rowAnchorIndex: null,
        activeRowIndex: current.rowIndex,
        activeCell: current,
        cellAnchor: anchor,
        selectedCellRange: {
          start: anchor,
          end: current,
        },
      }))
      return
    }

    setSingleCellSelection(current)
  }

  const handleCellDoubleClick = (
    rowIndex: number,
    columnIndex: number,
    columnName: string,
    dataType: string,
    value: unknown,
    canEditCell: boolean,
    isJsonColumn: boolean,
  ): void => {
    const position = normalizeCellPosition({ rowIndex, columnIndex })
    setSingleCellSelection(position)

    if (isJsonColumn) {
      openJsonEditorForCell(rowIndex, columnName, dataType, value, canEditCell)
      return
    }

    if (canEditCell) {
      beginInlineEdit(rowIndex, columnName)
    }
  }

  const handleGridKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const isTypingTarget = Boolean(
      (event.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable="true"]'),
    )

    if (isTypingTarget || rowCount === 0 || columnCount === 0) {
      return
    }

    if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const fallbackRowIndex = clamp(
        activeTableTab.activeRowIndex ?? activeTableTab.selectedRowIndexes[0] ?? activeTableTab.activeCell?.rowIndex ?? 0,
        0,
        rowCount - 1,
      )
      const fallbackColumnIndex = clamp(activeTableTab.activeCell?.columnIndex ?? 0, 0, columnCount - 1)
      const targetCell =
        activeTableTab.selectionMode === 'row'
          ? {
              rowIndex: fallbackRowIndex,
              columnIndex: fallbackColumnIndex,
            }
          : normalizeCellPosition(activeTableTab.activeCell ?? { rowIndex: 0, columnIndex: 0 })

      const column = columns[targetCell.columnIndex]
      const row = activeTableTab.data?.rows[targetCell.rowIndex]

      if (!column || !row) {
        return
      }

      const isJsonColumn = isJsonLikeDataType(column.dataType)
      const isPendingDelete = activeTableTab.pendingDeletes.includes(targetCell.rowIndex)
      const canEditCell = !column.isPrimaryKey && Boolean(activeTableTab.schema?.supportsRowEdit) && !isPendingDelete

      event.preventDefault()
      if (isJsonColumn) {
        openJsonEditorForCell(targetCell.rowIndex, column.name, column.dataType, row[column.name], canEditCell)
        return
      }

      if (canEditCell) {
        beginInlineEdit(targetCell.rowIndex, column.name)
      }
      return
    }

    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      return
    }

    if (activeTableTab.selectionMode === 'row') {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
        return
      }

      event.preventDefault()
      const step = event.key === 'ArrowUp' ? -1 : 1
      const anchor = clamp(
        activeTableTab.rowAnchorIndex ?? activeTableTab.activeRowIndex ?? activeTableTab.activeCell?.rowIndex ?? 0,
        0,
        rowCount - 1,
      )
      const current = clamp(activeTableTab.activeRowIndex ?? anchor, 0, rowCount - 1)
      const nextRow = clamp(current + step, 0, rowCount - 1)
      const nextColumnIndex = clamp(activeTableTab.activeCell?.columnIndex ?? 0, 0, columnCount - 1)

      updateTableTab(activeTableTab.id, (tab) => {
        if (event.shiftKey) {
          return {
            ...tab,
            selectionMode: 'row',
            selectedRowIndexes: buildRowRange(anchor, nextRow),
            rowAnchorIndex: anchor,
            activeRowIndex: nextRow,
            activeCell: {
              rowIndex: nextRow,
              columnIndex: nextColumnIndex,
            },
            cellAnchor: null,
            selectedCellRange: null,
          }
        }

        return {
          ...tab,
          selectionMode: 'row',
          selectedRowIndexes: [nextRow],
          rowAnchorIndex: nextRow,
          activeRowIndex: nextRow,
          activeCell: {
            rowIndex: nextRow,
            columnIndex: nextColumnIndex,
          },
          cellAnchor: null,
          selectedCellRange: null,
        }
      })
      return
    }

    event.preventDefault()
    const current = normalizeCellPosition(activeTableTab.activeCell ?? { rowIndex: 0, columnIndex: 0 })
    const next = {
      rowIndex:
        event.key === 'ArrowUp'
          ? current.rowIndex - 1
          : event.key === 'ArrowDown'
            ? current.rowIndex + 1
            : current.rowIndex,
      columnIndex:
        event.key === 'ArrowLeft'
          ? current.columnIndex - 1
          : event.key === 'ArrowRight'
            ? current.columnIndex + 1
            : current.columnIndex,
    }
    const nextPosition = normalizeCellPosition(next)

    updateTableTab(activeTableTab.id, (tab) => {
      if (event.shiftKey) {
        const anchor = normalizeCellPosition(tab.cellAnchor ?? tab.activeCell ?? current)
        return {
          ...tab,
          selectionMode: 'cell',
          selectedRowIndexes: [],
          rowAnchorIndex: null,
          activeRowIndex: nextPosition.rowIndex,
          activeCell: nextPosition,
          cellAnchor: anchor,
          selectedCellRange: {
            start: anchor,
            end: nextPosition,
          },
        }
      }

      return {
        ...tab,
        selectionMode: 'cell',
        selectedRowIndexes: [],
        rowAnchorIndex: null,
        activeRowIndex: nextPosition.rowIndex,
        activeCell: nextPosition,
        cellAnchor: nextPosition,
        selectedCellRange: {
          start: nextPosition,
          end: nextPosition,
        },
      }
    })
  }

  const isCellInSelectedRange = (rowIndex: number, columnIndex: number): boolean => {
    if (activeTableTab.selectionMode !== 'cell' || !activeTableTab.selectedCellRange) {
      return false
    }

    const minRow = Math.min(activeTableTab.selectedCellRange.start.rowIndex, activeTableTab.selectedCellRange.end.rowIndex)
    const maxRow = Math.max(activeTableTab.selectedCellRange.start.rowIndex, activeTableTab.selectedCellRange.end.rowIndex)
    const minCol = Math.min(
      activeTableTab.selectedCellRange.start.columnIndex,
      activeTableTab.selectedCellRange.end.columnIndex,
    )
    const maxCol = Math.max(
      activeTableTab.selectedCellRange.start.columnIndex,
      activeTableTab.selectedCellRange.end.columnIndex,
    )

    return rowIndex >= minRow && rowIndex <= maxRow && columnIndex >= minCol && columnIndex <= maxCol
  }

  return (
    <div className='pointer-card flex h-full flex-col overflow-hidden'>
      <div className='flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/70 px-3 py-2.5'>
        <div>
          <p className='text-[11px] uppercase tracking-[0.2em] text-slate-500'>
            {hasLoadError ? 'Conexão atual' : 'Tabela atual'}
          </p>
          <h2 className='text-sm font-semibold'>
            {hasLoadError ? activeTableTab.connectionName : formatTableLabel(activeTableTab.table)}
            <span className='ml-2 text-xs text-slate-400'>
              ({engineLabel(activeTableTab.engine)})
            </span>
          </h2>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          {!hasLoadError && (
            <div className='flex items-center gap-2'>
              <select
                className='h-8 rounded-md border border-slate-700 bg-slate-900 px-2.5 text-[13px] outline-none ring-slate-300/45 focus:ring-2'
                value={activeTableTab.filterColumn}
                disabled={isTableActionDisabled}
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
                disabled={isTableActionDisabled}
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
                <option value='in'>in</option>
              </select>
              <Input
                className='h-8 w-44 text-[13px]'
                placeholder={activeTableTab.filterOperator === 'in' ? 'Ex: 1,2,3' : 'Filtrar por valor'}
                value={activeTableTab.filterValue}
                disabled={isTableActionDisabled}
                onChange={(event) =>
                  updateTableTab(activeTableTab.id, (tab) => ({
                    ...tab,
                    filterValue: event.target.value,
                    page: 0,
                  }))
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !isTableActionDisabled) {
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
                disabled={isTableActionDisabled}
                onClick={() =>
                  void reloadTableTab(activeTableTab.id, {
                    page: 0,
                    filterColumn: activeTableTab.filterColumn,
                    filterOperator: activeTableTab.filterOperator,
                    filterValue: activeTableTab.filterValue,
                  })
                }
              >
                Filtrar
              </Button>
            </div>
          )}
          <Button
            variant='outline'
            size='sm'
            className='h-8 text-[13px]'
            disabled={isTableActionDisabled}
            onClick={() => void reloadTableTab(activeTableTab.id)}
          >
            <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', activeTableTab.loading && 'animate-spin')} />
            Atualizar
          </Button>
          {!hasLoadError && (
            <Button
              variant='secondary'
              size='sm'
              className='h-8 text-[13px]'
              disabled={isTableActionDisabled}
              onClick={handleToggleInsertDraftRow}
            >
              <Plus className='mr-1.5 h-3.5 w-3.5' /> {activeTableTab.insertDraft ? 'Cancelar insert' : 'Inserir'}
            </Button>
          )}
          {!hasLoadError && (
            <Button
              variant='outline'
              size='sm'
              className='h-8 text-[13px]'
              disabled={isTableActionDisabled}
              onClick={() => void saveActiveTableChanges()}
            >
              {isSavingTableChanges ? (
                <RefreshCw className='mr-1.5 h-3.5 w-3.5 animate-spin' />
              ) : (
                <Save className='mr-1.5 h-3.5 w-3.5' />
              )}
              {isSavingTableChanges ? 'Salvando...' : 'Salvar'}
            </Button>
          )}
          {!hasLoadError && (
            <Button
              variant='destructive'
              size='sm'
              className='h-8 text-[13px]'
              disabled={isTableActionDisabled || !hasSelectedRows || !activeTableTab.schema?.supportsRowEdit}
              onClick={() => void handleDeleteRow()}
            >
              <Trash2 className='mr-1.5 h-3.5 w-3.5' /> Excluir
            </Button>
          )}
        </div>
      </div>

      <div className='m-3 mb-2 min-h-0 flex-1 overflow-hidden'>
        {hasLoadError ? (
          <div className='pointer-card-soft flex h-full flex-col items-center justify-center gap-3 px-6 text-center'>
            <p className='text-sm font-semibold text-slate-200'>Falha ao carregar a tabela</p>
            <p className='max-w-2xl text-sm text-slate-400'>{activeTableTab.loadError}</p>
            <div className='flex flex-wrap items-center justify-center gap-2'>
              <Button
                variant='outline'
                size='sm'
                className='h-8 text-[13px]'
                onClick={() => void reloadTableTab(activeTableTab.id)}
              >
                <RefreshCw className='mr-1.5 h-3.5 w-3.5' /> Reconectar
              </Button>
              <Button
                variant='ghost'
                size='sm'
                className='h-8 text-[13px]'
                onClick={() => closeTableTab(activeTableTab.id)}
              >
                Fechar aba
              </Button>
            </div>
          </div>
        ) : isInitialTableLoading ? (
          <div className='pointer-card-soft flex h-full items-center justify-center gap-2 text-sm text-slate-400'>
            <RefreshCw className='h-4 w-4 animate-spin text-slate-300' />
            <span>Carregando estrutura e dados da tabela...</span>
          </div>
        ) : (
          <>
            <div className='relative h-full'>
              <div
                ref={gridContainerRef}
                tabIndex={0}
                onKeyDown={handleGridKeyDown}
                className='pointer-card-soft h-full overflow-auto outline-none focus-visible:outline-none'
              >
                <table className='min-w-max border-collapse text-sm'>
                  <thead className='sticky top-0 z-10 bg-slate-900'>
                    <tr>
                      <th className='w-10 border-b border-slate-800/80 px-1 py-2 text-center font-semibold text-slate-400'>
                        #
                      </th>
                      {columns.map((column) => (
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
                            {activeTableTab.loading && activeTableTab.sort?.column === column.name ? (
                              <RefreshCw className='h-3.5 w-3.5 animate-spin text-slate-300' />
                            ) : activeTableTab.sort?.column === column.name && (
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
                      const isRowSelected = selectedRowsSet.has(rowIndex)
                      const isPendingDelete = activeTableTab.pendingDeletes.includes(rowIndex)
                      const isPendingUpdate = Boolean(activeTableTab.pendingUpdates[rowIndex])
                      const isActiveRow = activeTableTab.activeRowIndex === rowIndex

                      return (
                        <tr
                          key={`${rowIndex}-${JSON.stringify(row)}`}
                          className={cn(
                            'border-b border-slate-800/70 transition-colors',
                            isPendingDelete
                              ? 'bg-red-500/22 hover:bg-red-500/28 shadow-[inset_0_0_0_1px_rgba(248,113,113,0.48)]'
                              : isPendingUpdate
                                ? 'bg-amber-400/20 hover:bg-amber-400/28 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.42)]'
                                : isRowSelected
                                  ? 'bg-slate-200/10'
                                  : 'hover:bg-slate-800/50',
                            isRowSelected && 'shadow-[inset_0_0_0_1px_rgba(148,163,184,0.45)]',
                          )}
                        >
                          <td
                            className={cn(
                              'sticky left-0 z-[1] border-r border-slate-800/70 px-1 py-1 text-center',
                              isPendingDelete
                                ? 'bg-red-500/20'
                                : isPendingUpdate
                                  ? 'bg-amber-400/18'
                                  : isRowSelected
                                    ? 'bg-slate-700/70'
                                    : 'bg-slate-900/95',
                            )}
                          >
                            <button
                              type='button'
                              onClick={(event) => handleRowSelectorClick(event, rowIndex)}
                              className={cn(
                                'h-6 w-full rounded text-[10px] font-medium text-slate-200 transition-colors border border-transparent',
                                isRowSelected
                                  ? 'bg-slate-600/70 hover:bg-slate-600/85'
                                  : 'hover:bg-slate-800/70',
                                isActiveRow && 'border-slate-500/60',
                              )}
                            >
                              {rowIndex + 1}
                            </button>
                          </td>
                          {columns.map((column, columnIndex) => {
                            const isEditing =
                              editingCell?.tabId === activeTableTab.id &&
                              editingCell.rowIndex === rowIndex &&
                              editingCell.column === column.name
                            const cellValue = row[column.name]
                            const isJsonColumn = isJsonLikeDataType(column.dataType)
                            const isBooleanColumn = isBooleanDataType(column.dataType)
                            const enumValues = column.enumValues ?? []
                            const hasEnumColumnValues = enumValues.length > 0
                            const selectValues = hasEnumColumnValues
                              ? enumValues
                              : isBooleanColumn
                                ? BOOLEAN_SELECT_OPTIONS
                                : []
                            const hasSelectValues = selectValues.length > 0
                            const canEditCell =
                              !column.isPrimaryKey && Boolean(activeTableTab.schema?.supportsRowEdit) && !isPendingDelete
                            const canNavigateForeignKey = Boolean(column.foreignKey) && hasForeignKeyCellValue(cellValue)
                            const isActiveCell =
                              activeTableTab.activeCell?.rowIndex === rowIndex &&
                              activeTableTab.activeCell?.columnIndex === columnIndex
                            const isCellSelected = isCellInSelectedRange(rowIndex, columnIndex)

                            return (
                              <td
                                key={column.name}
                                className={cn(
                                  'min-w-[190px] px-3 py-2 text-slate-200 whitespace-nowrap',
                                  isJsonColumn && 'cursor-pointer',
                                  isPendingDelete
                                    ? 'bg-red-500/20'
                                    : isPendingUpdate
                                      ? 'bg-amber-400/18'
                                      : isCellSelected
                                        ? 'bg-slate-700/45'
                                        : '',
                                  isActiveCell && 'shadow-[inset_0_0_0_1px_rgba(148,163,184,0.8)]',
                                )}
                                onMouseDown={(event) => handleCellMouseDown(event, rowIndex, columnIndex)}
                                onMouseEnter={(event) => handleCellMouseEnter(event, rowIndex, columnIndex)}
                                onClick={(event) => handleCellClick(event, rowIndex, columnIndex)}
                                onDoubleClick={() =>
                                  handleCellDoubleClick(
                                    rowIndex,
                                    columnIndex,
                                    column.name,
                                    column.dataType,
                                    row[column.name],
                                    canEditCell,
                                    isJsonColumn,
                                  )
                                }
                              >
                                {isEditing ? (
                                  hasSelectValues ? (
                                    <select
                                      value={resolveSelectValue(editingCell.value, {
                                        nullable: column.nullable,
                                        fallbackValue: selectValues[0],
                                      })}
                                      autoFocus
                                      onChange={(event) => {
                                        const selected = decodeSelectOptionValue(event.target.value)
                                        const nextEditingCell: EditingCell = {
                                          tabId: activeTableTab.id,
                                          rowIndex,
                                          column: column.name,
                                          value: selected ?? '',
                                        }
                                        setEditingCell(nextEditingCell)
                                        commitInlineEdit(nextEditingCell)
                                      }}
                                      onBlur={() => commitInlineEdit()}
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
                                      className='h-8 w-full rounded-md border border-slate-700 bg-slate-900 px-2 text-sm text-slate-100 outline-none ring-slate-300/45 focus:ring-2'
                                    >
                                      {column.nullable && <option value={NULL_SELECT_VALUE}>NULL</option>}
                                      {selectValues.map((selectValue) => (
                                        <option key={selectValue} value={encodeSelectOptionValue(selectValue)}>
                                          {selectValue}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
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
                                      onBlur={() => commitInlineEdit()}
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
                                  )
                                ) : (
                                  <div className='flex items-center gap-1.5'>
                                    <span className={cn(isJsonColumn && 'font-mono text-[12px]')}>
                                      {isJsonColumn ? formatJsonPreviewValue(cellValue, column.dataType) : formatCell(cellValue)}
                                    </span>
                                    {column.foreignKey && (
                                      <button
                                        type='button'
                                        onClick={(event) => {
                                          event.preventDefault()
                                          event.stopPropagation()
                                          if (!canNavigateForeignKey) {
                                            return
                                          }

                                          void navigateToForeignKey(activeTableTab, column.foreignKey, cellValue)
                                        }}
                                        disabled={!canNavigateForeignKey}
                                        className={cn(
                                          'rounded p-0.5 text-slate-400 transition-colors',
                                          canNavigateForeignKey
                                            ? 'hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60'
                                            : 'cursor-not-allowed opacity-45',
                                        )}
                                        title={
                                          canNavigateForeignKey
                                            ? `Abrir ${column.foreignKey.table.fqName} filtrando ${column.foreignKey.column}`
                                            : 'Valor vazio para navegação'
                                        }
                                        aria-label={`Abrir registro relacionado em ${column.foreignKey.table.fqName}`}
                                      >
                                        <Link2 className='h-3.5 w-3.5' />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                    {activeTableTab.insertDraft && (
                      <tr
                        ref={insertRowRef}
                        className='border-b border-emerald-400/35 bg-emerald-500/10 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.35)]'
                      >
                        <td className='sticky left-0 z-[1] border-r border-emerald-400/35 bg-emerald-500/15 px-1 py-1 text-center text-[10px] text-emerald-200'>
                          +
                        </td>
                        {columns.map((column, columnIndex) => {
                          const isBooleanColumn = isBooleanDataType(column.dataType)
                          const enumValues = column.enumValues ?? []
                          const hasEnumColumnValues = enumValues.length > 0
                          const selectValues = hasEnumColumnValues
                            ? enumValues
                            : isBooleanColumn
                              ? BOOLEAN_SELECT_OPTIONS
                              : []
                          const hasSelectValues = selectValues.length > 0
                          const allowUnsetBooleanInsert = isBooleanColumn && !column.nullable

                          return (
                            <td key={`insert-${column.name}`} className='min-w-[190px] bg-emerald-500/10 px-2 py-1.5'>
                              {hasSelectValues ? (
                                <select
                                  ref={
                                    columnIndex === 0
                                      ? (element) => {
                                          firstInsertFieldRef.current = element
                                        }
                                      : undefined
                                  }
                                  value={resolveSelectValue(activeTableTab.insertDraft?.[column.name], {
                                    nullable: column.nullable,
                                    fallbackValue: selectValues[0],
                                    allowUnset: allowUnsetBooleanInsert,
                                  })}
                                  onChange={(event) => {
                                    const selected = decodeSelectOptionValue(event.target.value)
                                    updateInsertDraftValue(column.name, selected)
                                  }}
                                  className='h-7 w-full rounded-md border border-emerald-500/35 bg-slate-900/90 px-2 text-[12px] text-slate-100 outline-none ring-emerald-300/40 focus:ring-2'
                                >
                                  {allowUnsetBooleanInsert && (
                                    <option value={UNSET_SELECT_VALUE}>
                                      Selecione...
                                    </option>
                                  )}
                                  {column.nullable && <option value={NULL_SELECT_VALUE}>NULL</option>}
                                  {selectValues.map((selectValue) => (
                                    <option key={selectValue} value={encodeSelectOptionValue(selectValue)}>
                                      {selectValue}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <Input
                                  ref={
                                    columnIndex === 0
                                      ? (element) => {
                                          firstInsertFieldRef.current = element
                                        }
                                      : undefined
                                  }
                                  value={formatDraftInputValue(activeTableTab.insertDraft?.[column.name])}
                                  placeholder={column.isPrimaryKey ? 'PK' : column.name}
                                  onChange={(event) => updateInsertDraftValue(column.name, event.target.value)}
                                  className='h-7 border-emerald-500/35 bg-slate-900/90 text-[12px] text-slate-100'
                                />
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {isBackgroundTableReload && (
                <div className='absolute inset-0 z-20 flex items-center justify-center bg-slate-950/45 backdrop-blur-[1px]'>
                  <div className='pointer-card-soft flex items-center gap-2 px-3 py-2 text-sm text-slate-200 shadow-[0_8px_24px_rgba(2,6,23,0.35)]'>
                    <RefreshCw className='h-4 w-4 animate-spin text-slate-300' />
                    <span>Atualizando registros...</span>
                  </div>
                </div>
              )}
            </div>

            {(activeTableTab.data?.rows.length ?? 0) === 0 && !activeTableTab.loading && (
              <div className='flex h-40 items-center justify-center text-sm text-slate-500'>
                Nenhum registro encontrado.
              </div>
            )}
          </>
        )}
      </div>

      {!hasLoadError && (
        <div className='flex items-center justify-between border-t border-slate-800/80 px-3 pb-3 pt-2 text-sm text-slate-400'>
        <p className='flex items-center gap-1.5'>
          <span>Página {activeTableTab.page + 1} • limite de</span>
          <Input
            type='number'
            min={1}
            max={TABLE_PAGE_SIZE_MAX}
            step={1}
            value={pageSizeInput}
            disabled={activeTableTab.loading}
            onChange={(event) => setPageSizeInput(event.target.value)}
            onBlur={applyPageSize}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                applyPageSize()
              }
            }}
            className='h-7 w-20 text-xs'
          />
          <span>registros por página</span>
          {(Object.keys(activeTableTab.pendingUpdates).length > 0 ||
            activeTableTab.pendingDeletes.length > 0 ||
            Boolean(activeTableTab.insertDraft)) && (
            <span className='ml-2 text-slate-300'>
              • {Object.keys(activeTableTab.pendingUpdates).length} update(s) • {activeTableTab.pendingDeletes.length}{' '}
              delete(s) • {activeTableTab.insertDraft ? 1 : 0} insert(s) pendente(s)
            </span>
          )}
        </p>
        <div className='flex items-center gap-1'>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant='outline'
                size='sm'
                className='h-8 text-[13px]'
                disabled={activeTableTab.loading || isExportingAllPages}
              >
                <Download className='mr-1.5 h-3.5 w-3.5' /> Exportar
                <ChevronDown className='ml-1 h-3.5 w-3.5' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-[220px]'>
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault()
                  setIsExportDialogOpen(true)
                }}
              >
                <Download className='h-3.5 w-3.5 text-slate-400' />
                Exportar CSV
              </DropdownMenuItem>
              <DropdownMenuItem disabled>
                <span className='h-3.5 w-3.5 text-center text-slate-500'>•</span>
                Exportar JSON (em breve)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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

              if ((activeTableTab.data?.rows.length ?? 0) === effectivePageSize) {
                void reloadTableTab(activeTableTab.id, { page: nextPage })
              }
            }}
            disabled={(activeTableTab.data?.rows.length ?? 0) < effectivePageSize}
          >
            <ChevronRight className='h-4 w-4' />
          </Button>
        </div>
        </div>
      )}

      <Dialog
        open={isExportDialogOpen}
        onOpenChange={(open) => {
          if (!isExportingAllPages) {
            setIsExportDialogOpen(open)
          }
        }}
      >
        <DialogContent className='max-w-md space-y-3'>
          <DialogHeader>
            <DialogTitle>Exportar tabela em CSV</DialogTitle>
            <DialogDescription>
              Escolha se deseja exportar apenas a página atual ou percorrer todas as páginas com os filtros e ordenação
              atuais.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className='flex-col gap-2'>
            <Button
              variant='ghost'
              onClick={() => setIsExportDialogOpen(false)}
              disabled={isExportingAllPages}
              className='w-full'
            >
              Cancelar
            </Button>
            <Button
              variant='outline'
              onClick={handleExportCurrentPage}
              disabled={isExportingAllPages}
              className='w-full'
            >
              Exportar página atual
            </Button>
            <Button onClick={() => void handleExportAllPages()} disabled={isExportingAllPages} className='w-full'>
              {isExportingAllPages ? 'Exportando...' : 'Exportar todas as páginas'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(jsonEditorCell)}
        onOpenChange={(open) => {
          if (!open) {
            closeJsonEditor()
          }
        }}
      >
        <DialogContent className='max-w-2xl space-y-3'>
          <DialogHeader>
            <DialogTitle>Editar JSON</DialogTitle>
            <DialogDescription>
              {jsonEditorCell
                ? `Coluna ${jsonEditorCell.columnName} • linha ${jsonEditorCell.rowIndex + 1}`
                : 'Visualização JSON'}
            </DialogDescription>
          </DialogHeader>

          <Textarea
            value={jsonEditorValue}
            onChange={(event) => setJsonEditorValue(event.target.value)}
            className='min-h-[300px] font-mono text-xs leading-5'
            readOnly={!jsonEditorCell?.canEdit}
          />

          <DialogFooter>
            <Button variant='ghost' onClick={closeJsonEditor}>
              Fechar
            </Button>
            {jsonEditorCell?.canEdit && <Button onClick={saveJsonEditor}>Salvar JSON</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
