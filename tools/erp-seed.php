<?php
/**
 * Gera os dados FICTÍCIOS do mini ERP (/erp) em storage/data/*.json: usuários, clientes, produtos e pedidos.
 * Determinístico (mesma semente = mesmos dados). Uso: php tools/erp-seed.php [--forcar]
 * Sem --forcar não sobrescreve o que já existe (cadastros feitos no /erp não se perdem).
 */
require __DIR__ . '/../vendor/autoload.php';

use App\Utils\ErpDados;
use App\Utils\JsonDb;

$forcar = in_array('--forcar', $argv, true);
mt_srand(20261116);

$existe = static fn (string $t) => is_file(JsonDb::dir() . "/$t.json");

if ($forcar || !$existe('usuarios')) {
    JsonDb::gravar('usuarios', [[
        'id' => 1, 'nome' => 'Conta Demonstração', 'email' => 'demo@r4dev.com.br',
        'senhaHash' => password_hash('Demo@1234', PASSWORD_DEFAULT), 'cargo' => 'gestor',
        'tema' => 'auto', 'idioma' => 'pt-BR', 'avatar' => '', 'criadoEm' => '2026-11-16',
    ]]);
    echo "usuarios: 1\n";
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
