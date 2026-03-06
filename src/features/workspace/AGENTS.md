# AGENTS.md (src/features/workspace)

## Escopo

A feature `workspace` controla tabs SQL/tabela, edição inline, execução SQL, estados de confirmação e integração com persistência de workspace.

## Invariantes críticas

- Sempre manter ao menos uma tab SQL disponível.
- Persistência/restauração por ambiente deve preservar:
  - `workTabs`
  - `activeTabId`
  - `sqlTabCounter`
  - `selectedSchema`
- Atalhos globais não podem quebrar:
  - `Cmd/Ctrl+K` ou `P`
  - `Cmd/Ctrl+R`
  - `Cmd/Ctrl+T`
  - `Cmd/Ctrl+W`
  - `Cmd/Ctrl+S`
  - `Cmd/Ctrl+Enter`
  - `Cmd/Ctrl+/`
- Fluxo de SQL de risco exige confirmação (`EXECUTAR`).

## Regras de implementação

- Operações de table/sql devem usar `src/shared/api/pointer-api.ts`.
- Parsing SQL, normalização e helpers de tabela devem permanecer em `src/shared/lib`.
- Persistência de workspace deve permanecer em `src/shared/storage/workspace-storage.ts`.
