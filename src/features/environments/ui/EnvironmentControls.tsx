import type { Dispatch, SetStateAction } from 'react'
import { Ellipsis, LogOut, Pencil, Plus, Trash2 } from 'lucide-react'
import type { EnvironmentSummary } from '../../../../shared/db-types'
import { DEFAULT_ENVIRONMENT_COLOR, ENVIRONMENT_COLOR_PRESETS, SIDEBAR_SECTION_LABEL_CLASS } from '../../../shared/constants/app'
import { normalizeHexColor } from '../../../shared/lib/workspace-utils'
import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog'
import { Input } from '../../../components/ui/input'
import { cn } from '../../../lib/utils'
import { EnvironmentCreateDialog } from './EnvironmentCreateDialog'

type EnvironmentControlsProps = {
  environments: EnvironmentSummary[]
  connectionsCount: number
  selectedEnvironmentId: string
  setSelectedEnvironmentId: Dispatch<SetStateAction<string>>
  isCreateEnvironmentOpen: boolean
  setIsCreateEnvironmentOpen: Dispatch<SetStateAction<boolean>>
  environmentNameDraft: string
  setEnvironmentNameDraft: Dispatch<SetStateAction<string>>
  environmentColorDraft: string
  setEnvironmentColorDraft: Dispatch<SetStateAction<string>>
  isEnvironmentSaving: boolean
  isEditEnvironmentOpen: boolean
  setIsEditEnvironmentOpen: Dispatch<SetStateAction<boolean>>
  environmentEditNameDraft: string
  setEnvironmentEditNameDraft: Dispatch<SetStateAction<string>>
  environmentEditColorDraft: string
  setEnvironmentEditColorDraft: Dispatch<SetStateAction<string>>
  isEnvironmentUpdating: boolean
  handleCreateEnvironment: () => Promise<void>
  openEditEnvironmentDialog: () => void
  handleUpdateEnvironment: () => Promise<void>
  handleDeleteEnvironment: () => Promise<void>
  onExitWorkspace: () => void
}

export function EnvironmentControls({
  environments,
  connectionsCount,
  selectedEnvironmentId,
  setSelectedEnvironmentId,
  isCreateEnvironmentOpen,
  setIsCreateEnvironmentOpen,
  environmentNameDraft,
  setEnvironmentNameDraft,
  environmentColorDraft,
  setEnvironmentColorDraft,
  isEnvironmentSaving,
  isEditEnvironmentOpen,
  setIsEditEnvironmentOpen,
  environmentEditNameDraft,
  setEnvironmentEditNameDraft,
  environmentEditColorDraft,
  setEnvironmentEditColorDraft,
  isEnvironmentUpdating,
  handleCreateEnvironment,
  openEditEnvironmentDialog,
  handleUpdateEnvironment,
  handleDeleteEnvironment,
  onExitWorkspace,
}: EnvironmentControlsProps): JSX.Element {
  return (
    <>
      <div className='mb-3 flex items-center justify-between'>
        <div className='flex items-center gap-2'>
          <div className='flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-md border border-slate-700 bg-slate-800/70'>
            <span className='h-2.5 w-2.5 rounded-full bg-slate-100' />
          </div>
          <div>
            <p className='text-[19px] leading-none font-semibold tracking-tight'>Pointer</p>
            <p className='text-[12px] text-slate-500'>Ambientes e Bancos</p>
          </div>
        </div>
        <Badge variant='secondary'>{connectionsCount}</Badge>
      </div>

      <label className={SIDEBAR_SECTION_LABEL_CLASS}>AMBIENTE</label>
      <div className='flex gap-2'>
        <select
          value={selectedEnvironmentId}
          onChange={(event) => setSelectedEnvironmentId(event.target.value)}
          className='h-8 w-full rounded-md border border-slate-700/90 bg-slate-900/90 px-2.5 text-[13px] outline-none ring-slate-300/45 focus:ring-2'
        >
          <option value=''>Selecione um ambiente</option>
          {environments.map((environment) => (
            <option key={environment.id} value={environment.id}>
              {environment.name}
            </option>
          ))}
        </select>

        <EnvironmentCreateDialog
          isCreateEnvironmentOpen={isCreateEnvironmentOpen}
          setIsCreateEnvironmentOpen={setIsCreateEnvironmentOpen}
          environmentNameDraft={environmentNameDraft}
          setEnvironmentNameDraft={setEnvironmentNameDraft}
          environmentColorDraft={environmentColorDraft}
          setEnvironmentColorDraft={setEnvironmentColorDraft}
          isEnvironmentSaving={isEnvironmentSaving}
          handleCreateEnvironment={handleCreateEnvironment}
          trigger={
            <Button size='icon' className='h-8 w-8' variant='ghost'>
              <Plus className='h-3.5 w-3.5' />
            </Button>
          }
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size='icon'
              className='h-8 w-8'
              variant='ghost'
              disabled={!selectedEnvironmentId}
              title='Mais ações do ambiente'
            >
              <Ellipsis className='h-3.5 w-3.5' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='w-44'>
            <DropdownMenuItem onSelect={openEditEnvironmentDialog}>
              <Pencil className='h-3.5 w-3.5' />
              Editar ambiente
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void handleDeleteEnvironment()}>
              <Trash2 className='h-3.5 w-3.5' />
              Excluir ambiente
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onExitWorkspace}>
              <LogOut className='h-3.5 w-3.5' />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Dialog
          open={isEditEnvironmentOpen}
          onOpenChange={(open) => {
            setIsEditEnvironmentOpen(open)
            if (!open) {
              setEnvironmentEditNameDraft('')
              setEnvironmentEditColorDraft(DEFAULT_ENVIRONMENT_COLOR)
            }
          }}
        >
          <DialogContent className='max-w-[510px]'>
            <DialogHeader className='space-y-2'>
              <DialogTitle>Editar ambiente</DialogTitle>
              <DialogDescription>Atualize nome e cor do ambiente selecionado.</DialogDescription>
            </DialogHeader>
            <div className='mt-4 space-y-4'>
              <Input
                placeholder='Nome do ambiente'
                value={environmentEditNameDraft}
                onChange={(event) => setEnvironmentEditNameDraft(event.target.value)}
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
                        normalizeHexColor(environmentEditColorDraft) === color
                          ? 'scale-105 border-slate-100 shadow-[0_0_0_2px_rgba(15,23,42,0.9)]'
                          : 'border-slate-700 hover:border-slate-500',
                      )}
                      style={{ backgroundColor: color }}
                      onClick={() => setEnvironmentEditColorDraft(color)}
                    />
                  ))}
                  <Input
                    type='color'
                    className='h-8 w-10 cursor-pointer border-slate-700 bg-slate-900 p-1'
                    value={normalizeHexColor(environmentEditColorDraft)}
                    onChange={(event) => setEnvironmentEditColorDraft(event.target.value)}
                  />
                </div>
              </div>
              <DialogFooter className='pt-1'>
                <Button variant='secondary' onClick={() => setIsEditEnvironmentOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={() => void handleUpdateEnvironment()} disabled={isEnvironmentUpdating}>
                  {isEnvironmentUpdating ? 'Salvando...' : 'Salvar'}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  )
}
