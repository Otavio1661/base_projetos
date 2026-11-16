# Meu Framework — Documentação 

Uma estrutura PHP minimalista e modular para acelerar o desenvolvimento de aplicações web. O projeto oferece um roteador simples, controllers, modelos, views, utilities (criptografia, database) e scripts CLI para gerar/remover scaffolding.

Visão geral e objetivos:
- Arquitetura MVC leve e organizada.
- Rotas com suporte a middleware e grupos.
- Integração com PDO (singleton), SQL externo e ferramentas CLI para produtividade.

--------------------------------------------------------------------------------

## Conteúdo desta documentação

- Pré-requisitos
- Instalação
- Inicialização (Docker, XAMPP, PHP built-in server)
- Scripts Composer e gerador (core/Generator)
- Estrutura do projeto
- Guia rápido: rotas, controllers, models e views
- Segurança e boas práticas
- Próximos passos

--------------------------------------------------------------------------------

## Pré-requisitos

- PHP 8.2+ (recomendado 8.5.12+, versões anteriores à 8.2.35 têm RCE conhecido) com as extensões `pdo` e `pdo_mysql` (ou `pdo_pgsql` conforme DB).
- Composer (para instalar dependências e usar scripts).
- Opcional: Docker/Docker Compose para ambiente isolado.

--------------------------------------------------------------------------------

## Instalação

1. Clone o repositório:

```bash
git clone https://github.com/Otavio1661/base_projetos.git
cd base_projetos
```

2. Copie/ajuste o arquivo `.env` com suas credenciais (ex: `Exemplo.env`):

```text
APP_ENV=local
APP_DEBUG=true
CRYPTO_PRIVATE_KEY=""
HTTPS_MODE=optional
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=nome_do_banco
DB_USERNAME=usuario
DB_PASSWORD=senha
```

3. Instale dependências PHP via Composer:

```bash
composer install
```

--------------------------------------------------------------------------------

## Inicialização — modos disponíveis

1) Docker (recomendado para produção/desenvolvimento consistente)

```bash
docker compose up -d --build
# porta padrão 8087; para trocar: WEB_PORT=8080 docker compose up -d --build
```

Stack: **Nginx 1.30 + PHP 8.5.12-FPM** (serviços `web` e `app`). A config do Nginx fica em
`docker/nginx/default.conf` e os ajustes do PHP em `docker/php/zz-app.ini`.

2) Nginx próprio (sem Docker)

- Aponte o `root` para a pasta `public/`, use `try_files $uri $uri/ /index.php?$query_string;` e
  repasse apenas `/index.php` ao PHP-FPM (veja `docker/nginx/default.conf` como modelo).

3) PHP built-in server (modo rápido para desenvolvimento)

```bash
# na raiz do projeto
php -S localhost:8000 -t public
```

Observações:
- O PHP built-in server é recomendado apenas para desenvolvimento. Ele serve o conteúdo da pasta `public/` diretamente.

--------------------------------------------------------------------------------

## Scripts Composer (atalhos úteis)

O `composer.json` já expõe scripts para tarefas comuns. Exemplos:

```json
"scripts": {
    "make:migration": "php core/Migration/MakeMigration.php",
    "migrate": "php core/Migration/RunMigration.php",
    "controller": "php core/Generator/MakeController.php",
    "model": "php core/Generator/MakeModel.php",
    "middleware": "php core/Generator/MakeMiddleware.php",
    "mvc": "php core/Generator/MakeMVC.php",
    "excluir mvc": "php core/Generator/DeleteMVC.php"
}
```

Exemplos de execução:

```bash
composer make:migration CriaClientes   # CRIA src/Migration/CriaClientesMigration.php (só gera o arquivo)
composer migrate                       # EXECUTA as migrations pendentes (registra em `migrations`); --status só lista
composer controller NomeDoController
composer model NomeDoModel
composer middleware NomeDoMiddleware
composer mvc NomeDaFuncionalidade
composer run-script "excluir mvc" Nome
```

Para scripts com espaços (ex: `excluir mvc`) use `composer run-script` e envolva o nome em aspas.

--------------------------------------------------------------------------------

## Estrutura do projeto (resumida)

```text
./
├─ core/               # Núcleo: Router, Controller base, Database, Generator
├─ public/             # Document root (index.php, assets, erros)
├─ src/                # Código da aplicação (Controllers, Model, view, Utils)
├─ vendor/             # Dependências (não versionar)
├─ composer.json
└─ .env (local)
```

