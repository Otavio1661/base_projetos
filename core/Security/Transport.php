<?php
/**
 * ============================================
 * Core\Security\Transport — política HTTPS/HTTP por ambiente
 * ============================================
 *
 * Chamado no começo do public/index.php, logo depois do src/Env.php:  Transport::aplicar();
 *
 * Variáveis do .env (validadas em src/Env.php; tabela completa em docs/PRODUCAO.md):
 *   HTTPS_MODE          required | optional   (padrão: production → required; outros → optional)
 *   HTTP_PERMITIDO_PARA IPs/CIDRs (v4 e v6) que podem usar HTTP mesmo com required (padrão 127.0.0.1,::1)
 *   TRUSTED_PROXIES     IPs/CIDRs de proxies cujos X-Forwarded-Proto / X-Forwarded-For valem (padrão: nenhum)
 *   APP_HOSTS           hosts aceitos no cabeçalho Host (vazio = não valida; recomendado em produção)
 *   HSTS_MAX_AGE        segundos do Strict-Transport-Security (padrão 15552000; 0 desliga)
 *   HSTS_SUBDOMAINS     true → "; includeSubDomains" (padrão false)
 *
 * Regras:
 *  - HTTPS = $_SERVER['HTTPS'] ligado, porta 443, ou X-Forwarded-Proto: https vindo de proxy CONFIÁVEL.
 *    Cabeçalho X-Forwarded-* de qualquer outro cliente é ignorado (seria trivial de forjar).
 *  - required + HTTP + IP não isento: GET/HEAD → 308 para https://<host validado><uri>;
 *    outros métodos → 426 (POST nunca é redirecionado: o corpo iria em claro de novo).
 *  - required + HTTPS → Strict-Transport-Security (se HSTS_MAX_AGE > 0).
 *  - optional: nada é bloqueado, sem HSTS; em produção registra um aviso no log (no máximo 1x/dia).
 *  - APP_HOSTS preenchido: Host fora da lista → 400 (anti Host-header injection), em qualquer modo.
 * ============================================
 */

namespace Core\Security;

final class Transport
{
    public const HSTS_PADRAO = 15552000;   // 180 dias
    private const HSTS_MAX = 63072000;     // 2 anos

    private static ?array $cfg = null;
    private static ?bool $https = null;
    private static array $avisados = [];

    /* ======================= ponto de entrada ======================= */

    /** Aplica a política à requisição atual: envia cabeçalhos e, se for o caso, responde 308/426/400 e encerra. */
    public static function aplicar(): void
    {
        $r = self::avaliar($_SERVER);
        self::$https = $r['https'];
        if ($r['aviso'] !== null) {
            self::avisoUnico('https-optional', $r['aviso']);
        }
        if (headers_sent()) {
            return;
        }
        foreach ($r['cabecalhos'] as $nome => $valor) {
            header($nome . ': ' . $valor);
        }
        if ($r['acao'] === 'seguir') {
            return;
        }
        http_response_code($r['status']);
        if ($r['corpo'] !== null) {
            echo $r['corpo'];
        }
        exit;
    }

