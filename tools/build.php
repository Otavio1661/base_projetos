<?php
/**
 * build.php - gera o pacote unico e minificado da libr4 em public/libr4/dist/.
 *
 * Uso:  php tools/build.php
 *
 * Ferramenta propria, sem dependencias (nem Node, nem npm, nem terceiros):
 * so PHP. O minificador e conservador: remove comentarios e espacos, NUNCA
 * renomeia identificadores/propriedades, NUNCA reordena nem transforma sintaxe
 * e nunca junta linhas onde a insercao automatica de ponto e virgula (ASI)
 * poderia importar. Determinístico: sem datas; rodar duas vezes gera o mesmo.
 *
 * A lista de modulos vem de public/libr4/libr4.js (nunca fixa aqui).
 */
declare(strict_types=1);

final class R4MinJs
{
    /** palavras depois das quais uma "/" abre um literal de regex */
    private const REGEX_KW = ['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
        'throw', 'case', 'do', 'else', 'yield', 'await'];
    /** ultimo token que permite descartar a quebra de linha seguinte (nunca ha ASI ali) */
    private const NL_AFTER = ['{', '(', '[', ',', ';', '=', '&', '|', '?', ':', '*', '%', '<', '>', '!', '+', '-', '.'];
    /** primeiro token que permite descartar a quebra de linha anterior (continuacao certa) */
    private const NL_BEFORE = ['}', ')', ']', ',', '.', '?', ':', ';'];

    public static function minify(string $s): string
    {
        return self::emit(self::tokenize($s));
    }

    private static function fail(string $msg, string $s, int $i): never
    {
        $linha = substr_count(substr($s, 0, $i), "\n") + 1;
        throw new RuntimeException("JS: $msg (linha $linha da fonte concatenada)");
    }

    private static function scanString(string $s, int $i, int $n): int
    {
        $q = $s[$i++];
        while ($i < $n) {
            $c = $s[$i];
            if ($c === '\\') { $i += 2; continue; }
            if ($c === $q) return $i + 1;
            if ($c === "\n") self::fail('string sem fechamento', $s, $i);
            $i++;
        }
        self::fail('string sem fechamento', $s, $i);
    }

    private static function scanTemplate(string $s, int $i, int $n): int
    {
        $i++;
        while ($i < $n) {
            $c = $s[$i];
            if ($c === '\\') { $i += 2; continue; }
            if ($c === '`') return $i + 1;
            if ($c === '$' && $i + 1 < $n && $s[$i + 1] === '{') { $i = self::scanExpr($s, $i + 2, $n); continue; }
            $i++;
        }
        self::fail('template sem fechamento', $s, $i);
    }

    /** dentro de ${ ... }: devolve o indice depois da "}" que fecha */
    private static function scanExpr(string $s, int $i, int $n): int
    {
        $d = 1;
        while ($i < $n) {
            $c = $s[$i];
            if ($c === '"' || $c === "'") { $i = self::scanString($s, $i, $n); continue; }
            if ($c === '`') { $i = self::scanTemplate($s, $i, $n); continue; }
            if ($c === '/' && $i + 1 < $n && $s[$i + 1] === '/') {
                $e = strpos($s, "\n", $i); $i = $e === false ? $n : $e; continue;
            }
            if ($c === '/' && $i + 1 < $n && $s[$i + 1] === '*') {
                $e = strpos($s, '*/', $i + 2); $i = $e === false ? $n : $e + 2; continue;
            }
            if ($c === '{') $d++;
            elseif ($c === '}' && --$d === 0) return $i + 1;
            $i++;
        }
        self::fail('${} sem fechamento', $s, $i);
    }

