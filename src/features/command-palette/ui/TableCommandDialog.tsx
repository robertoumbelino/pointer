import { Diff, LogOut, RefreshCw, Table2 } from 'lucide-react'
import type { KeyboardEvent, MutableRefObject, SetStateAction } from 'react'
import type { TableSchema, TableSearchHit } from '../../../../shared/db-types'
import { Button } from '../../../components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '../../../components/ui/command'
import { Dialog, DialogContent } from '../../../components/ui/dialog'
import { Input } from '../../../components/ui/input'
import { cn } from '../../../lib/utils'
import { formatTableLabel } from '../../../shared/lib/workspace-utils'
import type { CommandActionId, CommandActionItem } from '../model/useCommandPaletteActions'

type GroupedCommandHits = Array<{
  connectionId: string
  heading: string
  items: Array<{ hit: TableSearchHit; displayIndex: number }>
}>

type TableCommandDialogProps = {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  commandQuery: string
  setCommandQuery: (value: string) => void
  commandScopedTarget: TableSearchHit | null
  setCommandScopedTarget: (value: TableSearchHit | null) => void
  commandScopedSchema: TableSchema | null
  setCommandScopedSchema: (value: TableSchema | null) => void
  commandScopedColumn: string
  setCommandScopedColumn: (value: string) => void
  commandScopedValue: string
  setCommandScopedValue: (value: string) => void
  handleCommandInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  commandColumnInputRef: MutableRefObject<HTMLSelectElement | null>
  commandValueInputRef: MutableRefObject<HTMLInputElement | null>
  applyCommandScopedFilter: () => Promise<void>
  commandActions: CommandActionItem[]
  selectCommandAction: (actionId: CommandActionId) => Promise<void>
  groupedCommandHits: GroupedCommandHits
  commandItemRefs: MutableRefObject<Record<number, HTMLDivElement | null>>
  commandIndex: number
  setCommandIndex: (value: SetStateAction<number>) => void
  openTableTab: (hit: TableSearchHit) => Promise<void>
  engineShortLabel: (engine: TableSearchHit['engine']) => string
}

