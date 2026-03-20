import * as React from 'react'
import * as RechartsPrimitive from 'recharts'
import { cn } from '../../lib/utils'

const THEMES = { light: '', dark: '.dark' } as const

export type ChartConfig = {
  [key: string]: {
    label?: React.ReactNode
    icon?: React.ComponentType
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof THEMES, string> }
  )
}

type ChartContextProps = {
  config: ChartConfig
}

const ChartContext = React.createContext<ChartContextProps | null>(null)

function useChart(): ChartContextProps {
  const context = React.useContext(ChartContext)
  if (!context) {
    throw new Error('useChart must be used within a <ChartContainer />')
  }

  return context
}

function buildChartStyle(config: ChartConfig): React.CSSProperties {
  const style: Record<string, string> = {}
  for (const [key, item] of Object.entries(config)) {
    const color = item.theme?.light ?? item.color
    if (color) {
      style[`--color-${key}`] = color
    }

    const darkColor = item.theme?.dark
    if (darkColor) {
      style[`--color-${key}-dark`] = darkColor
    }
  }

  return style as React.CSSProperties
}

export function ChartContainer({
  id,
  className,
  children,
  config,
  onMouseDown,
  ...props
}: React.ComponentProps<'div'> & {
  config: ChartConfig
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>['children']
}): JSX.Element {
  const uniqueId = React.useId()
  const chartId = `chart-${id ?? uniqueId.replace(/:/g, '')}`

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart={chartId}
        className={cn(
          'flex aspect-video select-none justify-center text-xs [&_.recharts-accessibility-layer]:hidden [&_.recharts-cartesian-axis-tick_text]:fill-slate-400 [&_.recharts-cartesian-grid_line]:stroke-slate-800/80 [&_.recharts-polar-grid_[stroke="#ccc"]]:stroke-slate-800/80 [&_.recharts-reference-line_[stroke="#ccc"]]:stroke-slate-800/80 [&_.recharts-sector]:outline-none [&_.recharts-surface]:outline-none [&_.recharts-wrapper]:outline-none [&_.recharts-wrapper:focus]:outline-none [&_.recharts-wrapper:focus-visible]:outline-none [&_.recharts-tooltip-cursor]:hidden [&_*:focus]:outline-none [&_*:focus-visible]:outline-none',
          className,
        )}
        style={buildChartStyle(config)}
        onMouseDown={(event) => {
          onMouseDown?.(event)
          const target = event.target
          if (target instanceof Element && target.closest('.recharts-wrapper')) {
            event.preventDefault()
          }
        }}
        {...props}
      >
        <style>{`
          ${Object.entries(THEMES)
            .map(
              ([theme, prefix]) => `
${prefix} [data-chart=${chartId}] {
  ${Object.entries(config)
    .map(([key, item]) => {
      const color = item.theme?.[theme as keyof typeof item.theme] ?? item.color
      return color ? `--color-${key}: ${color};` : null
    })
    .filter(Boolean)
    .join('\n')}
}
`,
            )
            .join('\n')}
        `}</style>
        <RechartsPrimitive.ResponsiveContainer>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
}

export const ChartTooltip = RechartsPrimitive.Tooltip

type ChartTooltipPayloadItem = {
  value?: unknown
  name?: string
  dataKey?: string | number
  color?: string
  payload?: Record<string, unknown>
}

type ChartTooltipContentProps = {
  active?: boolean
  payload?: ChartTooltipPayloadItem[]
  className?: string
  hideLabel?: boolean
  hideIndicator?: boolean
  indicator?: 'line' | 'dot'
  nameKey?: string
  labelKey?: string
  label?: React.ReactNode
  color?: string
  formatter?: (
    value: unknown,
    name: string | number | undefined,
    item: ChartTooltipPayloadItem,
    index: number,
    payload: Record<string, unknown> | undefined,
  ) => React.ReactNode
  labelFormatter?: (label: React.ReactNode, payload: ChartTooltipPayloadItem[]) => React.ReactNode
}

function getPayloadItemConfig(
  config: ChartConfig,
  payload: unknown,
  key: string,
): ChartConfig[string] | undefined {
  if (!payload || typeof payload !== 'object') {
    return config[key]
  }

  const payloadRecord = payload as Record<string, unknown>

  const payloadConfigKey =
    (typeof payloadRecord[key] === 'string' ? payloadRecord[key] : undefined) ||
    (typeof payloadRecord.name === 'string' ? payloadRecord.name : undefined) ||
    (typeof payloadRecord.dataKey === 'string' ? payloadRecord.dataKey : undefined)

  if (payloadConfigKey && payloadConfigKey in config) {
    return config[payloadConfigKey]
  }

  return config[key]
}

export function ChartTooltipContent({
  active,
  payload,
  className,
  indicator = 'dot',
  hideLabel = false,
  hideIndicator = false,
  label,
  labelFormatter,
  formatter,
  color,
  nameKey,
  labelKey,
}: ChartTooltipContentProps): JSX.Element | null {
  const { config } = useChart()

  if (!active || !payload?.length) {
    return null
  }

  const tooltipLabel = !hideLabel
    ? (() => {
        const [item] = payload
        const itemKey = `${labelKey ?? item?.dataKey ?? item?.name ?? 'value'}`
        const itemConfig = getPayloadItemConfig(config, item?.payload, itemKey)
        const value = itemConfig?.label ?? label

        if (labelFormatter) {
          return <div className='font-medium text-slate-100'>{labelFormatter(value, payload)}</div>
        }

        if (!value) {
          return null
        }

        return <div className='font-medium text-slate-100'>{value}</div>
      })()
    : null

  return (
    <div className={cn('grid min-w-[150px] gap-1.5 rounded-lg border border-slate-700/80 bg-slate-950/95 px-2.5 py-2 text-xs shadow-xl', className)}>
      {tooltipLabel}
      <div className='grid gap-1'>
        {payload.map((item: ChartTooltipPayloadItem, index: number) => {
          const itemKey = `${nameKey ?? item.name ?? item.dataKey ?? 'value'}`
          const itemConfig = getPayloadItemConfig(config, item.payload, itemKey)
          const payloadFill = item.payload?.fill
          const indicatorColor =
            (typeof color === 'string' && color) ||
            (typeof payloadFill === 'string' && payloadFill) ||
            (typeof item.color === 'string' && item.color) ||
            undefined

          return (
            <div key={`${itemKey}-${index}`} className='flex items-center justify-between gap-2 text-slate-200'>
              <div className='flex items-center gap-1.5'>
                {!hideIndicator && (
                  <span
                    className={cn(
                      'inline-block shrink-0 rounded-full',
                      indicator === 'dot' ? 'h-2 w-2' : 'h-[2px] w-3',
                    )}
                    style={{ backgroundColor: indicatorColor }}
                  />
                )}
                <span>{itemConfig?.label ?? item.name}</span>
              </div>
              <span className='font-mono tabular-nums'>
                {formatter
                  ? formatter(item.value, item.name, item, index, item.payload)
                  : typeof item.value === 'number'
                    ? item.value.toLocaleString('pt-BR')
                    : `${item.value ?? ''}`}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
