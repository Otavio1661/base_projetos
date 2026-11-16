<?php
/**
 * ============================================
 * Core\Security\Csrf — proteção contra requisição forjada por outro site (CSRF) por ORIGEM
 * ============================================
 *
 * Chamado no public/index.php logo depois de Transport::aplicar():  Csrf::guard();
 *
 * Por que existe: o envelope cifrado v2 NÃO autentica o remetente (a chave pública do servidor é
 * pública; qualquer página consegue montar um pacote válido). Sem esta checagem, um site de terceiros
 * poderia fazer o navegador da vítima enviar um POST para cá (com os cookies dela).
 *
 * Regras (só para métodos que alteram estado: tudo que não for GET, HEAD ou OPTIONS):
 *  (a) Sec-Fetch-Site presente e diferente de "same-origin"/"none" → 403;
 *  (b) Origin presente: precisa ser EXATAMENTE a origem da requisição (esquema + host + porta; o host é o
 *      validado por Transport, que já aplica APP_HOSTS) ou uma das CSRF_ORIGENS_PERMITIDAS → senão 403.
 *      "Origin: null" (iframe sandbox, file://, redirecionamento entre origens) é inválido → 403;
 *  (c) Content-Type: só application/json (ou application/*+json) e multipart/form-data (upload).
 *      text/plain e application/x-www-form-urlencoded (que um <form> de outro site envia sem preflight)
 *      → 415. Corpo vazio sem Content-Type passa (não há dado para forjar).
 *  Origem listada em CSRF_ORIGENS_PERMITIDAS dispensa a regra (a) — é uma API consumida de outro domínio
 *  de propósito (lembre que este projeto não envia cabeçalhos CORS: configure-os se precisar).
 *
 * Requisições SEM Origin e SEM Sec-Fetch-Site (curl, cron, serviço interno) continuam aceitas se o
 * Content-Type estiver certo: a proteção é contra NAVEGADORES (que sempre mandam Origin num POST entre
 * origens). Não é autenticação: rotas sensíveis continuam exigindo login/autorização.
 *
 * Variáveis do .env (validadas em src/Env.php):
 *   CSRF_ATIVO               true | false  (padrão true; false em produção gera aviso no log)
 *   CSRF_ORIGENS_PERMITIDAS  origens extras, vírgula: "https://app.parceiro.com,https://admin.exemplo.com:8443"
 *
 * Resposta de recusa: JSON {status, retorno} sem detalhes; o motivo vai só para o log.
 * ============================================
 */

namespace Core\Security;

final class Csrf
{
    /** Métodos que não alteram estado (não são conferidos). */
    private const SEGUROS = ['GET', 'HEAD', 'OPTIONS'];

    private static ?array $cfg = null;

    /* ======================= ponto de entrada ======================= */

    /** Confere a requisição atual; se recusada, responde 403/415 JSON e encerra. */
    public static function guard(): void
    {
        $r = self::avaliar($_SERVER);
        if ($r['acao'] === 'seguir') {
            return;
        }
        $metodo = self::limparLog((string) ($_SERVER['REQUEST_METHOD'] ?? ''), 10);
        $caminho = self::limparLog((string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH), 120);
        error_log('[R4 csrf] ' . $r['status'] . ' (' . $r['motivo'] . ') ' . $metodo . ' ' . $caminho . ($r['detalhe'] !== '' ? ' — ' . self::limparLog($r['detalhe'], 240) : ''));
        if (!headers_sent()) {
            http_response_code($r['status']);
            header('Content-Type: application/json; charset=utf-8');
            header('Cache-Control: no-store');
            header('X-Content-Type-Options: nosniff');
        }
        echo $r['corpo'];
        exit;
    }

    /**
     * Decide (puro: não envia nada; usado pelos testes).
     * @param array      $server     $_SERVER (ou simulado)
     * @param array|null $cfg        configuração do Csrf (normalizar()); null = .env
     * @param array|null $transporte configuração do Transport (Transport::normalizar()); null = .env
     * @return array{acao:string,status:int,motivo:string,detalhe:string,corpo:?string}
     *   acao 'seguir' | 'recusar'; motivo (só para log): origin-invalida, origin-outra, sec-fetch-site, content-type, sem-content-type
     */
    public static function avaliar(array $server, ?array $cfg = null, ?array $transporte = null): array
    {
        $cfg ??= self::config();
        $r = ['acao' => 'seguir', 'status' => 200, 'motivo' => '', 'detalhe' => '', 'corpo' => null];
        $metodo = strtoupper(trim((string) ($server['REQUEST_METHOD'] ?? 'GET')));
        if (in_array($metodo, self::SEGUROS, true) || !$cfg['ativo']) {
            return $r;
        }

        // (b) Origin
        $extra = false;
        if (array_key_exists('HTTP_ORIGIN', $server)) {
            $bruta = (string) $server['HTTP_ORIGIN'];
            $origem = self::normalizarOrigem($bruta);
            if ($origem === null) {
                return self::recusa($r, 403, 'origin-invalida', 'Origin: ' . $bruta);
            }
            $propria = self::origemDaRequisicao($server, $transporte);
            if ($propria === null || $origem !== $propria) {
                if (!in_array($origem, $cfg['origens'], true)) {
                    return self::recusa($r, 403, 'origin-outra', 'Origin: ' . $origem . ' (esperada: ' . ($propria ?? 'host inválido') . ')');
                }
                $extra = true;
            }
        }

        // (a) Sec-Fetch-Site (navegadores atuais mandam em toda requisição)
        if (!$extra && array_key_exists('HTTP_SEC_FETCH_SITE', $server)) {
            $sfs = strtolower(trim((string) $server['HTTP_SEC_FETCH_SITE']));
            if ($sfs !== 'same-origin' && $sfs !== 'none') {
                return self::recusa($r, 403, 'sec-fetch-site', 'Sec-Fetch-Site: ' . $sfs);
            }
        }

        // (c) Content-Type que um <form>/fetch "simples" de outro site não consegue enviar sem preflight
        $ct = (string) ($server['CONTENT_TYPE'] ?? $server['HTTP_CONTENT_TYPE'] ?? '');
        $tipo = strtolower(trim(explode(';', $ct, 2)[0]));
        if ($tipo === '') {
            return self::temCorpo($server) ? self::recusa($r, 415, 'sem-content-type', 'corpo sem Content-Type') : $r;
        }
        if (self::tipoJson($tipo) || $tipo === 'multipart/form-data') {
            return $r;
        }
        return self::recusa($r, 415, 'content-type', 'Content-Type: ' . $tipo);
    }

