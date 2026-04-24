function pickJsonRowColumns(columns: string[], row: Record<string, unknown>): Record<string, unknown> {
  return columns.reduce<Record<string, unknown>>((exportRow, column) => {
    const value = row[column]
    exportRow[column] = value === undefined ? null : value
    return exportRow
  }, {})
}

export function buildJsonContent(columns: string[], rows: Record<string, unknown>[]): string {
  return `${JSON.stringify(
    rows.map((row) => pickJsonRowColumns(columns, row)),
    null,
    2,
  )}\n`
}
