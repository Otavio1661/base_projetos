<?php
/**
 * ============================================
 * tools/gerar-chave.php — gera o par de chaves P-256 da criptografia v2
 * ============================================
 * Uso:
 *   php tools/gerar-chave.php
 *
 * Imprime a linha CRYPTO_PRIVATE_KEY="..." para colar no .env do servidor (NUNCA no Git) e, como
 * informação, a chave pública e o kid que o navegador vai receber (window.R4_SERVER_KEY / GET /r4/chave).
 *
 * Rotação sem derrubar sessões abertas: mova a chave atual para CRYPTO_PRIVATE_KEY_ANTERIOR, cole a
 * nova em CRYPTO_PRIVATE_KEY e, depois de um tempo (ex.: 1 dia), apague a ANTERIOR. Ver docs/PRODUCAO.md.
 *
 * Só PHP + extensão openssl (sem Composer, sem Node). Nada é gravado em disco.
 * ============================================
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../core/Security/Crypto.php';

use Core\Security\Crypto;

if (!extension_loaded('openssl')) {
    fwrite(STDERR, "Erro: a extensão openssl do PHP não está habilitada.\n");
    exit(1);
}

$par = Crypto::gerarChave();
if ($par === null) {
    fwrite(STDERR, "Erro: o OpenSSL não conseguiu gerar a chave P-256 (confira a extensão openssl / OPENSSL_CONF).\n");
    exit(1);
}

echo "# Cole a linha abaixo no .env do servidor (uma linha só; não versione):\n";
echo 'CRYPTO_PRIVATE_KEY="' . $par['privada'] . "\"\n\n";
echo "# Informativo (público; vai para o navegador):\n";
echo '#   kid: ' . $par['kid'] . "\n";
echo '#   pub: ' . $par['pub'] . "\n";
exit(0);
