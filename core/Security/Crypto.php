<?php
/**
 * ============================================
 * Core\Security\Crypto — criptografia v2 (acordo de chave por sessão)
 * ============================================
 *
 * NENHUM SEGREDO VAI PARA O NAVEGADOR. O servidor tem um par de chaves P-256 FIXO:
 *  - a chave PRIVADA fica só no .env (CRYPTO_PRIVATE_KEY = base64 do PKCS#8 DER, uma linha;
 *    gere com `php tools/gerar-chave.php`). Em APP_ENV=local, se faltar, é gerada e guardada em
 *    storage/dev-crypto-key.pem (0600). Em produção é obrigatória (src/Env.php).
 *  - a chave PÚBLICA vai para a página (<meta name="r4-server-key" content="{...}">, inserida pelo
 *    public/index.php — sem script inline, compatível com CSP estrita) e também em GET /r4/chave:
 *    {v:2, pub:<ponto P-256 não comprimido, 65 bytes, base64url>, kid}.
 *
 * O navegador (public/libr4/net.js, R4.crypto) cria a cada sessão de página um par ECDH efêmero
 * (só em memória), faz ECDH com a chave pública do servidor e deriva com HKDF-SHA256
 * (salt de 16 bytes por sessão, info "R4v2 req") uma chave AES-256-GCM. Cada mensagem usa IV novo.
 *
 * Envelope da requisição (JSON do corpo):
 *   {v:2, kid, k:<pub do cliente, 65 bytes>, s:<salt 16>, z:<iv 12>, x:<cifra + tag 16>}  (base64url sem "=")
 *   AAD = "R4v2|" + MÉTODO + "|" + caminho     (o pacote só vale para aquele método + endpoint)
 *   texto claro = {t:<epoch s>, n:<nonce aleatório>, d:<dados>}   t fora da janela → recusado;
 *   nonce repetido dentro da janela → recusado (APCu, ou arquivos em storage/cache/nonces/; ver nonceNovo)
 *
 * Resposta cifrada (opcional; o cliente pede com o cabeçalho X-R4-Res: 1):
 *   {v:2, z, x}  chave = HKDF(mesmo segredo, mesmo salt, info "R4v2 res"), IV novo,
 *   AAD = "R4v2|res|" + caminho, texto claro = {n:<nonce da requisição>, d:<dados>}
 *
 * Rotação: CRYPTO_PRIVATE_KEY_ANTERIOR (opcional) continua aceita pelo kid, para não derrubar
 * sessões abertas; só a chave atual é publicada.
 *
 * Toda falha devolve null (nunca exceção para fora); o motivo fica em Crypto::motivo() para log.
 * Limites honestos: ver docs/SEGURANCA.md, seção 5.
 * ============================================
 */

namespace Core\Security;

final class Crypto
{
    public const VERSAO = 2;
    /** Prefixo DER fixo de um SubjectPublicKeyInfo P-256 (id-ecPublicKey + prime256v1 + BIT STRING de 66 bytes). */
    private const SPKI_P256 = '3059301306072a8648ce3d020106082a8648ce3d030107034200';
    private const INFO_REQ = 'R4v2 req';
    private const INFO_RES = 'R4v2 res';
    /** Teto do campo x (base64url) — o corpo já é limitado antes (getPost/MAX_POST_BYTES). */
    private const MAX_X = 8388608;
    /** Quanto o relógio do cliente pode estar ADIANTADO (s). */
    private const FUTURO_MAX = 60;
    private const JANELA_PADRAO = 300;

    /** kid => ['priv' => OpenSSLAsymmetricKey, 'pub' => 65 bytes, 'kid' => string] (a atual primeiro) */
    private static ?array $chaves = null;
    private static ?string $kidAtual = null;
    /** cache de chaves já lidas (sha256 do base64 => info|false), evita reler a mesma chave no request */
    private static array $lidas = [];
    /** pacotes já decifrados NESTE request (o mesmo envelope lido 2x não conta como replay) */
    private static array $memo = [];
    private static string $motivo = '';
    /** configuração injetada (testes/ferramentas); null = constantes do .env */
    private static ?array $cfg = null;