    private static function scanRegex(string $s, int $i, int $n): int
    {
        $i++; $cls = false;
        while ($i < $n) {
            $c = $s[$i];
            if ($c === '\\') { $i += 2; continue; }
            if ($c === "\n") self::fail('regex sem fechamento', $s, $i);
            if ($c === '[') $cls = true;
            elseif ($c === ']') $cls = false;
            elseif ($c === '/' && !$cls) { $i++; break; }
            $i++;
        }
        while ($i < $n && ctype_alpha($s[$i])) $i++;
        return $i;
    }

    /** @return array<int, array{0:string,1:string,2:bool,3:bool}> [tipo, texto, nl, ws] */
    public static function tokenize(string $s): array
    {
        $s = str_replace(["\r\n", "\r"], "\n", $s);
        $n = strlen($s); $i = 0; $nl = false; $ws = false; $prev = null; $toks = [];
        while ($i < $n) {
            $c = $s[$i];
            if ($c === "\n") { $nl = $ws = true; $i++; continue; }
            if ($c === ' ' || $c === "\t" || $c === "\f" || $c === "\v") { $ws = true; $i++; continue; }
            $c2 = $i + 1 < $n ? $s[$i + 1] : '';
            if ($c === '/' && $c2 === '/') {
                $e = strpos($s, "\n", $i); $i = $e === false ? $n : $e; $ws = true; continue;
            }
            if ($c === '/' && $c2 === '*') {
                $e = strpos($s, '*/', $i + 2);
                if ($e === false) self::fail('comentario sem fechamento', $s, $i);
                $txt = substr($s, $i, $e + 2 - $i); $i = $e + 2;
                if (isset($txt[2]) && $txt[2] === '!') { $toks[] = ['c', $txt, $nl, $ws]; $nl = $ws = false; continue; }
                if (strpos($txt, "\n") !== false) $nl = true;
                $ws = true; continue;
            }
            if ($c === '"' || $c === "'") {
                $e = self::scanString($s, $i, $n); $t = ['s', substr($s, $i, $e - $i), $nl, $ws]; $i = $e;
            } elseif ($c === '`') {
                $e = self::scanTemplate($s, $i, $n); $t = ['t', substr($s, $i, $e - $i), $nl, $ws]; $i = $e;
            } elseif (ctype_digit($c) || ($c === '.' && $c2 !== '' && ctype_digit($c2))) {
                preg_match('/(?:0[xXbBoO][0-9a-fA-F_]+n?|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?n?)/A', $s, $m, 0, $i);
                $t = ['n', $m[0], $nl, $ws]; $i += strlen($m[0]);
            } elseif (ctype_alpha($c) || $c === '_' || $c === '$' || ord($c) >= 128) {
                preg_match('/[A-Za-z0-9_$\x80-\xff]+/A', $s, $m, 0, $i);
                $t = ['w', $m[0], $nl, $ws]; $i += strlen($m[0]);
            } elseif ($c === '/' && self::regexAllowed($prev)) {
                $e = self::scanRegex($s, $i, $n); $t = ['r', substr($s, $i, $e - $i), $nl, $ws]; $i = $e;
            } elseif (($c === '+' || $c === '-') && $c2 === $c) {
                $t = ['p', $c . $c, $nl, $ws]; $i += 2;
            } else {
                $t = ['p', $c, $nl, $ws]; $i++;
            }
            $toks[] = $t; $prev = $t; $nl = $ws = false;
        }
        return $toks;
    }

    private static function regexAllowed(?array $p): bool
    {
        if ($p === null) return true;
        return match ($p[0]) {
            'p' => !in_array($p[1], [')', ']', '++', '--'], true),
            'w' => in_array($p[1], self::REGEX_KW, true),
            default => false,
        };
    }

    private static function isWord(string $c): bool
    {
        return ctype_alnum($c) || $c === '_' || $c === '$' || ord($c) >= 128;
    }

