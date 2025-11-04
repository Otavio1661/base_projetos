# Meu Framework

O **Meu Framework** é um framework PHP moderno, desenvolvido para acelerar a criação de aplicações web robustas, seguras e escaláveis. Ele oferece uma arquitetura limpa, modular e flexível, facilitando tanto projetos simples quanto sistemas profissionais.

---

## Estrutura Modular

- **MVC:** Separação clara entre Model, View e Controller.
- **Rotas:** Sistema de roteamento flexível e intuitivo.
- **Configuração `.env`:** Variáveis de ambiente centralizadas.
- **SQL Externo:** Consultas SQL organizadas em arquivos.

### Diferenciais

- **Injeção de Dependências:** Controllers e Models desacoplados.
- **Banco de Dados:** PDO singleton, transações e SQL parametrizado.
- **APIs JSON:** Pronto para integração com front-end moderno.
- **Login Exemplo:** Sistema assíncrono, seguro e personalizável.

---

## Estrutura de Pastas

```text
/core   <── Núcleo do framework (Router, Controller, Database)
├── Controller.php
├── DataBase.php
├── Router.php
├── RouterBase.php
/public
├── css
├── img
├── js
/src
├── controllers/
│   └── RenderController.php
├── model/
├── sql/
├── view/
│   ├── home.php
│   └── partials/ <─ Arquivos de cabeçalho, rodapé...
├── config.php
├── Env.php
├── routes.php 
.env
```

---

## Instalação

> **Lembre-se de alterar o arquivo `.env` dentro do framework!**

---

## Executando o Framework com Docker

**Passo 1 - Clonar o Repositório**
```bash
git clone https://github.com/Otavio1661/base_projetos.git
```

**Passo 2 - Instalar Dependências**
```bash
composer install
```

**Passo 3 - Iniciar o Ambiente com Docker**
```bash
docker-compose up -d --build
```

---

## Executando o Framework no XAMPP

**Passo 1 - Clonar o Repositório**
```bash
git clone https://github.com/Otavio1661/base_projetos.git
```
(Coloque dentro da pasta `htdocs` do XAMPP)

**Passo 1.2 - Instalar Dependências**
```bash
composer install
```

**Passo 2 - Habilitar o módulo vhost_alias**
Abra o arquivo `httpd.conf` e verifique se a linha abaixo está descomentada:

Comentada (incorreto):
```apacheconf
#LoadModule vhost_alias_module modules/mod_vhost_alias.so
```
Correta (descomentada):
```apacheconf
LoadModule vhost_alias_module modules/mod_vhost_alias.so
```

**Passo 3 - Configurar VirtualHost**
No arquivo `httpd-vhosts.conf`, adicione a configuração abaixo. Substitua **NOME_DA_PASTA** pelo nome da pasta do projeto (padrão: `base_projetos`):

```apacheconf
<VirtualHost *:80>
    DocumentRoot "C:/xampp/htdocs/NOME_DA_PASTA/public"
    ServerName meu-framework.localhost
    <Directory "C:/xampp/htdocs/NOME_DA_PASTA/public">
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>
```

---

# Documentação Completa

## Visão Geral

O **Meu Framework** é um framework PHP moderno, modular e flexível, criado para acelerar o desenvolvimento de aplicações web robustas, seguras e escaláveis. Ele segue o padrão MVC, utiliza rotas amigáveis, suporta injeção de dependências, integra facilmente com bancos de dados via PDO e permite a separação de SQL em arquivos externos. Ideal para projetos de qualquer porte.

---

## Scripts Automatizados via Composer

O framework traz scripts prontos que podem ser executados pelo **Composer**, facilitando a criação de componentes do sistema:

```json
"scripts": {
    "migration": "php core/Migration/Migration.php",
    "run migration": "php core/Migration/RunMigration.php",
    "controller": "php core/Generator/MakeController.php",
    "model": "php core/Generator/MakeModel.php",
    "middleware": "php core/Generator/MakeMiddleware.php",
    "mvc": "php core/Generator/MakeMVC.php"
}
```

**Como usar:**  
Basta executar pelo terminal, por exemplo:
```bash
composer controller NomeDoController
composer model NomeDoModel
composer middleware NomeDoMiddleware
composer mvc NomeDaFuncionalidade
```
> O nome do arquivo será gerado automaticamente com o prefixo necessário.  
> O comando `mvc` cria **Model**, **View** e **Controller** juntos, bastando informar o nome (o prefixo é adicionado automaticamente).

