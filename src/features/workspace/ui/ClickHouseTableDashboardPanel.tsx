import { useCallback, useEffect, useMemo, useRef } from 'react'
import { BarChart3, Database, Gauge, Info, RefreshCw, Server } from 'lucide-react'
import { toast } from 'sonner'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { Button } from '../../../components/ui/button'
import { ChartContainer, type ChartConfig, ChartTooltip, ChartTooltipContent } from '../../../components/ui/chart'
import type {
  ClickHouseTableDashboardIndexPoint,
  ClickHouseTableDashboardMetrics,
  ClickHouseTableDashboardSeriesPoint,
  ClickHouseTableDashboardTab,
  DashboardTab,
} from '../../../entities/workspace/types'
import { pointerApi } from '../../../shared/api/pointer-api'
import { formatTableLabel, getErrorMessage } from '../../../shared/lib/workspace-utils'

const DASHBOARD_REFRESH_INTERVAL_MS = 30_000
const DASHBOARD_HISTORY_LIMIT = 120

type ClickHouseCoreSnapshot = {
  collectedAt: string
  tableEngine: string
  totalRows: number
  totalBytes: number
  compressedBytes: number
  uncompressedBytes: number
  activeParts: number
  activeBytes: number
  primaryKey: string
  sortingKey: string
  partitionKey: string
}

type ClickHouseTableDashboardPanelProps = {
  activeDashboardTab: ClickHouseTableDashboardTab
  updateDashboardTab: (tabId: string, updater: (tab: DashboardTab) => DashboardTab) => void
}

const scanTrendChartConfig = {
  queries: {
    label: 'Queries',
    color: '#38bdf8',
  },
  readRows: {
    label: 'Read rows',
    color: '#f59e0b',
  },
} satisfies ChartConfig

function quoteSqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function buildCoreSql(schema: string, table: string): string {
  const schemaLiteral = quoteSqlLiteral(schema)
  const tableLiteral = quoteSqlLiteral(table)

  return `
SELECT
  now() AS collected_at,
  toString(engine) AS table_engine,
  toInt64(total_rows) AS total_rows,
  toInt64(total_bytes) AS total_bytes,
  toString(primary_key) AS primary_key,
  toString(sorting_key) AS sorting_key,
  toString(partition_key) AS partition_key
FROM system.tables
WHERE database = ${schemaLiteral}
  AND name = ${tableLiteral}
LIMIT 1;

SELECT
  countIf(active) AS active_parts,
  ifNull(sumIf(bytes_on_disk, active), 0) AS active_bytes,
  ifNull(sumIf(data_compressed_bytes, active), 0) AS active_compressed_bytes,
  ifNull(sumIf(data_uncompressed_bytes, active), 0) AS active_uncompressed_bytes
FROM system.parts
WHERE database = ${schemaLiteral}
  AND table = ${tableLiteral};
`.trim()
}

function buildIndexSql(schema: string, table: string): string {
  const schemaLiteral = quoteSqlLiteral(schema)
  const tableLiteral = quoteSqlLiteral(table)

  return `
SELECT
  name AS index_name,
  type AS index_type,
  expr AS index_expression,
  toString(granularity) AS granularity
FROM system.data_skipping_indices
WHERE database = ${schemaLiteral}
  AND table = ${tableLiteral}
ORDER BY index_name ASC;
`.trim()
}