Principais arquivos/folders:
- `core/Controller.php` — classe base para controllers (render, json, getPost).
- `core/RouterBase.php` — lógica de roteamento, dispatch e middleware.
- `core/Database.php` — singleton PDO, `switchParams()` e `runMigration()`.
- `core/Generator/` — scripts CLI para gerar/remover MVC.
- `core/Security/Crypto.php` e `public/libr4/net.js` (R4.crypto) — criptografia v2 (ECDH P-256 + AES-256-GCM; `src/Utils/Decryption.php` é só uma fachada).
- `core/Security/Transport.php` — política HTTPS/HTTP por ambiente (308/426, HSTS, proxies confiáveis, `APP_HOSTS`).

--------------------------------------------------------------------------------

## Guia rápido: rotas, controllers, models, views

- Defina rotas em `src/routes.php` usando o roteador:

```php
$router->get('/home', 'HomeController@home');
$router->post('/login', 'IndexController@login');

// Grupo de rotas com middleware
$router->group('/admin', 'AuthMiddleware@handle', function($router) {
    $router->get('/dashboard', 'AdminController@dashboard');
});
```

- Controllers estendem `Core\Controller` e usam `render()` ou `json()`:

```php
namespace App\Controllers;

use Core\Controller as ctrl;

class HomeController extends ctrl
{
    public function home()
    {
        ctrl::render('index', ['titulo' => 'Home']);
    }
}
```

- Models tipicamente usam `Core\Database::switchParams()` para executar SQL externo em `src/sql/`.

--------------------------------------------------------------------------------

## Criptografia (frontend ↔ backend)

- **Nenhum segredo vai para o navegador.** O servidor tem um par de chaves P-256: a privada fica só no `.env` (`CRYPTO_PRIVATE_KEY`, gerada com `php tools/gerar-chave.php`; em `APP_ENV=local` ela é criada sozinha em `storage/dev-crypto-key.pem`) e a pública vai para a página (`<meta name="r4-server-key">`, inserida pelo `public/index.php` — sem script inline —, ou `GET /r4/chave`).
- A libr4 (`R4.crypto`/`R4.http`) gera a cada sessão de página um par ECDH efêmero (só em memória), deriva com HKDF-SHA256 uma chave AES-256-GCM e envia `{v:2, kid, k, s, z, x}` com IV novo por mensagem. O AAD (`método + caminho`) amarra o pacote ao endpoint e o servidor recusa pacotes fora da janela de tempo (`CRYPTO_JANELA_SEG`).
- No PHP, `Controller::getPost()` decifra (`Core\Security\Crypto`); pacote inválido, adulterado, de outra rota ou expirado → 400 JSON limpo. Resposta cifrada opcional: `R4.http.post(url, dados, { cifrarResposta: true })` + `Controller::responderCifrado($dados)`.
- `BASE_CRIPTOGRAFIA` e o formato antigo `{x, y, z}` deixaram de existir (a variável é ignorada, com aviso no log).
- **HTTPS continua obrigatório em produção** (`HTTPS_MODE=required`, padrão): sem TLS um atacante ativo pode trocar a chave pública entregue com a página. Política HTTPS/HTTP (redireciono 308, 426 para POST em HTTP, HSTS, IPs isentos, proxies confiáveis, `APP_HOSTS`) em [`docs/PRODUCAO.md`](docs/PRODUCAO.md).
- O mesmo pacote reenviado é recusado (nonces guardados no APCu ou, sem ele, em `storage/cache/nonces/`). O envelope não autentica quem envia: POST vindo de outro site é barrado pela checagem de origem (`Core\Security\Csrf`, `CSRF_ATIVO`/`CSRF_ORIGENS_PERMITIDAS`).
- Limites (XSS lê os dados antes de cifrar; vários servidores = vários caches de nonce) em [`docs/SEGURANCA.md`](docs/SEGURANCA.md), seções 5 e 5.2.

--------------------------------------------------------------------------------

## Boas práticas e segurança

