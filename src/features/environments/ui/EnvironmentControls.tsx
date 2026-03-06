import type { Dispatch, SetStateAction } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import type { EnvironmentSummary } from '../../../../shared/db-types'
import { DEFAULT_ENVIRONMENT_COLOR, ENVIRONMENT_COLOR_PRESETS, SIDEBAR_SECTION_LABEL_CLASS } from '../../../shared/constants/app'
import { normalizeHexColor } from '../../../shared/lib/workspace-utils'
import { Badge } from '../../../components/ui/badge'
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
          <DialogTrigger asChild>
            <Button size='icon' className='h-8 w-8' variant='ghost'>
              <Plus className='h-3.5 w-3.5' />
            </Button>
          </DialogTrigger>
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
          <DialogTrigger asChild>
            <Button
              size='icon'
              className='h-8 w-8'
              variant='ghost'
              onClick={openEditEnvironmentDialog}
              disabled={!selectedEnvironmentId}
            >
              <Pencil className='h-3.5 w-3.5' />
            </Button>
          </DialogTrigger>
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

        <Button
          size='icon'
          className='h-8 w-8'
          variant='ghost'
          onClick={() => void handleDeleteEnvironment()}
          disabled={!selectedEnvironmentId}
        >
          <Trash2 className='h-3.5 w-3.5' />
        </Button>
      </div>
    </>
  )
}