function buildScanSql(schema: string, table: string): string {
  const schemaLiteral = quoteSqlLiteral(schema)
  const tableLiteral = quoteSqlLiteral(table)

  return `
SELECT
  toStartOfFiveMinute(event_time) AS minute,
  countIf(query_kind = 'Select') AS queries,
  ifNull(sumIf(read_rows, query_kind = 'Select'), 0) AS read_rows,
  ifNull(sumIf(read_bytes, query_kind = 'Select'), 0) AS read_bytes
FROM system.query_log
WHERE event_time >= now() - INTERVAL 1 HOUR
  AND type = 'QueryFinish'
  AND has(databases, ${schemaLiteral})
  AND has(tables, ${tableLiteral})
GROUP BY minute
ORDER BY minute ASC;
`.trim()
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

function parseCoreSnapshot(resultSets: Array<{ rows?: Record<string, unknown>[] }>): ClickHouseCoreSnapshot | null {
  const overview = resultSets[0]?.rows?.[0]
  const parts = resultSets[1]?.rows?.[0]

  if (!overview || !parts) {
    return null
  }

  const collectedAt = toText(overview.collected_at) ?? new Date().toISOString()
  const tableEngine = toText(overview.table_engine) ?? '--'
  const totalRows = toNumber(overview.total_rows)
  const totalBytes = toNumber(overview.total_bytes)
  const compressedBytes = toNumber(parts.active_compressed_bytes)
  const uncompressedBytes = toNumber(parts.active_uncompressed_bytes)
  const activeParts = toNumber(parts.active_parts)
  const activeBytes = toNumber(parts.active_bytes)

  if (
    totalRows === null ||
    totalBytes === null ||
    compressedBytes === null ||
    uncompressedBytes === null ||
    activeParts === null ||
    activeBytes === null
  ) {
    return null
  }

  return {
    collectedAt,
    tableEngine,
    totalRows,
    totalBytes,
    compressedBytes,
    uncompressedBytes,
    activeParts,
    activeBytes,
    primaryKey: toText(overview.primary_key) ?? '--',
    sortingKey: toText(overview.sorting_key) ?? '--',
    partitionKey: toText(overview.partition_key) ?? '--',
  }
}

function parseIndexRows(rows: Record<string, unknown>[]): ClickHouseTableDashboardIndexPoint[] {
  return rows
    .map((row) => ({
      name: toText(row.index_name) ?? 'index',
      type: toText(row.index_type) ?? '--',
      expression: toText(row.index_expression) ?? '--',
      granularity: toText(row.granularity) ?? '--',
      kind: 'skipping' as const,
    }))
    .sort((left, right) => left.name.localeCompare(right.name))
}

function parseScanRows(rows: Record<string, unknown>[]): ClickHouseTableDashboardSeriesPoint[] {
  return rows
    .map((row) => ({
      timeLabel: toText(row.minute) ?? new Date().toISOString(),
      queries: toNumber(row.queries) ?? 0,
      readRows: toNumber(row.read_rows) ?? 0,
      readBytes: toNumber(row.read_bytes) ?? 0,
    }))
    .sort((left, right) => left.timeLabel.localeCompare(right.timeLabel))
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

function compactSqlExpression(value: string): string {
  const normalized = value.trim()
  if (!normalized || normalized === 'tuple()') {
    return '--'
  }

  return normalized
}

function buildKeyIndexes(snapshot: ClickHouseCoreSnapshot): ClickHouseTableDashboardIndexPoint[] {
  const keyIndexes: ClickHouseTableDashboardIndexPoint[] = []

  if (compactSqlExpression(snapshot.primaryKey) !== '--') {
    keyIndexes.push({
      name: 'PRIMARY KEY',
      type: 'PRIMARY',
      expression: snapshot.primaryKey,
      granularity: '--',
      kind: 'key',
    })
  }

  if (compactSqlExpression(snapshot.sortingKey) !== '--') {
    keyIndexes.push({
      name: 'SORTING KEY',
      type: 'SORTING',
      expression: snapshot.sortingKey,
      granularity: '--',
      kind: 'key',
    })
  }

  if (compactSqlExpression(snapshot.partitionKey) !== '--') {
    keyIndexes.push({
      name: 'PARTITION KEY',
      type: 'PARTITION',
      expression: snapshot.partitionKey,
      granularity: '--',
      kind: 'key',
    })
  }

  return keyIndexes
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

export function ClickHouseTableDashboardPanel({
  activeDashboardTab,
  updateDashboardTab,
}: ClickHouseTableDashboardPanelProps): JSX.Element {
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
      const coreResult = await pointerApi.executeSql(connectionId, buildCoreSql(targetTable.schema, targetTable.name))
      const snapshot = parseCoreSnapshot(coreResult.resultSets)
      if (!snapshot) {
        throw new Error('Não foi possível carregar as métricas base da tabela no ClickHouse.')
      }

      let indexWarning: string | null = null
      let scanWarning: string | null = null
      let skippingIndexes: ClickHouseTableDashboardIndexPoint[] = []
      let trend: ClickHouseTableDashboardSeriesPoint[] = []

      try {
        const indexResult = await pointerApi.executeSql(connectionId, buildIndexSql(targetTable.schema, targetTable.name))
        skippingIndexes = parseIndexRows(indexResult.resultSets[0]?.rows ?? [])
      } catch (indexError) {
        indexWarning = getErrorMessage(indexError)
      }

      try {
        const scanResult = await pointerApi.executeSql(connectionId, buildScanSql(targetTable.schema, targetTable.name))
        trend = parseScanRows(scanResult.resultSets[0]?.rows ?? [])
      } catch (scanError) {
        scanWarning = getErrorMessage(scanError)
      }

      if (requestSeq !== requestSeqRef.current || tabId !== tabIdRef.current) {
        return
      }

      const keyIndexes = buildKeyIndexes(snapshot)
      const indexes = [...keyIndexes, ...skippingIndexes]
      const readQueries1h = trend.reduce((sum, point) => sum + point.queries, 0)
      const readRows1h = trend.reduce((sum, point) => sum + point.readRows, 0)
      const readBytes1h = trend.reduce((sum, point) => sum + point.readBytes, 0)

      updateDashboardTabRef.current(tabId, (tab) => {
        const currentTab = tab as ClickHouseTableDashboardTab
        const metrics: ClickHouseTableDashboardMetrics = {
          collectedAt: snapshot.collectedAt,
          tableEngine: snapshot.tableEngine,
          totalRows: snapshot.totalRows,
          totalBytes: snapshot.totalBytes,
          compressedBytes: snapshot.compressedBytes,
          uncompressedBytes: snapshot.uncompressedBytes,
          activeParts: snapshot.activeParts,
          activeBytes: snapshot.activeBytes,
          primaryKey: snapshot.primaryKey,
          sortingKey: snapshot.sortingKey,
          partitionKey: snapshot.partitionKey,
          readQueries1h: scanWarning ? null : readQueries1h,
          readRows1h: scanWarning ? null : readRows1h,
          readBytes1h: scanWarning ? null : readBytes1h,
          indexWarning,
          scanWarning,
        }

        return {
          ...currentTab,
          loading: false,
          loadError: null,
          lastUpdatedAt: snapshot.collectedAt,
          metrics,
          indexes,
          history: scanWarning ? currentTab.history : trend.slice(-DASHBOARD_HISTORY_LIMIT),
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

  const compressionRatio = useMemo(() => {
    if (!metrics || metrics.uncompressedBytes <= 0) {
      return null
    }

    return (metrics.compressedBytes / metrics.uncompressedBytes) * 100
  }, [metrics])

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
            Carregando métricas da tabela no ClickHouse...
          </div>
        ) : (
          <div className='space-y-3'>
            <div className='grid gap-2 md:grid-cols-2 xl:grid-cols-6'>
              <div className='pointer-card-soft p-3'>
                <div className='mb-0.5 flex min-w-0 items-center gap-1.5 text-[11px] leading-tight uppercase tracking-[0.14em] text-slate-500'>
                  <Database className='h-3.5 w-3.5' />
                  <span className='min-w-0 truncate' title='Armazenamento'>
                    Armazenamento
                  </span>
                </div>
                <div className='text-xl font-semibold text-slate-100'>{formatBytes(metrics?.totalBytes ?? null)}</div>
                <div className='text-[11px] text-slate-500'>Tabela ativa em disco</div>
              </div>

              <div className='pointer-card-soft p-3'>
                <div className='mb-0.5 flex min-w-0 items-center gap-1.5 text-[11px] leading-tight uppercase tracking-[0.14em] text-slate-500'>
                  <Database className='h-3.5 w-3.5' />
                  <span className='min-w-0 truncate' title='Linhas'>
                    Linhas
                  </span>
                </div>
                <div className='text-xl font-semibold text-slate-100'>{formatMetric(metrics?.totalRows ?? null, 0)}</div>
                <div className='text-[11px] text-slate-500'>Estimativa do sistema</div>
              </div>

              <div className='pointer-card-soft p-3'>
                <div className='mb-0.5 flex min-w-0 items-center gap-1.5 text-[11px] leading-tight uppercase tracking-[0.14em] text-slate-500'>
                  <Server className='h-3.5 w-3.5' />
                  <span className='min-w-0 truncate' title='Engine'>
                    Engine
                  </span>
                </div>
                <div className='truncate text-xl font-semibold text-slate-100' title={metrics?.tableEngine ?? '--'}>
                  {metrics?.tableEngine ?? '--'}
                </div>
                <div className='text-[11px] text-slate-500'>Partes ativas: {formatMetric(metrics?.activeParts ?? null, 0)}</div>
              </div>

              <div className='pointer-card-soft p-3'>
                <div className='mb-0.5 flex min-w-0 items-center gap-1.5 text-[11px] leading-tight uppercase tracking-[0.14em] text-slate-500'>
                  <Gauge className='h-3.5 w-3.5' />
                  <span className='min-w-0 truncate' title='Compressão'>
                    Compressão
                  </span>
                </div>
                <div className='text-xl font-semibold text-slate-100'>
                  {compressionRatio !== null ? `${formatMetric(compressionRatio, 1)}%` : '--'}
                </div>
                <div className='text-[11px] text-slate-500'>Dados comprimidos / bruto</div>
              </div>

              <div className='pointer-card-soft p-3'>
                <div className='mb-0.5 flex min-w-0 items-center gap-1.5 text-[11px] leading-tight uppercase tracking-[0.14em] text-slate-500'>
                  <BarChart3 className='h-3.5 w-3.5' />
                  <span className='min-w-0 flex-1 truncate' title='Scan 1h'>
                    Scan 1h
                  </span>
                  <InfoHint text='Total de queries de leitura e volume lido na última hora (system.query_log).' />
                </div>
                <div className='text-xl font-semibold text-slate-100'>{formatMetric(metrics?.readQueries1h ?? null, 0)}</div>
                <div className='text-[11px] text-slate-500'>Read rows: {formatMetric(metrics?.readRows1h ?? null, 0)}</div>
              </div>

              <div className='pointer-card-soft p-3'>
                <div className='mb-0.5 flex min-w-0 items-center gap-1.5 text-[11px] leading-tight uppercase tracking-[0.14em] text-slate-500'>
                  <Gauge className='h-3.5 w-3.5' />
                  <span className='min-w-0 truncate' title='Read bytes 1h'>
                    Read bytes 1h
                  </span>
                </div>
                <div className='text-xl font-semibold text-slate-100'>{formatBytes(metrics?.readBytes1h ?? null)}</div>
                <div className='text-[11px] text-slate-500'>Ativo: {formatBytes(metrics?.activeBytes ?? null)}</div>
              </div>
            </div>

            {metrics?.scanWarning && (
              <div className='rounded-lg border border-amber-800/70 bg-amber-950/35 px-3 py-2 text-[12px] text-amber-200'>
                Métricas de scan não disponíveis no momento: {metrics.scanWarning}
              </div>
            )}

            {metrics?.indexWarning && (
              <div className='rounded-lg border border-amber-800/70 bg-amber-950/35 px-3 py-2 text-[12px] text-amber-200'>
                Não foi possível carregar data skipping indices: {metrics.indexWarning}
              </div>
            )}

            <div className='grid gap-3 xl:grid-cols-2'>
              <div className='pointer-card-soft p-3'>
                <div className='mb-2 flex items-center gap-1.5 text-[12px] font-medium text-slate-300'>
                  Tendência de scan (1h)
                </div>
                {activeDashboardTab.history.length > 0 ? (
                  <ChartContainer config={scanTrendChartConfig} className='h-[220px] w-full'>
                    <LineChart data={activeDashboardTab.history} accessibilityLayer={false} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey='timeLabel'
                        tickLine={false}
                        axisLine={false}
                        minTickGap={18}
                        tickFormatter={(value) => formatTimeLabel(String(value ?? ''))}
                      />
                      <YAxis tickLine={false} axisLine={false} width={46} />
                      <ChartTooltip
                        cursor={false}
                        content={<ChartTooltipContent formatter={(value) => formatMetric(typeof value === 'number' ? value : Number(value), 0)} />}
                      />
                      <Line type='monotone' dataKey='queries' stroke='var(--color-queries)' strokeWidth={2} dot={false} />
                      <Line type='monotone' dataKey='readRows' stroke='var(--color-readRows)' strokeWidth={2} dot={false} />
                    </LineChart>
                  </ChartContainer>
                ) : (
                  <div className='flex h-[220px] items-center justify-center text-slate-500'>Sem amostras de scan.</div>
                )}
              </div>

              <div className='pointer-card-soft p-3'>
                <div className='mb-2 flex items-center gap-1.5 text-[12px] font-medium text-slate-300'>
                  Chaves da tabela
                </div>
                <div className='grid gap-2 text-[11px] text-slate-400'>
                  <div className='rounded-md border border-slate-800/80 bg-slate-950/45 px-2 py-1.5'>
                    <p className='uppercase tracking-[0.12em] text-slate-500'>Primary key</p>
                    <p className='mt-0.5 text-slate-200 break-all'>{compactSqlExpression(metrics?.primaryKey ?? '--')}</p>
                  </div>
                  <div className='rounded-md border border-slate-800/80 bg-slate-950/45 px-2 py-1.5'>
                    <p className='uppercase tracking-[0.12em] text-slate-500'>Sorting key</p>
                    <p className='mt-0.5 text-slate-200 break-all'>{compactSqlExpression(metrics?.sortingKey ?? '--')}</p>
                  </div>
                  <div className='rounded-md border border-slate-800/80 bg-slate-950/45 px-2 py-1.5'>
                    <p className='uppercase tracking-[0.12em] text-slate-500'>Partition key</p>
                    <p className='mt-0.5 text-slate-200 break-all'>{compactSqlExpression(metrics?.partitionKey ?? '--')}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className='pointer-card-soft p-3'>
              <div className='mb-2 flex items-center gap-1.5 text-[12px] font-medium text-slate-300'>
                Índices e chaves
                <InfoHint text='Inclui data skipping indices e chaves de ordenação/partição para leitura operacional.' />
              </div>
              {activeDashboardTab.indexes.length === 0 ? (
                <div className='rounded-md border border-slate-800/80 bg-slate-950/45 px-3 py-2 text-[12px] text-slate-500'>
                  Nenhum índice/chave disponível para exibição.
                </div>
              ) : (
                <div className='overflow-x-auto'>
                  <table className='min-w-full text-[12px]'>
                    <thead>
                      <tr className='text-left text-slate-500'>
                        <th className='px-2 py-1 font-medium'>Nome</th>
                        <th className='px-2 py-1 font-medium'>Categoria</th>
                        <th className='px-2 py-1 font-medium'>Tipo</th>
                        <th className='px-2 py-1 font-medium'>Granularidade</th>
                        <th className='px-2 py-1 font-medium'>Expressão</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeDashboardTab.indexes.map((index) => (
                        <tr key={`${index.kind}:${index.name}:${index.expression}`} className='border-t border-slate-800/70 text-slate-300'>
                          <td className='px-2 py-1.5 font-medium text-slate-200'>{index.name}</td>
                          <td className='px-2 py-1.5'>{index.kind === 'key' ? 'Chave' : 'Skipping index'}</td>
                          <td className='px-2 py-1.5'>{index.type}</td>
                          <td className='px-2 py-1.5'>{index.granularity}</td>
                          <td className='max-w-[520px] truncate px-2 py-1.5 text-slate-400' title={index.expression}>
                            {index.expression}
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