    /**
     * Decide o que fazer com uma requisição (puro: não envia nada; usado pelos testes).
     * @return array{acao:string,status:int,https:bool,ip:string,cabecalhos:array,corpo:?string,location:?string,aviso:?string}
     *   acao: 'seguir' | 'redirecionar' (308) | 'recusar' (426) | 'host' (400)
     */
    public static function avaliar(array $server, ?array $cfg = null): array
    {
        $cfg ??= self::config();
        $https = self::isHttps($server, $cfg);
        $ip = self::ipCliente($server, $cfg);
        $r = ['acao' => 'seguir', 'status' => 200, 'https' => $https, 'ip' => $ip, 'cabecalhos' => [], 'corpo' => null, 'location' => null, 'aviso' => null];
        $json = self::querJson($server);

        $host = self::hostValidado($server, $cfg);
        if ($cfg['hosts'] && $host === null) {
            return self::resposta($r, 'host', 400, 'Host inválido.', $json);
        }

        if ($cfg['modo'] === 'required') {
            if (!$https) {
                if (self::ipNaLista($ip, $cfg['isentos'])) {
                    return $r;   // chamada interna por HTTP (IP isento)
                }
                $metodo = strtoupper((string) ($server['REQUEST_METHOD'] ?? 'GET'));
                if ($metodo === 'GET' || $metodo === 'HEAD') {
                    if ($host === null) {
                        return self::resposta($r, 'host', 400, 'Host inválido.', $json);
                    }
                    $r['acao'] = 'redirecionar';
                    $r['status'] = 308;
                    $r['location'] = 'https://' . self::semPorta($host) . self::uriSegura((string) ($server['REQUEST_URI'] ?? '/'));
                    $r['cabecalhos']['Location'] = $r['location'];
                    $r['cabecalhos']['Cache-Control'] = 'no-store';
                    return $r;
                }
                $r = self::resposta($r, 'recusar', 426, 'Esta operação exige HTTPS.', $json);
                $r['cabecalhos']['Upgrade'] = 'TLS/1.2, HTTP/1.1';
                return $r;
            }
            if ($cfg['hsts'] > 0) {
                $r['cabecalhos']['Strict-Transport-Security'] = 'max-age=' . $cfg['hsts'] . ($cfg['hstsSub'] ? '; includeSubDomains' : '');
            }
        } elseif ($cfg['producao']) {
            $r['aviso'] = 'HTTPS_MODE=optional em produção: requisições HTTP são aceitas e HSTS não é enviado. Use só temporariamente (docs/PRODUCAO.md).';
        }
        return $r;
    }

    /* ======================= detecção ======================= */

    /** A requisição chegou por HTTPS? (sem argumentos: a requisição atual, já calculada por aplicar()) */
    public static function isHttps(?array $server = null, ?array $cfg = null): bool
    {
        if ($server === null && $cfg === null && self::$https !== null) {
            return self::$https;
        }
        $server ??= $_SERVER;
        $cfg ??= self::config();
        $h = strtolower(trim((string) ($server['HTTPS'] ?? '')));
        if ($h !== '' && $h !== 'off' && $h !== '0') {
            return true;
        }
        if ((string) ($server['SERVER_PORT'] ?? '') === '443') {
            return true;
        }
        $remoto = (string) ($server['REMOTE_ADDR'] ?? '');
        if ($cfg['proxies'] && self::ipNaLista($remoto, $cfg['proxies'])) {
            $xfp = strtolower(trim(explode(',', (string) ($server['HTTP_X_FORWARDED_PROTO'] ?? ''))[0]));
            return $xfp === 'https';
        }
        return false;
    }

    /**
     * IP do cliente. Só segue o X-Forwarded-For se REMOTE_ADDR for um proxy confiável — e então
     * anda da direita para a esquerda pulando os proxies confiáveis (o primeiro não confiável é o cliente).
     */
    public static function ipCliente(?array $server = null, ?array $cfg = null): string
    {
        $server ??= $_SERVER;
        $cfg ??= self::config();
        $remoto = self::normalizarIp((string) ($server['REMOTE_ADDR'] ?? '')) ?? '';
        if (!$cfg['proxies'] || !self::ipNaLista($remoto, $cfg['proxies']) || empty($server['HTTP_X_FORWARDED_FOR'])) {
            return $remoto;
        }
        $cadeia = array_reverse(array_map('trim', explode(',', (string) $server['HTTP_X_FORWARDED_FOR'])));
        $ip = $remoto;
        foreach (array_slice($cadeia, 0, 20) as $item) {
            $n = self::normalizarIp($item);
            if ($n === null) {
                break;   // lixo na cadeia: para no último IP válido
            }
            $ip = $n;
            if (!self::ipNaLista($n, $cfg['proxies'])) {
                break;
            }
        }
        return $ip;
    }

