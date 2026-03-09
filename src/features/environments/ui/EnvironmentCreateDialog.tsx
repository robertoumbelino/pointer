import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { DEFAULT_ENVIRONMENT_COLOR, ENVIRONMENT_COLOR_PRESETS } from '../../../shared/constants/app'
import { normalizeHexColor } from '../../../shared/lib/workspace-utils'
import { Button } from '../../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../../components/ui/dialog'
import { Input } from '../../../components/ui/input'
import { cn } from '../../../lib/utils'

type EnvironmentCreateDialogProps = {
  isCreateEnvironmentOpen: boolean
  setIsCreateEnvironmentOpen: Dispatch<SetStateAction<boolean>>
  environmentNameDraft: string
  setEnvironmentNameDraft: Dispatch<SetStateAction<string>>
  environmentColorDraft: string
  setEnvironmentColorDraft: Dispatch<SetStateAction<string>>
  isEnvironmentSaving: boolean
  handleCreateEnvironment: () => Promise<void>
  trigger?: ReactNode
}

export function EnvironmentCreateDialog({
  isCreateEnvironmentOpen,
  setIsCreateEnvironmentOpen,
  environmentNameDraft,
  setEnvironmentNameDraft,
  environmentColorDraft,
  setEnvironmentColorDraft,
  isEnvironmentSaving,
  handleCreateEnvironment,
  trigger,
}: EnvironmentCreateDialogProps): JSX.Element {
  return (
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
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
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
  )
}
