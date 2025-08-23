<?php include($partials . "head.php"); ?>

<body class="d-flex flex-column min-vh-100 bg-light">

    <?php include($partials . "topo.php"); ?>

    <main class="flex-fill">
        <div class="container py-5">
            <div class="row justify-content-center">
                <div class="col-md-6">
                    <div class="card shadow-sm">
                        <div class="card-body">
                            <h2 class="mb-4 text-center"><i class="fa-solid fa-right-to-bracket"></i> Login de Exemplo</h2>
                            <div id="loginError" class="alert alert-danger d-none" role="alert">
                                Usuário inválido!
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

            if (result.retorno && result.retorno.info && result.retorno.info.erroLogin == false) {
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
                        window.location.href = '/login';
                    });
                } else {
                    document.getElementById('loginError').classList.remove('d-none');
                }
            } else {
                Swal.fire({
                    title: 'Erro!',
                    text: result.retorno && result.retorno.info ? result.retorno.info.message : 'Erro ao logar.',
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