    /* ======================= API pública ======================= */

    /**
     * Decifra um envelope v2 de REQUISIÇÃO.
     * Devolve ['d' => dados, 't' => int, 'n' => nonce, 'kid' => string, 'chaveRes' => (32 bytes; não serialize)]
     * ou null em QUALQUER falha (formato, kid, ponto inválido, tag/AAD, janela de tempo, replay).
     */
    public static function decryptRequest(array $env, string $aad, int $maxDepth = 32): ?array
    {
        self::$motivo = '';
        try {
            $esperadas = ['v', 'kid', 'k', 's', 'z', 'x'];
            if (array_is_list($env) || count($env) !== count($esperadas) || array_diff($esperadas, array_keys($env))) {
                return self::falha(isset($env['y']) && !array_key_exists('v', $env) ? 'v1' : 'formato');
            }
            if ($env['v'] !== self::VERSAO) {
                return self::falha('versao');
            }
            foreach (['kid', 'k', 's', 'z', 'x'] as $c) {
                if (!is_string($env[$c])) {
                    return self::falha('formato');
                }
            }
            if (strlen($env['x']) > self::MAX_X) {
                return self::falha('tamanho');
            }
            $memoKey = hash('sha256', $aad . '|' . $env['kid'] . '|' . $env['k'] . '|' . $env['s'] . '|' . $env['z'] . '|' . $env['x']);
            if (isset(self::$memo[$memoKey])) {
                return self::$memo[$memoKey];
            }
            if (preg_match('/^[0-9a-f]{8}$/D', $env['kid']) !== 1) {
                return self::falha('kid');
            }
            $k = self::deb64u($env['k'], 65);
            $s = self::deb64u($env['s'], 16);
            $z = self::deb64u($env['z'], 12);
            $x = self::deb64u($env['x']);
            if ($k === null || $s === null || $z === null || $x === null) {
                return self::falha('base64');
            }
            if (strlen($x) < 32) {   // tag (16) + o menor JSON {t,n,d} possível
                return self::falha('tamanho');
            }
            if ($k[0] !== "\x04") {
                return self::falha('ponto');
            }

            self::carregar();
            $chave = null;
            foreach (self::$chaves as $kid => $c) {
                if (hash_equals((string) $kid, $env['kid'])) {
                    $chave = $c;
                }
            }
            if ($chave === null) {
                return self::falha(self::$chaves ? 'kid' : 'sem-chave');
            }

            // o OpenSSL confere se o ponto está na curva (ponto inválido → false)
            $peer = @openssl_pkey_get_public(self::pemPublica($k));
            if ($peer === false) {
                return self::falha('ponto');
            }
            $seg = @openssl_pkey_derive($peer, $chave['priv']);
            if (!is_string($seg) || strlen($seg) !== 32) {
                return self::falha('derivacao');
            }
            $kReq = hash_hkdf('sha256', $seg, 32, self::INFO_REQ, $s);
            $pt = openssl_decrypt(substr($x, 0, -16), 'aes-256-gcm', $kReq, OPENSSL_RAW_DATA, $z, substr($x, -16), $aad);
            if ($pt === false) {
                return self::falha('tag');   // adulterado, AAD (método/rota) diferente ou chave errada
            }
            $in = json_decode($pt, true, max(2, $maxDepth + 1));
            if (!is_array($in) || array_is_list($in) || count($in) !== 3 || !array_key_exists('t', $in) || !array_key_exists('n', $in) || !array_key_exists('d', $in)) {
                return self::falha('conteudo');
            }
            if (!is_int($in['t']) || !is_string($in['n']) || preg_match('/^[A-Za-z0-9_-]{16,64}$/D', $in['n']) !== 1) {
                return self::falha('conteudo');
            }
            $agora = time();
            if ($in['t'] < $agora - self::janela() || $in['t'] > $agora + self::FUTURO_MAX) {
                return self::falha('tempo');
            }
            if (!self::nonceNovo($env['kid'], $in['n'])) {
                return self::falha('replay');
            }
            return self::$memo[$memoKey] = [
                'd' => $in['d'],
                't' => $in['t'],
                'n' => $in['n'],
                'kid' => $env['kid'],
                'chaveRes' => hash_hkdf('sha256', $seg, 32, self::INFO_RES, $s),
            ];
        } catch (\Throwable $e) {
            return self::falha('excecao');
        } finally {
            self::limparErrosOpenssl();
        }
    }

