<?php
require __DIR__ . '/../vendor/autoload.php';

session_start();

/**
 * Função para gerar URL de assets com versão baseada na última modificação
 */
function asset($path) {
    $fullPath = $_SERVER['DOCUMENT_ROOT'] . $path;
    if (file_exists($fullPath)) {
        $version = filemtime($fullPath);
        return $path . '?v=' . $version;
    }
    return $path;
}

// Torna a função disponível globalmente
$GLOBALS['asset'] = 'asset';

// Carregar rotas
$router = require __DIR__ . '/../src/routes.php';

// Rodar
$router->run();
