# AGENTS.md

## Arquitetura do renderer (Feature-Sliced)

O frontend do Pointer segue arquitetura orientada a features, com composição na camada `app` e regras de domínio distribuídas em `features`, `entities` e `shared`.

### Camadas

- `src/app`: composição da tela principal e bootstrap de UI.
- `src/features`: casos de uso da interface por domínio (environments, connections, workspace, command palette, app-update).
- `src/entities`: tipos e estruturas de domínio usadas pelas features.
- `src/shared`: wrappers de API, utilitários puros, constantes e storage.

## Regras de fronteira

- Somente `src/shared/api` acessa `window.pointerApi`.
- `src/features` não deve chamar `window.pointerApi` diretamente.
- Tipos IPC públicos devem permanecer em `shared/db-types.ts` (raiz do projeto).
- Utilitários sem efeito colateral ficam em `src/shared/lib`.
- Persistência local de workspace fica em `src/shared/storage`.

## Invariantes críticas (não quebrar)

- Storage key de workspace: `pointer.workspace.v1`.
- Contrato `PointerApi`/IPC sem mudanças de assinatura.
- Atalhos de teclado existentes devem manter comportamento.
- Fluxos SQL/table edit devem manter mensagens e confirmação de risco.
- Não alterar intencionalmente layout/visual sem pedido explícito.

## Checklist obrigatório antes de merge

- `pnpm run typecheck`
- `pnpm run lint`
- Smoke manual:
  - ambientes (create/edit/delete)
  - conexões (create/test/edit/delete)
  - command palette e scoped filter
  - tabs SQL/tabela e atalhos
  - edição inline + save/delete
  - execução SQL (safe/risk)
  - persistência de workspace por ambiente
