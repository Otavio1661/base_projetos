<body class="d-flex flex-column min-vh-100 bg-light">

    <?php include($partials . "topo.php"); ?>

    <main class="flex-fill">
        <div class="container py-5">
            <div class="row justify-content-center">
                <div class="col-lg-10">
                    <h1 id="sobre" class="display-4 text-center mb-4">Meu Framework</h1>
                    <p class="lead text-center mb-5">
                        O <strong>Meu Framework</strong> é um framework PHP moderno, desenvolvido para acelerar a criação de aplicações web robustas, seguras e escaláveis. Ele oferece uma arquitetura limpa, modular e flexível, facilitando tanto projetos simples quanto sistemas profissionais.
                    </p>

                    <div class="row">
                        <div class="col-md-6 mb-4">
                            <div class="alert alert-dark shadow-sm h-100">
                                <div class="card-body">
                                    <h3 class="h5 mb-3"><i class="fa-solid fa-cubes"></i> Estrutura Modular</h3>
                                    <ul>
                                        <li><strong>MVC:</strong> Separação clara entre Model, View e Controller.</li>
                                        <li><strong>Rotas:</strong> Sistema de roteamento flexível e intuitivo.</li>
                                        <li><strong>Configuração .env:</strong> Variáveis de ambiente centralizadas.</li>
                                        <li><strong>SQL Externo:</strong> Consultas SQL organizadas em arquivos.</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-6 mb-4">
                            <div class="alert alert-dark shadow-sm h-100">
                                <div class="card-body">
                                    <h3 class="h5 mb-3"><i class="fa-solid fa-bolt"></i> Diferenciais</h3>
                                    <ul>
                                        <li><strong>Injeção de Dependências:</strong> Controllers e Models desacoplados.</li>
                                        <li><strong>Banco de Dados:</strong> PDO singleton, transações e SQL parametrizado.</li>
                                        <li><strong>APIs JSON:</strong> Pronto para integração com front-end moderno.</li>
                                        <li><strong>Login Exemplo:</strong> Sistema assíncrono, seguro e personalizável.</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="alert alert-dark shadow-sm mb-4" id="estrutura">
                        <div class="card-body">
                            <h3 class="h5 mb-3"><i class="fa-solid fa-folder-tree"></i> Estrutura de Pastas</h3>
                            <pre class="bg-light p-3 rounded mb-0">
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
                            </pre>
                        </div>
                    </div>

                    <div id="instalar" class="alert alert-dark text-center mt-4" role="alert">
                        <i class="fa-solid fa-circle-info"></i>
                        Lembre-se de alterar o arquivo <code>.env</code> dentro do framework!
                    </div>


                    <div class="alert alert-dark text-center mt-4 d-flex flex-column align-items-center" role="alert">
                        <h1>Executando o Framework com Docker</h1>

                        <h3>Passo 1 - Clonar o Repositório</h3>
                        <p>Clone o repositório do framework para sua máquina local. Esse comando irá baixar todos os arquivos necessários diretamente do GitHub.</p>
                        <div class="code-block mb-2">
                            <pre id="docker-passo1" class="bg-dark text-white p-3 rounded">git clone https://github.com/Otavio1661/base_projetos.git</pre>
                            <button class="btn btn-primary copy-btn" onclick="copiarTexto('docker-passo1')"><i class="fa-solid fa-clipboard"></i> Copiar</button>
                        </div>

                        <h3>Passo 2 - Instalar Dependências</h3>
                        <p>Entre na pasta do framework e instale as dependências utilizando o <code>Composer</code>.
                            Isso garantirá que todas as bibliotecas PHP necessárias sejam baixadas e configuradas corretamente.</p>
                        <div class="code-block mb-2">
                            <pre id="docker-passo2" class="bg-dark text-white p-3 rounded">composer install</pre>
                            <button class="btn btn-primary copy-btn" onclick="copiarTexto('docker-passo2')"><i class="fa-solid fa-clipboard"></i> Copiar</button>
                        </div>

                        <h3>Passo 3 - Iniciar o Ambiente com Docker</h3>
                        <p>Execute o comando abaixo para construir as imagens Docker e iniciar os containers.
                            O parâmetro <code>--build</code> garante que as imagens sejam reconstruídas caso haja mudanças no código.</p>
                        <div class="code-block">
                            <pre id="docker-passo3" class="bg-dark text-white p-3 rounded">docker-compose up -d --build</pre>
                            <button class="btn btn-primary copy-btn" onclick="copiarTexto('docker-passo3')"><i class="fa-solid fa-clipboard"></i> Copiar</button>
                        </div>
                    </div>


                    <div id="xampp" class="alert alert-dark text-center mt-4 d-flex flex-column align-items-center" role="alert">
                        <h1>Executando o Framework no XAMPP</h1>

                        <h3>Passo 1 - Clonar o Repositório</h3>
                        <p>Clone o repositório dentro da pasta <code>htdocs</code> do XAMPP. Isso irá baixar todos os arquivos necessários do projeto.</p>
                        <div class="code-block mb-2">
                            <pre id="xampp-passo1" class="bg-dark text-white p-3 rounded">git clone https://github.com/Otavio1661/base_projetos.git</pre>
                            <button class="btn btn-primary copy-btn" onclick="copiarTexto('xampp-passo1')"><i class="fa-solid fa-clipboard"></i> Copiar</button>
                        </div>

                        <h3>Passo 2 - Habilitar o módulo vhost_alias</h3>
                        <p>Abra o arquivo <code>httpd.conf</code> e verifique se a linha abaixo está descomentada:</p>
                        <div class="code-block mb-2">
                            <p><strong>Comentada (incorreto):</strong></p>
                            <pre class="bg-dark text-white p-3 rounded">#LoadModule vhost_alias_module modules/mod_vhost_alias.so</pre><br>
                            <p><strong>Correta (descomentada):</strong></p>
                            <div class="code-block mb-2">
                                <pre id="xampp-passo2" class="bg-dark text-white p-3 rounded">LoadModule vhost_alias_module modules/mod_vhost_alias.so</pre>
                                <button class="btn btn-primary copy-btn" onclick="copiarTexto('xampp-passo2')"><i class="fa-solid fa-clipboard"></i> Copiar</button>
                            </div>
                        </div>

                        <h3>Passo 3 - Configurar VirtualHost</h3>
                        <p>No arquivo <code>httpd-vhosts.conf</code>, adicione a configuração abaixo. Substitua <strong>NOME_DA_PASTA</strong> pelo nome da pasta onde o projeto foi clonado.
                            <br>Se você usou o nome padrão do <strong>Passo 1</strong>, a pasta será: <code>base_projetos</code>.
                        </p>
                        <div class="code-block">
                            <pre id="xampp-passo3" class="bg-dark text-white p-3 rounded desable-textarea" rows="10" readonly>
                            </pre>
                            <button class="btn btn-primary copy-btn" onclick="copiarTexto('xampp-passo3')"><i class="fa-solid fa-clipboard"></i> Copiar</button>
                        </div>
                    </div>



                    <!-- DOCUMENTAÇÃO DO FRAMEWORK -->
                    <div class="alert alert-dark shadow-sm mb-4 mt-5" id="documentação">
                        <div class="card-body">
                            <h2 class="h4 mb-4 text-center"><i class="fa-solid fa-book"></i> Documentação Completa</h2>
                            <div class="text-start" style="white-space: normal;">
                                <h5>Visão Geral</h5>
                                <p>
                                    O <strong>Meu Framework</strong> é um framework PHP moderno, modular e flexível, criado para acelerar o desenvolvimento de aplicações web robustas, seguras e escaláveis. Ele segue o padrão MVC, utiliza rotas amigáveis, suporta injeção de dependências, integra facilmente com bancos de dados via PDO e permite a separação de SQL em arquivos externos. Ideal para projetos de qualquer porte.
                                </p>
                                <hr>
                                <h5>Estrutura de Pastas</h5>
                                <pre class="bg-light p-3 rounded mb-3">
