<?php
/**
 * Roteador do servidor embutido do PHP (SÓ desenvolvimento):
 *
 *     php -S 127.0.0.1:8087 -t public tools/dev-router.php
 *
 * Sem ele, o `php -S` devolve 404 para rotas que passam por uma pasta existente em public/ (ex.: /erp/login,
 * /erp/api/*, porque existe public/erp/), diferente do nginx de produção (docker/nginx/default.conf), que
 * manda tudo que não é arquivo para o public/index.php.
 *
 * Regra: arquivo estático existente dentro de public/ → servido pelo próprio PHP; qualquer outra coisa →
 * public/index.php (front controller). Nunca serve arquivos fora de public/, nem .php diferente do index.php.
 */

$caminho = rawurldecode((string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH));
$raiz = realpath(__DIR__ . '/../public');
$arquivo = $raiz !== false ? realpath($raiz . $caminho) : false;

$estatico = $arquivo !== false
    && is_file($arquivo)
    && str_starts_with($arquivo, $raiz . DIRECTORY_SEPARATOR)       // nada fora de public/
    && strcasecmp(pathinfo($arquivo, PATHINFO_EXTENSION), 'php') !== 0  // .php nunca é servido como arquivo
    && basename($arquivo)[0] !== '.';                                // dotfiles nunca

if ($estatico) {
    return false;   // deixa o servidor embutido entregar o arquivo (com o Content-Type certo)
}

$_SERVER['SCRIPT_NAME'] = '/index.php';
$_SERVER['SCRIPT_FILENAME'] = $raiz . DIRECTORY_SEPARATOR . 'index.php';
chdir($raiz);
require $raiz . DIRECTORY_SEPARATOR . 'index.php';