    private static function needSpace(array $a, array $b): bool
    {
        $x = substr($a[1], -1); $y = $b[1][0];
        if (self::isWord($x) && self::isWord($y)) return true;
        if (($x === '+' && $y === '+') || ($x === '-' && $y === '-')) return true;
        if ($x === '/' && ($y === '/' || $y === '*')) return true;
        if (($x === '<' && $y === '!') || ($x === '-' && $y === '>')) return true;
        if ($a[0] === 'n' && $y === '.') return true;
        if ($x === '?' && $b[0] === 'n' && $y === '.') return true;
        if ($a[0] === 'w' && $b[0] === 't') return true;
        return false;
    }

    private static function emit(array $toks): string
    {
        $out = ''; $last = null;
        foreach ($toks as $t) {
            if ($t[0] === 'c') {
                if ($out !== '' && substr($out, -1) !== "\n") $out .= "\n";
                $out .= $t[1] . "\n"; $last = null; continue;
            }
            if ($last !== null) {
                $space = $t[3];
                if ($t[2]) {
                    $drop = ($last[0] === 'p' && in_array($last[1], self::NL_AFTER, true))
                        || ($t[0] === 'p' && in_array($t[1], self::NL_BEFORE, true));
                    if ($drop) { $space = true; } else { $out .= "\n"; $space = false; }
                }
                if ($space && self::needSpace($last, $t)) $out .= ' ';
            }
            $out .= $t[1]; $last = $t;
        }
        return rtrim($out, "\n") . "\n";
    }

    /** Sequencia comparavel (tipo+texto, sem nl/ws) para validar a saida contra a fonte. */
    public static function signature(string $js): array
    {
        return array_map(fn($t) => $t[0] . $t[1], self::tokenize($js));
    }
}

final class R4MinCss
{
    public static function minify(string $s): string
    {
        $s = str_replace(["\r\n", "\r"], "\n", $s);
        $n = strlen($s); $i = 0; $out = ''; $pend = false; $par = 0;
        while ($i < $n) {
            $c = $s[$i];
            if ($c === '/' && $i + 1 < $n && $s[$i + 1] === '*') {
                $e = strpos($s, '*/', $i + 2);
                if ($e === false) throw new RuntimeException('CSS: comentario sem fechamento');
                if (isset($s[$i + 2]) && $s[$i + 2] === '!') { $out .= substr($s, $i, $e + 2 - $i); }
                else $pend = true;
                $i = $e + 2; continue;
            }
            if (ctype_space($c)) { $pend = true; $i++; continue; }
            if ($pend && $out !== '') {
                $l = substr($out, -1);
                $semEspaco = strpos('{};,(:', $l) !== false || strpos('{};,)', $c) !== false
                    || ($par === 0 && ($l === '>' || $c === '>'));
                if (!$semEspaco) $out .= ' ';
            }
            $pend = false;
            if ($c === '"' || $c === "'") {
                $j = $i + 1;
                while ($j < $n && $s[$j] !== $c) { if ($s[$j] === '\\') $j++; $j++; }
                if ($j >= $n) throw new RuntimeException('CSS: string sem fechamento');
                $out .= substr($s, $i, $j + 1 - $i); $i = $j + 1; continue;
            }
            if ($c === '\\') { $out .= substr($s, $i, 2); $i += 2; continue; }
            if (($c === 'u' || $c === 'U') && strncasecmp(substr($s, $i, 4), 'url(', 4) === 0) {
                $j = $i + 4;
                while ($j < $n && ctype_space($s[$j])) $j++;
                if ($j < $n && $s[$j] !== '"' && $s[$j] !== "'") {
                    $e = strpos($s, ')', $j);
                    if ($e === false) throw new RuntimeException('CSS: url( sem fechamento');
                    $out .= substr($s, $i, 4) . trim(substr($s, $j, $e - $j)) . ')'; $i = $e + 1; continue;
                }
                $out .= substr($s, $i, 4); $i = $j; $par++; continue;
            }
            if ($c === '}' && substr($out, -1) === ';') $out = substr($out, 0, -1);
            if ($c === '(') $par++; elseif ($c === ')') $par = max(0, $par - 1);
            $out .= $c; $i++;
        }
        return $out . "\n";
    }
}

