import { randomUUID } from 'node:crypto'
import { createClient, type ClickHouseClient } from '@clickhouse/client'
import BetterSqlite3 from 'better-sqlite3'
import Store from 'electron-store'
import keytar from 'keytar'
import { Pool, type QueryResult } from 'pg'
import type {
  ColumnDef,
  ConnectionInput,
  ConnectionSummary,
  DatabaseEngine,
  EnvironmentSummary,
  RiskLevel,
  SchemaInfo,
  SqlExecutionResult,
  SqlPreviewRiskResult,
  SqlResultSet,
  TableFilter,
  TableReadInput,
  TableReadResult,
  TableRef,
  TableSchema,
  TableSearchHit,
  TableSort,
} from '../../shared/db-types'

type PointerStoreShape = {
  environments: EnvironmentSummary[]
  connections: ConnectionSummary[]
}

const ENVIRONMENTS_KEY = 'environments'
const CONNECTIONS_KEY = 'connections'
const CREDENTIAL_SERVICE = 'pointer-db-explorer'
const DEFAULT_ENVIRONMENT_COLOR = '#0EA5E9'

export class DbService {
  private readonly store = new Store<PointerStoreShape>({
    name: 'pointer-store',
    defaults: {
      [ENVIRONMENTS_KEY]: [],
      [CONNECTIONS_KEY]: [],
    },
  })

  private readonly pgPools = new Map<string, Pool>()
  private readonly clickhouseClients = new Map<string, ClickHouseClient>()
  private readonly sqliteClients = new Map<string, BetterSqlite3.Database>()

  constructor() {
    this.migrateLegacyStore()
  }

  async listEnvironments(): Promise<EnvironmentSummary[]> {
    return this.getNormalizedEnvironments().sort((a, b) => a.name.localeCompare(b.name))
  }

  async createEnvironment(name: string, color?: string): Promise<EnvironmentSummary> {
    const trimmedName = name.trim()
    if (!trimmedName) {
      throw new Error('Nome do ambiente é obrigatório.')
    }

    const environments = this.getNormalizedEnvironments()
    if (environments.some((environment) => environment.name.toLowerCase() === trimmedName.toLowerCase())) {
      throw new Error('Já existe um ambiente com este nome.')
    }

    const environment: EnvironmentSummary = {
      id: randomUUID(),
      name: trimmedName,
      color: normalizeEnvironmentColor(color),
      createdAt: new Date().toISOString(),
    }

    environments.push(environment)
    this.store.set(ENVIRONMENTS_KEY, environments)
    return environment
  }

  async updateEnvironment(id: string, name: string, color?: string): Promise<EnvironmentSummary> {
    const trimmedName = name.trim()
    if (!trimmedName) {
      throw new Error('Nome do ambiente é obrigatório.')
    }

    const environments = this.getNormalizedEnvironments()
    const current = environments.find((environment) => environment.id === id)
    if (!current) {
      throw new Error('Ambiente não encontrado.')
    }

    const duplicated = environments.some(
      (environment) => environment.id !== id && environment.name.toLowerCase() === trimmedName.toLowerCase(),
    )
    if (duplicated) {
      throw new Error('Já existe um ambiente com este nome.')
    }

    const updated: EnvironmentSummary = {
      ...current,
      name: trimmedName,
      color: normalizeEnvironmentColor(color),
    }

    this.store.set(
      ENVIRONMENTS_KEY,
      environments.map((environment) => (environment.id === id ? updated : environment)),
    )

    return updated
  }

  async deleteEnvironment(id: string): Promise<void> {
    const environments = this.getNormalizedEnvironments()
    if (!environments.some((environment) => environment.id === id)) {
      throw new Error('Ambiente não encontrado.')
    }

    const remaining = environments.filter((environment) => environment.id !== id)
    this.store.set(ENVIRONMENTS_KEY, remaining)

    const removedConnections = this.store
      .get(CONNECTIONS_KEY, [])
      .filter((connection) => connection.environmentId === id)

    this.store.set(
      CONNECTIONS_KEY,
      this.store.get(CONNECTIONS_KEY, []).filter((connection) => connection.environmentId !== id),
    )

    for (const connection of removedConnections) {
      await this.destroyConnectionClient(connection)
      await keytar.deletePassword(CREDENTIAL_SERVICE, connection.id)
    }
  }

