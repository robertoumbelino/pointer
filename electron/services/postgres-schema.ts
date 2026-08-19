import type { TableRef, TableSchema } from '../../shared/db-types'

export type PostgresColumnMetadataRow = {
  column_name: string
  data_type: string
  is_nullable: 'YES' | 'NO'
  column_default: string | null
  udt_name: string
}

export const POSTGRES_PRIMARY_KEY_COLUMNS_SQL = `
  SELECT attribute.attname AS column_name
  FROM pg_catalog.pg_constraint AS constraint_info
  CROSS JOIN LATERAL unnest(constraint_info.conkey)
    WITH ORDINALITY AS key_column(attnum, position)
  JOIN pg_catalog.pg_attribute AS attribute
    ON attribute.attrelid = constraint_info.conrelid
   AND attribute.attnum = key_column.attnum
  JOIN pg_catalog.pg_class AS table_info
    ON table_info.oid = constraint_info.conrelid
  JOIN pg_catalog.pg_namespace AS namespace_info
    ON namespace_info.oid = table_info.relnamespace
  WHERE constraint_info.contype = 'p'
    AND namespace_info.nspname = $1
    AND table_info.relname = $2
  ORDER BY key_column.position ASC
`

export function createPostgresTableColumnSchema(
  table: TableRef,
  rows: PostgresColumnMetadataRow[],
  primaryKey: string[],
): TableSchema {
  const primaryKeySet = new Set(primaryKey)

  return {
    table,
    columns: rows.map((row) => ({
      name: row.column_name,
      dataType: row.data_type === 'USER-DEFINED' ? row.udt_name : row.data_type,
      nullable: row.is_nullable === 'YES',
      defaultValue: row.column_default,
      isPrimaryKey: primaryKeySet.has(row.column_name),
    })),
    primaryKey,
    engine: 'postgres',
    supportsRowEdit: primaryKey.length > 0,
  }
}
