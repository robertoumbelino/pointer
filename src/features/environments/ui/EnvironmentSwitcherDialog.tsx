import { Database } from 'lucide-react'
import type { KeyboardEvent, SetStateAction } from 'react'
import type { EnvironmentSummary } from '../../../../shared/db-types'
import { Badge } from '../../../components/ui/badge'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../../../components/ui/command'
import { Dialog, DialogContent } from '../../../components/ui/dialog'
import { cn } from '../../../lib/utils'

type EnvironmentSwitcherDialogProps = {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  environmentCommandQuery: string
  setEnvironmentCommandQuery: (value: string) => void
  handleEnvironmentCommandInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  environmentCommandResults: EnvironmentSummary[]
  environmentCommandIndex: number
  setEnvironmentCommandIndex: (value: SetStateAction<number>) => void
  selectEnvironmentFromCommand: (environmentId: string) => void
  selectedEnvironmentId: string
}

export function EnvironmentSwitcherDialog({
  isOpen,
  onOpenChange,
  environmentCommandQuery,
  setEnvironmentCommandQuery,
  handleEnvironmentCommandInputKeyDown,
  environmentCommandResults,
  environmentCommandIndex,
  setEnvironmentCommandIndex,
  selectEnvironmentFromCommand,
  selectedEnvironmentId,
}: EnvironmentSwitcherDialogProps): JSX.Element {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        onOpenChange(open)
        if (!open) {
          setEnvironmentCommandQuery('')
        }
      }}
    >
      <DialogContent className='max-w-md overflow-hidden p-0'>
        <Command className='bg-slate-900 text-slate-100' loop shouldFilter={false}>
          <CommandInput
            autoFocus
            value={environmentCommandQuery}
            onValueChange={setEnvironmentCommandQuery}
            placeholder='Trocar ambiente... (Cmd+R)'
            onKeyDown={handleEnvironmentCommandInputKeyDown}
          />
          <CommandList>
            <CommandEmpty>Nenhum ambiente encontrado.</CommandEmpty>
            <CommandGroup heading='Ambientes'>
              {environmentCommandResults.map((environment, index) => (
                <CommandItem
                  key={environment.id}
                  value={`${environment.name} ${index}`}
                  data-manual-active={environmentCommandIndex === index ? 'true' : 'false'}
                  onSelect={() => selectEnvironmentFromCommand(environment.id)}
                  onMouseEnter={() => setEnvironmentCommandIndex(index)}
                  onFocus={() => setEnvironmentCommandIndex(index)}
                  className={cn(
                    'cursor-pointer data-[selected=true]:bg-transparent data-[selected=true]:text-slate-300 data-[selected=true]:shadow-none aria-selected:bg-transparent aria-selected:text-slate-300',
                    'data-[manual-active=true]:!bg-slate-700/55 data-[manual-active=true]:!text-slate-50 data-[manual-active=true]:shadow-[inset_0_0_0_1px_rgba(148,163,184,0.45)]',
                    'text-slate-300',
                  )}
                >
                  <Database className='h-4 w-4' />
                  <span>{environment.name}</span>
                  {environment.id === selectedEnvironmentId && (
                    <Badge variant='secondary' className='ml-auto border-slate-500/40 bg-slate-100/10 text-slate-100'>
                      Ativo
                    </Badge>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