/core                # Núcleo do framework
├── Controller.php   # Classe base para controllers
├── DataBase.php     # Singleton PDO e execução de SQL externo
├── Router.php       # Sistema de rotas amigáveis
├── RouterBase.php   # Base do roteador

/public              # Arquivos públicos (webroot)
├── index.php        # Front controller
├── css/             # CSS customizado
├── js/              # JS customizado
├── img/             # Imagens

/src                 # Código da aplicação
├── config.php       # Configurações globais (usa .env)
├── Env.php          # Carrega variáveis do .env
├── routes.php       # Definição das rotas
├── controllers/     # Controllers da aplicação
│   ├── HomeController.php
│   ├── LoginController.php
│   └── RenderController.php
├── model/           # Models da aplicação
│   └── LoginModel.php
├── sql/             # SQL externo (ex: GetUser.sql)
├── view/            # Views (HTML/PHP)
│   ├── home.php
│   ├── login.php
│   └── partials/
│       ├── head.php
│       ├── topo.php
│       └── rodape.php

.env                  # Variáveis de ambiente (NUNCA versionar com dados sensíveis)
                                </pre>
                                <hr>
                                <h5>Configuração Inicial</h5>
                                <ol>
                                    <li><strong>Clone o repositório:</strong>
                                        <pre class="bg-dark text-white p-2 rounded mb-2">git clone https://github.com/Otavio1661/base_projetos.git</pre>
                                    </li>
                                    <li><strong>Configure o arquivo <code>.env</code>:</strong>
                                        <pre class="bg-dark text-white p-2 rounded mb-2">
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=nome_do_banco
DB_USERNAME=usuario
DB_PASSWORD=senha
                                        </pre>
                                    </li>
                                    <li><strong>Instale as dependências (se houver):</strong>
                                        <pre class="bg-dark text-white p-2 rounded mb-2">composer install</pre>
                                    </li>
                                    <li><strong>Acesse via navegador:</strong>
                                        <span>Se estiver usando XAMPP, configure o VirtualHost conforme <a href="#xampp" class="alert-link">instruções acima.</a></span>
                                    </li>
                                </ol>
                                <hr>
                                <h5 id="exemplos">Conceitos e Recursos</h5>
                                <ul>
                                    <li><strong>MVC (Model-View-Controller):</strong> Separação de responsabilidades entre lógica, dados e apresentação.</li>
                                    <li><strong>Sistema de Rotas:</strong> Definido em <code>/src/routes.php</code> com suporte a GET e POST.</li>
                                    <li><strong>Banco de Dados (PDO Singleton):</strong> Conexão única, SQL externo em <code>/src/sql/</code>.</li>
                                    <li><strong>Variáveis de Ambiente:</strong> Carregadas automaticamente do <code>.env</code>.</li>
                                    <li><strong>Injeção de Dependências:</strong> Controllers podem instanciar Models facilmente.</li>
                                    <li><strong>APIs JSON:</strong> Controllers podem retornar JSON facilmente.</li>
                                    <li><strong>Exemplo de Login:</strong> Login assíncrono via fetch/AJAX.</li>
                                </ul>
                                <hr>
                                <h5>Como Criar uma Nova Rota</h5>
                                <pre class="bg-light p-2 rounded mb-2">
