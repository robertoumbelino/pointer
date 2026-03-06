import { useMemo, useRef, useState } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { TableSchema, TableSearchHit } from '../../../../shared/db-types'

export type CommandPaletteState = {
  isCommandOpen: boolean
  setIsCommandOpen: Dispatch<SetStateAction<boolean>>
  commandQuery: string
  setCommandQuery: Dispatch<SetStateAction<string>>
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
}

export function useCommandPalette(): CommandPaletteState {
  const [isCommandOpen, setIsCommandOpen] = useState(false)
  const [commandQuery, setCommandQuery] = useState('')
  const [commandIndex, setCommandIndex] = useState(0)
  const [commandScopedTarget, setCommandScopedTarget] = useState<TableSearchHit | null>(null)
  const [commandScopedSchema, setCommandScopedSchema] = useState<TableSchema | null>(null)
  const [commandScopedColumn, setCommandScopedColumn] = useState('')
  const [commandScopedValue, setCommandScopedValue] = useState('')

  const commandItemRefs = useRef<Record<number, HTMLDivElement | null>>({})

  return useMemo(
    () => ({
      isCommandOpen,
      setIsCommandOpen,
      commandQuery,
      setCommandQuery,
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
    }),
    [
      isCommandOpen,
      commandQuery,
      commandIndex,
      commandScopedTarget,
      commandScopedSchema,
      commandScopedColumn,
      commandScopedValue,
    ],
  )
}
