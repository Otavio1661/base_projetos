<?php
require __DIR__ . '/../vendor/autoload.php';

use src\Config;

session_start();

// Configurar exibição de erros baseado em APP_DEBUG
if (Config::APP_DEBUG === false) {
    error_reporting(0);
    ini_set('display_errors', '0');
    ini_set('display_startup_errors', '0');
} else {
    error_reporting(E_ALL);
    ini_set('display_errors', '1');
    ini_set('display_startup_errors', '1');
}

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

/**
 * Função para injetar configurações de criptografia e script r4.js no HTML
 * Adiciona automaticamente o script com BASE_CRIPTOGRAFIA e r4.js antes de fechar </head>
 */
function inject_crypto_config($content) {
    $cryptoScript = '<script>window.BASE_CRIPTOGRAFIA = "' . Config::BASE_CRIPTOGRAFIA . '";</script>';
    $r4Script = '<script src="/js/r4.js"></script>';
    $injection = $cryptoScript . "\n" . $r4Script;
    return str_replace('</head>', $injection . "\n</head>", $content);
}

// Iniciar buffer de saída para processar HTML antes de enviar
ob_start('inject_crypto_config');

// Carregar rotas
$router = require __DIR__ . '/../src/routes.php';

// Rodar
$router->run();
