import { cookies, headers } from 'next/headers'
import { LanguageSwitcher } from './LanguageSwitcher'
import { QuarantineCommand } from './QuarantineCommand'
import { getTranslation, resolveLocale } from './i18n'

const repositoryUrl = 'https://github.com/robertoumbelino/pointer'
const releaseVersion = 'v0.15.2'
const releaseUrl = `${repositoryUrl}/releases/download/${releaseVersion}/Pointer-Mac-${releaseVersion.slice(1)}.dmg`

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <span />
    </span>
  )
}

function ArrowIcon() {
  return <span aria-hidden="true">↓</span>
}

function ShortcutCopy({ shortcut, text }: { shortcut: string; text: string }) {
  const [before, after = ''] = text.split(shortcut)

  return <>{before}<kbd>{shortcut}</kbd>{after}</>
}

function AppPreview() {
  return (
    <div className="product-stage" aria-label="Demonstração visual fiel do aplicativo Pointer">
      <div className="stage-glow" />
      <div className="product-callout callout-shortcut">
        <kbd>⌘ K</kbd>
        <span>Abra qualquer coisa</span>
      </div>
      <div className="product-callout callout-speed">
        <strong>3 bancos</strong>
        <span>um único workspace</span>
      </div>

      <div className="app-window real-app-window">
        <div className="real-app-topbar">
          <div className="traffic-lights" aria-hidden="true"><span /><span /><span /></div>
          <div><span>＋</span><span>↻</span><i /><small>{releaseVersion}</small></div>
        </div>

        <div className="real-app-grid">
          <aside className="real-sidebar">
            <div className="real-side-card connections-card">
              <div className="real-brandline"><BrandMark /><div><strong>Pointer</strong><small>Ambientes e Bancos</small></div><em>3</em></div>
              <div className="real-side-label"><span>AMBIENTE</span><span>＋ &nbsp;•••</span></div>
              <div className="real-select">Local <span>⌄</span></div>
              <div className="real-side-label connections-label"><span>CONEXÕES</span></div>
              {[
                ['ClickHouse', 'CH'],
                ['PostgreSQL', 'PG'],
                ['SQLite', 'SQ'],
              ].map(([name, engine]) => (
                <div className="real-connection" key={name}>
                  <span>▱</span><strong>{name}</strong><em>{engine}</em><i>▥</i><b>•••</b>
                </div>
              ))}
              <div className="new-connection">＋ Nova</div>
            </div>

            <div className="real-side-card schema-card">
              <div className="real-side-label"><span>SCHEMA</span></div>
              <div className="real-select">Todos <span>⌄</span></div>
              <div className="real-schema-search">⌕&nbsp;&nbsp; Buscar tabela… <kbd>⌘K</kbd></div>
              <div className="real-tables">
                {['customers', 'orders', 'products', 'invoices', 'payments', 'sessions', 'audit_logs'].map((table) => (
                  <span key={table}>▦ <strong>{table}</strong><em>CH</em></span>
                ))}
              </div>
            </div>
          </aside>

          <section className="real-workspace">
            <div className="real-tabs"><span>▱ &nbsp; SQL 1</span></div>
            <div className="real-editor-card">
              <div className="real-editor-toolbar">
                <div><strong>SQL 1</strong><small>Executar escopo: Cmd+Enter · Autocomplete: Cmd+/ · Estrutura: Cmd+Click · Nova aba SQL: Cmd+T</small></div>
                <div className="real-editor-actions"><span>Auto⌄</span><span>▱ Carregar</span><span>▣ Salvar</span><b>▷ Executar</b></div>
              </div>
              <div className="real-editor-body">
                <span className="real-line-numbers">1<br />2<br />3<br />4<br />5<br />6<br />7<br />8<br />9<br />10</span>
                <code><em>SELECT</em> <strong>NOW()</strong> <em>AS</em> current_time;</code>
              </div>
            </div>
            <div className="real-splitter"><span /></div>
            <div className="real-result-card">
              <strong>RESULTADO</strong>
              <p>Execute uma query para ver o resultado.</p>
            </div>
          </section>
        </div>
      </div>
      <div className="stage-caption">
        <span className="live-dot" />
        Feito para teclado. Pronto para o seu banco.
      </div>
    </div>
  )
}

function CommandPalettePreview() {
  return (
    <div className="moment-window command-window" aria-label="Command Palette do Pointer">
      <div className="moment-appbar"><span>SQL 1</span><span>main.orders</span><i /></div>
      <div className="command-backdrop">
        <div className="command-dialog">
          <div className="command-search"><span>⌕</span><strong>Buscar tabelas e ações...</strong><kbd>⌘ K</kbd></div>
          <p>AÇÕES</p>
          <div className="command-option selected"><span>✦</span><div><strong>Usar IA</strong><small>Converse com o schema aberto</small></div><kbd>Enter</kbd></div>
          <div className="command-option"><span>▱</span><div><strong>Abrir documentação SQL</strong><small>Atalhos, funções e exemplos</small></div></div>
          <div className="command-option"><span>↻</span><div><strong>Verificar atualização</strong><small>Buscar uma nova versão do Pointer</small></div></div>
        </div>
      </div>
    </div>
  )
}