    /**
     * Cifra uma RESPOSTA para a sessão de uma requisição já decifrada (resultado de decryptRequest).
     * Devolve {v:2, z, x} ou null.
     */
    public static function encryptResponse($dados, array $sessao, string $caminho): ?array
    {
        try {
            if (!isset($sessao['chaveRes'], $sessao['n']) || !is_string($sessao['chaveRes']) || strlen($sessao['chaveRes']) !== 32) {
                return null;
            }
            $json = json_encode(['n' => $sessao['n'], 'd' => $dados], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
            if ($json === false) {
                return null;
            }
            $iv = random_bytes(12);
            $tag = '';
            $ct = openssl_encrypt($json, 'aes-256-gcm', $sessao['chaveRes'], OPENSSL_RAW_DATA, $iv, $tag, self::aadResposta($caminho), 16);
            if ($ct === false || strlen($tag) !== 16) {
                return null;
            }
            return ['v' => self::VERSAO, 'z' => self::b64u($iv), 'x' => self::b64u($ct . $tag)];
        } catch (\Throwable $e) {
            return null;
        } finally {
            self::limparErrosOpenssl();
        }
    }

    /** Chave PÚBLICA atual: ['v' => 2, 'pub' => base64url(65 bytes), 'kid' => 8 hex] ou null se indisponível. */
    public static function publicKeyInfo(): ?array
    {
        self::carregar();
        if (self::$kidAtual === null || !isset(self::$chaves[self::$kidAtual])) {
            return null;
        }
        return ['v' => self::VERSAO, 'pub' => self::b64u(self::$chaves[self::$kidAtual]['pub']), 'kid' => self::$kidAtual];
    }

    /** AAD da requisição: "R4v2|MÉTODO|/caminho". */
    public static function aad(string $metodo, string $caminho): string
    {
        return 'R4v2|' . strtoupper($metodo) . '|' . $caminho;
    }

    /** AAD da resposta: "R4v2|res|/caminho". */
    public static function aadResposta(string $caminho): string
    {
        return 'R4v2|res|' . $caminho;
    }

    /** Caminho (sem query) da requisição atual, exatamente como chegou em REQUEST_URI. */
    public static function caminhoDaRequisicao(?array $server = null): string
    {
        $server ??= $_SERVER;
        $p = parse_url((string) ($server['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
        return is_string($p) && $p !== '' ? $p : '/';
    }

    /** AAD da requisição atual (REQUEST_METHOD + caminho de REQUEST_URI). */
    public static function aadDaRequisicao(?array $server = null): string
    {
        $server ??= $_SERVER;
        return self::aad((string) ($server['REQUEST_METHOD'] ?? 'GET'), self::caminhoDaRequisicao($server));
    }

    /**
     * O corpo JSON tem cara de pacote cifrado? (objeto com "x" e algum de v/k/z/y)
     * Pacote v1 antigo {x,y,z} também entra aqui — e é recusado (falha fechada) por decryptRequest.
     */
    public static function pareceEnvelope($json): bool
    {
        return is_array($json) && !array_is_list($json) && array_key_exists('x', $json)
            && (array_key_exists('v', $json) || array_key_exists('k', $json) || array_key_exists('z', $json) || array_key_exists('y', $json));
    }

    /** Motivo da última falha (para LOG/testes; nunca devolva ao cliente além do código genérico). */
    public static function motivo(): string
    {
        return self::$motivo;
    }

    /**
     * Código que pode ir ao cliente para ele se recuperar sozinho (R4.http tenta de novo UMA vez):
     *  'R4_CHAVE' (kid desconhecido: a chave do servidor mudou) | 'R4_TEMPO' (relógio fora da janela) | null.
     */
    public static function codigoCliente(): ?string
    {
        return match (self::$motivo) {
            'kid' => 'R4_CHAVE',
            'tempo' => 'R4_TEMPO',
            default => null,
        };
    }

    /** Janela de validade do "t" do pacote (CRYPTO_JANELA_SEG; padrão 300 s; limite 30..3600). */
    public static function janela(): int
    {
        $j = (int) self::cfg('CRYPTO_JANELA_SEG', self::JANELA_PADRAO);
        return max(30, min(3600, $j ?: self::JANELA_PADRAO));
    }

    /**
     * Confere uma chave privada no formato do .env (base64 do PKCS#8 DER, P-256).
     * Devolve null se válida, ou a mensagem do problema (para o log).
     */
    public static function validarChave(string $b64): ?string
    {
        return self::lerChave($b64) === null ? 'formato inválido (esperado: base64 de uma chave PKCS#8 EC P-256; gere com php tools/gerar-chave.php)' : null;
    }

    /** kid (8 hex) de uma chave privada do .env, ou null. */
    public static function kidDe(string $b64): ?string
    {
        $i = self::lerChave($b64);
        return $i['kid'] ?? null;
    }

    /**
     * Gera um par P-256 novo: ['privada' => base64 PKCS#8 DER (para o .env), 'pem' => PEM, 'pub' => base64url, 'kid' => hex].
     * Funciona mesmo sem openssl.cnf (Windows/XAMPP): tenta de novo com um cnf mínimo.
     */
    public static function gerarChave(): ?array
    {
        try {
            $opts = ['private_key_type' => OPENSSL_KEYTYPE_EC, 'curve_name' => 'prime256v1', 'private_key_bits' => 2048];
            $cnf = null;
            $k = @openssl_pkey_new($opts);
            if ($k === false && ($cnf = self::opensslCnf()) !== null) {
                $k = @openssl_pkey_new($opts + ['config' => $cnf]);
            }
            if ($k === false) {
                return null;
            }
            $pem = '';
            $ok = @openssl_pkey_export($k, $pem, null, $cnf ? ['config' => $cnf] : []);
            if (!$ok && $cnf === null && ($cnf = self::opensslCnf()) !== null) {
                $ok = @openssl_pkey_export($k, $pem, null, ['config' => $cnf]);
            }
            if (!$ok || !is_string($pem)) {
                return null;
            }
            $b64 = self::pemParaBase64($pem);
            $info = self::lerChave($b64);
            if ($info === null) {
                return null;
            }
            return ['privada' => $b64, 'pem' => $pem, 'pub' => self::b64u($info['pub']), 'kid' => $info['kid']];
        } catch (\Throwable $e) {
            return null;
        } finally {
            self::limparErrosOpenssl();
        }
    }

    /**
     * Configuração explícita (testes e ferramentas de linha de comando), no lugar das constantes do .env:
     *   Crypto::configurar(['CRYPTO_PRIVATE_KEY' => '...', 'CRYPTO_PRIVATE_KEY_ANTERIOR' => '', 'CRYPTO_JANELA_SEG' => 300, 'APP_ENV' => 'production']);
     * null volta a usar as constantes. Limpa os caches.
     */
    public static function configurar(?array $cfg): void
    {
        self::$cfg = $cfg;
        self::$chaves = null;
        self::$kidAtual = null;
        self::$memo = [];
    }

    /* ======================= base64url ======================= */

    public static function b64u(string $bin): string
    {
        return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
    }

    /** base64url ESTRITO (sem "=", sem espaços, forma canônica) com tamanho exato opcional; null se inválido. */
    public static function deb64u($s, ?int $tamanho = null): ?string
    {
        if (!is_string($s) || $s === '' || strlen($s) % 4 === 1 || preg_match('/^[A-Za-z0-9_-]+$/D', $s) !== 1) {
            return null;
        }
        $bin = base64_decode(strtr($s, '-_', '+/'), true);
        if ($bin === false || self::b64u($bin) !== $s) {   // canônico: bits sobrando no fim = adulteração
            return null;
        }
        if ($tamanho !== null && strlen($bin) !== $tamanho) {
            return null;
        }
        return $bin;
    }

    /* ======================= internos ======================= */

    private static function falha(string $motivo): ?array
    {
        self::$motivo = $motivo;
        return null;
    }

    private static function cfg(string $nome, $padrao = null)
    {
        if (self::$cfg !== null) {
            return array_key_exists($nome, self::$cfg) ? self::$cfg[$nome] : $padrao;
        }
        return defined($nome) ? constant($nome) : $padrao;
    }

    private static function ambienteLocal(): bool
    {
        return strtolower((string) self::cfg('APP_ENV', 'production')) === 'local';
    }

    /** Lê a(s) chave(s) privada(s) uma vez por request. */
    private static function carregar(): void
    {
        if (self::$chaves !== null) {
            return;
        }
        self::$chaves = [];
        $atual = trim((string) self::cfg('CRYPTO_PRIVATE_KEY', ''));
        if ($atual === '' && self::ambienteLocal()) {
            $atual = (string) self::chaveDev();
        }
        $anterior = trim((string) self::cfg('CRYPTO_PRIVATE_KEY_ANTERIOR', ''));
        foreach ([$atual, $anterior] as $i => $b64) {
            if ($b64 === '') {
                continue;
            }
            $info = self::lerChave($b64);
            if ($info === null) {
                error_log('[R4 crypto] ' . ($i === 0 ? 'CRYPTO_PRIVATE_KEY' : 'CRYPTO_PRIVATE_KEY_ANTERIOR') . ' inválida: ignorada.');
                continue;
            }
            if ($i === 0) {
                self::$kidAtual = $info['kid'];
            }
            self::$chaves[$info['kid']] ??= $info;
        }
    }

    /** base64 (DER PKCS#8, aceita também SEC1 "EC PRIVATE KEY") → ['priv', 'pub' (65 bytes), 'kid'] ou null. */
    private static function lerChave(string $b64): ?array
    {
        $b64 = trim($b64);
        $id = hash('sha256', $b64);
        if (array_key_exists($id, self::$lidas)) {
            return self::$lidas[$id] ?: null;
        }
        self::$lidas[$id] = false;
        try {
            $der = base64_decode($b64, true);
            if ($der === false || strlen($der) < 100 || strlen($der) > 400) {
                return null;
            }
            $corpo = chunk_split(base64_encode($der), 64, "\n");
            $priv = false;
            foreach (['PRIVATE KEY', 'EC PRIVATE KEY'] as $rotulo) {
                $priv = @openssl_pkey_get_private("-----BEGIN $rotulo-----\n" . $corpo . "-----END $rotulo-----\n");
                if ($priv !== false) {
                    break;
                }
            }
            if ($priv === false) {
                return null;
            }
            $d = openssl_pkey_get_details($priv);
            if (!is_array($d) || ($d['type'] ?? null) !== OPENSSL_KEYTYPE_EC || ($d['ec']['curve_name'] ?? '') !== 'prime256v1' || empty($d['ec']['d'])) {
                return null;
            }
            $spki = base64_decode(self::pemParaBase64((string) ($d['key'] ?? '')), true);
            if (!is_string($spki) || strlen($spki) !== 91 || substr($spki, 0, 26) !== hex2bin(self::SPKI_P256)) {
                return null;
            }
            $pub = substr($spki, 26);
            return self::$lidas[$id] = ['priv' => $priv, 'pub' => $pub, 'kid' => substr(hash('sha256', $pub), 0, 8)];
        } catch (\Throwable $e) {
            return null;
        } finally {
            self::limparErrosOpenssl();
        }
    }

    /** Ponto não comprimido (65 bytes) → PEM SubjectPublicKeyInfo com o prefixo DER fixo da P-256. */
    private static function pemPublica(string $ponto): string
    {
        return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode(hex2bin(self::SPKI_P256) . $ponto), 64, "\n") . "-----END PUBLIC KEY-----\n";
    }

    private static function pemParaBase64(string $pem): string
    {
        return (string) preg_replace('/-----[A-Z ]+-----|\s+/', '', $pem);
    }

    /**
     * Só em APP_ENV=local: lê (ou gera e grava, 0600) storage/dev-crypto-key.pem.
     * Criação exclusiva (fopen "x"): dois requests simultâneos não geram chaves diferentes.
     */
    private static function chaveDev(): ?string
    {
        $dir = dirname(__DIR__, 2) . '/storage';
        $arq = $dir . '/dev-crypto-key.pem';
        if (is_file($arq)) {
            $pem = @file_get_contents($arq);
            return is_string($pem) && $pem !== '' ? self::pemParaBase64($pem) : null;
        }
        $nova = self::gerarChave();
        if ($nova === null) {
            error_log('[R4 crypto] não foi possível gerar a chave de desenvolvimento (OpenSSL). Defina CRYPTO_PRIVATE_KEY no .env (php tools/gerar-chave.php).');
            return null;
        }
        if (!is_dir($dir)) {
            @mkdir($dir, 0750, true);
        }
        $fh = @fopen($arq, 'x');
        if ($fh === false) {
            // outro request criou primeiro: usa a dele
            usleep(50000);
            $pem = @file_get_contents($arq);
            return is_string($pem) && $pem !== '' ? self::pemParaBase64($pem) : $nova['privada'];
        }
        fwrite($fh, $nova['pem']);
        fclose($fh);
        @chmod($arq, 0600);
        error_log('[R4 crypto] AVISO: CRYPTO_PRIVATE_KEY ausente (APP_ENV=local). Chave de DESENVOLVIMENTO gerada em storage/dev-crypto-key.pem (kid ' . $nova['kid'] . '). Em produção use php tools/gerar-chave.php.');
        return $nova['privada'];
    }

    /** openssl.cnf para openssl_pkey_new no Windows (XAMPP) quando o padrão não é encontrado. */
    private static function opensslCnf(): ?string
    {
        $cands = [(string) getenv('OPENSSL_CONF'), dirname(PHP_BINARY) . '/extras/ssl/openssl.cnf'];
        foreach ($cands as $c) {
            if ($c !== '' && is_file($c)) {
                return $c;
            }
        }
        $t = sys_get_temp_dir() . '/r4-openssl-minimo.cnf';
        if (!is_file($t)) {
            @file_put_contents($t, "openssl_conf = r4_init\n[r4_init]\n");
        }
        return is_file($t) ? $t : null;
    }

    /**
     * Cache de nonces (anti-replay DENTRO da janela). Ordem:
     *  1. APCu (apcu_add é atômico);
     *  2. senão, um arquivo por nonce em storage/cache/nonces/ (criação exclusiva fopen "x" = atômica;
     *     o arquivo já existir = replay);
     *  3. senão (storage não gravável), aceita e registra um aviso no log (1x/dia): sobra só a janela de tempo.
     * Chave = sha256(kid|nonce). Validade = janela + 60 s (relógio adiantado) + 5 s.
     */
    private static function nonceNovo(string $kid, string $n): bool
    {
        $id = hash('sha256', $kid . '|' . $n);
        $ttl = self::ttlNonce();
        if (self::cfg('NONCE_BACKEND', '') !== 'arquivo' && function_exists('apcu_enabled') && apcu_enabled()) {
            return (bool) apcu_add('r4v2n:' . $id, 1, $ttl);
        }
        $r = self::nonceArquivo($id, $ttl);
        if ($r === null) {
            Transport::avisoUnico('nonce-sem-storage', 'Anti-replay sem APCu e sem storage/cache/nonces gravável: pacotes repetidos dentro de CRYPTO_JANELA_SEG serão aceitos. Dê permissão de escrita em storage/ ao usuário do PHP (ou ligue o APCu).');
            return true;
        }
        return $r;
    }

    /** Tempo (s) que um nonce precisa ficar guardado. */
    private static function ttlNonce(): int
    {
        return self::janela() + self::FUTURO_MAX + 5;
    }

    /** Pasta dos nonces (Crypto::configurar(['NONCE_DIR' => ...]) troca nos testes). */
    private static function dirNonces(): string
    {
        $d = (string) self::cfg('NONCE_DIR', '');
        return $d !== '' ? rtrim($d, '/\\') : dirname(__DIR__, 2) . '/storage/cache/nonces';
    }

    /**
     * Fallback em arquivos: true = nonce novo (arquivo criado), false = replay, null = storage indisponível.
     * $agora só para testes (simular o relógio).
     */
    private static function nonceArquivo(string $id, int $ttl, ?int $agora = null): ?bool
    {
        $agora ??= time();
        $dir = self::dirNonces();
        if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
            return null;
        }
        $p = $dir . '/' . $id . '.n';
        for ($tentativa = 0; $tentativa < 2; $tentativa++) {
            $fh = @fopen($p, 'x');
            if ($fh !== false) {
                fclose($fh);
                @touch($p, $agora);
                @chmod($p, 0600);
                self::limparNonces(false, $agora);
                return true;
            }
            clearstatcache(true, $p);
            $t = @filemtime($p);
            if ($t === false) {
                return null;   // não existe e não deu para criar: sem permissão de escrita
            }
            if ($t >= $agora - $ttl) {
                return false;  // já visto dentro da validade: REPLAY
            }
            @unlink($p);       // sobra vencida (limpeza ainda não passou): apaga e tenta de novo
        }
        return false;
    }

    /**
     * Limpeza oportunista da pasta de nonces: no máximo 1x por minuto (marcador .limpeza), remove os
     * vencidos, examina no máximo NONCE_VARREDURA arquivos por chamada e, se sobrarem mais que NONCE_TETO,
     * apaga os mais velhos (teto contra enchimento do disco; um nonce apagado antes da hora volta a ser
     * aceito — por isso o teto é alto e há limite de taxa no nginx).
     * Devolve quantos arquivos apagou. Pública para testes/manutenção (php -r ... Crypto::limparNonces(true)).
     */
    public static function limparNonces(bool $forcar = false, ?int $agora = null): int
    {
        $agora ??= time();
        $dir = self::dirNonces();
        $marca = $dir . '/.limpeza';
        if (!$forcar) {
            $t = @filemtime($marca);
            if ($t !== false && $t > $agora - 60) {
                return 0;
            }
        }
        @touch($marca, $agora);
        $h = @opendir($dir);
        if ($h === false) {
            return 0;
        }
        $ttl = self::ttlNonce();
        $varredura = max(10, (int) self::cfg('NONCE_VARREDURA', 20000));
        $teto = max(1, (int) self::cfg('NONCE_TETO', 10000));
        $vivos = [];
        $apagados = 0;
        $vistos = 0;
        while (($nome = readdir($h)) !== false && $vistos < $varredura) {
            if (preg_match('/^[0-9a-f]{64}\.n$/D', $nome) !== 1) {
                continue;
            }
            $vistos++;
            $p = $dir . '/' . $nome;
            $t = @filemtime($p);
            if ($t === false) {
                continue;
            }
            if ($t < $agora - $ttl) {
                $apagados += @unlink($p) ? 1 : 0;
            } else {
                $vivos[$nome] = $t;
            }
        }
        closedir($h);
        if (count($vivos) > $teto) {
            asort($vivos);
            foreach (array_slice(array_keys($vivos), 0, count($vivos) - $teto) as $nome) {
                $apagados += @unlink($dir . '/' . $nome) ? 1 : 0;
            }
        }
        clearstatcache();
        return $apagados;
    }

    private static function limparErrosOpenssl(): void
    {
        $i = 0;
        while (openssl_error_string() !== false && ++$i < 50) {
            // esvazia a fila de erros do OpenSSL (não vaza para a próxima chamada)
        }
    }
}