export function TableCommandDialog({
  isOpen,
  onOpenChange,
  commandQuery,
  setCommandQuery,
  commandScopedTarget,
  setCommandScopedTarget,
  commandScopedSchema,
  setCommandScopedSchema,
  commandScopedColumn,
  setCommandScopedColumn,
  commandScopedValue,
  setCommandScopedValue,
  handleCommandInputKeyDown,
  commandColumnInputRef,
  commandValueInputRef,
  applyCommandScopedFilter,
  commandActions,
  selectCommandAction,
  groupedCommandHits,
  commandItemRefs,
  commandIndex,
  setCommandIndex,
  openTableTab,
  engineShortLabel,
}: TableCommandDialogProps): JSX.Element {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        onOpenChange(open)
        if (!open) {
          setCommandQuery('')
          setCommandIndex(0)
          setCommandScopedTarget(null)
          setCommandScopedSchema(null)
          setCommandScopedColumn('')
          setCommandScopedValue('')
        }
      }}
    >
      <DialogContent className='left-0 right-0 top-[12vh] mx-auto max-w-xl overflow-hidden p-0 !translate-x-0 !translate-y-0'>
        <Command
          className='bg-slate-900 text-slate-100 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.12em] [&_[cmdk-group-heading]]:text-slate-500'
          shouldFilter={false}
        >
          <CommandInput
            value={commandQuery}
            onValueChange={setCommandQuery}
            placeholder={
              commandScopedTarget
                ? `Filtro rápido em ${formatTableLabel(commandScopedTarget.table)}`
                : 'Buscar tabelas e ações...'
            }
            onKeyDown={handleCommandInputKeyDown}
          />
          <CommandList className='max-h-[380px]'>
            {commandScopedTarget && (
              <div className='space-y-2 border-b border-slate-800 px-3 py-2.5'>
                <p className='text-[11px] uppercase tracking-[0.16em] text-slate-500'>
                  Filtro rápido (Tab)
                </p>
                <p className='truncate text-xs text-slate-300'>{formatTableLabel(commandScopedTarget.table)}</p>
                <div className='flex items-center gap-2'>
                  <select
                    ref={commandColumnInputRef}
                    value={commandScopedColumn}
                    onChange={(event) => setCommandScopedColumn(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === 'Tab') {
                        event.preventDefault()
                        commandValueInputRef.current?.focus()
                      }
                    }}
                    className='h-8 min-w-[220px] rounded-md border border-slate-700 bg-slate-900 px-2.5 pr-8 text-[13px] outline-none ring-slate-300/45 focus:ring-2'
                  >
                    {(commandScopedSchema?.columns ?? []).map((column) => (
                      <option key={column.name} value={column.name}>
                        {column.name}
                      </option>
                    ))}
                  </select>
                  <Input
                    ref={commandValueInputRef}
                    placeholder='Valor (ilike)'
                    value={commandScopedValue}
                    onChange={(event) => setCommandScopedValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void applyCommandScopedFilter()
                      }
                    }}
                    className='h-8'
                  />
                  <Button size='sm' className='h-8' onClick={() => void applyCommandScopedFilter()}>
                    Aplicar
                  </Button>
                </div>
              </div>
            )}
            <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
            {commandActions.length > 0 && (
              <CommandGroup heading='Ações'>
                {commandActions.map((action) => (
                  <CommandItem
                    key={action.id}
                    ref={(node) => {
                      commandItemRefs.current[action.displayIndex] = node
                    }}
                    value={`${action.label} ${action.description}`}
                    onSelect={() => {
                      onOpenChange(false)
                      void selectCommandAction(action.id)
                    }}
                    onMouseMove={() => setCommandIndex(action.displayIndex)}
                    data-manual-active={commandIndex === action.displayIndex ? 'true' : 'false'}
                    className={cn(
                      'cursor-pointer text-slate-300 data-[selected=true]:bg-transparent data-[selected=true]:text-slate-300 data-[selected=true]:shadow-none aria-selected:bg-transparent aria-selected:text-slate-300',
                      'data-[manual-active=true]:!bg-slate-700/55 data-[manual-active=true]:!text-slate-50 data-[manual-active=true]:shadow-[inset_0_0_0_1px_rgba(148,163,184,0.45)]',
                    )}
                  >
                    {action.id === 'open-changelog' ? <Diff className='h-4 w-4' /> : null}
                    {action.id === 'check-app-update' ? <RefreshCw className='h-4 w-4' /> : null}
                    {action.id === 'exit-workspace' ? <LogOut className='h-4 w-4' /> : null}
                    <div className='min-w-0'>
                      <p className='truncate text-[13px]'>{action.label}</p>
                      <p className='truncate text-[11px] text-slate-400'>{action.description}</p>
                    </div>
                    {commandIndex === action.displayIndex && (
                      <CommandShortcut className='text-[10px] uppercase tracking-[0.08em] text-slate-400'>
                        Enter
                      </CommandShortcut>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {groupedCommandHits.map((group, groupIndex) => (
              <CommandGroup
                key={group.connectionId}
                heading={group.heading}
                className={cn((groupIndex > 0 || commandActions.length > 0) && 'mt-1 border-t border-slate-800 pt-2')}
              >
                {group.items.map(({ hit, displayIndex }) => (
                  <CommandItem
                    key={`${hit.connectionId}:${hit.table.fqName}`}
                    ref={(node) => {
                      commandItemRefs.current[displayIndex] = node
                    }}
                    value={`${hit.connectionName} ${hit.table.fqName}`}
                    onSelect={() => {
                      onOpenChange(false)
                      void openTableTab(hit)
                    }}
                    onMouseMove={() => setCommandIndex(displayIndex)}
                    data-manual-active={commandIndex === displayIndex ? 'true' : 'false'}
                    className={cn(
                      'cursor-pointer text-slate-300 data-[selected=true]:bg-transparent data-[selected=true]:text-slate-300 data-[selected=true]:shadow-none aria-selected:bg-transparent aria-selected:text-slate-300',
                      'data-[manual-active=true]:!bg-slate-700/55 data-[manual-active=true]:!text-slate-50 data-[manual-active=true]:shadow-[inset_0_0_0_1px_rgba(148,163,184,0.45)]',
                    )}
                  >
                    <Table2 className='h-4 w-4' />
                    <span className='truncate'>{formatTableLabel(hit.table)}</span>
                    <div className='ml-auto flex items-center gap-2'>
                      {commandIndex === displayIndex && (
                        <CommandShortcut className='ml-0 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.08em] text-slate-300'>
                          <kbd className='inline-flex h-5 min-w-6 items-center justify-center rounded border border-slate-600/70 bg-slate-800/80 px-1.5 text-[10px] font-semibold tracking-[0.02em] text-slate-100'>
                            Tab
                          </kbd>
                          <span className='text-slate-400'>filtrar</span>
                        </CommandShortcut>
                      )}
                      <span className='text-[10px] uppercase tracking-wide text-slate-400'>
                        {engineShortLabel(hit.engine)}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
