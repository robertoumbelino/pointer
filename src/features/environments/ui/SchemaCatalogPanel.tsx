import type { Dispatch, SetStateAction } from 'react'
import { Search, Table2 } from 'lucide-react'
import type { TableSearchHit } from '../../../../shared/db-types'
import type { SidebarTableContextMenuState } from '../../../entities/workspace/types'
import { SIDEBAR_SECTION_LABEL_CLASS } from '../../../shared/constants/app'
import { engineShortLabel, formatSidebarTableName } from '../../../shared/lib/workspace-utils'
import { cn } from '../../../lib/utils'

type SchemaCatalogPanelProps = {
  selectedSchema: string
  setSelectedSchema: Dispatch<SetStateAction<string>>
  schemaOptions: string[]
  shortcutLabel: string
  setIsCommandOpen: Dispatch<SetStateAction<boolean>>
  filteredSidebarTables: TableSearchHit[]
  activeTabId: string
  setTableContextMenu: Dispatch<SetStateAction<SidebarTableContextMenuState | null>>
  openTableTab: (hit: TableSearchHit) => Promise<void>
}

export function SchemaCatalogPanel({
  selectedSchema,
  setSelectedSchema,
  schemaOptions,
  shortcutLabel,
  setIsCommandOpen,
  filteredSidebarTables,
  activeTabId,
  setTableContextMenu,
  openTableTab,
}: SchemaCatalogPanelProps): JSX.Element {
  return (
    <>
      <div className='border-b border-slate-800/70 p-3'>
        <label className={SIDEBAR_SECTION_LABEL_CLASS}>SCHEMA</label>
        <select
          value={selectedSchema}
          onChange={(event) => setSelectedSchema(event.target.value)}
          className='h-8 w-full rounded-md border border-slate-700/90 bg-slate-900/90 px-2.5 text-[13px] outline-none ring-slate-300/45 focus:ring-2'
        >
          <option value='all'>Todos</option>
          {schemaOptions.map((schemaName) => (
            <option key={schemaName} value={schemaName}>
              {schemaName}
            </option>
          ))}
        </select>
      </div>

      <div className='relative flex-1 overflow-hidden p-3'>
        <div className='mb-2.5 flex items-center gap-2 rounded-md border border-slate-700/90 bg-slate-900/85 px-2.5'>
          <Search className='h-3.5 w-3.5 text-slate-500' />
          <button
            className='h-8 w-full text-left text-[13px] text-slate-400'
            onClick={() => setIsCommandOpen(true)}
            type='button'
          >
            Buscar tabela... ({shortcutLabel})
          </button>
        </div>

        <div className='h-[calc(100%-3.25rem)] overflow-y-auto pr-1'>
          {filteredSidebarTables.map((hit) => {
            const tabId = `table:${hit.connectionId}:${hit.table.fqName}`
            const isOpen = activeTabId === tabId

            return (
              <button
                key={`${hit.connectionId}:${hit.table.fqName}`}
                className={cn(
                  'mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors',
                  isOpen ? 'bg-slate-200/12 text-slate-100' : 'text-slate-300 hover:bg-slate-800',
                )}
                onClick={() => {
                  setTableContextMenu(null)
                  void openTableTab(hit)
                }}
                onContextMenu={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setTableContextMenu({
                    hit,
                    x: event.clientX,
                    y: event.clientY,
                  })
                }}
                type='button'
              >
                <Table2 className='h-3.5 w-3.5 shrink-0' />
                <span className='truncate'>{formatSidebarTableName(hit.table)}</span>
                <span className='ml-auto rounded border border-slate-700/80 bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-300'>
                  {engineShortLabel(hit.engine)}
                </span>
              </button>
            )
          })}

          {filteredSidebarTables.length === 0 && (
            <p className='text-[13px] text-slate-500'>Nenhuma tabela encontrada.</p>
          )}
        </div>
      </div>
    </>
  )
}
