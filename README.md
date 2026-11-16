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
BASE_CRIPTOGRAFIA=...
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
    "migration": "php core/Migration/Migration.php",
    "run migration": "php core/Migration/RunMigration.php",
    "controller": "php core/Generator/MakeController.php",
    "model": "php core/Generator/MakeModel.php",
    "middleware": "php core/Generator/MakeMiddleware.php",
    "mvc": "php core/Generator/MakeMVC.php",
    "excluir mvc": "php core/Generator/DeleteMVC.php"
}
```

Exemplos de execução:

```bash
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
- `src/Utils/Decryption.php` e `public/libr4/net.js` (R4.crypto) — criptografia AES-GCM (frontend/backend).

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

- O frontend contém a libr4 (`public/libr4/net.js`, `R4.crypto`/`R4.http`) que criptografa payloads com AES-GCM e envia um objeto com chaves `{ x, y, z }`.
- O backend usa `src/Utils/Decryption.php` para derivar a chave (PBKDF2) e descriptografar os dados.
- A chave base está definida em `BASE_CRIPTOGRAFIA` no `.env` e é injetada nas views pelo `public/index.php`.
- **Importante:** por ser injetada na página, a chave fica no navegador de todo visitante. A criptografia protege contra leitura passiva do tráfego/logs e ofusca o corpo, mas **não é segredo contra quem abre a página** e não substitui HTTPS nem validação no servidor. Com a chave vazia, fora de `localhost` a libr4 se recusa a cifrar. Detalhes em [`docs/SEGURANCA.md`](docs/SEGURANCA.md).

--------------------------------------------------------------------------------

## Boas práticas e segurança

- Nunca versionar `.env` com credenciais reais.
- Em produção, defina `APP_DEBUG=false` no `.env` para suprimir mensagens detalhadas.
- Evite passar dados sensíveis via `render()` sem validação — `render()` usa `extract()`.
- Faça backup de `src/routes.php` antes de rodar os scripts de geração/remoção.
- A vitrine (`/`, `/vitrine`) e a API de teste (`/vitrine/api/*`) só respondem com `APP_DEBUG=true`.
- Modelo de ameaça, checklist de produção, CSP e a auditoria da libr4: [`docs/SEGURANCA.md`](docs/SEGURANCA.md). Testes: `node tools/testes-seguranca.js` (servidor em `:8087` e jsdom instalado).
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
  <r4-grid src="/api/clientes" page-size="10" filter>
    <r4-col field="nome" header="Nome"></r4-col>
    <r4-col field="valor" header="Valor" format="money" align="right"></r4-col>
  </r4-grid>
</r4-panel>
<div class="r4-card r4-shadow" r4-anim="fade-up" r4-hover="lift">...</div>
```

Cada componente registrado vira a tag `<r4-xtype>`; `r4-click` (ações), `r4-confirm`, `r4-anim`, `r4-hover` e as classes `r4-*` funcionam em qualquer elemento. Detalhes e exemplos ao vivo na vitrine, grupo "HTML declarativo". Ações próprias: `R4.action('nome', (arg, el, ev) => {})`.

**Layout:** use `<r4-div cols="3" gap="3">` (colunas) ou `<r4-div flex justify="between">` (flex) em vez de classes de grid; em telas pequenas as colunas empilham sozinhas. Erros de digitação (`pagesize`, `<r4-buton>`, `r4-click="toats:..."`) geram aviso no console com sugestão. Na vitrine, os componentes têm painel de propriedades ao vivo e botões de copiar.

**Funções prontas:** todo componente também é função — `R4.grid('#tabela', linhas)` (colunas automáticas), `R4.button('#x', 'Salvar', fn)`, `R4.panel('#x', 'Título', html)`, `R4.window('Aviso', html)`, `R4.render('#x', html)`. Veja o grupo "Funções prontas" na vitrine.

**Ícones:** `R4.icon('edit', { size: 20, title: 'Editar' })` devolve um `<svg>` inline (81 ícones próprios, traço de 2, herdam a cor do texto); `<r4-icon name="edit" size="20">` na tag. Em qualquer opção `icon` (button, dropdown, stat, alert, emptystate, timeline...) use o nome: `<r4-button icon="trash">Excluir</r4-button>`; valor que não é nome (emoji/texto) continua aparecendo como texto. O SVG vem de um mapa fixo (o nome nunca vira HTML); `R4.icon.add('meu', 'M2 2h20v20H2z')` aceita só path simples. A grade com todos os nomes está na vitrine (`icon`, grupo Interface).

**Idiomas (i18n):** todos os textos fixos da lib (grid, formulários, diálogos, paginação, gráficos, aria-labels) vêm de `R4.t('r4.chave')`. `R4.i18n.set('en')` troca o idioma (salvo no `localStorage`) e o que já está na tela se atualiza; componentes novos nascem no idioma atual. Disponíveis: `pt-BR` e `en`; a vitrine tem o seletor "PT | EN" na barra superior. **Adicionar um idioma:** `R4.i18n.add('es', { r4: { empty: 'Sin registros.', ok: 'Aceptar' /* ... */ } }); R4.i18n.set('es');` — chaves ausentes usam pt-BR (lista completa nos blocos `add('pt-BR')`/`add('en')` do fim de `public/libr4/theme.js`). Para a vitrine, copie o bloco `en` de `public/showcase/i18n.js` (chaves `vt.*`). Textos próprios: `R4.i18n.add('pt-BR', { app: { ola: 'Olá, {nome}!' } })` e `R4.t('app.ola', { nome })` (o resultado é texto: escape ao montar HTML).

**Segurança (resumo — completo em [`docs/SEGURANCA.md`](docs/SEGURANCA.md)):** textos (`title`, `text`, `label`, células do grid, mensagens do servidor...) são sempre escapados. Parâmetros `html`, o conteúdo das tags `<r4-*>` e `R4.render` são **HTML confiável**: dado de fora vai com `R4.html\`<b>${valor}</b>\`` (escapa cada `${}`) ou `R4.util.esc`. No grid, `renderer` que devolve string vira **texto**; para HTML devolva `R4.html\`...\`` (ou use `html: true` na coluna para o modo antigo). `goto:` só navega para URL relativa/http(s)/mailto/tel; `R4.http` recusa `javascript:`/`data:` e avisa sobre outra origem (`R4.config.strictOrigins = true` bloqueia). Envolva HTML de usuário com `r4-ignore` para que tags/ações `r4-*` dentro dele fiquem inertes.

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
