# Pointer

Aplicação desktop para explorar e operar bancos de dados com foco em produtividade.

[![Platform macOS](https://img.shields.io/badge/platform-macOS-0f172a?logo=apple&logoColor=white)](https://www.apple.com/macos/)
[![Electron](https://img.shields.io/badge/Electron-30.x-1f2937?logo=electron&logoColor=9FEAF9)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18-111827?logo=react&logoColor=61DAFB)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-0f172a?logo=typescript&logoColor=3178C6)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-supported-111827?logo=postgresql&logoColor=336791)](https://www.postgresql.org/)
[![ClickHouse](https://img.shields.io/badge/ClickHouse-supported-111827?logo=clickhouse&logoColor=FCCD2A)](https://clickhouse.com/)
[![SQLite](https://img.shields.io/badge/SQLite-supported-111827?logo=sqlite&logoColor=0F80CC)](https://www.sqlite.org/)

## O que o Pointer entrega

- `🗂️` Ambientes isolados (`Local`, `Produção`, etc.) com cor personalizada.
- `🔌` Conexões por ambiente para PostgreSQL, ClickHouse e SQLite.
- `⌘` Command Palette com busca global de tabelas (`Cmd+K` / `Cmd+P`).
- `🤖` Geração de SQL com IA no `Cmd+K`, com chat lateral em abas IA.
- `🧠` Filtro rápido no `Cmd+K` com `Tab` para abrir tabela já filtrada.
- `🧾` Editor SQL com highlight, autocomplete e execução por escopo.
- `🧪` Teste de conexão antes de salvar.
- `✍️` Edição inline de tabela com `Cmd+S` para persistir.
- `🗑️` Marcação de delete por linha e commit em lote.
- `🔐` Senhas no Keychain do macOS (`keytar`).
- `🔄` Sistema de update via GitHub Releases.

## Bancos suportados

| Engine | Leitura de tabela | SQL | Insert | Update inline | Delete por linha |
| --- | --- | --- | --- | --- | --- |
| PostgreSQL | Sim | Sim | Sim | Sim | Sim |
| ClickHouse | Sim | Sim | Sim | Não (nesta versão) | Não (nesta versão) |
| SQLite | Sim | Sim | Sim | Sim | Sim |

## Atalhos

| Atalho | Ação |
| --- | --- |
| `Cmd+K` / `Cmd+P` | Abrir busca global de tabelas |
| `Cmd+R` | Trocar ambiente |
| `Cmd+T` | Nova aba SQL |
| `Cmd+W` | Fechar aba ativa (não fecha se for a única) |
| `Cmd+Enter` | Executar query da aba SQL ativa (escopo no cursor) |
| `Cmd+/` | Abrir autocomplete SQL |
| `Cmd+S` | Salvar alterações pendentes da tabela |

## Instalação (usuário final)

### 1) Baixe a release

- Acesse: [Releases do Pointer](https://github.com/robertoumbelino/pointer/releases)
- Baixe o arquivo `.dmg` da versão desejada (ex.: `Pointer-Mac-0.3.3.dmg`)

### 2) Instale no macOS

- Abra o `.dmg`
- Arraste `Pointer.app` para `Applications`

### 3) Remova a quarentena do macOS

Como a aplicação ainda não é assinada/notarizada por certificado Apple, execute:

```bash
sudo xattr -rd com.apple.quarantine /Applications/Pointer.app
```

Depois disso, abra o `Pointer` normalmente pelo Launchpad/Applications.

### Observação importante

Este projeto é open source e, por enquanto, não possui certificado de desenvolvedor Apple.
Por isso, o Gatekeeper pode bloquear a primeira execução sem o comando acima.

## Atualização do app

Você pode atualizar de duas formas:

- Baixando uma nova release e substituindo o app em `Applications`
- Pelo botão de update dentro da própria aplicação (quando houver nova versão publicada)

## Desenvolvimento local

### Pré-requisitos

- macOS (Apple Silicon recomendado)
- Node.js `>= 20`
- `pnpm`

### Setup

```bash
pnpm install
pnpm run dev
```

### Scripts

```bash
pnpm run dev        # modo desenvolvimento
pnpm run typecheck  # checagem TypeScript
pnpm run lint       # lint
pnpm run build      # build renderer + electron
pnpm run dist:mac   # gera .dmg e .zip no diretório release/<version>/
```

## Build e distribuição macOS

O comando abaixo gera os artefatos de release:

```bash
pnpm run dist:mac
```

Saída esperada em `release/<version>/`:

- `Pointer-Mac-<version>.dmg`
- `Pointer-Mac-<version>.zip`
- `*.blockmap`
- `latest-mac.yml`

## Stack

- Electron + React + TypeScript (`electron-vite`)
- Tailwind + componentes no padrão Shadcn
- CodeMirror (editor SQL)
- `pg`, `@clickhouse/client`, `better-sqlite3`
- `electron-store` + `keytar`

## Segurança e dados locais

- Credenciais são salvas no Keychain do macOS.
- Metadados de ambiente/conexões/tabs são persistidos localmente.
- Quando IA está habilitada, o app envia metadados de schema (tabelas/colunas) do ambiente selecionado para o provider configurado no AI Gateway.
- Nenhum dado de conexão é enviado para serviços externos pelo app.
