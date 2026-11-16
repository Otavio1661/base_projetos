<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><?= htmlspecialchars($titulo ?? 'Mini ERP', ENT_QUOTES, 'UTF-8') ?></title>
  <link rel="stylesheet" href="<?= asset('/libr4/libr4.css') ?>">
  <link rel="stylesheet" href="<?= asset('/erp/erp.css') ?>">
  <script src="<?= asset('/showcase/boot.js') ?>"></script>
</head>
<body class="erp-login">
  <div id="erp-root" data-cadastro="<?= !empty($cadastroAberto) ? '1' : '0' ?>" data-demo="<?= !empty($contaDemo) ? '1' : '0' ?>"></div>
  <script src="<?= asset('/libr4/libr4.js') ?>"></script>
  <script src="<?= asset('/erp/login.js') ?>"></script>
</body>
</html>
