<?php
include($partials . "head.php");
?>

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

                    <div class="card shadow-sm mb-4">
                        <div class="card-body">
                            <h3 class="h5 mb-3"><i class="fa-solid fa-folder-tree"></i> Estrutura de Pastas</h3>
                            <pre class="bg-light p-3 rounded mb-0">
/core   <── Núcleo do framework (Router, Controller, Database)
├── DataBase.php
├── Router.php
├── Controller.php
/src
├── config.php
├── controllers/
│   └── RenderController.php
├── model/
├── sql/
├── view/
│   ├── home.php
│   └── partials/
│       ├── topo.php
│       └── rodape.php
.env    <── Configurações do ambiente
                            </pre>
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


    <script>
        async function logarUsuario() {
            const usuario = document.getElementById('username').value.trim();

            if (!usuario) {
                alert('Preencha usuário!');
                return;
            }

            const data = {
                usuario: usuario
            };

            try {
                const response = await fetch('/postlogin', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                });

                const result = await response.json();

                console.log(result);

                if (result.retorno.info.erroLogin == false) {
                    if (result.status === 200) {
                        Swal.fire({
                            title: 'Sucesso!',
                            text: result.retorno.info.message,
                            icon: 'success',
                            confirmButtonColor: '#28a745',
                            background: '#f0fdf4',
                            color: '#155724',
                            allowOutsideClick: false,
                            showConfirmButton: false,
                            timer: 2000,
                            timerProgressBar: true
                        }).then(() => {
                            window.location.href = '/admin-home';
                        });
                    } else {
                        document.getElementById('loginError').classList.remove('d-none');
                    }
                } else {
                    Swal.fire({
                        title: 'Erro!',
                        text: result.retorno.info.message,
                        icon: 'error',
                        confirmButtonColor: '#dc3545'
                    });
                }

            } catch (error) {
                Swal.fire({
                    title: 'Erro de conexão!',
                    text: 'Erro ao conectar com o servidor: ' + error.message,
                    icon: 'error',
                    confirmButtonColor: '#dc3545'
                });
            }

        }
    </script>