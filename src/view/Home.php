<?php
// Toast pequeno

use src\resources\alert;

echo alert::successToast("Registro salvo!", "Sucesso!");
echo alert::errorToast("Falha ao salvar!", "Erro!");

// Modal centralizado
echo alert::successModal("Seu cadastro foi concluído!", "Parabéns!");
echo alert::errorModal("Não foi possível processar.", "Ops!", 'tentar de novo', ['testeAlert()', true], ['5000', true]);
?>
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo $titulo; ?></title>
    <link rel="icon" href="/img/aaaaa2.png" type="image/png">
    <link rel="stylesheet" href="/CSS_New/colors.css">
    <link rel="stylesheet" href="/CSS_New/alert.css">
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
            background: linear-gradient(90deg, #6a11cb 0%, #2575fc 100%);
            height: 100vh;
            width: 100%;
        }

        h1 {
            color: #333;
        }

        @media (max-width: 600px) {
            body {
                height: 100vh;

            }

        }

        .card-title {
            font-weight: 700;
            letter-spacing: 1px;
        }

        .card-text {
            line-height: 1.7;
        }

        /* Confetti Animation */
        .confetti {
            position: fixed;
            top: -40px;
            width: 12px;
            height: 24px;
            opacity: 0.85;
            z-index: 9999;
            border-radius: 3px;
            animation: confetti-fall 2.5s linear forwards;
        }

        @keyframes confetti-fall {
            to {
                top: 110vh;
                transform: rotate(360deg);
                opacity: 0.7;
            }
        }
    </style>

</head>

<body>

    <?php include $partials . 'navbar.php'; ?>

    <section style="padding: 0; height: 100vh; width: 100%; display: flex; justify-content: center; align-items: center;">
        <img src="/img/aaaaa3.png" alt="Imagem" class="img-fluid" width="90%">
    </section>


    <!-- Sobre o Framework -->
    <section style="padding: 0; height: 100vh; width: 100%; display: flex; justify-content: center; align-items: center;">
        <div class="" style="display: flex; justify-content: center; align-items: center; margin: 1em;">
            <div class="col-lg-8 col-md-10">
                <div class="card shadow-sm border-0">
                    <div class="card-body">
                        <h2 class="card-title text-primary mb-3" id="sobre-o-framework">Sobre o Framework</h2>
                        <p class="card-text fs-5">
                            Este framework foi criado para testar meus conhecimentos em desenvolvimento web e para agilizar meus projetos pessoais e profissionais. Ele oferece funções práticas, eficazes e seguras, facilitando a construção de aplicações modernas com organização e produtividade.<br><br>
                            O objetivo é proporcionar uma base sólida para aprender, experimentar novas ideias e acelerar o desenvolvimento, sem abrir mão da segurança e das boas práticas. Sinta-se à vontade para explorar, contribuir e adaptar conforme suas necessidades!
                        </p>
                    </div>
                    <button class="btn btn-primary">Saiba mais</button>
                </div>
            </div>
        </div>
    </section>

    <?php include $partials . 'footer.php'; ?>

    <script>


        function testeAlert() {
            alert("testesttetstesttestetste");
        }


        document.addEventListener('DOMContentLoaded', function () {
            const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22'];
            const confettiCount = 40;
            for (let i = 0; i < confettiCount; i++) {
                const confetti = document.createElement('div');
                confetti.className = 'confetti';
                confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
                confetti.style.left = Math.random() * 100 + 'vw';
                confetti.style.animationDelay = (Math.random() * 1.5) + 's';
                confetti.style.transform = `rotate(${Math.random() * 360}deg)`;
                document.body.appendChild(confetti);
                setTimeout(() => confetti.remove(), 3000);
            }
        });
    </script>

</body>

</html>