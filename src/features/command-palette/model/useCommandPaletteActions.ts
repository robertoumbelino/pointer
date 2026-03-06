import { useEffect, useMemo } from 'react'
import type { Dispatch, KeyboardEvent, MutableRefObject, SetStateAction } from 'react'
import { toast } from 'sonner'
import type { TableSchema, TableSearchHit } from '../../../../shared/db-types'
import type { SidebarTableContextMenuState, TableReloadOverrides } from '../../../entities/workspace/types'
import { pointerApi } from '../../../shared/api/pointer-api'
import {
  buildCreateTableTemplateSql,
  buildInsertTemplateSql,
  getErrorMessage,
  resolveCommandScopedColumn,
} from '../../../shared/lib/workspace-utils'

type CommandGroup = {
  connectionId: string
  heading: string
  items: Array<{ hit: TableSearchHit; displayIndex: number }>
}

type UseCommandPaletteActionsParams = {
  selectedEnvironmentId: string
  commandHits: TableSearchHit[]
  setCommandHits: Dispatch<SetStateAction<TableSearchHit[]>>
  setCatalogHits: Dispatch<SetStateAction<TableSearchHit[]>>
  isCommandOpen: boolean
  setIsCommandOpen: Dispatch<SetStateAction<boolean>>
  commandQuery: string
  commandIndex: number
  setCommandIndex: Dispatch<SetStateAction<number>>
  commandScopedTarget: TableSearchHit | null
  setCommandScopedTarget: Dispatch<SetStateAction<TableSearchHit | null>>
  commandScopedSchema: TableSchema | null
  setCommandScopedSchema: Dispatch<SetStateAction<TableSchema | null>>
  commandScopedColumn: string
  setCommandScopedColumn: Dispatch<SetStateAction<string>>
  commandScopedValue: string
  setCommandScopedValue: Dispatch<SetStateAction<string>>
  commandItemRefs: MutableRefObject<Record<number, HTMLDivElement | null>>
  commandColumnInputRef: MutableRefObject<HTMLSelectElement | null>
  setTableContextMenu: Dispatch<SetStateAction<SidebarTableContextMenuState | null>>
  openTableTab: (hit: TableSearchHit, initialLoad?: TableReloadOverrides) => Promise<void>
}

type UseCommandPaletteActionsResult = {
  groupedCommandHits: CommandGroup[]
  orderedCommandHits: TableSearchHit[]
  handleCommandInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  applyCommandScopedFilter: () => Promise<void>
  handleCopyTableStructureSql: (hit: TableSearchHit) => Promise<void>
  handleCopyInsertTemplateSql: (hit: TableSearchHit) => Promise<void>
}

