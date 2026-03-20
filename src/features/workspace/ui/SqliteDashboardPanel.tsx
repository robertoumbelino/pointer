import { useCallback, useEffect, useRef } from 'react'
import { Database, Gauge, HardDrive, Info, RefreshCw, Table2 } from 'lucide-react'
import { toast } from 'sonner'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { Button } from '../../../components/ui/button'
import { ChartContainer, type ChartConfig, ChartTooltip, ChartTooltipContent } from '../../../components/ui/chart'
import type { DashboardTab, SqliteDashboardTab } from '../../../entities/workspace/types'
import { pointerApi } from '../../../shared/api/pointer-api'
import { getErrorMessage } from '../../../shared/lib/workspace-utils'

const DASHBOARD_REFRESH_INTERVAL_MS = 30_000
const DASHBOARD_HISTORY_LIMIT = 20

const SQLITE_DASHBOARD_SQL = `
SELECT
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AS collected_at,
  sqlite_version() AS sqlite_version,
  (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%') AS table_count,
  (SELECT COUNT(*) FROM sqlite_master WHERE type = 'view' AND name NOT LIKE 'sqlite_%') AS view_count,
  (SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%') AS index_count,
  (SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger' AND name NOT LIKE 'sqlite_%') AS trigger_count;

PRAGMA page_count;
PRAGMA page_size;
PRAGMA freelist_count;
PRAGMA journal_mode;
PRAGMA synchronous;
PRAGMA auto_vacuum;
PRAGMA cache_size;
`.trim()

type SqliteDashboardSnapshot = {
  collectedAt: string
  sqliteVersion: string
  tableCount: number
  viewCount: number
  indexCount: number
  triggerCount: number
  pageCount: number
  pageSize: number
  freelistCount: number
  journalMode: string
  synchronousLevel: number
  autoVacuumLevel: number
  cacheSize: number | null
}

type SqliteDashboardMetrics = SqliteDashboardSnapshot & {
  estimatedSizeBytes: number
  freeBytes: number
  fragmentationRatio: number
  healthScore: number
  healthStatus: 'healthy' | 'warning' | 'critical'
  healthReasons: string[]
}

type SqliteDashboardSeriesPoint = {
  timeLabel: string
  healthScore: number
  fragmentationRatio: number
}

type SqliteDashboardPanelProps = {
  activeDashboardTab: SqliteDashboardTab
  updateDashboardTab: (tabId: string, updater: (tab: DashboardTab) => DashboardTab) => void
}

