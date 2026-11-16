<?php
require __DIR__ . '/../vendor/autoload.php';
require __DIR__ . '/../src/Env.php';

use App\Config;
use Core\Security\Crypto;
use Core\Security\Csrf;
use Core\Security\Transport;

// Política HTTPS/HTTP do .env (HTTPS_MODE, HTTP_PERMITIDO_PARA, TRUSTED_PROXIES, APP_HOSTS, HSTS_*).
// Pode responder 308 (GET/HEAD → https), 426 (outros métodos em HTTP) ou 400 (Host inválido) e encerrar aqui.
Transport::aplicar();

// Anti-CSRF por origem (CSRF_ATIVO, CSRF_ORIGENS_PERMITIDAS): POST/PUT/PATCH/DELETE vindos de outro site
// (Origin / Sec-Fetch-Site) → 403; Content-Type que um <form> forja sem preflight → 415. Ver Core\Security\Csrf.
Csrf::guard();

/**
 * GET /r4/chave — chave PÚBLICA do servidor para a criptografia v2 ({v:2, pub, kid}).
 * É o mesmo JSON da <meta name="r4-server-key"> das páginas; serve páginas que não passam por este index.php.
 * Público por natureza (não é segredo); sem sessão e sem cache longo (a chave pode ser rotacionada).
 */
if (parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH) === '/r4/chave') {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-cache');
    header('X-Content-Type-Options: nosniff');
    $metodo = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if ($metodo !== 'GET' && $metodo !== 'HEAD') {
        http_response_code(405);
        header('Allow: GET, HEAD');
        exit(json_encode(['status' => 405, 'retorno' => 'Método não permitido'], JSON_UNESCAPED_UNICODE));
    }
    $info = Crypto::publicKeyInfo();
    if ($info === null) {
        http_response_code(503);
        exit(json_encode(['status' => 503, 'retorno' => 'Criptografia indisponível'], JSON_UNESCAPED_UNICODE));
    }
    exit($metodo === 'HEAD' ? '' : json_encode($info, JSON_UNESCAPED_SLASHES));
}

// Sessão: NÃO é iniciada aqui. Quem precisa (login, middleware de autenticação...) chama
// Core\Security\Session::start() — cookie HttpOnly, SameSite=Lax, Secure + "__Host-R4SID" em HTTPS.

// Erros: sempre registrados no log; na tela só com APP_DEBUG=true
if (Config::APP_DEBUG === false) {
    error_reporting(E_ALL & ~E_DEPRECATED);
    ini_set('display_errors', '0');
    ini_set('display_startup_errors', '0');
    ini_set('log_errors', '1');
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
 * Insere a chave PÚBLICA do servidor (criptografia v2) nas páginas HTML, antes do primeiro </head>:
 *   <meta name="r4-server-key" content="{&quot;v&quot;:2,&quot;pub&quot;:&quot;...&quot;,&quot;kid&quot;:&quot;...&quot;}">
 * Sem <script> inline: a CSP pode usar script-src 'self' (sem 'unsafe-inline'). A libr4 (net.js) lê a
 * meta; window.R4_SERVER_KEY continua aceito como alternativa, e GET /r4/chave serve quem não tem a meta.
 * Nenhum segredo vai para o navegador (a chave privada fica só no .env). htmlspecialchars(ENT_QUOTES)
 * impede que o valor saia do atributo. Respostas que não são HTML (JSON etc.) não são tocadas.
 */
function injectCryptoConfig($content)
{
    try {
        $pos = stripos($content, '</head>');
        if ($pos === false) {
            return $content;
        }
        foreach (headers_list() as $h) {
            if (stripos($h, 'content-type:') === 0 && stripos($h, 'text/html') === false) {
                return $content;
            }
        }
        $info = Crypto::publicKeyInfo();
        if ($info === null) {
            return $content;
        }
        $json = json_encode($info, JSON_UNESCAPED_SLASHES);
        if (!is_string($json)) {
            return $content;
        }
        $meta = '<meta name="r4-server-key" content="' . htmlspecialchars($json, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '">' . "\n";
        return substr_replace($content, $meta, $pos, 0);
    } catch (\Throwable $e) {
        error_log('[R4 crypto] falha ao inserir a chave pública: ' . $e->getMessage());
        return $content;
    }
}

// Iniciar buffer de saída para processar HTML antes de enviar
ob_start('injectCryptoConfig');

// Carregar rotas
$router = require __DIR__ . '/../src/routes.php';

// Rodar
$router->run();
