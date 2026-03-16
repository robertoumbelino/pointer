import { useCallback, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView } from '@codemirror/view'
import { Bot, ChevronDown, Download, Loader2, Play, SendHorizontal, X } from 'lucide-react'
import type { ConnectionSummary } from '../../../../shared/db-types'
import type { SqlTab } from '../../../entities/workspace/types'
import { Button } from '../../../components/ui/button'
import { ButtonGroup } from '../../../components/ui/button-group'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../../components/ui/dropdown-menu'
import { Textarea } from '../../../components/ui/textarea'
import { AUTO_SQL_CONNECTION_ID } from '../../../shared/constants/app'
import { extractFromJoinTableReferenceAtCursor } from '../../../shared/lib/workspace-utils'

type SqlWorkspacePanelProps = {
  activeSqlTab: SqlTab
  updateSqlTab: (tabId: string, updater: (tab: SqlTab) => SqlTab) => void
  connections: ConnectionSummary[]
  runSql: () => Promise<void>
  cancelSqlExecution: () => Promise<void>
  sqlSplitContainerRef: MutableRefObject<HTMLDivElement | null>
  sqlEditorExtensions: unknown[]
  sqlCursorByTabRef: MutableRefObject<Record<string, number>>
  setResizingSqlTabId: Dispatch<SetStateAction<string | null>>
  formatCell: (value: unknown) => string
  exportSqlResultSetVisibleCsv: (params: {
    tabId: string
    resultSetIndex: number
    fields: string[]
    rows: Record<string, unknown>[]
  }) => void
  sendAiPromptToSqlTab: (tabId: string, prompt: string) => Promise<void>
  setAiDraftOnSqlTab: (tabId: string, value: string) => void
  onRequestSqlTableStructure: (params: {
    tabId: string
    connectionId: string
    sqlText: string
    cursorOffset: number
  }) => Promise<void>
}

type ResultSetSortState = {
  field: string
  clickCount: number
}

function nextSortState(current: ResultSetSortState | undefined, field: string): ResultSetSortState {
  if (!current || current.field !== field) {
    return { field, clickCount: 1 }
  }

  return { field, clickCount: current.clickCount + 1 }
}

