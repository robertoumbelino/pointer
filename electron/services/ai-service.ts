import { createGateway } from '@ai-sdk/gateway'
import { generateText } from 'ai'
import Store from 'electron-store'
import keytar from 'keytar'
import type {
  AiConfig,
  AiConfigInput,
  AiGenerateSqlTurnInput,
  AiGenerateSqlTurnResult,
  AiProvider,
  ColumnDef,
  ConnectionSummary,
  TableRef,
} from '../../shared/db-types'
import { DbService } from './db-service'

type AiStoreShape = {
  aiConfig: {
    provider: AiProvider
    model: string
  }
}

type SchemaColumnContext = {
  name: string
  dataType: string
  nullable: boolean
  isPrimaryKey: boolean
  enumValues?: string[]
  defaultValue?: string | null
}

type SchemaTableContext = {
  schema: string
  name: string
  fqName: string
  columns: SchemaColumnContext[]
  loadError?: string
}

type SchemaConnectionContext = {
  connectionId: string
  connectionName: string
  engine: ConnectionSummary['engine']
  tables: SchemaTableContext[]
  loadError?: string
}

type EnvironmentSchemaContext = {
  environmentId: string
  generatedAt: string
  connections: SchemaConnectionContext[]
}

type CachedSchemaContext = {
  expiresAt: number
  value: EnvironmentSchemaContext
}

type ResolvedSqlTableContext = {
  connectionId: string
  table: SchemaTableContext
}

type RelevantSchemaTableCandidate = {
  connection: SchemaConnectionContext
  table: SchemaTableContext
  score: number
}

type FocusedSchemaTableSnapshot = {
  connectionId: string
  connectionName: string
  engine: ConnectionSummary['engine']
  table: string
  fqName: string
  columns: SchemaColumnContext[]
  loadError?: string
}

const AI_CONFIG_STORE_KEY = 'aiConfig'
const AI_KEYTAR_SERVICE = 'pointer-ai-gateway'
const AI_KEYTAR_ACCOUNT = 'global'
const DEFAULT_PROVIDER: AiProvider = 'vercel-gateway'
const DEFAULT_MODEL = 'minimax/minimax-m2.1'
const SCHEMA_CACHE_TTL_MS = 2 * 60 * 1000
const DESCRIBE_TABLE_MAX_ATTEMPTS = 3
const RELEVANT_TABLE_LIMIT = 12

export class AiService {
  private readonly store = new Store<AiStoreShape>({
    name: 'pointer-ai',
    defaults: {
      [AI_CONFIG_STORE_KEY]: {
        provider: DEFAULT_PROVIDER,
        model: DEFAULT_MODEL,
      },
    },
  })

  private readonly schemaContextCache = new Map<string, CachedSchemaContext>()

  constructor(private readonly dbService: DbService) {}

  async getAiConfig(): Promise<AiConfig> {
    const persisted = this.store.get(AI_CONFIG_STORE_KEY)
    const apiKey = await keytar.getPassword(AI_KEYTAR_SERVICE, AI_KEYTAR_ACCOUNT)

    return {
      provider: persisted?.provider ?? DEFAULT_PROVIDER,
      model: persisted?.model || DEFAULT_MODEL,
      hasApiKey: Boolean(apiKey && apiKey.trim().length > 0),
    }
  }

  async saveAiConfig(input: AiConfigInput): Promise<AiConfig> {
    const nextApiKey = input.apiKey?.trim()

    const provider = input.provider || DEFAULT_PROVIDER
    if (provider !== DEFAULT_PROVIDER) {
      throw new Error('Provider não suportado nesta versão.')
    }

    const model = input.model?.trim() || DEFAULT_MODEL
    const existingApiKey = await keytar.getPassword(AI_KEYTAR_SERVICE, AI_KEYTAR_ACCOUNT)

    if (nextApiKey && nextApiKey.length > 0) {
      await keytar.setPassword(AI_KEYTAR_SERVICE, AI_KEYTAR_ACCOUNT, nextApiKey)
    } else if (!existingApiKey || existingApiKey.trim().length === 0) {
      throw new Error('Informe a chave do AI Gateway.')
    }

    this.store.set(AI_CONFIG_STORE_KEY, {
      provider,
      model,
    })

    return {
      provider,
      model,
      hasApiKey: true,
    }
  }

