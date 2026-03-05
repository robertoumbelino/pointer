# Pointer DB Explorer

Aplicativo desktop em Electron para macOS com interface estilo Shadcn (dark-first) para explorar PostgreSQL.

## Funcionalidades

- Múltiplas conexões PostgreSQL.
- Credenciais salvas no Keychain do macOS.
- Listagem de schemas e tabelas.
- Busca global de tabelas com `Cmd + K`.
- Abertura de tabela com paginação, filtro e ordenação.
- Operações básicas de dados:
  - Insert via JSON
  - Update via JSON
  - Delete da linha selecionada
- SQL editor com execução de múltiplas queries.
- Confirmação forte para comandos de escrita/destrutivos.

## Stack

- Electron + React + TypeScript (`electron-vite`)
- Tailwind CSS + componentes no padrão Shadcn
- PostgreSQL (`pg`)
- `electron-store` para metadados locais
- `keytar` para segredos

## Scripts

```bash
pnpm install
pnpm run dev
pnpm run typecheck
pnpm run lint
pnpm run build
pnpm run dist:mac
```

## Build macOS

O comando `pnpm run dist:mac` gera artefatos em `release/<version>/`:

- `.dmg`
- `.zip`

Sem assinatura/notarização nesta fase (uso local/interno).
