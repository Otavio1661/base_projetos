<?php
/**
 * Gera a tabela grande da demonstração: storage/data/transacoes.sqlite (padrão 2.000.000 linhas fictícias).
 * Uso: php tools/erp-seed-transacoes.php [linhas] [--forcar]
 * Determinístico, sem rede. Demora ~1 min para 2 milhões. O arquivo fica fora do public/ e fora do Git.
 */
require __DIR__ . '/../vendor/autoload.php';

use App\Utils\ErpDados;
use App\Utils\JsonDb;

$n = 2000000;
foreach (array_slice($argv, 1) as $a) {
    if (ctype_digit($a)) {
        $n = max(1000, (int) $a);
    }
}
$arq = JsonDb::dir() . '/transacoes.sqlite';
if (is_file($arq) && !in_array('--forcar', $argv, true)) {
    echo "Já existe ($arq). Use --forcar para recriar.\n";
    exit(0);
}
@unlink($arq);
mt_srand(20261116);
$t0 = microtime(true);
$pdo = new PDO('sqlite:' . $arq, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo->exec('PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA page_size=8192; PRAGMA cache_size=-200000');
$pdo->exec('CREATE TABLE transacoes (id INTEGER PRIMARY KEY, cliente TEXT, cidade TEXT, uf TEXT, produto TEXT, categoria TEXT, valor REAL, data TEXT, status TEXT, busca TEXT)');

$lote = 400;   // 400 linhas x 10 colunas = 4000 parâmetros (limite do SQLite: 32766)
$um = '(?,?,?,?,?,?,?,?,?,?)';
$stmtLote = $pdo->prepare('INSERT INTO transacoes VALUES ' . implode(',', array_fill(0, $lote, $um)));
$pdo->beginTransaction();
$id = 0;
$buf = [];
while ($id < $n) {
    $faltam = min($lote, $n - $id);
    if ($faltam < $lote) {
        $stmtLote = $pdo->prepare('INSERT INTO transacoes VALUES ' . implode(',', array_fill(0, $faltam, $um)));
    }
    $params = [];
    for ($i = 0; $i < $faltam; $i++) {
        $id++;
        $t = ErpDados::transacao();
        array_push($params, $id, ...$t);
    }
    $stmtLote->execute($params);
    if ($id % 200000 === 0) {
        echo "  $id linhas (" . round(microtime(true) - $t0) . " s)\n";
    }
}
$pdo->commit();
echo "índices...\n";
foreach (['cliente', 'cidade', 'uf', 'produto', 'categoria', 'valor', 'data', 'status'] as $c) {
    $pdo->exec("CREATE INDEX ix_transacoes_$c ON transacoes($c)");
}
$pdo->exec('ANALYZE');
@chmod($arq, 0640);
echo "ok: $n linhas, " . round(filesize($arq) / 1048576) . " MB, " . round(microtime(true) - $t0) . " s\n";
