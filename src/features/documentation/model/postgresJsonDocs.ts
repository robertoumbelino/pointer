export type SqlDocumentationExample = {
  id: string
  title: string
  description: string
  sql: string
  keywords: string[]
}

export type SqlDocumentationSection = {
  id: string
  title: string
  examples: SqlDocumentationExample[]
}

export const postgresJsonDocs: SqlDocumentationSection[] = [
  {
    id: 'basics',
    title: 'Básico',
    examples: [
      {
        id: 'simple-field',
        title: 'Campo simples',
        description: 'Use ->> para extrair o valor como texto e comparar no WHERE.',
        sql: "where metadata->>'status' = 'active'",
        keywords: ['campo', 'simples', 'texto', 'status', 'where'],
      },
      {
        id: 'nested-field',
        title: 'Campo aninhado',
        description: 'Use #>> para acessar um caminho dentro do JSON e retornar texto.',
        sql: "where metadata #>> '{customer,email}' ilike '%@empresa.com'",
        keywords: ['campo', 'aninhado', 'nested', 'path', 'email', 'ilike'],
      },
      {
        id: 'number-field',
        title: 'Número dentro do JSON',
        description: 'Converta o texto extraído antes de comparar valores numéricos.',
        sql: "where (metadata->>'score')::int >= 80",
        keywords: ['numero', 'numeric', 'int', 'score', 'cast'],
      },
      {
        id: 'boolean-field',
        title: 'Boolean dentro do JSON',
        description: 'Converta para boolean quando o JSON guarda true/false.',
        sql: "where (metadata->>'enabled')::boolean is true",
        keywords: ['boolean', 'enabled', 'true', 'false', 'cast'],
      },
      {
        id: 'key-exists',
        title: 'Chave existe',
        description: 'Use ? para testar se uma chave existe no objeto JSONB.',
        sql: "where metadata ? 'external_id'",
        keywords: ['chave', 'existe', 'key', 'external_id'],
      },
      {
        id: 'operators',
        title: 'Diferença prática entre -> e ->>',
        description: 'Use -> quando precisar manter JSON. Use ->> quando quiser texto.',
        sql: "-- ->  mantém JSON\n-- ->> retorna texto\nwhere metadata->>'status' = 'active'",
        keywords: ['operador', 'json', 'texto', 'arrow', 'seta'],
      },
    ],
  },
  {
    id: 'contains',
    title: 'Contém',
    examples: [
      {
        id: 'object-contains',
        title: 'Objeto contém valores',
        description: 'Use @> para confirmar que o JSONB contém o objeto informado.',
        sql: 'where metadata @> \'{"status":"active","source":"api"}\'::jsonb',
        keywords: ['objeto', 'contem', 'contains', 'status', 'source'],
      },
      {
        id: 'array-contains-value',
        title: 'Array contém valor',
        description: 'Use @> com array JSONB quando a chave guarda uma lista de valores.',
        sql: 'where metadata->\'tags\' @> \'["vip"]\'::jsonb',
        keywords: ['array', 'valor', 'tags', 'vip', 'contains'],
      },
      {
        id: 'array-contains-object',
        title: 'Array de objetos contém objeto',
        description: 'Use @> quando um item do array precisa conter exatamente o trecho informado.',
        sql: 'where metadata->\'items\' @> \'[{"sku":"ABC-123"}]\'::jsonb',
        keywords: ['array', 'objeto', 'items', 'sku', 'contains'],
      },
    ],
  },
  {
    id: 'arrays',
    title: 'Arrays de objetos',
    examples: [
      {
        id: 'array-object-number-condition',
        title: 'Array de objetos com condição numérica',
        description: 'Abra o array com jsonb_array_elements para combinar filtros no mesmo item.',
        sql: `where exists (
  select 1
  from jsonb_array_elements(metadata->'items') as item
  where item->>'sku' = 'ABC-123'
    and (item->>'quantity')::int > 1
)`,
        keywords: ['array', 'objeto', 'exists', 'quantity', 'numero', 'sku'],
      },
      {
        id: 'array-object-ilike',
        title: 'Array de objetos com texto parcial usando ILIKE',
        description: 'Use ILIKE depois de abrir o array para buscar parte do texto em um atributo.',
        sql: `where exists (
  select 1
  from jsonb_array_elements(metadata->'items') as item
  where item->>'name' ilike '%camiseta%'
)`,
        keywords: ['array', 'objeto', 'ilike', 'texto', 'parcial', 'name', 'camiseta'],
      },
    ],
  },
]
