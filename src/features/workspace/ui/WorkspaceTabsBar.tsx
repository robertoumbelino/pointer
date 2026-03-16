import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, DragEvent, MouseEvent, SetStateAction } from 'react'
import { Bot, Database, Table2, X } from 'lucide-react'
import type { SqlTab, WorkTab } from '../../../entities/workspace/types'
import { cn } from '../../../lib/utils'

type WorkspaceTabsBarProps = {
  workTabs: WorkTab[]
  activeTabId: string
  setActiveTabId: Dispatch<SetStateAction<string>>
  openRenameSqlTabDialog: (tab: SqlTab) => void
  reorderWorkTabs: (draggedTabId: string, targetTabId: string, position?: 'before' | 'after') => void
  closeTableTab: (tabId: string) => void
  closeSqlTab: (tabId: string) => void
}

type TabVisualItem =
  | {
      type: 'tab'
      tab: WorkTab
    }
  | {
      type: 'placeholder'
      key: string
    }

const DRAG_HYSTERESIS_PX = 12

export function WorkspaceTabsBar({
  workTabs,
  activeTabId,
  setActiveTabId,
  openRenameSqlTabDialog,
  reorderWorkTabs,
  closeTableTab,
  closeSqlTab,
}: WorkspaceTabsBarProps): JSX.Element {
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null)
  const [dropInsertionIndex, setDropInsertionIndex] = useState<number | null>(null)
  const draggingTabIdRef = useRef<string | null>(null)
  const dropInsertionIndexRef = useRef<number | null>(null)
  const suppressClickUntilRef = useRef(0)
  const tabsRowRef = useRef<HTMLDivElement | null>(null)
  const placeholderKey = '__tab-drop-placeholder__'

  const clearDragState = useCallback((): void => {
    draggingTabIdRef.current = null
    dropInsertionIndexRef.current = null
    setDraggingTabId(null)
    setDropInsertionIndex(null)
  }, [])

  const clearDragStateDeferred = useCallback((): void => {
    window.setTimeout(() => {
      clearDragState()
    }, 0)
  }, [clearDragState])

  useEffect(() => {
    dropInsertionIndexRef.current = dropInsertionIndex
  }, [dropInsertionIndex])

  useEffect(() => {
    if (!draggingTabId) {
      return
    }

    const handleGlobalDragEnd = (): void => {
      clearDragStateDeferred()
    }

    const handleGlobalKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        clearDragState()
      }
    }

    window.addEventListener('dragend', handleGlobalDragEnd, true)
    window.addEventListener('keydown', handleGlobalKeyDown, true)

    return () => {
      window.removeEventListener('dragend', handleGlobalDragEnd, true)
      window.removeEventListener('keydown', handleGlobalKeyDown, true)
    }
  }, [clearDragState, clearDragStateDeferred, draggingTabId])

  const resolveInsertionIndex = useCallback(
    (clientX: number): number | null => {
      const row = tabsRowRef.current
      const draggedTabId = draggingTabIdRef.current
      if (!row || !draggedTabId) {
        return null
      }

      const tabButtons = Array.from(row.querySelectorAll<HTMLButtonElement>('[data-tab-id]')).filter((button) => {
        const tabId = button.dataset.tabId
        return Boolean(tabId) && tabId !== draggedTabId
      })

      if (tabButtons.length === 0) {
        return 0
      }

      const midpoints = tabButtons.map((button) => {
        const rect = button.getBoundingClientRect()
        return rect.left + rect.width / 2
      })

      let candidateIndex = tabButtons.length
      for (let index = 0; index < midpoints.length; index += 1) {
        if (clientX < midpoints[index]) {
          candidateIndex = index
          break
        }
      }

      const previousIndex = dropInsertionIndexRef.current
      if (previousIndex !== null && candidateIndex !== previousIndex && Math.abs(candidateIndex - previousIndex) === 1) {
        const boundaryIndex = candidateIndex > previousIndex ? previousIndex : candidateIndex
        const boundary = midpoints[boundaryIndex]
        if (typeof boundary === 'number' && Math.abs(clientX - boundary) <= DRAG_HYSTERESIS_PX) {
          return previousIndex
        }
      }

      return candidateIndex
    },
    [],
  )

  const visualItems = useMemo<TabVisualItem[]>(() => {
    if (!draggingTabId || dropInsertionIndex === null) {
      return workTabs.map((tab) => ({ type: 'tab', tab }))
    }

    const nonDraggedCount = workTabs.reduce((count, tab) => count + (tab.id === draggingTabId ? 0 : 1), 0)
    const boundedInsertionIndex = Math.max(0, Math.min(nonDraggedCount, dropInsertionIndex))
    const items: TabVisualItem[] = []
    let seenNonDragged = 0

    for (const tab of workTabs) {
      if (tab.id !== draggingTabId && seenNonDragged === boundedInsertionIndex) {
        items.push({ type: 'placeholder', key: placeholderKey })
      }

      items.push({ type: 'tab', tab })

      if (tab.id !== draggingTabId) {
        seenNonDragged += 1
      }
    }

    if (boundedInsertionIndex === nonDraggedCount) {
      items.push({ type: 'placeholder', key: placeholderKey })
    }

    return items
  }, [draggingTabId, dropInsertionIndex, workTabs])

  const handleTabClick = (event: MouseEvent<HTMLButtonElement>, tabId: string): void => {
    if (Date.now() < suppressClickUntilRef.current) {
      event.preventDefault()
      return
    }

    setActiveTabId(tabId)
  }

  const handleDragStart = (event: DragEvent<HTMLButtonElement>, tabId: string): void => {
    draggingTabIdRef.current = tabId
    setDraggingTabId(tabId)
    dropInsertionIndexRef.current = null
    setDropInsertionIndex(null)

    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', tabId)
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>): void => {
    if (!draggingTabIdRef.current) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'

    const nextIndex = resolveInsertionIndex(event.clientX)
    if (nextIndex === null) {
      return
    }

    if (nextIndex !== dropInsertionIndexRef.current) {
      dropInsertionIndexRef.current = nextIndex
      setDropInsertionIndex(nextIndex)
    }
  }

  const handleDragLeave = (event: DragEvent<HTMLDivElement>): void => {
    if (!draggingTabIdRef.current) {
      return
    }

    const { currentTarget, clientX, clientY } = event
    const rect = currentTarget.getBoundingClientRect()
    const isOutsideTabsRow =
      clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom

    if (!isOutsideTabsRow) {
      return
    }

    dropInsertionIndexRef.current = null
    setDropInsertionIndex(null)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()

    const droppedTabId = draggingTabIdRef.current || event.dataTransfer.getData('text/plain')
    const resolvedInsertionIndex = dropInsertionIndexRef.current ?? resolveInsertionIndex(event.clientX)

    if (droppedTabId && resolvedInsertionIndex !== null) {
      const tabsWithoutDragged = workTabs.filter((tab) => tab.id !== droppedTabId)
      if (tabsWithoutDragged.length > 0) {
        const boundedInsertionIndex = Math.max(0, Math.min(tabsWithoutDragged.length, resolvedInsertionIndex))
        const target = tabsWithoutDragged[boundedInsertionIndex]
        const fallback = tabsWithoutDragged[tabsWithoutDragged.length - 1]

        if (target) {
          reorderWorkTabs(droppedTabId, target.id, 'before')
          suppressClickUntilRef.current = Date.now() + 250
        } else if (fallback) {
          reorderWorkTabs(droppedTabId, fallback.id, 'after')
          suppressClickUntilRef.current = Date.now() + 250
        }
      }
    }

    clearDragState()
  }

  return (
    <div className='px-3 py-2'>
      <div className='flex items-center gap-2'>
        <div className='min-w-0 flex-1 overflow-x-auto'>
          <div
            ref={tabsRowRef}
            className='flex gap-1'
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {visualItems.map((item) => {
              if (item.type === 'placeholder') {
                return (
                  <div
                    key={item.key}
                    className='min-w-[92px] rounded-xl border border-slate-500/45 bg-slate-800/40 px-2.5 py-1 text-[12px] shadow-[inset_0_0_0_1px_rgba(148,163,184,0.18)]'
                  />
                )
              }

              const tab = item.tab
              const isDraggingTab = draggingTabId === tab.id
              const shouldCollapseDraggingSlot = isDraggingTab && dropInsertionIndex !== null
              const sqlTabsCount = workTabs.filter((candidate) => candidate.type === 'sql').length

              return (
                <button
                  key={tab.id}
                  data-tab-id={tab.id}
                  type='button'
                  draggable
                  className={cn(
                    'flex items-center gap-2 rounded-xl border px-2.5 py-1 text-[12px] whitespace-nowrap transition-opacity',
                    activeTabId === tab.id
                      ? 'border-slate-300/35 bg-slate-200/10 text-slate-100'
                      : 'border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800',
                    isDraggingTab && 'opacity-35',
                    shouldCollapseDraggingSlot && 'pointer-events-none w-0 min-w-0 overflow-hidden border-transparent px-0 opacity-0',
                  )}
                  onClick={(event) => handleTabClick(event, tab.id)}
                  onDragStart={(event) => handleDragStart(event, tab.id)}
                  onDragEnd={clearDragStateDeferred}
                  onDoubleClick={() => {
                    if (tab.type === 'sql') {
                      openRenameSqlTabDialog(tab)
                    }
                  }}
                >
                  {tab.type === 'sql' ? (
                    tab.isAiTab ? <Bot className='h-3.5 w-3.5' /> : <Database className='h-3.5 w-3.5' />
                  ) : (
                    <Table2 className='h-3.5 w-3.5' />
                  )}
                  <span>{tab.title}</span>
                  {(tab.type === 'table' || (tab.type === 'sql' && sqlTabsCount > 1)) && (
                    <span
                      role='button'
                      tabIndex={0}
                      draggable={false}
                      className='rounded-lg p-0.5 hover:bg-slate-700'
                      onMouseDown={(event) => event.stopPropagation()}
                      onDragStart={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                      }}
                      onClick={(event) => {
                        event.stopPropagation()
                        if (tab.type === 'table') {
                          closeTableTab(tab.id)
                        } else {
                          closeSqlTab(tab.id)
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          if (tab.type === 'table') {
                            closeTableTab(tab.id)
                          } else {
                            closeSqlTab(tab.id)
                          }
                        }
                      }}
                    >
                      <X className='h-3.5 w-3.5' />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
