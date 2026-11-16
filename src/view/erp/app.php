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
<body class="erp-app">
  <div id="erp-root"></div>
  <script src="<?= asset('/libr4/libr4.js') ?>"></script>
  <script src="<?= asset('/erp/app.js') ?>"></script>
<?php /* app.js cria window.ErpPaginas e só monta o shell depois de /erp/api/eu (assíncrono): as páginas abaixo já estão registradas */ ?>
<?php foreach (['dashboard', 'clientes', 'produtos', 'pedidos', 'transacoes', 'arquivos', 'perfil'] as $p) : ?>
  <script src="<?= asset('/erp/paginas/' . $p . '.js') ?>"></script>
<?php endforeach; ?>
</body>
</html>
