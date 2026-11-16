<?php
/**
 * ============================================
 * Core\Security\Input — validação de entrada por ESQUEMA
 * ============================================
 *
 * A validação do navegador (libr4) é conforto; quem chama a API direto pula tudo aquilo.
 * Esta classe é a barreira real no servidor:
 *
 *   $r = Input::validate($dados, [
 *       'nome'  => ['type' => 'string', 'required' => true, 'minLength' => 3, 'maxLength' => 120],
 *       'email' => ['type' => 'email', 'required' => true],
 *       'idade' => ['type' => 'int', 'min' => 0, 'max' => 130],
 *       'plano' => ['type' => 'enum', 'in' => ['basico', 'pro']],
 *       'obs'   => ['type' => 'string', 'multiline' => true, 'maxLength' => 2000],
 *   ]);
 *   if (!$r['valido']) { ... 422 com $r['erros'] ... }
 *   $d = $r['dados'];   // só os campos declarados, já normalizados e com o tipo certo
 *
 * Regras: type (string|int|float|bool|email|url|enum|date|array|object|cpf|cnpj|phone), required,
 * min, max, minLength, maxLength (padrão 1000), pattern, in, trim (padrão true), default,
 * multiline (string), items (regra de cada item de array), maxItems (padrão 100),
 * fields (esquema de um object), mensagem (troca a mensagem de erro do campo).
 *
 * Garantias:
 *  - campos NÃO declarados são recusados (mass-assignment) — opção ['extras' => 'ignorar'] só descarta;
 *  - texto: UTF-8 válido, NFC (se a extensão intl existir), sem NUL/controles, sem caracteres
 *    bidi (U+202A–202E, U+2066–2069), zero-width (U+200B, U+2060–2064, U+FEFF) e "tags" Unicode
 *    (U+E0000–E007F); espaços normalizados;
 *  - tipos errados (array onde se espera texto, objeto, string gigante, JSON profundo) viram ERRO
 *    de validação — nunca erro fatal/aviso PHP;
 *  - a validação NÃO "escapa SQL": para banco use SEMPRE consultas preparadas (PDO prepare/bind);
 *    para HTML use htmlspecialchars na SAÍDA. Validar e escapar são coisas diferentes.
 * ============================================
 */

namespace Core\Security;

final class Input
{
    public const MAX_LENGTH = 1000;   // tamanho padrão de texto (caracteres)
    public const MAX_ITEMS = 100;     // itens por array
    public const MAX_DEPTH = 5;       // profundidade de array/object
    public const MAX_FIELDS = 200;    // chaves no corpo

    private const TIPOS = ['string', 'int', 'float', 'bool', 'email', 'url', 'enum', 'date', 'array', 'object', 'cpf', 'cnpj', 'phone'];

    /* ===================================================================
     * Normalização de texto
     * =================================================================== */

    /**
     * Texto limpo: UTF-8 válido, NFC, sem NUL/controles/bidi/zero-width, espaços normalizados.
     * - $multiline=false: quebras e tabs viram espaço e espaços repetidos viram um só;
     * - $multiline=true : mantém \n (CRLF/CR → \n) e \t; tira espaços no fim das linhas e
     *   reduz 3+ linhas em branco para 2.
     * Valores não-texto (array, objeto, bool, null) devolvem ''.
     */
    public static function clean($v, bool $multiline = false, bool $trim = true): string
    {
        if ($v === null || is_bool($v) || is_array($v) || is_object($v)) {
            return '';
        }
        $s = (string) $v;
        if ($s === '') {
            return '';
        }
        if (!mb_check_encoding($s, 'UTF-8')) {
            $s = mb_scrub($s, 'UTF-8');
        }
        if (class_exists(\Normalizer::class)) {
            $n = \Normalizer::normalize($s, \Normalizer::FORM_C);
            if (is_string($n)) {
                $s = $n;
            }
        }
        // quebras de linha (inclusive U+2028/2029/0085) → \n
        $s = str_replace(["\r\n", "\r", "\u{2028}", "\u{2029}", "\u{0085}"], "\n", $s);
        // invisíveis: zero-width, bidi e "tags" Unicode (usadas para esconder texto)
        $s = preg_replace('/[\x{200B}\x{2060}-\x{2064}\x{FEFF}\x{202A}-\x{202E}\x{2066}-\x{2069}\x{E0000}-\x{E007F}]/u', '', $s) ?? '';
        if (!$multiline) {
            $s = str_replace(["\n", "\t"], ' ', $s);
        }
        // controles C0/C1 (NUL incluso); \n e \t só sobrevivem no modo multilinha
        $s = preg_replace($multiline ? '/[\x00-\x08\x0B-\x1F\x7F\x{80}-\x{9F}]/u' : '/[\x00-\x1F\x7F\x{80}-\x{9F}]/u', '', $s) ?? '';
        // espaços "exóticos" (NBSP, em-space, ideográfico...) → espaço comum
        $s = preg_replace('/[\x{00A0}\x{1680}\x{2000}-\x{200A}\x{202F}\x{205F}\x{3000}]/u', ' ', $s) ?? '';
        if ($multiline) {
            $s = preg_replace('/[ \t]+\n/', "\n", $s) ?? '';
            $s = preg_replace('/\n{3,}/', "\n\n", $s) ?? '';
        } else {
            $s = preg_replace('/ {2,}/', ' ', $s) ?? '';
        }
        return $trim ? trim($s, " \t\n") : $s;
    }