  async removeAiConfig(): Promise<AiConfig> {
    const persisted = this.store.get(AI_CONFIG_STORE_KEY)
    await keytar.deletePassword(AI_KEYTAR_SERVICE, AI_KEYTAR_ACCOUNT)

    return {
      provider: persisted?.provider ?? DEFAULT_PROVIDER,
      model: persisted?.model || DEFAULT_MODEL,
      hasApiKey: false,
    }
  }

  async generateAiSqlTurn(input: AiGenerateSqlTurnInput): Promise<AiGenerateSqlTurnResult> {
    const environmentId = input.environmentId.trim()
    if (!environmentId) {
      throw new Error('Ambiente inválido para geração de SQL com IA.')
    }

    const prompt = input.prompt.trim()
    if (!prompt) {
      throw new Error('Informe o que deseja consultar para usar a IA.')
    }

    const config = await this.getAiConfig()
    if (!config.hasApiKey) {
      throw new Error('IA não configurada. Adicione sua chave do AI Gateway.')
    }

    const apiKey = await keytar.getPassword(AI_KEYTAR_SERVICE, AI_KEYTAR_ACCOUNT)
    if (!apiKey || apiKey.trim().length === 0) {
      throw new Error('Chave do AI Gateway não encontrada. Configure novamente.')
    }

    const schemaContext = await this.getEnvironmentSchemaContext(environmentId)
    const focusedTables = await this.hydrateRelevantSchemaForPrompt(
      environmentId,
      schemaContext,
      prompt,
      input.messages,
      input.currentSql,
    )
    const gateway = createGateway({ apiKey })

    const result = await generateText({
      model: gateway(config.model),
      system: this.buildSystemPrompt(),
      prompt: this.buildUserPrompt({
        prompt,
        currentSql: input.currentSql,
        messages: input.messages,
        schemaContext,
        focusedTables,
      }),
      temperature: 0.2,
    })

    const parsed = this.parseAiResponse(result.text)

    const connectionId = parsed.connectionId?.trim()
    const hasConnection = Boolean(
      connectionId && schemaContext.connections.some((connection) => connection.connectionId === connectionId),
    )
    const preferredConnectionId = hasConnection ? connectionId : undefined
    const normalizedSql = parsed.sql?.trim()
    const normalized = normalizedSql
      ? this.normalizeGeneratedSql(normalizedSql, schemaContext, preferredConnectionId)
      : null
    const assistantMessage = normalized?.adjusted
      ? `${parsed.assistantMessage}\n\nAjustei automaticamente nomes de coluna com base no schema disponível.`
      : parsed.assistantMessage

    return {
      assistantMessage,
      sql: normalized?.sql ?? parsed.sql,
      connectionId: hasConnection ? connectionId : undefined,
    }
  }

