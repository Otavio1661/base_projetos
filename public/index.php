<?php
require __DIR__ . '/../vendor/autoload.php';

// Carregar rotas
$router = require __DIR__ . '/../src/routes.php';

// Rodar
$router->run();