    /** Texto limpo e cortado em $max caracteres (sem partir caractere). */
    public static function text($v, int $max = self::MAX_LENGTH, bool $multiline = false): string
    {
        if (is_string($v) && strlen($v) > $max * 4 + 64) {
            $v = substr($v, 0, $max * 4 + 64);   // não processa megabytes à toa
        }
        $s = self::clean($v, $multiline);
        return mb_strlen($s) > $max ? mb_substr($s, 0, $max) : $s;
    }

    /* ===================================================================
     * Validação por esquema
     * =================================================================== */

    /**
     * @param mixed $dados  normalmente Controller::getPost() (pode ser null)
     * @param array $regras ['campo' => ['type' => ..., ...]]
     * @param array $opts   ['extras' => 'rejeitar'|'ignorar']
     * @return array{valido: bool, dados: array, erros: array<string,string>}
     */
    public static function validate($dados, array $regras, array $opts = []): array
    {
        try {
            if ($dados === null || $dados === '') {
                $dados = [];
            }
            if (!is_array($dados) || ($dados && array_is_list($dados) && $regras && !array_is_list($regras))) {
                return ['valido' => false, 'dados' => [], 'erros' => ['_' => 'Corpo da requisição inválido (esperado um objeto JSON).']];
            }
            return self::validateLevel($dados, $regras, $opts, 0);
        } catch (\Throwable $e) {
            error_log('[Input] falha inesperada na validação: ' . $e->getMessage());
            return ['valido' => false, 'dados' => [], 'erros' => ['_' => 'Dados inválidos.']];
        }
    }

    private static function validateLevel(array $dados, array $regras, array $opts, int $prof): array
    {
        $erros = [];
        $saida = [];
        if (count($dados) > self::MAX_FIELDS) {
            return ['valido' => false, 'dados' => [], 'erros' => ['_' => 'Campos demais na requisição.']];
        }

        // 1) mass-assignment: chave que não está no esquema
        if (($opts['extras'] ?? 'rejeitar') !== 'ignorar') {
            $extras = 0;
            foreach (array_keys($dados) as $k) {
                if (!array_key_exists($k, $regras)) {
                    $extras++;
                    if ($extras <= 10) {
                        $nome = self::text((string) $k, 64);
                        $erros[$nome !== '' ? $nome : '_campo'] = 'Campo não permitido.';
                    }
                }
            }
            if ($extras > 10) {
                $erros['_'] = $extras . ' campos não permitidos.';
            }
        }

        // 2) cada campo declarado
        foreach ($regras as $campo => $regra) {
            if (!is_array($regra)) {
                $regra = ['type' => (string) $regra];
            }
            $tipo = $regra['type'] ?? 'string';
            if (!in_array($tipo, self::TIPOS, true)) {
                error_log('[Input] tipo desconhecido na regra de "' . $campo . '": ' . $tipo);
                $erros[$campo] = 'Regra de validação inválida.';
                continue;
            }
            $existe = array_key_exists($campo, $dados);
            $valor = $existe ? $dados[$campo] : null;

            if (self::vazio($valor, $tipo, $regra)) {
                if (!empty($regra['required'])) {
                    $erros[$campo] = $regra['mensagem'] ?? 'Campo obrigatório.';
                } else {
                    $saida[$campo] = $regra['default'] ?? null;
                }
                continue;
            }

            [$ok, $res] = self::campo($valor, $tipo, $regra, $prof);
            if ($ok) {
                $saida[$campo] = $res;
            } else {
                $erros[$campo] = $regra['mensagem'] ?? $res;
            }
        }

        return ['valido' => !$erros, 'dados' => $erros ? [] : $saida, 'erros' => $erros];
    }