---

## Renderização de Views

Os controllers podem renderizar views facilmente usando o método `render`.  
Exemplo de uso:

```php
public function home() {
    ctrl::render('Home', [
        'titulo' => 'Home',
    ]);
}
```
- O primeiro parâmetro é o nome da view (exemplo: `Home` corresponde a `/src/view/Home.php`).
- O segundo parâmetro é um array de dados que será disponibilizado na view.

---

## Sistema de Rotas

O sistema de rotas é flexível, suportando **middlewares** de forma opcional. O middleware, se informado, será executado antes do controller.

**Como registrar rotas:**
- Sintaxe: método (get/post), rota, controller@metodo, [middleware@metodo opcional]
- Exemplos:

```php
// Rota simples (sem middleware)
$router->get('/exemplo', 'ExampleController@exampleMethod');

// Rota com middleware
$router->get('/exemplo', 'ExampleController@exampleMethod', 'ExampleMiddleware@handle');

// Grupo de rotas protegidas por middleware
$router->group('/exemplo1', 'ExampleMiddleware@handle', function($router) {
    $router->get('/exemplo2', 'ExampleController@dashboard');
});

// Rotas padrão
$router->get('/', 'HomeController@index');
$router->get('/home', 'HomeController@home');
```

---

## Capturando Dados de POST

Para capturar dados enviados via POST para o controller, utilize:

```php
$data = ctrl::getPost();
```
> Os dados já vêm convertidos em JSON automaticamente.

---

## Configuração Inicial

1. **Clone o repositório:**
   ```bash
   git clone https://github.com/Otavio1661/base_projetos.git
   ```

2. **Configure o arquivo `.env`:**
   ```env
   DB_HOST=localhost
   DB_PORT=3306
   DB_DATABASE=nome_do_banco
   DB_USERNAME=usuario
   DB_PASSWORD=senha
   ```

3. **Instale as dependências (se houver):**
   ```bash
   composer install
   ```

4. **Acesse via navegador:**
   - Se estiver usando XAMPP, configure o VirtualHost conforme [instruções acima](#executando-o-framework-no-xampp).

---

## Conceitos e Recursos

- **MVC (Model-View-Controller):** Separação de responsabilidades entre lógica, dados e apresentação.
- **Sistema de Rotas:** Definido em `/src/routes.php` com suporte a GET e POST.
- **Banco de Dados (PDO Singleton):** Conexão única, SQL externo em `/src/sql/`.
- **Variáveis de Ambiente:** Carregadas automaticamente do `.env`.
- **Injeção de Dependências:** Controllers podem instanciar Models facilmente.
- **APIs JSON:** Controllers podem retornar JSON facilmente.
- **Exemplo de Login:** Login assíncrono via fetch/AJAX.

---

### Como Criar uma Nova Rota

```php
$router->get('/minharota', 'MeuController@minhaAcao');
$router->post('/enviar', 'OutroController@enviarDados');
```

### Como Criar um Novo Controller

```php
namespace src\controllers;
use core\Controller as ctrl;

class MeuController extends ctrl {
    public function minhaAcao() {
        $this->render('minhaview', ['title' => 'Minha Página']);
    }
}
```
Crie a view correspondente em `/src/view/minhaview.php`.

---

### Como Usar SQL Externo

```php
$result = Database::switchParams(['param' => $valor], 'BuscarUsuarios', true);
```

---

### Como Retornar JSON

```php
$this->json(['mensagem' => 'Sucesso!']);
// ou
ctrl::retorno(['mensagem' => 'Sucesso!'], 200);
```

---

## Boas Práticas

- Nunca versionar `.env` com dados sensíveis.
- Separe lógica de negócio (Model) da lógica de apresentação (View).
- Use SQL externo para facilitar manutenção:
    ```php
    $db = Database::getInstance();
    $db->beginTransaction();
    $db->commit();
    $db->rollBack();
    ```
- Utilize rotas amigáveis e controllers organizados.

---

## Dúvidas Frequentes

- **Como adicionar uma nova página?**  
  Crie o controller e a view, depois adicione a rota em `routes.php`.

- **Como conectar a outro banco?**  
  Altere as variáveis no `.env`.

- **Como proteger rotas?**  
  Implemente lógica de autenticação no controller usando middlewares.

---

## Contribua!

> Este framework foi criado para ser simples, mas poderoso. Explore o código, adapte para seu projeto e contribua!

---

**Meu Framework** — Simples, moderno e pronto para produção!

---