- Nunca versionar `.env` com credenciais reais.
- Em produção, defina `APP_DEBUG=false` no `.env` para suprimir mensagens detalhadas.
- Evite passar dados sensíveis via `render()` sem validação — `render()` usa `extract()`.
- Faça backup de `src/routes.php` antes de rodar os scripts de geração/remoção.
- A vitrine (`/`, `/vitrine`) e a API de teste (`/vitrine/api/*`) só respondem com `APP_DEBUG=true`.
- Modelo de ameaça, checklist de produção, CSP e a auditoria da libr4: [`docs/SEGURANCA.md`](docs/SEGURANCA.md). Testes: `node tools/testes-seguranca.js` (servidor em `:8087` e jsdom instalado). Vulnerabilidade? Relate pelo canal privado descrito em [`SECURITY.md`](SECURITY.md).
- **Sessão sob demanda:** o `index.php` não abre sessão. Quem precisa chama `Core\Security\Session::start()` (cookie HttpOnly, SameSite=Lax, `__Host-R4SID` + Secure em HTTPS); no login, `Session::regenerar()`; no logout, `Session::encerrar()`.
- **CSRF:** POST/PUT/PATCH/DELETE de outro site (cabeçalhos `Origin`/`Sec-Fetch-Site`) → 403; `Content-Type` diferente de JSON/multipart → 415. Clientes sem navegador (curl, serviços) passam se mandarem JSON.
- **CSP:** `script-src 'self'` (sem `'unsafe-inline'`): nada de `<script>` inline nem `onclick="..."` nas views — use arquivos `.js`.
- **Injeção (SQL, arquivo, prompt) — a proteção é no SERVIDOR** (qualquer um chama a API sem passar pelo navegador):
  - SQL: sempre `prepare` + `bind` (o `Core\Database` já usa `EMULATE_PREPARES=false` e `utf8mb4`); coluna/tabela dinâmica só por allowlist (`Database::ident()`); nunca "escapar aspas".
  - Entrada: `$d = ctrl::validate(['nome' => ['type' => 'string', 'required' => true, 'maxLength' => 120], 'email' => ['type' => 'email']]);` (`Core\Security\Input`: esquema, recusa campos não declarados, limpa NUL/controles/bidi; responde 422 sozinho).
  - Arquivos: `Core\Security\Upload::save('arquivo', ['permitidos' => ['png', 'pdf'], 'maxBytes' => 2 << 20])` (allowlist + MIME real + assinatura + nome aleatório em `storage/`, fora do `public/`).
  - IA: `Core\Security\Prompt::montar($instrucao, $textoDoUsuario)` (bloco delimitado com id aleatório + guarda no system). Filtro não elimina injeção de prompt: dê ao modelo o mínimo de ferramentas e valide/escape a SAÍDA dele.
  - No navegador, `R4.sanitize` e as opções `sanitize`/`guard` dos campos limpam e AVISAM (defesa em profundidade/UX). Detalhes e exemplos: seção 13 de [`docs/SEGURANCA.md`](docs/SEGURANCA.md) e o item `sanitize` da vitrine.

--------------------------------------------------------------------------------

## Desenvolvimento e testes rápidos

- Rodar localmente (PHP built-in):

```bash
php -S localhost:8000 -t public
```

--------------------------------------------------------------------------------

## libr4 (R4 dev) e vitrine

- `public/libr4/` — biblioteca JS sem dependências, estilo ExtJS: `core.js` (R4, `R4.define`, `R4.create`), `net.js` (`R4.crypto`, `R4.http`), `components.js` (viewport, panel, toolbar, button, tabpanel, treepanel, grid, window, textfield, `R4.msg`) e `libr4.css` (tema por variáveis `--r4-*`, modo escuro com `.r4-dark`).
- `public/showcase/` — a vitrine (rotas `/` e `/vitrine`). O menu é gerado de `R4.registry` e `R4.modules`; para exibir um item novo, registre-o com `R4.define`/`R4.module` e acrescente exemplos em `public/showcase/demos.js` (`R4Demos.<nome> = [{ title, fn(el, out) }]`).

### Modo HTML (declarativo)

```html
<link rel="stylesheet" href="/libr4/libr4.css">
<script src="/libr4/libr4.js"></script>

<r4-panel title="Clientes" collapsible>
  <r4-tbar><r4-button variant="primary" r4-click="modal:#novo">Novo</r4-button></r4-tbar>
  <r4-grid src="/api/clientes" page-size="10" page-size-selector filter>
    <r4-col field="nome" header="Nome"></r4-col>
    <r4-col field="valor" header="Valor" format="money" align="right"></r4-col>
  </r4-grid>
</r4-panel>
<div class="r4-card r4-shadow" r4-anim="fade-up" r4-hover="lift">...</div>
```