    private static function vazio($v, string $tipo, array $regra): bool
    {
        if ($v === null) {
            return true;
        }
        if (is_string($v)) {
            if ($tipo === 'string' && array_key_exists('trim', $regra) && $regra['trim'] === false) {
                return $v === '';
            }
            return trim($v) === '';
        }
        if (is_array($v) && $tipo !== 'array' && $tipo !== 'object') {
            return false;   // array onde se espera escalar: erro de tipo, não "vazio"
        }
        return is_array($v) && !$v;
    }

    /** @return array{0: bool, 1: mixed} [ok, valor normalizado | mensagem de erro] */
    private static function campo($v, string $tipo, array $r, int $prof): array
    {
        switch ($tipo) {
            case 'string':
                return self::str($v, $r);

            case 'email':
                if (!self::escalarTexto($v)) {
                    return [false, 'Deve ser texto.'];
                }
                $s = self::clean($v);
                if (strlen($s) > 254 || filter_var($s, FILTER_VALIDATE_EMAIL) === false) {
                    return [false, 'E-mail inválido.'];
                }
                return [true, $s];

            case 'url':
                if (!self::escalarTexto($v)) {
                    return [false, 'Deve ser texto.'];
                }
                $s = self::clean($v);
                $esq = strtolower((string) parse_url($s, PHP_URL_SCHEME));
                if (strlen($s) > ($r['maxLength'] ?? 2048) || filter_var($s, FILTER_VALIDATE_URL) === false || !in_array($esq, ['http', 'https'], true)) {
                    return [false, 'URL inválida (use http:// ou https://).'];
                }
                return [true, $s];

            case 'int':
                if (is_int($v)) {
                    $n = $v;
                } elseif (is_string($v) && preg_match('/^\s*[+-]?[0-9]{1,18}\s*$/', $v)) {
                    $n = (int) trim($v);
                } elseif (is_float($v) && is_finite($v) && floor($v) === $v && abs($v) < 9.0e15) {
                    $n = (int) $v;
                } else {
                    return [false, 'Informe um número inteiro.'];
                }
                return self::faixa($n, $r);

            case 'float':
                if (is_int($v) || is_float($v)) {
                    $n = (float) $v;
                } elseif (is_string($v) && strlen($v) <= 40) {
                    $t = str_replace(' ', '', trim($v));
                    if (preg_match('/^[+-]?[0-9]{1,3}(\.[0-9]{3})+,[0-9]+$/', $t) || preg_match('/^[+-]?[0-9]+,[0-9]+$/', $t)) {
                        $t = str_replace(['.', ','], ['', '.'], $t);   // 1.234,56 → 1234.56
                    }
                    if (!preg_match('/^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]{1,3})?$/', $t)) {
                        return [false, 'Informe um número.'];
                    }
                    $n = (float) $t;
                } else {
                    return [false, 'Informe um número.'];
                }
                if (!is_finite($n)) {
                    return [false, 'Informe um número.'];
                }
                return self::faixa($n, $r);

            case 'bool':
                if (is_bool($v)) {
                    return [true, $v];
                }
                if ($v === 1 || $v === 0) {
                    return [true, $v === 1];
                }
                if (is_string($v)) {
                    $t = strtolower(trim($v));
                    if (in_array($t, ['1', 'true', 'on', 'sim', 's', 'yes'], true)) {
                        return [true, true];
                    }
                    if (in_array($t, ['0', 'false', 'off', 'nao', 'não', 'n', 'no'], true)) {
                        return [true, false];
                    }
                }
                return [false, 'Valor inválido (esperado sim/não).'];

            case 'enum':
                $lista = $r['in'] ?? [];
                if (!is_array($lista) || !$lista) {
                    return [false, 'Regra de validação inválida.'];
                }
                if (!is_scalar($v) || is_bool($v)) {
                    return [false, 'Opção inválida.'];
                }
                $t = self::clean((string) $v);
                foreach ($lista as $op) {
                    if (is_scalar($op) && (string) $op === $t) {
                        return [true, $op];   // devolve o valor da allowlist, não o enviado
                    }
                }
                return [false, 'Opção inválida.'];

            case 'date':
                if (!self::escalarTexto($v)) {
                    return [false, 'Data inválida.'];
                }
                $t = trim((string) $v);
                if (preg_match('#^([0-9]{2})/([0-9]{2})/([0-9]{4})$#', $t, $m)) {
                    $t = $m[3] . '-' . $m[2] . '-' . $m[1];
                }
                if (!preg_match('/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/', $t, $m) || !checkdate((int) $m[2], (int) $m[3], (int) $m[1])) {
                    return [false, 'Data inválida (use AAAA-MM-DD).'];
                }
                if (isset($r['min']) && $t < (string) $r['min']) {
                    return [false, 'Data anterior ao permitido (' . $r['min'] . ').'];
                }
                if (isset($r['max']) && $t > (string) $r['max']) {
                    return [false, 'Data posterior ao permitido (' . $r['max'] . ').'];
                }
                return [true, $t];

            case 'cpf':
                if (!self::escalarTexto($v)) {
                    return [false, 'CPF inválido.'];
                }
                $d = preg_replace('/\D+/', '', substr((string) $v, 0, 40));
                return self::cpfValido($d) ? [true, $d] : [false, 'CPF inválido.'];

            case 'cnpj':
                if (!self::escalarTexto($v)) {
                    return [false, 'CNPJ inválido.'];
                }
                $c = preg_replace('/[^0-9A-Z]+/', '', strtoupper(substr((string) $v, 0, 40)));
                return self::cnpjValido($c) ? [true, $c] : [false, 'CNPJ inválido.'];

            case 'phone':
                if (!self::escalarTexto($v)) {
                    return [false, 'Telefone inválido.'];
                }
                $s = substr((string) $v, 0, 40);
                if (!preg_match('/^[0-9+() .\-]+$/', trim($s))) {
                    return [false, 'Telefone inválido.'];
                }
                $d = preg_replace('/\D+/', '', $s);
                return strlen($d) >= 10 && strlen($d) <= 13 ? [true, $d] : [false, 'Telefone inválido (DDD + número).'];

            case 'array':
                if (!is_array($v) || !array_is_list($v)) {
                    return [false, 'Deve ser uma lista.'];
                }
                if ($prof + 1 > self::MAX_DEPTH) {
                    return [false, 'Estrutura aninhada demais.'];
                }
                $max = (int) ($r['maxItems'] ?? $r['max'] ?? self::MAX_ITEMS);
                if (count($v) > $max) {
                    return [false, 'No máximo ' . $max . ' itens.'];
                }
                if (isset($r['min']) && count($v) < (int) $r['min']) {
                    return [false, 'No mínimo ' . (int) $r['min'] . ' itens.'];
                }
                $item = $r['items'] ?? ['type' => 'string'];
                $item = is_array($item) ? $item : ['type' => (string) $item];
                $tipoItem = $item['type'] ?? 'string';
                if (!in_array($tipoItem, self::TIPOS, true)) {
                    return [false, 'Regra de validação inválida.'];
                }
                $out = [];
                foreach ($v as $i => $x) {
                    if (self::vazio($x, $tipoItem, $item)) {
                        return [false, 'Item ' . ($i + 1) . ' vazio.'];
                    }
                    [$ok, $res] = self::campo($x, $tipoItem, $item, $prof + 1);
                    if (!$ok) {
                        return [false, 'Item ' . ($i + 1) . ': ' . (is_string($res) ? $res : 'inválido.')];
                    }
                    $out[] = $res;
                }
                return [true, $out];

            case 'object':
                if (!is_array($v) || ($v && array_is_list($v))) {
                    return [false, 'Deve ser um objeto.'];
                }
                if ($prof + 1 > self::MAX_DEPTH) {
                    return [false, 'Estrutura aninhada demais.'];
                }
                $sub = self::validateLevel($v, is_array($r['fields'] ?? null) ? $r['fields'] : [], [], $prof + 1);
                if (!$sub['valido']) {
                    $k = array_key_first($sub['erros']);
                    return [false, $k . ': ' . $sub['erros'][$k]];
                }
                return [true, $sub['dados']];
        }
        return [false, 'Valor inválido.'];
    }

