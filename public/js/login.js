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

        const retorno = result.retorno;

        if (retorno.erro_login === "false") {
            // Login bem-sucedido
            Swal.fire({
                title: 'Sucesso!',
                text: retorno.message,
                icon: 'success',
                confirmButtonColor: '#28a745',
                background: '#f0fdf4',
                color: '#155724',
                allowOutsideClick: false,
                showConfirmButton: false,
                timer: 2000,
                timerProgressBar: true,
            }).then(() => {
                window.location.href = '/menu';
            });
        } else {
            Swal.fire({
                title: 'Erro!',
                text: retorno.message ? retorno.message : 'Erro ao logar.',
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