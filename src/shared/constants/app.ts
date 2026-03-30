export const PAGE_SIZE = 100
export const TABLE_PAGE_SIZE_MAX = 500
export const SQL_RESULT_RENDER_MAX_ROWS = 50_000
export const AUTO_SQL_CONNECTION_ID = '__auto__'
export const DEFAULT_SQL = 'SELECT NOW() AS current_time;\n\n\n\n\n\n\n\n\n'
export const DEFAULT_ENVIRONMENT_COLOR = '#0EA5E9'
export const WORKSPACE_STORAGE_KEY = 'pointer.workspace.v1'
export const CHANGELOG_LAST_SEEN_VERSION_KEY = 'pointer.changelog.lastSeenVersion.v1'

export const ENVIRONMENT_COLOR_PRESETS = [
  '#0EA5E9',
  '#22C55E',
  '#EF4444',
  '#F59E0B',
  '#8B5CF6',
  '#EC4899',
] as const

export const SIDEBAR_SECTION_LABEL_CLASS =
  'mb-1.5 block text-[11px] leading-none font-semibold uppercase tracking-[0.18em] text-slate-500'