const sqliteTrendChartConfig = {
  healthScore: {
    label: 'Health score',
    color: '#38bdf8',
  },
  fragmentationRatio: {
    label: 'Fragmentação',
    color: '#f59e0b',
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

function parseSqliteSnapshot(resultSets: Array<{ rows?: Record<string, unknown>[] }>): SqliteDashboardSnapshot | null {
  const overviewRow = resultSets[0]?.rows?.[0] as Record<string, unknown> | undefined
  if (!overviewRow) {
    return null
  }

  const pageCountRow = resultSets[1]?.rows?.[0] as Record<string, unknown> | undefined
  const pageSizeRow = resultSets[2]?.rows?.[0] as Record<string, unknown> | undefined
  const freelistRow = resultSets[3]?.rows?.[0] as Record<string, unknown> | undefined
  const journalModeRow = resultSets[4]?.rows?.[0] as Record<string, unknown> | undefined
  const synchronousRow = resultSets[5]?.rows?.[0] as Record<string, unknown> | undefined
  const autoVacuumRow = resultSets[6]?.rows?.[0] as Record<string, unknown> | undefined
  const cacheSizeRow = resultSets[7]?.rows?.[0] as Record<string, unknown> | undefined

  const collectedAtRaw = toText(overviewRow.collected_at)
  const sqliteVersion = toText(overviewRow.sqlite_version) ?? '--'
  const tableCount = toNumber(overviewRow.table_count) ?? 0
  const viewCount = toNumber(overviewRow.view_count) ?? 0
  const indexCount = toNumber(overviewRow.index_count) ?? 0
  const triggerCount = toNumber(overviewRow.trigger_count) ?? 0
  const pageCount = toNumber(pickRowValue(pageCountRow, ['page_count'])) ?? null
  const pageSize = toNumber(pickRowValue(pageSizeRow, ['page_size'])) ?? null
  const freelistCount = toNumber(pickRowValue(freelistRow, ['freelist_count'])) ?? null
  const journalMode = toText(pickRowValue(journalModeRow, ['journal_mode'])) ?? null
  const synchronousLevel = toNumber(pickRowValue(synchronousRow, ['synchronous'])) ?? null
  const autoVacuumLevel = toNumber(pickRowValue(autoVacuumRow, ['auto_vacuum'])) ?? null
  const cacheSize = toNumber(pickRowValue(cacheSizeRow, ['cache_size']))

  if (
    !collectedAtRaw ||
    pageCount === null ||
    pageSize === null ||
    freelistCount === null ||
    !journalMode ||
    synchronousLevel === null ||
    autoVacuumLevel === null
  ) {
    return null
  }

  return {
    collectedAt: collectedAtRaw,
    sqliteVersion,
    tableCount,
    viewCount,
    indexCount,
    triggerCount,
    pageCount,
    pageSize,
    freelistCount,
    journalMode: journalMode.toLowerCase(),
    synchronousLevel,
    autoVacuumLevel,
    cacheSize,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function computeHealthSignal(params: {
  pageCount: number
  freelistCount: number
  journalMode: string
  synchronousLevel: number
  autoVacuumLevel: number
  tableCount: number
  estimatedSizeBytes: number
}): Pick<SqliteDashboardMetrics, 'healthScore' | 'healthStatus' | 'healthReasons'> {
  const {
    pageCount,
    freelistCount,
    journalMode,
    synchronousLevel,
    autoVacuumLevel,
    tableCount,
    estimatedSizeBytes,
  } = params

  const reasons: string[] = []
  let penalty = 0

  const fragmentationRatio = pageCount > 0 ? (freelistCount / pageCount) * 100 : 0

  if (pageCount <= 0) {
    penalty += 18
    reasons.push('O banco não reportou páginas válidas.')
  }

  if (tableCount <= 0) {
    penalty += 12
    reasons.push('Nenhuma tabela foi encontrada no arquivo.')
  }

  if (journalMode === 'off') {
    penalty += 45
    reasons.push('journal_mode está OFF.')
  } else if (journalMode === 'memory') {
    penalty += 16
    reasons.push('journal_mode está em MEMORY.')
  }

  if (synchronousLevel <= 0) {
    penalty += 24
    reasons.push('synchronous está OFF.')
  }

  if (fragmentationRatio >= 25) {
    penalty += 32
    reasons.push(`Fragmentação alta (${fragmentationRatio.toFixed(1)}%).`)
  } else if (fragmentationRatio >= 15) {
    penalty += 18
    reasons.push(`Fragmentação moderada (${fragmentationRatio.toFixed(1)}%).`)
  } else if (fragmentationRatio >= 6) {
    penalty += 8
    reasons.push(`Fragmentação crescendo (${fragmentationRatio.toFixed(1)}%).`)
  }

  if (autoVacuumLevel === 0 && fragmentationRatio >= 15) {
    penalty += 6
    reasons.push('auto_vacuum está desativado com fragmentação acumulada.')
  }

  if (estimatedSizeBytes >= 512 * 1024 * 1024 && fragmentationRatio >= 10) {
    penalty += 8
    reasons.push('Arquivo grande com páginas livres relevantes.')
  }

  const healthScore = clamp(Math.round(100 - penalty), 0, 100)
  const healthStatus: SqliteDashboardMetrics['healthStatus'] =
    healthScore >= 80 ? 'healthy' : healthScore >= 60 ? 'warning' : 'critical'

  if (reasons.length === 0) {
    reasons.push('Métricas SQLite estáveis nas últimas coletas.')
  }

  return {
    healthScore,
    healthStatus,
    healthReasons: reasons.slice(0, 3),
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

function healthBarClass(status: 'healthy' | 'warning' | 'critical'): string {
  if (status === 'healthy') {
    return 'bg-emerald-400/80'
  }

  if (status === 'warning') {
    return 'bg-amber-400/80'
  }

  return 'bg-rose-400/80'
}

function journalModeLabel(value: string): string {
  const normalized = value.trim()
  if (!normalized) {
    return '--'
  }

  return normalized.toUpperCase()
}

function synchronousLabel(level: number): string {
  if (level <= 0) {
    return 'OFF'
  }

  if (level === 1) {
    return 'NORMAL'
  }

  if (level === 2) {
    return 'FULL'
  }

  if (level >= 3) {
    return 'EXTRA'
  }

  return String(level)
}

function autoVacuumLabel(level: number): string {
  if (level <= 0) {
    return 'NONE'
  }

  if (level === 1) {
    return 'FULL'
  }

  if (level === 2) {
    return 'INCREMENTAL'
  }

  return String(level)
}

function cacheSizeLabel(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return '--'
  }

  if (value < 0) {
    return `${Math.abs(value).toLocaleString('pt-BR')} KiB`
  }

  return `${value.toLocaleString('pt-BR')} páginas`
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

export function SqliteDashboardPanel({
  activeDashboardTab,
  updateDashboardTab,
}: SqliteDashboardPanelProps): JSX.Element {
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
      const result = await pointerApi.executeSql(connectionId, SQLITE_DASHBOARD_SQL)
      const snapshot = parseSqliteSnapshot(result.resultSets as Array<{ rows?: Record<string, unknown>[] }>)

      if (!snapshot) {
        throw new Error('Não foi possível interpretar as métricas do SQLite.')
      }

      if (requestSeq !== requestSeqRef.current || tabId !== tabIdRef.current) {
        return
      }

      updateDashboardTabRef.current(tabId, (tab) => {
        const currentTab = tab as SqliteDashboardTab
        const estimatedSizeBytes = snapshot.pageCount * snapshot.pageSize
        const freeBytes = snapshot.freelistCount * snapshot.pageSize
        const fragmentationRatio = snapshot.pageCount > 0 ? (snapshot.freelistCount / snapshot.pageCount) * 100 : 0
        const health = computeHealthSignal({
          pageCount: snapshot.pageCount,
          freelistCount: snapshot.freelistCount,
          journalMode: snapshot.journalMode,
          synchronousLevel: snapshot.synchronousLevel,
          autoVacuumLevel: snapshot.autoVacuumLevel,
          tableCount: snapshot.tableCount,
          estimatedSizeBytes,
        })
        const historyPoint: SqliteDashboardSeriesPoint = {
          timeLabel: new Date(snapshot.collectedAt).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          healthScore: health.healthScore,
          fragmentationRatio,
        }

        return {
          ...currentTab,
          loading: false,
          loadError: null,
          lastUpdatedAt: snapshot.collectedAt,
          metrics: {
            ...snapshot,
            estimatedSizeBytes,
            freeBytes,
            fragmentationRatio,
            ...health,
          },
          history: [...currentTab.history, historyPoint].slice(-DASHBOARD_HISTORY_LIMIT),
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
  const fragmentationRatio = metrics?.fragmentationRatio ?? 0
  const hasHistory = activeDashboardTab.history.length > 0

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
            Carregando métricas do SQLite...
          </div>
        ) : (
          <div className='space-y-3'>
            <div className='grid gap-2 md:grid-cols-2 xl:grid-cols-6'>
              <div className='pointer-card-soft p-3'>
                <div className='mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-slate-500'>
                  <Gauge className='h-3.5 w-3.5' />
                  Saúde
                  <InfoHint text='Health score de 0 a 100 calculado por journal_mode, synchronous, fragmentação, páginas livres e presença de tabelas.' />
                </div>
                <div className='flex items-start justify-between gap-2'>
                  <div>
                    <div className='text-xl font-semibold text-slate-100'>{formatMetric(healthScore, 0)}</div>
                    <div className='text-[11px] text-slate-500'>Score (0-100)</div>
                  </div>
                  <span className={`rounded-md border px-2 py-1 text-[11px] font-medium ${healthStatusClass(healthStatus)}`}>
                    {healthLabel}
                  </span>
                </div>
                <div className='mt-2 h-1.5 rounded-full bg-slate-800/80'>
                  <div className={`h-1.5 rounded-full transition-all ${healthBarClass(healthStatus)}`} style={{ width: `${healthScore}%` }} />
                </div>
              </div>

              <div className='pointer-card-soft p-3'>
                <div className='mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-slate-500'>
                  <Database className='h-3.5 w-3.5' />
                  Tamanho estimado
                  <InfoHint text='Estimativa do tamanho do arquivo calculada por page_count × page_size. É uma boa referência para crescimento e para a carga de I/O.' />
                </div>
                <div className='text-xl font-semibold text-slate-100'>
                  {metrics ? formatBytes(metrics.estimatedSizeBytes) : '--'}
                </div>
                <div className='text-[11px] text-slate-500'>
                  Page size: {metrics ? `${formatIntegerMetric(metrics.pageSize)} bytes` : '--'}
                </div>
              </div>

              <div className='pointer-card-soft p-3'>
                <div className='mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-slate-500'>
                  <HardDrive className='h-3.5 w-3.5' />
                  Páginas
                  <InfoHint text='Quantidade total de páginas do banco. Esse número cresce conforme os dados e o índice ocupam espaço no arquivo.' />
                </div>
                <div className='text-xl font-semibold text-slate-100'>
                  {metrics ? formatIntegerMetric(metrics.pageCount) : '--'}
                </div>
                <div className='text-[11px] text-slate-500'>
                  Livres: {metrics ? formatIntegerMetric(metrics.freelistCount) : '--'}
                </div>
              </div>

              <div className='pointer-card-soft p-3'>
                <div className='mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-slate-500'>
                  <HardDrive className='h-3.5 w-3.5' />
                  Freelist
                  <InfoHint text='Páginas livres que ainda fazem parte do arquivo. Em geral apontam espaço recuperável com VACUUM ou crescimento recente do banco.' />
                </div>
                <div className='text-xl font-semibold text-slate-100'>
                  {metrics ? formatIntegerMetric(metrics.freelistCount) : '--'}
                </div>
                <div className='text-[11px] text-slate-500'>
                  {metrics ? formatBytes(metrics.freeBytes) : '--'}
                </div>
                <div className='mt-2 h-1.5 rounded-full bg-slate-800/80'>
                  <div
                    className='h-1.5 rounded-full bg-amber-400/80 transition-all'
                    style={{ width: `${Math.max(0, Math.min(100, fragmentationRatio))}%` }}
                  />
                </div>
              </div>

              <div className='pointer-card-soft p-3'>
                <div className='mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-slate-500'>
                  <Table2 className='h-3.5 w-3.5' />
                  Tabelas
                  <InfoHint text='Total de tabelas de aplicação no sqlite_master. O painel também coleta views, índices e triggers para contexto operacional.' />
                </div>
                <div className='text-xl font-semibold text-slate-100'>
                  {metrics ? formatIntegerMetric(metrics.tableCount) : '--'}
                </div>
                <div className='text-[11px] text-slate-500'>
                  {metrics
                    ? `${formatIntegerMetric(metrics.viewCount)} views • ${formatIntegerMetric(metrics.indexCount)} índices • ${formatIntegerMetric(metrics.triggerCount)} triggers`
                    : '--'}
                </div>
              </div>

              <div className='pointer-card-soft p-3'>
                <div className='mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-slate-500'>
                  <Gauge className='h-3.5 w-3.5' />
                  Fragmentação
                  <InfoHint text='Percentual de páginas livres em relação ao total de páginas. Valores altos indicam espaço ocioso acumulado dentro do arquivo.' />
                </div>
                <div className='text-xl font-semibold text-slate-100'>
                  {metrics ? `${formatMetric(metrics.fragmentationRatio, 1)}%` : '--'}
                </div>
                <div className='text-[11px] text-slate-500'>
                  {metrics ? `${formatBytes(metrics.freeBytes)} livres` : '--'}
                </div>
              </div>

              <div className='pointer-card-soft p-3'>
                <div className='mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-slate-500'>
                  <Database className='h-3.5 w-3.5' />
                  SQLite
                  <InfoHint text='Versão reportada pelo motor SQLite e parâmetros relevantes de durabilidade e alocação.' />
                </div>
                <div className='text-xl font-semibold text-slate-100'>
                  {metrics ? metrics.sqliteVersion : '--'}
                </div>
                <div className='text-[11px] text-slate-500'>
                  {metrics ? journalModeLabel(metrics.journalMode) : '--'}
                </div>
              </div>
            </div>

            <div className='grid gap-3 xl:grid-cols-2'>
              <div className='pointer-card-soft p-3'>
                <div className='mb-2 flex items-center gap-1.5 text-[12px] font-medium text-slate-300'>
                  Saúde e fragmentação
                  <InfoHint text='Linha histórica das últimas coletas. Mostra o health score junto com a fragmentação do arquivo para detectar tendência de deterioração.' />
                </div>
                {hasHistory ? (
                  <ChartContainer config={sqliteTrendChartConfig} className='h-[220px] w-full'>
                    <LineChart
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
                      <YAxis tickLine={false} axisLine={false} width={34} domain={[0, 100]} />
                      <ChartTooltip
                        cursor={false}
                        content={
                          <ChartTooltipContent
                            formatter={(value, name) => {
                              if (name === 'fragmentationRatio') {
                                return `${formatMetric(typeof value === 'number' ? value : Number(value), 1)}%`
                              }

                              return formatMetric(typeof value === 'number' ? value : Number(value), 0)
                            }}
                          />
                        }
                      />
                      <Line
                        type='monotone'
                        dataKey='healthScore'
                        stroke='var(--color-healthScore)'
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type='monotone'
                        dataKey='fragmentationRatio'
                        stroke='var(--color-fragmentationRatio)'
                        strokeWidth={2}
                        strokeDasharray='4 4'
                        dot={false}
                      />
                    </LineChart>
                  </ChartContainer>
                ) : (
                  <div className='flex h-[220px] items-center justify-center text-slate-500'>Sem amostras ainda.</div>
                )}
              </div>

              <div className='pointer-card-soft p-3'>
                <div className='mb-2 flex items-center gap-1.5 text-[12px] font-medium text-slate-300'>
                  Perfil do arquivo
                  <InfoHint text='Contexto operacional do arquivo SQLite: journal_mode, synchronous, auto_vacuum, cache_size e contagem de objetos do schema.' />
                </div>
                <div className='mb-3 flex items-start justify-between gap-3'>
                  <div>
                    <p className='text-2xl font-semibold text-slate-100'>{healthScore}</p>
                    <p className='text-[11px] text-slate-400'>Score (0-100)</p>
                  </div>
                  <span className={`rounded-md border px-2 py-1 text-[11px] font-medium ${healthStatusClass(healthStatus)}`}>
                    {healthLabel}
                  </span>
                </div>

                <div className='grid gap-1.5 text-[12px] text-slate-300'>
                  {(metrics?.healthReasons ?? ['Aguardando primeira coleta do SQLite.']).map((reason) => (
                    <p key={reason} className='leading-snug'>
                      • {reason}
                    </p>
                  ))}
                </div>

                <div className='mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-400'>
                  <div className='rounded-md border border-slate-800/80 bg-slate-950/45 px-2 py-1.5'>
                    <p className='uppercase tracking-[0.12em] text-slate-500'>Journal mode</p>
                    <p className='mt-0.5 text-slate-200'>{metrics ? journalModeLabel(metrics.journalMode) : '--'}</p>
                  </div>
                  <div className='rounded-md border border-slate-800/80 bg-slate-950/45 px-2 py-1.5'>
                    <p className='uppercase tracking-[0.12em] text-slate-500'>Synchronous</p>
                    <p className='mt-0.5 text-slate-200'>
                      {metrics ? synchronousLabel(metrics.synchronousLevel) : '--'}
                    </p>
                  </div>
                  <div className='rounded-md border border-slate-800/80 bg-slate-950/45 px-2 py-1.5'>
                    <p className='uppercase tracking-[0.12em] text-slate-500'>Auto vacuum</p>
                    <p className='mt-0.5 text-slate-200'>
                      {metrics ? autoVacuumLabel(metrics.autoVacuumLevel) : '--'}
                    </p>
                  </div>
                  <div className='rounded-md border border-slate-800/80 bg-slate-950/45 px-2 py-1.5'>
                    <p className='uppercase tracking-[0.12em] text-slate-500'>Cache size</p>
                    <p className='mt-0.5 text-slate-200'>{metrics ? cacheSizeLabel(metrics.cacheSize) : '--'}</p>
                  </div>
                </div>

                <div className='mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-400'>
                  <div className='rounded-md border border-slate-800/80 bg-slate-950/45 px-2 py-1.5'>
                    <p className='uppercase tracking-[0.12em] text-slate-500'>SQLite</p>
                    <p className='mt-0.5 text-slate-200'>{metrics ? metrics.sqliteVersion : '--'}</p>
                  </div>
                  <div className='rounded-md border border-slate-800/80 bg-slate-950/45 px-2 py-1.5'>
                    <p className='uppercase tracking-[0.12em] text-slate-500'>Objetos</p>
                    <p className='mt-0.5 text-slate-200'>
                      {metrics
                        ? `${formatIntegerMetric(metrics.viewCount)} views • ${formatIntegerMetric(metrics.indexCount)} índices • ${formatIntegerMetric(metrics.triggerCount)} triggers`
                        : '--'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
