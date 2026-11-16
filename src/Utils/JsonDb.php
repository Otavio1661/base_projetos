<?php

namespace App\Utils;

/**
 * Mini banco em JSON (um arquivo por tabela em storage/data/<tabela>.json), só para a demonstração do /erp.
 * - leitura com lock compartilhado; escrita atômica (arquivo temporário + rename) sob lock exclusivo;
 * - mutar(): lê → altera → grava tudo dentro do mesmo lock (sem corrida entre duas requisições);
 * - listar(): paginação, ordenação e busca no servidor, no formato que o grid da libr4 (remote: true) espera.
 * Não é um banco de verdade: serve para milhares de linhas, não para milhões (para isso há o SQLite do ErpTransacoes).
 */
final class JsonDb
{
    /** Teto do arquivo de uma tabela (bytes): acima disso a leitura é recusada (o arquivo inteiro vai para a memória). */
    private const MAX_BYTES = 33554432;   // 32 MB
    private static array $cache = [];
    /** Raiz alternativa no lugar de storage/ (só scripts de linha de comando e testes; nunca vem da requisição). */
    public static ?string $raiz = null;

    private static function raiz(): string
    {
        return self::$raiz ?? dirname(__DIR__, 2) . '/storage';
    }

    public static function dir(): string
    {
        $d = self::raiz() . '/data';
        if (!is_dir($d)) {
            @mkdir($d, 0700, true);   // só o usuário do PHP lê/grava (nada aqui é servido por URL)
        }
        return $d;
    }

    /** storage/cache (limite de tentativas de login, contagens da tabela grande). */
    public static function cacheDir(): string
    {
        $d = self::raiz() . '/cache';
        if (!is_dir($d)) {
            @mkdir($d, 0700, true);
        }
        return $d;
    }

    /**
     * Coleta de lixo de storage/cache/<prefixo>*.json: apaga os mais velhos que $idade segundos e, se ainda
     * sobrarem mais que $max, os mais antigos. Roda em ~1 de cada $chance chamadas (barato no caminho comum).
     * Sem isto, cada IP novo (login) ou cada busca nova (transações) deixaria um arquivo para sempre.
     */
    public static function limparCache(string $prefixo, int $idade, int $max, int $chance = 50): void
    {
        if (!preg_match('/^[a-z][a-z0-9-]{0,30}$/', $prefixo) || ($chance > 1 && random_int(1, $chance) !== 1)) {
            return;
        }
        $lista = glob(self::cacheDir() . '/' . $prefixo . '*.json') ?: [];
        $agora = time();
        $vivos = [];
        foreach ($lista as $f) {
            $m = @filemtime($f);
            if ($m !== false && $m < $agora - $idade) {
                @unlink($f);
            } elseif ($m !== false) {
                $vivos[$f] = $m;
            }
        }
        if (count($vivos) > $max) {
            asort($vivos);
            foreach (array_slice(array_keys($vivos), 0, count($vivos) - $max) as $f) {
                @unlink($f);
            }
        }
    }

    private static function arquivo(string $tabela): string
    {
        if (!preg_match('/^[a-z][a-z0-9_]{0,30}$/', $tabela)) {
            throw new \InvalidArgumentException('Nome de tabela inválido.');
        }
        return self::dir() . '/' . $tabela . '.json';
    }

    /** Lê e decodifica a tabela. Arquivo ausente/vazio → []; grande demais ou corrompido → exceção (nunca "vira vazio"). */
    private static function ler(string $f): array
    {
        if (!is_file($f)) {
            return [];
        }
        $tam = filesize($f);
        if ($tam === false || $tam > self::MAX_BYTES) {
            throw new \RuntimeException('Tabela grande demais: ' . basename($f));
        }
        $txt = (string) file_get_contents($f);
        if (trim($txt) === '') {
            return [];
        }
        $a = json_decode($txt, true, 64);
        if (!is_array($a) || !array_is_list($a)) {
            throw new \RuntimeException('Tabela corrompida: ' . basename($f));
        }
        return $a;
    }

