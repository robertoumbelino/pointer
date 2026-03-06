# AGENTS.md (src/app)

## Responsabilidade

`src/app` é a camada de composição. Ela conecta hooks/features e monta a interface final.

## Regras

- Evite colocar regra de negócio nova em componentes de `app`.
- Prefira delegar para hooks em `src/features/*/model`.
- Não acessar `window.pointerApi` daqui; use `src/shared/api/pointer-api.ts`.
- Quando possível, mantenha componentes de `app` como orchestrators.

## Mudanças seguras

- Ajustar composição entre features.
- Reorganizar layout sem alterar comportamento funcional.
- Encaminhar efeitos colaterais para `features`/`shared`.
