import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import { Play } from 'lucide-react'
import type { ConnectionSummary } from '../../../../shared/db-types'
import type { SqlTab } from '../../../entities/workspace/types'
import { Button } from '../../../components/ui/button'

type SqlWorkspacePanelProps = {
  activeSqlTab: SqlTab
  updateSqlTab: (tabId: string, updater: (tab: SqlTab) => SqlTab) => void
  connections: ConnectionSummary[]
  runSql: () => Promise<void>
  sqlSplitContainerRef: MutableRefObject<HTMLDivElement | null>
  sqlEditorExtensions: unknown[]
  sqlCursorByTabRef: MutableRefObject<Record<string, number>>
  setResizingSqlTabId: Dispatch<SetStateAction<string | null>>
  formatCell: (value: unknown) => string
}

export function SqlWorkspacePanel({
  activeSqlTab,
  updateSqlTab,
  connections,
  runSql,
  sqlSplitContainerRef,
  sqlEditorExtensions,
  sqlCursorByTabRef,
  setResizingSqlTabId,
  formatCell,
}: SqlWorkspacePanelProps): JSX.Element {
  return (
    <div className='flex h-full flex-col rounded-lg border border-slate-800/65 bg-[#0b1220]'>
      <div className='flex items-center justify-between border-b border-slate-800/70 px-3 py-2.5'>
        <div>
          <h2 className='text-sm font-semibold'>{activeSqlTab.title}</h2>
          <p className='text-[12px] text-slate-400'>
            Executar escopo: Cmd+Enter • Autocomplete: Cmd+/ • Ambiente: Cmd+R • Nova aba SQL: Cmd+T
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <select
            value={activeSqlTab.connectionId}
            onChange={(event) =>
              updateSqlTab(activeSqlTab.id, (tab) => ({
                ...tab,
                connectionId: event.target.value,
              }))
            }
            className='h-8 rounded-md border border-slate-700 bg-slate-900 px-2.5 text-[12px] outline-none ring-slate-300/45 focus:ring-2'
          >
            <option value=''>Selecione conexão</option>
            {connections.map((connection) => (
              <option key={connection.id} value={connection.id}>
                {connection.name}
              </option>
            ))}
          </select>
          <Button
            size='sm'
            className='h-8 text-[13px]'
            onClick={() => void runSql()}
            disabled={activeSqlTab.sqlRunning || !activeSqlTab.connectionId}
          >
            <Play className='mr-1.5 h-3.5 w-3.5' /> {activeSqlTab.sqlRunning ? 'Executando...' : 'Executar'}
          </Button>
        </div>
      </div>

      <div ref={sqlSplitContainerRef} className='flex h-full flex-1 flex-col overflow-hidden'>
        <div
          className='min-h-[180px] border-b border-slate-800/80'
          style={{ height: `${activeSqlTab.splitRatio}%` }}
        >
          <CodeMirror
            value={activeSqlTab.sqlText}
            height='100%'
            theme={oneDark}
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              highlightActiveLine: true,
              autocompletion: true,
            }}
            extensions={sqlEditorExtensions as never}
            onChange={(value) =>
              updateSqlTab(activeSqlTab.id, (tab) => ({
                ...tab,
                sqlText: value,
              }))
            }
            onUpdate={(update) => {
              sqlCursorByTabRef.current[activeSqlTab.id] = update.state.selection.main.head
            }}
          />
        </div>

        <div
          className='group flex h-2 cursor-row-resize items-center justify-center bg-slate-900/55'
          onMouseDown={(event) => {
            event.preventDefault()
            setResizingSqlTabId(activeSqlTab.id)
          }}
        >
          <div className='h-1 w-16 rounded-full bg-slate-700 transition-colors group-hover:bg-slate-300/55' />
        </div>

        <div className='flex-1 overflow-auto px-3 py-2'>
          <div className='mb-2 flex items-center justify-between text-xs uppercase tracking-[0.15em] text-slate-500'>
            <span>Resultado</span>
            {activeSqlTab.sqlResult && (
              <span className='text-[11px] text-slate-400 normal-case'>
                {activeSqlTab.sqlResult.resultSets.length} result set(s) em {activeSqlTab.sqlResult.durationMs}ms
              </span>
            )}
          </div>

          {activeSqlTab.sqlResult ? (
            <div className='space-y-3 pb-2'>
              {activeSqlTab.sqlResult.resultSets.map((resultSet, index) => (
                <div key={`${resultSet.command}-${index}`} className='rounded-md border border-slate-800/65 bg-slate-950/35'>
                  <div className='flex items-center justify-between border-b border-slate-800/80 px-3 py-1.5 text-xs text-slate-400'>
                    <span>{resultSet.command}</span>
                    <span>{resultSet.rowCount} linhas</span>
                  </div>
                  <div className='overflow-auto'>
                    <table className='w-full min-w-max text-xs'>
                      <thead className='bg-slate-900'>
                        <tr>
                          {resultSet.fields.map((field) => (
                            <th key={field} className='px-2 py-1 text-left font-semibold text-slate-300'>
                              {field}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {resultSet.rows.slice(0, 300).map((row, rowIndex) => (
                          <tr key={`${rowIndex}-${JSON.stringify(row)}`} className='border-t border-slate-800/70'>
                            {resultSet.fields.map((field) => (
                              <td key={`${field}-${rowIndex}`} className='px-2 py-1 text-slate-200 whitespace-nowrap'>
                                {formatCell(row[field])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className='text-sm text-slate-500'>Execute uma query para ver o resultado.</p>
          )}
        </div>
      </div>
    </div>
  )
}
