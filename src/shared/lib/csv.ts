const CSV_DELIMITER = ','
const CSV_LINE_BREAK = '\r\n'

function normalizeCsvCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  return String(value)
}

function escapeCsvCell(value: string): string {
  const needsQuotes =
    value.includes(CSV_DELIMITER) ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r')

  if (!needsQuotes) {
    return value
  }

  return `"${value.replace(/"/g, '""')}"`
}

export function buildCsvContent(columns: string[], rows: Record<string, unknown>[]): string {
  const header = columns.map((column) => escapeCsvCell(column)).join(CSV_DELIMITER)
  const bodyLines = rows.map((row) =>
    columns
      .map((column) => escapeCsvCell(normalizeCsvCellValue(row[column])))
      .join(CSV_DELIMITER),
  )

  return [header, ...bodyLines].join(CSV_LINE_BREAK)
}
