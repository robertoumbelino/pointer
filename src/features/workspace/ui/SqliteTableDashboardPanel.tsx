import { useCallback, useEffect, useRef } from 'react'
import { Database, Gauge, HardDrive, Info, RefreshCw, Search } from 'lucide-react'
import { toast } from 'sonner'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { Button } from '../../../components/ui/button'
import { ChartContainer, type ChartConfig, ChartTooltip, ChartTooltipContent } from '../../../components/ui/chart'
import type {
  DashboardTab,
  SqliteTableDashboardIndexPoint,
  SqliteTableDashboardMetrics,
  SqliteTableDashboardSeriesPoint,
  SqliteTableDashboardTab,
} from '../../../entities/workspace/types'
import { pointerApi } from '../../../shared/api/pointer-api'
import { formatTableLabel, getErrorMessage, quoteSqlIdentifier } from '../../../shared/lib/workspace-utils'

const DASHBOARD_REFRESH_INTERVAL_MS = 30_000
const DASHBOARD_HISTORY_LIMIT = 120

type SqliteSnapshot = {
  collectedAt: string
  pageCount: number
  pageSize: number
  freelistCount: number
  rowCount: number | null
  indexes: SqliteTableDashboardIndexPoint[]
  scanSummary: string
  scanDetails: string[]
}

type SqliteTableDashboardPanelProps = {
  activeDashboardTab: SqliteTableDashboardTab
  updateDashboardTab: (tabId: string, updater: (tab: DashboardTab) => DashboardTab) => void
}

const sqliteTrendChartConfig = {
  rowCount: {
    label: 'Rows',
    color: '#38bdf8',
  },
  tableSizeBytes: {
    label: 'Table bytes',
    color: '#f59e0b',
  },
} satisfies ChartConfig

function quoteSqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function buildSqliteDashboardSql(schema: string, table: string): string {
  const schemaIdentifier = quoteSqlIdentifier('sqlite', schema)
  const tableIdentifier = quoteSqlIdentifier('sqlite', table)
  const tableLiteral = quoteSqlLiteral(table)
  const qualifiedTable = `${schemaIdentifier}.${tableIdentifier}`

  return `
SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AS collected_at;
PRAGMA ${schemaIdentifier}.page_count;
PRAGMA ${schemaIdentifier}.page_size;
PRAGMA ${schemaIdentifier}.freelist_count;
SELECT COUNT(*) AS row_count FROM ${qualifiedTable};
SELECT
  name AS index_name,
  sql AS sql_definition
FROM ${schemaIdentifier}.sqlite_master
WHERE type = 'index'
  AND tbl_name = ${tableLiteral}
ORDER BY name ASC;
EXPLAIN QUERY PLAN SELECT * FROM ${qualifiedTable} LIMIT 200;
`.trim()
}

function buildSqliteDbstatSql(table: string): string {
  const tableLiteral = quoteSqlLiteral(table)
  return `SELECT sum(pgsize) AS table_size_bytes FROM dbstat WHERE name = ${tableLiteral};`
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return null
}

function toText(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  return null
}

function pickRowValue(row: Record<string, unknown> | undefined, keys: string[]): unknown {
  if (!row) {
    return undefined
  }

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key) && row[key] !== null && row[key] !== undefined) {
      return row[key]
    }
  }

  const values = Object.values(row).filter((value) => value !== null && value !== undefined)
  return values[0]
}

function isUniqueIndex(indexName: string, sqlDefinition: string | null): boolean {
  if (sqlDefinition && /create\s+unique\s+index/i.test(sqlDefinition)) {
    return true
  }

  return indexName.toLowerCase().startsWith('sqlite_autoindex_')
}