Cada componente registrado vira a tag `<r4-xtype>`; `r4-click` (ações), `r4-confirm`, `r4-anim`, `r4-hover` e as classes `r4-*` funcionam em qualquer elemento. Detalhes e exemplos ao vivo na vitrine, grupo "HTML declarativo". Ações próprias: `R4.action('nome', (arg, el, ev) => {})`.

**Arquivos que se explicam (`R4.files.interpret`):** sem esquema pré-definido, o arquivo vira tabela sozinho. `R4.files.interpret(entrada, { path, header, sheet, keyValue })` aceita texto JSON, NDJSON, CSV/TSV/`;`, objeto/array já lido, o resultado do `filedrop` (`parse`) ou binário (`ArrayBuffer`/`File`: XLSX, devolve Promise) e devolve `{ rows, columns, meta }`: linhas planas (objetos aninhados viram `endereco.cidade`, listas de primitivos viram `a, b`), colunas com cabeçalho legível (`valor_total` → "Valor Total"), `type` (`number`, `integer`, `money`, `date`, `datetime`, `boolean`, `text`), `align`, `format` e `width`, e `meta` (`shape`, `total`, `truncated`, `warnings`, `tipos`, `candidates` e `sheets` quando houver). Reconhece array de objetos, objeto com listas (escolhe a maior; `path: "dados.itens"` escolhe outra), objeto de objetos, lista de arrays (cabeçalho automático), primitivos e objeto simples. Entende números pt-BR (`1.234,56`) e ISO, datas `dd/mm/aaaa` e ISO (convertidas para ISO, que ordena certo), `sim/não`, e só converte uma coluna quando TODOS os valores cabem no tipo (CPF, CEP e códigos com zero à esquerda continuam texto). Limites: 200 mil linhas, 200 colunas, 5 MB de texto e 5.000 caracteres por célula (`meta.truncated` + `meta.warnings`); chaves `__proto__`/`constructor`/`prototype` são ignoradas e o resultado só tem primitivos. `R4.files.toGrid(alvo, entrada, opts)` interpreta e cria o grid (paginação com seletor, exportar, menu de colunas); o mesmo vale manualmente: `const r = R4.files.interpret(json); R4.grid('#t', r.rows, { columns: r.columns })`.

**Tabela (grid):** com `filter`, cada célula que contém o termo buscado ganha fundo de cor própria (`.r4-hit`, variáveis `--r4-hit` e `--r4-hit-txt`; `highlight="false"` desliga) — assim se vê em qual coluna a linha casou. `page-size-selector` mostra "Linhas por página" no rodapé (padrão 10, 30, 50, 100 e Todos; personalize com `page-sizes="10,30,all"`); no modo `remote` o padrão não inclui "Todos"; se você o incluir (`page-sizes="10,30,50,100,all"`), o grid entra na **janela remota**: a barra de rolagem representa TODAS as linhas do servidor (milhões), o DOM guarda só as ~30 linhas visíveis e os blocos de 100 linhas são pedidos ao servidor conforme a rolagem (`page`, `size=100`, `sort`, `dir`, `q`, resposta `{total, retorno}`); linhas ainda não chegadas aparecem como "esperando" e depois são preenchidas. Acima de ~220 mil linhas a rolagem é escalada (a barra cobre no máximo 8 milhões de px, o que cabe em qualquer navegador) e há no rodapé o intervalo visível ("1.000.109 a 1.000.122 de 2.000.000"). O servidor deve aceitar `size` até 100 e responder rápido por página (índice na coluna de ordenação). API: `setPageSize(n)`, `getPageSize()`, evento `pagesizechange`. **Filtro por valores:** `column-filters` (ou `filterValues: true` numa coluna) põe um funil no cabeçalho; o popover lista os valores da coluna com a quantidade de cada um, para marcar quais aparecem (OU na coluna, E entre colunas; nenhum marcado = todos; as quantidades descontam a busca e os outros filtros; Alt+↓ no cabeçalho abre pelo teclado). Local: distintos da própria coluna (texto exibido pelo renderer, até 1000; acima só pela busca do popover); `options` fixa a lista. Remoto/janela remota: o grid envia `filtro[coluna][]=valor` (um por valor; PHP lê `$_GET['filtro']['coluna']`) e busca a lista em `optionsUrl` (`GET ?col=<campo>&q=<busca>` → `{retorno:[{valor, qtd}]}`). API: `getColumnFilters()`, `setColumnFilter(campo, valores)`, `clearColumnFilters()`, evento `filterchange`.

