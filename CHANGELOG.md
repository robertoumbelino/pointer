# Changelog

Este histórico documenta as versões do Pointer com foco no impacto para quem usa o app no dia a dia.

## v0.4.0 - 2026-03-07

### ✨ Novidades
- Execução de SQL por atalho `F5`, acelerando o fluxo de trabalho em abas SQL.
- Suporte à visualização e edição inline de valores JSON/JSONB em células de tabela.
- Suporte a colunas `ENUM` com seleção inline para edição mais segura e rápida.
- `Cmd+K` evoluído para busca universal com seção de ações (incluindo abrir changelog e checar atualizações).

### 🐛 Correções
- Correção na serialização de colunas JSON/JSONB durante o salvamento de alterações em tabela.
- Estabilização da ordenação e do estado de loading no preview de tabelas.
- Ajuste visual para reduzir blur excessivo no diálogo do command palette.

### ♻️ Melhorias
- Melhorias no editor SQL com line wrap, altura de resultado otimizada e área inicial mais confortável.
- Ajustes de acabamento visual na top bar de update e no diálogo de troca de ambiente.

### 🏗️ Arquitetura
- Reorganização do renderer para arquitetura Feature-Sliced, com separação clara entre `app`, `features`, `entities` e `shared`.
- Extração da composição principal para `PointerWorkbench` com fluxos/hook de persistência desacoplados.

### 📚 Documentação
- README reescrito com instruções mais completas de instalação e guia de quarantine no macOS.

## v0.3.3 - 2026-03-06

### ✨ Novidades
- Atalho `Cmd+W` para fechar aba ativa.

## v0.3.2 - 2026-03-06

### ✨ Novidades
- Conector SQLite com file picker e suporte ao runtime nativo no app empacotado.

### 🐛 Correções
- Melhorias de foco do `Cmd+K` e dica visual de uso com `Tab`.

## v0.2.0 - 2026-03-05

### ✨ Novidades
- Melhorias no fluxo de comandos e na experiência de uso de tabelas.

## v0.1.4 - 2026-03-05

### ✨ Novidades
- Inserção inline de linha em tabela.
- Botão de update movido para o header.

## v0.1.3 - 2026-03-05

### ✨ Novidades
- Exibição da versão atual do app no header.

## v0.1.2 - 2026-03-05

### ✨ Novidades
- Fluxo de atualização in-app via GitHub Releases.

## v0.1.1 - 2026-03-05

### 🚀 Release inicial
- Primeira versão do Pointer desktop app.
