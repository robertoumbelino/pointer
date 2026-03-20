import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Activity, Database, Gauge, Info, RefreshCw, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import type {
  DashboardTab,
  PostgresDashboardCounters,
  PostgresDashboardTab,
  PostgresSessionStatePoint,
} from '../../../entities/workspace/types'
import { Button } from '../../../components/ui/button'
import { ChartContainer, type ChartConfig, ChartTooltip, ChartTooltipContent } from '../../../components/ui/chart'
import { pointerApi } from '../../../shared/api/pointer-api'
import { getErrorMessage } from '../../../shared/lib/workspace-utils'

const DASHBOARD_REFRESH_INTERVAL_MS = 30_000
const DASHBOARD_HISTORY_LIMIT = 20

const POSTGRES_DASHBOARD_SQL = `
WITH db AS (
  SELECT
    now() AS collected_at,
    (xact_commit + xact_rollback) AS xact_total,
    blks_hit,
    blks_read
  FROM pg_stat_database
  WHERE datname = current_database()
),
conn AS (
  SELECT
    COUNT(*) FILTER (WHERE state = 'active')::int AS active_sessions,
    COUNT(*)::int AS total_sessions
  FROM pg_stat_activity
  WHERE datname = current_database()
),
cfg AS (
  SELECT setting::int AS max_connections
  FROM pg_settings
  WHERE name = 'max_connections'
)
SELECT
  db.collected_at,
  db.xact_total,
  db.blks_hit,
  db.blks_read,
  pg_database_size(current_database())::bigint AS db_size_bytes,
  conn.active_sessions,
  conn.total_sessions,
  cfg.max_connections
FROM db, conn, cfg;

SELECT
  COALESCE(state, 'unknown') AS state,
  COUNT(*)::int AS count
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY COALESCE(state, 'unknown')
ORDER BY count DESC, state ASC;
`.trim()

type SnapshotSample = {
  collectedAt: string
  xactTotal: number
  blksHit: number
  blksRead: number
  dbSizeBytes: number
  activeSessions: number
  totalSessions: number
  maxConnections: number
}

type PostgresDashboardPanelProps = {
  activeDashboardTab: PostgresDashboardTab
  updateDashboardTab: (tabId: string, updater: (tab: DashboardTab) => DashboardTab) => void
}

const tpsChartConfig = {
  tps: {
    label: 'TPS',
    color: '#38bdf8',
  },
} satisfies ChartConfig

const healthChartConfig = {
  healthScore: {
    label: 'Health score',
    color: '#22d3ee',
  },
} satisfies ChartConfig

const sessionsChartConfig = {
  count: {
    label: 'Sessões',
    color: '#a78bfa',
  },
} satisfies ChartConfig

