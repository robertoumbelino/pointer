import { useEffect, useMemo } from 'react'
import type { Dispatch, KeyboardEvent, MutableRefObject, SetStateAction } from 'react'
import { toast } from 'sonner'
import type { AiConfig, TableSchema, TableSearchHit } from '../../../../shared/db-types'
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

export type CommandActionId =
  | 'use-ai'
  | 'configure-ai'
  | 'remove-ai'
  | 'open-changelog'
  | 'check-app-update'
  | 'exit-workspace'

export type CommandActionItem = {
  id: CommandActionId
  label: string
  description: string
  displayIndex: number
}

type OrderedCommandItem =
  | {
      kind: 'action'
      action: CommandActionItem
    }
  | {
      kind: 'table'
      hit: TableSearchHit
      displayIndex: number
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
  openChangelog: () => void
  checkForAppUpdate: (showToastWhenCurrent?: boolean) => Promise<void>
  onExitWorkspace: () => void
  onOpenAiConfig: (mode: 'full' | 'model') => void
  onRemoveAiConfig: () => Promise<void>
  onUseAiPrompt: (prompt: string) => Promise<void>
  aiConfig: AiConfig | null
}

type UseCommandPaletteActionsResult = {
  commandActions: CommandActionItem[]
  groupedCommandHits: CommandGroup[]
  handleCommandInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  applyCommandScopedFilter: () => Promise<void>
  selectCommandAction: (actionId: CommandActionId) => Promise<void>
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
  openChangelog,
  checkForAppUpdate,
  onExitWorkspace,
  onOpenAiConfig,
  onRemoveAiConfig,
  onUseAiPrompt,
  aiConfig,
}: UseCommandPaletteActionsParams): UseCommandPaletteActionsResult {
  const commandActions = useMemo<CommandActionItem[]>(() => {
    const query = commandQuery.trim()
    const normalizedQuery = query.toLowerCase()
    const hasTableMatches = commandHits.length > 0
    const shouldShowConfigureAiAction = !commandScopedTarget && (!hasTableMatches || query.length === 0)
    const canShowUseAiAction = !commandScopedTarget && query.length > 0 && !hasTableMatches
    const configureAction: Omit<CommandActionItem, 'displayIndex'> = {
      id: 'configure-ai',
      label: aiConfig?.hasApiKey ? 'Alterar modelo IA' : 'Configurar IA',
      description: aiConfig?.hasApiKey
        ? 'Trocar provider/modelo sem alterar a chave salva'
        : 'Adicionar chave do AI Gateway',
    }

    const actions: Array<Omit<CommandActionItem, 'displayIndex'> & { keywords: string[] }> = [
      {
        id: 'open-changelog',
        label: 'Abrir changelog',
        description: 'Ver novidades e histórico de versões do app',
        keywords: ['changelog', 'novidades', 'release', 'versao', 'versão', 'historico'],
      },
      {
        id: 'check-app-update',
        label: 'Checar atualizações',
        description: 'Buscar nova versão disponível do app',
        keywords: ['atualizar', 'atualizacao', 'atualização', 'update', 'upgrade', 'nova versao', 'nova versão'],
      },
      {
        id: 'exit-workspace',
        label: 'Sair',
        description: 'Voltar para a home de ambientes',
        keywords: ['sair', 'home', 'voltar', 'ambientes'],
      },
    ]

    const filtered = normalizedQuery
      ? actions.filter((action) => {
          const searchable = [action.label, action.description, ...action.keywords].join(' ').toLowerCase()
          return searchable.includes(normalizedQuery)
        })
      : actions

    const aiActions: Array<Omit<CommandActionItem, 'displayIndex'>> = []
    if (canShowUseAiAction) {
      aiActions.push({
        id: 'use-ai',
        label: `Usar IA: ${query}`,
        description: aiConfig?.hasApiKey
          ? 'Gerar SQL em nova aba com chat lateral'
          : 'Configurar IA e gerar SQL em nova aba',
      })
    }

    if (shouldShowConfigureAiAction) {
      aiActions.push(configureAction)
      if (aiConfig?.hasApiKey) {
        aiActions.push({
          id: 'remove-ai',
          label: 'Remover IA',
          description: 'Apagar chave salva do AI Gateway neste app',
        })
      }
    }

    return [...aiActions, ...filtered].map((action, displayIndex) => ({
      id: action.id,
      label: action.label,
      description: action.description,
      displayIndex,
    }))
  }, [aiConfig?.hasApiKey, commandHits.length, commandQuery, commandScopedTarget])

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
    let displayIndex = commandActions.length

    return grouped.map((group) => ({
      ...group,
      items: group.items.map((hit) => {
        const indexed = { hit, displayIndex }
        displayIndex += 1
        return indexed
      }),
    }))
  }, [commandActions.length, commandHits])

  const orderedCommandItems = useMemo<OrderedCommandItem[]>(() => {
    const actionItems: OrderedCommandItem[] = commandActions.map((action) => ({
      kind: 'action',
      action,
    }))

    const tableItems: OrderedCommandItem[] = groupedCommandHits.flatMap((group) =>
      group.items.map((item) => ({
        kind: 'table',
        hit: item.hit,
        displayIndex: item.displayIndex,
      })),
    )

    return [...actionItems, ...tableItems]
  }, [commandActions, groupedCommandHits])

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

    if (orderedCommandItems.length === 0) {
      setCommandIndex(0)
      return
    }

    setCommandIndex((current) => Math.max(0, Math.min(current, orderedCommandItems.length - 1)))
  }, [commandScopedTarget, isCommandOpen, orderedCommandItems.length, setCommandIndex])

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
  }, [commandIndex, commandScopedTarget, commandItemRefs, isCommandOpen, orderedCommandItems.length])

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

  async function selectCommandAction(actionId: CommandActionId): Promise<void> {
    try {
      if (actionId === 'use-ai') {
        await onUseAiPrompt(commandQuery.trim())
        return
      }

      if (actionId === 'configure-ai') {
        onOpenAiConfig(aiConfig?.hasApiKey ? 'model' : 'full')
        return
      }

      if (actionId === 'remove-ai') {
        await onRemoveAiConfig()
        return
      }

      if (actionId === 'open-changelog') {
        openChangelog()
        return
      }

      if (actionId === 'exit-workspace') {
        onExitWorkspace()
        return
      }

      await checkForAppUpdate(true)
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  function handleCommandInputKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (commandScopedTarget) {
      return
    }

    if (orderedCommandItems.length === 0) {
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      event.stopPropagation()
      setCommandIndex((current) => Math.max(0, Math.min(current + 1, orderedCommandItems.length - 1)))
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
      const currentTarget = orderedCommandItems[commandIndex] ?? orderedCommandItems[0]
      const fallbackTableTarget = orderedCommandItems.find((item) => item.kind === 'table')
      const tableTarget =
        currentTarget?.kind === 'table' ? currentTarget : fallbackTableTarget?.kind === 'table' ? fallbackTableTarget : null

      if (tableTarget?.kind === 'table') {
        void enterCommandScopedMode(tableTarget.hit)
      }
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      const target = orderedCommandItems[commandIndex] ?? orderedCommandItems[0]
      if (!target) {
        return
      }

      setIsCommandOpen(false)
      if (target.kind === 'action') {
        void selectCommandAction(target.action.id)
        return
      }

      if (target.kind === 'table') {
        void openTableTab(target.hit)
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
    commandActions,
    groupedCommandHits,
    handleCommandInputKeyDown,
    applyCommandScopedFilter,
    selectCommandAction,
    handleCopyTableStructureSql,
    handleCopyInsertTemplateSql,
  }
}