    /**
     * Host da requisição já validado (minúsculo, com :porta se veio no cabeçalho) ou null se inválido/fora
     * de APP_HOSTS. Usado por Core\Security\Csrf para comparar com o cabeçalho Origin.
     */
    public static function hostDaRequisicao(?array $server = null, ?array $cfg = null): ?string
    {
        return self::hostValidado($server ?? $_SERVER, $cfg ?? self::config());
    }

    /**
     * Confere a SINTAXE de um host (nome DNS, IPv4 ou [IPv6], com :porta opcional) — sem consultar APP_HOSTS.
     * Usado na validação de CSRF_ORIGENS_PERMITIDAS.
     */
    public static function hostValido(string $h): bool
    {
        return $h !== '' && strlen($h) <= 260 && self::hostSintaxe(strtolower($h), false);
    }

    /** O IP (padrão: o do cliente) pode usar HTTP mesmo com HTTPS_MODE=required? */
    public static function ipPermitido(?string $ip = null, ?array $cfg = null): bool
    {
        $cfg ??= self::config();
        return self::ipNaLista($ip ?? self::ipCliente(null, $cfg), $cfg['isentos']);
    }

    /** IP dentro de alguma entrada da lista (IP exato ou CIDR; IPv4 e IPv6; ::ffff:a.b.c.d vira IPv4). */
    public static function ipNaLista(string $ip, array $lista): bool
    {
        $ip = self::normalizarIp($ip);
        if ($ip === null || !$lista) {
            return false;
        }
        $bin = inet_pton($ip);
        foreach ($lista as $entrada) {
            [$rede, $bits] = array_pad(explode('/', (string) $entrada, 2), 2, null);
            $rede = self::normalizarIp((string) $rede);
            if ($rede === null) {
                continue;
            }
            $rb = inet_pton($rede);
            if (strlen($rb) !== strlen($bin)) {
                continue;
            }
            $max = strlen($rb) * 8;
            $bits = $bits === null ? $max : (int) $bits;
            if ($bits < 0 || $bits > $max) {
                continue;
            }
            $bytes = intdiv($bits, 8);
            $resto = $bits % 8;
            if (substr($bin, 0, $bytes) !== substr($rb, 0, $bytes)) {
                continue;
            }
            if ($resto === 0) {
                return true;
            }
            $mask = (0xFF << (8 - $resto)) & 0xFF;
            if ((ord($bin[$bytes]) & $mask) === (ord($rb[$bytes]) & $mask)) {
                return true;
            }
        }
        return false;
    }

    /* ======================= configuração ======================= */

    /** Configuração atual (constantes do .env com padrões seguros, ou a injetada por configurar()). */
    public static function config(): array
    {
        if (self::$cfg !== null) {
            return self::$cfg;
        }
        $c = static fn(string $n, $p) => defined($n) ? constant($n) : $p;
        $producao = strtolower((string) $c('APP_ENV', 'production')) === 'production';
        return self::$cfg = self::normalizar([
            'HTTPS_MODE' => $c('HTTPS_MODE', ''),
            'HTTP_PERMITIDO_PARA' => $c('HTTP_PERMITIDO_PARA', '127.0.0.1,::1'),
            'TRUSTED_PROXIES' => $c('TRUSTED_PROXIES', ''),
            'APP_HOSTS' => $c('APP_HOSTS', ''),
            'HSTS_MAX_AGE' => $c('HSTS_MAX_AGE', self::HSTS_PADRAO),
            'HSTS_SUBDOMAINS' => $c('HSTS_SUBDOMAINS', false),
        ], $producao);
    }

