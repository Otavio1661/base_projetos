<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>libr4 - Vitrine</title>
  <?php $min = isset($_GET['min']) && $_GET['min'] === '1'; /* ?min=1: usa o pacote minificado de libr4/dist */ ?>
  <link rel="stylesheet" href="<?= asset($min ? '/libr4/dist/libr4.min.css' : '/libr4/libr4.css') ?>">
  <link rel="stylesheet" href="<?= asset('/showcase/vitrine.css') ?>">
  <?php /* CSP estrita: NENHUM <script> inline. A flag da vitrine vai numa meta (JSON com JSON_HEX_* + htmlspecialchars; o app.js lê dela, com window.R4_VITRINE como alternativa) e o anti-flash do tema é um arquivo externo, síncrono. */ ?>
  <meta name="r4-vitrine" content="<?= htmlspecialchars((string)json_encode(['api' => \App\Config::APP_DEBUG === true, 'publica' => \App\Config::APP_DEBUG !== true], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>">
  <script src="<?= asset('/showcase/boot.js') ?>"></script>
</head>
<body>
  <script src="<?= asset($min ? '/libr4/dist/libr4.min.js' : '/libr4/libr4.js') ?>"></script>
  <script src="<?= asset('/showcase/demos.js') ?>"></script>
  <script src="<?= asset('/showcase/vitrineData/vitrineData.js') ?>"></script>
  <script src="<?= asset('/showcase/demos/form.js') ?>"></script>
  <script src="<?= asset('/showcase/demos/dados.js') ?>"></script>
  <script src="<?= asset('/showcase/demos/ui.js') ?>"></script>
  <script src="<?= asset('/showcase/demos/chart.js') ?>"></script>
  <script src="<?= asset('/showcase/demos/theme.js') ?>"></script>
  <script src="<?= asset('/showcase/demos/receitas.js') ?>"></script>
  <script src="<?= asset('/showcase/i18n.js') ?>"></script>
  <script src="<?= asset('/showcase/demos/icons.js') ?>"></script>
  <script src="<?= asset('/showcase/demos/store.js') ?>"></script>
  <script src="<?= asset('/showcase/demos/imageeditor.js') ?>"></script>
  <script src="<?= asset('/showcase/demos/declarativo.js') ?>"></script>
  <script src="<?= asset('/showcase/app.js') ?>"></script>
</body>
</html>
