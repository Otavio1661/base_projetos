<?php
require __DIR__ . '/../vendor/autoload.php';
require __DIR__ . '/../src/Env.php';

use App\Config;

session_set_cookie_params([
    'httponly' => true,
    'samesite' => 'Lax',
    'secure' => !empty($_SERVER['HTTPS']),
]);
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
function asset($path)
{
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
 * Função para injetar a chave de criptografia (BASE_CRIPTOGRAFIA) no HTML
 * Adiciona o script com BASE_CRIPTOGRAFIA antes de fechar </head>; a libr4 lê window.BASE_CRIPTOGRAFIA
 */
function injectCryptoConfig($content)
{
    // json_encode com HEX_* impede que a chave feche o <script> ou injete HTML
    $cryptoScript = '<script>window.BASE_CRIPTOGRAFIA = ' . json_encode((string) Config::BASE_CRIPTOGRAFIA, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) . ';</script>';
    return str_replace('</head>', $cryptoScript . "\n</head>", $content);
}

// Iniciar buffer de saída para processar HTML antes de enviar
ob_start('injectCryptoConfig');

// Carregar rotas
$router = require __DIR__ . '/../src/routes.php';

// Rodar
$router->run();
