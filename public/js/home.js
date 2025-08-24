document.addEventListener("DOMContentLoaded", function () {
document.getElementById("xampp-passo3").innerHTML =
    `   < VirtualHost *:80>
                                        DocumentRoot "C:/xampp/htdocs/NOME_DA_PASTA/public"
                   ServerName NOME_DA_PASTA.local
                                            < Directory "C:/xampp/htdocs/NOME_DA_PASTA/public">
                AllowOverride All
                  Require all granted
       < /Directory>
< /VirtualHost>`;
});

function copiarTexto(id) {
    const texto = document.getElementById(id).innerText.trim();

    navigator.clipboard.writeText(texto)
        .then(() => {
            Swal.fire({
                title: 'Copiado!',
                text: 'Texto copiado: "' + texto + '"',
                icon: 'success',
                timer: 1500,
                showConfirmButton: false
            });
        })
        .catch(err => {
            Swal.fire({
                title: 'Erro!',
                text: 'Erro ao copiar o texto: ' + err,
                icon: 'error',
                confirmButtonColor: '#dc3545'
            });
        });
}