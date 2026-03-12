import { useEffect, useRef, useState } from 'react'
import type { DatabaseEngine, TableRef } from '../../../../shared/db-types'
import { Button } from '../../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog'
import { engineLabel } from '../../../shared/lib/workspace-utils'
import { cn } from '../../../lib/utils'

export type TableStructureConnectionOption = {
  connectionId: string
  connectionName: string
  engine: DatabaseEngine
  table: TableRef
}

export type PendingTableStructureConnectionResolution = {
  tableLabel: string
  options: TableStructureConnectionOption[]
}

type TableStructureConnectionResolveDialogProps = {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  pendingResolution: PendingTableStructureConnectionResolution | null
  setPendingResolution: (value: PendingTableStructureConnectionResolution | null) => void
  onSelectOption: (option: TableStructureConnectionOption) => Promise<void>
}

export function TableStructureConnectionResolveDialog({
  isOpen,
  onOpenChange,
  pendingResolution,
  setPendingResolution,
  onSelectOption,
}: TableStructureConnectionResolveDialogProps): JSX.Element {
  const [activeIndex, setActiveIndex] = useState(0)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const options = pendingResolution?.options ?? []

  useEffect(() => {
    if (!isOpen || options.length === 0) {
      return
    }

    setActiveIndex(0)
  }, [isOpen, options.length])

  useEffect(() => {
    if (!isOpen || options.length === 0) {
      return
    }

    const nextIndex = Math.max(0, Math.min(activeIndex, options.length - 1))
    if (nextIndex !== activeIndex) {
      setActiveIndex(nextIndex)
      return
    }

    const focusId = window.requestAnimationFrame(() => {
      optionRefs.current[nextIndex]?.focus()
    })

    return () => window.cancelAnimationFrame(focusId)
  }, [activeIndex, isOpen, options.length])

  const handleSelectOption = (option: TableStructureConnectionOption): void => {
    onOpenChange(false)
    setPendingResolution(null)
    void onSelectOption(option)
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        onOpenChange(open)
        if (!open) {
          setPendingResolution(null)
        }
      }}
    >
      <DialogContent
        className='max-w-md space-y-3'
        onKeyDown={(event) => {
          if (options.length === 0) {
            return
          }

          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setActiveIndex((current) => (current + 1) % options.length)
            return
          }

          if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActiveIndex((current) => (current - 1 + options.length) % options.length)
            return
          }

          if (event.key === 'Enter') {
            event.preventDefault()
            const option = options[activeIndex]
            if (!option) {
              return
            }

            handleSelectOption(option)
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Escolher conexão para ver estrutura</DialogTitle>
          <DialogDescription>
            A tabela <strong>{pendingResolution?.tableLabel ?? '-'}</strong> existe em múltiplas conexões.
            Escolha qual conexão deve ser usada.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-2'>
          {options.map((option, index) => (
            <Button
              key={`${option.connectionId}:${option.table.fqName}`}
              variant='outline'
              ref={(element) => {
                optionRefs.current[index] = element
              }}
              className={cn(
                'h-auto w-full justify-between px-3 py-2 text-left',
                index === activeIndex && 'border-slate-400 bg-slate-800/55',
              )}
              tabIndex={index === activeIndex ? 0 : -1}
              onMouseEnter={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              onClick={() => handleSelectOption(option)}
            >
              <span className='truncate'>{option.connectionName}</span>
              <span className='text-xs text-slate-400'>{engineLabel(option.engine)}</span>
            </Button>
          ))}
        </div>

        <DialogFooter>
          <Button variant='secondary' onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
