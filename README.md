# Meu Framework

O **Meu Framework** Ã© um framework PHP moderno, desenvolvido para acelerar a criaÃ§Ã£o de aplicaÃ§Ãµes web robustas, seguras e escalÃ¡veis.  
Ele oferece uma arquitetura limpa, modular e flexÃ­vel, facilitando tanto projetos simples quanto sistemas profissionais.

---

## ðŸš€ Estrutura Modular

- **MVC:** SeparaÃ§Ã£o clara entre Model, View e Controller.  
- **Rotas:** Sistema de roteamento flexÃ­vel e intuitivo.  
- **ConfiguraÃ§Ã£o .env:** VariÃ¡veis de ambiente centralizadas.  
- **SQL Externo:** Consultas SQL organizadas em arquivos.  

---

## âš¡ Diferenciais

- **InjeÃ§Ã£o de DependÃªncias:** Controllers e Models desacoplados.  
- **Banco de Dados:** PDO singleton, transaÃ§Ãµes e SQL parametrizado.  
- **APIs JSON:** Pronto para integraÃ§Ã£o com front-end moderno.  
- **Login Exemplo:** Sistema assÃ­ncrono, seguro e personalizÃ¡vel.  

---

## ðŸ“‚ Estrutura de Pastas

```text
/core   <â”€â”€ NÃºcleo do framework (Router, Controller, Database)
â”œâ”€â”€ Controller.php
â”œâ”€â”€ DataBase.php
â”œâ”€â”€ Router.php
â”œâ”€â”€ RouterBase.php
/public
â”œâ”€â”€ css
â”œâ”€â”€ img
â”œâ”€â”€ js
/src
â”œâ”€â”€ controllers/
â”‚   â””â”€â”€ RenderController.php
â”œâ”€â”€ model/
â”œâ”€â”€ sql/
â”œâ”€â”€ view/
â”‚   â”œâ”€â”€ home.php
â”‚   â””â”€â”€ partials/ <â”€ Arquivos de cabeÃ§alho, rodapÃ©...
â”œâ”€â”€ config.php
â”œâ”€â”€ Env.php
â”œâ”€â”€ routes.php 
.env
```

---

## âš™ï¸ InstalaÃ§Ã£o

### ðŸ”¹ Usando Docker

**Passo 1 â€“ Clonar o repositÃ³rio**
```bash
git clone https://github.com/Otavio1661/base_projetos.git
```

**Passo 2 â€“ Instalar dependÃªncias**
```bash
composer install
```

**Passo 3 â€“ Iniciar containers**
```bash
docker-compose up -d --build
```

---

### ðŸ”¹ Usando XAMPP

**Passo 1 â€“ Clonar dentro da pasta `htdocs`**
```bash
git clone https://github.com/Otavio1661/base_projetos.git
```

**Passo 2 â€“ Habilitar mÃ³dulo `vhost_alias` no `httpd.conf`**
```apache
LoadModule vhost_alias_module modules/mod_vhost_alias.so
```

**Passo 3 â€“ Configurar VirtualHost**
```apache
<VirtualHost *:80>
    ServerName meu-framework.local
    DocumentRoot "C:/xampp/htdocs/base_projetos/public"
    <Directory "C:/xampp/htdocs/base_projetos/public">
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>
```

---

## ðŸ“– DocumentaÃ§Ã£o

### Conceitos e Recursos
- **MVC:** OrganizaÃ§Ã£o em `Model`, `View` e `Controller`.  
- **Rotas:** Definidas em `/src/routes.php`.  
- **Banco de Dados (PDO Singleton):** ConexÃ£o Ãºnica + SQL externo.  
- **VariÃ¡veis de Ambiente:** Definidas no `.env`.  
- **APIs JSON:** Controllers podem retornar JSON facilmente.  
- **Login Exemplo:** AssÃ­ncrono via `fetch/AJAX`.  

---

### Exemplo de Rota
```php
$router->get('/minharota', 'MeuController@minhaAcao');
$router->post('/enviar', 'OutroController@enviarDados');
```

### Exemplo de Controller
```php
namespace src\controllers;
use core\Controller as ctrl;

class MeuController extends ctrl {
    public function minhaAcao() {
        $this->render('minhaview', ['title' => 'Minha PÃ¡gina']);
    }
}
```

---

### Como Usar SQL Externo
```php
$result = Database::switchParams(['param' => $valor], 'BuscarUsuarios', true);
```

### Retornar JSON
```php
$this->json(['mensagem' => 'Sucesso!']);
// ou
ctrl::retorno(['mensagem' => 'Sucesso!'], 200);
```

---

## ðŸ” Exemplo de Login
- **Front-end:** `/src/view/login.php`  
- **Controller:** `/src/controllers/LoginController.php`  
- **Model:** `/src/model/LoginModel.php`  
- **Rota:** `/postlogin` (POST)  

---

## ðŸŽ¨ PersonalizaÃ§Ã£o
- **Partials:** `/src/view/partials/` (`head.php`, `topo.php`, `rodape.php`)  
- **CSS customizado:** `/public/css/`  
- **JS customizado:** `/public/js/`  

---

## âœ… Boas PrÃ¡ticas
- Nunca versionar `.env` com dados sensÃ­veis.  
- Usar SQL externo para facilitar manutenÃ§Ã£o.  
- Separar lÃ³gica de negÃ³cio (Model) da apresentaÃ§Ã£o (View).  
- Utilizar rotas amigÃ¡veis e controllers organizados.  

---

## â“ FAQ
- **Adicionar nova pÃ¡gina:** Criar controller, view e rota.  
- **Conectar a outro banco:** Alterar variÃ¡veis no `.env`.  
- **Proteger rotas:** Implementar autenticaÃ§Ã£o no controller.  

---

## ðŸ¤ ContribuiÃ§Ã£o
Este framework foi criado para ser simples, mas poderoso. Explore, adapte e contribua!  

---

## ðŸ”‘ Resumo
**Meu Framework** â€” Simples, moderno e pronto para produÃ§Ã£o.  