# Changelog

Este histórico documenta as versões do Pointer com foco no impacto para quem usa o app no dia a dia.

## v0.9.4 - 2026-03-30

### ✨ Novidades
- A visualização de tabela agora permite copiar o SQL de `INSERT` diretamente pelo clique direito no número da linha, já preenchido com os valores daquele registro.

### ♻️ Melhorias
- Esta release foi classificada como `patch` por se tratar de melhoria incremental de UX no fluxo de tabela.

## v0.9.3 - 2026-03-30

### ✨ Novidades
- A visualização de tabela agora permite redimensionar colunas por arraste direto no cabeçalho, com larguras persistidas por tabela para manter o layout do jeito que você organizou.
- Adicionado um guia visual sutil entre colunas para facilitar o ponto de clique do resize sem poluir a interface.

### 🐛 Correções
- Aumentado o limite de renderização de resultados SQL para até 50.000 linhas na grade, com aviso de truncamento quando houver recorte visual.

### ♻️ Melhorias
- Conteúdos longos em células agora mantêm a tabela estável com truncamento por reticências e tooltip com valor completo no hover.

## v0.9.1 - 2026-03-23

### 🐛 Correções
- Corrigido o fluxo de edição de colunas `ARRAY`/`enum[]` na visualização de tabelas: o editor agora aceita tanto JSON (como `["WHATSAPP"]`) quanto literal PostgreSQL (como `{WHATSAPP}`), com parse e salvamento consistentes.

## v0.9.0 - 2026-03-20

### ✨ Novidades
- Novo dashboard operacional por conexão para PostgreSQL, ClickHouse e SQLite, com visão consolidada de métricas, tendência histórica e health score para diagnóstico rápido do banco.

### 🐛 Correções
- Corrigido o overflow horizontal no dashboard para eliminar barra de rolagem lateral indevida e manter a navegação focada apenas no scroll vertical.

## v0.8.16 - 2026-03-19

### ✨ Novidades
- Fluxo de SQL ganhou suporte para abrir e salvar arquivos `.sql` direto no workspace, facilitando edição externa e reaproveitamento de scripts sem copiar e colar manualmente.

### 🐛 Correções
- Ajustada a cobertura de busca de tabelas em memória no Command Palette para retornar resultados de forma mais consistente durante navegação rápida.

## v0.8.14 - 2026-03-19

### 🐛 Correções
- Corrigido o feedback visual de recarga na visualização de tabelas: agora o app exibe um overlay de carregamento cobrindo toda a área visível do grid, inclusive durante rolagem horizontal, e mantém o botão **Atualizar** com indicador de loading durante o refresh.

## v0.8.13 - 2026-03-18

### 🐛 Correções
- Corrigida a troca de ambiente no workspace para evitar vazamento de tabelas e conexões do ambiente anterior após mudanças rápidas de contexto.
- Ajustado o carregamento assíncrono do catálogo e da busca (`Cmd+K`) para descartar respostas obsoletas e manter a sidebar consistente com o ambiente ativo.

## v0.8.12 - 2026-03-16

### ✨ Novidades
- Edição de conexão ganhou ação para revelar/ocultar senha no formulário, melhorando conferência de credenciais sem sair do fluxo.
- Resultado SQL agora exibe numeração de linhas no grid, facilitando leitura e referência rápida durante análise.
- Workspace passou a suportar reordenação de abas por drag and drop, deixando a organização do contexto mais fluida.

### 🐛 Correções
- Corrigida a tratativa de falha no modo automático de conexão SQL para evitar estados inconsistentes em erro de conexão.
- Ajustado o comportamento de scroll e foco no fluxo de inserção em tabela para reduzir interrupções durante edição.

## v0.8.7 - 2026-03-12

### ✨ Novidades
- Nova folha de estrutura de tabela no workspace, facilitando inspeção rápida de colunas, tipos e detalhes técnicos sem sair do fluxo principal.
- Agora é possível usar `Cmd+Click` em referências SQL para abrir contexto relacionado com mais agilidade durante análise.
- Atalhos contextuais ampliados no workspace, incluindo refresh de tabela e troca de ambiente com comportamento mais inteligente por contexto.

