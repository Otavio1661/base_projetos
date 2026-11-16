<?php
/**
 * Gera os dados FICTÍCIOS do mini ERP (/erp) em storage/data/*.json: usuários, clientes, produtos e pedidos.
 * Determinístico (mesma semente = mesmos dados). Uso: php tools/erp-seed.php [--forcar] [--com-demo]
 * Sem --forcar não sobrescreve o que já existe (cadastros feitos no /erp não se perdem).
 *
 * Conta de teste demo@r4dev.com.br / Demo@1234 (cargo gestor): senha PÚBLICA, só para demonstração.
 *  - fora de produção é criada sempre (junto com usuarios.json);
 *  - com APP_ENV=production (ou sem .env/APP_ENV, que vale como produção) o script RECUSA rodar sem --forcar, e mesmo
 *    com --forcar NÃO cria a conta de teste, a menos que se peça --com-demo (ex.: um site público de demonstração).
 *    Para remover depois: apague o registro de storage/data/usuarios.json (ou rode de novo sem --com-demo e --forcar,
 *    o que recria usuarios.json VAZIO).
 */
require __DIR__ . '/../vendor/autoload.php';

use App\Controllers\ErpAuthController;
use App\Utils\ErpDados;
use App\Utils\JsonDb;

$forcar = in_array('--forcar', $argv, true);
$env = is_file(__DIR__ . '/../.env') ? (@parse_ini_file(__DIR__ . '/../.env', false, INI_SCANNER_TYPED) ?: []) : [];
$producao = strtolower((string) ($env['APP_ENV'] ?? 'production')) === 'production';
if ($producao && !$forcar) {
    fwrite(STDERR, "APP_ENV=production: recusado. Este script grava dados FICTICIOS (e, com --com-demo, uma conta de senha publica).\n"
        . "Se for mesmo o que quer: php tools/erp-seed.php --forcar [--com-demo]\n");
    exit(1);
}
$comDemo = !$producao || in_array('--com-demo', $argv, true);
mt_srand(20261116);

$existe = static fn (string $t) => is_file(JsonDb::dir() . "/$t.json");

if ($forcar || !$existe('usuarios')) {
    $usuarios = $comDemo ? [[
        'id' => 1, 'nome' => 'Conta Demonstração', 'email' => 'demo@r4dev.com.br',
        'senhaHash' => ErpAuthController::hashSenha('Demo@1234'), 'cargo' => 'gestor',
        'tema' => 'auto', 'idioma' => 'pt-BR', 'avatar' => '', 'criadoEm' => '2026-11-16',
    ]] : [];
    JsonDb::gravar('usuarios', $usuarios);
    echo 'usuarios: ' . count($usuarios) . ($comDemo ? " (conta de teste demo@r4dev.com.br — senha publica, so para demonstracao)\n" : " (sem conta de teste)\n");
}
$clientes = [];
if ($forcar || !$existe('clientes')) {
    for ($i = 1; $i <= 1500; $i++) {
        $clientes[] = ErpDados::cliente($i);
    }
    JsonDb::gravar('clientes', $clientes);
    echo "clientes: " . count($clientes) . "\n";
} else {
    $clientes = JsonDb::todos('clientes');
}
if ($forcar || !$existe('produtos')) {
    $p = [];
    for ($i = 1; $i <= 400; $i++) {
        $p[] = ErpDados::produto($i);
    }
    JsonDb::gravar('produtos', $p);
    echo "produtos: " . count($p) . "\n";
}
if ($forcar || !$existe('pedidos')) {
    $p = [];
    for ($i = 1; $i <= 6000; $i++) {
        $p[] = ErpDados::pedido($i, $clientes);
    }
    JsonDb::gravar('pedidos', $p);
    echo "pedidos: " . count($p) . "\n";
}
echo "ok\n";
