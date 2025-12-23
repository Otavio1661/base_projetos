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

- PHP 8.0+ com as extensões `pdo` e `pdo_mysql` (ou `pdo_pgsql` conforme DB).
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
docker-compose up -d --build
```

2) XAMPP / Apache

- Copie o projeto para `htdocs` e configure o VirtualHost apontando para a pasta `public/`.

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
├─ src/                # Código da aplicação (controllers, models, views, utils)
├─ vendor/             # Dependências (não versionar)
├─ composer.json
└─ .env (local)
```

Principais arquivos/folders:
- `core/Controller.php` — classe base para controllers (render, json, getPost).
- `core/RouterBase.php` — lógica de roteamento, dispatch e middleware.
- `core/DataBase.php` — singleton PDO, `switchParams()` e `RunMigration()`.
- `core/Generator/` — scripts CLI para gerar/remover MVC.
- `src/utils/Decryption.php` e `public/js/r4.js` — criptografia AES-GCM (frontend/backend).

--------------------------------------------------------------------------------

## Guia rápido: rotas, controllers, models, views

- Defina rotas em `src/routes.php` usando o roteador:

```php
$router->get('/home', 'HomeController@home');
$router->post('/login', 'IndexController@login');

// Grupo de rotas com middleware
$router->group('/admin', 'AuthMiddleware@check', function($router) {
        $router->get('/dashboard', 'AdminController@dashboard');
});
```

- Controllers estendem `core\Controller` e usam `render()` ou `json()`:

```php
namespace src\controllers;
use core\Controller as ctrl;

class HomeController extends ctrl {
    public function home() {
        ctrl::render('index', ['titulo' => 'Home']);
    }
}
```

- Models tipicamente usam `core\Database::switchParams()` para executar SQL externo em `src/sql/`.

--------------------------------------------------------------------------------

## Criptografia (frontend ↔ backend)

- O frontend contém `public/js/r4.js` que criptografa payloads com AES-GCM e envia um objeto com chaves `{ x, y, z }`.
- O backend usa `src/utils/Decryption.php` para derivar a chave (PBKDF2) e descriptografar os dados.
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

- Rodar o bridge de WhatsApp (opcional):

```bash
npm install
node whatsapp-bridge.js
```

--------------------------------------------------------------------------------

## Integração com WhatsApp (whatsapp-bridge)

Este repositório inclui um pequeno *bridge* HTTP para `whatsapp-web.js` em `whatsapp-bridge.js`. Ele expõe endpoints simples que permitem enviar mensagens via uma sessão do WhatsApp Web controlada pelo Puppeteer.

Pré-requisitos:
- Node.js 14+ e `npm`/`yarn`.

Instalação e execução:

```bash
# instalar dependências (na raiz do projeto)
npm install

# iniciar o bridge (por padrão porta 3000)
node whatsapp-bridge.js
```

Variáveis de ambiente úteis:
- `WHATSAPP_BRIDGE_PORT` — porta do servidor HTTP (padrão `3000`).
- `WHATSAPP_DEFAULT_CC` — código de país padrão (ex: `55`) que será prefixado automaticamente ao número informado se a tentativa direta falhar.

Como funciona (endpoints principais):
- `GET /qr` — retorna a imagem PNG do QR atual para autenticação (404 se já autenticado).
- `GET /status` — retorna JSON com `{ ready: true|false }` indicando se o cliente está pronto.
- `POST /send` — envia mensagem. Body JSON esperado: `{ "number": "5511999999999", "message": "Olá" }`.

Notas importantes sobre envio (`/send`):
- O `number` deve conter apenas dígitos; o bridge tentará resolver o ID do WhatsApp automaticamente.
- Se o número não estiver registrado no WhatsApp, o endpoint retorna `404` com uma lista `tried` dos formatos tentados.
- O bridge usa persistência de sessão em disco (`whatsapp-session/`) para evitar reescaneamento frequente do QR.

Exemplo de uso com `curl`:

```bash
curl -X POST http://localhost:3000/send \
    -H "Content-Type: application/json" \
    -d '{"number":"5511999999999","message":"Olá do bridge"}'
```

Exemplo simples em fetch (JS):

```javascript
fetch('http://localhost:3000/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ number: '5511999999999', message: 'Olá via bridge' })
}).then(r => r.json()).then(console.log);
```

Recomendações de segurança e produção:
- Proteja o bridge com autenticação (token/header ou proxy reverso) — ele não implementa auth por padrão.
- Não exponha a porta publicamente sem um gateway seguro (firewall, VPN ou API gateway).
- Em produção, execute o bridge via `pm2`/systemd ou dentro de um container Docker e monitore o processo.
- Faça backup da pasta de sessão (`whatsapp-session/`) caso precise mover o serviço.

Limitações e observações:
- O bridge depende do `whatsapp-web.js` e do Puppeteer; alterações na API do WhatsApp Web podem afetá-lo.
- O uso comercial ou em massa pode violar os termos do WhatsApp; avalie legal e operacionalmente antes de automatizar envios em grande escala.