function WorkspacesPreview() {
  return (
    <div className="workspace-showcase" aria-label="Workspaces Local e Produção no Pointer">
      <div className="workspace-switcher">
        <div className="environment-dialog">
          <div className="environment-search">
            <span>⌕</span>
            <strong>Trocar ambiente... <em>(Ctrl+R)</em></strong>
            <i>×</i>
          </div>
          <div className="environment-option selected">
            <span>▱</span><strong>Local</strong><em>Ativo</em>
          </div>
          <div className="environment-option">
            <span>▱</span><strong>Produção</strong>
          </div>
        </div>
        <div className="workspace-shortcut"><kbd>Ctrl+R</kbd><span>trocar ambiente</span></div>
      </div>

      <div className="workspace-context">
        <div className="workspace-context-head"><span className="workspace-color local-color" /><div><small>AMBIENTE ATUAL</small><strong>Local</strong></div><kbd>Ctrl+R</kbd></div>
        <p>Conexões deste workspace</p>
        <div className="workspace-databases">
          <div><i>PG</i><span><strong>PostgreSQL</strong><small>localhost:5432</small></span><em>online</em></div>
          <div><i>CH</i><span><strong>ClickHouse</strong><small>localhost:8123</small></span><em>online</em></div>
          <div><i>SQ</i><span><strong>SQLite</strong><small>./data/app.db</small></span><em>local</em></div>
        </div>
        <div className="workspace-note"><span>Contexto isolado</span><strong>credenciais · abas · conexões</strong></div>
      </div>
    </div>
  )
}

function TableViewPreview() {
  return (
    <div className="moment-window table-window" aria-label="Visualização de tabela do Pointer">
      <div className="table-toolbar">
        <div><small>TABELA ATUAL</small><strong>main.orders <em>(SQLite)</em></strong></div>
        <div className="table-actions"><span>id⌄</span><span>ilike⌄</span><span>Filtrar</span><span>↻ Atualizar</span><b>＋ Inserir</b></div>
      </div>
      <div className="premium-table">
        <div className="premium-table-row premium-table-head"><span>#</span><span>id</span><span>customer_id</span><span>status</span><span>total</span></div>
        {[
          ['1', '10219', '4', 'processando', '349,90'],
          ['2', '10220', '3', 'enviado', '1.499,00'],
          ['3', '10221', '2', 'pago', '129,90'],
          ['4', '10234', '1', 'pago', '599,90'],
        ].map((row) => <div className="premium-table-row" key={row[1]}>{row.map((cell) => <span key={cell}>{cell}</span>)}</div>)}
      </div>
      <div className="table-footer"><span>Página 1 · 100 registros por página</span><strong>↓ Exportar⌄</strong></div>
    </div>
  )
}

function ConnectionDashboardPreview() {
  return (
    <div className="moment-window dashboard-window" aria-label="Dashboard da conexão SQLite no Pointer">
      <div className="dashboard-head"><div><strong>Dashboard SQLite</strong><small>Atualização automática a cada 30s · agora</small></div><span>↻ Atualizar agora</span></div>
      <div className="metric-grid">
        <div className="metric-card health-metric"><small>◉ SAÚDE</small><div><strong>96</strong><em>Saudável</em></div><span><i /></span></div>
        <div className="metric-card"><small>▣ TAMANHO ESTIMADO</small><strong>12,4 MB</strong><p>3.176 páginas</p></div>
        <div className="metric-card"><small>▦ TABELAS</small><strong>3</strong><p>2 índices · 0 views</p></div>
        <div className="metric-card"><small>◌ FRAGMENTAÇÃO</small><strong>1,8%</strong><p>57 páginas livres</p></div>
      </div>
      <div className="dashboard-lower">
        <div className="trend-card"><div><strong>Saúde e fragmentação</strong><small>Últimas coletas</small></div><div className="trend-bars" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /></div><span><em>● Saúde 96</em><em>● Fragmentação 1,8%</em></span></div>
        <div className="engine-card"><small>SQLITE</small><strong>3.46.0</strong><p><span>journal_mode</span><b>WAL</b></p><p><span>synchronous</span><b>NORMAL</b></p><p><span>auto_vacuum</span><b>NONE</b></p></div>
      </div>
    </div>
  )
}