    /**
     * Monta a configuração a partir de valores no formato do .env (usado por config() e pelos testes).
     * Valores inválidos aqui caem no padrão seguro (a recusa com mensagem é feita no src/Env.php).
     */
    public static function normalizar(array $v, bool $producao): array
    {
        $modo = strtolower(trim((string) ($v['HTTPS_MODE'] ?? '')));
        if (!in_array($modo, ['required', 'optional'], true)) {
            $modo = $producao ? 'required' : 'optional';
        }
        $e = [];
        $hsts = filter_var($v['HSTS_MAX_AGE'] ?? self::HSTS_PADRAO, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0, 'max_range' => self::HSTS_MAX]]);
        return [
            'modo' => $modo,
            'producao' => $producao,
            'isentos' => self::lerLista($v['HTTP_PERMITIDO_PARA'] ?? '127.0.0.1,::1', 'ip', $e),
            'proxies' => self::lerLista($v['TRUSTED_PROXIES'] ?? '', 'ip', $e),
            'hosts' => self::lerLista($v['APP_HOSTS'] ?? '', 'host', $e),
            'hsts' => $hsts === false ? self::HSTS_PADRAO : $hsts,
            'hstsSub' => filter_var($v['HSTS_SUBDOMAINS'] ?? false, FILTER_VALIDATE_BOOLEAN),
        ];
    }

    /** Troca a configuração (testes). null volta a ler as constantes. */
    public static function configurar(?array $cfg): void
    {
        self::$cfg = $cfg;
        self::$https = null;
    }

    /**
     * Lê uma lista separada por vírgula. $tipo 'ip' (IP ou CIDR, v4/v6) ou 'host' (nome DNS, IP ou *.dominio).
     * Itens inválidos vão para $erros (e ficam fora da lista).
     */
    public static function lerLista($valor, string $tipo, ?array &$erros = null): array
    {
        $erros ??= [];
        if (is_array($valor)) {
            $itens = $valor;
        } elseif ($valor === null || $valor === false || $valor === '') {
            return [];
        } else {
            $itens = explode(',', (string) $valor);
        }
        $ok = [];
        foreach ($itens as $item) {
            $item = strtolower(trim((string) $item));
            if ($item === '') {
                continue;
            }
            $valido = $tipo === 'ip' ? self::cidrValido($item) : self::hostSintaxe($item, true);
            if ($valido) {
                $ok[] = $item;
            } else {
                $erros[] = substr($item, 0, 60);
            }
        }
        return array_values(array_unique($ok));
    }

    /* ======================= internos ======================= */

    /** Registra uma mensagem no log no máximo uma vez por dia (por processo e por marcador em arquivo temporário). */
    public static function avisoUnico(string $chave, string $mensagem): void
    {
        if (isset(self::$avisados[$chave])) {
            return;
        }
        self::$avisados[$chave] = true;
        $marca = sys_get_temp_dir() . '/r4-aviso-' . preg_replace('/[^a-z0-9-]/', '', strtolower($chave)) . '-' . substr(hash('sha256', __DIR__), 0, 10);
        $t = @filemtime($marca);
        if ($t !== false && time() - $t < 86400) {
            return;
        }
        @touch($marca);
        error_log('[R4 config] ' . $mensagem);
    }

    private static function resposta(array $r, string $acao, int $status, string $msg, bool $json): array
    {
        $r['acao'] = $acao;
        $r['status'] = $status;
        $r['cabecalhos']['Cache-Control'] = 'no-store';
        $r['cabecalhos']['X-Content-Type-Options'] = 'nosniff';
        if ($json) {
            $r['cabecalhos']['Content-Type'] = 'application/json; charset=utf-8';
            $r['corpo'] = json_encode(['status' => $status, 'retorno' => $msg], JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
        } else {
            $r['cabecalhos']['Content-Type'] = 'text/plain; charset=utf-8';
            $r['corpo'] = $msg;
        }
        return $r;
    }

    private static function querJson(array $server): bool
    {
        return stripos((string) ($server['HTTP_ACCEPT'] ?? ''), 'json') !== false
            || stripos((string) ($server['CONTENT_TYPE'] ?? $server['HTTP_CONTENT_TYPE'] ?? ''), 'json') !== false;
    }

    /**
     * Host da requisição, validado: com APP_HOSTS, só se estiver na lista; sem APP_HOSTS, só se tiver
     * sintaxe de host (nome DNS, IPv4 ou [IPv6], com porta opcional). null = inválido (nunca refletir).
     */
    private static function hostValidado(array $server, array $cfg): ?string
    {
        $h = strtolower(trim((string) ($server['HTTP_HOST'] ?? '')));
        if ($h === '' || strlen($h) > 260 || !self::hostSintaxe($h, false)) {
            return null;
        }
        if (!$cfg['hosts']) {
            return $h;
        }
        $nome = trim(self::semPorta($h), '[]');
        foreach ($cfg['hosts'] as $permitido) {
            $p = trim(self::semPorta($permitido), '[]');
            if ($p === $nome || (str_starts_with($p, '*.') && str_ends_with($nome, substr($p, 1)) && strlen($nome) > strlen($p) - 1)) {
                return $h;
            }
        }
        return null;
    }

    /** nome DNS | IPv4 | [IPv6], com :porta opcional; $lista aceita também "*.dominio" e IPv6 sem colchetes. */
    private static function hostSintaxe(string $h, bool $lista): bool
    {
        if ($lista && str_starts_with($h, '*.')) {
            $h = substr($h, 2);
        }
        if ($lista && filter_var($h, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
            return true;
        }
        if (preg_match('/^\[([0-9a-f:.]+)\](?::(\d{1,5}))?$/D', $h, $m)) {
            return (bool) filter_var($m[1], FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) && (!isset($m[2]) || (int) $m[2] <= 65535);
        }
        if (!preg_match('/^([a-z0-9.-]+)(?::(\d{1,5}))?$/D', $h, $m) || (isset($m[2]) && (int) $m[2] > 65535)) {
            return false;
        }
        $nome = $m[1];
        if (filter_var($nome, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            return true;
        }
        return strlen($nome) <= 253 && preg_match('/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/D', $nome) === 1;
    }

    private static function semPorta(string $h): string
    {
        if (str_starts_with($h, '[')) {
            $f = strpos($h, ']');
            return $f === false ? $h : substr($h, 0, $f + 1);
        }
        return substr_count($h, ':') === 1 ? explode(':', $h)[0] : $h;
    }

    /** URI para o Location: sem controles, sempre começando com uma única "/". */
    private static function uriSegura(string $uri): string
    {
        $uri = (string) preg_replace('/[\x00-\x20\x7F]/', '', $uri);
        if ($uri === '' || $uri[0] !== '/') {
            return '/';
        }
        $uri = '/' . ltrim($uri, '/\\');
        return strlen($uri) > 8000 ? '/' : $uri;
    }

    private static function cidrValido(string $item): bool
    {
        [$ip, $bits] = array_pad(explode('/', $item, 2), 2, null);
        $n = self::normalizarIp($ip);
        if ($n === null) {
            return false;
        }
        if ($bits === null) {
            return true;
        }
        $max = str_contains($n, ':') ? 128 : 32;
        return ctype_digit($bits) && (int) $bits <= $max;
    }

    /** IP válido normalizado (sem colchetes/zona; ::ffff:a.b.c.d → a.b.c.d) ou null. */
    private static function normalizarIp(string $ip): ?string
    {
        $ip = trim($ip);
        if (str_starts_with($ip, '[') && str_ends_with($ip, ']')) {
            $ip = substr($ip, 1, -1);
        }
        if (($p = strpos($ip, '%')) !== false) {
            $ip = substr($ip, 0, $p);
        }
        if (!filter_var($ip, FILTER_VALIDATE_IP)) {
            return null;
        }
        if (stripos($ip, '::ffff:') === 0 && filter_var(substr($ip, 7), FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            return substr($ip, 7);
        }
        return strtolower($ip);
    }
}