function parseScanHints(rows: Record<string, unknown>[]): {
  summary: string
  details: string[]
} {
  const details = rows
    .map((row) => toText(row.detail) ?? '')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)

  const hasIndexUsage = details.some((detail) => /USING\s+(COVERING\s+)?INDEX/i.test(detail))
  const hasFullScan = details.some((detail) => /\bSCAN\b/i.test(detail) && !/USING\s+(COVERING\s+)?INDEX/i.test(detail))

  if (hasIndexUsage && hasFullScan) {
    return {
      summary: 'Plano misto: há uso de índice e também varredura completa em partes do plano.',
      details: details.slice(0, 4),
    }
  }

  if (hasIndexUsage) {
    return {
      summary: 'Plano sugere uso de índice para este padrão de leitura.',
      details: details.slice(0, 4),
    }
  }

  if (hasFullScan) {
    return {
      summary: 'Plano sugere varredura completa. Considere filtros compatíveis com índices.',
      details: details.slice(0, 4),
    }
  }

  return {
    summary: 'Plano sem sinal claro de scan/index para o cenário avaliado.',
    details: details.slice(0, 4),
  }
}

function parseSnapshot(resultSets: Array<{ rows?: Record<string, unknown>[] }>): SqliteSnapshot | null {
  const collectedAt = toText(resultSets[0]?.rows?.[0]?.collected_at) ?? new Date().toISOString()

  const pageCount = toNumber(pickRowValue(resultSets[1]?.rows?.[0], ['page_count']))
  const pageSize = toNumber(pickRowValue(resultSets[2]?.rows?.[0], ['page_size']))
  const freelistCount = toNumber(pickRowValue(resultSets[3]?.rows?.[0], ['freelist_count']))
  const rowCount = toNumber(resultSets[4]?.rows?.[0]?.row_count)

  if (pageCount === null || pageSize === null || freelistCount === null) {
    return null
  }

  const indexRows = resultSets[5]?.rows ?? []
  const indexes: SqliteTableDashboardIndexPoint[] = indexRows.map((row) => {
    const name = toText(row.index_name) ?? 'index'
    const sql = toText(row.sql_definition)
    return {
      name,
      sql,
      isUnique: isUniqueIndex(name, sql),
    }
  })

  const scan = parseScanHints(resultSets[6]?.rows ?? [])

  return {
    collectedAt,
    pageCount,
    pageSize,
    freelistCount,
    rowCount,
    indexes,
    scanSummary: scan.summary,
    scanDetails: scan.details,
  }
}

function formatBytes(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value < 0) {
    return '--'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let current = value
  let index = 0

  while (current >= 1024 && index < units.length - 1) {
    current /= 1024
    index += 1
  }

  const digits = current >= 100 ? 0 : current >= 10 ? 1 : 2
  return `${current.toFixed(digits)} ${units[index]}`
}

