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

type SqlTabRenameDialogProps = {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  sqlTabNameDraft: string
  setSqlTabNameDraft: (value: string) => void
  onConfirmRename: () => void
}

export function SqlTabRenameDialog({
  isOpen,
  onOpenChange,
  sqlTabNameDraft,
  setSqlTabNameDraft,
  onConfirmRename,
}: SqlTabRenameDialogProps): JSX.Element {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
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
              onConfirmRename()
            }
          }}
        />
        <DialogFooter className='pt-2'>
          <Button variant='secondary' onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={onConfirmRename}>Salvar nome</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