  private async getEnvironmentSchemaContext(environmentId: string): Promise<EnvironmentSchemaContext> {
    const now = Date.now()
    const cached = this.schemaContextCache.get(environmentId)
    if (cached && cached.expiresAt > now) {
      return cached.value
    }

    const connections = await this.dbService.listConnections(environmentId)
    const connectionContexts = await Promise.all(
      connections.map(async (connection) => {
        try {
          const tables = await this.dbService.listTables(connection.id)
          const tableContexts = await Promise.all(
            tables.map(async (table) => {
              try {
                const schema = await this.describeTableWithRetry(connection.id, table)
                return this.mapTableContext(table, schema.columns)
              } catch (error) {
                const message = error instanceof Error ? error.message : 'Erro ao carregar colunas da tabela.'
                return this.mapTableContext(table, [], message)
              }
            }),
          )

          return {
            connectionId: connection.id,
            connectionName: connection.name,
            engine: connection.engine,
            tables: tableContexts,
          } as SchemaConnectionContext
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao carregar schema da conexão.'
          return {
            connectionId: connection.id,
            connectionName: connection.name,
            engine: connection.engine,
            tables: [],
            loadError: message,
          } as SchemaConnectionContext
        }
      }),
    )

    const context: EnvironmentSchemaContext = {
      environmentId,
      generatedAt: new Date().toISOString(),
      connections: connectionContexts,
    }

    this.schemaContextCache.set(environmentId, {
      value: context,
      expiresAt: now + SCHEMA_CACHE_TTL_MS,
    })

    return context
  }

  private mapTableContext(table: TableRef, columns: ColumnDef[], loadError?: string): SchemaTableContext {
    return {
      schema: table.schema,
      name: table.name,
      fqName: table.fqName,
      columns: columns.map((column) => ({
        name: column.name,
        dataType: column.dataType,
        nullable: column.nullable,
        isPrimaryKey: column.isPrimaryKey,
        enumValues: column.enumValues,
        defaultValue: column.defaultValue,
      })),
      ...(loadError ? { loadError } : {}),
    }
  }

  private buildSystemPrompt(): string {
    return [
      'Você é um assistente especialista em SQL para PostgreSQL, ClickHouse e SQLite.',
      'Sua missão é gerar SQL correto para o pedido do usuário usando o schema fornecido.',
      'Você deve fazer inferência ativa do schema antes de pedir esclarecimentos.',
      'Quando faltar contexto, faça uma pergunta objetiva ao usuário ao invés de inventar.',
      'Use o nome direto das tabelas, sem prefixo de schema.',
      'Não use prefixos como "public.", "main." ou similares no SQL desta aplicação.',
      'Responda SEMPRE em JSON válido com o formato:',
      '{"assistantMessage":"texto","sql":"opcional","connectionId":"opcional"}',
      'Regras:',
      '- assistantMessage é obrigatório e em PT-BR.',
      '- sql deve ser enviado somente quando existir uma proposta de query.',
      '- connectionId deve ser enviado apenas se você conseguir inferir uma conexão do schema fornecido.',
      '- Ao montar SQL, referencie tabelas apenas pelo campo "name" do schema enviado.',
      '- Antes de perguntar algo ao usuário, tente mapear sozinho: entidade principal, tabela, colunas e filtros.',
      '- Use similaridade semântica (ex.: ticket/chamado/conversa/chat/atendimento) para escolher tabela alvo.',
      '- Use nomes de colunas, dataType, enumValues e defaultValue para inferir status/motivo/estado.',
      '- NUNCA invente nomes de coluna: use apenas colunas que existam exatamente na tabela escolhida.',
      '- Valide cada coluna do SQL contra o schema da tabela antes de responder.',
      '- Quando houver colunas com nomes parecidos, prefira correspondência exata do schema.',
      '- Mapeie termos naturais do usuário para possíveis valores persistidos (ex.: ativo/inativo, aberto/fechado, erro/timeout), usando o schema como fonte de verdade.',
      '- Se existir uma hipótese forte e única, gere SQL diretamente e explique a suposição no assistantMessage.',
      '- Só faça pergunta quando houver ambiguidade real entre múltiplas tabelas/colunas com confiança parecida.',
      '- Se alguma tabela vier sem colunas, continue investigando outras tabelas relevantes antes de perguntar.',
      '- Evite pedir nome de tabela/coluna se isso puder ser inferido do schema fornecido.',
      '- Não inclua markdown, bloco de código ou texto fora do JSON.',
    ].join('\n')
  }