    private static function escalarTexto($v): bool
    {
        return is_string($v) || is_int($v) || is_float($v);
    }

    private static function str($v, array $r): array
    {
        if (!self::escalarTexto($v)) {
            return [false, 'Deve ser texto.'];
        }
        $max = (int) ($r['maxLength'] ?? $r['max'] ?? self::MAX_LENGTH);
        $min = (int) ($r['minLength'] ?? $r['min'] ?? 0);
        $bruto = (string) $v;
        if (strlen($bruto) > $max * 4 + 64) {   // gigante: recusa sem processar
            return [false, 'Use no máximo ' . $max . ' caracteres.'];
        }
        $s = self::clean($bruto, !empty($r['multiline']), ($r['trim'] ?? true) !== false);
        $n = mb_strlen($s);
        if ($n > $max) {
            return [false, 'Use no máximo ' . $max . ' caracteres.'];
        }
        if ($n < $min) {
            return [false, 'Use pelo menos ' . $min . ' caracteres.'];
        }
        if (!empty($r['pattern'])) {
            $ok = @preg_match((string) $r['pattern'], $s);
            if ($ok === false) {
                error_log('[Input] pattern inválido: ' . $r['pattern']);
                return [false, 'Regra de validação inválida.'];
            }
            if ($ok !== 1) {
                return [false, 'Formato inválido.'];
            }
        }
        if (isset($r['in']) && is_array($r['in']) && !in_array($s, array_map('strval', $r['in']), true)) {
            return [false, 'Opção inválida.'];
        }
        return [true, $s];
    }