    public static function todos(string $tabela): array
    {
        if (isset(self::$cache[$tabela])) {
            return self::$cache[$tabela];
        }
        // a escrita é atômica (temporário + rename), então a leitura nunca vê um arquivo pela metade
        try {
            return self::$cache[$tabela] = self::ler(self::arquivo($tabela));
        } catch (\RuntimeException $e) {
            error_log('[JsonDb] ' . $e->getMessage());
            return [];
        }
    }

    public static function gravar(string $tabela, array $linhas): void
    {
        self::mutar($tabela, static fn () => array_values($linhas));
    }

    /** Lê, aplica $fn(array $linhas): array|null (null = não grava) e devolve o que $fn devolveu. Tudo sob lock exclusivo. */
    public static function mutar(string $tabela, callable $fn): ?array
    {
        $f = self::arquivo($tabela);
        $lock = @fopen($f . '.lock', 'cb');
        if (!$lock || !flock($lock, LOCK_EX)) {
            throw new \RuntimeException('Sem acesso ao armazenamento.');
        }
        @chmod($f . '.lock', 0600);
        try {
            unset(self::$cache[$tabela]);
            // corrompido → exceção: NÃO segue com [] (gravaria por cima e perderia todos os registros)
            $atual = self::ler($f);
            $novo = $fn($atual);
            if ($novo !== null) {
                self::gravarAtomico($f, array_values($novo));
                unset(self::$cache[$tabela]);
            }
            return $novo;
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    /**
     * Grava em <arquivo>.<aleatório>.tmp, confere que TODOS os bytes foram escritos, força ao disco (fsync) e só então
     * troca pelo original com rename (atômico). Disco cheio ou erro no meio → o original fica intacto e sobe exceção.
     */
    private static function gravarAtomico(string $f, array $linhas): void
    {
        $json = json_encode($linhas, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION | JSON_INVALID_UTF8_SUBSTITUTE);
        if (!is_string($json)) {
            throw new \RuntimeException('Falha ao serializar a tabela.');
        }
        $tmp = $f . '.' . bin2hex(random_bytes(6)) . '.tmp';
        $h = @fopen($tmp, 'xb');
        if (!$h) {
            throw new \RuntimeException('Sem acesso ao armazenamento.');
        }
        $ok = fwrite($h, $json) === strlen($json) && fflush($h);
        if ($ok && function_exists('fsync')) {
            $ok = @fsync($h);
        }
        fclose($h);
        @chmod($tmp, 0600);
        if (!$ok || !@rename($tmp, $f)) {
            @unlink($tmp);
            throw new \RuntimeException('Falha ao gravar a tabela.');
        }
    }

    public static function achar(string $tabela, int $id): ?array
    {
        foreach (self::todos($tabela) as $r) {
            if ((int) ($r['id'] ?? 0) === $id) {
                return $r;
            }
        }
        return null;
    }

    public static function inserir(string $tabela, array $reg): array
    {
        $criado = null;
        self::mutar($tabela, static function (array $l) use ($reg, &$criado) {
            $max = 0;
            foreach ($l as $r) {
                $max = max($max, (int) ($r['id'] ?? 0));
            }
            $reg['id'] = $max + 1;
            $l[] = $criado = $reg;
            return $l;
        });
        return $criado;
    }

    public static function atualizar(string $tabela, int $id, array $campos): ?array
    {
        $novo = null;
        self::mutar($tabela, static function (array $l) use ($id, $campos, &$novo) {
            foreach ($l as $i => $r) {
                if ((int) ($r['id'] ?? 0) === $id) {
                    $campos['id'] = $id;
                    return array_replace($l, [$i => $novo = array_merge($r, $campos)]);
                }
            }
            return null;
        });
        return $novo;
    }

    public static function excluir(string $tabela, int $id): bool
    {
        $ok = false;
        self::mutar($tabela, static function (array $l) use ($id, &$ok) {
            $n = array_values(array_filter($l, static fn ($r) => (int) ($r['id'] ?? 0) !== $id));
            $ok = count($n) !== count($l);
            return $ok ? $n : null;
        });
        return $ok;
    }

    /**
     * Página de resultados: ['total' => N, 'retorno' => [...]].
     * $opts: page (1..), size (0 = todas, até $teto), sort (coluna da allowlist $colunas), dir (asc|desc), q (busca em $buscaEm).
     */
    /** Texto comparável de um valor de coluna (bool vira 'sim'/'não', vazio vira ''). */
    public static function texto($v): string
    {
        return is_bool($v) ? ($v ? 'sim' : 'não') : ($v === null ? '' : (string) $v);
    }

    /** Aplica filtros por valores: ['status' => ['pago','aberto']] — OU dentro da coluna, E entre colunas. */
    public static function filtrar(array $linhas, array $filtros): array
    {
        if (!$filtros) {
            return $linhas;
        }
        return array_values(array_filter($linhas, static function ($r) use ($filtros) {
            foreach ($filtros as $col => $vals) {
                if (!in_array(self::texto($r[$col] ?? null), $vals, true)) {
                    return false;
                }
            }
            return true;
        }));
    }

    /** Valores distintos de uma coluna com contagem (já considerando busca e os OUTROS filtros): [['valor'=>..., 'qtd'=>N], ...] por qtd desc. */
    public static function valores(string $tabela, string $col, array $buscaEm, string $q, array $filtros, int $limite = 1000): array
    {
        $linhas = self::todos($tabela);
        unset($filtros[$col]);
        $linhas = self::filtrar(self::buscar($linhas, $q, $buscaEm), $filtros);
        $cont = [];
        foreach ($linhas as $r) {
            $v = self::texto($r[$col] ?? null);
            $cont[$v] = ($cont[$v] ?? 0) + 1;
        }
        arsort($cont);
        $out = [];
        foreach (array_slice($cont, 0, $limite, true) as $v => $n) {
            $out[] = ['valor' => (string) $v, 'qtd' => $n];
        }
        return $out;
    }

    public static function buscar(array $linhas, string $q, array $buscaEm): array
    {
        $q = mb_strtolower(trim($q), 'UTF-8');
        if ($q === '') {
            return $linhas;
        }
        return array_values(array_filter($linhas, static function ($r) use ($q, $buscaEm) {
            foreach ($buscaEm as $c) {
                if (str_contains(mb_strtolower(self::texto($r[$c] ?? ''), 'UTF-8'), $q)) {
                    return true;
                }
            }
            return false;
        }));
    }

    public static function listar(string $tabela, array $opts, array $colunas, array $buscaEm, int $teto = 5000): array
    {
        $linhas = self::filtrar(self::todos($tabela), is_array($opts['filtro'] ?? null) ? $opts['filtro'] : []);
        $linhas = self::buscar($linhas, (string) ($opts['q'] ?? ''), $buscaEm);
        $sort = (string) ($opts['sort'] ?? '');
        if ($sort !== '' && in_array($sort, $colunas, true)) {
            $dir = strtolower((string) ($opts['dir'] ?? 'asc')) === 'desc' ? -1 : 1;
            $col = class_exists(\Collator::class) ? new \Collator('pt_BR') : null;
            usort($linhas, static function ($a, $b) use ($sort, $dir, $col) {
                $x = $a[$sort] ?? null;
                $y = $b[$sort] ?? null;
                if (is_numeric($x) && is_numeric($y)) {
                    $d = $x <=> $y;
                } elseif (is_bool($x) || is_bool($y)) {
                    $d = (int) $x <=> (int) $y;
                } else {
                    $d = $col ? $col->compare((string) $x, (string) $y) : strcmp((string) $x, (string) $y);
                }
                return $d * $dir ?: (($a['id'] ?? 0) <=> ($b['id'] ?? 0));
            });
        }
        $total = count($linhas);
        $size = (int) ($opts['size'] ?? 25);
        $size = $size <= 0 ? $teto : min($size, $teto);
        $page = max(1, (int) ($opts['page'] ?? 1));
        return ['total' => $total, 'retorno' => array_slice($linhas, ($page - 1) * $size, $size)];
    }
}
