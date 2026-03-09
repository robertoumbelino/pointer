import { useEffect, useMemo, useRef, useState } from 'react'
import type { ConnectionSummary } from '../../../../shared/db-types'
import type { PendingAutoSqlConnectionResolution } from '../model/useWorkspace'
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

type SqlAutoConnectionResolveDialogProps = {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  pendingResolution: PendingAutoSqlConnectionResolution | null
  setPendingResolution: (value: PendingAutoSqlConnectionResolution | null) => void
  connections: ConnectionSummary[]
  onRunSqlWithConnection: (tabId: string, sql: string, connectionId: string) => Promise<void>
}

export function SqlAutoConnectionResolveDialog({
  isOpen,
  onOpenChange,
  pendingResolution,
  setPendingResolution,
  connections,
  onRunSqlWithConnection,
}: SqlAutoConnectionResolveDialogProps): JSX.Element {
  const [activeIndex, setActiveIndex] = useState(0)
  const candidateButtonRefs = useRef<Array<HTMLButtonElement | null>>([])

  const candidateConnections = useMemo(
    () =>
      (pendingResolution?.candidateConnectionIds ?? [])
        .map((connectionId) => connections.find((connection) => connection.id === connectionId))
        .filter((connection): connection is ConnectionSummary => Boolean(connection))
        .sort((left, right) => left.name.localeCompare(right.name)),
    [connections, pendingResolution?.candidateConnectionIds],
  )

  useEffect(() => {
    if (!isOpen || candidateConnections.length === 0) {
      return
    }

    setActiveIndex(0)
  }, [candidateConnections.length, isOpen])

  useEffect(() => {
    if (!isOpen || candidateConnections.length === 0) {
      return
    }

    const nextIndex = Math.max(0, Math.min(activeIndex, candidateConnections.length - 1))
    if (nextIndex !== activeIndex) {
      setActiveIndex(nextIndex)
      return
    }

    const focusId = window.requestAnimationFrame(() => {
      candidateButtonRefs.current[nextIndex]?.focus()
    })

    return () => window.cancelAnimationFrame(focusId)
  }, [activeIndex, candidateConnections.length, isOpen])

  const executeWithConnection = (connectionId: string): void => {
    if (!pendingResolution) {
      return
    }

    onOpenChange(false)
    setPendingResolution(null)
    void onRunSqlWithConnection(pendingResolution.tabId, pendingResolution.sql, connectionId)
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
          if (candidateConnections.length === 0) {
            return
          }

          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setActiveIndex((current) => (current + 1) % candidateConnections.length)
            return
          }

          if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActiveIndex((current) => (current - 1 + candidateConnections.length) % candidateConnections.length)
            return
          }

          if (event.key === 'Enter') {
            event.preventDefault()
            const connection = candidateConnections[activeIndex]
            if (!connection) {
              return
            }

            executeWithConnection(connection.id)
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Escolher conexão para modo Auto</DialogTitle>
          <DialogDescription>
            A tabela <strong>{pendingResolution?.tableLabel ?? '-'}</strong> foi encontrada em múltiplas conexões.
            Escolha onde executar esta query.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-2'>
          {candidateConnections.map((connection, index) => (
            <Button
              key={connection.id}
              variant='outline'
              ref={(element) => {
                candidateButtonRefs.current[index] = element
              }}
              className={cn(
                'h-auto w-full justify-between px-3 py-2 text-left',
                index === activeIndex && 'border-slate-400 bg-slate-800/55',
              )}
              tabIndex={index === activeIndex ? 0 : -1}
              onMouseEnter={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              onClick={() => executeWithConnection(connection.id)}
            >
              <span className='truncate'>{connection.name}</span>
              <span className='text-xs text-slate-400'>{engineLabel(connection.engine)}</span>
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
