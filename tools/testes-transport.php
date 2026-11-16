<?php
/**
 * ============================================
 * tools/testes-transport.php — testes da política HTTPS/HTTP (Core\Security\Transport)
 *                              e da criptografia v2 no servidor (Core\Security\Crypto)
 * ============================================
 * Uso:   php tools/testes-transport.php
 * PHP puro, asserts próprios, sem servidor e sem .env: cada caso simula $_SERVER e as variáveis
 * de ambiente (Transport::normalizar / Crypto::configurar). Saída: PASSOU/FALHOU por caso; código 1 se falhar.
 * ============================================
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require_once __DIR__ . '/../core/Security/Transport.php';
require_once __DIR__ . '/../core/Security/Crypto.php';
require_once __DIR__ . '/../core/Security/Csrf.php';
require_once __DIR__ . '/../core/Security/Session.php';

use Core\Security\Crypto;
use Core\Security\Csrf;
use Core\Security\Session;
use Core\Security\Transport;

$total = 0;
$falhas = [];
function caso(string $nome, bool $ok, string $detalhe = ''): void
{
    global $total, $falhas;
    $total++;
    echo ($ok ? 'PASSOU' : 'FALHOU') . '  ' . $nome . (!$ok && $detalhe !== '' ? "\n        -> " . $detalhe : '') . "\n";
    if (!$ok) {
        $falhas[] = $nome;
    }
}

/** Configuração como viria do .env (tudo opcional; padrão = produção). */
function cfg(array $env = [], bool $producao = true): array
{
    return Transport::normalizar($env, $producao);
}
/** $_SERVER simulado: GET http://exemplo.com/ de 203.0.113.9 (IP público de documentação). */
function srv(array $extra = []): array
{
    return $extra + ['REQUEST_METHOD' => 'GET', 'REQUEST_URI' => '/painel?x=1', 'HTTP_HOST' => 'exemplo.com', 'REMOTE_ADDR' => '203.0.113.9', 'SERVER_PORT' => '80'];
}

/* ---------------- detecção de HTTPS ---------------- */
$c = cfg();
caso('https direto ($_SERVER[HTTPS]=on) é HTTPS', Transport::isHttps(srv(['HTTPS' => 'on']), $c));
caso('HTTPS=off não é HTTPS', !Transport::isHttps(srv(['HTTPS' => 'off']), $c));
caso('porta 443 é HTTPS', Transport::isHttps(srv(['SERVER_PORT' => '443']), $c));
caso('HTTP comum na porta 80 não é HTTPS', !Transport::isHttps(srv(), $c));

$cp = cfg(['TRUSTED_PROXIES' => '10.0.0.0/8,fd00::/8']);
caso('X-Forwarded-Proto: https de proxy CONFIÁVEL vale', Transport::isHttps(srv(['REMOTE_ADDR' => '10.1.2.3', 'HTTP_X_FORWARDED_PROTO' => 'https']), $cp));
caso('X-Forwarded-Proto de proxy confiável IPv6 vale', Transport::isHttps(srv(['REMOTE_ADDR' => 'fd00::5', 'HTTP_X_FORWARDED_PROTO' => 'https, http']), $cp));
caso('X-Forwarded-Proto: https de cliente comum (forjado) é IGNORADO', !Transport::isHttps(srv(['HTTP_X_FORWARDED_PROTO' => 'https']), $cp));
caso('sem TRUSTED_PROXIES nenhum X-Forwarded-Proto é aceito (nem de 127.0.0.1)', !Transport::isHttps(srv(['REMOTE_ADDR' => '127.0.0.1', 'HTTP_X_FORWARDED_PROTO' => 'https']), cfg()));

/* ---------------- IP do cliente / isenção ---------------- */
caso('X-Forwarded-For forjado por cliente comum é ignorado', Transport::ipCliente(srv(['HTTP_X_FORWARDED_FOR' => '127.0.0.1']), $cp) === '203.0.113.9');
caso('X-Forwarded-For via proxy confiável: pega o primeiro IP não confiável da direita',
    Transport::ipCliente(srv(['REMOTE_ADDR' => '10.0.0.2', 'HTTP_X_FORWARDED_FOR' => '127.0.0.1, 198.51.100.7, 10.0.0.9']), $cp) === '198.51.100.7');
caso('X-Forwarded-For com lixo: para no último IP válido', Transport::ipCliente(srv(['REMOTE_ADDR' => '10.0.0.2', 'HTTP_X_FORWARDED_FOR' => 'lixo<script>, 198.51.100.7']), $cp) === '198.51.100.7');

$iso = cfg(['HTTP_PERMITIDO_PARA' => '127.0.0.1,::1,192.168.10.0/24,2001:db8:abcd::/48']);
caso('IP isento IPv4 exato', Transport::ipPermitido('127.0.0.1', $iso));
caso('IP isento IPv6 (::1)', Transport::ipPermitido('::1', $iso));
caso('IP isento por CIDR IPv4 (/24)', Transport::ipPermitido('192.168.10.77', $iso) && !Transport::ipPermitido('192.168.11.1', $iso));
caso('IP isento por CIDR IPv6 (/48)', Transport::ipPermitido('2001:db8:abcd:12::1', $iso) && !Transport::ipPermitido('2001:db8:abce::1', $iso));
caso('IPv4 mapeado em IPv6 (::ffff:127.0.0.1) conta como 127.0.0.1', Transport::ipPermitido('::ffff:127.0.0.1', $iso));
caso('CIDR com máscara não múltipla de 8 (/20)', Transport::ipNaLista('172.16.15.200', ['172.16.0.0/20']) && !Transport::ipNaLista('172.16.16.1', ['172.16.0.0/20']));
caso('IP inválido nunca é isento', !Transport::ipPermitido('127.0.0.1.evil', $iso) && !Transport::ipPermitido('', $iso));

