<?php

namespace App\Controllers;

use App\Utils\JsonDb;
use Core\Controller as ctrl;

/**
 * Tabela grande (2 milhões de linhas fictícias) em SQLite somente leitura: paginação, ordenação e busca no SERVIDOR,
 * no formato do grid remoto da libr4. O arquivo é gerado por tools/erp-seed-transacoes.php e fica em storage/data/.
 */
class ErpTransacoesController extends ctrl
{
    private const COLUNAS = ['id', 'cliente', 'cidade', 'uf', 'produto', 'categoria', 'valor', 'data', 'status'];
    private const TAM_MAX = 500;

    private static function pdo(): \PDO
    {
        $f = JsonDb::dir() . '/transacoes.sqlite';
        if (!is_file($f)) {
            ctrl::retorno('Tabela grande ainda não foi gerada (php tools/erp-seed-transacoes.php).', 503);
        }
        $pdo = new \PDO('sqlite:' . $f, null, null, [\PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION, \PDO::ATTR_DEFAULT_FETCH_MODE => \PDO::FETCH_ASSOC]);
        $pdo->exec('PRAGMA query_only=1; PRAGMA cache_size=-65536; PRAGMA mmap_size=268435456');
        return $pdo;
    }

    private static function cache(string $chave, callable $calc)
    {
        $d = dirname(__DIR__, 2) . '/storage/cache';
        if (!is_dir($d)) {
            @mkdir($d, 0750, true);
        }
        $f = $d . '/erp-' . hash('sha256', $chave) . '.json';
        if (is_file($f) && filemtime($f) > time() - 3600) {
            $a = json_decode((string) file_get_contents($f), true);
            if ($a !== null) {
                return $a;
            }
        }
        $v = $calc();
        @file_put_contents($f, json_encode($v), LOCK_EX);
        return $v;
    }

    public function listar()
    {
        $page = max(1, (int) ($_GET['page'] ?? 1));
        $size = (int) ($_GET['size'] ?? 25);
        $size = $size <= 0 ? self::TAM_MAX : min($size, self::TAM_MAX);
        $sort = (string) ($_GET['sort'] ?? '');
        $sort = in_array($sort, self::COLUNAS, true) ? $sort : 'id';
        $dir = strtolower((string) ($_GET['dir'] ?? 'asc')) === 'desc' ? 'DESC' : 'ASC';
        $q = mb_strtolower(trim(mb_substr((string) ($_GET['q'] ?? ''), 0, 60)), 'UTF-8');
        $pdo = self::pdo();

        $onde = $q !== '' ? 'WHERE instr(busca, :q) > 0' : '';
        $total = self::cache('total|' . $q, static function () use ($pdo, $onde, $q) {
            $st = $pdo->prepare("SELECT count(*) FROM transacoes $onde");
            $q !== '' ? $st->bindValue(':q', $q) : null;
            $st->execute();
            return (int) $st->fetchColumn();
        });
        // desempate por id: a ordem fica estável entre as páginas
        $st = $pdo->prepare("SELECT id, cliente, cidade, uf, produto, categoria, valor, data, status FROM transacoes $onde ORDER BY $sort $dir, id $dir LIMIT :n OFFSET :o");
        $q !== '' ? $st->bindValue(':q', $q) : null;
        $st->bindValue(':n', $size, \PDO::PARAM_INT);
        $st->bindValue(':o', ($page - 1) * $size, \PDO::PARAM_INT);
        $st->execute();
        ctrl::responder(['status' => 200, 'total' => $total, 'retorno' => $st->fetchAll()]);
    }

    public function resumo()
    {
        $r = self::cache('resumo', static function () {
            $pdo = self::pdo();
            return [
                'total' => (int) $pdo->query('SELECT count(*) FROM transacoes')->fetchColumn(),
                'valorTotal' => round((float) $pdo->query("SELECT sum(valor) FROM transacoes WHERE status = 'aprovada'")->fetchColumn(), 2),
                'porStatus' => $pdo->query('SELECT status, count(*) AS qtd, round(sum(valor), 2) AS valor FROM transacoes GROUP BY status ORDER BY qtd DESC')->fetchAll(),
                'porUf' => $pdo->query("SELECT uf, count(*) AS qtd, round(sum(valor), 2) AS valor FROM transacoes WHERE status = 'aprovada' GROUP BY uf ORDER BY valor DESC LIMIT 12")->fetchAll(),
            ];
        });
        ctrl::retorno($r, 200);
    }
}