  private buildUserPrompt(input: {
    prompt: string
    currentSql?: string
    messages: AiGenerateSqlTurnInput['messages']
    schemaContext: EnvironmentSchemaContext
    focusedTables: FocusedSchemaTableSnapshot[]
  }): string {
    const history = input.messages
      .map((message, index) => `${index + 1}. ${message.role.toUpperCase()}: ${message.content}`)
      .join('\n')

    return [
      `Pedido atual do usuário: ${input.prompt}`,
      '',
      'Política de decisão:',
      '- Primeiro tente resolver sozinho com o schema completo.',
      '- Só retorne pergunta se não houver hipótese confiável.',
      '- Interprete o pedido em linguagem natural e procure no schema colunas/valores equivalentes sem depender de termos idênticos.',
      '- Antes de retornar SQL, confira se todos os nomes de colunas usados existem exatamente na tabela alvo.',
      '- Priorize o bloco de tabelas relevantes para esta solicitação antes do schema completo.',
      '',
      'Regra importante de geração SQL:',
      '- Não prefixar tabela com schema (ex.: não usar public.tabela ou main.tabela).',
      '- Usar somente o nome direto da tabela.',
      '',
      'SQL atual da aba (pode estar vazio):',
      input.currentSql?.trim() || '(vazio)',
      '',
      'Histórico da conversa até agora:',
      history || '(sem histórico)',
      '',
      'Tabelas mais relevantes para este pedido:',
      JSON.stringify(input.focusedTables),
      '',
      'Schema completo do ambiente (todas as conexões):',
      JSON.stringify(input.schemaContext),
      '',
      'Retorne apenas o JSON solicitado no system prompt.',
    ].join('\n')
  }

  private async hydrateRelevantSchemaForPrompt(
    environmentId: string,
    schemaContext: EnvironmentSchemaContext,
    prompt: string,
    messages: AiGenerateSqlTurnInput['messages'],
    currentSql?: string,
  ): Promise<FocusedSchemaTableSnapshot[]> {
    const candidates = this.findRelevantSchemaTables(schemaContext, prompt, messages, currentSql)
    let changed = false

    for (const candidate of candidates) {
      if (candidate.table.columns.length > 0) {
        continue
      }

      try {
        const tableRef: TableRef = {
          schema: candidate.table.schema,
          name: candidate.table.name,
          fqName: candidate.table.fqName,
        }
        const schema = await this.describeTableWithRetry(candidate.connection.connectionId, tableRef)
        candidate.table.columns = schema.columns.map((column) => ({
          name: column.name,
          dataType: column.dataType,
          nullable: column.nullable,
          isPrimaryKey: column.isPrimaryKey,
          enumValues: column.enumValues,
          defaultValue: column.defaultValue,
        }))
        delete candidate.table.loadError
        changed = true
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao carregar colunas da tabela.'
        candidate.table.loadError = message
      }
    }

    if (changed) {
      schemaContext.generatedAt = new Date().toISOString()
      this.schemaContextCache.set(environmentId, {
        value: schemaContext,
        expiresAt: Date.now() + SCHEMA_CACHE_TTL_MS,
      })
    }

    return candidates.map((candidate) => ({
      connectionId: candidate.connection.connectionId,
      connectionName: candidate.connection.connectionName,
      engine: candidate.connection.engine,
      table: candidate.table.name,
      fqName: candidate.table.fqName,
      columns: candidate.table.columns,
      ...(candidate.table.loadError ? { loadError: candidate.table.loadError } : {}),
    }))
  }

  private findRelevantSchemaTables(
    schemaContext: EnvironmentSchemaContext,
    prompt: string,
    messages: AiGenerateSqlTurnInput['messages'],
    currentSql?: string,
  ): RelevantSchemaTableCandidate[] {
    const tokens = this.tokenizeForLookup(this.buildPromptCorpus(prompt, messages, currentSql))
    const explicitTableNames = new Set([
      ...this.extractTableNamesFromSql(prompt),
      ...this.extractTableNamesFromSql(currentSql || ''),
    ])
    const scored: RelevantSchemaTableCandidate[] = []

    for (const connection of schemaContext.connections) {
      for (const table of connection.tables) {
        const score = this.calculateTableRelevanceScore(table.name, tokens, explicitTableNames)
        if (score <= 0) {
          continue
        }

        scored.push({
          connection,
          table,
          score,
        })
      }
    }

    scored.sort((left, right) => right.score - left.score || left.table.name.localeCompare(right.table.name))
    return scored.slice(0, RELEVANT_TABLE_LIMIT)
  }