$erros = [];
$l = Transport::lerLista('10.0.0.0/8, ::1 ,999.1.1.1,10.0.0.0/33,abc', 'ip', $erros);
caso('lerLista: aceita IP/CIDR válidos e aponta os inválidos', $l === ['10.0.0.0/8', '::1'] && count($erros) === 3, json_encode([$l, $erros]));
$erros = [];
$l = Transport::lerLista('Exemplo.com,*.exemplo.com,app.exemplo.com:8443,exemplo.com/x,ex mplo.com', 'host', $erros);
caso('lerLista de hosts: nomes, curinga e porta; recusa barra e espaço', $l === ['exemplo.com', '*.exemplo.com', 'app.exemplo.com:8443'] && count($erros) === 2, json_encode([$l, $erros]));

/* ---------------- HTTPS_MODE=required ---------------- */
$req = cfg(['HTTPS_MODE' => 'required']);
$r = Transport::avaliar(srv(), $req);
caso('required + HTTP + GET → 308 para https://host/uri', $r['acao'] === 'redirecionar' && $r['status'] === 308 && $r['location'] === 'https://exemplo.com/painel?x=1', json_encode($r));
$r = Transport::avaliar(srv(['REQUEST_METHOD' => 'HEAD', 'HTTP_HOST' => 'exemplo.com:8080']), $req);
caso('required + HTTP + HEAD → 308 (porta HTTP descartada)', $r['status'] === 308 && $r['location'] === 'https://exemplo.com/painel?x=1', json_encode($r));
$r = Transport::avaliar(srv(['REQUEST_METHOD' => 'POST', 'HTTP_ACCEPT' => 'application/json']), $req);
caso('required + HTTP + POST → 426 JSON (POST nunca é redirecionado)', $r['acao'] === 'recusar' && $r['status'] === 426 && $r['location'] === null
    && json_decode((string) $r['corpo'], true)['status'] === 426 && isset($r['cabecalhos']['Upgrade']), json_encode($r));
$r = Transport::avaliar(srv(['REQUEST_METHOD' => 'PUT']), $req);
caso('required + HTTP + PUT sem Accept JSON → 426 texto limpo', $r['status'] === 426 && str_starts_with($r['cabecalhos']['Content-Type'], 'text/plain') && $r['corpo'] === 'Esta operação exige HTTPS.', json_encode($r));
$r = Transport::avaliar(srv(['REQUEST_METHOD' => 'POST', 'REMOTE_ADDR' => '127.0.0.1']), $req);
caso('required + HTTP de IP isento (127.0.0.1) → segue', $r['acao'] === 'seguir' && !isset($r['cabecalhos']['Strict-Transport-Security']), json_encode($r));
$r = Transport::avaliar(srv(['REMOTE_ADDR' => '::1']), $req);
caso('required + HTTP de IP isento IPv6 (::1) → segue', $r['acao'] === 'seguir');
$r = Transport::avaliar(srv(['REMOTE_ADDR' => '10.0.0.2', 'HTTP_X_FORWARDED_FOR' => '127.0.0.1']), $req);
caso('cliente atrás de proxy NÃO confiável forjando X-Forwarded-For: 127.0.0.1 → continua bloqueado', $r['acao'] === 'redirecionar', json_encode($r));
$r = Transport::avaliar(srv(['REMOTE_ADDR' => '10.0.0.2', 'HTTP_X_FORWARDED_FOR' => '127.0.0.1', 'HTTP_X_FORWARDED_PROTO' => 'https']), $req);
caso('X-Forwarded-Proto: https de cliente comum não evita o redirecionamento', $r['acao'] === 'redirecionar');
$r = Transport::avaliar(srv(['HTTPS' => 'on']), $req);
caso('required + HTTPS → segue com HSTS (max-age padrão 15552000)', $r['acao'] === 'seguir' && ($r['cabecalhos']['Strict-Transport-Security'] ?? '') === 'max-age=15552000', json_encode($r));
$r = Transport::avaliar(srv(['HTTPS' => 'on']), cfg(['HTTPS_MODE' => 'required', 'HSTS_MAX_AGE' => 31536000, 'HSTS_SUBDOMAINS' => true]));
caso('HSTS_MAX_AGE e HSTS_SUBDOMAINS', ($r['cabecalhos']['Strict-Transport-Security'] ?? '') === 'max-age=31536000; includeSubDomains', json_encode($r));
$r = Transport::avaliar(srv(['HTTPS' => 'on']), cfg(['HTTPS_MODE' => 'required', 'HSTS_MAX_AGE' => 0]));
caso('HSTS_MAX_AGE=0 desliga o HSTS', !isset($r['cabecalhos']['Strict-Transport-Security']));
$r = Transport::avaliar(srv(['REMOTE_ADDR' => '10.9.9.9', 'HTTP_X_FORWARDED_PROTO' => 'https']), cfg(['HTTPS_MODE' => 'required', 'TRUSTED_PROXIES' => '10.0.0.0/8']));
caso('atrás de proxy confiável com X-Forwarded-Proto: https → segue com HSTS', $r['acao'] === 'seguir' && isset($r['cabecalhos']['Strict-Transport-Security']), json_encode($r));
$r = Transport::avaliar(srv(['REMOTE_ADDR' => '10.9.9.9', 'HTTP_X_FORWARDED_PROTO' => 'http']), cfg(['HTTPS_MODE' => 'required', 'TRUSTED_PROXIES' => '10.0.0.0/8']));
caso('proxy confiável dizendo http → redireciona', $r['acao'] === 'redirecionar');

