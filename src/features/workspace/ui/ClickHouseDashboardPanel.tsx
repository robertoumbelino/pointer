import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Activity, AlertTriangle, BarChart3, Database, Gauge, Info, RefreshCw, Server } from 'lucide-react'
import { toast } from 'sonner'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { Button } from '../../../components/ui/button'
import { ChartContainer, type ChartConfig, ChartTooltip, ChartTooltipContent } from '../../../components/ui/chart'
import type { ClickHouseDashboardTab, DashboardTab } from '../../../entities/workspace/types'
import { pointerApi } from '../../../shared/api/pointer-api'
import { getErrorMessage } from '../../../shared/lib/workspace-utils'

const DASHBOARD_REFRESH_INTERVAL_MS = 30_000
const DASHBOARD_HISTORY_LIMIT = 24

const CLICKHOUSE_DASHBOARD_SQL = `
WITH
  processes AS (
    SELECT
      count() AS running_queries,
      ifNull(sum(memory_usage), 0) AS running_query_memory_bytes,
      countIf(match(query, '(?i)^\\\\s*insert\\\\b')) AS insert_queries,
      countIf(match(query, '(?i)^\\\\s*select\\\\b')) AS select_queries,
      countIf(match(query, '(?i)^\\\\s*(with|explain)\\\\b')) AS analytical_queries,
      countIf(match(query, '(?i)^\\\\s*(create|alter|drop|truncate|rename)\\\\b')) AS ddl_queries
    FROM system.processes
  ),
  parts AS (
    SELECT
      countIf(active) AS active_parts,
      ifNull(sumIf(rows, active), 0) AS total_rows,
      ifNull(sumIf(bytes_on_disk, active), 0) AS bytes_on_disk
    FROM system.parts
    WHERE database NOT IN ('system', 'information_schema', 'INFORMATION_SCHEMA')
  ),
  log_window AS (
    SELECT
      countIf(type = 'QueryFinish') AS query_count_15m,
      countIf(type IN ('ExceptionBeforeStart', 'ExceptionWhileProcessing')) AS failed_queries_15m,
      quantileIf(0.95)(query_duration_ms, type = 'QueryFinish') AS p95_query_duration_ms
    FROM system.query_log
    WHERE event_time >= now() - INTERVAL 15 MINUTE
      AND type IN ('QueryFinish', 'ExceptionBeforeStart', 'ExceptionWhileProcessing')
  ),
  kind_window AS (
    SELECT
      countIf(query_kind = 'Select') AS select_queries_15m,
      countIf(query_kind = 'Insert') AS insert_queries_15m,
      countIf(query_kind NOT IN ('Select', 'Insert')) AS other_queries_15m
    FROM system.query_log
    WHERE type = 'QueryFinish'
      AND event_time >= now() - INTERVAL 15 MINUTE
  )
SELECT
  now() AS collected_at,
  processes.running_queries,
  processes.running_query_memory_bytes,
  processes.insert_queries,
  processes.select_queries,
  processes.analytical_queries,
  processes.ddl_queries,
  parts.active_parts,
  parts.total_rows,
  parts.bytes_on_disk,
  log_window.query_count_15m,
  log_window.failed_queries_15m,
  log_window.p95_query_duration_ms,
  kind_window.select_queries_15m,
  kind_window.insert_queries_15m,
  kind_window.other_queries_15m
FROM processes, parts, log_window, kind_window;

SELECT
  toStartOfMinute(event_time) AS minute,
  countIf(type = 'QueryFinish') AS queries,
  countIf(type IN ('ExceptionBeforeStart', 'ExceptionWhileProcessing')) AS failures
FROM system.query_log
WHERE event_time >= now() - INTERVAL 60 MINUTE
  AND type IN ('QueryFinish', 'ExceptionBeforeStart', 'ExceptionWhileProcessing')
GROUP BY minute
ORDER BY minute ASC;

SELECT
  query_kind,
  count() AS count
FROM (
  SELECT
    multiIf(
      match(query, '(?i)^\\\\s*insert\\\\b'), 'insert',
      match(query, '(?i)^\\\\s*select\\\\b'), 'select',
      match(query, '(?i)^\\\\s*(with|explain)\\\\b'), 'analysis',
      match(query, '(?i)^\\\\s*(create|alter|drop|truncate|rename)\\\\b'), 'ddl',
      'other'
    ) AS query_kind
  FROM system.processes
)
GROUP BY query_kind
ORDER BY count DESC, query_kind ASC;
`.trim()

