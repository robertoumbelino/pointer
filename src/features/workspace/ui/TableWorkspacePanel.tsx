import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Download, Link2, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { ColumnForeignKeyRef, TableFilterOperator, TableSort } from '../../../../shared/db-types'
import type { EditingCell, TableReloadOverrides, TableTab } from '../../../entities/workspace/types'
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
import { isJsonLikeDataType } from '../../../shared/lib/workspace-utils'

type JsonEditorCellState = {
  rowIndex: number
  columnName: string
  canEdit: boolean
}

const NULL_SELECT_VALUE = '__pointer_null__'
const ENUM_SELECT_PREFIX = 'enum:'

function encodeEnumSelectValue(value: string): string {
  return `${ENUM_SELECT_PREFIX}${value}`
}

function decodeEnumSelectValue(value: string): string | null {
  if (value === NULL_SELECT_VALUE) {
    return null
  }

  if (value.startsWith(ENUM_SELECT_PREFIX)) {
    return value.slice(ENUM_SELECT_PREFIX.length)
  }

  return value
}

function resolveEnumSelectValue(rawValue: unknown, nullable: boolean, fallbackValue: string): string {
  if (rawValue === null) {
    return NULL_SELECT_VALUE
  }

  if (typeof rawValue === 'string') {
    if (rawValue === '' && nullable) {
      return NULL_SELECT_VALUE
    }

    return encodeEnumSelectValue(rawValue)
  }

  if (rawValue === undefined) {
    if (nullable) {
      return NULL_SELECT_VALUE
    }

    return encodeEnumSelectValue(fallbackValue)
  }

  return encodeEnumSelectValue(String(rawValue))
}

function formatJsonEditorValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
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

function formatJsonPreviewValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL'
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

type TableWorkspacePanelProps = {
  activeTableTab: TableTab
  saveActiveTableChanges: () => Promise<void>
  isSavingTableChanges: boolean
  reloadTableTab: (tabId: string, overrides?: TableReloadOverrides) => Promise<void>
  navigateToForeignKey: (sourceTab: TableTab, foreignKey: ColumnForeignKeyRef | undefined, value: unknown) => Promise<void>
  closeTableTab: (tabId: string) => void
  handleToggleInsertDraftRow: () => void
  selectedRow: Record<string, unknown> | null
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
  exportTableCurrentPageCsv,
  exportTableAllPagesCsv,
}: TableWorkspacePanelProps): JSX.Element {
  const [jsonEditorCell, setJsonEditorCell] = useState<JsonEditorCellState | null>(null)
  const [jsonEditorValue, setJsonEditorValue] = useState('')
  const [pageSizeInput, setPageSizeInput] = useState(() => String(activeTableTab.pageSize))
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false)
  const [isExportingAllPages, setIsExportingAllPages] = useState(false)
  const effectivePageSize = activeTableTab.data?.pageSize ?? activeTableTab.pageSize
  const hasLoadError = Boolean(activeTableTab.loadError)
  const isInitialTableLoading = activeTableTab.loading && !activeTableTab.data
  const isTableActionDisabled = activeTableTab.loading || isSavingTableChanges

  useEffect(() => {
    setPageSizeInput(String(activeTableTab.pageSize))
  }, [activeTableTab.id, activeTableTab.pageSize])

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
            <RefreshCw className='mr-1.5 h-3.5 w-3.5' /> Atualizar
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
              {isSavingTableChanges ? 'Salvando...' : 'Salvar (Cmd+S)'}
            </Button>
          )}
          {!hasLoadError && (
            <Button
              variant='destructive'
              size='sm'
              className='h-8 text-[13px]'
              disabled={isTableActionDisabled || !selectedRow || !activeTableTab.schema?.supportsRowEdit}
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
            <div className='pointer-card-soft h-full overflow-auto'>
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
                          const cellValue = row[column.name]
                          const isJsonColumn = isJsonLikeDataType(column.dataType)
                          const enumValues = column.enumValues ?? []
                          const hasEnumColumnValues = enumValues.length > 0
                          const canEditCell =
                            !column.isPrimaryKey && activeTableTab.schema?.supportsRowEdit && !isPendingDelete
                          const canNavigateForeignKey = Boolean(column.foreignKey) && hasForeignKeyCellValue(cellValue)

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
                                    : '',
                              )}
                              onClick={() => {
                                updateTableTab(activeTableTab.id, (tab) => ({
                                  ...tab,
                                  selectedRowIndex: rowIndex,
                                }))

                                if (isJsonColumn) {
                                  cancelInlineEdit()
                                  setJsonEditorCell({
                                    rowIndex,
                                    columnName: column.name,
                                    canEdit: Boolean(canEditCell),
                                  })
                                  setJsonEditorValue(formatJsonEditorValue(row[column.name]))
                                  return
                                }

                                if (canEditCell) {
                                  beginInlineEdit(rowIndex, column.name)
                                }
                              }}
                            >
                              {isEditing ? (
                                hasEnumColumnValues ? (
                                  <select
                                    value={resolveEnumSelectValue(editingCell.value, column.nullable, enumValues[0])}
                                    autoFocus
                                    onChange={(event) => {
                                      const selected = decodeEnumSelectValue(event.target.value)
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
                                    {enumValues.map((enumValue) => (
                                      <option key={enumValue} value={encodeEnumSelectValue(enumValue)}>
                                        {enumValue}
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
                                    {isJsonColumn ? formatJsonPreviewValue(cellValue) : formatCell(cellValue)}
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
                    <tr className='border-b border-emerald-400/35 bg-emerald-500/10 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.35)]'>
                      {activeTableTab.schema?.columns.map((column) => {
                        const enumValues = column.enumValues ?? []
                        const hasEnumColumnValues = enumValues.length > 0

                        return (
                          <td key={`insert-${column.name}`} className='min-w-[190px] bg-emerald-500/10 px-2 py-1.5'>
                            {hasEnumColumnValues ? (
                              <select
                                value={resolveEnumSelectValue(
                                  activeTableTab.insertDraft?.[column.name],
                                  column.nullable,
                                  enumValues[0],
                                )}
                                onChange={(event) => {
                                  const selected = decodeEnumSelectValue(event.target.value)
                                  updateInsertDraftValue(column.name, selected)
                                }}
                                className='h-7 w-full rounded-md border border-emerald-500/35 bg-slate-900/90 px-2 text-[12px] text-slate-100 outline-none ring-emerald-300/40 focus:ring-2'
                              >
                                {column.nullable && <option value={NULL_SELECT_VALUE}>NULL</option>}
                                {enumValues.map((enumValue) => (
                                  <option key={enumValue} value={encodeEnumSelectValue(enumValue)}>
                                    {enumValue}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <Input
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