function formatMetric(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) {
    return '--'
  }

  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return '--'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return '--'
  }

  return parsed.toLocaleString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatTimeLabel(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function InfoHint({ text }: { text: string }): JSX.Element {
  return (
    <span className='group relative inline-flex'>
      <button
        type='button'
        className='inline-flex h-4 w-4 items-center justify-center rounded-full text-slate-500 transition-colors hover:text-slate-200 focus-visible:text-slate-100 focus-visible:outline-none'
        aria-label={text}
      >
        <Info className='h-3.5 w-3.5 cursor-help' />
      </button>
      <span
        role='tooltip'
        className='pointer-events-none absolute top-full left-1/2 z-40 mt-2 w-64 -translate-x-1/2 rounded-md border border-border/80 bg-card/95 px-2.5 py-2 text-[11px] leading-relaxed text-foreground normal-case tracking-normal opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100'
      >
        {text}
      </span>
    </span>
  )
}

export function SqliteTableDashboardPanel({
  activeDashboardTab,
  updateDashboardTab,
}: SqliteTableDashboardPanelProps): JSX.Element {
  const tabIdRef = useRef(activeDashboardTab.id)
  const connectionIdRef = useRef(activeDashboardTab.connectionId)
  const tableRef = useRef(activeDashboardTab.table)
  const updateDashboardTabRef = useRef(updateDashboardTab)
  const requestSeqRef = useRef(0)

  useEffect(() => {
    tabIdRef.current = activeDashboardTab.id
    connectionIdRef.current = activeDashboardTab.connectionId
    tableRef.current = activeDashboardTab.table
  }, [activeDashboardTab.id, activeDashboardTab.connectionId, activeDashboardTab.table])

  useEffect(() => {
    updateDashboardTabRef.current = updateDashboardTab
  }, [updateDashboardTab])

  const refreshDashboard = useCallback(async (manual: boolean): Promise<void> => {
    const requestSeq = ++requestSeqRef.current
    const tabId = tabIdRef.current
    const connectionId = connectionIdRef.current
    const targetTable = tableRef.current

    updateDashboardTabRef.current(tabId, (tab) => ({ ...tab, loading: true, loadError: null }))

    try {
      const result = await pointerApi.executeSql(connectionId, buildSqliteDashboardSql(targetTable.schema, targetTable.name))
      const snapshot = parseSnapshot(result.resultSets)
      if (!snapshot) {
        throw new Error('Não foi possível interpretar as métricas da tabela no SQLite.')
      }

      let tableSizeBytes: number | null = null
      let tableSizeWarning: string | null = null

      try {
        const dbstatResult = await pointerApi.executeSql(connectionId, buildSqliteDbstatSql(targetTable.name))
        tableSizeBytes = toNumber(dbstatResult.resultSets[0]?.rows?.[0]?.table_size_bytes)
      } catch (dbstatError) {
        tableSizeWarning = getErrorMessage(dbstatError)
      }

      if (requestSeq !== requestSeqRef.current || tabId !== tabIdRef.current) {
        return
      }

      const databaseSizeBytes = snapshot.pageCount * snapshot.pageSize
      const freelistBytes = snapshot.freelistCount * snapshot.pageSize

      updateDashboardTabRef.current(tabId, (tab) => {
        const currentTab = tab as SqliteTableDashboardTab
        const metrics: SqliteTableDashboardMetrics = {
          collectedAt: snapshot.collectedAt,
          databaseSizeBytes,
          freelistBytes,
          tableSizeBytes,
          tableSizeWarning,
          indexCount: snapshot.indexes.length,
          rowCount: snapshot.rowCount,
          pageCount: snapshot.pageCount,
          pageSize: snapshot.pageSize,
          freelistCount: snapshot.freelistCount,
          scanSummary: snapshot.scanSummary,
          scanDetails: snapshot.scanDetails,
        }
        const historyPoint: SqliteTableDashboardSeriesPoint = {
          timeLabel: formatTimeLabel(snapshot.collectedAt),
          tableSizeBytes,
          rowCount: snapshot.rowCount,
        }

        return {
          ...currentTab,
          loading: false,
          loadError: null,
          lastUpdatedAt: snapshot.collectedAt,
          metrics,
          indexes: snapshot.indexes,
          history: [...currentTab.history, historyPoint].slice(-DASHBOARD_HISTORY_LIMIT),
          lastCounters: null,
        }
      })
    } catch (error) {
      if (requestSeq !== requestSeqRef.current || tabId !== tabIdRef.current) {
        return
      }

      const message = getErrorMessage(error)
      updateDashboardTabRef.current(tabId, (tab) => ({ ...tab, loading: false, loadError: message }))
      if (manual) {
        toast.error(message)
      }
    }
  }, [])

  useEffect(() => {
    void refreshDashboard(false)
  }, [activeDashboardTab.id, activeDashboardTab.connectionId, activeDashboardTab.table, refreshDashboard])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshDashboard(false)
    }, DASHBOARD_REFRESH_INTERVAL_MS)

    return () => window.clearInterval(intervalId)
  }, [activeDashboardTab.id, activeDashboardTab.connectionId, activeDashboardTab.table, refreshDashboard])

  const metrics = activeDashboardTab.metrics
  const isInitialLoading = activeDashboardTab.loading && !metrics

  return (
    <div className='pointer-card flex h-full flex-col overflow-hidden'>
      <div className='flex items-center justify-between border-b border-slate-800/70 px-3 py-2.5'>
        <div>
          <h2 className='text-sm font-semibold'>Dashboard {formatTableLabel(activeDashboardTab.table)}</h2>
          <p className='text-[12px] text-slate-400'>
            {activeDashboardTab.connectionName} • Atualização automática a cada 30s • Última atualização:{' '}
            {formatTimestamp(activeDashboardTab.lastUpdatedAt)}
          </p>
        </div>
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='h-8 text-[13px]'
          onClick={() => void refreshDashboard(true)}
          disabled={activeDashboardTab.loading}
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${activeDashboardTab.loading ? 'animate-spin' : ''}`} />
          Atualizar agora
        </Button>
      </div>

      <div className='min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3'>
        {activeDashboardTab.loadError && (
          <div className='mb-3 rounded-lg border border-rose-800/70 bg-rose-950/35 px-3 py-2 text-[12px] text-rose-200'>
            {activeDashboardTab.loadError}
          </div>
        )}

        {isInitialLoading ? (
          <div className='pointer-card-soft flex h-[220px] items-center justify-center text-slate-400'>
            Carregando métricas da tabela no SQLite...
          </div>
        ) : (
          <div className='space-y-3'>
            <div className='grid gap-2 md:grid-cols-2 xl:grid-cols-6'>
              <div className='pointer-card-soft p-3'>
                <div className='mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-slate-500'>
                  <HardDrive className='h-3.5 w-3.5' />
                  Tamanho do DB
                </div>
                <div className='text-xl font-semibold text-slate-100'>{formatBytes(metrics?.databaseSizeBytes ?? null)}</div>
                <div className='text-[11px] text-slate-500'>page_count × page_size</div>
              </div>

              <div className='pointer-card-soft p-3'>
                <div className='mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-slate-500'>
                  <Database className='h-3.5 w-3.5' />
                  Tamanho da tabela
                </div>
                <div className='text-xl font-semibold text-slate-100'>{formatBytes(metrics?.tableSizeBytes ?? null)}</div>
                <div className='text-[11px] text-slate-500'>Estimativa por dbstat</div>
              </div>

              <div className='pointer-card-soft p-3'>
                <div className='mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-slate-500'>
                  <Database className='h-3.5 w-3.5' />
                  Linhas
                </div>
                <div className='text-xl font-semibold text-slate-100'>{formatMetric(metrics?.rowCount ?? null, 0)}</div>
                <div className='text-[11px] text-slate-500'>COUNT(*) da tabela</div>
              </div>

              <div className='pointer-card-soft p-3'>
                <div className='mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-slate-500'>
                  <Gauge className='h-3.5 w-3.5' />
                  Índices
                </div>
                <div className='text-xl font-semibold text-slate-100'>{formatMetric(metrics?.indexCount ?? null, 0)}</div>
                <div className='text-[11px] text-slate-500'>Objetos de índice encontrados</div>
              </div>

              <div className='pointer-card-soft p-3'>
                <div className='mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-slate-500'>
                  <HardDrive className='h-3.5 w-3.5' />
                  Freelist
                </div>
                <div className='text-xl font-semibold text-slate-100'>{formatBytes(metrics?.freelistBytes ?? null)}</div>
                <div className='text-[11px] text-slate-500'>Páginas livres no arquivo</div>
              </div>

              <div className='pointer-card-soft p-3'>
                <div className='mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-slate-500'>
                  <Search className='h-3.5 w-3.5' />
                  Scan hint
                  <InfoHint text='Diagnóstico por EXPLAIN QUERY PLAN. Não é contador real de scan da última hora.' />
                </div>
                <div className='text-sm font-medium text-slate-200'>{metrics?.scanSummary ?? '--'}</div>
              </div>
            </div>

            {metrics?.tableSizeWarning && (
              <div className='rounded-lg border border-amber-800/70 bg-amber-950/35 px-3 py-2 text-[12px] text-amber-200'>
                Tamanho por tabela indisponível (dbstat): {metrics.tableSizeWarning}
              </div>
            )}

            <div className='grid gap-3 xl:grid-cols-2'>
              <div className='pointer-card-soft p-3'>
                <div className='mb-2 flex items-center gap-1.5 text-[12px] font-medium text-slate-300'>
                  Tendência local (1h)
                  <InfoHint text='Evolução nas últimas coletas do dashboard para rows e tamanho estimado da tabela.' />
                </div>
                {activeDashboardTab.history.length > 0 ? (
                  <ChartContainer config={sqliteTrendChartConfig} className='h-[220px] w-full'>
                    <LineChart data={activeDashboardTab.history} accessibilityLayer={false} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey='timeLabel' tickLine={false} axisLine={false} minTickGap={18} />
                      <YAxis tickLine={false} axisLine={false} width={46} />
                      <ChartTooltip
                        cursor={false}
                        content={<ChartTooltipContent formatter={(value) => formatMetric(typeof value === 'number' ? value : Number(value), 0)} />}
                      />
                      <Line type='monotone' dataKey='rowCount' stroke='var(--color-rowCount)' strokeWidth={2} dot={false} />
                      <Line type='monotone' dataKey='tableSizeBytes' stroke='var(--color-tableSizeBytes)' strokeWidth={2} dot={false} />
                    </LineChart>
                  </ChartContainer>
                ) : (
                  <div className='flex h-[220px] items-center justify-center text-slate-500'>Sem amostras ainda.</div>
                )}
              </div>

              <div className='pointer-card-soft p-3'>
                <div className='mb-2 flex items-center gap-1.5 text-[12px] font-medium text-slate-300'>
                  Diagnóstico de scan
                </div>
                <div className='rounded-md border border-slate-800/80 bg-slate-950/45 px-3 py-2 text-[12px] text-slate-300'>
                  {metrics?.scanSummary ?? '--'}
                </div>
                <div className='mt-2 grid gap-1 text-[11px] text-slate-400'>
                  {(metrics?.scanDetails ?? []).map((detail) => (
                    <p key={detail}>• {detail}</p>
                  ))}
                </div>
              </div>
            </div>

            <div className='pointer-card-soft p-3'>
              <div className='mb-2 flex items-center gap-1.5 text-[12px] font-medium text-slate-300'>
                Índices da tabela
              </div>
              {activeDashboardTab.indexes.length === 0 ? (
                <div className='rounded-md border border-slate-800/80 bg-slate-950/45 px-3 py-2 text-[12px] text-slate-500'>
                  Nenhum índice encontrado para esta tabela.
                </div>
              ) : (
                <div className='overflow-x-auto'>
                  <table className='min-w-full text-[12px]'>
                    <thead>
                      <tr className='text-left text-slate-500'>
                        <th className='px-2 py-1 font-medium'>Índice</th>
                        <th className='px-2 py-1 font-medium'>Unique</th>
                        <th className='px-2 py-1 font-medium'>Definição</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeDashboardTab.indexes.map((index) => (
                        <tr key={index.name} className='border-t border-slate-800/70 text-slate-300'>
                          <td className='px-2 py-1.5 font-medium text-slate-200'>{index.name}</td>
                          <td className='px-2 py-1.5'>{index.isUnique ? 'Sim' : 'Não'}</td>
                          <td className='max-w-[620px] truncate px-2 py-1.5 text-slate-400' title={index.sql ?? '--'}>
                            {index.sql ?? '--'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