### 🐛 Correções
- Melhorado o split de statements SQL com cursor, incluindo fallback para blocos com linhas em branco para reduzir execuções inesperadas.
- Adicionado suporte correto a seleção booleana (`true/false`) em edição inline e inserção de registros na visualização de tabela.

## v0.8.3 - 2026-03-11

### ✨ Novidades
- A visualização de tabelas agora suporta multi-seleção de células e intervalos de linhas, com fluxo por `Shift+Click`, arraste e navegação por teclado com setas.
- O `Cmd+V` ganhou paste em lote direto na seleção da tabela, com suporte a `TSV` e `CSV` (separadores `,` e `;`) para preencher múltiplas células de uma vez.
- O `Cmd+C` passou a copiar o range selecionado da tabela para facilitar edição em planilhas e retorno ao app.

### 🐛 Correções
- Corrigida a exibição de colunas de data/hora no grid para remover aspas indevidas e manter leitura mais limpa.
- Ajustado o tratamento de timestamp no Postgres para evitar deslocamento de fuso horário (+3h) durante edição e salvamento inline.
- Corrigido o foco da edição inline para permitir clique dentro do campo sem encerrar o modo de edição.

## v0.8.0 - 2026-03-11

### ✨ Novidades
- Novo fluxo de SQL com IA no Command Palette (`Cmd+K`), incluindo chat contextual e gerenciamento de chave para acelerar consultas assistidas no app.
- Atalho `Ctrl+Tab` adicionado para ciclagem de abas, deixando a navegação entre contextos de trabalho mais rápida.

### 🐛 Correções
- Corrigida a renderização de colunas no resultado SQL para evitar exibição defasada após novas execuções.
- Reforçada a confirmação de risco em execuções SQL e bloqueada a execução indevida de atalho de salvar durante esse fluxo.

## v0.7.2 - 2026-03-10

### ✨ Novidades
- Busca de tabelas no Command Palette (`Cmd+K`) evoluiu para um modelo fuzzy no estilo VS Code, facilitando encontrar tabelas mesmo com termos parciais.
- Filtro de tabela ganhou suporte ao operador `IN` com múltiplos IDs separados por vírgula, acelerando análises em lote.

### 🐛 Correções
- A ação de saída no Command Palette foi simplificada de **Sair para Home** para **Sair**, com nomenclatura mais direta.

### 📚 Documentação
- Adicionada referência ao guia de testes E2E com Playwright + Electron para smoke do fluxo de changelog e execução de `SELECT` com SQLite.

## v0.7.0 - 2026-03-09

### ✨ Novidades
- Nova navegação entre Workspace e Home: agora é possível sair do ambiente atual e voltar para a tela inicial sem perder o estado do workspace por ambiente.
- A Home passou a listar os ambientes já configurados com ação direta de entrada, facilitando o acesso rápido entre contextos.
- Command Palette (`Cmd+K`) ganhou a ação **Sair para Home**, permitindo navegar sem depender apenas dos controles da sidebar.
- Ações de ambiente foram simplificadas na sidebar com menu de overflow (editar, excluir e sair), reduzindo ruído visual na barra de controles.

### ♻️ Melhorias
- O fluxo de atalhos foi refinado para contexto de Home vs Workspace, mantendo `Cmd+R` disponível para troca de ambiente e evitando ações invisíveis fora do workspace.
- O diálogo de criação de ambiente foi extraído para componente reutilizável, garantindo consistência entre Home e sidebar.

### 📚 Documentação
- Atualizada a seção de skills locais no `AGENTS.md` com referência ao fluxo de commit e ao gerenciador de release.

## v0.6.0 - 2026-03-09

### ✨ Novidades
- Novo fluxo de resolução automática de conexão SQL no workspace: ao abrir uma aba SQL sem conexão definida, o app tenta selecionar uma conexão válida do ambiente para reduzir passos manuais.
- Melhorias de usabilidade no teclado para seleção de conexão SQL, deixando a troca de conexão mais rápida em fluxos com múltiplas conexões.

### 🐛 Correções
- Corrigido o comportamento de cancelamento de execução SQL para reduzir estados inconsistentes durante interrupções.
- Corrigido fallback da checagem de atualização para evitar falhas silenciosas em cenários de indisponibilidade temporária.
- Ajustado o auto-open do changelog para abrir somente após update realmente instalado, evitando abertura indevida.
- Refinado o feedback de save/insert em tabela no workspace para mensagens mais claras durante operações de edição.