    private static function faixa($n, array $r): array
    {
        if (isset($r['min']) && is_numeric($r['min']) && $n < $r['min']) {
            return [false, 'O valor mínimo é ' . $r['min'] . '.'];
        }
        if (isset($r['max']) && is_numeric($r['max']) && $n > $r['max']) {
            return [false, 'O valor máximo é ' . $r['max'] . '.'];
        }
        return [true, $n];
    }

    public static function cpfValido(string $d): bool
    {
        if (!preg_match('/^[0-9]{11}$/', $d) || preg_match('/^(\d)\1{10}$/', $d)) {
            return false;
        }
        for ($t = 9; $t < 11; $t++) {
            $s = 0;
            for ($i = 0; $i < $t; $i++) {
                $s += (int) $d[$i] * ($t + 1 - $i);
            }
            $dv = ($s * 10) % 11 % 10;
            if ($dv !== (int) $d[$t]) {
                return false;
            }
        }
        return true;
    }

    /** CNPJ numérico ou alfanumérico (Receita Federal, 2026). */
    public static function cnpjValido(string $c): bool
    {
        if (!preg_match('/^[0-9A-Z]{12}[0-9]{2}$/', $c) || preg_match('/^(.)\1{13}$/', $c)) {
            return false;
        }
        $dv = function (int $n) use ($c): int {
            $s = 0;
            $w = $n - 7;
            for ($i = 0; $i < $n; $i++) {
                $s += (ord($c[$i]) - 48) * $w;
                $w = $w === 2 ? 9 : $w - 1;
            }
            $r = $s % 11;
            return $r < 2 ? 0 : 11 - $r;
        };
        return $dv(12) === (int) $c[12] && $dv(13) === (int) $c[13];
    }

    /* ===================================================================
     * Atalhos
     * =================================================================== */

    /** ID positivo (int ou texto só com dígitos) → int; qualquer outra coisa → null. */
    public static function id($v): ?int
    {
        if (is_int($v)) {
            return $v > 0 ? $v : null;
        }
        if (is_string($v) && preg_match('/^[1-9][0-9]{0,17}$/', $v)) {
            return (int) $v;
        }
        return null;
    }

