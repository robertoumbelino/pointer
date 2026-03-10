import { AlertTriangle } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog'

type PendingSqlExecution = {
  tabId: string
  sql: string
  connectionId?: string
}

type SqlRiskConfirmDialogProps = {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  pendingSqlExecution: PendingSqlExecution | null
  setPendingSqlExecution: (value: PendingSqlExecution | null) => void
  onForceRunSql: (tabId: string, sql: string, connectionId?: string) => Promise<void>
}

export function SqlRiskConfirmDialog({
  isOpen,
  onOpenChange,
  pendingSqlExecution,
  setPendingSqlExecution,
  onForceRunSql,
}: SqlRiskConfirmDialogProps): JSX.Element {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        onOpenChange(open)
        if (!open) {
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
          <DialogDescription>Essa query pode alterar dados. Confirme para executar.</DialogDescription>
        </DialogHeader>
        <DialogFooter className='pt-2'>
          <Button variant='secondary' onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant='destructive'
            onClick={() => {
              if (!pendingSqlExecution) {
                return
              }

              void onForceRunSql(
                pendingSqlExecution.tabId,
                pendingSqlExecution.sql,
                pendingSqlExecution.connectionId,
              )
            }}
          >
            Executar mesmo assim
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