### ♻️ Melhorias
- Otimizada a abertura da visualização de tabela via `Cmd+K`, com redução de latência percebida na navegação inicial.

### 📚 Documentação
- Adicionado guia formal de convenção de commits (`GIT.md`) e referência no `AGENTS.md` para padronizar releases futuras.

## v0.5.0 - 2026-03-09

### ✨ Novidades
- Navegação por relacionamento na visualização de tabela: colunas com chave estrangeira agora exibem um ícone de atalho em cada célula para abrir a tabela relacionada já filtrada pelo ID de referência.
- O fluxo de abertura reaproveita abas existentes da tabela de destino quando possível, aplicando filtro `equal` automaticamente para facilitar inspeção de registro relacionado.

### ♻️ Melhorias
- O schema de tabela agora inclui metadados de chave estrangeira em Postgres e SQLite, ampliando contexto para recursos de navegação sem alterar o contrato público de IPC.
- Células de FK com valor vazio mantêm o atalho desabilitado para evitar navegação inválida e preservar o comportamento de edição/seleção atual.

## v0.4.9 - 2026-03-09

### ✨ Novidades
- Exportação de resultados SQL direto pela aba de execução, com opção de baixar CSV do conjunto visível.

### 🐛 Correções
- Corrigido o scroll vertical por wheel/trackpad no editor SQL (CodeMirror), mantendo o scroll do resultado independente.
- Ajustada a cadeia de layout do workspace para evitar clipping/estouro de painel em cenários de redimensionamento.
- Refinado o alinhamento visual da barra superior no macOS, com centralização mais consistente das traffic lights.

### ♻️ Melhorias
- Ajustes de janela no macOS para equilibrar área de arraste da titlebar com a top bar do app.

### 📚 Documentação
- Documentado no release process o conjunto obrigatório de arquivos da release macOS (`latest-mac.yml`, `dmg/zip` e respectivos `blockmap`).

## v0.4.5 - 2026-03-07

### ✨ Novidades
- Visualização de tabela ficou mais rápida em bases grandes: removemos a contagem total de registros na abertura da aba.
- Limite por página agora começa em 100 registros e pode ser ajustado diretamente na interface por input numérico.
- Novo estado de erro para tabela com ações explícitas de `Reconectar` e `Fechar aba`.

### 🐛 Correções
- Corrigido loop de toast quando a conexão cai ao abrir/restaurar uma aba de tabela.
- Auto-retry infinito da tabela foi bloqueado após falha inicial; novas tentativas passam a ser somente manuais.
- Mensagens genéricas de IPC foram traduzidas para erro amigável de conexão indisponível em leitura de tabela e execução SQL sem conexão.

### ♻️ Melhorias
- No estado de falha de carregamento, o cabeçalho da aba mostra `Conexão atual` com o nome da conexão e engine.
- Mensagens de erro ficaram mais claras para orientar reconexão sem ambiguidade técnica.

## v0.4.3 - 2026-03-07

### ✨ Novidades
- Evolução visual do workbench para layout em cards arredondados, com separação mais clara entre sidebar, abas e painéis.
- Painel SQL reorganizado com caixas internas para editor e resultado, mantendo o fluxo e atalhos existentes.
- Redesign completo da tela de onboarding para um hero visual “neon” em duas colunas, com arte abstrata 100% CSS.
- Novo bloco “Primeiro minuto no Pointer” com sequência rápida de passos e atalhos úteis.

### 🐛 Correções
- Ajuste do destaque visual no accordion do changelog para reduzir borda/foco excessivo no item selecionado.
- Adição de espaçamento e separador entre cabeçalho da versão e conteúdo expandido no modal de changelog.
- Changelog deixa de abrir em toda inicialização; agora abre automaticamente apenas quando há atualização nova ainda não visualizada.

### ♻️ Melhorias
- Padronização de raio/bordas entre blocos de interface para consistência visual geral.
- Remoção de gradiente desnecessário no card de schema, mantendo destaque de cor no bloco superior.
- Ajustes de layout do onboarding para melhor preenchimento de espaço, centralização e responsividade em janelas maiores.
- Refinamento de bordas, recorte de cantos e transições de fundo no container principal da experiência de onboarding.

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