type ClickHouseDashboardSnapshot = {
  collectedAt: string
  runningQueries: number
  runningQueryMemoryBytes: number
  insertQueries: number
  selectQueries: number
  analyticalQueries: number
  ddlQueries: number
  activeParts: number
  totalRows: number
  bytesOnDisk: number
  queryCount15m: number
  failedQueries15m: number
  p95QueryDurationMs: number | null
  selectQueries15m: number
  insertQueries15m: number
  otherQueries15m: number
}

type ClickHouseDashboardSeriesPoint = {
  timeLabel: string
  queries: number
  failures: number
  healthScore: number
}

type ClickHouseQueryKindPoint = {
  kind: string
  count: number
}

type ClickHouseDashboardPanelProps = {
  activeDashboardTab: ClickHouseDashboardTab
  updateDashboardTab: (tabId: string, updater: (tab: DashboardTab) => DashboardTab) => void
}

type HealthSignal = {
  score: number
  status: 'healthy' | 'warning' | 'critical'
  reasons: string[]
}

const trendChartConfig = {
  queries: {
    label: 'Queries',
    color: '#38bdf8',
  },
  failures: {
    label: 'Falhas',
    color: '#fb7185',
  },
} satisfies ChartConfig

const healthChartConfig = {
  healthScore: {
    label: 'Health score',
    color: '#22d3ee',
  },
} satisfies ChartConfig

const queryKindChartConfig = {
  count: {
    label: 'Queries',
    color: '#a78bfa',
  },
} satisfies ChartConfig

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

function parseSnapshotRow(row: Record<string, unknown> | undefined): ClickHouseDashboardSnapshot | null {
  if (!row) {
    return null
  }

  const collectedAtRaw = row.collected_at
  const collectedAt =
    typeof collectedAtRaw === 'string' && collectedAtRaw.trim() ? collectedAtRaw : new Date().toISOString()

  const runningQueries = toNumber(row.running_queries)
  const runningQueryMemoryBytes = toNumber(row.running_query_memory_bytes)
  const insertQueries = toNumber(row.insert_queries)
  const selectQueries = toNumber(row.select_queries)
  const analyticalQueries = toNumber(row.analytical_queries)
  const ddlQueries = toNumber(row.ddl_queries)
  const activeParts = toNumber(row.active_parts)
  const totalRows = toNumber(row.total_rows)
  const bytesOnDisk = toNumber(row.bytes_on_disk)
  const queryCount15m = toNumber(row.query_count_15m)
  const failedQueries15m = toNumber(row.failed_queries_15m)
  const p95QueryDurationMs = toNumber(row.p95_query_duration_ms)
  const selectQueries15m = toNumber(row.select_queries_15m)
  const insertQueries15m = toNumber(row.insert_queries_15m)
  const otherQueries15m = toNumber(row.other_queries_15m)

  if (
    runningQueries === null ||
    runningQueryMemoryBytes === null ||
    insertQueries === null ||
    selectQueries === null ||
    analyticalQueries === null ||
    ddlQueries === null ||
    activeParts === null ||
    totalRows === null ||
    bytesOnDisk === null ||
    queryCount15m === null ||
    failedQueries15m === null ||
    selectQueries15m === null ||
    insertQueries15m === null ||
    otherQueries15m === null
  ) {
    return null
  }

  return {
    collectedAt,
    runningQueries,
    runningQueryMemoryBytes,
    insertQueries,
    selectQueries,
    analyticalQueries,
    ddlQueries,
    activeParts,
    totalRows,
    bytesOnDisk,
    queryCount15m,
    failedQueries15m,
    p95QueryDurationMs,
    selectQueries15m,
    insertQueries15m,
    otherQueries15m,
  }
}