final class R4Build
{
    public static function run(): int
    {
        $src = realpath(__DIR__ . '/../public/libr4');
        if ($src === false) { fwrite(STDERR, "public/libr4 nao encontrado\n"); return 1; }
        $dist = $src . '/dist';
        $rd = fn(string $f): string => str_replace("\r\n", "\n", (string)file_get_contents($f));

        // 1) modulos: parse do array do carregador
        $loader = $rd("$src/libr4.js");
        if (!preg_match("/\\[\\s*((?:'[\\w-]+'\\s*,?\\s*)+)\\]\\s*\\.forEach/", $loader, $m)) {
            throw new RuntimeException('Nao achei a lista de modulos em libr4.js');
        }
        preg_match_all("/'([\\w-]+)'/", $m[1], $mm);
        $modules = $mm[1];
        if (($modules[0] ?? '') !== 'core') throw new RuntimeException('A lista deveria comecar por core: ' . implode(',', $modules));
        $faltam = array_filter($modules, fn($f) => !is_file("$src/$f.js"));
        if ($faltam) throw new RuntimeException('Modulo(s) da lista sem arquivo: ' . implode(', ', array_map(fn($f) => "$f.js", $faltam)));
        $versao = preg_match("/version:\\s*'([^']+)'/", $rd("$src/core.js"), $v) ? $v[1] : '0';

        // 2) JS
        $joined = implode("\n;\n", array_map(fn($f) => "/* $f */\n" . $rd("$src/$f.js"), $modules));
        $js = R4MinJs::minify($joined);
        $sigIn = array_values(array_filter(R4MinJs::signature($joined), fn($x) => $x[0] !== 'c'));
        $sigOut = array_values(array_filter(R4MinJs::signature($js), fn($x) => $x[0] !== 'c'));
        if ($sigIn !== $sigOut) throw new RuntimeException('Validacao: a sequencia de tokens mudou apos minificar');
        if (count(array_keys($sigIn, 'wfunction')) !== count(array_keys($sigOut, 'wfunction'))) {
            throw new RuntimeException('Validacao: numero de funcoes/IIFEs diferente');
        }
        self::checkBalance($js);
        self::nodeCheck($js);

        // 3) CSS
        $css = R4MinCss::minify(self::inlineCss("$src/libr4.css", $src, []));
        if (stripos($css, '@import') !== false) throw new RuntimeException('CSS final ainda tem @import');

        // 4) saida
        if (is_dir($dist)) foreach (glob("$dist/*") ?: [] as $f) if (is_file($f)) unlink($f);
        if (!is_dir($dist) && !mkdir($dist, 0775, true)) throw new RuntimeException('Nao consegui criar dist/');
        $files = [];
        foreach (['libr4.min.js' => $js, 'libr4.min.css' => $css] as $nome => $conteudo) {
            file_put_contents("$dist/$nome", $conteudo);
            $files[$nome] = [
                'bytes' => strlen($conteudo),
                'gzip' => strlen(gzencode($conteudo, 9)),
                'sha384' => 'sha384-' . base64_encode(hash('sha384', $conteudo, true)),
            ];
        }
        file_put_contents("$dist/manifest.json",
            json_encode(['versao' => $versao, 'arquivos' => $files], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n");

        // 5) relatorio (dev = soma dos .js e .css fonte, sem dist/)
        $dev = ['js' => [0, 0], 'css' => [0, 0]];
        $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($src, FilesystemIterator::SKIP_DOTS));
        foreach ($it as $f) {
            $p = str_replace('\\', '/', $f->getPathname());
            if (str_contains($p, '/dist/') || !preg_match('/\.(js|css)$/', $p, $e)) continue;
            $b = (string)file_get_contents($p);
            $dev[$e[1]][0] += strlen($b); $dev[$e[1]][1] += strlen(gzencode($b, 9));
        }
        $tb = $dev['js'][0] + $dev['css'][0]; $tg = $dev['js'][1] + $dev['css'][1];
        $mb = $files['libr4.min.js']['bytes'] + $files['libr4.min.css']['bytes'];
        $mg = $files['libr4.min.js']['gzip'] + $files['libr4.min.css']['gzip'];
        echo 'modulos: ' . implode(', ', $modules) . " (versao $versao)\n";
        printf("%-14s %9s %9s\n", '', 'bytes', 'gzip');
        printf("%-14s %9d %9d\n", 'dev js', $dev['js'][0], $dev['js'][1]);
        printf("%-14s %9d %9d\n", 'dev css', $dev['css'][0], $dev['css'][1]);
        printf("%-14s %9d %9d\n", 'dev total', $tb, $tg);
        foreach ($files as $nome => $d) printf("%-14s %9d %9d\n", $nome, $d['bytes'], $d['gzip']);
        printf("%-14s %9d %9d\n", 'min total', $mb, $mg);
        printf("ganho: %.1f%% bytes, %.1f%% gzip\n", 100 * (1 - $mb / $tb), 100 * (1 - $mg / $tg));
        return 0;
    }

    /** @param array<string,bool> $seen */
    private static function inlineCss(string $file, string $root, array $seen): string
    {
        $dir = dirname($file);
        $txt = str_replace("\r\n", "\n", (string)file_get_contents($file));
        return (string)preg_replace_callback(
            '/@import\s+(?:url\(\s*[\'"]?([^\'")]+)[\'"]?\s*\)|[\'"]([^\'"]+)[\'"])\s*;?/',
            function ($m) use ($dir, $root, $seen) {
                $u = $m[1] !== '' ? $m[1] : $m[2];
                $p = realpath("$dir/$u");
                if ($p === false) throw new RuntimeException("CSS: @import nao encontrado: $u");
                if (strncmp($p, $root, strlen($root)) !== 0 || isset($seen[$p])) return '';
                $seen[$p] = true;
                return self::inlineCss($p, $root, $seen);
            }, $txt);
    }

    private static function checkBalance(string $js): void
    {
        $pilha = []; $par = ['(' => ')', '[' => ']', '{' => '}'];
        foreach (R4MinJs::tokenize($js) as $t) {
            if ($t[0] !== 'p') continue;
            if (isset($par[$t[1]])) $pilha[] = $par[$t[1]];
            elseif (in_array($t[1], $par, true) && array_pop($pilha) !== $t[1]) throw new RuntimeException('Validacao: parenteses/chaves desbalanceados');
        }
        if ($pilha) throw new RuntimeException('Validacao: parenteses/chaves desbalanceados');
    }

    /** Verificacao OPCIONAL de desenvolvimento: so roda se houver "node" no PATH. */
    private static function nodeCheck(string $js): void
    {
        $out = []; $rc = 1;
        @exec('node --version 2>&1', $out, $rc);
        if ($rc !== 0) { echo "(node ausente: pulei o node --check opcional)\n"; return; }
        $tmp = tempnam(sys_get_temp_dir(), 'r4') . '.js';
        file_put_contents($tmp, $js);
        $out = [];
        exec('node --check ' . escapeshellarg($tmp) . ' 2>&1', $out, $rc);
        @unlink($tmp);
        if ($rc !== 0) throw new RuntimeException("node --check reprovou o JS minificado:\n" . implode("\n", $out));
        echo "node --check: ok (verificacao opcional)\n";
    }
}

if (PHP_SAPI === 'cli' && isset($argv[0]) && realpath($argv[0]) === __FILE__) {
    try { exit(R4Build::run()); }
    catch (Throwable $e) { fwrite(STDERR, 'ERRO: ' . $e->getMessage() . "\n"); exit(1); }
}