function compareUnknownValues(left: unknown, right: unknown): number {
  if (left === right) {
    return 0
  }

  if (left === null || left === undefined) {
    return -1
  }

  if (right === null || right === undefined) {
    return 1
  }

  if (typeof left === 'number' && typeof right === 'number') {
    return left - right
  }

  if (typeof left === 'boolean' && typeof right === 'boolean') {
    return Number(left) - Number(right)
  }

  const leftText = typeof left === 'object' ? JSON.stringify(left) : String(left)
  const rightText = typeof right === 'object' ? JSON.stringify(right) : String(right)

  return leftText.localeCompare(rightText, undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

export function SqlWorkspacePanel({
  activeSqlTab,
  updateSqlTab,
  connections,
  runSql,
  cancelSqlExecution,
  sqlSplitContainerRef,
  sqlEditorExtensions,
  sqlCursorByTabRef,
  setResizingSqlTabId,
  formatCell,
  exportSqlResultSetVisibleCsv,
  sendAiPromptToSqlTab,
  setAiDraftOnSqlTab,
  onRequestSqlTableStructure,
}: SqlWorkspacePanelProps): JSX.Element {
  const [resultSetSortByKey, setResultSetSortByKey] = useState<Record<string, ResultSetSortState>>({})
  const isMacPlatform = navigator.platform.includes('Mac')
  const hoverPointerRef = useRef(false)
  const lastMousePositionRef = useRef<{ x: number; y: number } | null>(null)

  const applyPointerCursor = useCallback((view: EditorView, shouldUsePointer: boolean): void => {
    if (hoverPointerRef.current === shouldUsePointer) {
      return
    }

    hoverPointerRef.current = shouldUsePointer
    const cursor = shouldUsePointer ? 'pointer' : ''
    view.dom.style.cursor = cursor
    view.contentDOM.style.cursor = cursor
  }, [])

  const isPointerHoveringTableReference = useCallback(
    (view: EditorView, clientX: number, clientY: number, isModifierPressed: boolean): boolean => {
      if (!isModifierPressed) {
        return false
      }

      const cursorOffset = view.posAtCoords({ x: clientX, y: clientY })
      if (typeof cursorOffset !== 'number') {
        return false
      }

      return Boolean(extractFromJoinTableReferenceAtCursor(activeSqlTab.sqlText, cursorOffset))
    },
    [activeSqlTab.sqlText],
  )

  const sqlEditorWithStructureClick = useMemo(
    () => [
      ...sqlEditorExtensions,
      EditorView.domEventHandlers({
        mousedown: (event, view) => {
          const isModifierPressed = isMacPlatform ? event.metaKey : event.ctrlKey
          if (!isModifierPressed || event.button !== 0) {
            return false
          }

          const cursorOffset = view.posAtCoords({ x: event.clientX, y: event.clientY })
          if (typeof cursorOffset !== 'number') {
            return false
          }

          if (!extractFromJoinTableReferenceAtCursor(activeSqlTab.sqlText, cursorOffset)) {
            return false
          }

          event.preventDefault()
          event.stopPropagation()
          void onRequestSqlTableStructure({
            tabId: activeSqlTab.id,
            connectionId: activeSqlTab.connectionId,
            sqlText: activeSqlTab.sqlText,
            cursorOffset,
          })
          return true
        },
        mousemove: (event, view) => {
          lastMousePositionRef.current = { x: event.clientX, y: event.clientY }
          const isModifierPressed = isMacPlatform ? event.metaKey : event.ctrlKey
          const shouldUsePointer = isPointerHoveringTableReference(
            view,
            event.clientX,
            event.clientY,
            isModifierPressed,
          )
          applyPointerCursor(view, shouldUsePointer)
          return false
        },
        mouseleave: (_event, view) => {
          lastMousePositionRef.current = null
          applyPointerCursor(view, false)
          return false
        },
        keydown: (event, view) => {
          if (event.key !== 'Meta' && event.key !== 'Control') {
            return false
          }

          const lastMouse = lastMousePositionRef.current
          if (!lastMouse) {
            return false
          }

          const isModifierPressed = isMacPlatform ? event.metaKey : event.ctrlKey
          const shouldUsePointer = isPointerHoveringTableReference(view, lastMouse.x, lastMouse.y, isModifierPressed)
          applyPointerCursor(view, shouldUsePointer)
          return false
        },
        keyup: (event, view) => {
          if (event.key !== 'Meta' && event.key !== 'Control') {
            return false
          }

          const lastMouse = lastMousePositionRef.current
          if (!lastMouse) {
            applyPointerCursor(view, false)
            return false
          }

          const isModifierPressed = isMacPlatform ? event.metaKey : event.ctrlKey
          const shouldUsePointer = isPointerHoveringTableReference(view, lastMouse.x, lastMouse.y, isModifierPressed)
          applyPointerCursor(view, shouldUsePointer)
          return false
        },
        blur: (_event, view) => {
          applyPointerCursor(view, false)
          return false
        },
      }),
    ],
    [
      activeSqlTab.connectionId,
      activeSqlTab.id,
      activeSqlTab.sqlText,
      applyPointerCursor,
      isMacPlatform,
      isPointerHoveringTableReference,
      onRequestSqlTableStructure,
      sqlEditorExtensions,
    ],
  )
  const canRunSql =
    !activeSqlTab.sqlRunning &&
    Boolean(activeSqlTab.connectionId) &&
    (activeSqlTab.connectionId !== AUTO_SQL_CONNECTION_ID || connections.length > 0)

  return (
    <div className='pointer-card flex h-full flex-col overflow-hidden'>
      <div className='flex items-center justify-between border-b border-slate-800/70 px-3 py-2.5'>
        <div>
          <h2 className='text-sm font-semibold'>{activeSqlTab.title}</h2>
          <p className='text-[12px] text-slate-400'>
            Executar escopo: Cmd+Enter • Autocomplete: Cmd+/ • Estrutura: Cmd+Click em FROM/JOIN • Ambiente: Cmd+R • Nova aba SQL: Cmd+T
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
            <option value={AUTO_SQL_CONNECTION_ID}>Auto</option>
            {connections.map((connection) => (
              <option key={connection.id} value={connection.id}>
                {connection.name}
              </option>
            ))}
          </select>
          <ButtonGroup>
            <Button
              size='sm'
              className='h-8 text-[13px]'
              onClick={() => void runSql()}
              disabled={!canRunSql}
            >
              <Play className='mr-1.5 h-3.5 w-3.5' />{' '}
              {activeSqlTab.sqlRunning ? (activeSqlTab.sqlCanceling ? 'Cancelando...' : 'Executando...') : 'Executar'}
            </Button>
            {activeSqlTab.sqlRunning && (
              <Button
                variant='outline'
                size='icon'
                className='h-8 w-8'
                onClick={() => void cancelSqlExecution()}
                disabled={activeSqlTab.sqlCanceling}
                aria-label='Cancelar execução SQL'
                title='Cancelar execução SQL'
              >
                {activeSqlTab.sqlCanceling ? (
                  <Loader2 className='h-3.5 w-3.5 animate-spin' />
                ) : (
                  <X className='h-3.5 w-3.5' />
                )}
              </Button>
            )}
          </ButtonGroup>
        </div>
      </div>

      <div className='flex h-full min-h-0 flex-1 overflow-hidden p-3'>
        <div
          ref={sqlSplitContainerRef}
          className={`flex min-h-0 h-full flex-1 flex-col overflow-hidden ${activeSqlTab.isAiTab ? 'pr-3' : ''}`}
        >
          <div
            className='pointer-card-soft min-h-[180px] overflow-hidden'
            style={{ height: `${activeSqlTab.splitRatio}%` }}
          >
            <div className='no-drag h-full min-h-0'>
              <CodeMirror
                className='h-full'
                value={activeSqlTab.sqlText}
                height='100%'
                theme={oneDark}
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  highlightActiveLine: true,
                  autocompletion: true,
                }}
                extensions={sqlEditorWithStructureClick as never}
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
          </div>

          <div
            className='group my-2.5 flex h-2 cursor-row-resize items-center justify-center rounded-full bg-slate-900/55'
            onMouseDown={(event) => {
              event.preventDefault()
              setResizingSqlTabId(activeSqlTab.id)
            }}
          >
            <div className='h-1 w-16 rounded-full bg-slate-700 transition-colors group-hover:bg-slate-300/55' />
          </div>

          <div className='pointer-card-soft flex-1 overflow-auto px-3 py-2'>
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
                  (() => {
                    const sortKey = `${activeSqlTab.id}:${index}`
                    const sortState = resultSetSortByKey[sortKey]
                    const sortPhase = sortState ? ((sortState.clickCount % 3) as 0 | 1 | 2) : 0
                    const effectiveSort =
                      sortState &&
                      sortPhase !== 0 &&
                      resultSet.fields.includes(sortState.field)
                        ? sortState
                        : undefined
                    const sortedRows = resultSet.rows
                      .map((row, originalIndex) => ({ row, originalIndex }))
                      .sort((left, right) => {
                        if (!effectiveSort) {
                          return left.originalIndex - right.originalIndex
                        }

                        const comparison = compareUnknownValues(
                          left.row[effectiveSort.field],
                          right.row[effectiveSort.field],
                        )

                        if (comparison !== 0) {
                          return sortPhase === 1 ? comparison : -comparison
                        }

                        return left.originalIndex - right.originalIndex
                      })
                      .map(({ row }) => row)
                    const visibleRows = sortedRows.slice(0, 300)
                    const resultSetSchemaSignature = resultSet.fields.join('|')

                    return (
                      <div
                        key={`${resultSet.command}-${index}-${resultSetSchemaSignature}`}
                        className='rounded-md border border-slate-800/65 bg-slate-950/35'
                      >
                        <div className='flex items-center justify-between border-b border-slate-800/80 px-3 py-1.5 text-xs text-slate-400'>
                          <span>{resultSet.command}</span>
                          <div className='flex items-center gap-2'>
                            <span>{resultSet.rowCount} linhas</span>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant='outline' size='sm' className='h-7 px-2 text-[12px]'>
                                  <Download className='mr-1 h-3.5 w-3.5' />
                                  Exportar
                                  <ChevronDown className='ml-1 h-3.5 w-3.5' />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align='end' className='w-[200px]'>
                                <DropdownMenuItem
                                  onSelect={(event) => {
                                    event.preventDefault()
                                    exportSqlResultSetVisibleCsv({
                                      tabId: activeSqlTab.id,
                                      resultSetIndex: index,
                                      fields: resultSet.fields,
                                      rows: visibleRows,
                                    })
                                  }}
                                >
                                  <Download className='h-3.5 w-3.5 text-slate-400' />
                                  Exportar CSV (visível)
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled>
                                  <span className='h-3.5 w-3.5 text-center text-slate-500'>•</span>
                                  Exportar JSON (em breve)
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                        <div className='overflow-auto'>
                          <table className='w-full min-w-max text-xs'>
                            <thead className='bg-slate-900'>
                              <tr>
                                <th className='sticky left-0 z-[1] w-10 border-r border-slate-800/80 bg-slate-900 px-1 py-1 text-center font-semibold text-slate-400'>
                                  #
                                </th>
                                {resultSet.fields.map((field, fieldIndex) => (
                                  <th
                                    key={`field-${fieldIndex}`}
                                    className='cursor-pointer select-none px-2 py-1 text-left font-semibold text-slate-300'
                                    onMouseDown={(event) => {
                                      event.preventDefault()
                                      event.stopPropagation()

                                      setResultSetSortByKey((current) => {
                                        const currentSort = current[sortKey]
                                        const nextSort = nextSortState(currentSort, field)

                                        return {
                                          ...current,
                                          [sortKey]: nextSort,
                                        }
                                      })
                                    }}
                                  >
                                    <span className='inline-flex items-center gap-1'>
                                      <span>{field}</span>
                                      {effectiveSort?.field === field && (
                                        <span className='text-slate-300'>
                                          {sortPhase === 1 ? '↑' : '↓'}
                                        </span>
                                      )}
                                    </span>
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {visibleRows.map((row, rowIndex) => (
                                <tr key={`${rowIndex}-${JSON.stringify(row)}`} className='border-t border-slate-800/70'>
                                  <td className='sticky left-0 z-[1] border-r border-slate-800/70 bg-slate-900/95 px-1 py-1 text-center font-medium text-slate-300'>
                                    {rowIndex + 1}
                                  </td>
                                  {resultSet.fields.map((field, fieldIndex) => (
                                    <td key={`cell-${rowIndex}-${fieldIndex}`} className='px-2 py-1 text-slate-200 whitespace-nowrap'>
                                      {formatCell(row[field])}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  })()
                ))}
              </div>
            ) : (
              <p className='text-sm text-slate-500'>Execute uma query para ver o resultado.</p>
            )}
          </div>
        </div>

        {activeSqlTab.isAiTab && (
          <aside className='pointer-card-soft flex w-[340px] min-w-[320px] flex-col overflow-hidden border border-slate-800/70'>
            <div className='flex items-center gap-2 border-b border-slate-800/70 px-3 py-2'>
              <Bot className='h-4 w-4 text-slate-300' />
              <div>
                <p className='text-[12px] font-semibold uppercase tracking-[0.1em] text-slate-300'>Assistente IA</p>
                <p className='text-[11px] text-slate-500'>Refine a consulta em linguagem natural.</p>
              </div>
            </div>

            <div className='flex-1 space-y-2 overflow-auto px-3 py-2'>
              {activeSqlTab.aiMessages.length === 0 ? (
                <p className='text-[12px] text-slate-500'>Descreva uma consulta no Cmd+K para iniciar.</p>
              ) : (
                activeSqlTab.aiMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`rounded-md border px-2.5 py-2 text-[12px] leading-relaxed ${
                      message.role === 'user'
                        ? 'ml-5 border-cyan-500/30 bg-cyan-500/10 text-cyan-100'
                        : 'mr-5 border-slate-700 bg-slate-900/80 text-slate-200'
                    }`}
                  >
                    <p className='mb-1 text-[10px] uppercase tracking-[0.08em] text-slate-400'>
                      {message.role === 'user' ? 'Você' : 'IA'}
                    </p>
                    <p className='whitespace-pre-wrap'>{message.content}</p>
                  </div>
                ))
              )}

              {activeSqlTab.aiLoading && (
                <div className='mr-5 rounded-md border border-slate-700 bg-slate-900/80 px-2.5 py-2 text-[12px] text-slate-300'>
                  IA pensando...
                </div>
              )}
            </div>

            <div className='border-t border-slate-800/70 p-2.5'>
              <Textarea
                value={activeSqlTab.aiDraft}
                placeholder='Peça ajustes: filtros, colunas, agrupamento...'
                className='min-h-[78px] resize-none text-[12px]'
                onChange={(event) => setAiDraftOnSqlTab(activeSqlTab.id, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    if (!activeSqlTab.aiLoading) {
                      void sendAiPromptToSqlTab(activeSqlTab.id, activeSqlTab.aiDraft)
                    }
                  }
                }}
              />
              <div className='mt-2 flex justify-end'>
                <Button
                  size='sm'
                  className='h-8 text-[12px]'
                  disabled={activeSqlTab.aiLoading || !activeSqlTab.aiDraft.trim()}
                  onClick={() => void sendAiPromptToSqlTab(activeSqlTab.id, activeSqlTab.aiDraft)}
                >
                  <SendHorizontal className='mr-1.5 h-3.5 w-3.5' />
                  Enviar
                </Button>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