export function useCommandPaletteActions({
  selectedEnvironmentId,
  commandHits,
  setCommandHits,
  setCatalogHits,
  isCommandOpen,
  setIsCommandOpen,
  commandQuery,
  commandIndex,
  setCommandIndex,
  commandScopedTarget,
  setCommandScopedTarget,
  commandScopedSchema,
  setCommandScopedSchema,
  commandScopedColumn,
  setCommandScopedColumn,
  commandScopedValue,
  setCommandScopedValue,
  commandItemRefs,
  commandColumnInputRef,
  setTableContextMenu,
  openTableTab,
}: UseCommandPaletteActionsParams): UseCommandPaletteActionsResult {
  const groupedCommandHits = useMemo(() => {
    const groups = new Map<string, { connectionId: string; heading: string; items: TableSearchHit[] }>()

    commandHits.forEach((hit) => {
      const existing = groups.get(hit.connectionId)
      if (existing) {
        existing.items.push(hit)
        return
      }

      groups.set(hit.connectionId, {
        connectionId: hit.connectionId,
        heading: hit.connectionName,
        items: [hit],
      })
    })

    const grouped = Array.from(groups.values())
    let displayIndex = 0

    return grouped.map((group) => ({
      ...group,
      items: group.items.map((hit) => {
        const indexed = { hit, displayIndex }
        displayIndex += 1
        return indexed
      }),
    }))
  }, [commandHits])

  const orderedCommandHits = useMemo(
    () => groupedCommandHits.flatMap((group) => group.items.map((item) => item.hit)),
    [groupedCommandHits],
  )

  useEffect(() => {
    if (!isCommandOpen || !selectedEnvironmentId) {
      return
    }

    const timeout = setTimeout(() => {
      void (async () => {
        try {
          const hits = await pointerApi.searchTablesInEnvironment(selectedEnvironmentId, commandQuery.trim())
          setCommandHits(hits)

          if (!commandQuery.trim()) {
            setCatalogHits(hits)
          }
        } catch (error) {
          toast.error(getErrorMessage(error))
        }
      })()
    }, 180)

    return () => clearTimeout(timeout)
  }, [commandQuery, isCommandOpen, selectedEnvironmentId, setCatalogHits, setCommandHits])

  useEffect(() => {
    if (!isCommandOpen || commandScopedTarget) {
      return
    }

    if (orderedCommandHits.length === 0) {
      setCommandIndex(0)
      return
    }

    setCommandIndex((current) => Math.max(0, Math.min(current, orderedCommandHits.length - 1)))
  }, [commandScopedTarget, isCommandOpen, orderedCommandHits.length, setCommandIndex])

  useEffect(() => {
    if (!isCommandOpen || commandScopedTarget) {
      return
    }

    setCommandIndex(0)
  }, [commandQuery, commandScopedTarget, isCommandOpen, setCommandIndex])

  useEffect(() => {
    if (!isCommandOpen || commandScopedTarget) {
      return
    }

    const activeItem = commandItemRefs.current[commandIndex]
    activeItem?.scrollIntoView({ block: 'nearest' })
  }, [commandIndex, commandScopedTarget, commandItemRefs, isCommandOpen, orderedCommandHits.length])

  async function enterCommandScopedMode(hit: TableSearchHit): Promise<void> {
    try {
      setCommandScopedTarget(hit)
      setCommandScopedColumn('')
      setCommandScopedValue('')
      setCommandScopedSchema(null)

      const schema = await pointerApi.describeTable(hit.connectionId, hit.table)
      setCommandScopedSchema(schema)
      setCommandScopedColumn(schema.columns[0]?.name ?? '')

      window.requestAnimationFrame(() => {
        commandColumnInputRef.current?.focus()
      })
    } catch (error) {
      setCommandScopedTarget(null)
      setCommandScopedSchema(null)
      toast.error(getErrorMessage(error))
    }
  }

  function handleCommandInputKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (commandScopedTarget) {
      return
    }

    if (orderedCommandHits.length === 0) {
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      event.stopPropagation()
      setCommandIndex((current) => Math.max(0, Math.min(current + 1, orderedCommandHits.length - 1)))
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      event.stopPropagation()
      setCommandIndex((current) => Math.max(0, current - 1))
      return
    }

    if (event.key === 'Tab') {
      event.preventDefault()
      event.stopPropagation()
      const target = orderedCommandHits[commandIndex] ?? orderedCommandHits[0]
      if (target) {
        void enterCommandScopedMode(target)
      }
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      const target = orderedCommandHits[commandIndex] ?? orderedCommandHits[0]
      if (target) {
        setIsCommandOpen(false)
        void openTableTab(target)
      }
    }
  }

  async function applyCommandScopedFilter(): Promise<void> {
    if (!commandScopedTarget || !commandScopedSchema) {
      return
    }

    const resolvedColumn = resolveCommandScopedColumn(commandScopedSchema, commandScopedColumn)
    if (!resolvedColumn) {
      toast.error('Coluna inválida para filtro.')
      return
    }

    if (!commandScopedValue.trim()) {
      toast.error('Informe um valor para buscar.')
      return
    }

    setIsCommandOpen(false)
    void openTableTab(commandScopedTarget, {
      page: 0,
      filterColumn: resolvedColumn,
      filterOperator: 'ilike',
      filterValue: commandScopedValue.trim(),
    })
    setCommandScopedTarget(null)
    setCommandScopedSchema(null)
    setCommandScopedColumn('')
    setCommandScopedValue('')
  }

  async function handleCopyTableStructureSql(hit: TableSearchHit): Promise<void> {
    try {
      const schema = await pointerApi.describeTable(hit.connectionId, hit.table)
      const sql = buildCreateTableTemplateSql(hit.engine, schema)
      await pointerApi.copyToClipboard(sql)
      setTableContextMenu(null)
      toast.success('Estrutura da tabela copiada.')
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  async function handleCopyInsertTemplateSql(hit: TableSearchHit): Promise<void> {
    try {
      const schema = await pointerApi.describeTable(hit.connectionId, hit.table)
      const sql = buildInsertTemplateSql(hit.engine, schema)
      await pointerApi.copyToClipboard(sql)
      setTableContextMenu(null)
      toast.success('SQL de insert copiado.')
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  return {
    groupedCommandHits,
    orderedCommandHits,
    handleCommandInputKeyDown,
    applyCommandScopedFilter,
    handleCopyTableStructureSql,
    handleCopyInsertTemplateSql,
  }
}
