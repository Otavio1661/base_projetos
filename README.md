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
- `src/Utils/Decryption.php` e `public/js/r4.js` — criptografia AES-GCM (frontend/backend).

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

- O frontend contém `public/js/r4.js` que criptografa payloads com AES-GCM e envia um objeto com chaves `{ x, y, z }`.
- O backend usa `src/Utils/Decryption.php` para derivar a chave (PBKDF2) e descriptografar os dados.
- A chave base está definida em `BASE_CRIPTOGRAFIA` no `.env` e é injetada nas views pelo `public/index.php`.

--------------------------------------------------------------------------------

## Boas práticas e segurança

- Nunca versionar `.env` com credenciais reais.
- Em produção, defina `APP_DEBUG=false` no `.env` para suprimir mensagens detalhadas.
- Evite passar dados sensíveis via `render()` sem validação — `render()` usa `extract()`.
- Faça backup de `src/routes.php` antes de rodar os scripts de geração/remoção.

--------------------------------------------------------------------------------

## Desenvolvimento e testes rápidos

- Rodar localmente (PHP built-in):

```bash
php -S localhost:8000 -t public
```

--------------------------------------------------------------------------------