export default async function Home() {
  const [headerStore, cookieStore] = await Promise.all([headers(), cookies()])
  const locale = resolveLocale(cookieStore.get('pointer.locale')?.value, headerStore.get('accept-language'))
  const copy = getTranslation(locale)

  return (
    <main lang={copy.htmlLang}>
      <header className="site-header">
        <a href="#inicio" className="brand" aria-label="Pointer, início">
          <BrandMark />
          <span>Pointer</span>
        </a>
        <nav aria-label={copy.nav.aria}>
          <a href="#produto">{copy.nav.product}</a>
          <a href="#recursos">{copy.nav.features}</a>
          <a href={repositoryUrl} target="_blank" rel="noreferrer">GitHub</a>
        </nav>
        <div className="header-actions">
          <LanguageSwitcher ariaLabel={copy.nav.language} locale={locale} />
          <a className="header-download" href={releaseUrl} target="_blank" rel="noreferrer">
            {copy.nav.download} <ArrowIcon />
          </a>
        </div>
      </header>

      <section className="hero" id="inicio">
        <div className="hero-orbit" aria-hidden="true" />
        <p className="eyebrow">{copy.hero.eyebrow}</p>
        <h1>
          {copy.hero.title}<br />
          <span>{copy.hero.titleAccent}</span>
        </h1>
        <p className="hero-copy">
          {copy.hero.copy}
        </p>
        <p className="status-line">
          <span>{copy.hero.shortcut}</span><i />
          <span>PostgreSQL · ClickHouse · SQLite</span><i />
          <span>{copy.hero.noAccount}</span>
        </p>
        <div className="hero-actions">
          <a className="primary-cta" href={releaseUrl} target="_blank" rel="noreferrer">
            <ArrowIcon /> {copy.hero.download}
          </a>
          <a className="secondary-cta" href={repositoryUrl} target="_blank" rel="noreferrer">
            {copy.hero.github} <span aria-hidden="true">↗</span>
          </a>
        </div>
        <p className="download-meta">Apple Silicon · {releaseVersion} · {copy.hero.preview}</p>
        <QuarantineCommand
          ariaLabel={copy.quarantine.aria}
          copiedLabel={copy.quarantine.copied}
          copyLabel={copy.quarantine.copy}
          notice={copy.quarantine.notice}
        />
      </section>

      <section className="product-reveal" id="produto">
        <AppPreview />
      </section>

      <section className="database-strip" aria-label="Bancos suportados">
        <span>{copy.databases}</span>
        <strong><i className="postgres-mark">P</i> PostgreSQL</strong>
        <strong><i className="clickhouse-mark" /> ClickHouse</strong>
        <strong><i className="sqlite-mark">S</i> SQLite</strong>
      </section>

      <section className="feature-intro" id="recursos">
        <p className="section-kicker">{copy.intro.kicker}</p>
        <h2>{copy.intro.title}<br /><span>{copy.intro.accent}</span></h2>
        <p>{copy.intro.copy}</p>
      </section>

      <section className="moments-grid" aria-label={copy.moments.aria}>
        <article className="moment-card workspace-moment">
          <div className="moment-copy">
            <span>{copy.moments.workspace.label}</span>
            <h3>{copy.moments.workspace.title}</h3>
            <p><ShortcutCopy shortcut="Ctrl+R" text={copy.moments.workspace.copy} /></p>
          </div>
          <WorkspacesPreview />
        </article>

        <article className="moment-card command-moment">
          <div className="moment-copy">
            <span>{copy.moments.command.label}</span>
            <h3>{copy.moments.command.title}</h3>
            <p><ShortcutCopy shortcut="⌘ K" text={copy.moments.command.copy} /></p>
          </div>
          <CommandPalettePreview />
        </article>

        <article className="moment-card table-moment">
          <div className="moment-copy">
            <span>{copy.moments.table.label}</span>
            <h3>{copy.moments.table.title}</h3>
            <p>{copy.moments.table.copy}</p>
          </div>
          <TableViewPreview />
        </article>

        <article className="moment-card dashboard-moment">
          <div className="moment-copy">
            <span>{copy.moments.dashboard.label}</span>
            <h3>{copy.moments.dashboard.title}</h3>
            <p>{copy.moments.dashboard.copy}</p>
          </div>
          <ConnectionDashboardPreview />
        </article>
      </section>

      <section className="final-cta">
        <BrandMark />
        <h2>{copy.final.title}</h2>
        <p>{copy.final.copy}</p>
        <a className="primary-cta" href={releaseUrl} target="_blank" rel="noreferrer">
          <ArrowIcon /> {copy.hero.download}
        </a>
        <span>Apple Silicon · {releaseVersion} · {copy.hero.preview}</span>
      </section>

      <footer>
        <a href="#inicio" className="brand"><BrandMark /><span>Pointer</span></a>
        <p>{copy.footer.copy}</p>
        <div>
          <a href={repositoryUrl} target="_blank" rel="noreferrer">GitHub</a>
          <a href={`${repositoryUrl}/releases`} target="_blank" rel="noreferrer">{copy.footer.releases}</a>
          <a href={`${repositoryUrl}/blob/main/README.md`} target="_blank" rel="noreferrer">{copy.footer.docs}</a>
        </div>
      </footer>
    </main>
  )
}
