# Playwright no Electron (Pointer)

Guia rápido para rodar smoke tests no **Electron real** (não só browser).

## Quando usar

- Use este fluxo para validar UI + preload + IPC.
- Para testes apenas de página web, o `mcp playwright` de navegador já basta.
- Para este app, `http://localhost:5173` sozinho não cobre `pointerApi` fora do Electron.

## Pré-requisitos

- Dependências instaladas com `pnpm install`.
- Projeto na raiz `pointer`.
- Ambiente macOS (caminho de binário abaixo é macOS).

## Execução padrão

1. Suba o app em modo dev:

```bash
pnpm run dev
```

2. Em outro terminal, rode o spec:

```bash
pnpm dlx @playwright/test test <arquivo-spec>.cjs --workers=1 --reporter=list --timeout=180000
```

## Template mínimo de spec Electron

```js
const { test, expect, _electron: electron } = require('@playwright/test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

test('smoke electron', async () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'pointer-smoke-home-'))

  const electronApp = await electron.launch({
    executablePath: path.join(
      process.cwd(),
      'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron',
    ),
    args: ['.'],
    env: {
      ...process.env,
      HOME: tempHome,
      XDG_CONFIG_HOME: path.join(tempHome, '.config'),
      XDG_CACHE_HOME: path.join(tempHome, '.cache'),
      XDG_DATA_HOME: path.join(tempHome, '.local', 'share'),
      VITE_DEV_SERVER_URL: 'http://localhost:5173',
    },
  })

  const window = await electronApp.firstWindow()
  await expect(window).toHaveURL(/localhost:5173/)

  await electronApp.close()
})
```

## Fluxos já validados

1. `Cmd+K` -> buscar `Changelog` -> clicar `Abrir changelog` -> modal `Changelog` visível.
2. Criar conexão SQLite -> executar `SELECT 1 AS ok;` -> resultado com coluna `ok` e valor `1`.

## Boas práticas para reduzir flake

- Sempre usar `HOME` temporário no teste para não depender do estado local.
- Aceitar dois estados de entrada:
  - Home onboarding.
  - Workspace já aberto.
- Selecionar elementos por texto/role estáveis:
  - `Criar ambiente`
  - `Nova conexão`
  - `Salvar conexão`
  - `Executar`
  - `Abrir changelog`
  - `Changelog`

## Limpeza pós-teste

Se criar spec temporário, remover ao final:

```bash
rm -f <arquivo-spec>.cjs
rm -f test-results/.last-run.json
```

