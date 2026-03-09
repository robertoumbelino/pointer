import { AlertTriangle } from 'lucide-react'
import { SAFE_CONFIRM_WORD } from '../../../shared/constants/app'
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

type PendingSqlExecution = {
  tabId: string
  sql: string
  connectionId?: string
}

type SqlRiskConfirmDialogProps = {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  sqlConfirmText: string
  setSqlConfirmText: (value: string) => void
  pendingSqlExecution: PendingSqlExecution | null
  setPendingSqlExecution: (value: PendingSqlExecution | null) => void
  onForceRunSql: (tabId: string, sql: string, connectionId?: string) => Promise<void>
}

export function SqlRiskConfirmDialog({
  isOpen,
  onOpenChange,
  sqlConfirmText,
  setSqlConfirmText,
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
            disabled={sqlConfirmText.trim().toUpperCase() !== SAFE_CONFIRM_WORD}
          >
            Executar mesmo assim
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
