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
    /** colunas que aceitam filtro por valores (baixa/média cardinalidade) */
    private const FILTRAVEIS = ['cliente', 'cidade', 'uf', 'produto', 'categoria', 'status'];

    /** Página máxima aceita (OFFSET = (page-1)*size nunca estoura e a consulta não varre além do total). */
    private const PAGINA_MAX = 10000000;

    /**
     * Conexão SOMENTE LEITURA, caminho fixo (nada vem da requisição): aberta com SQLITE_OPEN_READONLY + PRAGMA query_only
     * (nem ATTACH/escrita passam), espera no máximo 5 s por lock (ATTR_TIMEOUT = busy_timeout). load_extension fica
     * desligado (padrão do pdo_sqlite) e todo valor vindo do usuário vai por parâmetro.
     */
    private static function pdo(): \PDO
    {
        static $pdo = null;
        if ($pdo) {
            return $pdo;
        }
        $f = JsonDb::dir() . '/transacoes.sqlite';
        if (!is_file($f)) {
            ctrl::retorno('Tabela grande ainda não foi gerada (php tools/erp-seed-transacoes.php).', 503);
        }
        $pdo = new \PDO('sqlite:' . $f, null, null, [
            \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION, \PDO::ATTR_DEFAULT_FETCH_MODE => \PDO::FETCH_ASSOC,
            \PDO::ATTR_TIMEOUT => 5, \PDO::SQLITE_ATTR_OPEN_FLAGS => \PDO::SQLITE_OPEN_READONLY,
        ]);
        $pdo->exec('PRAGMA query_only=1; PRAGMA cache_size=-65536; PRAGMA mmap_size=268435456');
        return $pdo;
    }

    /** Erro do banco: detalhe só no log; o cliente recebe JSON limpo (nunca caminho/SQL/stack, nem com APP_DEBUG). */
    private static function falha(\Throwable $e): void
    {
        error_log('[erp transacoes] ' . get_class($e) . ': ' . $e->getMessage());
        ctrl::retorno('Falha ao consultar a tabela de transações.', 500);
    }

    private static function cache(string $chave, callable $calc)
    {
        // cada busca/filtro diferente gera um arquivo: a coleta apaga os vencidos e segura o total em 2.000
        JsonDb::limparCache('erp-tx-', 3600, 2000);
        $f = JsonDb::cacheDir() . '/erp-tx-' . hash('sha256', $chave) . '.json';
        if (is_file($f) && filemtime($f) > time() - 3600) {
            $a = json_decode((string) file_get_contents($f), true);
            if ($a !== null) {
                return $a;
            }
        }
        $v = $calc();
        @file_put_contents($f, json_encode($v), LOCK_EX);
        @chmod($f, 0600);
        return $v;
    }

    /** Parâmetro de query como texto (array → ''), cortado em $max caracteres. */
    private static function qs(string $k, int $max): string
    {
        $v = $_GET[$k] ?? '';
        return is_string($v) ? mb_substr($v, 0, $max) : '';
    }

    private static function qi(string $k, int $padrao): int
    {
        $v = $_GET[$k] ?? null;
        return is_string($v) && preg_match('/^\s*-?[0-9]{1,9}\s*$/', $v) ? (int) $v : $padrao;
    }

    /** filtro[coluna][]=valor → ['uf' => ['SP','RJ']] (só colunas filtráveis, só texto, até 200 valores por coluna). */
    private static function filtros(): array
    {
        $f = $_GET['filtro'] ?? [];
        $out = [];
        if (is_array($f)) {
            foreach ($f as $col => $vals) {
                if (is_string($col) && in_array($col, self::FILTRAVEIS, true) && is_array($vals)) {
                    $v = array_slice(array_values(array_filter($vals, 'is_string')), 0, 200);
                    if ($v) {
                        $out[$col] = array_map(static fn ($x) => mb_substr($x, 0, 120), $v);
                    }
                }
            }
        }
        return $out;
    }

    /** WHERE com parâmetros nomeados: busca (instr) + IN por coluna. Devolve [sql, params]. */
    private static function onde(string $q, array $filtros, ?string $ignorar = null): array
    {
        $w = [];
        $par = [];
        if ($q !== '') {
            $w[] = 'instr(busca, :q) > 0';
            $par[':q'] = $q;
        }
        foreach ($filtros as $col => $vals) {
            if ($col === $ignorar) {
                continue;
            }
            $ph = [];
            foreach ($vals as $i => $v) {
                $ph[] = ':f_' . $col . '_' . $i;
                $par[':f_' . $col . '_' . $i] = $v;
            }
            $w[] = $col . ' IN (' . implode(',', $ph) . ')';   // $col vem da allowlist FILTRAVEIS
        }
        return [$w ? 'WHERE ' . implode(' AND ', $w) : '', $par];
    }

    /** GET /erp/api/transacoes/valores?col=status[&q=][&filtro[...]] — valores distintos com contagem (cache 1 h). */
    public function valores()
    {
        $col = self::qs('col', 40);
        if (!in_array($col, self::FILTRAVEIS, true)) {
            ctrl::retorno('Coluna inválida.', 422);
        }
        $q = mb_strtolower(trim(self::qs('q', 60)), 'UTF-8');
        $f = self::filtros();
        [$onde, $par] = self::onde($q, $f, $col);
        try {
            $r = self::cache('valores|' . $col . '|' . $q . '|' . json_encode($f), static function () use ($col, $onde, $par) {
                // $col vem da allowlist FILTRAVEIS; valores só por parâmetro
                $st = self::pdo()->prepare("SELECT $col AS valor, count(*) AS qtd FROM transacoes $onde GROUP BY $col ORDER BY qtd DESC, valor LIMIT 1000");
                $st->execute($par);
                return $st->fetchAll();
            });
        } catch (\PDOException $e) {
            self::falha($e);
        }
        ctrl::retorno($r, 200);
    }

    public function listar()
    {
        $page = min(self::PAGINA_MAX, max(1, self::qi('page', 1)));
        $size = self::qi('size', 25);
        $size = $size <= 0 ? self::TAM_MAX : min($size, self::TAM_MAX);
        $sort = self::qs('sort', 40);
        $sort = in_array($sort, self::COLUNAS, true) ? $sort : 'id';                  // ORDER BY só da allowlist
        $dir = strtolower(self::qs('dir', 10)) === 'desc' ? 'DESC' : 'ASC';
        $q = mb_strtolower(trim(self::qs('q', 60)), 'UTF-8');                         // instr(): sem curingas de LIKE
        try {
            $pdo = self::pdo();
            $f = self::filtros();
            [$onde, $par] = self::onde($q, $f);
            $total = self::cache('total|' . $q . '|' . json_encode($f), static function () use ($pdo, $onde, $par) {
                $st = $pdo->prepare("SELECT count(*) FROM transacoes $onde");
                $st->execute($par);
                return (int) $st->fetchColumn();
            });
            $offset = ($page - 1) * $size;
            if ($offset >= $total) {   // além do fim: nem consulta (OFFSET profundo não custa varredura)
                ctrl::responder(['status' => 200, 'total' => $total, 'retorno' => []]);
            }
            // desempate por id: a ordem fica estável entre as páginas
            $st = $pdo->prepare("SELECT id, cliente, cidade, uf, produto, categoria, valor, data, status FROM transacoes $onde ORDER BY $sort $dir, id $dir LIMIT :n OFFSET :o");
            foreach ($par as $k => $v) {
                $st->bindValue($k, $v);
            }
            $st->bindValue(':n', $size, \PDO::PARAM_INT);
            $st->bindValue(':o', $offset, \PDO::PARAM_INT);
            $st->execute();
            $linhas = $st->fetchAll();
        } catch (\PDOException $e) {
            self::falha($e);
        }
        ctrl::responder(['status' => 200, 'total' => $total, 'retorno' => $linhas]);
    }

    public function resumo()
    {
        try {
            $r = self::cache('resumo', static function () {
                $pdo = self::pdo();
                return [
                    'total' => (int) $pdo->query('SELECT count(*) FROM transacoes')->fetchColumn(),
                    'valorTotal' => round((float) $pdo->query("SELECT sum(valor) FROM transacoes WHERE status = 'aprovada'")->fetchColumn(), 2),
                    'porStatus' => $pdo->query('SELECT status, count(*) AS qtd, round(sum(valor), 2) AS valor FROM transacoes GROUP BY status ORDER BY qtd DESC')->fetchAll(),
                    'porUf' => $pdo->query("SELECT uf, count(*) AS qtd, round(sum(valor), 2) AS valor FROM transacoes WHERE status = 'aprovada' GROUP BY uf ORDER BY valor DESC LIMIT 12")->fetchAll(),
                ];
            });
        } catch (\PDOException $e) {
            self::falha($e);
        }
        ctrl::retorno($r, 200);
    }
}
