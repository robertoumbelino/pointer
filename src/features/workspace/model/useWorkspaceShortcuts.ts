import { useEffect } from 'react'
import type { MutableRefObject } from 'react'
import type { TableTab, WorkTab } from '../../../entities/workspace/types'

type UseWorkspaceShortcutsParams = {
  activeTabId: string
  setIsCommandOpen: (open: boolean) => void
  setIsEnvironmentCommandOpen: (open: boolean) => void
  runSqlRef: MutableRefObject<((force?: boolean, cursorOffset?: number, explicitSql?: string, targetTabId?: string) => Promise<void>) | undefined>
  saveActiveTableChangesRef: MutableRefObject<(() => Promise<void>) | undefined>
  commitInlineEditRef: MutableRefObject<(() => void) | undefined>
  toggleSelectedRowDeleteRef: MutableRefObject<(() => void) | undefined>
  openNewSqlTabRef: MutableRefObject<(() => void) | undefined>
  closeActiveTabRef: MutableRefObject<(() => void) | undefined>
  activeTabIdRef: MutableRefObject<string>
  workTabsRef: MutableRefObject<WorkTab[]>
  sqlCursorByTabRef: MutableRefObject<Record<string, number>>
  getTableTab: (tabId: string) => TableTab | null
}

export function useWorkspaceShortcuts({
  activeTabId,
  setIsCommandOpen,
  setIsEnvironmentCommandOpen,
  runSqlRef,
  saveActiveTableChangesRef,
  commitInlineEditRef,
  toggleSelectedRowDeleteRef,
  openNewSqlTabRef,
  closeActiveTabRef,
  activeTabIdRef,
  workTabsRef,
  sqlCursorByTabRef,
  getTableTab,
}: UseWorkspaceShortcutsParams): void {
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent): void => {
      const isF5 = (event.key === 'F5' || event.code === 'F5') && !event.metaKey && !event.ctrlKey && !event.altKey
      if (isF5) {
        event.preventDefault()
        event.stopPropagation()

        if (activeTabId.startsWith('sql:')) {
          const cursorOffset = sqlCursorByTabRef.current[activeTabId]
          void runSqlRef.current?.(
            false,
            typeof cursorOffset === 'number' ? cursorOffset : undefined,
            undefined,
            activeTabId,
          )
        }

        return
      }

      const isModEnter =
        (event.metaKey || event.ctrlKey) &&
        (event.key === 'Enter' || event.code === 'Enter' || event.code === 'NumpadEnter')

      if (isModEnter) {
        const target = event.target instanceof HTMLElement ? event.target : null
        const isEditorEvent = Boolean(target?.closest('.cm-editor'))

        if (isEditorEvent && activeTabId.startsWith('sql:')) {
          event.preventDefault()
          event.stopPropagation()

          const cursorOffset = sqlCursorByTabRef.current[activeTabId]
          void runSqlRef.current?.(
            false,
            typeof cursorOffset === 'number' ? cursorOffset : undefined,
            undefined,
            activeTabId,
          )
        }

        return
      }

      const isDeleteKey =
        (event.key === 'Delete' || event.key === 'Backspace') && !event.metaKey && !event.ctrlKey && !event.altKey
      if (isDeleteKey) {
        const target = event.target instanceof HTMLElement ? event.target : null
        const isTypingTarget = Boolean(
          target?.closest('input, textarea, select, [contenteditable="true"], .cm-editor'),
        )
        if (isTypingTarget) {
          return
        }

        const activeTable = getTableTab(activeTabIdRef.current)
        if (activeTable?.schema?.supportsRowEdit && activeTable.selectedRowIndex !== null) {
          event.preventDefault()
          toggleSelectedRowDeleteRef.current?.()
        }
        return
      }

      if (
        (event.metaKey || event.ctrlKey) &&
        (event.key.toLowerCase() === 'k' || event.key.toLowerCase() === 'p')
      ) {
        event.preventDefault()
        setIsCommandOpen(true)
        return
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'r') {
        event.preventDefault()
        setIsEnvironmentCommandOpen(true)
        return
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 't') {
        event.preventDefault()
        openNewSqlTabRef.current?.()
        return
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'w') {
        event.preventDefault()
        event.stopPropagation()
        closeActiveTabRef.current?.()
        return
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()

        if (activeTabId.startsWith('sql:')) {
          void runSqlRef.current?.()
        } else {
          commitInlineEditRef.current?.()
          void saveActiveTableChangesRef.current?.()
        }
      }
    }

    window.addEventListener('keydown', handleShortcut, true)
    return () => window.removeEventListener('keydown', handleShortcut, true)
  }, [
    activeTabId,
    activeTabIdRef,
    closeActiveTabRef,
    commitInlineEditRef,
    getTableTab,
    openNewSqlTabRef,
    runSqlRef,
    saveActiveTableChangesRef,
    setIsCommandOpen,
    setIsEnvironmentCommandOpen,
    sqlCursorByTabRef,
    toggleSelectedRowDeleteRef,
    workTabsRef,
  ])
}
