import { useCallback, useEffect, useRef } from 'react'
import { Activity, Database, Gauge, HardDrive, Info, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { Button } from '../../../components/ui/button'
import { ChartContainer, type ChartConfig, ChartTooltip, ChartTooltipContent } from '../../../components/ui/chart'
import type {
  DashboardTab,
  PostgresTableDashboardCounters,
  PostgresTableDashboardIndexPoint,
  PostgresTableDashboardTab,
} from '../../../entities/workspace/types'
import { pointerApi } from '../../../shared/api/pointer-api'
import { formatTableLabel, getErrorMessage } from '../../../shared/lib/workspace-utils'

const DASHBOARD_REFRESH_INTERVAL_MS = 30_000
const DASHBOARD_HISTORY_LIMIT = 120

type SnapshotSample = {
  collectedAt: string
  tableSizeBytes: number
  indexesSizeBytes: number
  totalSizeBytes: number
  estimatedRows: number
  deadRows: number
  seqScan: number
  idxScan: number
  lastVacuum: string | null
  lastAutovacuum: string | null
  lastAnalyze: string | null
  lastAutoanalyze: string | null
}

type PostgresTableDashboardPanelProps = {
  activeDashboardTab: PostgresTableDashboardTab
  updateDashboardTab: (tabId: string, updater: (tab: DashboardTab) => DashboardTab) => void
}

const scanTrendChartConfig = {
  seqScansPerMinute: {
    label: 'Seq scan/min',
    color: '#fb7185',
  },
  idxScansPerMinute: {
    label: 'Idx scan/min',
    color: '#38bdf8',
  },
} satisfies ChartConfig

function quoteSqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function buildPostgresTableDashboardSql(schema: string, table: string): string {
  const schemaLiteral = quoteSqlLiteral(schema)
  const tableLiteral = quoteSqlLiteral(table)

  return `
WITH target AS (
  SELECT c.oid AS relid
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = ${schemaLiteral}
    AND c.relname = ${tableLiteral}
    AND c.relkind IN ('r', 'p')
  LIMIT 1
)
SELECT
  now()::text AS collected_at,
  COALESCE(pg_relation_size(target.relid), 0)::bigint AS table_size_bytes,
  COALESCE(pg_indexes_size(target.relid), 0)::bigint AS indexes_size_bytes,
  COALESCE(pg_total_relation_size(target.relid), 0)::bigint AS total_size_bytes,
  COALESCE(stat.n_live_tup, 0)::bigint AS n_live_tup,
  COALESCE(stat.n_dead_tup, 0)::bigint AS n_dead_tup,
  COALESCE(stat.seq_scan, 0)::bigint AS seq_scan,
  COALESCE(stat.idx_scan, 0)::bigint AS idx_scan,
  stat.last_vacuum::text AS last_vacuum,
  stat.last_autovacuum::text AS last_autovacuum,
  stat.last_analyze::text AS last_analyze,
  stat.last_autoanalyze::text AS last_autoanalyze
FROM target
LEFT JOIN pg_stat_user_tables stat ON stat.relid = target.relid;

WITH target AS (
  SELECT c.oid AS relid
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = ${schemaLiteral}
    AND c.relname = ${tableLiteral}
    AND c.relkind IN ('r', 'p')
  LIMIT 1
)
SELECT
  idx.relname AS index_name,
  pg_get_indexdef(i.indexrelid) AS index_definition,
  i.indisprimary AS is_primary,
  i.indisunique AS is_unique,
  COALESCE(pg_relation_size(i.indexrelid), 0)::bigint AS index_size_bytes,
  COALESCE(stat.idx_scan, 0)::bigint AS idx_scan,
  COALESCE(stat.idx_tup_read, 0)::bigint AS idx_tup_read,
  COALESCE(stat.idx_tup_fetch, 0)::bigint AS idx_tup_fetch
FROM target
JOIN pg_index i ON i.indrelid = target.relid
JOIN pg_class idx ON idx.oid = i.indexrelid
LEFT JOIN pg_stat_user_indexes stat ON stat.indexrelid = i.indexrelid
ORDER BY i.indisprimary DESC, stat.idx_scan DESC NULLS LAST, idx.relname ASC;
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

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return normalized === 'true' || normalized === 't' || normalized === '1'
  }

  if (typeof value === 'number') {
    return value !== 0
  }

  return false
}

function toOptionalText(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  return null
}

function parseSnapshotRow(row: Record<string, unknown> | undefined): SnapshotSample | null {
  if (!row) {
    return null
  }

  const collectedAt = toOptionalText(row.collected_at) ?? new Date().toISOString()
  const tableSizeBytes = toNumber(row.table_size_bytes)
  const indexesSizeBytes = toNumber(row.indexes_size_bytes)
  const totalSizeBytes = toNumber(row.total_size_bytes)
  const estimatedRows = toNumber(row.n_live_tup)
  const deadRows = toNumber(row.n_dead_tup)
  const seqScan = toNumber(row.seq_scan)
  const idxScan = toNumber(row.idx_scan)

  if (
    tableSizeBytes === null ||
    indexesSizeBytes === null ||
    totalSizeBytes === null ||
    estimatedRows === null ||
    deadRows === null ||
    seqScan === null ||
    idxScan === null
  ) {
    return null
  }

  return {
    collectedAt,
    tableSizeBytes,
    indexesSizeBytes,
    totalSizeBytes,
    estimatedRows,
    deadRows,
    seqScan,
    idxScan,
    lastVacuum: toOptionalText(row.last_vacuum),
    lastAutovacuum: toOptionalText(row.last_autovacuum),
    lastAnalyze: toOptionalText(row.last_analyze),
    lastAutoanalyze: toOptionalText(row.last_autoanalyze),
  }
}

function parseIndexRows(rows: Record<string, unknown>[]): PostgresTableDashboardIndexPoint[] {
  return rows
    .map((row) => ({
      name: toOptionalText(row.index_name) ?? 'index',
      definition: toOptionalText(row.index_definition) ?? '--',
      isPrimary: toBoolean(row.is_primary),
      isUnique: toBoolean(row.is_unique),
      sizeBytes: toNumber(row.index_size_bytes) ?? 0,
      scans: toNumber(row.idx_scan) ?? 0,
      tuplesRead: toNumber(row.idx_tup_read) ?? 0,
      tuplesFetch: toNumber(row.idx_tup_fetch) ?? 0,
    }))
    .sort((left, right) => right.scans - left.scans || right.sizeBytes - left.sizeBytes || left.name.localeCompare(right.name))
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

function computeScansPerMinute(previous: PostgresTableDashboardCounters | null, current: PostgresTableDashboardCounters): {
  seq: number | null
  idx: number | null
} {
  if (!previous) {
    return {
      seq: null,
      idx: null,
    }
  }

  const previousAt = new Date(previous.collectedAt).getTime()
  const currentAt = new Date(current.collectedAt).getTime()
  if (!Number.isFinite(previousAt) || !Number.isFinite(currentAt) || currentAt <= previousAt) {
    return {
      seq: null,
      idx: null,
    }
  }

  const deltaSeconds = (currentAt - previousAt) / 1_000
  if (deltaSeconds <= 0) {
    return {
      seq: null,
      idx: null,
    }
  }

  const seqDelta = current.seqScan - previous.seqScan
  const idxDelta = current.idxScan - previous.idxScan

  return {
    seq: seqDelta >= 0 ? (seqDelta / deltaSeconds) * 60 : null,
    idx: idxDelta >= 0 ? (idxDelta / deltaSeconds) * 60 : null,
  }
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

export function PostgresTableDashboardPanel({
  activeDashboardTab,
  updateDashboardTab,
}: PostgresTableDashboardPanelProps): JSX.Element {
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
      const sql = buildPostgresTableDashboardSql(targetTable.schema, targetTable.name)
      const result = await pointerApi.executeSql(connectionId, sql)
      const snapshot = parseSnapshotRow(result.resultSets[0]?.rows?.[0])
      const indexes = parseIndexRows(result.resultSets[1]?.rows ?? [])

      if (!snapshot) {
        throw new Error('Não foi possível carregar as métricas da tabela no Postgres.')
      }

      if (requestSeq !== requestSeqRef.current || tabId !== tabIdRef.current) {
        return
      }

      updateDashboardTabRef.current(tabId, (tab) => {
        const currentTab = tab as PostgresTableDashboardTab
        const nextCounters: PostgresTableDashboardCounters = {
          collectedAt: snapshot.collectedAt,
          seqScan: snapshot.seqScan,
          idxScan: snapshot.idxScan,
        }

        const scans = computeScansPerMinute(currentTab.lastCounters, nextCounters)
        const deadRatioDenominator = snapshot.estimatedRows + snapshot.deadRows
        const deadRatio = deadRatioDenominator > 0 ? (snapshot.deadRows / deadRatioDenominator) * 100 : null
        const totalScans = snapshot.seqScan + snapshot.idxScan
        const indexUsageRatio = totalScans > 0 ? (snapshot.idxScan / totalScans) * 100 : null

        return {
          ...currentTab,
          loading: false,
          loadError: null,
          lastUpdatedAt: snapshot.collectedAt,
          indexes,
          metrics: {
            collectedAt: snapshot.collectedAt,
            tableSizeBytes: snapshot.tableSizeBytes,
            indexesSizeBytes: snapshot.indexesSizeBytes,
            totalSizeBytes: snapshot.totalSizeBytes,
            estimatedRows: snapshot.estimatedRows,
            deadRows: snapshot.deadRows,
            deadRatio,
            seqScan: snapshot.seqScan,
            idxScan: snapshot.idxScan,
            indexUsageRatio,
            seqScansPerMinute: scans.seq,
            idxScansPerMinute: scans.idx,
            lastVacuum: snapshot.lastVacuum,
            lastAutovacuum: snapshot.lastAutovacuum,
            lastAnalyze: snapshot.lastAnalyze,
            lastAutoanalyze: snapshot.lastAutoanalyze,
          },
          history: [
            ...currentTab.history,
            {
              timeLabel: formatTimeLabel(snapshot.collectedAt),
              seqScansPerMinute: scans.seq ?? 0,
              idxScansPerMinute: scans.idx ?? 0,
              indexUsageRatio,
            },
          ].slice(-DASHBOARD_HISTORY_LIMIT),
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
            Carregando métricas da tabela no Postgres...
          </div>
        ) : (
          <div className='space-y-3'>
            <div className='grid gap-2 md:grid-cols-2 xl:grid-cols-6'>
              <div className='pointer-card-soft p-3'>
                <div className='mb-0.5 flex min-w-0 items-center gap-1.5 text-[11px] leading-tight uppercase tracking-[0.14em] text-slate-500'>
                  <HardDrive className='h-3.5 w-3.5' />
                  <span className='min-w-0 flex-1 truncate' title='Armazenamento'>
                    Armazenamento
                  </span>
                  <InfoHint text='Soma de dados + índices da tabela em disco.' />
                </div>
                <div className='text-xl font-semibold text-slate-100'>
                  {metrics ? formatBytes(metrics.totalSizeBytes) : '--'}
                </div>
                <div className='text-[11px] text-slate-500'>Atual: tabela + índices</div>
              </div>

              <div className='pointer-card-soft p-3'>
                <div className='mb-0.5 flex min-w-0 items-center gap-1.5 text-[11px] leading-tight uppercase tracking-[0.14em] text-slate-500'>
                  <Database className='h-3.5 w-3.5' />
                  <span className='min-w-0 truncate' title='Dados da tabela'>
                    Dados da tabela
                  </span>
                </div>
                <div className='text-xl font-semibold text-slate-100'>
                  {metrics ? formatBytes(metrics.tableSizeBytes) : '--'}
                </div>
                <div className='text-[11px] text-slate-500'>Somente heap/dados</div>
              </div>

              <div className='pointer-card-soft p-3'>
                <div className='mb-0.5 flex min-w-0 items-center gap-1.5 text-[11px] leading-tight uppercase tracking-[0.14em] text-slate-500'>
                  <Database className='h-3.5 w-3.5' />
                  <span className='min-w-0 truncate' title='Índices'>
                    Índices
                  </span>
                </div>
                <div className='text-xl font-semibold text-slate-100'>
                  {metrics ? formatBytes(metrics.indexesSizeBytes) : '--'}
                </div>
                <div className='text-[11px] text-slate-500'>{activeDashboardTab.indexes.length} índices</div>
              </div>

              <div className='pointer-card-soft p-3'>
                <div className='mb-0.5 flex min-w-0 items-center gap-1.5 text-[11px] leading-tight uppercase tracking-[0.14em] text-slate-500'>
                  <Activity className='h-3.5 w-3.5' />
                  <span className='min-w-0 truncate' title='Linhas estimadas'>
                    Linhas estimadas
                  </span>
                </div>
                <div className='text-xl font-semibold text-slate-100'>
                  {metrics ? formatMetric(metrics.estimatedRows, 0) : '--'}
                </div>
                <div className='text-[11px] text-slate-500'>Dead: {metrics ? formatMetric(metrics.deadRows, 0) : '--'}</div>
              </div>

              <div className='pointer-card-soft p-3'>
                <div className='mb-0.5 flex min-w-0 items-center gap-1.5 text-[11px] leading-tight uppercase tracking-[0.14em] text-slate-500'>
                  <Gauge className='h-3.5 w-3.5' />
                  <span className='min-w-0 flex-1 truncate' title='Uso de índices'>
                    Uso de índices
                  </span>
                  <InfoHint text='Participação de idx_scan no total de scans acumulados da tabela.' />
                </div>
                <div className='text-xl font-semibold text-slate-100'>
                  {metrics?.indexUsageRatio !== null && metrics?.indexUsageRatio !== undefined
                    ? `${formatMetric(metrics.indexUsageRatio, 1)}%`
                    : '--'}
                </div>
                <div className='text-[11px] text-slate-500'>
                  Seq: {metrics ? formatMetric(metrics.seqScan, 0) : '--'} • Idx: {metrics ? formatMetric(metrics.idxScan, 0) : '--'}
                </div>
              </div>

              <div className='pointer-card-soft p-3'>
                <div className='mb-0.5 flex min-w-0 items-center gap-1.5 text-[11px] leading-tight uppercase tracking-[0.14em] text-slate-500'>
                  <Gauge className='h-3.5 w-3.5' />
                  <span className='min-w-0 flex-1 truncate' title='Dead ratio'>
                    Dead ratio
                  </span>
                  <InfoHint text='Percentual de tuples mortas em relação ao total estimado da tabela.' />
                </div>
                <div className='text-xl font-semibold text-slate-100'>
                  {metrics?.deadRatio !== null && metrics?.deadRatio !== undefined
                    ? `${formatMetric(metrics.deadRatio, 1)}%`
                    : '--'}
                </div>
                <div className='text-[11px] text-slate-500'>Vacuum e analyze no painel lateral</div>
              </div>
            </div>

            <div className='grid gap-3 xl:grid-cols-2'>
              <div className='pointer-card-soft p-3'>
                <div className='mb-2 flex items-center gap-1.5 text-[12px] font-medium text-slate-300'>
                  Tendência de scan (1h)
                  <InfoHint text='Taxa por minuto calculada pelo delta entre coletas de seq_scan e idx_scan do pg_stat_user_tables.' />
                </div>
                {activeDashboardTab.history.length > 0 ? (
                  <ChartContainer config={scanTrendChartConfig} className='h-[220px] w-full'>
                    <LineChart data={activeDashboardTab.history} accessibilityLayer={false} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey='timeLabel' tickLine={false} axisLine={false} minTickGap={18} />
                      <YAxis tickLine={false} axisLine={false} width={40} />
                      <ChartTooltip
                        cursor={false}
                        content={<ChartTooltipContent formatter={(value) => formatMetric(typeof value === 'number' ? value : Number(value), 2)} />}
                      />
                      <Line type='monotone' dataKey='seqScansPerMinute' stroke='var(--color-seqScansPerMinute)' strokeWidth={2} dot={false} />
                      <Line type='monotone' dataKey='idxScansPerMinute' stroke='var(--color-idxScansPerMinute)' strokeWidth={2} dot={false} />
                    </LineChart>
                  </ChartContainer>
                ) : (
                  <div className='flex h-[220px] items-center justify-center text-slate-500'>Sem amostras ainda.</div>
                )}
              </div>

              <div className='pointer-card-soft p-3'>
                <div className='mb-2 flex items-center gap-1.5 text-[12px] font-medium text-slate-300'>
                  Manutenção
                  <InfoHint text='Últimos eventos de vacuum/analyze registrados para a tabela no Postgres.' />
                </div>
                <div className='grid grid-cols-2 gap-2 text-[11px] text-slate-400'>
                  <div className='rounded-md border border-slate-800/80 bg-slate-950/45 px-2 py-1.5'>
                    <p className='uppercase tracking-[0.12em] text-slate-500'>Last vacuum</p>
                    <p className='mt-0.5 text-slate-200'>{formatTimestamp(metrics?.lastVacuum ?? null)}</p>
                  </div>
                  <div className='rounded-md border border-slate-800/80 bg-slate-950/45 px-2 py-1.5'>
                    <p className='uppercase tracking-[0.12em] text-slate-500'>Last autovacuum</p>
                    <p className='mt-0.5 text-slate-200'>{formatTimestamp(metrics?.lastAutovacuum ?? null)}</p>
                  </div>
                  <div className='rounded-md border border-slate-800/80 bg-slate-950/45 px-2 py-1.5'>
                    <p className='uppercase tracking-[0.12em] text-slate-500'>Last analyze</p>
                    <p className='mt-0.5 text-slate-200'>{formatTimestamp(metrics?.lastAnalyze ?? null)}</p>
                  </div>
                  <div className='rounded-md border border-slate-800/80 bg-slate-950/45 px-2 py-1.5'>
                    <p className='uppercase tracking-[0.12em] text-slate-500'>Last autoanalyze</p>
                    <p className='mt-0.5 text-slate-200'>{formatTimestamp(metrics?.lastAutoanalyze ?? null)}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className='pointer-card-soft p-3'>
              <div className='mb-2 flex items-center gap-1.5 text-[12px] font-medium text-slate-300'>
                Índices da tabela
                <InfoHint text='Lista de índices com tamanho, scans e definição SQL para diagnóstico de cobertura e custo de armazenamento.' />
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
                        <th className='px-2 py-1 font-medium'>Tipo</th>
                        <th className='px-2 py-1 font-medium'>Tamanho</th>
                        <th className='px-2 py-1 font-medium'>Scans</th>
                        <th className='px-2 py-1 font-medium'>Definição</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeDashboardTab.indexes.map((index) => (
                        <tr key={index.name} className='border-t border-slate-800/70 text-slate-300'>
                          <td className='px-2 py-1.5 font-medium text-slate-200'>{index.name}</td>
                          <td className='px-2 py-1.5'>
                            {index.isPrimary ? 'Primary' : index.isUnique ? 'Unique' : 'Index'}
                          </td>
                          <td className='px-2 py-1.5'>{formatBytes(index.sizeBytes)}</td>
                          <td className='px-2 py-1.5'>{formatMetric(index.scans, 0)}</td>
                          <td className='max-w-[520px] truncate px-2 py-1.5 text-slate-400' title={index.definition}>
                            {index.definition}
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
