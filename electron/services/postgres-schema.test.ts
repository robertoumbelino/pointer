import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  createPostgresTableColumnSchema,
  POSTGRES_PRIMARY_KEY_COLUMNS_SQL,
  type PostgresColumnMetadataRow,
} from './postgres-schema.ts'

const table = {
  schema: 'public',
  name: 'customers',
  fqName: 'public.customers',
}

const dbServiceSource = readFileSync(new URL('./db-service.ts', import.meta.url), 'utf8')

function dbServiceMethodSource(methodName: string, nextMethodName: string): string {
  const start = dbServiceSource.indexOf(`private async ${methodName}`)
  const end = dbServiceSource.indexOf(`\n  private async ${nextMethodName}`, start)

  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  return dbServiceSource.slice(start, end)
}

const columns: PostgresColumnMetadataRow[] = [
  {
    column_name: 'tenant_id',
    data_type: 'uuid',
    is_nullable: 'NO',
    column_default: null,
    udt_name: 'uuid',
  },
  {
    column_name: 'id',
    data_type: 'bigint',
    is_nullable: 'NO',
    column_default: null,
    udt_name: 'int8',
  },
  {
    column_name: 'name',
    data_type: 'text',
    is_nullable: 'YES',
    column_default: null,
    udt_name: 'text',
  },
]

test('fast Postgres schema exposes a composite primary key for row editing', () => {
  const schema = createPostgresTableColumnSchema(table, columns, ['tenant_id', 'id'])

  assert.deepEqual(schema.primaryKey, ['tenant_id', 'id'])
  assert.equal(schema.supportsRowEdit, true)
  assert.deepEqual(
    schema.columns.map((column) => [column.name, column.isPrimaryKey]),
    [
      ['tenant_id', true],
      ['id', true],
      ['name', false],
    ],
  )
})

test('fast Postgres schema keeps row editing disabled when the table has no primary key', () => {
  const schema = createPostgresTableColumnSchema(table, columns, [])

  assert.equal(schema.supportsRowEdit, false)
  assert.equal(schema.columns.some((column) => column.isPrimaryKey), false)
})

test('primary key lookup uses the native Postgres catalog and preserves key order', () => {
  assert.match(POSTGRES_PRIMARY_KEY_COLUMNS_SQL, /pg_catalog\.pg_constraint/)
  assert.match(POSTGRES_PRIMARY_KEY_COLUMNS_SQL, /WITH ORDINALITY/)
  assert.match(POSTGRES_PRIMARY_KEY_COLUMNS_SQL, /namespace_info\.nspname = \$1/)
  assert.match(POSTGRES_PRIMARY_KEY_COLUMNS_SQL, /table_info\.relname = \$2/)
  assert.match(POSTGRES_PRIMARY_KEY_COLUMNS_SQL, /ORDER BY key_column\.position ASC/)
  assert.doesNotMatch(POSTGRES_PRIMARY_KEY_COLUMNS_SQL, /information_schema/)
  assert.doesNotMatch(POSTGRES_PRIMARY_KEY_COLUMNS_SQL, /format\(/)
  assert.doesNotMatch(POSTGRES_PRIMARY_KEY_COLUMNS_SQL, /to_regclass/)
})

test('Postgres updates use the cached lightweight schema instead of the full table description', () => {
  const updateMethod = dbServiceMethodSource('updatePostgresRow', 'deletePostgresRow')
  const listColumnsMethod = dbServiceMethodSource('listPostgresTableColumns', 'listPostgresPrimaryKeyColumns')

  assert.match(updateMethod, /this\.listPostgresTableColumns\(/)
  assert.doesNotMatch(updateMethod, /this\.describePostgresTable\(/)
  assert.match(listColumnsMethod, /this\.postgresTableColumnSchemas\.get\(/)
  assert.match(listColumnsMethod, /this\.postgresTableColumnSchemas\.set\(/)
})
