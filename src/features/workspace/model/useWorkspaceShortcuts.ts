import { useEffect } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { TableTab, WorkTab } from '../../../entities/workspace/types'

type UseWorkspaceShortcutsParams = {
  isWorkspaceActive: boolean
  activeTabId: string
  setActiveTabId: Dispatch<SetStateAction<string>>
  setIsCommandOpen: (open: boolean) => void
  setIsEnvironmentCommandOpen: (open: boolean) => void
  runSqlRef: MutableRefObject<((force?: boolean, cursorOffset?: number, explicitSql?: string, targetTabId?: string, resolvedConnectionId?: string) => Promise<void>) | undefined>
  saveActiveTableChangesRef: MutableRefObject<(() => Promise<void>) | undefined>
  commitInlineEditRef: MutableRefObject<(() => void) | undefined>
  toggleSelectedRowDeleteRef: MutableRefObject<(() => void) | undefined>
  copyTableSelectionRef: MutableRefObject<(() => Promise<void>) | undefined>
  pasteIntoTableSelectionRef: MutableRefObject<((rawClipboardText: string) => void) | undefined>
  openNewSqlTabRef: MutableRefObject<(() => void) | undefined>
  closeActiveTabRef: MutableRefObject<(() => void) | undefined>
  activeTabIdRef: MutableRefObject<string>
  workTabsRef: MutableRefObject<WorkTab[]>
  sqlCursorByTabRef: MutableRefObject<Record<string, number>>
  getTableTab: (tabId: string) => TableTab | null
}

export function useWorkspaceShortcuts({
  isWorkspaceActive,
  activeTabId,
  setActiveTabId,
  setIsCommandOpen,
  setIsEnvironmentCommandOpen,
  runSqlRef,
  saveActiveTableChangesRef,
  commitInlineEditRef,
  toggleSelectedRowDeleteRef,
  copyTableSelectionRef,
  pasteIntoTableSelectionRef,
  openNewSqlTabRef,
  closeActiveTabRef,
  activeTabIdRef,
  workTabsRef,
  sqlCursorByTabRef,
  getTableTab,
}: UseWorkspaceShortcutsParams): void {
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'r') {
        event.preventDefault()
        setIsEnvironmentCommandOpen(true)
        return
      }

      if (!isWorkspaceActive) {
        return
      }

      const isCtrlTabNavigation =
        event.ctrlKey && !event.metaKey && !event.altKey && (event.key === 'Tab' || event.code === 'Tab')
      if (isCtrlTabNavigation) {
        event.preventDefault()
        event.stopPropagation()

        const currentTabs = workTabsRef.current
        if (currentTabs.length === 0) {
          return
        }

        const activeIndex = currentTabs.findIndex((tab) => tab.id === activeTabIdRef.current)
        const startIndex = activeIndex >= 0 ? activeIndex : 0
        const direction = event.shiftKey ? -1 : 1
        const nextIndex = (startIndex + direction + currentTabs.length) % currentTabs.length
        const nextTab = currentTabs[nextIndex]
        if (!nextTab) {
          return
        }

        setActiveTabId(nextTab.id)
        return
      }

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

      const target = event.target instanceof HTMLElement ? event.target : null
      const isTypingTarget = Boolean(target?.closest('input, textarea, select, [contenteditable="true"], .cm-editor'))

      const isDeleteKey =
        (event.key === 'Delete' || event.key === 'Backspace') && !event.metaKey && !event.ctrlKey && !event.altKey
      if (isDeleteKey) {
        if (isTypingTarget) {
          return
        }

        const activeTable = getTableTab(activeTabIdRef.current)
        if (activeTable?.schema?.supportsRowEdit && activeTable.selectedRowIndexes.length > 0) {
          event.preventDefault()
          toggleSelectedRowDeleteRef.current?.()
        }
        return
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
        if (isTypingTarget) {
          return
        }

        const activeTable = getTableTab(activeTabIdRef.current)
        if (!activeTable) {
          return
        }

        event.preventDefault()
        event.stopPropagation()
        void copyTableSelectionRef.current?.()
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
          return
        }

        commitInlineEditRef.current?.()
        void saveActiveTableChangesRef.current?.()
      }
    }

    const handlePaste = (event: ClipboardEvent): void => {
      if (!isWorkspaceActive) {
        return
      }

      const target = event.target instanceof HTMLElement ? event.target : null
      const isTypingTarget = Boolean(target?.closest('input, textarea, select, [contenteditable="true"], .cm-editor'))
      if (isTypingTarget) {
        return
      }

      const activeTable = getTableTab(activeTabIdRef.current)
      if (!activeTable) {
        return
      }

      const raw = event.clipboardData?.getData('text/plain')
      if (!raw) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      pasteIntoTableSelectionRef.current?.(raw)
    }

    window.addEventListener('keydown', handleShortcut, true)
    window.addEventListener('paste', handlePaste, true)
    return () => {
      window.removeEventListener('keydown', handleShortcut, true)
      window.removeEventListener('paste', handlePaste, true)
    }
  }, [
    activeTabId,
    activeTabIdRef,
    closeActiveTabRef,
    commitInlineEditRef,
    getTableTab,
    isWorkspaceActive,
    copyTableSelectionRef,
    pasteIntoTableSelectionRef,
    openNewSqlTabRef,
    runSqlRef,
    saveActiveTableChangesRef,
    setActiveTabId,
    setIsCommandOpen,
    setIsEnvironmentCommandOpen,
    sqlCursorByTabRef,
    toggleSelectedRowDeleteRef,
    workTabsRef,
  ])
}
