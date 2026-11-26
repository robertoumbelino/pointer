import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./db-service.ts', import.meta.url), 'utf8')

test('ClickHouse table pages project catalog columns so materialized values are returned', () => {
  const start = source.indexOf('private async readClickHouseTable(')
  const end = source.indexOf('private async readSqliteTable(', start)
  assert.ok(start >= 0 && end > start)

  const readTable = source.slice(start, end)
  assert.match(readTable, /const schema = await this\.listClickHouseTableColumns\(connection, table\)/)
  assert.match(readTable, /const projection = columns\.map\(quoteClickHouseIdentifier\)\.join\(', '\)/)
  assert.match(readTable, /SELECT \$\{projection\}/)
  assert.doesNotMatch(readTable, /SELECT \*\s+FROM/)
})
