import { useState, type Dispatch, type SetStateAction } from 'react'
import { ChevronLeft, ChevronRight, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { TableFilterOperator, TableSort } from '../../../../shared/db-types'
import type { EditingCell, TableReloadOverrides, TableTab } from '../../../entities/workspace/types'
import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
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
import { isJsonLikeDataType } from '../../../shared/lib/workspace-utils'

type JsonEditorCellState = {
  rowIndex: number
  columnName: string
  canEdit: boolean
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

type TableWorkspacePanelProps = {
  activeTableTab: TableTab
  reloadTableTab: (tabId: string, overrides?: TableReloadOverrides) => Promise<void>
  handleToggleInsertDraftRow: () => void
  selectedRow: Record<string, unknown> | null
  handleDeleteRow: () => void
  updateTableTab: (tabId: string, updater: (tab: TableTab) => TableTab) => void
  beginInlineEdit: (rowIndex: number, column: string) => void
  editingCell: EditingCell | null
  setEditingCell: Dispatch<SetStateAction<EditingCell | null>>
  commitInlineEdit: (override?: EditingCell) => void
  cancelInlineEdit: () => void
  updateInsertDraftValue: (columnName: string, value: string) => void
  formatDraftInputValue: (value: unknown) => string
  formatCell: (value: unknown) => string
  formatTableLabel: (table: TableTab['table']) => string
  engineLabel: (engine: TableTab['engine']) => string
  pageSize: number
}

export function TableWorkspacePanel({
  activeTableTab,
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
}: TableWorkspacePanelProps): JSX.Element {
  const [jsonEditorCell, setJsonEditorCell] = useState<JsonEditorCellState | null>(null)
  const [jsonEditorValue, setJsonEditorValue] = useState('')

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

  return (
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
                      const isJsonColumn = isJsonLikeDataType(column.dataType)
                      const canEditCell =
                        !column.isPrimaryKey && activeTableTab.schema?.supportsRowEdit && !isPendingDelete

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
                          ) : (
                            <span className={cn(isJsonColumn && 'font-mono text-[12px]')}>
                              {isJsonColumn ? formatJsonPreviewValue(row[column.name]) : formatCell(row[column.name])}
                            </span>
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
              • {Object.keys(activeTableTab.pendingUpdates).length} update(s) • {activeTableTab.pendingDeletes.length}{' '}
              delete(s) • {activeTableTab.insertDraft ? 1 : 0} insert(s) pendente(s)
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

              if ((activeTableTab.data?.rows.length ?? 0) === pageSize) {
                void reloadTableTab(activeTableTab.id, { page: nextPage })
              }
            }}
            disabled={(activeTableTab.data?.rows.length ?? 0) < pageSize}
          >
            <ChevronRight className='h-4 w-4' />
          </Button>
        </div>
      </div>

      <Dialog
        open={Boolean(jsonEditorCell)}
        onOpenChange={(open) => {
          if (!open) {
            closeJsonEditor()
          }
        }}
      >
        <DialogContent className='max-w-2xl'>
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