    /* ======================= origem ======================= */

    /**
     * Origem canônica "esquema://host[:porta]" (minúsculas; porta padrão 80/443 removida) ou null se não
     * for uma origem http(s) bem formada — sem caminho, barra final, usuário, curinga ou "null".
     */
    public static function normalizarOrigem(string $o): ?string
    {
        if ($o === '' || strlen($o) > 300 || preg_match('#^(https?)://(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::(\d{1,5}))?$#Di', $o, $m) !== 1) {
            return null;
        }
        $esquema = strtolower($m[1]);
        $host = strtolower($m[2]);
        $porta = isset($m[3]) && $m[3] !== '' ? (int) $m[3] : null;
        if ($porta !== null && ($porta < 1 || $porta > 65535)) {
            return null;
        }
        if (!Transport::hostValido($host)) {
            return null;
        }
        if ($porta === ($esquema === 'https' ? 443 : 80)) {
            $porta = null;
        }
        return $esquema . '://' . $host . ($porta !== null ? ':' . $porta : '');
    }

    /** Origem desta requisição: esquema (Transport::isHttps) + host validado (Transport, com APP_HOSTS). */
    public static function origemDaRequisicao(?array $server = null, ?array $transporte = null): ?string
    {
        $server ??= $_SERVER;
        $host = Transport::hostDaRequisicao($server, $transporte);
        if ($host === null) {
            return null;
        }
        return self::normalizarOrigem((Transport::isHttps($server, $transporte) ? 'https' : 'http') . '://' . $host);
    }

    /* ======================= configuração ======================= */

    /** Configuração atual (constantes do .env com padrões seguros, ou a injetada por configurar()). */
    public static function config(): array
    {
        if (self::$cfg !== null) {
            return self::$cfg;
        }
        $c = static fn(string $n, $p) => defined($n) ? constant($n) : $p;
        return self::$cfg = self::normalizar([
            'CSRF_ATIVO' => $c('CSRF_ATIVO', true),
            'CSRF_ORIGENS_PERMITIDAS' => $c('CSRF_ORIGENS_PERMITIDAS', ''),
        ]);
    }

    /** Monta a configuração a partir de valores no formato do .env (inválido → padrão seguro; a recusa com mensagem é no Env.php). */
    public static function normalizar(array $v): array
    {
        $e = [];
        $ativo = filter_var($v['CSRF_ATIVO'] ?? true, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        return [
            'ativo' => $ativo ?? true,
            'origens' => self::lerOrigens($v['CSRF_ORIGENS_PERMITIDAS'] ?? '', $e),
        ];
    }

    /** Troca a configuração (testes). null volta a ler as constantes. */
    public static function configurar(?array $cfg): void
    {
        self::$cfg = $cfg;
    }

    /** Lista de origens separada por vírgula → origens canônicas; itens inválidos vão para $erros. */
    public static function lerOrigens($valor, ?array &$erros = null): array
    {
        $erros ??= [];
        if ($valor === null || $valor === false || $valor === '') {
            return [];
        }
        $ok = [];
        foreach (is_array($valor) ? $valor : explode(',', (string) $valor) as $item) {
            $item = trim((string) $item);
            if ($item === '') {
                continue;
            }
            $n = self::normalizarOrigem($item);
            if ($n === null) {
                $erros[] = substr($item, 0, 60);
            } else {
                $ok[] = $n;
            }
        }
        return array_values(array_unique($ok));
    }

    /* ======================= internos ======================= */

    private static function recusa(array $r, int $status, string $motivo, string $detalhe): array
    {
        $r['acao'] = 'recusar';
        $r['status'] = $status;
        $r['motivo'] = $motivo;
        $r['detalhe'] = $detalhe;
        $msg = $status === 415 ? 'Tipo de conteúdo não suportado.' : 'Requisição recusada.';
        $r['corpo'] = json_encode(['status' => $status, 'retorno' => $msg], JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
        return $r;
    }

    private static function tipoJson(string $t): bool
    {
        return $t === 'application/json' || preg_match('#^application/[a-z0-9.\-]+\+json$#D', $t) === 1;
    }

    private static function temCorpo(array $server): bool
    {
        return (int) ($server['CONTENT_LENGTH'] ?? 0) > 0 || trim((string) ($server['HTTP_TRANSFER_ENCODING'] ?? '')) !== '';
    }

    /** Valor de cabeçalho para o log: só ASCII visível + espaço, cortado (sem quebra de linha forjada). */
    private static function limparLog(string $s, int $max): string
    {
        return (string) preg_replace('/[^\x20-\x7E]/', '?', substr($s, 0, $max));
    }
}
