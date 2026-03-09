import type { Dispatch, SetStateAction } from 'react'
import { Database, Table2, X } from 'lucide-react'
import type { SqlTab, WorkTab } from '../../../entities/workspace/types'
import { cn } from '../../../lib/utils'

type WorkspaceTabsBarProps = {
  workTabs: WorkTab[]
  activeTabId: string
  setActiveTabId: Dispatch<SetStateAction<string>>
  openRenameSqlTabDialog: (tab: SqlTab) => void
  closeTableTab: (tabId: string) => void
  closeSqlTab: (tabId: string) => void
}

export function WorkspaceTabsBar({
  workTabs,
  activeTabId,
  setActiveTabId,
  openRenameSqlTabDialog,
  closeTableTab,
  closeSqlTab,
}: WorkspaceTabsBarProps): JSX.Element {
  return (
    <div className='px-3 py-2'>
      <div className='flex items-center gap-2'>
        <div className='min-w-0 flex-1 overflow-x-auto'>
          <div className='flex gap-1'>
            {workTabs.map((tab) => {
              const sqlTabsCount = workTabs.filter((item) => item.type === 'sql').length

              return (
                <button
                  key={tab.id}
                  type='button'
                  className={cn(
                    'flex items-center gap-2 rounded-xl border px-2.5 py-1 text-[12px] whitespace-nowrap',
                    activeTabId === tab.id
                      ? 'border-slate-300/35 bg-slate-200/10 text-slate-100'
                      : 'border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800',
                  )}
                  onClick={() => setActiveTabId(tab.id)}
                  onDoubleClick={() => {
                    if (tab.type === 'sql') {
                      openRenameSqlTabDialog(tab)
                    }
                  }}
                >
                  {tab.type === 'sql' ? <Database className='h-3.5 w-3.5' /> : <Table2 className='h-3.5 w-3.5' />}
                  <span>{tab.title}</span>
                  {(tab.type === 'table' || (tab.type === 'sql' && sqlTabsCount > 1)) && (
                    <span
                      role='button'
                      tabIndex={0}
                      className='rounded-lg p-0.5 hover:bg-slate-700'
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