**Layout:** use `<r4-div cols="3" gap="3">` (colunas) ou `<r4-div flex justify="between">` (flex) em vez de classes de grid; em telas pequenas as colunas empilham sozinhas. Erros de digitação (`pagesize`, `<r4-buton>`, `r4-click="toats:..."`) geram aviso no console com sugestão. Na vitrine, os componentes têm painel de propriedades ao vivo e botões de copiar.

**Funções prontas:** todo componente também é função — `R4.grid('#tabela', linhas)` (colunas automáticas), `R4.button('#x', 'Salvar', fn)`, `R4.panel('#x', 'Título', html)`, `R4.window('Aviso', html)`, `R4.render('#x', html)`. Veja o grupo "Funções prontas" na vitrine.

**Ícones:** `R4.icon('edit', { size: 20, title: 'Editar' })` devolve um `<svg>` inline (81 ícones próprios, traço de 2, herdam a cor do texto); `<r4-icon name="edit" size="20">` na tag. Em qualquer opção `icon` (button, dropdown, stat, alert, emptystate, timeline...) use o nome: `<r4-button icon="trash">Excluir</r4-button>`; valor que não é nome (emoji/texto) continua aparecendo como texto. O SVG vem de um mapa fixo (o nome nunca vira HTML); `R4.icon.add('meu', 'M2 2h20v20H2z')` aceita só path simples. A grade com todos os nomes está na vitrine (`icon`, grupo Interface).

**Idiomas (i18n):** todos os textos fixos da lib (grid, formulários, diálogos, paginação, gráficos, aria-labels) vêm de `R4.t('r4.chave')`. `R4.i18n.set('en')` troca o idioma (salvo no `localStorage`) e o que já está na tela se atualiza; componentes novos nascem no idioma atual. Disponíveis: `pt-BR` e `en`; a vitrine tem o seletor "PT | EN" na barra superior. **Adicionar um idioma:** `R4.i18n.add('es', { r4: { empty: 'Sin registros.', ok: 'Aceptar' /* ... */ } }); R4.i18n.set('es');` — chaves ausentes usam pt-BR (lista completa nos blocos `add('pt-BR')`/`add('en')` do fim de `public/libr4/theme.js`). Para a vitrine, copie o bloco `en` de `public/showcase/i18n.js` (chaves `vt.*`). Textos próprios: `R4.i18n.add('pt-BR', { app: { ola: 'Olá, {nome}!' } })` e `R4.t('app.ola', { nome })` (o resultado é texto: escape ao montar HTML).

**Segurança (resumo — completo em [`docs/SEGURANCA.md`](docs/SEGURANCA.md)):** textos (`title`, `text`, `label`, células do grid, mensagens do servidor...) são sempre escapados. Parâmetros `html`, o conteúdo das tags `<r4-*>` e `R4.render` são **HTML confiável**: dado de fora vai com `R4.html\`<b>${valor}</b>\`` (escapa cada `${}`) ou `R4.util.esc`. No grid, `renderer` que devolve string vira **texto**; para HTML devolva `R4.html\`...\`` (ou use `html: true` na coluna para o modo antigo). `goto:` só navega para URL relativa/http(s)/mailto/tel; `R4.http` recusa `javascript:`/`data:` e avisa sobre outra origem (`R4.config.strictOrigins = true` bloqueia). Envolva HTML de usuário com `r4-ignore` para que tags/ações `r4-*` dentro dele fiquem inertes.

## Mini ERP de demonstração (`/erp`)

Um sistema completo e **fictício** que usa a libr4 no front e o framework no back: login e cadastro (sessão do `Core\Security\Session`, POST cifrado,
CSRF, limite de tentativas), CRUD de clientes/produtos/pedidos sobre um **mini banco em JSON** (`storage/data/*.json`), dashboard com gráficos,
importação de CSV/XLSX, upload de avatar e uma **tabela de 2 milhões de linhas** (SQLite somente leitura, paginação/ordenação/busca no servidor).
Tudo fica **fora de `public/libr4/`**: quem clonar só a lib não leva nenhum dado. Detalhes e contrato da API: [`docs/ERP.md`](docs/ERP.md).