type HealthSignal = {
  score: number
  status: 'healthy' | 'warning' | 'critical'
  reasons: string[]
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

function parseSnapshotRow(row: Record<string, unknown> | undefined): SnapshotSample | null {
  if (!row) {
    return null
  }

  const collectedAtRaw = row.collected_at
  const collectedAt = typeof collectedAtRaw === 'string' && collectedAtRaw.trim() ? collectedAtRaw : new Date().toISOString()
  const xactTotal = toNumber(row.xact_total)
  const blksHit = toNumber(row.blks_hit)
  const blksRead = toNumber(row.blks_read)
  const dbSizeBytes = toNumber(row.db_size_bytes)
  const activeSessions = toNumber(row.active_sessions)
  const totalSessions = toNumber(row.total_sessions)
  const maxConnections = toNumber(row.max_connections)

  if (
    xactTotal === null ||
    blksHit === null ||
    blksRead === null ||
    dbSizeBytes === null ||
    activeSessions === null ||
    totalSessions === null ||
    maxConnections === null
  ) {
    return null
  }

  return {
    collectedAt,
    xactTotal,
    blksHit,
    blksRead,
    dbSizeBytes,
    activeSessions,
    totalSessions,
    maxConnections,
  }
}

function parseSessionStates(rows: Record<string, unknown>[]): PostgresSessionStatePoint[] {
  return rows
    .map((row) => {
      const stateRaw = row.state
      const state = typeof stateRaw === 'string' && stateRaw.trim() ? stateRaw : 'unknown'
      const count = toNumber(row.count) ?? 0
      return {
        state,
        count,
      }
    })
    .sort((left, right) => right.count - left.count || left.state.localeCompare(right.state))
}

function computeTps(
  previous: PostgresDashboardCounters | null,
  current: PostgresDashboardCounters,
): number | null {
  if (!previous) {
    return null
  }

  const previousAt = new Date(previous.collectedAt).getTime()
  const currentAt = new Date(current.collectedAt).getTime()
  if (!Number.isFinite(previousAt) || !Number.isFinite(currentAt) || currentAt <= previousAt) {
    return null
  }

  const deltaSeconds = (currentAt - previousAt) / 1_000
  const deltaTransactions = current.xactTotal - previous.xactTotal
  if (deltaSeconds <= 0 || deltaTransactions < 0) {
    return null
  }

  return deltaTransactions / deltaSeconds
}

function computeCacheHitRatio(blksHit: number, blksRead: number): number | null {
  const total = blksHit + blksRead
  if (total <= 0) {
    return null
  }

  return (blksHit / total) * 100
}

function computeDiskReadPerSecond(
  previous: PostgresDashboardCounters | null,
  current: PostgresDashboardCounters,
): number | null {
  if (!previous) {
    return null
  }

  const previousAt = new Date(previous.collectedAt).getTime()
  const currentAt = new Date(current.collectedAt).getTime()
  if (!Number.isFinite(previousAt) || !Number.isFinite(currentAt) || currentAt <= previousAt) {
    return null
  }

  const deltaSeconds = (currentAt - previousAt) / 1_000
  const deltaReadBlocks = current.blksRead - previous.blksRead
  if (deltaSeconds <= 0 || deltaReadBlocks < 0) {
    return null
  }

  return deltaReadBlocks / deltaSeconds
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function computeHealthSignal(params: {
  totalSessions: number
  maxConnections: number
  activeSessions: number
  cacheHitRatio: number | null
  diskReadPerSecond: number | null
}): HealthSignal {
  const { totalSessions, maxConnections, activeSessions, cacheHitRatio, diskReadPerSecond } = params
  const reasons: string[] = []
  let penalty = 0

  const connectionsUsage = maxConnections > 0 ? (totalSessions / maxConnections) * 100 : 0
  if (connectionsUsage >= 92) {
    penalty += 40
    reasons.push(`Conexões em ${Math.round(connectionsUsage)}% do limite`)
  } else if (connectionsUsage >= 82) {
    penalty += 24
    reasons.push(`Conexões em ${Math.round(connectionsUsage)}% do limite`)
  } else if (connectionsUsage >= 70) {
    penalty += 12
    reasons.push(`Conexões subindo (${Math.round(connectionsUsage)}% do limite)`)
  }

  if (cacheHitRatio !== null) {
    if (cacheHitRatio < 95) {
      penalty += 32
      reasons.push(`Cache hit baixo (${cacheHitRatio.toFixed(2)}%)`)
    } else if (cacheHitRatio < 97) {
      penalty += 18
      reasons.push(`Cache hit em atenção (${cacheHitRatio.toFixed(2)}%)`)
    } else if (cacheHitRatio < 99) {
      penalty += 8
      reasons.push(`Cache hit abaixo do ideal (${cacheHitRatio.toFixed(2)}%)`)
    }
  }

  if (diskReadPerSecond !== null) {
    if (diskReadPerSecond >= 5000) {
      penalty += 25
      reasons.push(`Leitura de disco alta (${Math.round(diskReadPerSecond)} blocos/s)`)
    } else if (diskReadPerSecond >= 1500) {
      penalty += 14
      reasons.push(`Leitura de disco em alta (${Math.round(diskReadPerSecond)} blocos/s)`)
    }
  }

  const activeRatio = totalSessions > 0 ? activeSessions / totalSessions : 0
  if (activeSessions >= 40 && activeRatio >= 0.6) {
    penalty += 10
    reasons.push(`Muitas sessões ativas ao mesmo tempo (${Math.round(activeRatio * 100)}%)`)
  } else if (activeSessions >= 20 && activeRatio >= 0.45) {
    penalty += 6
    reasons.push(`Sessões ativas elevadas (${Math.round(activeRatio * 100)}%)`)
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

function formatIntegerMetric(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return '--'
  }

  return Math.round(value).toLocaleString('pt-BR')
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

function formatHourMinuteLabel(value: string): string {
  const normalized = value.trim()
  if (!normalized) {
    return ''
  }

  const parts = normalized.split(':')
  if (parts.length >= 2) {
    return `${parts[0]}:${parts[1]}`
  }

  const parsed = new Date(normalized)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return normalized
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

export function PostgresDashboardPanel({
  activeDashboardTab,
  updateDashboardTab,
}: PostgresDashboardPanelProps): JSX.Element {
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
      const result = await pointerApi.executeSql(connectionId, POSTGRES_DASHBOARD_SQL)
      const snapshotResult = result.resultSets[0]
      const statesResult = result.resultSets[1]
      const snapshot = parseSnapshotRow(snapshotResult?.rows?.[0] as Record<string, unknown> | undefined)

      if (!snapshot) {
        throw new Error('Não foi possível interpretar as métricas do PostgreSQL.')
      }

      const sessionsByState = parseSessionStates((statesResult?.rows ?? []) as Record<string, unknown>[])
      const nextCounters: PostgresDashboardCounters = {
        collectedAt: snapshot.collectedAt,
        xactTotal: snapshot.xactTotal,
        blksRead: snapshot.blksRead,
      }

      if (requestSeq !== requestSeqRef.current || tabId !== tabIdRef.current) {
        return
      }

      updateDashboardTabRef.current(tabId, (tab) => {
        const currentTab = tab as PostgresDashboardTab
        const tps = computeTps(currentTab.lastCounters, nextCounters)
        const cacheHitRatio = computeCacheHitRatio(snapshot.blksHit, snapshot.blksRead)
        const diskReadPerSecond = computeDiskReadPerSecond(currentTab.lastCounters, nextCounters)
        const health = computeHealthSignal({
          totalSessions: snapshot.totalSessions,
          maxConnections: snapshot.maxConnections,
          activeSessions: snapshot.activeSessions,
          cacheHitRatio,
          diskReadPerSecond,
        })
        const historyPoint = {
          timeLabel: new Date(snapshot.collectedAt).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          tps,
          cacheHitRatio,
          healthScore: health.score,
        }

        return {
          ...currentTab,
          loading: false,
          loadError: null,
          lastUpdatedAt: snapshot.collectedAt,
          metrics: {
            collectedAt: snapshot.collectedAt,
            activeSessions: snapshot.activeSessions,
            totalSessions: snapshot.totalSessions,
            maxConnections: snapshot.maxConnections,
            dbSizeBytes: snapshot.dbSizeBytes,
            tps,
            cacheHitRatio,
            diskReadPerSecond,
            healthScore: health.score,
            healthStatus: health.status,
            healthReasons: health.reasons,
          },
          history: [...currentTab.history, historyPoint].slice(-DASHBOARD_HISTORY_LIMIT),
          sessionsByState,
          lastCounters: nextCounters,
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
  const usageRatio = metrics && metrics.maxConnections > 0
    ? Math.max(0, Math.min(100, (metrics.totalSessions / metrics.maxConnections) * 100))
    : null
  const healthStatus = metrics?.healthStatus ?? 'healthy'
  const healthLabel = healthStatusLabel(healthStatus)
  const healthScore = metrics?.healthScore ?? 0
  const cacheMissRatio = metrics?.cacheHitRatio === null || metrics?.cacheHitRatio === undefined
    ? null
    : Math.max(0, 100 - metrics.cacheHitRatio)
  const healthTrend = activeDashboardTab.history.map((point) => ({
    timeLabel: point.timeLabel,
    healthScore: point.healthScore,
  }))

  const hasHistory = activeDashboardTab.history.length > 0
  const tpsMaxDomain = useMemo(() => {
    const values = activeDashboardTab.history
      .map((point) => point.tps)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

    if (values.length === 0) {
      return 100
    }

    const peak = Math.max(...values)
    if (peak <= 0) {
      return 100
    }

    return Math.ceil(peak * 1.18)
  }, [activeDashboardTab.history])

  const statesData = useMemo(
    () => activeDashboardTab.sessionsByState.slice(0, 8),
    [activeDashboardTab.sessionsByState],
  )

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
            Carregando métricas do PostgreSQL...
          </div>
        ) : (
          <div className='space-y-3'>
            <div className='grid gap-2 md:grid-cols-2 xl:grid-cols-5'>
              <div className='pointer-card-soft p-3'>
                <div className='mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-slate-500'>
                  <Activity className='h-3.5 w-3.5' />
                  Sessões ativas
                  <InfoHint text='Quantidade de conexões em estado "active" no PostgreSQL agora. Em geral são queries em execução neste instante.' />
                </div>
                <div className='text-xl font-semibold text-slate-100'>
                  {metrics ? formatMetric(metrics.activeSessions, 0) : '--'}
                </div>
              </div>

              <div className='pointer-card-soft p-3'>
                <div className='mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-slate-500'>
                  <Users className='h-3.5 w-3.5' />
                  Conexões
                  <InfoHint text='Total de sessões conectadas no banco (active + idle + outros estados) em relação ao limite de max_connections.' />
                </div>
                <div className='text-xl font-semibold text-slate-100'>
                  {metrics ? `${formatMetric(metrics.totalSessions, 0)} / ${formatMetric(metrics.maxConnections, 0)}` : '--'}
                </div>
                <div className='mt-2 h-1.5 rounded-full bg-slate-800/80'>
                  <div
                    className='h-1.5 rounded-full bg-sky-400/80 transition-all'
                    style={{ width: `${usageRatio ?? 0}%` }}
                  />
                </div>
              </div>

              <div className='pointer-card-soft p-3'>
                <div className='mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-slate-500'>
                  <Gauge className='h-3.5 w-3.5' />
                  TPS
                  <InfoHint text='Transações por segundo. É calculado pelo delta de (commits + rollbacks) entre duas coletas consecutivas.' />
                </div>
                <div className='text-xl font-semibold text-slate-100'>
                  {metrics ? formatMetric(metrics.tps, 2) : '--'}
                </div>
              </div>

              <div className='pointer-card-soft p-3'>
                <div className='mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-slate-500'>
                  <Gauge className='h-3.5 w-3.5' />
                  Cache hit
                  <InfoHint text='Percentual de leituras atendidas pelo cache de memória (buffers) em vez de disco. Fórmula: blks_hit / (blks_hit + blks_read).' />
                </div>
                <div className='text-xl font-semibold text-slate-100'>
                  {metrics?.cacheHitRatio === null || metrics?.cacheHitRatio === undefined
                    ? '--'
                    : `${formatMetric(metrics.cacheHitRatio, 2)}%`}
                </div>
              </div>

              <div className='pointer-card-soft p-3'>
                <div className='mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-slate-500'>
                  <Database className='h-3.5 w-3.5' />
                  Tamanho DB
                  <InfoHint text='Tamanho atual do banco selecionado, medido com pg_database_size(current_database()).' />
                </div>
                <div className='text-xl font-semibold text-slate-100'>
                  {metrics ? formatBytes(metrics.dbSizeBytes) : '--'}
                </div>
              </div>
            </div>

            <div className='grid gap-3 xl:grid-cols-2'>
              <div className='pointer-card-soft p-3'>
                <div className='mb-2 flex items-center gap-1.5 text-[12px] font-medium text-slate-300'>
                  TPS (histórico)
                  <InfoHint text='TPS significa transações por segundo. Este gráfico mostra a evolução do TPS nas últimas coletas do dashboard.' />
                </div>
                {hasHistory ? (
                  <ChartContainer config={tpsChartConfig} className='h-[220px] w-full'>
                    <AreaChart
                      data={activeDashboardTab.history}
                      accessibilityLayer={false}
                      margin={{ top: 10, right: 8, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey='timeLabel'
                        tickLine={false}
                        axisLine={false}
                        minTickGap={18}
                        tickFormatter={(value) => formatHourMinuteLabel(String(value ?? ''))}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        width={44}
                        domain={[0, tpsMaxDomain]}
                        padding={{ top: 8 }}
                      />
                      <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                      <Area
                        type='monotone'
                        dataKey='tps'
                        stroke='var(--color-tps)'
                        fill='var(--color-tps)'
                        fillOpacity={0.28}
                        activeDot={{
                          r: 5,
                          stroke: 'var(--color-tps)',
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
                  Saúde do Banco
                  <InfoHint text='Health score de 0 a 100 calculado por conexões, cache hit, leitura em disco e carga de sessões ativas.' />
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
                    <p key={reason} className='leading-snug'>• {reason}</p>
                  ))}
                </div>

                <div className='mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-400'>
                  <div className='rounded-md border border-slate-800/80 bg-slate-950/45 px-2 py-1.5'>
                    <p className='uppercase tracking-[0.12em] text-slate-500'>Cache miss</p>
                    <p className='mt-0.5 text-slate-200'>
                      {cacheMissRatio === null ? '--' : `${formatMetric(cacheMissRatio, 2)}%`}
                    </p>
                  </div>
                  <div className='rounded-md border border-slate-800/80 bg-slate-950/45 px-2 py-1.5'>
                    <p className='uppercase tracking-[0.12em] text-slate-500'>Leitura disco/s</p>
                    <p className='mt-0.5 text-slate-200'>
                      {formatIntegerMetric(metrics?.diskReadPerSecond ?? null)} blocos
                    </p>
                  </div>
                </div>

                {hasHistory ? (
                  <div className='mt-3'>
                    <p className='mb-1 text-[11px] uppercase tracking-[0.12em] text-slate-500'>Tendência</p>
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
                          tickFormatter={(value) => formatHourMinuteLabel(String(value ?? ''))}
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
                Sessões por estado
                <InfoHint text='Distribuição das conexões por estado do PostgreSQL (ex.: active, idle, idle in transaction).' />
              </div>
              {statesData.length > 0 ? (
                <ChartContainer config={sessionsChartConfig} className='h-[250px] w-full'>
                  <BarChart data={statesData} accessibilityLayer={false}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey='state' tickLine={false} axisLine={false} interval={0} />
                    <YAxis tickLine={false} axisLine={false} width={44} allowDecimals={false} />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                    <Bar dataKey='count' fill='var(--color-count)' radius={6} />
                  </BarChart>
                </ChartContainer>
              ) : (
                <div className='flex h-[180px] items-center justify-center text-slate-500'>
                  Sem dados de sessões no momento.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
