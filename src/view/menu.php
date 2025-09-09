<?php
include($partials . "head.php");
?>

<!-- <link rel="stylesheet" href="/css/login.css"> -->

</head>

<body class="d-flex flex-column min-vh-100 bg-light">

    <?php include($partials . "admin/topo.php"); ?>

    <div id="voltar" class="container d-flex justify-content-end">
        <a class="btn btn-primary ms-auto" onclick="logout()">Sair</a>
    </div>
    <div class="d-flex justify-content-center align-items-center" style="height: 80vh;">
        <h1 class="text-center">Esse é o menu<br>Você passou pelo middleware!</h1>
    </div>

    <?php include($partials . "rodape.php"); ?>
</body>

</html>


<script>
    async function logout() {
        try {
            Swal.fire({
                title: "Quer mesmo sair?",
                text: "Você não poderá reverter isso!",
                icon: "warning",
                showCancelButton: true,
                confirmButtonColor: "#3085d6",
                cancelButtonColor: "#d33",
                confirmButtonText: "Sim, sair"
            }).then(async (result) => {
                if (result.isConfirmed) {
                    const response = await fetch('/logout', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });

                    const data = await response.json();

                    if (data.status === 200 && data.retorno.logout === true) {
                        Swal.fire({
                            title: 'Sucesso!',
                            text: data.retorno.message,
                            icon: 'success',
                            confirmButtonColor: '#28a745',
                            background: '#f0fdf4',
                            color: '#155724',
                            allowOutsideClick: false,
                            showConfirmButton: false,
                            timer: 2000,
                            timerProgressBar: true,
                        }).then(() => {
                            window.location.href = '/login';
                        });
                    }
                }
            });
        } catch (error) {
            console.error('Erro:', error);
        }
    }
</script>