  async listConnections(environmentId: string): Promise<ConnectionSummary[]> {
    this.assertEnvironmentExists(environmentId)

    return this.store
      .get(CONNECTIONS_KEY, [])
      .filter((connection) => connection.environmentId === environmentId)
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  async createConnection(input: ConnectionInput): Promise<ConnectionSummary> {
    this.assertEnvironmentExists(input.environmentId)

    const connection: ConnectionSummary = {
      id: randomUUID(),
      environmentId: input.environmentId,
      engine: input.engine,
      name: input.name.trim(),
      filePath: input.filePath.trim(),
      host: input.host.trim(),
      port: sanitizePort(input.port),
      database: input.database.trim(),
      user: input.user.trim(),
      sslMode: input.sslMode,
      createdAt: new Date().toISOString(),
    }

    if (!connection.name) {
      throw new Error('Preencha o nome da conexão.')
    }

    if (connection.engine === 'sqlite') {
      if (!connection.filePath) {
        throw new Error('Selecione o arquivo do banco SQLite.')
      }
    } else if (!connection.host || !connection.database || !connection.user) {
      throw new Error('Preencha os campos obrigatórios da conexão.')
    }

    const password = input.password ?? ''
    await this.validateConnectionConfig(connection, password)

    const connections = this.store.get(CONNECTIONS_KEY, [])
    connections.push(connection)
    this.store.set(CONNECTIONS_KEY, connections)

    if (password.trim().length > 0) {
      await keytar.setPassword(CREDENTIAL_SERVICE, connection.id, password)
    } else {
      await keytar.deletePassword(CREDENTIAL_SERVICE, connection.id)
    }
    return connection
  }

  async updateConnection(id: string, input: ConnectionInput): Promise<ConnectionSummary> {
    const current = this.getConnectionOrThrow(id)
    this.assertEnvironmentExists(input.environmentId)

    const updated: ConnectionSummary = {
      ...current,
      environmentId: input.environmentId,
      engine: input.engine,
      name: input.name.trim(),
      filePath: input.filePath.trim(),
      host: input.host.trim(),
      port: sanitizePort(input.port),
      database: input.database.trim(),
      user: input.user.trim(),
      sslMode: input.sslMode,
    }

    if (!updated.name) {
      throw new Error('Preencha o nome da conexão.')
    }

    if (updated.engine === 'sqlite') {
      if (!updated.filePath) {
        throw new Error('Selecione o arquivo do banco SQLite.')
      }
    } else if (!updated.host || !updated.database || !updated.user) {
      throw new Error('Preencha os campos obrigatórios da conexão.')
    }

    const nextPassword = input.password.trim().length > 0 ? input.password : await this.getConnectionPassword(id)
    await this.validateConnectionConfig(updated, nextPassword)

    this.store.set(
      CONNECTIONS_KEY,
      this.store.get(CONNECTIONS_KEY, []).map((connection) => (connection.id === id ? updated : connection)),
    )

    await this.destroyConnectionClient(current)

    if (input.password.trim().length > 0) {
      await keytar.setPassword(CREDENTIAL_SERVICE, id, nextPassword)
    } else {
      await keytar.deletePassword(CREDENTIAL_SERVICE, id)
    }

    return updated
  }

  async testConnectionInput(
    input: ConnectionInput,
    existingConnectionId?: string,
  ): Promise<{ ok: boolean; latencyMs: number }> {
    this.assertEnvironmentExists(input.environmentId)

    const connection: ConnectionSummary = {
      id: existingConnectionId ?? randomUUID(),
      environmentId: input.environmentId,
      engine: input.engine,
      name: input.name.trim() || 'temp',
      filePath: input.filePath.trim(),
      host: input.host.trim(),
      port: sanitizePort(input.port),
      database: input.database.trim(),
      user: input.user.trim(),
      sslMode: input.sslMode,
      createdAt: new Date().toISOString(),
    }

    if (connection.engine === 'sqlite') {
      if (!connection.filePath) {
        throw new Error('Selecione o arquivo do banco SQLite para testar a conexão.')
      }
    } else if (!connection.host || !connection.database || !connection.user) {
      throw new Error('Preencha host, database e usuário para testar a conexão.')
    }

    const passwordInput = input.password ?? ''
    const password =
      passwordInput.trim().length > 0
        ? passwordInput
        : existingConnectionId
          ? await this.getConnectionPassword(existingConnectionId)
          : ''

    const startedAt = performance.now()
    await this.validateConnectionConfig(connection, password)

    return {
      ok: true,
      latencyMs: Math.round(performance.now() - startedAt),
    }
  }

  async deleteConnection(id: string): Promise<void> {
    const connection = this.getConnectionOrThrow(id)

    this.store.set(
      CONNECTIONS_KEY,
      this.store.get(CONNECTIONS_KEY, []).filter((candidate) => candidate.id !== id),
    )

    await this.destroyConnectionClient(connection)
    await keytar.deletePassword(CREDENTIAL_SERVICE, id)
  }

  async testConnection(id: string): Promise<{ ok: boolean; latencyMs: number }> {
    const connection = this.getConnectionOrThrow(id)
    const startedAt = performance.now()

    if (connection.engine === 'postgres') {
      const pool = await this.getPostgresPool(connection)
      await pool.query('SELECT 1')
    } else if (connection.engine === 'sqlite') {
      const db = await this.getSqliteDb(connection)
      db.prepare('SELECT 1').get()
    } else {
      const client = await this.getClickHouseClient(connection)
      const result = await client.query({ query: 'SELECT 1 AS ok', format: 'JSONEachRow' })
      await result.json<Record<string, unknown>>()
    }

    return {
      ok: true,
      latencyMs: Math.round(performance.now() - startedAt),
    }
  }

  async listSchemas(connectionId: string): Promise<SchemaInfo[]> {
    const connection = this.getConnectionOrThrow(connectionId)

    if (connection.engine === 'postgres') {
      const pool = await this.getPostgresPool(connection)
      const result = await pool.query<{ schema_name: string }>(`
        SELECT schema_name
        FROM information_schema.schemata
        WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
        ORDER BY schema_name ASC
      `)

      return result.rows.map((row) => ({ name: row.schema_name }))
    }

    if (connection.engine === 'sqlite') {
      return this.listSqliteSchemas(connection)
    }

    const client = await this.getClickHouseClient(connection)
    const result = await client.query({
      query: `
        SELECT name
        FROM system.databases
        WHERE lower(name) NOT IN ('information_schema', 'system')
        ORDER BY name ASC
      `,
      format: 'JSONEachRow',
    })

    const rows = await result.json<{ name: string }>()
    return rows.map((row) => ({ name: row.name }))
  }

  async listTables(connectionId: string, schema?: string): Promise<TableRef[]> {
    const connection = this.getConnectionOrThrow(connectionId)

    if (connection.engine === 'postgres') {
      return this.listPostgresTables(connection, schema)
    }

    if (connection.engine === 'sqlite') {
      return this.listSqliteTables(connection, schema)
    }

    return this.listClickHouseTables(connection, schema)
  }

  async searchTables(connectionId: string, query: string): Promise<TableRef[]> {
    const connection = this.getConnectionOrThrow(connectionId)

    if (connection.engine === 'postgres') {
      return this.searchPostgresTables(connection, query)
    }

    if (connection.engine === 'sqlite') {
      return this.searchSqliteTables(connection, query)
    }

    return this.searchClickHouseTables(connection, query)
  }

  async searchTablesInEnvironment(environmentId: string, query: string): Promise<TableSearchHit[]> {
    const connections = await this.listConnections(environmentId)
    const normalizedQuery = query.trim().toLowerCase()

    const results = await Promise.all(
      connections.map(async (connection) => {
        try {
          const tables = await this.searchTables(connection.id, query)
          return tables.map((table) => ({
            connectionId: connection.id,
            connectionName: connection.name,
            engine: connection.engine,
            table,
          }))
        } catch {
          return [] as TableSearchHit[]
        }
      }),
    )

    return results
      .flat()
      .sort((a, b) => {
        const rankDiff = rankTableMatch(a.table, normalizedQuery) - rankTableMatch(b.table, normalizedQuery)
        if (rankDiff !== 0) {
          return rankDiff
        }

        const lengthDiff = a.table.name.length - b.table.name.length
        if (lengthDiff !== 0) {
          return lengthDiff
        }

        const byConnection = a.connectionName.localeCompare(b.connectionName)
        if (byConnection !== 0) {
          return byConnection
        }

        return a.table.fqName.localeCompare(b.table.fqName)
      })
      .slice(0, 300)
  }

  async describeTable(connectionId: string, table: TableRef): Promise<TableSchema> {
    const connection = this.getConnectionOrThrow(connectionId)

    if (connection.engine === 'postgres') {
      return this.describePostgresTable(connection, table)
    }

    if (connection.engine === 'sqlite') {
      return this.describeSqliteTable(connection, table)
    }

    return this.describeClickHouseTable(connection, table)
  }

  async readTable(connectionId: string, table: TableRef, input: TableReadInput): Promise<TableReadResult> {
    const connection = this.getConnectionOrThrow(connectionId)

    if (connection.engine === 'postgres') {
      return this.readPostgresTable(connection, table, input)
    }

    if (connection.engine === 'sqlite') {
      return this.readSqliteTable(connection, table, input)
    }

    return this.readClickHouseTable(connection, table, input)
  }

  async insertRow(connectionId: string, table: TableRef, row: Record<string, unknown>): Promise<Record<string, unknown>> {
    const connection = this.getConnectionOrThrow(connectionId)

    if (connection.engine === 'postgres') {
      return this.insertPostgresRow(connection, table, row)
    }

    if (connection.engine === 'sqlite') {
      return this.insertSqliteRow(connection, table, row)
    }

    return this.insertClickHouseRow(connection, table, row)
  }

  async updateRow(connectionId: string, table: TableRef, row: Record<string, unknown>): Promise<{ affected: number }> {
    const connection = this.getConnectionOrThrow(connectionId)

    if (connection.engine === 'clickhouse') {
      throw new Error('Update inline não é suportado para ClickHouse nesta versão.')
    }

    if (connection.engine === 'sqlite') {
      return this.updateSqliteRow(connection, table, row)
    }

    return this.updatePostgresRow(connection, table, row)
  }

  async deleteRow(connectionId: string, table: TableRef, row: Record<string, unknown>): Promise<{ affected: number }> {
    const connection = this.getConnectionOrThrow(connectionId)

    if (connection.engine === 'clickhouse') {
      throw new Error('Delete por linha não é suportado para ClickHouse nesta versão.')
    }

    if (connection.engine === 'sqlite') {
      return this.deleteSqliteRow(connection, table, row)
    }

    return this.deletePostgresRow(connection, table, row)
  }

  previewSqlRisk(sql: string): SqlPreviewRiskResult {
    const statements = splitStatements(sql)
    if (statements.length === 0) {
      return {
        level: 'safe',
        reason: 'Nenhum comando SQL informado.',
      }
    }

    let worstLevel: RiskLevel = 'safe'

    for (const statement of statements) {
      const level = classifyStatement(statement)

      if (level === 'destructive') {
        worstLevel = 'destructive'
        break
      }

      if (level === 'write') {
        worstLevel = 'write'
      }
    }

    if (worstLevel === 'safe') {
      return {
        level: 'safe',
        reason: 'A query aparenta ser apenas leitura.',
      }
    }

    if (worstLevel === 'write') {
      return {
        level: 'write',
        reason: 'A query inclui comandos de escrita.',
      }
    }

    return {
      level: 'destructive',
      reason: 'A query inclui comandos destrutivos.',
    }
  }

  async executeSql(connectionId: string, sql: string): Promise<SqlExecutionResult> {
    const connection = this.getConnectionOrThrow(connectionId)
    const statements = splitStatements(sql)

    if (statements.length === 0) {
      return {
        durationMs: 0,
        resultSets: [],
      }
    }

    const startedAt = performance.now()
    const resultSets: SqlResultSet[] = []

    if (connection.engine === 'postgres') {
      const pool = await this.getPostgresPool(connection)

      for (const statement of statements) {
        const result = await pool.query(statement)
        resultSets.push({
          command: result.command,
          rowCount: result.rowCount ?? 0,
          fields: result.fields.map((field) => field.name),
          rows: result.rows,
        })
      }
    } else if (connection.engine === 'clickhouse') {
      const client = await this.getClickHouseClient(connection)

      for (const statement of statements) {
        resultSets.push(await this.executeClickHouseStatement(client, statement))
      }
    } else {
      const db = await this.getSqliteDb(connection)

      for (const statement of statements) {
        resultSets.push(this.executeSqliteStatement(db, statement))
      }
    }

    return {
      durationMs: Math.round(performance.now() - startedAt),
      resultSets,
    }
  }

  async close(): Promise<void> {
    for (const pool of this.pgPools.values()) {
      await pool.end()
    }

    for (const client of this.clickhouseClients.values()) {
      await client.close()
    }

    for (const db of this.sqliteClients.values()) {
      db.close()
    }

    this.pgPools.clear()
    this.clickhouseClients.clear()
    this.sqliteClients.clear()
  }

  private migrateLegacyStore(): void {
    const rawEnvironments = this.store.get(ENVIRONMENTS_KEY, []) as Array<EnvironmentSummary & { color?: string }>
    const normalizedEnvironments = rawEnvironments.map((environment) => ({
      ...environment,
      color: normalizeEnvironmentColor(environment.color),
    }))

    if (
      rawEnvironments.length !== normalizedEnvironments.length ||
      rawEnvironments.some((environment, index) => environment.color !== normalizedEnvironments[index]?.color)
    ) {
      this.store.set(ENVIRONMENTS_KEY, normalizedEnvironments)
    }

    const rawConnections = this.store.get(CONNECTIONS_KEY, []) as Array<ConnectionSummary & {
      environmentId?: string
      engine?: DatabaseEngine
      filePath?: string
    }>

    const environments = normalizedEnvironments
    const needsEnvironmentForLegacyConnections =
      rawConnections.length > 0 &&
      (environments.length === 0 ||
        rawConnections.some((connection) => !connection.environmentId))

    let nextEnvironments = environments
    if (needsEnvironmentForLegacyConnections) {
      nextEnvironments = [
        ...environments,
        {
          id: randomUUID(),
          name: environments.length === 0 ? 'Local' : 'Legacy',
          color: DEFAULT_ENVIRONMENT_COLOR,
          createdAt: new Date().toISOString(),
        },
      ]
      this.store.set(ENVIRONMENTS_KEY, nextEnvironments)
    }

    const firstEnvironmentId = nextEnvironments[0]?.id

    const migratedConnections = rawConnections.map((connection) => ({
      ...connection,
      environmentId: connection.environmentId ?? firstEnvironmentId ?? '',
      engine: connection.engine ?? 'postgres',
      filePath: connection.filePath ?? '',
    }))

    this.store.set(CONNECTIONS_KEY, migratedConnections)
  }

  private assertEnvironmentExists(environmentId: string): void {
    const exists = this.getNormalizedEnvironments().some((environment) => environment.id === environmentId)

    if (!exists) {
      throw new Error('Ambiente não encontrado.')
    }
  }

  private getNormalizedEnvironments(): EnvironmentSummary[] {
    const rawEnvironments = this.store.get(ENVIRONMENTS_KEY, []) as Array<EnvironmentSummary & { color?: string }>

    let changed = false
    const normalized = rawEnvironments.map((environment) => {
      const color = normalizeEnvironmentColor(environment.color)
      if (environment.color !== color) {
        changed = true
      }

      return {
        ...environment,
        color,
      }
    })

    if (changed) {
      this.store.set(ENVIRONMENTS_KEY, normalized)
    }

    return normalized
  }

  private getConnectionOrThrow(connectionId: string): ConnectionSummary {
    const connection = this.store
      .get(CONNECTIONS_KEY, [])
      .find((candidate) => candidate.id === connectionId)

    if (!connection) {
      throw new Error('Conexão não encontrada.')
    }

    return connection
  }

  private async destroyConnectionClient(connection: ConnectionSummary): Promise<void> {
    const pgPool = this.pgPools.get(connection.id)
    if (pgPool) {
      await pgPool.end()
      this.pgPools.delete(connection.id)
    }

    const clickhouseClient = this.clickhouseClients.get(connection.id)
    if (clickhouseClient) {
      await clickhouseClient.close()
      this.clickhouseClients.delete(connection.id)
    }

    const sqliteClient = this.sqliteClients.get(connection.id)
    if (sqliteClient) {
      sqliteClient.close()
      this.sqliteClients.delete(connection.id)
    }
  }

  private async validateConnectionConfig(connection: ConnectionSummary, password: string): Promise<void> {
    if (connection.engine === 'postgres') {
      await this.validatePostgresConfig(connection, password)
      return
    }

    if (connection.engine === 'sqlite') {
      await this.validateSqliteConfig(connection)
      return
    }

    await this.validateClickHouseConfig(connection, password)
  }

  private async getConnectionPassword(connectionId: string): Promise<string> {
    return (await keytar.getPassword(CREDENTIAL_SERVICE, connectionId)) ?? ''
  }

  private async getPostgresPool(connection: ConnectionSummary): Promise<Pool> {
    const existing = this.pgPools.get(connection.id)
    if (existing) {
      return existing
    }

    const password = await this.getConnectionPassword(connection.id)

    const pool = new Pool({
      host: connection.host,
      port: connection.port,
      database: connection.database,
      user: connection.user,
      password,
      max: 8,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ssl: connection.sslMode === 'require' ? { rejectUnauthorized: false } : undefined,
    })

    pool.on('error', () => {
      this.pgPools.delete(connection.id)
    })

    this.pgPools.set(connection.id, pool)
    return pool
  }

  private async getClickHouseClient(connection: ConnectionSummary): Promise<ClickHouseClient> {
    const existing = this.clickhouseClients.get(connection.id)
    if (existing) {
      return existing
    }

    const password = await this.getConnectionPassword(connection.id)
    const protocol = connection.sslMode === 'require' ? 'https' : 'http'

    const client = createClient({
      url: `${protocol}://${connection.host}:${connection.port}`,
      username: connection.user,
      password,
      database: connection.database,
      request_timeout: 30_000,
    })

    this.clickhouseClients.set(connection.id, client)
    return client
  }

  private async getSqliteDb(connection: ConnectionSummary): Promise<BetterSqlite3.Database> {
    const existing = this.sqliteClients.get(connection.id)
    if (existing) {
      return existing
    }

    const filePath = connection.filePath.trim()
    if (!filePath) {
      throw new Error('Arquivo SQLite não configurado nesta conexão.')
    }

    let db: BetterSqlite3.Database
    try {
      db = new BetterSqlite3(filePath, { fileMustExist: true })
    } catch (error) {
      throw normalizeSqliteClientError(error)
    }
    this.sqliteClients.set(connection.id, db)
    return db
  }

  private async validatePostgresConfig(connection: ConnectionSummary, password: string): Promise<void> {
    const pool = new Pool({
      host: connection.host,
      port: connection.port,
      database: connection.database,
      user: connection.user,
      password,
      max: 1,
      idleTimeoutMillis: 1,
      connectionTimeoutMillis: 10_000,
      ssl: connection.sslMode === 'require' ? { rejectUnauthorized: false } : undefined,
    })

    try {
      await pool.query('SELECT 1')
    } finally {
      await pool.end()
    }
  }

  private async validateClickHouseConfig(connection: ConnectionSummary, password: string): Promise<void> {
    const protocol = connection.sslMode === 'require' ? 'https' : 'http'
    const client = createClient({
      url: `${protocol}://${connection.host}:${connection.port}`,
      username: connection.user,
      password,
      database: connection.database,
      request_timeout: 10_000,
    })

    try {
      const result = await client.query({ query: 'SELECT 1 AS ok', format: 'JSONEachRow' })
      await result.json<Record<string, unknown>>()
    } finally {
      await client.close()
    }
  }

  private async validateSqliteConfig(connection: ConnectionSummary): Promise<void> {
    const filePath = connection.filePath.trim()
    if (!filePath) {
      throw new Error('Selecione o arquivo SQLite.')
    }

    let db: BetterSqlite3.Database
    try {
      db = new BetterSqlite3(filePath, { fileMustExist: true, readonly: true })
    } catch (error) {
      throw normalizeSqliteClientError(error)
    }
    try {
      db.prepare('SELECT 1').get()
    } finally {
      db.close()
    }
  }

  private async listPostgresTables(connection: ConnectionSummary, schema?: string): Promise<TableRef[]> {
    const pool = await this.getPostgresPool(connection)

    const values: string[] = []
    let whereClause = `
      table_type = 'BASE TABLE'
      AND table_schema NOT IN ('pg_catalog', 'information_schema')
    `

    if (schema) {
      values.push(schema)
      whereClause += ` AND table_schema = $${values.length}`
    }

    const result = await pool.query<{ table_schema: string; table_name: string }>(
      `
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE ${whereClause}
      ORDER BY table_schema ASC, table_name ASC
      `,
      values,
    )

    return result.rows.map((row) => ({
      schema: row.table_schema,
      name: row.table_name,
      fqName: `${row.table_schema}.${row.table_name}`,
    }))
  }

  private async listClickHouseTables(connection: ConnectionSummary, schema?: string): Promise<TableRef[]> {
    const client = await this.getClickHouseClient(connection)

    const useSchema = schema && schema !== 'all'

    const result = await client.query({
      query: `
        SELECT database AS table_schema, name AS table_name
        FROM system.tables
        WHERE lower(database) NOT IN ('information_schema', 'system')
          ${useSchema ? 'AND database = {schema:String}' : ''}
        ORDER BY table_schema ASC, table_name ASC
      `,
      query_params: useSchema ? { schema } : undefined,
      format: 'JSONEachRow',
    })

    const rows = await result.json<{ table_schema: string; table_name: string }>()

    return rows.map((row) => ({
      schema: row.table_schema,
      name: row.table_name,
      fqName: `${row.table_schema}.${row.table_name}`,
    }))
  }

  private async searchPostgresTables(connection: ConnectionSummary, query: string): Promise<TableRef[]> {
    const pool = await this.getPostgresPool(connection)
    const term = `%${query.trim()}%`

    const result = await pool.query<{ table_schema: string; table_name: string }>(
      `
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
        AND table_schema NOT IN ('pg_catalog', 'information_schema')
        AND (table_name ILIKE $1 OR CONCAT(table_schema, '.', table_name) ILIKE $1)
      ORDER BY table_schema ASC, table_name ASC
      LIMIT 180
      `,
      [term],
    )

    return result.rows.map((row) => ({
      schema: row.table_schema,
      name: row.table_name,
      fqName: `${row.table_schema}.${row.table_name}`,
    }))
  }

  private async searchClickHouseTables(connection: ConnectionSummary, query: string): Promise<TableRef[]> {
    const client = await this.getClickHouseClient(connection)

    const result = await client.query({
      query: `
        SELECT database AS table_schema, name AS table_name
        FROM system.tables
        WHERE lower(database) NOT IN ('information_schema', 'system')
          AND (
            positionCaseInsensitiveUTF8(name, {term:String}) > 0
            OR positionCaseInsensitiveUTF8(concat(database, '.', name), {term:String}) > 0
          )
        ORDER BY table_schema ASC, table_name ASC
        LIMIT 180
      `,
      query_params: { term: query.trim() },
      format: 'JSONEachRow',
    })

    const rows = await result.json<{ table_schema: string; table_name: string }>()

    return rows.map((row) => ({
      schema: row.table_schema,
      name: row.table_name,
      fqName: `${row.table_schema}.${row.table_name}`,
    }))
  }

  private async listSqliteSchemas(connection: ConnectionSummary): Promise<SchemaInfo[]> {
    const db = await this.getSqliteDb(connection)
    const rows = db.prepare('PRAGMA database_list').all() as Array<{ name?: string }>

    return rows
      .map((row) => row.name?.trim() ?? '')
      .filter((name) => name.length > 0 && name.toLowerCase() !== 'temp')
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ name }))
  }

  private async listSqliteTables(connection: ConnectionSummary, schema?: string): Promise<TableRef[]> {
    const db = await this.getSqliteDb(connection)
    const schemas = await this.listSqliteSchemas(connection)

    const schemaNames =
      schema && schema !== 'all'
        ? schemas.map((item) => item.name).filter((name) => name === schema)
        : schemas.map((item) => item.name)

    const tables: TableRef[] = []
    for (const schemaName of schemaNames) {
      const target = quoteSqliteIdentifier(schemaName)
      const rows = db
        .prepare(
          `
          SELECT name AS table_name
          FROM ${target}.sqlite_master
          WHERE type = 'table'
            AND name NOT LIKE 'sqlite_%'
          ORDER BY name ASC
          `,
        )
        .all() as Array<{ table_name: string }>

      for (const row of rows) {
        tables.push({
          schema: schemaName,
          name: row.table_name,
          fqName: `${schemaName}.${row.table_name}`,
        })
      }
    }

    return tables.sort((a, b) => a.fqName.localeCompare(b.fqName))
  }

  private async searchSqliteTables(connection: ConnectionSummary, query: string): Promise<TableRef[]> {
    const term = query.trim().toLowerCase()
    const tables = await this.listSqliteTables(connection)
    if (!term) {
      return tables.slice(0, 180)
    }

    return tables
      .filter((table) => {
        const tableName = table.name.toLowerCase()
        const fqName = table.fqName.toLowerCase()
        return tableName.includes(term) || fqName.includes(term)
      })
      .slice(0, 180)
  }

  private async describePostgresTable(connection: ConnectionSummary, table: TableRef): Promise<TableSchema> {
    const pool = await this.getPostgresPool(connection)
    const quotedSchema = quotePostgresIdentifier(table.schema)
    const quotedTable = quotePostgresIdentifier(table.name)

    const columnsResult = await pool.query<{
      column_name: string
      data_type: string
      is_nullable: 'YES' | 'NO'
      column_default: string | null
      udt_name: string
    }>(
      `
      SELECT column_name, data_type, is_nullable, column_default, udt_name
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position ASC
      `,
      [table.schema, table.name],
    )

    const pkResult = await pool.query<{ column_name: string }>(
      `
      SELECT kcu.column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = $1
        AND tc.table_name = $2
      ORDER BY kcu.ordinal_position ASC
      `,
      [table.schema, table.name],
    )

    const enumResult = await pool.query<{
      column_name: string
      enum_label: string
    }>(
      `
      SELECT
        a.attname AS column_name,
        e.enumlabel AS enum_label
      FROM pg_catalog.pg_attribute AS a
      JOIN pg_catalog.pg_class AS c
        ON c.oid = a.attrelid
      JOIN pg_catalog.pg_namespace AS n
        ON n.oid = c.relnamespace
      JOIN pg_catalog.pg_type AS t
        ON t.oid = a.atttypid
      JOIN pg_catalog.pg_enum AS e
        ON e.enumtypid = t.oid
      WHERE n.nspname = $1
        AND c.relname = $2
        AND a.attnum > 0
        AND NOT a.attisdropped
      ORDER BY a.attnum ASC, e.enumsortorder ASC
      `,
      [table.schema, table.name],
    )

    const primaryKey = pkResult.rows.map((row) => row.column_name)
    const primaryKeySet = new Set(primaryKey)
    const enumValuesByColumn = new Map<string, string[]>()

    for (const row of enumResult.rows) {
      const current = enumValuesByColumn.get(row.column_name) ?? []
      current.push(row.enum_label)
      enumValuesByColumn.set(row.column_name, current)
    }

    const columns: ColumnDef[] = columnsResult.rows.map((row) => {
      const enumValues = enumValuesByColumn.get(row.column_name)

      return {
        name: row.column_name,
        dataType: row.data_type === 'USER-DEFINED' ? row.udt_name : row.data_type,
        enumValues,
        nullable: row.is_nullable === 'YES',
        defaultValue: row.column_default,
        isPrimaryKey: primaryKeySet.has(row.column_name),
      }
    })

    await pool.query(`SELECT * FROM ${quotedSchema}.${quotedTable} LIMIT 0`)

    return {
      table,
      columns,
      primaryKey,
      engine: 'postgres',
      supportsRowEdit: primaryKey.length > 0,
    }
  }

  private async describeClickHouseTable(connection: ConnectionSummary, table: TableRef): Promise<TableSchema> {
    const client = await this.getClickHouseClient(connection)

    const result = await client.query({
      query: `
        SELECT
          name,
          type,
          default_expression,
          is_in_primary_key
        FROM system.columns
        WHERE database = {schema:String}
          AND table = {table:String}
        ORDER BY position ASC
      `,
      query_params: {
        schema: table.schema,
        table: table.name,
      },
      format: 'JSONEachRow',
    })

    const rows = await result.json<{
      name: string
      type: string
      default_expression: string | null
      is_in_primary_key: number
    }>()

    const primaryKey = rows.filter((row) => row.is_in_primary_key === 1).map((row) => row.name)
    const primaryKeySet = new Set(primaryKey)

    const columns: ColumnDef[] = rows.map((row) => ({
      name: row.name,
      dataType: row.type,
      enumValues: extractClickHouseEnumValues(row.type),
      nullable: row.type.startsWith('Nullable('),
      defaultValue: row.default_expression,
      isPrimaryKey: primaryKeySet.has(row.name),
    }))

    const target = `${quoteClickHouseIdentifier(table.schema)}.${quoteClickHouseIdentifier(table.name)}`
    await client.query({ query: `SELECT * FROM ${target} LIMIT 0`, format: 'JSONEachRow' })

    return {
      table,
      columns,
      primaryKey,
      engine: 'clickhouse',
      supportsRowEdit: false,
    }
  }

  private async describeSqliteTable(connection: ConnectionSummary, table: TableRef): Promise<TableSchema> {
    const db = await this.getSqliteDb(connection)
    const schemaName = quoteSqliteIdentifier(table.schema)
    const tableName = quoteSqliteIdentifier(table.name)

    const rows = db
      .prepare(
        `
        SELECT name, type, "notnull" AS not_null, dflt_value AS default_value, pk
        FROM ${schemaName}.pragma_table_info(${escapeSqlLiteral(table.name)})
        ORDER BY cid ASC
        `,
      )
      .all() as Array<{
      name: string
      type: string
      not_null: number
      default_value: string | null
      pk: number
    }>

    const primaryKey = rows
      .filter((row) => row.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((row) => row.name)
    const primaryKeySet = new Set(primaryKey)

    const columns: ColumnDef[] = rows.map((row) => ({
      name: row.name,
      dataType: row.type || 'TEXT',
      nullable: row.not_null === 0,
      defaultValue: row.default_value,
      isPrimaryKey: primaryKeySet.has(row.name),
    }))

    db.prepare(`SELECT * FROM ${schemaName}.${tableName} LIMIT 0`).all()

    return {
      table,
      columns,
      primaryKey,
      engine: 'sqlite',
      supportsRowEdit: primaryKey.length > 0,
    }
  }

  private async readPostgresTable(connection: ConnectionSummary, table: TableRef, input: TableReadInput): Promise<TableReadResult> {
    const pool = await this.getPostgresPool(connection)
    const schema = await this.describePostgresTable(connection, table)

    const filters = input.filters ?? []
    const where = buildPostgresWhereClause(filters, schema.columns.map((column) => column.name))
    const quotedTarget = `${quotePostgresIdentifier(table.schema)}.${quotePostgresIdentifier(table.name)}`
    const sort = this.buildPostgresSort(schema.columns.map((column) => column.name), input.sort)

    const offset = Math.max(input.page, 0) * Math.max(input.pageSize, 1)
    const limit = Math.min(Math.max(input.pageSize, 1), 500)

    const countResult = await pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM ${quotedTarget} ${where.sql}`,
      where.values,
    )

    const dataResult = await pool.query(
      `
      SELECT *
      FROM ${quotedTarget}
      ${where.sql}
      ${sort}
      LIMIT $${where.values.length + 1}
      OFFSET $${where.values.length + 2}
      `,
      [...where.values, limit, offset],
    )

    return {
      rows: dataResult.rows,
      total: Number(countResult.rows[0]?.total ?? '0'),
      page: input.page,
      pageSize: limit,
    }
  }

  private async readClickHouseTable(connection: ConnectionSummary, table: TableRef, input: TableReadInput): Promise<TableReadResult> {
    const client = await this.getClickHouseClient(connection)
    const schema = await this.describeClickHouseTable(connection, table)

    const filters = input.filters ?? []
    const where = buildClickHouseWhereClause(filters, schema.columns.map((column) => column.name))
    const sort = this.buildClickHouseSort(schema.columns.map((column) => column.name), input.sort)

    const offset = Math.max(input.page, 0) * Math.max(input.pageSize, 1)
    const limit = Math.min(Math.max(input.pageSize, 1), 500)

    const target = `${quoteClickHouseIdentifier(table.schema)}.${quoteClickHouseIdentifier(table.name)}`

    const countResult = await client.query({
      query: `
        SELECT toUInt64(count()) AS total
        FROM ${target}
        ${where.sql}
      `,
      query_params: where.params,
      format: 'JSONEachRow',
    })

    const countRows = await countResult.json<{ total: string | number }>()

    const dataResult = await client.query({
      query: `
        SELECT *
        FROM ${target}
        ${where.sql}
        ${sort}
        LIMIT {limit:UInt32}
        OFFSET {offset:UInt32}
      `,
      query_params: {
        ...where.params,
        limit,
        offset,
      },
      format: 'JSONEachRow',
    })

    const rows = await dataResult.json<Record<string, unknown>>()

    return {
      rows,
      total: Number(countRows[0]?.total ?? 0),
      page: input.page,
      pageSize: limit,
    }
  }

  private async readSqliteTable(connection: ConnectionSummary, table: TableRef, input: TableReadInput): Promise<TableReadResult> {
    const db = await this.getSqliteDb(connection)
    const schema = await this.describeSqliteTable(connection, table)

    const filters = input.filters ?? []
    const where = buildSqliteWhereClause(filters, schema.columns.map((column) => column.name))
    const sort = this.buildSqliteSort(schema.columns.map((column) => column.name), input.sort)

    const offset = Math.max(input.page, 0) * Math.max(input.pageSize, 1)
    const limit = Math.min(Math.max(input.pageSize, 1), 500)

    const target = `${quoteSqliteIdentifier(table.schema)}.${quoteSqliteIdentifier(table.name)}`

    const countStmt = db.prepare(`SELECT COUNT(*) AS total FROM ${target} ${where.sql}`)
    const countRow = countStmt.get(...where.values) as { total?: number } | undefined

    const dataStmt = db.prepare(
      `
      SELECT *
      FROM ${target}
      ${where.sql}
      ${sort}
      LIMIT ?
      OFFSET ?
      `,
    )
    const rows = dataStmt.all(...where.values, limit, offset) as Record<string, unknown>[]

    return {
      rows,
      total: Number(countRow?.total ?? 0),
      page: input.page,
      pageSize: limit,
    }
  }

  private async insertPostgresRow(connection: ConnectionSummary, table: TableRef, row: Record<string, unknown>): Promise<Record<string, unknown>> {
    const pool = await this.getPostgresPool(connection)
    const schema = await this.describePostgresTable(connection, table)
    const columnByName = new Map(schema.columns.map((column) => [column.name, column]))

    const allowedColumns = new Set(schema.columns.map((column) => column.name))
    const keys = Object.keys(row).filter((key) => allowedColumns.has(key))
    const quotedTarget = `${quotePostgresIdentifier(table.schema)}.${quotePostgresIdentifier(table.name)}`

    let result: QueryResult<Record<string, unknown>>

    if (keys.length === 0) {
      result = await pool.query(`INSERT INTO ${quotedTarget} DEFAULT VALUES RETURNING *`)
    } else {
      const columnList = keys.map((key) => quotePostgresIdentifier(key)).join(', ')
      const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ')
      const values = keys.map((key) => normalizePostgresColumnValue(row[key], columnByName.get(key)))

      result = await pool.query(
        `INSERT INTO ${quotedTarget} (${columnList}) VALUES (${placeholders}) RETURNING *`,
        values,
      )
    }

    return result.rows[0] ?? {}
  }

  private async insertClickHouseRow(connection: ConnectionSummary, table: TableRef, row: Record<string, unknown>): Promise<Record<string, unknown>> {
    const client = await this.getClickHouseClient(connection)
    const schema = await this.describeClickHouseTable(connection, table)

    const allowedColumns = new Set(schema.columns.map((column) => column.name))
    const keys = Object.keys(row).filter((key) => allowedColumns.has(key))

    if (keys.length === 0) {
      throw new Error('Informe ao menos uma coluna para inserir no ClickHouse.')
    }

    const payload: Record<string, unknown> = {}
    for (const key of keys) {
      payload[key] = normalizeValue(row[key])
    }

    await client.insert({
      table: `${table.schema}.${table.name}`,
      values: [payload],
      format: 'JSONEachRow',
    })

    return payload
  }

  private async insertSqliteRow(connection: ConnectionSummary, table: TableRef, row: Record<string, unknown>): Promise<Record<string, unknown>> {
    const db = await this.getSqliteDb(connection)
    const schema = await this.describeSqliteTable(connection, table)

    const allowedColumns = new Set(schema.columns.map((column) => column.name))
    const keys = Object.keys(row).filter((key) => allowedColumns.has(key))
    const target = `${quoteSqliteIdentifier(table.schema)}.${quoteSqliteIdentifier(table.name)}`

    if (keys.length === 0) {
      db.prepare(`INSERT INTO ${target} DEFAULT VALUES`).run()
      return {}
    }

    const columnList = keys.map((key) => quoteSqliteIdentifier(key)).join(', ')
    const placeholders = keys.map(() => '?').join(', ')
    const values = keys.map((key) => normalizeValue(row[key]))

    db.prepare(`INSERT INTO ${target} (${columnList}) VALUES (${placeholders})`).run(...values)

    const payload: Record<string, unknown> = {}
    for (const key of keys) {
      payload[key] = normalizeValue(row[key])
    }
    return payload
  }

  private async updatePostgresRow(connection: ConnectionSummary, table: TableRef, row: Record<string, unknown>): Promise<{ affected: number }> {
    const pool = await this.getPostgresPool(connection)
    const schema = await this.describePostgresTable(connection, table)
    const columnByName = new Map(schema.columns.map((column) => [column.name, column]))

    if (schema.primaryKey.length === 0) {
      throw new Error('A tabela não possui chave primária para update.')
    }

    const availableColumns = new Set(schema.columns.map((column) => column.name))
    const patchKeys = Object.keys(row).filter(
      (key) => availableColumns.has(key) && !schema.primaryKey.includes(key),
    )

    if (patchKeys.length === 0) {
      throw new Error('Nenhuma coluna para atualizar foi enviada.')
    }

    const missingPk = schema.primaryKey.filter((pkColumn) => !(pkColumn in row))
    if (missingPk.length > 0) {
      throw new Error(`Colunas da chave primária ausentes: ${missingPk.join(', ')}`)
    }

    const quotedTarget = `${quotePostgresIdentifier(table.schema)}.${quotePostgresIdentifier(table.name)}`
    const values: unknown[] = []

    const setClause = patchKeys
      .map((key) => {
        values.push(normalizePostgresColumnValue(row[key], columnByName.get(key)))
        return `${quotePostgresIdentifier(key)} = $${values.length}`
      })
      .join(', ')

    const whereClause = schema.primaryKey
      .map((pk) => {
        values.push(normalizePostgresColumnValue(row[pk], columnByName.get(pk)))
        return `${quotePostgresIdentifier(pk)} = $${values.length}`
      })
      .join(' AND ')

    const result = await pool.query(
      `UPDATE ${quotedTarget} SET ${setClause} WHERE ${whereClause}`,
      values,
    )

    return { affected: result.rowCount ?? 0 }
  }

  private async deletePostgresRow(connection: ConnectionSummary, table: TableRef, row: Record<string, unknown>): Promise<{ affected: number }> {
    const pool = await this.getPostgresPool(connection)
    const schema = await this.describePostgresTable(connection, table)
    const columnByName = new Map(schema.columns.map((column) => [column.name, column]))

    if (schema.primaryKey.length === 0) {
      throw new Error('A tabela não possui chave primária para delete.')
    }

    const missingPk = schema.primaryKey.filter((pkColumn) => !(pkColumn in row))
    if (missingPk.length > 0) {
      throw new Error(`Colunas da chave primária ausentes: ${missingPk.join(', ')}`)
    }

    const quotedTarget = `${quotePostgresIdentifier(table.schema)}.${quotePostgresIdentifier(table.name)}`

    const values: unknown[] = []
    const whereClause = schema.primaryKey
      .map((pkColumn) => {
        values.push(normalizePostgresColumnValue(row[pkColumn], columnByName.get(pkColumn)))
        return `${quotePostgresIdentifier(pkColumn)} = $${values.length}`
      })
      .join(' AND ')

    const result = await pool.query(`DELETE FROM ${quotedTarget} WHERE ${whereClause}`, values)
    return { affected: result.rowCount ?? 0 }
  }

  private async updateSqliteRow(connection: ConnectionSummary, table: TableRef, row: Record<string, unknown>): Promise<{ affected: number }> {
    const db = await this.getSqliteDb(connection)
    const schema = await this.describeSqliteTable(connection, table)

    if (schema.primaryKey.length === 0) {
      throw new Error('A tabela não possui chave primária para update.')
    }

    const availableColumns = new Set(schema.columns.map((column) => column.name))
    const patchKeys = Object.keys(row).filter(
      (key) => availableColumns.has(key) && !schema.primaryKey.includes(key),
    )

    if (patchKeys.length === 0) {
      throw new Error('Nenhuma coluna para atualizar foi enviada.')
    }

    const missingPk = schema.primaryKey.filter((pkColumn) => !(pkColumn in row))
    if (missingPk.length > 0) {
      throw new Error(`Colunas da chave primária ausentes: ${missingPk.join(', ')}`)
    }

    const target = `${quoteSqliteIdentifier(table.schema)}.${quoteSqliteIdentifier(table.name)}`
    const values: unknown[] = []

    const setClause = patchKeys
      .map((key) => {
        values.push(normalizeValue(row[key]))
        return `${quoteSqliteIdentifier(key)} = ?`
      })
      .join(', ')

    const whereClause = schema.primaryKey
      .map((pk) => {
        values.push(normalizeValue(row[pk]))
        return `${quoteSqliteIdentifier(pk)} = ?`
      })
      .join(' AND ')

    const result = db.prepare(`UPDATE ${target} SET ${setClause} WHERE ${whereClause}`).run(...values)
    return { affected: result.changes }
  }

  private async deleteSqliteRow(connection: ConnectionSummary, table: TableRef, row: Record<string, unknown>): Promise<{ affected: number }> {
    const db = await this.getSqliteDb(connection)
    const schema = await this.describeSqliteTable(connection, table)

    if (schema.primaryKey.length === 0) {
      throw new Error('A tabela não possui chave primária para delete.')
    }

    const missingPk = schema.primaryKey.filter((pkColumn) => !(pkColumn in row))
    if (missingPk.length > 0) {
      throw new Error(`Colunas da chave primária ausentes: ${missingPk.join(', ')}`)
    }

    const target = `${quoteSqliteIdentifier(table.schema)}.${quoteSqliteIdentifier(table.name)}`
    const values = schema.primaryKey.map((pkColumn) => normalizeValue(row[pkColumn]))
    const whereClause = schema.primaryKey
      .map((pkColumn) => `${quoteSqliteIdentifier(pkColumn)} = ?`)
      .join(' AND ')

    const result = db.prepare(`DELETE FROM ${target} WHERE ${whereClause}`).run(...values)
    return { affected: result.changes }
  }

  private async executeClickHouseStatement(client: ClickHouseClient, statement: string): Promise<SqlResultSet> {
    const keyword = firstSqlKeyword(statement)
    const readKeywords = new Set(['SELECT', 'SHOW', 'DESCRIBE', 'EXPLAIN', 'WITH'])

    if (readKeywords.has(keyword)) {
      const result = await client.query({ query: statement, format: 'JSONEachRow' })
      const rows = await result.json<Record<string, unknown>>()
      const fields = rows.length > 0 ? Object.keys(rows[0]) : []

      return {
        command: keyword || 'SELECT',
        rowCount: rows.length,
        fields,
        rows,
      }
    }

    await client.command({ query: statement })

    return {
      command: keyword || 'COMMAND',
      rowCount: 0,
      fields: [],
      rows: [],
    }
  }

  private executeSqliteStatement(db: BetterSqlite3.Database, statement: string): SqlResultSet {
    const keyword = firstSqlKeyword(statement)
    const readKeywords = new Set(['SELECT', 'PRAGMA', 'WITH', 'EXPLAIN'])

    if (readKeywords.has(keyword)) {
      const rows = db.prepare(statement).all() as Record<string, unknown>[]
      const fields = rows.length > 0 ? Object.keys(rows[0]) : []

      return {
        command: keyword || 'SELECT',
        rowCount: rows.length,
        fields,
        rows,
      }
    }

    const result = db.prepare(statement).run()
    return {
      command: keyword || 'COMMAND',
      rowCount: result.changes,
      fields: [],
      rows: [],
    }
  }

  private buildPostgresSort(columns: string[], sort?: TableSort): string {
    if (!sort || !columns.includes(sort.column)) {
      return ''
    }

    const direction = sort.direction === 'desc' ? 'DESC' : 'ASC'
    return `ORDER BY ${quotePostgresIdentifier(sort.column)} ${direction}`
  }

  private buildClickHouseSort(columns: string[], sort?: TableSort): string {
    if (!sort || !columns.includes(sort.column)) {
      return ''
    }

    const direction = sort.direction === 'desc' ? 'DESC' : 'ASC'
    return `ORDER BY ${quoteClickHouseIdentifier(sort.column)} ${direction}`
  }

  private buildSqliteSort(columns: string[], sort?: TableSort): string {
    if (!sort || !columns.includes(sort.column)) {
      return ''
    }

    const direction = sort.direction === 'desc' ? 'DESC' : 'ASC'
    return `ORDER BY ${quoteSqliteIdentifier(sort.column)} ${direction}`
  }
}

function normalizeValue(value: unknown): unknown {
  if (value === '') {
    return null
  }

  return value
}

function normalizePostgresColumnValue(value: unknown, column?: ColumnDef): unknown {
  const normalized = normalizeValue(value)
  if (!column || !isPostgresJsonColumn(column) || normalized === null || normalized === undefined) {
    return normalized
  }

  if (typeof normalized === 'string') {
    const trimmed = normalized.trim()
    if (trimmed === '') {
      return null
    }

    try {
      return JSON.stringify(JSON.parse(trimmed))
    } catch {
      throw new Error(`Valor inválido para coluna JSON "${column.name}".`)
    }
  }

  try {
    return JSON.stringify(normalized)
  } catch {
    throw new Error(`Valor inválido para coluna JSON "${column.name}".`)
  }
}

function isPostgresJsonColumn(column: ColumnDef): boolean {
  return /^jsonb?$/i.test(column.dataType.trim())
}

function sanitizePort(port: number): number {
  const normalized = Number(port)
  return Number.isFinite(normalized) ? normalized : 0
}

function buildPostgresWhereClause(filters: TableFilter[], availableColumns: string[]): { sql: string; values: string[] } {
  if (filters.length === 0) {
    return { sql: '', values: [] }
  }

  const values: string[] = []
  const parts: string[] = []

  for (const filter of filters) {
    if (!availableColumns.includes(filter.column)) {
      continue
    }

    if (filter.operator === 'eq') {
      values.push(filter.value)
      parts.push(`CAST(${quotePostgresIdentifier(filter.column)} AS TEXT) = $${values.length}`)
      continue
    }

    values.push(`%${filter.value}%`)
    parts.push(`CAST(${quotePostgresIdentifier(filter.column)} AS TEXT) ILIKE $${values.length}`)
  }

  if (parts.length === 0) {
    return { sql: '', values: [] }
  }

  return {
    sql: `WHERE ${parts.join(' AND ')}`,
    values,
  }
}

function buildClickHouseWhereClause(
  filters: TableFilter[],
  availableColumns: string[],
): { sql: string; params: Record<string, string> } {
  if (filters.length === 0) {
    return { sql: '', params: {} }
  }

  const params: Record<string, string> = {}
  const parts: string[] = []

  for (const filter of filters) {
    if (!availableColumns.includes(filter.column)) {
      continue
    }

    const key = `f_${parts.length}`
    params[key] = filter.value

    if (filter.operator === 'eq') {
      parts.push(`toString(${quoteClickHouseIdentifier(filter.column)}) = {${key}:String}`)
      continue
    }

    parts.push(`positionCaseInsensitiveUTF8(toString(${quoteClickHouseIdentifier(filter.column)}), {${key}:String}) > 0`)
  }

  if (parts.length === 0) {
    return { sql: '', params: {} }
  }

  return {
    sql: `WHERE ${parts.join(' AND ')}`,
    params,
  }
}

function buildSqliteWhereClause(filters: TableFilter[], availableColumns: string[]): { sql: string; values: string[] } {
  if (filters.length === 0) {
    return { sql: '', values: [] }
  }

  const values: string[] = []
  const parts: string[] = []

  for (const filter of filters) {
    if (!availableColumns.includes(filter.column)) {
      continue
    }

    if (filter.operator === 'eq') {
      values.push(filter.value)
      parts.push(`CAST(${quoteSqliteIdentifier(filter.column)} AS TEXT) = ?`)
      continue
    }

    values.push(`%${filter.value}%`)
    parts.push(`CAST(${quoteSqliteIdentifier(filter.column)} AS TEXT) LIKE ? COLLATE NOCASE`)
  }

  if (parts.length === 0) {
    return { sql: '', values: [] }
  }

  return {
    sql: `WHERE ${parts.join(' AND ')}`,
    values,
  }
}

function quotePostgresIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`
}

function quoteClickHouseIdentifier(identifier: string): string {
  return '`' + identifier.replace(/`/g, '``') + '`'
}

function quoteSqliteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`
}

function escapeSqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function extractClickHouseEnumValues(dataType: string): string[] | undefined {
  const enumMatch = /Enum(?:8|16)\s*\(/i.exec(dataType)
  if (!enumMatch || enumMatch.index === undefined) {
    return undefined
  }

  const openParenthesis = dataType.indexOf('(', enumMatch.index)
  if (openParenthesis < 0) {
    return undefined
  }

  const closeParenthesis = findMatchingClosingParenthesis(dataType, openParenthesis)
  if (closeParenthesis < 0) {
    return undefined
  }

  const enumDefinition = dataType.slice(openParenthesis + 1, closeParenthesis)
  const labels: string[] = []

  for (const match of enumDefinition.matchAll(/'((?:[^'\\]|\\.|'')*)'\s*=/g)) {
    labels.push(unescapeClickHouseEnumLabel(match[1]))
  }

  return labels.length > 0 ? labels : undefined
}

function findMatchingClosingParenthesis(source: string, openIndex: number): number {
  let depth = 0
  let inSingleQuote = false
  let isEscaped = false

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index]

    if (inSingleQuote) {
      if (isEscaped) {
        isEscaped = false
        continue
      }

      if (char === '\\') {
        isEscaped = true
        continue
      }

      if (char === "'") {
        inSingleQuote = false
      }

      continue
    }

    if (char === "'") {
      inSingleQuote = true
      continue
    }

    if (char === '(') {
      depth += 1
      continue
    }

    if (char === ')') {
      depth -= 1
      if (depth === 0) {
        return index
      }
    }
  }

  return -1
}

function unescapeClickHouseEnumLabel(value: string): string {
  let result = ''
  let isEscaped = false

  for (const char of value) {
    if (isEscaped) {
      result += char
      isEscaped = false
      continue
    }

    if (char === '\\') {
      isEscaped = true
      continue
    }

    result += char
  }

  if (isEscaped) {
    result += '\\'
  }

  return result.replace(/''/g, "'")
}

function splitStatements(sql: string): string[] {
  return sql
    .split(/;(?=(?:[^'\\]|\\.|'(?:[^'\\]|\\.)*')*$)/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

function classifyStatement(statement: string): RiskLevel {
  const normalized = statement
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ')
    .trim()
    .toUpperCase()

  const keyword = normalized.split(/\s+/)[0]

  if (!keyword) {
    return 'safe'
  }

  const destructiveKeywords = new Set(['DROP', 'TRUNCATE', 'ALTER'])
  if (destructiveKeywords.has(keyword)) {
    return 'destructive'
  }

  const writeKeywords = new Set([
    'INSERT',
    'UPDATE',
    'DELETE',
    'CREATE',
    'GRANT',
    'REVOKE',
    'VACUUM',
    'ANALYZE',
    'REINDEX',
    'OPTIMIZE',
  ])

  if (writeKeywords.has(keyword)) {
    return 'write'
  }

  return 'safe'
}

function firstSqlKeyword(statement: string): string {
  return statement
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ')
    .trim()
    .split(/\s+/)[0]
    ?.toUpperCase()
}

function normalizeEnvironmentColor(color?: string): string {
  const normalized = color?.trim().toUpperCase()
  if (!normalized) {
    return DEFAULT_ENVIRONMENT_COLOR
  }

  const hexMatch = normalized.match(/^#([0-9A-F]{6})$/)
  if (hexMatch) {
    return `#${hexMatch[1]}`
  }

  const shortHexMatch = normalized.match(/^#([0-9A-F]{3})$/)
  if (shortHexMatch) {
    const [r, g, b] = shortHexMatch[1].split('')
    return `#${r}${r}${g}${g}${b}${b}`
  }

  return DEFAULT_ENVIRONMENT_COLOR
}

function normalizeSqliteClientError(error: unknown): Error {
  if (!(error instanceof Error)) {
    return new Error('Falha ao abrir banco SQLite.')
  }

  if (error.message.includes('Could not locate the bindings file')) {
    return new Error(
      'SQLite indisponível: o binário nativo não foi instalado. Rode "pnpm install" na raiz do projeto e tente novamente.',
    )
  }

  return error
}

function rankTableMatch(table: TableRef, queryLower: string): number {
  if (!queryLower) {
    return 100
  }

  const tableName = table.name.toLowerCase()
  const fqName = table.fqName.toLowerCase()

  if (tableName === queryLower) {
    return 0
  }

  if (fqName === queryLower) {
    return 1
  }

  if (tableName.startsWith(queryLower)) {
    return 2
  }

  if (fqName.startsWith(queryLower)) {
    return 3
  }

  const wordBoundary = tableName.match(new RegExp(`(^|[_\\-.])${escapeRegExp(queryLower)}`))
  if (wordBoundary) {
    return 4
  }

  if (tableName.includes(queryLower)) {
    return 5
  }

  if (fqName.includes(queryLower)) {
    return 6
  }

  return 50
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