    /** "Olá, Mundo!" → "ola-mundo" (só [a-z0-9-]); '' se nada sobrar. */
    public static function slug($v, int $max = 80): string
    {
        $s = mb_strtolower(self::text($v, $max * 2));
        $s = strtr($s, [
            'á' => 'a', 'à' => 'a', 'â' => 'a', 'ã' => 'a', 'ä' => 'a', 'å' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e',
            'í' => 'i', 'ì' => 'i', 'î' => 'i', 'ï' => 'i', 'ó' => 'o', 'ò' => 'o', 'ô' => 'o', 'õ' => 'o', 'ö' => 'o',
            'ú' => 'u', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ç' => 'c', 'ñ' => 'n', 'ý' => 'y', 'ÿ' => 'y', 'ß' => 'ss', 'æ' => 'ae', 'œ' => 'oe', 'ø' => 'o',
        ]);
        $s = preg_replace('/[^a-z0-9]+/', '-', $s) ?? '';
        return substr(trim($s, '-'), 0, $max);
    }

    private const RESERVADOS_WIN = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
        'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];

    /**
     * Nome de arquivo seguro para EXIBIR/guardar como metadado: sem caminho (../, \), NUL, controles,
     * bidi, caracteres reservados do Windows (<>:"/\|?*), nomes reservados (CON, PRN, COM1...),
     * pontos/espaços nas pontas; preserva só a ÚLTIMA extensão. Para gravar em disco, prefira um nome
     * aleatório (Upload faz isso) — nunca use o nome enviado como caminho.
     */
    public static function filename($nome, int $max = 120): string
    {
        $s = self::clean(is_scalar($nome) ? (string) $nome : '');
        $s = str_replace('\\', '/', $s);
        $s = basename('/' . $s);                                // tira qualquer caminho
        $s = preg_replace('/[<>:"\/\\\\|?*\x00-\x1F]/', '_', $s) ?? '';
        $s = trim($s, " .\t");
        $partes = explode('.', $s);
        $ext = count($partes) > 1 ? strtolower((string) array_pop($partes)) : '';
        $ext = preg_replace('/[^a-z0-9]/', '', $ext) ?? '';
        $base = implode('_', $partes);                          // "a.php.jpg" → "a_php" + ".jpg"
        $base = trim(preg_replace('/_{2,}/', '_', $base) ?? '', ' ._');
        if ($base === '' || in_array(strtoupper($base), self::RESERVADOS_WIN, true)) {
            $base = '_' . $base;
        }
        $ext = substr($ext, 0, 10);
        $limite = max(1, $max - ($ext !== '' ? strlen($ext) + 1 : 0));
        if (mb_strlen($base) > $limite) {
            $base = mb_substr($base, 0, $limite);
        }
        $out = $base . ($ext !== '' ? '.' . $ext : '');
        return $out === '_' ? 'arquivo' : $out;
    }

    /**
     * Destino de redirecionamento seguro (evita redirecionamento aberto):
     *  - caminho relativo à própria origem começando com UMA barra ("/painel?x=1");
     *  - ou URL http(s) cujo host esteja em $permitidos (comparação exata, sem curinga).
     * Qualquer outra coisa (//evil, /\evil, javascript:, \r\n, host fora da lista) → $padrao.
     *   header('Location: ' . Input::safeRedirect($_GET['volta'] ?? '', ['app.exemplo.com']));
     */
    public static function safeRedirect($url, array $permitidos = [], string $padrao = '/'): string
    {
        if (!is_string($url) || $url === '' || strlen($url) > 2048) {
            return $padrao;
        }
        if (preg_match('/[\x00-\x1F\x7F\\\\]/', $url) || preg_match('/\s/', $url)) {
            return $padrao;   // CR/LF (header injection), tab, barra invertida (/\evil.com)
        }
        if ($url[0] === '/') {
            return (isset($url[1]) && ($url[1] === '/')) ? $padrao : $url;
        }
        $p = parse_url($url);
        if (!is_array($p) || !isset($p['scheme'], $p['host']) || !in_array(strtolower($p['scheme']), ['http', 'https'], true) || isset($p['user']) || isset($p['pass'])) {
            return $padrao;
        }
        $host = strtolower($p['host']);
        foreach ($permitidos as $h) {
            if (is_string($h) && strtolower($h) === $host) {
                return $url;
            }
        }
        return $padrao;
    }
}
