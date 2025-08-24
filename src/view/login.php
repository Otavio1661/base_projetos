<?php 
    include($partials . "head.php"); 
?>

<!-- <link rel="stylesheet" href="/css/login.css"> -->

</head>

<body class="d-flex flex-column min-vh-100 bg-light">

    <?php include($partials . "topo.php"); ?>

    <div id="voltar" class="container d-flex justify-content-end">
        <a href="/home" class="btn btn-primary ms-auto">Voltar</a>
    </div>
    <main class="flex-fill">
        <div class="container py-5">
            <div class="row justify-content-center">
                <div class="col-md-6">
                    <div class="card shadow-sm">
                        <div class="card-body">
                            <h2 class="mb-4 text-center"><i class="fa-solid fa-right-to-bracket"></i> Login de Exemplo</h2>
                            <div id="loginError" class="alert alert-success" role="alert">
                                Usuário = 'admin'
                            </div>
                            <form onsubmit="event.preventDefault(); logarUsuario();">
                                <div class="mb-3">
                                    <label for="username" class="form-label">Usuário</label>
                                    <input type="text" class="form-control" id="username" placeholder="Digite seu usuário" required>
                                </div>
                                <button type="submit" class="btn btn-primary w-100">
                                    <i class="fa-solid fa-arrow-right-to-bracket"></i> Entrar
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </main>

    <?php include($partials . "rodape.php"); ?>
</body>

</html>
