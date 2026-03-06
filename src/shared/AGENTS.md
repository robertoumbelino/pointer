# AGENTS.md (src/shared)

## Objetivo

`shared` contém blocos reutilizáveis e estáveis entre features.

## Subpastas

- `api/`: wrappers de acesso ao IPC (`pointerApi`).
- `constants/`: constantes globais de UI/fluxo.
- `lib/`: funções utilitárias puras e helpers comuns.
- `storage/`: serialização/restauração de estado persistido.

## Regras

- Não adicionar regra de negócio específica de uma feature aqui.
- Preferir funções puras em `lib` (sem side effects).
- Evitar dependência de `features` a partir de `shared`.
- Mudanças de contrato IPC devem ser refletidas em `shared/db-types.ts` (raiz), mantendo compatibilidade.
