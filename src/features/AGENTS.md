# AGENTS.md (src/features)

## Objetivo

Cada pasta em `features` representa um domínio funcional da interface.

## Estrutura recomendada por feature

- `model/`: estado, hooks, ações e orquestração da feature.
- `ui/` (quando necessário): componentes visuais da feature.

## Regras

- Feature pode usar `entities` e `shared`.
- Feature não deve depender de outra feature diretamente sem necessidade clara.
- Chamadas de backend/IPC devem passar por `src/shared/api`.
- Evite tipos duplicados; reutilize `shared/db-types.ts` e `entities`.

## Convenções

- Nome de hook: `use<FeatureName>`.
- Evitar side-effects em utilitários puros.
- Erros devem ser normalizados via utilitário compartilhado quando aplicável.
