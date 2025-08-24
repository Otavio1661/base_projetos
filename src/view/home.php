<?php
    include($partials . "head.php");
?>
<link rel="stylesheet" href="/css/home.css">
</head>

<body class="d-flex flex-column min-vh-100 bg-light">

    <?php include($partials . "topo.php"); ?>

    <main class="flex-fill">
        <div class="container py-5">
            <div class="row justify-content-center">
                <div class="col-lg-10">
                    <h1 class="display-4 text-center mb-4">Meu Framework</h1>
                    <p class="lead text-center mb-5">
                        O <strong>Meu Framework</strong> é um framework PHP moderno, desenvolvido para acelerar a criação de aplicações web robustas, seguras e escaláveis. Ele oferece uma arquitetura limpa, modular e flexível, facilitando tanto projetos simples quanto sistemas profissionais.
                    </p>

                    <div class="row">
                        <div class="col-md-6 mb-4">
                            <div class="card shadow-sm h-100">
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
                            <div class="card shadow-sm h-100">
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

                    <div class="card shadow-sm mb-4" id="estrutura">
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


                    <div class="alert alert-dark text-center mt-4 d-flex flex-column align-items-center" role="alert">
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


                    <div class="alert alert-info text-center mt-4" role="alert">
                        <i class="fa-solid fa-circle-info"></i>
                        Este framework foi criado para ser simples, mas poderoso. Explore o código, adapte para seu projeto e contribua!
                    </div>

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

</html>