  private buildPromptCorpus(
    prompt: string,
    messages: AiGenerateSqlTurnInput['messages'],
    currentSql?: string,
  ): string {
    const recentMessages = messages.slice(-8).map((message) => message.content)
    return [prompt, currentSql || '', ...recentMessages].join(' ')
  }

  private tokenizeForLookup(input: string): Set<string> {
    const tokens = new Set<string>()
    const rawTokens = input.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) ?? []

    rawTokens.forEach((rawToken) => {
      const normalized = this.normalizeLookupToken(rawToken)
      if (!normalized || normalized.length < 3) {
        return
      }

      tokens.add(normalized)
      if (normalized.endsWith('s') && normalized.length > 3) {
        tokens.add(normalized.slice(0, -1))
      }
    })

    return tokens
  }

  private extractTableNamesFromSql(text: string): Set<string> {
    const matches = new Set<string>()
    const tableRefRegex = /\b(?:from|join)\s+([a-zA-Z0-9_."`]+)/gi

    let match = tableRefRegex.exec(text)
    while (match) {
      const extracted = this.extractSqlTableName(match[1] || '')
      const normalized = this.normalizeLookupToken(extracted)
      if (normalized) {
        matches.add(normalized)
      }
      match = tableRefRegex.exec(text)
    }

    return matches
  }

  private calculateTableRelevanceScore(
    tableName: string,
    tokens: Set<string>,
    explicitTableNames: Set<string>,
  ): number {
    const normalizedTableName = this.normalizeLookupToken(tableName)
    if (!normalizedTableName) {
      return 0
    }

    let score = 0
    if (explicitTableNames.has(normalizedTableName)) {
      score += 250
    }

    const tableParts = normalizedTableName.split('_').filter((part) => part.length >= 3)

    tokens.forEach((token) => {
      if (token === normalizedTableName) {
        score += 180
        return
      }

      if (normalizedTableName.includes(token) && token.length >= 4) {
        score += 55
      }

      if (token.includes(normalizedTableName) && normalizedTableName.length >= 4) {
        score += 30
      }

      if (tableParts.includes(token)) {
        score += 40
      }
    })

    return score
  }

  private async describeTableWithRetry(connectionId: string, table: TableRef): Promise<Awaited<ReturnType<DbService['describeTable']>>> {
    let lastError: unknown = null

    for (let attempt = 1; attempt <= DESCRIBE_TABLE_MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.dbService.describeTable(connectionId, table)
      } catch (error) {
        lastError = error
        if (attempt < DESCRIBE_TABLE_MAX_ATTEMPTS) {
          await this.sleep(80 * attempt)
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Erro ao descrever tabela.')
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms)
    })
  }

  private parseAiResponse(text: string): {
    assistantMessage: string
    sql?: string
    connectionId?: string
  } {
    const parsed = this.tryParseJson(text)
    if (!parsed) {
      const normalized = text.trim()
      return {
        assistantMessage: normalized || 'Não consegui gerar SQL com o retorno atual. Pode detalhar melhor?',
      }
    }

    const assistantMessage =
      typeof parsed.assistantMessage === 'string' && parsed.assistantMessage.trim().length > 0
        ? parsed.assistantMessage.trim()
        : 'Posso te ajudar a refinar essa consulta.'

    const sql = typeof parsed.sql === 'string' && parsed.sql.trim().length > 0 ? parsed.sql.trim() : undefined
    const connectionId =
      typeof parsed.connectionId === 'string' && parsed.connectionId.trim().length > 0
        ? parsed.connectionId.trim()
        : undefined

    return {
      assistantMessage,
      sql,
      connectionId,
    }
  }

  private tryParseJson(text: string): Record<string, unknown> | null {
    const normalized = text.trim()
    if (!normalized) {
      return null
    }

    try {
      return JSON.parse(normalized) as Record<string, unknown>
    } catch {
      const fencedMatch = normalized.match(/```json\s*([\s\S]*?)\s*```/i)
      if (fencedMatch?.[1]) {
        try {
          return JSON.parse(fencedMatch[1]) as Record<string, unknown>
        } catch {
          return null
        }
      }

      const start = normalized.indexOf('{')
      const end = normalized.lastIndexOf('}')
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(normalized.slice(start, end + 1)) as Record<string, unknown>
        } catch {
          return null
        }
      }

      return null
    }
  }

  private normalizeGeneratedSql(
    sql: string,
    schemaContext: EnvironmentSchemaContext,
    preferredConnectionId?: string,
  ): { sql: string; adjusted: boolean } {
    const resolved = this.resolveSqlTableContexts(sql, schemaContext, preferredConnectionId)
    if (resolved.resolvedTables.length === 0) {
      return { sql, adjusted: false }
    }

    const defaultTable = resolved.resolvedTables.length === 1 ? resolved.resolvedTables[0] : null
    let adjusted = false
    const predicateRegex =
      /\b(?:([a-zA-Z_][\w]*)\.)?([a-zA-Z_][\w]*)\b(\s*(?:=|!=|<>|<=|>=|<|>|like\b|ilike\b|in\s*\(|is\s+(?:not\s+)?null\b))/gi

    const correctedSql = sql.replace(predicateRegex, (match, aliasRaw: string | undefined, columnRaw: string, operatorRaw: string) => {
      const target = aliasRaw
        ? resolved.aliasToTable.get(this.normalizeSqlIdentifier(aliasRaw)) ?? null
        : defaultTable

      if (!target) {
        return match
      }

      if (this.hasExactColumn(target.table.columns, columnRaw)) {
        return match
      }

      const replacementColumn = this.findClosestColumnName(columnRaw, target.table.columns)
      if (!replacementColumn) {
        return match
      }

      adjusted = true
      return aliasRaw ? `${aliasRaw}.${replacementColumn}${operatorRaw}` : `${replacementColumn}${operatorRaw}`
    })

    return {
      sql: correctedSql,
      adjusted,
    }
  }

  private resolveSqlTableContexts(
    sql: string,
    schemaContext: EnvironmentSchemaContext,
    preferredConnectionId?: string,
  ): {
    aliasToTable: Map<string, ResolvedSqlTableContext>
    resolvedTables: ResolvedSqlTableContext[]
  } {
    const tableRefRegex = /\b(?:from|join)\s+([a-zA-Z0-9_."`]+)\s*(?:as\s+)?([a-zA-Z_][\w]*)?/gi
    const aliasToTable = new Map<string, ResolvedSqlTableContext>()
    const resolvedTables: ResolvedSqlTableContext[] = []

    let match: RegExpExecArray | null = tableRefRegex.exec(sql)
    while (match) {
      const rawTableToken = match[1] ?? ''
      const tableName = this.extractSqlTableName(rawTableToken)
      const resolvedTable = this.findSchemaTableByName(schemaContext, tableName, preferredConnectionId)
      if (resolvedTable) {
        resolvedTables.push(resolvedTable)
        const aliasToken = match[2] || tableName
        aliasToTable.set(this.normalizeSqlIdentifier(aliasToken), resolvedTable)
      }
      match = tableRefRegex.exec(sql)
    }

    return {
      aliasToTable,
      resolvedTables,
    }
  }

  private extractSqlTableName(token: string): string {
    const normalized = token.trim().replace(/["`]/g, '')
    if (!normalized) {
      return ''
    }

    const segments = normalized.split('.').filter(Boolean)
    return segments[segments.length - 1] || ''
  }

  private findSchemaTableByName(
    schemaContext: EnvironmentSchemaContext,
    tableName: string,
    preferredConnectionId?: string,
  ): ResolvedSqlTableContext | null {
    const normalizedTableName = this.normalizeSqlIdentifier(tableName)
    if (!normalizedTableName) {
      return null
    }

    const matches: ResolvedSqlTableContext[] = []
    for (const connection of schemaContext.connections) {
      for (const table of connection.tables) {
        const normalizedName = this.normalizeSqlIdentifier(table.name)
        if (normalizedName === normalizedTableName) {
          matches.push({ connectionId: connection.connectionId, table })
        }
      }
    }

    if (matches.length === 0) {
      return null
    }

    if (preferredConnectionId) {
      const preferred = matches.find((match) => match.connectionId === preferredConnectionId)
      if (preferred) {
        return preferred
      }
    }

    return matches.length === 1 ? matches[0] : null
  }

  private hasExactColumn(columns: SchemaColumnContext[], candidate: string): boolean {
    const normalizedCandidate = this.normalizeSqlIdentifier(candidate)
    return columns.some((column) => this.normalizeSqlIdentifier(column.name) === normalizedCandidate)
  }

  private findClosestColumnName(candidate: string, columns: SchemaColumnContext[]): string | null {
    const normalizedCandidate = this.normalizeSqlIdentifier(candidate)
    if (!normalizedCandidate) {
      return null
    }

    let bestMatch: { name: string; distance: number; prefixLength: number; ratio: number } | null = null
    for (const column of columns) {
      const normalizedColumn = this.normalizeSqlIdentifier(column.name)
      if (!normalizedColumn) {
        continue
      }

      const distance = this.levenshteinDistance(normalizedCandidate, normalizedColumn)
      const maxLen = Math.max(normalizedCandidate.length, normalizedColumn.length)
      const ratio = maxLen > 0 ? distance / maxLen : 1
      const prefixLength = this.commonPrefixLength(normalizedCandidate, normalizedColumn)
      const distanceThreshold = Math.max(2, Math.ceil(maxLen * 0.34))
      const isConfident = distance <= distanceThreshold && (prefixLength >= 3 || ratio <= 0.22)

      if (!isConfident) {
        continue
      }

      if (
        !bestMatch ||
        distance < bestMatch.distance ||
        (distance === bestMatch.distance && prefixLength > bestMatch.prefixLength)
      ) {
        bestMatch = {
          name: column.name,
          distance,
          prefixLength,
          ratio,
        }
      }
    }

    return bestMatch?.name ?? null
  }

  private commonPrefixLength(left: string, right: string): number {
    const max = Math.min(left.length, right.length)
    let index = 0

    while (index < max && left[index] === right[index]) {
      index += 1
    }

    return index
  }

  private levenshteinDistance(left: string, right: string): number {
    if (left === right) {
      return 0
    }

    if (left.length === 0) {
      return right.length
    }

    if (right.length === 0) {
      return left.length
    }

    const previous = new Array(right.length + 1).fill(0).map((_, index) => index)
    const current = new Array(right.length + 1).fill(0)

    for (let i = 1; i <= left.length; i += 1) {
      current[0] = i
      for (let j = 1; j <= right.length; j += 1) {
        const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1
        current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + substitutionCost)
      }

      for (let j = 0; j <= right.length; j += 1) {
        previous[j] = current[j]
      }
    }

    return previous[right.length]
  }

  private normalizeLookupToken(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/["`]/g, '')
      .replace(/[^a-z0-9_]/g, '')
  }

  private normalizeSqlIdentifier(value: string): string {
    return value
      .trim()
      .replace(/["`]/g, '')
      .toLowerCase()
  }
}