```bash
composer seed:erp                # usuários, clientes, produtos e pedidos (JSON, determinístico)
composer seed:erp-transacoes     # 2.000.000 de transações em storage/data/transacoes.sqlite (~25 s, ~600 MB)
# conta de teste: demo@r4dev.com.br / Demo@1234
```

O `storage/` não vai para o Git: gere os dados em cada ambiente com os comandos acima.

## Testes

Os testes da libr4 rodam **no navegador**, com um runner próprio em JavaScript puro (sem Node, sem npm, sem terceiros). Com o servidor de desenvolvimento no ar (`APP_DEBUG=true`), abra **`/vitrine/testes`** (ex.: http://127.0.0.1:8087/vitrine/testes) e clique em "Rodar tudo"; `?auto=1` roda ao abrir, `?suite=grid,form` limita e `?slow=0` pula a suíte lenta. Há filtro por suíte, resumo no topo e, para cada teste, PASSOU/FALHOU/PULADO com a mensagem e o tempo. Mantenha a aba visível durante a execução (alguns testes usam `requestAnimationFrame`).

O que cobre (16 suítes em `public/showcase/testes/suites/`): núcleo (`define/create`, `merge`, formatos pt-BR), rede/criptografia, HTML declarativo (`r4-click`, `r4-confirm`, `r4-ignore`), funções prontas, grid (inclusive 20 mil linhas com virtualização e layout real), formulários e select, arquivos (CSV/XLSX/filedrop), sanitize, ícones, i18n, tema, componentes de interface, gráficos, abas e, por último (lenta), a regressão da vitrine, que roda todos os exemplos de `R4Demos`. O framework de testes é `public/showcase/testes/r4test.js` (`suite`, `test`, `assert.*`, `spy`, `mockFetch`, isolamento por teste).

Opcional, só para desenvolvimento: `tools/rodar-testes.js` abre a mesma página no jsdom (que **não** fica no repositório) e sai com código diferente de zero se algo falhar:

```bash
JSDOM_PATH=/caminho/node_modules/jsdom node tools/rodar-testes.js [grid,form] [--sem-lentas] [--verbose]
```

O jsdom não tem layout: o teste de arrastar abas é pulado nele (roda no Chrome). Testes de segurança de ponta a ponta (HTTP, PHP, uploads): `tools/testes-seguranca.js` (veja `docs/SEGURANCA.md`, seção 12).

## Pacote minificado da libr4 (produção)

Um JS e um CSS únicos (sem `document.write`, sem `@import`), gerados de `public/libr4/*` por uma ferramenta própria em PHP, sem dependências (`tools/build.php`, com minificador conservador: tira comentários e espaços; não renomeia nada, não reordena e não altera a sintaxe):

```
php tools/build.php      # gera public/libr4/dist/ (determinístico, sem datas)
```

```html
<link rel="stylesheet" href="/libr4/dist/libr4.min.css">
<script src="/libr4/dist/libr4.min.js"></script>
```

A lista de módulos vem de `public/libr4/libr4.js` (o build falha com mensagem clara se um módulo listado não existir); rode o build de novo sempre que alterar a lib. Saída: `libr4.min.js`, `libr4.min.css` e `manifest.json` (`bytes`, `gzip` e `sha384` de cada arquivo). Para SRI, use o `sha384` do manifest: `integrity="sha384-..." crossorigin="anonymous"` nas duas tags. Sirva com gzip/brotli ligado (o `docker/nginx/default.conf` já tem `gzip on`). Na vitrine (APP_DEBUG=true), `/vitrine?min=1` carrega o pacote minificado.

A lib não depende de Node em nenhum momento; o Node só é usado em `tools/` para testes de desenvolvimento.

## Produção e `.env`

O `.env` real **nunca** vai para o Git (só `Exemplo.env` e `Exemplo.producao.env`). Em produção o debug é desligado automaticamente e a aplicação só sobe com `CRYPTO_PRIVATE_KEY` válida (`php tools/gerar-chave.php`); HTTPS é exigido por padrão (`HTTPS_MODE=required`). Passo a passo, variáveis e cenários (HTTP em dev, HTTPS, proxy/Load Balancer, chamadas internas, rotação de chave) em [`docs/PRODUCAO.md`](docs/PRODUCAO.md).