$router->get('/minharota', 'MeuController@minhaAcao');
$router->post('/enviar', 'OutroController@enviarDados');
                                </pre>
                                <h5>Como Criar um Novo Controller</h5>
                                <pre class="bg-light p-2 rounded mb-2">
namespace src\controllers;
use core\Controller as ctrl;

class MeuController extends ctrl {
    public function minhaAcao() {
        $this->render('minhaview', ['title' => 'Minha Página']);
    }
}
                                </pre>
                                <span>Crie a view correspondente em <code>/src/view/minhaview.php</code>.</span>
                                <hr>
                                <h5>Como Usar SQL Externo</h5>
                                <pre class="bg-light p-2 rounded mb-2">
$result = Database::switchParams(['param' => $valor], 'BuscarUsuarios', true);
                                </pre>
                                <hr>
                                <h5>Como Retornar JSON</h5>
                                <pre class="bg-light p-2 rounded mb-2">
$this->json(['mensagem' => 'Sucesso!']);
// ou
ctrl::retorno(['mensagem' => 'Sucesso!'], 200);
                                </pre>
                                <hr>
                                <h5>Exemplo de Login (AJAX)</h5>
                                <ul>
                                    <li>Front-end: <code>/src/view/login.php</code></li>
                                    <li>Back-end: <code>/src/controllers/LoginController.php</code> e <code>/src/model/LoginModel.php</code></li>
                                    <li>Rota: <code>/postlogin</code> (POST)</li>
                                </ul>
                                <hr>
                                <h5>Personalização de Layout</h5>
                                <ul>
                                    <li>Partials em <code>/src/view/partials/</code> (<code>head.php</code>, <code>topo.php</code>, <code>rodape.php</code>)</li>
                                    <li>CSS customizado em <code>/public/css/</code></li>
                                    <li>JS customizado em <code>/public/js/</code></li>
                                </ul>
                                <hr>
                                <h5>Boas Práticas</h5>
                                <ul>
                                    <li>Nunca versionar <code>.env</code> com dados sensíveis.</li>
                                    <li>Separe lógica de negócio (Model) da lógica de apresentação (View).</li>
                                    <li>Use SQL externo para facilitar manutenção.
                                        <p>        $db = Database::getInstance();
        $db->beginTransaction();
        $db->commit();
        $db->rollBack();</p>
                                    </li>
                                    <li>Utilize rotas amigáveis e controllers organizados.</li>
                                </ul>
                                <hr>
                                <h5>Dúvidas Frequentes</h5>
                                <ul>
                                    <li><strong>Como adicionar uma nova página?</strong> Crie o controller e a view, depois adicione a rota em <code>routes.php</code>.</li>
                                    <li><strong>Como conectar a outro banco?</strong> Altere as variáveis no <code>.env</code>.</li>
                                    <li><strong>Como proteger rotas?</strong> Implemente lógica de autenticação no controller.</li>
                                </ul>
                                <hr>
                                <h5>Contribua!</h5>

                                <div class="alert alert-info text-center mt-4" role="alert">
                                    <i class="fa-solid fa-circle-info"></i>
                                    Este framework foi criado para ser simples, mas poderoso. Explore o código, adapte para seu projeto e contribua!
                                </div>

                                <div class="alert alert-success text-center mt-4" role="alert">
                                    <strong>Meu Framework</strong> — Simples, moderno e pronto para produção!
                                </div>
                            </div>
                        </div>
                    </div>
                    <!-- FIM DOCUMENTAÇÃO -->

                    <div class="text-center mt-4">
                        <a href="/login" class="btn btn-primary btn-lg">
                            <i class="fa-solid fa-right-to-bracket"></i> Acessar Login de Exemplo
                        </a>
                    </div>
                </div>
            </div>
        </div>
    </main>

    <?php include($partials . "rodape.php"); ?>
</body>