function parseTrendRows(rows: Record<string, unknown>[]): ClickHouseDashboardSeriesPoint[] {
  return rows
    .map((row) => {
      const minuteRaw = row.minute
      const minute =
        typeof minuteRaw === 'string' && minuteRaw.trim()
          ? minuteRaw
          : minuteRaw instanceof Date
            ? minuteRaw.toISOString()
            : new Date().toISOString()

      return {
        timeLabel: minute,
        queries: toNumber(row.queries) ?? 0,
        failures: toNumber(row.failures) ?? 0,
        healthScore: 0,
      }
    })
    .sort((left, right) => left.timeLabel.localeCompare(right.timeLabel))
}

function formatQueryKindLabel(kind: string): string {
  if (kind === 'insert') {
    return 'Insert'
  }

  if (kind === 'select') {
    return 'Select'
  }

  if (kind === 'analysis') {
    return 'Análise'
  }

  if (kind === 'ddl') {
    return 'DDL'
  }

  return 'Outros'
}

function parseQueryKinds(rows: Record<string, unknown>[]): ClickHouseQueryKindPoint[] {
  return rows
    .map((row) => {
      const kindRaw = row.query_kind
      const kind = formatQueryKindLabel(typeof kindRaw === 'string' && kindRaw.trim() ? kindRaw : 'other')
      return {
        kind,
        count: toNumber(row.count) ?? 0,
      }
    })
    .sort((left, right) => right.count - left.count || left.kind.localeCompare(right.kind))
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function computeHealthSignal(params: {
  runningQueries: number
  queryCount15m: number
  failedQueries15m: number
  p95QueryDurationMs: number | null
  activeParts: number
  runningQueryMemoryBytes: number
}): HealthSignal {
  const { runningQueries, queryCount15m, failedQueries15m, p95QueryDurationMs, activeParts, runningQueryMemoryBytes } =
    params
  const reasons: string[] = []
  let penalty = 0

  const failureRate = queryCount15m > 0 ? (failedQueries15m / queryCount15m) * 100 : 0
  if (failureRate >= 8) {
    penalty += 35
    reasons.push(`Falhas em ${failureRate.toFixed(1)}% das queries nos últimos 15 min`)
  } else if (failureRate >= 3) {
    penalty += 20
    reasons.push(`Falhas em ${failureRate.toFixed(1)}% das queries nos últimos 15 min`)
  } else if (failureRate > 0) {
    penalty += 8
    reasons.push(`Falhas recentes detectadas (${failureRate.toFixed(1)}%)`)
  }

  if (runningQueries >= 40) {
    penalty += 22
    reasons.push(`Muitas consultas ativas agora (${runningQueries})`)
  } else if (runningQueries >= 18) {
    penalty += 12
    reasons.push(`Carga concorrente em alta (${runningQueries} consultas ativas)`)
  } else if (runningQueries >= 8) {
    penalty += 6
    reasons.push(`Concorrência subindo (${runningQueries} consultas ativas)`)
  }

  if (typeof p95QueryDurationMs === 'number' && Number.isFinite(p95QueryDurationMs)) {
    if (p95QueryDurationMs >= 30_000) {
      penalty += 20
      reasons.push(`P95 de execução acima de 30s (${formatDurationMs(p95QueryDurationMs)})`)
    } else if (p95QueryDurationMs >= 10_000) {
      penalty += 12
      reasons.push(`P95 de execução acima de 10s (${formatDurationMs(p95QueryDurationMs)})`)
    } else if (p95QueryDurationMs >= 3_000) {
      penalty += 6
      reasons.push(`P95 de execução acima do ideal (${formatDurationMs(p95QueryDurationMs)})`)
    }
  }

  if (activeParts >= 20_000) {
    penalty += 18
    reasons.push(`Muitas parts ativas (${formatMetric(activeParts, 0)})`)
  } else if (activeParts >= 8_000) {
    penalty += 10
    reasons.push(`Merge pressure provável (${formatMetric(activeParts, 0)} parts ativas)`)
  } else if (activeParts >= 3_000) {
    penalty += 5
    reasons.push(`Contagem de parts elevada (${formatMetric(activeParts, 0)})`)
  }

  if (runningQueryMemoryBytes >= 16 * 1024 * 1024 * 1024) {
    penalty += 18
    reasons.push(`Memória de queries muito alta (${formatBytes(runningQueryMemoryBytes)})`)
  } else if (runningQueryMemoryBytes >= 8 * 1024 * 1024 * 1024) {
    penalty += 12
    reasons.push(`Memória de queries em alta (${formatBytes(runningQueryMemoryBytes)})`)
  } else if (runningQueryMemoryBytes >= 2 * 1024 * 1024 * 1024) {
    penalty += 6
    reasons.push(`Uso de memória perceptível (${formatBytes(runningQueryMemoryBytes)})`)
  }

  const score = clamp(Math.round(100 - penalty), 0, 100)
  const status: HealthSignal['status'] = score >= 80 ? 'healthy' : score >= 60 ? 'warning' : 'critical'

  if (reasons.length === 0) {
    reasons.push('Sinais operacionais estáveis nas últimas coletas')
  }

  return {
    score,
    status,
    reasons: reasons.slice(0, 3),
  }
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    return '--'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
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

function formatDurationMs(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return '--'
  }

  if (value < 1_000) {
    return `${Math.round(value)} ms`
  }

  if (value < 60_000) {
    const seconds = value / 1_000
    return `${formatMetric(seconds, seconds >= 10 ? 0 : 1)} s`
  }

  return `${formatMetric(value / 60_000, 1)} min`
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

function formatMinuteLabel(value: string): string {
  const normalized = value.trim()
  if (!normalized) {
    return ''
  }

  const parsed = new Date(normalized)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return normalized.length >= 16 ? normalized.slice(11, 16) : normalized
}

function healthStatusLabel(status: 'healthy' | 'warning' | 'critical'): string {
  if (status === 'healthy') {
    return 'Saudável'
  }

  if (status === 'warning') {
    return 'Atenção'
  }

  return 'Crítico'
}

function healthStatusClass(status: 'healthy' | 'warning' | 'critical'): string {
  if (status === 'healthy') {
    return 'border-emerald-500/35 bg-emerald-500/12 text-emerald-300'
  }

  if (status === 'warning') {
    return 'border-amber-500/35 bg-amber-500/12 text-amber-300'
  }

  return 'border-rose-500/35 bg-rose-500/12 text-rose-300'
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

export function ClickHouseDashboardPanel({
  activeDashboardTab,
  updateDashboardTab,
}: ClickHouseDashboardPanelProps): JSX.Element {
  const tabIdRef = useRef(activeDashboardTab.id)
  const connectionIdRef = useRef(activeDashboardTab.connectionId)
  const updateDashboardTabRef = useRef(updateDashboardTab)
  const requestSeqRef = useRef(0)

  useEffect(() => {
    tabIdRef.current = activeDashboardTab.id
    connectionIdRef.current = activeDashboardTab.connectionId
  }, [activeDashboardTab.id, activeDashboardTab.connectionId])

  useEffect(() => {
    updateDashboardTabRef.current = updateDashboardTab
  }, [updateDashboardTab])

  const refreshDashboard = useCallback(async (manual: boolean): Promise<void> => {
    const requestSeq = ++requestSeqRef.current
    const tabId = tabIdRef.current
    const connectionId = connectionIdRef.current

    updateDashboardTabRef.current(tabId, (tab) => ({ ...tab, loading: true, loadError: null }))

    try {
      const result = await pointerApi.executeSql(connectionId, CLICKHOUSE_DASHBOARD_SQL)
      const snapshotResult = result.resultSets[0]
      const trendResult = result.resultSets[1]
      const kindsResult = result.resultSets[2]
      const snapshot = parseSnapshotRow(snapshotResult?.rows?.[0] as Record<string, unknown> | undefined)

      if (!snapshot) {
        throw new Error('Não foi possível interpretar as métricas do ClickHouse.')
      }

      const trendData = parseTrendRows((trendResult?.rows ?? []) as Record<string, unknown>[])
      const queriesByKind = parseQueryKinds((kindsResult?.rows ?? []) as Record<string, unknown>[])
      const health = computeHealthSignal({
        runningQueries: snapshot.runningQueries,
        queryCount15m: snapshot.queryCount15m,
        failedQueries15m: snapshot.failedQueries15m,
        p95QueryDurationMs: snapshot.p95QueryDurationMs,
        activeParts: snapshot.activeParts,
        runningQueryMemoryBytes: snapshot.runningQueryMemoryBytes,
      })
      const historyPoint = {
        timeLabel: new Date(snapshot.collectedAt).toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        queries: snapshot.queryCount15m,
        failures: snapshot.failedQueries15m,
        healthScore: health.score,
      }

      if (requestSeq !== requestSeqRef.current || tabId !== tabIdRef.current) {
        return
      }

      updateDashboardTabRef.current(tabId, (tab) => {
        const currentTab = tab as ClickHouseDashboardTab

        return {
          ...currentTab,
          loading: false,
          loadError: null,
          lastUpdatedAt: snapshot.collectedAt,
          metrics: {
            ...snapshot,
            healthScore: health.score,
            healthStatus: health.status,
            healthReasons: health.reasons,
          },
          history: [...currentTab.history, historyPoint].slice(-DASHBOARD_HISTORY_LIMIT),
          queryTrend: trendData,
          queriesByKind,
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
  }, [activeDashboardTab.id, activeDashboardTab.connectionId, refreshDashboard])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshDashboard(false)
    }, DASHBOARD_REFRESH_INTERVAL_MS)

    return () => window.clearInterval(intervalId)
  }, [activeDashboardTab.id, activeDashboardTab.connectionId, refreshDashboard])

  const metrics = activeDashboardTab.metrics
  const isInitialLoading = activeDashboardTab.loading && !metrics
  const healthStatus = metrics?.healthStatus ?? 'healthy'
  const healthLabel = healthStatusLabel(healthStatus)
  const healthScore = metrics?.healthScore ?? 0

  const history = useMemo(() => activeDashboardTab.history ?? [], [activeDashboardTab.history])
  const queryTrend = useMemo(() => activeDashboardTab.queryTrend ?? [], [activeDashboardTab.queryTrend])
  const queriesByKind = useMemo(() => activeDashboardTab.queriesByKind ?? [], [activeDashboardTab.queriesByKind])
  const healthTrend = history.map((point) => ({
    timeLabel: point.timeLabel,
    healthScore: point.healthScore,
  }))

  const hasTrend = queryTrend.length > 0
  const hasHealthTrend = healthTrend.length > 0
  const hasQueryKinds = queriesByKind.length > 0

  const queryTrendMaxDomain = useMemo(() => {
    const values = queryTrend.flatMap((point) => [point.queries, point.failures]).filter((value) => Number.isFinite(value))

    if (values.length === 0) {
      return 10
    }

    const peak = Math.max(...values)
    if (peak <= 0) {
      return 10
    }

    return Math.ceil(peak * 1.25)
  }, [queryTrend])

  const queryKindsData = useMemo(() => queriesByKind.slice(0, 8), [queriesByKind])

  return (
    <div className='pointer-card flex h-full flex-col overflow-hidden'>
      <div className='flex items-center justify-between border-b border-slate-800/70 px-3 py-2.5'>
        <div>
          <h2 className='text-sm font-semibold'>Dashboard {activeDashboardTab.connectionName}</h2>
          <p className='text-[12px] text-slate-400'>
            Atualização automática a cada 30s • Última atualização: {formatTimestamp(activeDashboardTab.lastUpdatedAt)}
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
            Carregando métricas do ClickHouse...
          </div>
        ) : (
          <div className='space-y-3'>
            <div className='grid gap-2 md:grid-cols-2 xl:grid-cols-3'>
              <div className='pointer-card-soft p-3'>
                <div className='mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-slate-500'>
                  <Activity className='h-3.5 w-3.5' />
                  Queries ativas
                  <InfoHint text='Número de consultas atualmente em execução no ClickHouse, derivado de system.processes.' />
                </div>
                <div className='text-xl font-semibold text-slate-100'>
                  {metrics ? formatMetric(metrics.runningQueries, 0) : '--'}
                </div>
              </div>

              <div className='pointer-card-soft p-3'>
                <div className='mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-slate-500'>
                  <BarChart3 className='h-3.5 w-3.5' />
                  Queries 15m
                  <InfoHint text='Total de queries finalizadas nos últimos 15 minutos, com base em system.query_log.' />
                </div>
                <div className='text-xl font-semibold text-slate-100'>
                  {metrics ? formatMetric(metrics.queryCount15m, 0) : '--'}
                </div>
              </div>

              <div className='pointer-card-soft p-3'>
                <div className='mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-slate-500'>
                  <AlertTriangle className='h-3.5 w-3.5' />
                  Falhas 15m
                  <InfoHint text='Quantidade de queries com exceção nos últimos 15 minutos. Ajuda a distinguir carga alta de carga problemática.' />
                </div>
                <div className='text-xl font-semibold text-slate-100'>
                  {metrics ? formatMetric(metrics.failedQueries15m, 0) : '--'}
                </div>
              </div>

              <div className='pointer-card-soft p-3'>
                <div className='mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-slate-500'>
                  <Gauge className='h-3.5 w-3.5' />
                  P95 latência
                  <InfoHint text='Tempo de execução no percentil 95 das queries finalizadas nos últimos 15 minutos.' />
                </div>
                <div className='text-xl font-semibold text-slate-100'>
                  {metrics ? formatDurationMs(metrics.p95QueryDurationMs) : '--'}
                </div>
              </div>

              <div className='pointer-card-soft p-3'>
                <div className='mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-slate-500'>
                  <Server className='h-3.5 w-3.5' />
                  Parts ativas
                  <InfoHint text='Quantidade de parts ativas em tabelas de usuário. Valores muito altos normalmente sinalizam pressão de merge.' />
                </div>
                <div className='text-xl font-semibold text-slate-100'>
                  {metrics ? formatMetric(metrics.activeParts, 0) : '--'}
                </div>
              </div>

              <div className='pointer-card-soft p-3'>
                <div className='mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-slate-500'>
                  <Database className='h-3.5 w-3.5' />
                  Dados em disco
                  <InfoHint text='Volume total armazenado em parts ativas de tabelas de usuário, agregado a partir de system.parts.' />
                </div>
                <div className='text-xl font-semibold text-slate-100'>
                  {metrics ? formatBytes(metrics.bytesOnDisk) : '--'}
                </div>
              </div>
            </div>

            <div className='grid gap-3 xl:grid-cols-2'>
              <div className='pointer-card-soft p-3'>
                <div className='mb-2 flex items-center gap-1.5 text-[12px] font-medium text-slate-300'>
                  Tendência de queries
                  <InfoHint text='Evolução das queries finalizadas e das falhas ao longo da última hora.' />
                </div>
                {hasTrend ? (
                  <ChartContainer config={trendChartConfig} className='h-[220px] w-full'>
                    <AreaChart
                      data={queryTrend}
                      accessibilityLayer={false}
                      margin={{ top: 10, right: 8, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey='timeLabel'
                        tickLine={false}
                        axisLine={false}
                        minTickGap={18}
                        tickFormatter={(value) => formatMinuteLabel(String(value ?? ''))}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        width={44}
                        domain={[0, queryTrendMaxDomain]}
                        padding={{ top: 8 }}
                      />
                      <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                      <Area
                        type='monotone'
                        dataKey='queries'
                        stroke='var(--color-queries)'
                        fill='var(--color-queries)'
                        fillOpacity={0.24}
                        activeDot={{
                          r: 5,
                          stroke: 'var(--color-queries)',
                          strokeWidth: 2,
                          fill: '#0b1320',
                        }}
                        connectNulls
                      />
                      <Area
                        type='monotone'
                        dataKey='failures'
                        stroke='var(--color-failures)'
                        fill='var(--color-failures)'
                        fillOpacity={0.18}
                        activeDot={{
                          r: 5,
                          stroke: 'var(--color-failures)',
                          strokeWidth: 2,
                          fill: '#0b1320',
                        }}
                        connectNulls
                      />
                    </AreaChart>
                  </ChartContainer>
                ) : (
                  <div className='flex h-[220px] items-center justify-center text-slate-500'>Sem amostras ainda.</div>
                )}
              </div>

              <div className='pointer-card-soft p-3'>
                <div className='mb-2 flex items-center gap-1.5 text-[12px] font-medium text-slate-300'>
                  Saúde do ClickHouse
                  <InfoHint text='Health score de 0 a 100 baseado em falhas recentes, concorrência, latência p95, parts ativas e memória em uso pelas queries.' />
                </div>
                <div className='mb-3 flex items-start justify-between gap-3'>
                  <div>
                    <p className='text-2xl font-semibold text-slate-100'>{healthScore}</p>
                    <p className='text-[11px] text-slate-400'>Score (0-100)</p>
                  </div>
                  <span
                    className={`rounded-md border px-2 py-1 text-[11px] font-medium ${healthStatusClass(healthStatus)}`}
                  >
                    {healthLabel}
                  </span>
                </div>

                <div className='grid gap-1.5 text-[12px] text-slate-300'>
                  {(metrics?.healthReasons ?? ['Aguardando amostras de saúde']).map((reason) => (
                    <p key={reason} className='leading-snug'>
                      • {reason}
                    </p>
                  ))}
                </div>

                <div className='mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-400'>
                  <div className='rounded-md border border-slate-800/80 bg-slate-950/45 px-2 py-1.5'>
                    <p className='uppercase tracking-[0.12em] text-slate-500'>Memória queries</p>
                    <p className='mt-0.5 text-slate-200'>
                      {metrics ? formatBytes(metrics.runningQueryMemoryBytes) : '--'}
                    </p>
                  </div>
                  <div className='rounded-md border border-slate-800/80 bg-slate-950/45 px-2 py-1.5'>
                    <p className='uppercase tracking-[0.12em] text-slate-500'>Rows totais</p>
                    <p className='mt-0.5 text-slate-200'>{metrics ? formatMetric(metrics.totalRows, 0) : '--'}</p>
                  </div>
                </div>

                {hasHealthTrend ? (
                  <div className='mt-3'>
                    <p className='mb-1 text-[11px] uppercase tracking-[0.12em] text-slate-500'>Tendência de saúde</p>
                    <ChartContainer config={healthChartConfig} className='h-[115px] w-full'>
                      <LineChart
                        data={healthTrend}
                        accessibilityLayer={false}
                        margin={{ top: 6, right: 8, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid vertical={false} />
                        <XAxis
                          dataKey='timeLabel'
                          tickLine={false}
                          axisLine={false}
                          minTickGap={22}
                          tickFormatter={(value) => formatMinuteLabel(String(value ?? ''))}
                        />
                        <YAxis tickLine={false} axisLine={false} width={34} domain={[0, 100]} />
                        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                        <Line
                          type='monotone'
                          dataKey='healthScore'
                          stroke='var(--color-healthScore)'
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ChartContainer>
                  </div>
                ) : null}
              </div>
            </div>

            <div className='pointer-card-soft p-3'>
              <div className='mb-2 flex items-center gap-1.5 text-[12px] font-medium text-slate-300'>
                Queries por tipo
                <InfoHint text='Distribuição das queries atualmente em execução no ClickHouse, agrupadas por uma classificação textual simples.' />
              </div>
              {hasQueryKinds ? (
                <ChartContainer config={queryKindChartConfig} className='h-[250px] w-full'>
                  <BarChart data={queryKindsData} accessibilityLayer={false}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey='kind' tickLine={false} axisLine={false} interval={0} />
                    <YAxis tickLine={false} axisLine={false} width={44} allowDecimals={false} />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                    <Bar dataKey='count' fill='var(--color-count)' radius={6} />
                  </BarChart>
                </ChartContainer>
              ) : (
                <div className='flex h-[180px] items-center justify-center text-slate-500'>
                  Sem processos ativos no momento.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
