# GIT.md

## Padrão de commits do Pointer

Formato obrigatório (uma única linha, sem descrição longa):

```text
<emoji> <tipo>(<contexto>): <verbo-passado> <descricao>
```

Exemplo:

```text
✨ feat(workspace): added tab persistence by environment
```

## Tipos e emojis

| Emoji | Tipo | Uso |
| --- | --- | --- |
| ✨ | feat | Nova funcionalidade |
| 🐛 | fix | Correção de bug |
| ♻️ | refactor | Refatoração de código |
| 🧪 | test | Adição/modificação de testes |
| 📝 | docs | Documentação |
| 🔧 | chore | Tarefas de manutenção |

Regra: tipo e emoji devem corresponder.

## Contexto (obrigatório)

O contexto deve estar entre parênteses após o tipo.

Exemplos comuns no Pointer:

- `app`
- `environments`
- `connections`
- `workspace`
- `command-palette`
- `app-update`
- `sql`
- `table`
- `shortcuts`
- `electron`
- `build`
- `release`
- `docs`
- `lint`
- `types`

## Descrição

- Obrigatória
- Em inglês
- Toda em lowercase
- Deve começar com verbo no passado aprovado
- Não terminar com ponto final
- Frase curta e objetiva

Verbos no passado permitidos:

```text
added, updated, deleted, fixed, refactored, tested, documented,
changed, removed, improved, created, implemented, migrated,
optimized, moved, modified, increased
```

## Exemplos válidos

```text
✨ feat(environments): added environment duplication flow
🐛 fix(sql): fixed unsafe query confirmation bypass
♻️ refactor(connections): refactored form state handling
🧪 test(workspace): added tests for persisted tabs
📝 docs(readme): updated setup instructions
🔧 chore(lint): improved eslint config for renderer
```

## Exemplos inválidos

```text
feat(workspace): added tab restore
✨ feat: added tab restore
✨ feat(workspace): Added tab restore
✨ feat(workspace): add tab restore
🐛 feat(workspace): fixed tab restore
✨ feat(workspace): added tab restore.
```

## Reescrita de histórico

Reescrever toda a árvore de commits é possível, mas impacta hashes e histórico remoto.
No Pointer, isso deve ser feito somente com alinhamento prévio do time e plano de sincronização.
