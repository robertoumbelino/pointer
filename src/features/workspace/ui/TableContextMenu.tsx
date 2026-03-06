import { Copy, FileCode2, Table2 } from 'lucide-react'
import type { TableSearchHit } from '../../../../shared/db-types'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu'

type TableContextMenuState = {
  hit: TableSearchHit
  x: number
  y: number
}

type TableContextMenuProps = {
  tableContextMenu: TableContextMenuState | null
  setTableContextMenu: (value: TableContextMenuState | null) => void
  onCopyStructureSql: (hit: TableSearchHit) => Promise<void>
  onCopyInsertSql: (hit: TableSearchHit) => Promise<void>
}

export function TableContextMenu({
  tableContextMenu,
  setTableContextMenu,
  onCopyStructureSql,
  onCopyInsertSql,
}: TableContextMenuProps): JSX.Element {
  return (
    <DropdownMenu
      open={Boolean(tableContextMenu)}
      onOpenChange={(open) => {
        if (!open) {
          setTableContextMenu(null)
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type='button'
          aria-hidden
          tabIndex={-1}
          className='fixed h-0 w-0 opacity-0 pointer-events-none'
          style={{
            left: tableContextMenu?.x ?? -9999,
            top: tableContextMenu?.y ?? -9999,
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='start'
        side='right'
        sideOffset={8}
        className='w-[238px]'
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DropdownMenuLabel className='flex items-center gap-2'>
          <Table2 className='h-3.5 w-3.5 text-slate-400' />
          TABELA
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault()
            if (!tableContextMenu) {
              return
            }

            void onCopyStructureSql(tableContextMenu.hit)
          }}
        >
          <FileCode2 className='h-3.5 w-3.5 text-slate-400' />
          Copiar estrutura da tabela
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault()
            if (!tableContextMenu) {
              return
            }

            void onCopyInsertSql(tableContextMenu.hit)
          }}
        >
          <Copy className='h-3.5 w-3.5 text-slate-400' />
          Copiar SQL de Insert
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