/* ---------------- Host / URI no redirecionamento ---------------- */
$r = Transport::avaliar(srv(['HTTP_HOST' => 'evil.com"><script>']), $req);
caso('Host com lixo nunca é refletido no Location → 400', $r['status'] === 400 && $r['location'] === null && !str_contains((string) $r['corpo'], 'evil'), json_encode($r));
$hosts = cfg(['HTTPS_MODE' => 'required', 'APP_HOSTS' => 'exemplo.com,*.exemplo.com']);
$r = Transport::avaliar(srv(['HTTP_HOST' => 'atacante.com']), $hosts);
caso('Host fora de APP_HOSTS → 400 (mesmo em HTTP, sem redirecionar para ele)', $r['acao'] === 'host' && $r['status'] === 400 && $r['location'] === null, json_encode($r));
$r = Transport::avaliar(srv(['HTTP_HOST' => 'atacante.com', 'HTTPS' => 'on']), $hosts);
caso('Host fora de APP_HOSTS em HTTPS → 400', $r['status'] === 400);
$r = Transport::avaliar(srv(['HTTP_HOST' => 'app.exemplo.com']), $hosts);
caso('subdomínio por curinga (*.exemplo.com) é aceito e usado no 308', $r['location'] === 'https://app.exemplo.com/painel?x=1', json_encode($r));
$r = Transport::avaliar(srv(['HTTP_HOST' => 'exemplo.com.atacante.com']), $hosts);
caso('exemplo.com.atacante.com não casa com APP_HOSTS', $r['status'] === 400);
$r = Transport::avaliar(srv(['REQUEST_URI' => "//atacante.com/%0d%0aSet-Cookie:x"]), $req);
caso('URI com // inicial não vira redirecionamento aberto', $r['location'] === 'https://exemplo.com/atacante.com/%0d%0aSet-Cookie:x', (string) $r['location']);
$r = Transport::avaliar(srv(['REQUEST_URI' => "/a\r\nSet-Cookie: x=1"]), $req);
caso('CR/LF na URI são removidos do Location', !preg_match('/[\r\n]/', (string) $r['location']), (string) $r['location']);
$r = Transport::avaliar(srv(['HTTP_HOST' => '[2001:db8::1]:8080']), $req);
caso('Host IPv6 com colchetes e porta → https://[ipv6]/', $r['location'] === 'https://[2001:db8::1]/painel?x=1', (string) $r['location']);

/* ---------------- HTTPS_MODE=optional e padrões ---------------- */
$opt = cfg(['HTTPS_MODE' => 'optional'], true);
$r = Transport::avaliar(srv(['REQUEST_METHOD' => 'POST']), $opt);
caso('optional não bloqueia (POST em HTTP segue)', $r['acao'] === 'seguir');
$r = Transport::avaliar(srv(['HTTPS' => 'on']), $opt);
caso('optional não manda HSTS nem em HTTPS', !isset($r['cabecalhos']['Strict-Transport-Security']));
caso('optional em produção gera aviso (para o log)', is_string(Transport::avaliar(srv(), $opt)['aviso']));
caso('optional fora de produção não gera aviso', Transport::avaliar(srv(), cfg(['HTTPS_MODE' => 'optional'], false))['aviso'] === null);
caso('padrão: production → required', cfg([], true)['modo'] === 'required');
caso('padrão: local → optional', cfg([], false)['modo'] === 'optional');
caso('padrão: HTTP_PERMITIDO_PARA = 127.0.0.1,::1; TRUSTED_PROXIES vazio', cfg()['isentos'] === ['127.0.0.1', '::1'] && cfg()['proxies'] === []);
caso('HTTP_PERMITIDO_PARA vazio = ninguém isento', Transport::avaliar(srv(['REMOTE_ADDR' => '127.0.0.1']), cfg(['HTTPS_MODE' => 'required', 'HTTP_PERMITIDO_PARA' => '']))['acao'] === 'redirecionar');

/* ================= criptografia v2 (unitário, sem servidor) ================= */
$a = Crypto::gerarChave();
$b = Crypto::gerarChave();
caso('gerarChave: base64 PKCS#8 + pub de 65 bytes + kid de 8 hex', $a !== null && strlen((string) Crypto::deb64u($a['pub'], 65)) === 65 && preg_match('/^[0-9a-f]{8}$/', $a['kid']) === 1 && Crypto::validarChave($a['privada']) === null);
caso('validarChave recusa lixo, chave curta e RSA/base64 quebrado', Crypto::validarChave('abc') !== null && Crypto::validarChave(str_repeat('A', 200)) !== null && Crypto::validarChave('MIGH!!') !== null);

Crypto::configurar(['CRYPTO_PRIVATE_KEY' => $a['privada'], 'APP_ENV' => 'production', 'CRYPTO_JANELA_SEG' => 300]);
$info = Crypto::publicKeyInfo();
caso('publicKeyInfo devolve só {v, pub, kid} da chave atual', $info === ['v' => 2, 'pub' => $a['pub'], 'kid' => $a['kid']], json_encode($info));

