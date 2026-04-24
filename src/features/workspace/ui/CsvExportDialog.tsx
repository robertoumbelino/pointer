import { useEffect, useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog'
import { cn } from '../../../lib/utils'

type CsvExportDialogProps = {
  open: boolean
  title: string
  description: string
  formatLabel?: string
  columns: string[]
  isBusy?: boolean
  renderFooter: (params: {
    selectedColumns: string[]
    noColumnsSelected: boolean
  }) => JSX.Element
  onOpenChange: (open: boolean) => void
}

export function CsvExportDialog({
  open,
  title,
  description,
  formatLabel = 'CSV',
  columns,
  isBusy = false,
  renderFooter,
  onOpenChange,
}: CsvExportDialogProps): JSX.Element {
  const [selectedColumns, setSelectedColumns] = useState<string[]>(columns)
  const selectedColumnSet = useMemo(() => new Set(selectedColumns), [selectedColumns])
  const selectedCount = selectedColumns.length
  const allColumnsSelected = selectedCount === columns.length
  const noColumnsSelected = selectedCount === 0

  useEffect(() => {
    if (open) {
      setSelectedColumns(columns)
    }
  }, [columns, open])

  const toggleColumn = (columnName: string): void => {
    setSelectedColumns((current) =>
      current.includes(columnName) ? current.filter((column) => column !== columnName) : [...current, columnName],
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isBusy) {
          onOpenChange(nextOpen)
        }
      }}
    >
      <DialogContent className='max-w-md space-y-3'>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className='space-y-2 rounded-md border border-slate-800/80 bg-slate-950/35 p-3'>
          <div className='flex items-center justify-between gap-3'>
            <span className='text-xs font-medium text-slate-300'>
              {selectedCount} de {columns.length} coluna(s)
            </span>
            <div className='flex items-center gap-1'>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                className='h-7 px-2 text-xs'
                onClick={() => setSelectedColumns(columns)}
                disabled={isBusy || allColumnsSelected}
              >
                Selecionar todas
              </Button>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                className='h-7 px-2 text-xs'
                onClick={() => setSelectedColumns([])}
                disabled={isBusy || noColumnsSelected}
              >
                Limpar
              </Button>
            </div>
          </div>

          <div className='max-h-56 overflow-y-auto rounded-md border border-slate-800/70 bg-slate-950/45 p-1'>
            {columns.map((columnName) => {
              const checked = selectedColumnSet.has(columnName)

              return (
                <button
                  key={columnName}
                  type='button'
                  className={cn(
                    'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] text-slate-200 transition-colors hover:bg-slate-800/80',
                    isBusy && 'pointer-events-none opacity-70',
                  )}
                  onClick={() => toggleColumn(columnName)}
                  disabled={isBusy}
                >
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                      checked ? 'border-sky-400 bg-sky-500 text-slate-950' : 'border-slate-600 text-slate-500',
                    )}
                  >
                    {checked && <Check className='h-3 w-3' />}
                  </span>
                  <span className='min-w-0 truncate font-mono'>{columnName}</span>
                </button>
              )
            })}
          </div>
        </div>

        {noColumnsSelected && (
          <p className='text-xs text-amber-300/90'>Selecione ao menos uma coluna para exportar o {formatLabel}.</p>
        )}

        <DialogFooter className='flex-col gap-2'>
          {renderFooter({
            selectedColumns,
            noColumnsSelected,
          })}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