/** Lado "cliente" em PHP (só para o teste): ECDH efêmero + HKDF + AES-GCM, igual ao net.js. */
function selar(array $info, $d, string $aad, array $o = []): array
{
    $cli = Crypto::gerarChave();
    $priv = openssl_pkey_get_private("-----BEGIN PRIVATE KEY-----\n" . chunk_split($cli['privada'], 64, "\n") . "-----END PRIVATE KEY-----\n");
    $pubSrv = openssl_pkey_get_public("-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode(hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200') . Crypto::deb64u($info['pub'], 65)), 64, "\n") . "-----END PUBLIC KEY-----\n");
    $seg = openssl_pkey_derive($pubSrv, $priv);
    $salt = random_bytes(16);
    $iv = random_bytes(12);
    $n = Crypto::b64u(random_bytes(16));
    $pt = json_encode(['t' => $o['t'] ?? time(), 'n' => $n, 'd' => $d]);
    $tag = '';
    $ct = openssl_encrypt($pt, 'aes-256-gcm', hash_hkdf('sha256', $seg, 32, 'R4v2 req', $salt), OPENSSL_RAW_DATA, $iv, $tag, $aad, 16);
    return ['env' => ['v' => 2, 'kid' => $o['kid'] ?? $info['kid'], 'k' => $cli['pub'], 's' => Crypto::b64u($salt), 'z' => Crypto::b64u($iv), 'x' => Crypto::b64u($ct . $tag)],
        'res' => hash_hkdf('sha256', $seg, 32, 'R4v2 res', $salt), 'n' => $n];
}

$aad = Crypto::aad('POST', '/api/pedido');
$p = selar($info, ['valor' => 10, 'txt' => 'ação'], $aad);
$r = Crypto::decryptRequest($p['env'], $aad);
caso('round-trip PHP: decryptRequest devolve os dados', is_array($r) && $r['d'] === ['valor' => 10, 'txt' => 'ação'] && $r['n'] === $p['n'], Crypto::motivo());
$resp = Crypto::encryptResponse(['ok' => true], $r, '/api/pedido');
$claro = openssl_decrypt(substr(Crypto::deb64u($resp['x']), 0, -16), 'aes-256-gcm', $p['res'], OPENSSL_RAW_DATA, Crypto::deb64u($resp['z'], 12), substr(Crypto::deb64u($resp['x']), -16), 'R4v2|res|/api/pedido');
caso('encryptResponse: {v,z,x} decifrável com a chave de resposta da sessão e o nonce do pedido', array_keys($resp) === ['v', 'z', 'x'] && json_decode((string) $claro, true) === ['n' => $p['n'], 'd' => ['ok' => true]]);

$falha = function (string $nome, array $env, string $motivo, ?string $aadX = null) use ($aad) {
    $r = Crypto::decryptRequest($env, $aadX ?? $aad);
    caso($nome . ' → null (' . $motivo . ')', $r === null && Crypto::motivo() === $motivo, 'motivo=' . Crypto::motivo());
};
$e = $p['env'];
$x = Crypto::deb64u($e['x']);
$x[3] = chr(ord($x[3]) ^ 1);
$falha('pacote adulterado (1 bit da cifra)', ['x' => Crypto::b64u($x)] + $e, 'tag');
$falha('AAD de outra rota', $e, 'tag', Crypto::aad('POST', '/api/outra'));
$falha('AAD de outro método', $e, 'tag', Crypto::aad('PUT', '/api/pedido'));
$falha('t expirado (10 min atrás)', selar($info, 1, $aad, ['t' => time() - 600])['env'], 'tempo');
$falha('t no futuro (+5 min)', selar($info, 1, $aad, ['t' => time() + 300])['env'], 'tempo');
$falha('kid errado', ['kid' => 'deadbeef'] + $e, 'kid');
$pf = "\x04" . str_repeat("\x07", 64);
$falha('ponto fora da curva', ['k' => Crypto::b64u($pf)] + $e, 'ponto');
$falha('ponto comprimido (0x02)', ['k' => Crypto::b64u("\x02" . substr(Crypto::deb64u($e['k']), 1))] + $e, 'ponto');
$falha('k com 66 bytes', ['k' => Crypto::b64u(Crypto::deb64u($e['k']) . 'A')] + $e, 'base64');
$falha('salt de 15 bytes', ['s' => Crypto::b64u(random_bytes(15))] + $e, 'base64');
$falha('IV de 13 bytes', ['z' => Crypto::b64u(random_bytes(13))] + $e, 'base64');
$falha('k em base64 comum (+ / =)', ['k' => base64_encode(Crypto::deb64u($e['k']))] + $e, 'base64');
$falha('z com espaço', ['z' => ' ' . $e['z']] + $e, 'base64');
$falha('x curto demais', ['x' => Crypto::b64u(random_bytes(10))] + $e, 'tamanho');
$falha('x gigante (> 8 MB)', ['x' => str_repeat('A', 8388612)] + $e, 'tamanho');
$falha('versão 1', ['v' => 1] + $e, 'versao');
$falha('versão "2" (texto)', ['v' => '2'] + $e, 'versao');
$falha('campo extra no envelope', $e + ['extra' => 1], 'formato');
$falha('campo como array', ['k' => [$e['k']]] + $e, 'formato');
$falha('formato antigo {x,y,z}', ['x' => 'abc', 'y' => 'def', 'z' => 'ghi'], 'v1');
caso('pareceEnvelope: v2 e v1 sim; objeto comum não', Crypto::pareceEnvelope($e) && Crypto::pareceEnvelope(['x' => 1, 'y' => 2, 'z' => 3]) && !Crypto::pareceEnvelope(['nome' => 'x']) && !Crypto::pareceEnvelope(['x', 'v']));

// rotação: a chave ANTERIOR continua aceita pelo kid; só a atual é publicada
Crypto::configurar(['CRYPTO_PRIVATE_KEY' => $b['privada'], 'CRYPTO_PRIVATE_KEY_ANTERIOR' => $a['privada'], 'APP_ENV' => 'production']);
$r = Crypto::decryptRequest(selar($info, ['velho' => 1], $aad)['env'], $aad);
caso('rotação: pacote cifrado com a chave ANTERIOR ainda é aceito', is_array($r) && $r['d'] === ['velho' => 1], Crypto::motivo());
caso('rotação: só a chave nova é publicada', Crypto::publicKeyInfo()['kid'] === $b['kid']);
Crypto::configurar(['CRYPTO_PRIVATE_KEY' => $b['privada'], 'APP_ENV' => 'production']);
$r = Crypto::decryptRequest(selar($info, 1, $aad)['env'], $aad);
caso('sem a ANTERIOR, pacote da chave velha → kid desconhecido', $r === null && Crypto::motivo() === 'kid' && Crypto::codigoCliente() === 'R4_CHAVE');
Crypto::configurar(['CRYPTO_PRIVATE_KEY' => '', 'APP_ENV' => 'production']);
caso('produção sem chave: publicKeyInfo null (nada é gerado fora de local)', Crypto::publicKeyInfo() === null);

/* ================= anti-replay: cache de nonces em ARQUIVOS (sem APCu) ================= */
$tmpN = sys_get_temp_dir() . '/r4-testes-nonces-' . bin2hex(random_bytes(4));
$cfgN = ['CRYPTO_PRIVATE_KEY' => $a['privada'], 'APP_ENV' => 'production', 'CRYPTO_JANELA_SEG' => 300, 'NONCE_DIR' => $tmpN, 'NONCE_BACKEND' => 'arquivo'];
$novoRequest = fn(array $extra = []) => Crypto::configurar($extra + $cfgN);   // cada configurar() = "outro request" (limpa o memo)
$arquivosN = fn() => array_values(array_filter(is_dir($tmpN) ? scandir($tmpN) : [], fn($n) => preg_match('/^[0-9a-f]{64}\.n$/', $n)));
$idN = fn(string $kid, string $n) => hash('sha256', $kid . '|' . $n);
$velho = time() - 2000;

$novoRequest();
$p1 = selar($info, ['pedido' => 1], $aad);
$r1 = Crypto::decryptRequest($p1['env'], $aad);
caso('nonce em arquivo: 1º envio aceito e cria um arquivo sha256(kid|nonce).n', is_array($r1) && $arquivosN() === [$idN($a['kid'], $p1['n']) . '.n'], Crypto::motivo() . ' ' . json_encode($arquivosN()));
caso('nonce em arquivo: pasta criada (0700 no Linux)', is_dir($tmpN) && (PHP_OS_FAMILY === 'Windows' || (fileperms($tmpN) & 0777) === 0700));
caso('mesmo pacote lido 2x no MESMO request não conta como replay (memo)', is_array(Crypto::decryptRequest($p1['env'], $aad)));
$novoRequest();
$r2 = Crypto::decryptRequest($p1['env'], $aad);
caso('REPLAY: o mesmo pacote em outro request → null (replay)', $r2 === null && Crypto::motivo() === 'replay', 'motivo=' . Crypto::motivo());
$novoRequest();
caso('replay de novo continua recusado', Crypto::decryptRequest($p1['env'], $aad) === null && Crypto::motivo() === 'replay');
$novoRequest();
$p2 = selar($info, ['pedido' => 2], $aad);
caso('pacote novo (nonce novo) continua passando', is_array(Crypto::decryptRequest($p2['env'], $aad)) && count($arquivosN()) === 2, Crypto::motivo());

// sobra vencida com o mesmo id (limpeza ainda não passou): é apagada e o pacote é aceito
$p3 = selar($info, ['pedido' => 3], $aad);
touch($tmpN . '/' . $idN($a['kid'], $p3['n']) . '.n', $velho);
$novoRequest();
caso('arquivo de nonce VENCIDO não bloqueia (é recriado)', is_array(Crypto::decryptRequest($p3['env'], $aad)) && filemtime($tmpN . '/' . $idN($a['kid'], $p3['n']) . '.n') >= time() - 5, Crypto::motivo());
// arquivo recente com o mesmo id (outro processo já viu): replay
$p4 = selar($info, ['pedido' => 4], $aad);
touch($tmpN . '/' . $idN($a['kid'], $p4['n']) . '.n', time() - 10);
$novoRequest();
caso('arquivo de nonce RECENTE (visto por outro processo) → replay', Crypto::decryptRequest($p4['env'], $aad) === null && Crypto::motivo() === 'replay');

// limpeza: relógio simulado (arquivos antigos) + no máximo 1x por minuto
$antes = count($arquivosN());
for ($i = 0; $i < 6; $i++) {
    touch($tmpN . '/' . hash('sha256', 'antigo' . $i) . '.n', $velho);
}
touch($tmpN . '/' . 'nao-e-nonce.txt', $velho);
touch($tmpN . '/.limpeza', time());
$novoRequest();
caso('limpeza: no máximo 1x por minuto (marcador recente → nada apagado)', Crypto::limparNonces(false) === 0 && count($arquivosN()) === $antes + 6);
touch($tmpN . '/.limpeza', time() - 120);
$apagados = Crypto::limparNonces(false);
caso('limpeza: apaga só os vencidos (6), mantém os válidos e ignora arquivos que não são nonce', $apagados === 6 && count($arquivosN()) === $antes && is_file($tmpN . '/nao-e-nonce.txt'), "apagados=$apagados restam=" . count($arquivosN()));
caso('limpeza: relógio adiantado além da janela → tudo vence', Crypto::limparNonces(true, time() + 3600) === $antes && $arquivosN() === []);
// teto de arquivos: passou de N → apaga os mais velhos
$novoRequest(['NONCE_TETO' => 5]);
for ($i = 0; $i < 8; $i++) {
    touch($tmpN . '/' . hash('sha256', 'vivo' . $i) . '.n', time() - 100 + $i);
}
$apagados = Crypto::limparNonces(true);
$restam = $arquivosN();
$esperados = array_map(fn($i) => hash('sha256', 'vivo' . $i) . '.n', [3, 4, 5, 6, 7]);
sort($esperados);
sort($restam);
caso('teto (NONCE_TETO=5): com 8 arquivos válidos apaga os 3 mais velhos', $apagados === 3 && $restam === $esperados, "apagados=$apagados " . json_encode($restam));
// varredura limitada por chamada
$novoRequest(['NONCE_VARREDURA' => 10]);
foreach ($arquivosN() as $n) {
    unlink($tmpN . '/' . $n);
}
for ($i = 0; $i < 25; $i++) {
    touch($tmpN . '/' . hash('sha256', 'lote' . $i) . '.n', $velho);
}
$apagados = Crypto::limparNonces(true);
caso('varredura limitada (NONCE_VARREDURA=10): uma chamada examina no máximo 10 arquivos', $apagados === 10 && count($arquivosN()) === 15, "apagados=$apagados");
Crypto::limparNonces(true);
Crypto::limparNonces(true);
caso('chamadas seguintes terminam a limpeza (não acumula)', $arquivosN() === []);

// storage não gravável → aceita (com aviso único no log): sobra só a janela de tempo
$arqBloqueio = $tmpN . '/arquivo-comum';
file_put_contents($arqBloqueio, 'x');
$novoRequest(['NONCE_DIR' => $arqBloqueio . '/sub']);
$p5 = selar($info, ['pedido' => 5], $aad);
$ok1 = is_array(Crypto::decryptRequest($p5['env'], $aad));
$novoRequest(['NONCE_DIR' => $arqBloqueio . '/sub']);
$ok2 = is_array(Crypto::decryptRequest($p5['env'], $aad));
caso('storage não gravável: não derruba a aplicação (aceita; aviso no log)', $ok1 && $ok2);
// limpa a pasta de teste
foreach (glob($tmpN . '/{,.}*', GLOB_BRACE) ?: [] as $f) {
    if (is_file($f)) {
        unlink($f);
    }
}
@rmdir($tmpN);
Crypto::configurar(null);

/* ================= anti-CSRF por origem (Core\Security\Csrf) ================= */
$tc = cfg(['HTTPS_MODE' => 'optional'], false);
$cc = Csrf::normalizar([]);
/** POST JSON de http://exemplo.com (sem Origin = cliente não navegador). */
function post(array $extra = []): array
{
    return $extra + ['REQUEST_METHOD' => 'POST', 'REQUEST_URI' => '/api/salvar', 'HTTP_HOST' => 'exemplo.com', 'REMOTE_ADDR' => '203.0.113.9',
        'SERVER_PORT' => '80', 'CONTENT_TYPE' => 'application/json', 'CONTENT_LENGTH' => '7'];
}
$cs = function (string $nome, array $server, int $status, ?string $motivo = null, ?array $c = null, ?array $t = null) use ($tc, $cc) {
    $r = Csrf::avaliar($server, $c ?? $cc, $t ?? $tc);
    $ok = $r['status'] === $status && ($motivo === null || $r['motivo'] === $motivo);
    if ($ok && $status !== 200) {
        $j = json_decode((string) $r['corpo'], true);
        $ok = is_array($j) && array_keys($j) === ['status', 'retorno'] && $j['status'] === $status && !str_contains((string) $r['corpo'], 'evil');
    }
    caso('csrf: ' . $nome . ' → ' . $status, $ok, json_encode($r));
};
caso('csrf: padrão = ativo e sem origens extras', $cc === ['ativo' => true, 'origens' => []]);
$cs('GET de outro site (Sec-Fetch-Site: cross-site) não é conferido', post(['REQUEST_METHOD' => 'GET', 'HTTP_SEC_FETCH_SITE' => 'cross-site', 'HTTP_ORIGIN' => 'https://evil.com']), 200);
$cs('OPTIONS não é conferido', post(['REQUEST_METHOD' => 'OPTIONS', 'HTTP_ORIGIN' => 'https://evil.com']), 200);
$cs('POST same-origin (Origin igual + Sec-Fetch-Site: same-origin)', post(['HTTP_ORIGIN' => 'http://exemplo.com', 'HTTP_SEC_FETCH_SITE' => 'same-origin']), 200);
$cs('POST sem Origin e sem Sec-Fetch-Site (curl/serviço) com JSON', post(), 200);
$cs('Sec-Fetch-Site: none (digitado/favorito) sem Origin', post(['HTTP_SEC_FETCH_SITE' => 'none']), 200);
$cs('Origin de outro domínio', post(['HTTP_ORIGIN' => 'https://evil.com']), 403, 'origin-outra');
$cs('Origin: null (iframe sandbox/file://)', post(['HTTP_ORIGIN' => 'null']), 403, 'origin-invalida');
$cs('Origin vazio', post(['HTTP_ORIGIN' => '']), 403, 'origin-invalida');
$cs('Origin com caminho/barra final', post(['HTTP_ORIGIN' => 'http://exemplo.com/']), 403, 'origin-invalida');
$cs('Origin com usuário (http://exemplo.com@evil.com)', post(['HTTP_ORIGIN' => 'http://exemplo.com@evil.com']), 403, 'origin-invalida');
$cs('Origin com sufixo (exemplo.com.evil.com)', post(['HTTP_ORIGIN' => 'http://exemplo.com.evil.com']), 403, 'origin-outra');
$cs('Origin de subdomínio (app.exemplo.com) não é a mesma origem', post(['HTTP_ORIGIN' => 'http://app.exemplo.com']), 403, 'origin-outra');
$cs('Origin https numa requisição http (esquema diferente)', post(['HTTP_ORIGIN' => 'https://exemplo.com']), 403, 'origin-outra');
$cs('Origin com a porta padrão explícita (:80) = mesma origem', post(['HTTP_ORIGIN' => 'http://exemplo.com:80']), 200);
$cs('Origin em maiúsculas é normalizado', post(['HTTP_ORIGIN' => 'HTTP://EXEMPLO.COM']), 200);
$cs('porta: Host 127.0.0.1:8087 + Origin :8087', post(['HTTP_HOST' => '127.0.0.1:8087', 'HTTP_ORIGIN' => 'http://127.0.0.1:8087']), 200);
$cs('porta: Host 127.0.0.1:8087 + Origin :8088', post(['HTTP_HOST' => '127.0.0.1:8087', 'HTTP_ORIGIN' => 'http://127.0.0.1:8088']), 403, 'origin-outra');
$cs('IPv6: Host [::1]:8087 + Origin http://[::1]:8087', post(['HTTP_HOST' => '[::1]:8087', 'HTTP_ORIGIN' => 'http://[::1]:8087']), 200);
$cs('HTTPS direto: Origin https://exemplo.com', post(['HTTPS' => 'on', 'SERVER_PORT' => '443', 'HTTP_ORIGIN' => 'https://exemplo.com']), 200);
$cs('HTTPS direto: Origin http://exemplo.com (rebaixado) recusado', post(['HTTPS' => 'on', 'SERVER_PORT' => '443', 'HTTP_ORIGIN' => 'http://exemplo.com']), 403, 'origin-outra');
$tp = cfg(['HTTPS_MODE' => 'required', 'TRUSTED_PROXIES' => '10.0.0.0/8', 'APP_HOSTS' => 'exemplo.com']);
$cs('atrás de proxy confiável (X-Forwarded-Proto: https) + Origin https', post(['REMOTE_ADDR' => '10.0.0.5', 'HTTP_X_FORWARDED_PROTO' => 'https', 'HTTP_ORIGIN' => 'https://exemplo.com']), 200, null, null, $tp);
$cs('X-Forwarded-Proto forjado por cliente comum não vira https', post(['HTTP_X_FORWARDED_PROTO' => 'https', 'HTTP_ORIGIN' => 'https://exemplo.com']), 403, 'origin-outra', null, $tp);
$cs('APP_HOSTS: Host fora da lista nunca casa com Origin', post(['HTTP_HOST' => 'atacante.com', 'HTTP_ORIGIN' => 'http://atacante.com']), 403, 'origin-outra', null, cfg(['HTTPS_MODE' => 'optional', 'APP_HOSTS' => 'exemplo.com'], false));
$cs('Sec-Fetch-Site: cross-site sem Origin', post(['HTTP_SEC_FETCH_SITE' => 'cross-site']), 403, 'sec-fetch-site');
$cs('Sec-Fetch-Site: same-site (subdomínio irmão)', post(['HTTP_SEC_FETCH_SITE' => 'same-site']), 403, 'sec-fetch-site');
$cs('Origin igual mas Sec-Fetch-Site: cross-site (contraditório)', post(['HTTP_ORIGIN' => 'http://exemplo.com', 'HTTP_SEC_FETCH_SITE' => 'cross-site']), 403, 'sec-fetch-site');
$cs('PUT de outro site', post(['REQUEST_METHOD' => 'PUT', 'HTTP_ORIGIN' => 'https://evil.com']), 403);
$cs('PATCH de outro site', post(['REQUEST_METHOD' => 'PATCH', 'HTTP_SEC_FETCH_SITE' => 'cross-site']), 403);
$cs('DELETE de outro site', post(['REQUEST_METHOD' => 'delete', 'HTTP_ORIGIN' => 'https://evil.com']), 403);
$extra = Csrf::normalizar(['CSRF_ORIGENS_PERMITIDAS' => 'https://app.parceiro.com, https://admin.exemplo.com:8443']);
$cs('CSRF_ORIGENS_PERMITIDAS: origem listada passa (mesmo cross-site)', post(['HTTP_ORIGIN' => 'https://app.parceiro.com', 'HTTP_SEC_FETCH_SITE' => 'cross-site']), 200, null, $extra);
$cs('CSRF_ORIGENS_PERMITIDAS: porta faz parte da origem', post(['HTTP_ORIGIN' => 'https://admin.exemplo.com:8443']), 200, null, $extra);
$cs('CSRF_ORIGENS_PERMITIDAS: mesma origem sem a porta listada é recusada', post(['HTTP_ORIGIN' => 'https://admin.exemplo.com']), 403, 'origin-outra', $extra);
$cs('CSRF_ORIGENS_PERMITIDAS: outra origem continua recusada', post(['HTTP_ORIGIN' => 'https://outro.parceiro.com']), 403, 'origin-outra', $extra);
$cs('CSRF_ORIGENS_PERMITIDAS: listada mas com text/plain → 415', post(['HTTP_ORIGIN' => 'https://app.parceiro.com', 'CONTENT_TYPE' => 'text/plain']), 415, 'content-type', $extra);
$cs('Content-Type text/plain (forjável sem preflight)', post(['CONTENT_TYPE' => 'text/plain;charset=UTF-8']), 415, 'content-type');
$cs('Content-Type x-www-form-urlencoded', post(['CONTENT_TYPE' => 'application/x-www-form-urlencoded']), 415, 'content-type');
$cs('Content-Type application/jsonp não é JSON', post(['CONTENT_TYPE' => 'application/jsonp']), 415, 'content-type');
$cs('corpo sem Content-Type', post(['CONTENT_TYPE' => '']), 415, 'sem-content-type');
$cs('chunked sem Content-Type', post(['CONTENT_TYPE' => '', 'CONTENT_LENGTH' => '', 'HTTP_TRANSFER_ENCODING' => 'chunked']), 415, 'sem-content-type');
$cs('POST sem corpo e sem Content-Type', post(['CONTENT_TYPE' => '', 'CONTENT_LENGTH' => '0']), 200);
$cs('application/json; charset=utf-8', post(['CONTENT_TYPE' => 'application/json; charset=utf-8']), 200);
$cs('application/merge-patch+json', post(['CONTENT_TYPE' => 'application/merge-patch+json']), 200);
$cs('multipart/form-data (upload) same-origin', post(['CONTENT_TYPE' => 'multipart/form-data; boundary=x', 'HTTP_ORIGIN' => 'http://exemplo.com']), 200);
$cs('multipart/form-data de outro site', post(['CONTENT_TYPE' => 'multipart/form-data; boundary=x', 'HTTP_ORIGIN' => 'https://evil.com']), 403);
$cs('CSRF_ATIVO=false desliga a conferência', post(['HTTP_ORIGIN' => 'https://evil.com', 'CONTENT_TYPE' => 'text/plain']), 200, null, Csrf::normalizar(['CSRF_ATIVO' => false]));
caso('csrf: CSRF_ATIVO inválido cai no padrão seguro (ligado)', Csrf::normalizar(['CSRF_ATIVO' => 'talvez'])['ativo'] === true);
$erros = [];
$l = Csrf::lerOrigens('https://a.com, HTTPS://B.com:443 ,http://c.com:8080/, *.d.com, ftp://e.com, null, https://f.com:99999, https://g.com/x, https://h_h.com', $erros);
caso('csrf: lerOrigens normaliza (minúsculas, sem porta padrão) e aponta as inválidas', $l === ['https://a.com', 'https://b.com'] && count($erros) === 7, json_encode([$l, $erros]));

/* ================= sessão sob demanda (Core\Security\Session) ================= */
$oh = Session::opcoes(true);
$ov = Session::opcoes(false);
caso('sessão em HTTPS: __Host-R4SID, Secure, Path=/, sem Domain, HttpOnly, SameSite=Lax',
    $oh['nome'] === '__Host-R4SID' && $oh['cookie'] === ['lifetime' => 0, 'path' => '/', 'domain' => '', 'secure' => true, 'httponly' => true, 'samesite' => 'Lax'], json_encode($oh));
caso('sessão em HTTP: R4SID sem Secure (o prefixo __Host- exige Secure)', $ov['nome'] === 'R4SID' && $ov['cookie']['secure'] === false && $ov['cookie']['httponly'] === true);
caso('sessão: use_strict_mode, use_only_cookies, sem trans_sid', $ov['ini']['session.use_strict_mode'] === '1' && $ov['ini']['session.use_only_cookies'] === '1' && $ov['ini']['session.use_trans_sid'] === '0');
$raiz = dirname(__DIR__);
$idx = (string) file_get_contents($raiz . '/public/index.php');
$usos = [];
foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($raiz . '/src', FilesystemIterator::SKIP_DOTS)) as $f) {
    if (str_ends_with((string) $f, '.php') && preg_match('/\bsession_start\s*\(/', (string) file_get_contents((string) $f))) {
        $usos[] = basename((string) $f);
    }
}
foreach (glob($raiz . '/core/*.php') ?: [] as $f) {
    if (preg_match('/\bsession_start\s*\(/', (string) file_get_contents($f))) {
        $usos[] = basename($f);
    }
}
caso('index.php não inicia sessão sozinho e nenhum controller chama session_start() direto', !preg_match('/\bsession_(start|set_cookie_params)\s*\(/', $idx) && $usos === [], json_encode($usos));
caso('index.php sem script inline: chave pública em <meta name="r4-server-key">', !preg_match('/[\'"]<script/i', $idx) && str_contains($idx, '<meta name="r4-server-key"') && str_contains($idx, 'htmlspecialchars($json, ENT_QUOTES | ENT_SUBSTITUTE'));
// sessão de verdade num processo PHP separado (aqui a saída já começou e o cookie não poderia ser criado)
$filho = sys_get_temp_dir() . '/r4-teste-sessao-' . bin2hex(random_bytes(4)) . '.php';
file_put_contents($filho, '<?php
require ' . var_export(__DIR__ . '/../core/Security/Transport.php', true) . ';
require ' . var_export(__DIR__ . '/../core/Security/Session.php', true) . ';
use Core\Security\Session; use Core\Security\Transport;
$_SERVER = ["REQUEST_METHOD" => "GET", "HTTP_HOST" => "exemplo.com", "REMOTE_ADDR" => "127.0.0.1", "SERVER_PORT" => "80"] + $_SERVER;
Transport::configurar(Transport::normalizar(["HTTPS_MODE" => "optional"], false));
$r = ["antes" => Session::ativa()];
$r["start"] = Session::start() && Session::start() && Session::ativa();
$r["nome"] = session_name();
$r["strict"] = ini_get("session.use_strict_mode");
$_SESSION["x"] = 1; $sid = session_id();
$r["regen"] = Session::regenerar() && session_id() !== $sid && $_SESSION["x"] === 1;
Session::encerrar();
$r["fim"] = Session::ativa();
echo json_encode($r);
');
$saida = (string) shell_exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($filho) . ' 2>&1');
@unlink($filho);
$js = json_decode($saida, true);
caso('Session::start() idempotente (R4SID, strict mode); regenerar() troca o ID e mantém os dados; encerrar() fecha',
    $js === ['antes' => false, 'start' => true, 'nome' => 'R4SID', 'strict' => '1', 'regen' => true, 'fim' => false], $saida);

echo "\n" . ($total - count($falhas)) . '/' . $total . ' casos passaram' . ($falhas ? ' — FALHARAM: ' . implode(' ; ', $falhas) : '') . "\n";
exit($falhas ? 1 : 0);
