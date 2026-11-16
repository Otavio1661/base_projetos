<?php

namespace App\Controllers;

use App\Utils\ErpDados;
use App\Utils\JsonDb;
use Core\Controller as ctrl;
use Core\Security\Session;
use Core\Security\Transport;
use Core\Security\Upload;

/**
 * Login, cadastro, sessão, perfil e avatar do mini ERP de demonstração (dados fictícios em JSON).
 *
 * Segurança (ver docs/SEGURANCA.md, seção 14):
 *  - senha: bcrypt custo 12 (SENHA_ALGO/SENHA_OPCOES), rehash automático no login, no máximo 72 BYTES no cadastro
 *    (o bcrypt ignora o que passa disso);
 *  - login: mesma mensagem e ~mesmo tempo para e-mail inexistente e senha errada (password_verify contra HASH_FALSO,
 *    do mesmo algoritmo/custo); limite de tentativas ATÔMICO (flock) por IP (Transport::ipCliente: X-Forwarded-For só
 *    vale de proxy em TRUSTED_PROXIES) e por e-mail; a tentativa é contada ANTES de verificar a senha (rajadas paralelas
 *    não passam do limite);
 *  - sessão: ID trocado no login/cadastro (anti-fixação), amarrada a uma impressão do usuário (id+e-mail+hash: conta
 *    recriada com o mesmo id não herda a sessão) e expira após SESSAO_OCIOSA sem uso;
 *  - cadastro: desligável (ERP_CADASTRO_ABERTO, padrão false em produção); o cargo escolhido NUNCA pode ser 'gestor'.
 */
class ErpAuthController extends ctrl
{
    public const SENHA_ALGO = PASSWORD_BCRYPT;
    public const SENHA_OPCOES = ['cost' => 12];
    /**
     * bcrypt (custo 12) de 32 bytes aleatórios descartados: só serve para gastar o MESMO tempo quando o e-mail não existe.
     * Mudou SENHA_ALGO/SENHA_OPCOES? Gere outro: php -r 'echo password_hash(bin2hex(random_bytes(32)), PASSWORD_BCRYPT, ["cost"=>12]);'
     */
    public const HASH_FALSO = '$2y$12$vCKwC563lrixjSOgC/7Mne9Phn/Dfnpzm9LnLImgtixoaXNH1q.jG';
    /** Cargos que o próprio usuário pode escolher no cadastro (gestor só por quem administra os dados). */
    public const CARGOS_CADASTRO = ['vendas', 'financeiro', 'estoque'];

    private const MAX_FALHAS = 5;           // por IP
    private const COOLDOWN = 60;
    private const MAX_FALHAS_EMAIL = 10;    // por e-mail (qualquer IP)
    private const COOLDOWN_EMAIL = 120;
    private const MAX_CADASTROS = 10;       // tentativas de cadastro por IP
    private const JANELA_CADASTRO = 600;
    private const SESSAO_OCIOSA = 28800;    // 8 h sem requisição → sai

    /** Hash de senha com o algoritmo/custo do projeto (também usado por tools/erp-seed.php). */
    public static function hashSenha(string $senha): string
    {
        return password_hash($senha, self::SENHA_ALGO, self::SENHA_OPCOES);
    }

    /** Cadastro aberto? ERP_CADASTRO_ABERTO (validada em src/Env.php); sem a constante: só fora de produção. */
    public static function cadastroAberto(): bool
    {
        if (defined('ERP_CADASTRO_ABERTO')) {
            return constant('ERP_CADASTRO_ABERTO') === true;
        }
        return defined('APP_ENV') && strtolower((string) constant('APP_ENV')) !== 'production';
    }

    public static function publico(array $u): array
    {
        return [
            'id' => (int) $u['id'], 'nome' => $u['nome'], 'email' => $u['email'], 'cargo' => $u['cargo'],
            'tema' => $u['tema'] ?? 'auto', 'idioma' => $u['idioma'] ?? 'pt-BR',
            'avatar' => !empty($u['avatar']) ? '/erp/api/avatar/ver?id=' . (int) $u['id'] : '',
            'criadoEm' => $u['criadoEm'] ?? '',
        ];
    }

    /** Impressão do usuário guardada na sessão: muda se a conta for recriada com o mesmo id ou se a senha mudar. */
    private static function impressao(array $u): string
    {
        return substr(hash('sha256', $u['id'] . '|' . mb_strtolower((string) $u['email'], 'UTF-8') . '|' . ($u['senhaHash'] ?? '')), 0, 32);
    }

    private static function entrar(array $u): void
    {
        Session::start();
        Session::regenerar();   // novo ID: anti fixação de sessão
        $_SESSION['erp_uid'] = (int) $u['id'];
        $_SESSION['erp_fp'] = self::impressao($u);
        $_SESSION['erp_ts'] = time();
    }

    /** Usuário da sessão (ou null). Sessão de conta apagada/recriada ou ociosa demais é descartada. */
    public static function logado(): ?array
    {
        static $memo = false;
        if ($memo !== false) {
            return $memo;
        }
        Session::start();
        $id = (int) ($_SESSION['erp_uid'] ?? 0);
        $u = $id > 0 ? JsonDb::achar('usuarios', $id) : null;
        if ($id > 0 && (!$u || !hash_equals(self::impressao($u), (string) ($_SESSION['erp_fp'] ?? '')) || time() - (int) ($_SESSION['erp_ts'] ?? 0) > self::SESSAO_OCIOSA)) {
            unset($_SESSION['erp_uid'], $_SESSION['erp_fp'], $_SESSION['erp_ts']);
            $u = null;
        } elseif ($u && time() - (int) ($_SESSION['erp_ts'] ?? 0) > 60) {
            $_SESSION['erp_ts'] = time();
        }
        return $memo = ($u ?: null);
    }

    /* ---- limite de tentativas (arquivos em storage/cache, lidos e gravados sob flock) ---- */
    private static function arqLimite(string $chave): string
    {
        return JsonDb::cacheDir() . '/erp-limite-' . hash('sha256', $chave) . '.json';
    }

    /**
     * Conta UMA tentativa para $chave de forma atômica. Devolve 0 se pode seguir, ou os segundos de espera se a chave
     * já fez $max tentativas sem um intervalo de $janela segundos entre elas. Falha de disco → -1 (falha FECHADA).
     */
    private static function tentar(string $chave, int $max, int $janela): int
    {
        $h = @fopen(self::arqLimite($chave), 'c+');
        if (!$h || !flock($h, LOCK_EX)) {
            error_log('[erp] limite de tentativas indisponível (storage/cache sem escrita?)');
            return -1;
        }
        $a = json_decode((string) stream_get_contents($h), true);
        $agora = time();
        $n = (int) ($a['n'] ?? 0);
        $ate = (int) ($a['ate'] ?? 0);
        if ($ate <= $agora) {
            $n = 0;   // janela vencida: recomeça
        }
        if ($n >= $max) {
            flock($h, LOCK_UN);
            fclose($h);
            return max(1, $ate - $agora);
        }
        ftruncate($h, 0);
        rewind($h);
        fwrite($h, json_encode(['n' => $n + 1, 'ate' => $agora + $janela]));
        fflush($h);
        flock($h, LOCK_UN);
        fclose($h);
        @chmod(self::arqLimite($chave), 0600);
        return 0;
    }

    private static function zerar(string $chave): void
    {
        @unlink(self::arqLimite($chave));
    }

    private static function recusarPorLimite(int $espera): void
    {
        if ($espera < 0) {
            ctrl::retorno('Serviço temporariamente indisponível.', 503);
        }
        header('Retry-After: ' . $espera);
        ctrl::retorno('Muitas tentativas. Aguarde um minuto e tente de novo.', 429);
    }

    public function login()
    {
        header('Cache-Control: no-store');
        $d = ctrl::validate([
            'email' => ['type' => 'email', 'required' => true],
            'senha' => ['type' => 'string', 'required' => true, 'minLength' => 1, 'maxLength' => 200],
        ]);
        JsonDb::limparCache('erp-limite-', 3600, 5000);
        $email = mb_strtolower($d['email'], 'UTF-8');
        $kIp = 'login-ip|' . Transport::ipCliente();
        $kEmail = 'login-email|' . $email;
        // conta ANTES de verificar (atômico): N requisições paralelas não fazem mais que o limite de tentativas
        $espera = self::tentar($kIp, self::MAX_FALHAS, self::COOLDOWN);
        if ($espera === 0) {
            $espera = self::tentar($kEmail, self::MAX_FALHAS_EMAIL, self::COOLDOWN_EMAIL);
        }
        if ($espera !== 0) {
            self::recusarPorLimite($espera);
        }
        $user = null;
        foreach (JsonDb::todos('usuarios') as $u) {
            if (strcasecmp((string) $u['email'], $email) === 0) {
                $user = $u;
                break;
            }
        }
        // SEMPRE um password_verify do mesmo custo (com ou sem usuário): sem diferença de tempo para enumerar e-mails
        $ok = password_verify($d['senha'], (string) ($user['senhaHash'] ?? self::HASH_FALSO)) && $user !== null;
        if (!$ok) {
            ctrl::retorno('E-mail ou senha incorretos.', 401);
        }
        self::zerar($kIp);
        self::zerar($kEmail);
        if (password_needs_rehash((string) $user['senhaHash'], self::SENHA_ALGO, self::SENHA_OPCOES)) {
            $novoHash = self::hashSenha($d['senha']);
            $user = JsonDb::atualizar('usuarios', (int) $user['id'], ['senhaHash' => $novoHash]) ?? $user;
        }
        self::entrar($user);
        ctrl::retorno(['usuario' => self::publico($user)], 200);
    }

    public function cadastro()
    {
        header('Cache-Control: no-store');
        if (!self::cadastroAberto()) {
            ctrl::retorno('O cadastro de contas está desativado neste ambiente.', 403);
        }
        $d = ctrl::validate([
            'nome' => ['type' => 'string', 'required' => true, 'minLength' => 3, 'maxLength' => 80],
            'email' => ['type' => 'email', 'required' => true],
            'senha' => ['type' => 'string', 'required' => true, 'minLength' => 8, 'maxLength' => 72],
            // 'gestor' fora da lista: quem se cadastra não escolhe o cargo com mais poder (escalonamento de privilégio)
            'cargo' => ['type' => 'enum', 'in' => self::CARGOS_CADASTRO, 'required' => false, 'default' => 'vendas'],
        ]);
        $espera = self::tentar('cadastro-ip|' . Transport::ipCliente(), self::MAX_CADASTROS, self::JANELA_CADASTRO);
        if ($espera !== 0) {
            self::recusarPorLimite($espera);
        }
        $email = mb_strtolower($d['email'], 'UTF-8');
        $local = (string) strstr($email, '@', true);
        $erroSenha = strlen($d['senha']) > 72 ? 'Use no máximo 72 bytes na senha (acentos contam 2).'
            : (!preg_match('/\pL/u', $d['senha']) || !preg_match('/\d/', $d['senha']) ? 'Use letras e números na senha.'
            : (mb_strlen($local) >= 4 && mb_stripos($d['senha'], $local) !== false ? 'A senha não pode conter o seu e-mail.' : ''));
        if ($erroSenha !== '') {
            ctrl::responder(['status' => 422, 'retorno' => 'Dados inválidos', 'erros' => ['senha' => $erroSenha]], 422);
        }
        $hash = self::hashSenha($d['senha']);
        $novo = null;
        $repetido = false;
        JsonDb::mutar('usuarios', static function (array $l) use ($d, $email, $hash, &$novo, &$repetido) {
            $max = 0;
            foreach ($l as $u) {
                $max = max($max, (int) $u['id']);
                if (strcasecmp((string) $u['email'], $email) === 0) {
                    $repetido = true;
                    return null;
                }
            }
            if (count($l) >= 500) {   // demonstração: não deixa o arquivo crescer sem limite
                $repetido = null;
                return null;
            }
            // só campos montados aqui (nada do corpo entra direto: sem mass assignment)
            $l[] = $novo = [
                'id' => $max + 1, 'nome' => $d['nome'], 'email' => $email, 'senhaHash' => $hash,
                'cargo' => $d['cargo'], 'tema' => 'auto', 'idioma' => 'pt-BR', 'avatar' => '', 'criadoEm' => date('Y-m-d'),
            ];
            return $l;
        });
        if ($repetido === null) {
            ctrl::retorno('Limite de contas da demonstração atingido.', 503);
        }
        if ($repetido) {
            ctrl::responder(['status' => 422, 'retorno' => 'Dados inválidos', 'erros' => ['email' => 'Este e-mail já está cadastrado.']], 422);
        }
        self::entrar($novo);
        ctrl::retorno(['usuario' => self::publico($novo)], 201);
    }

    public function logout()
    {
        Session::encerrar();
        ctrl::retorno('ok', 200);
    }

    public function eu()
    {
        $u = self::logado();
        if (!$u) {
            ctrl::retorno('Não autenticado.', 401);
        }
        ctrl::retorno(['usuario' => self::publico($u)], 200);
    }

    public function perfil()
    {
        $u = self::logado();
        $d = ctrl::validate([
            'nome' => ['type' => 'string', 'required' => true, 'minLength' => 3, 'maxLength' => 80],
            'tema' => ['type' => 'enum', 'in' => ['light', 'dark', 'auto'], 'required' => false, 'default' => 'auto'],
            'idioma' => ['type' => 'enum', 'in' => ['pt-BR', 'en'], 'required' => false, 'default' => 'pt-BR'],
        ]);
        $novo = JsonDb::atualizar('usuarios', (int) $u['id'], $d);
        ctrl::retorno(['usuario' => self::publico($novo ?? $u)], 200);
    }

    public function avatar()
    {
        $u = self::logado();
        $dir = Upload::storage('erp-avatares');
        $r = Upload::save('arquivo', ['permitidos' => ['png', 'jpg', 'jpeg', 'webp'], 'maxBytes' => 1048576, 'destino' => $dir, 'imagem' => ['maxLargura' => 3000, 'maxAltura' => 3000]]);
        if (!$r['ok']) {
            ctrl::responder(['status' => 422, 'retorno' => 'Arquivo recusado', 'erros' => ['arquivo' => implode(' ', (array) $r['erros'])]], 422);
        }
        $antigo = (string) ($u['avatar'] ?? '');
        $novo = JsonDb::atualizar('usuarios', (int) $u['id'], ['avatar' => $r['arquivo']['nome']]);
        if ($antigo !== '' && $antigo !== $r['arquivo']['nome'] && preg_match('/^[a-f0-9]{32}\.(png|jpe?g|webp)$/', $antigo)) {
            @unlink($dir . '/' . $antigo);
        }
        ctrl::retorno(['url' => self::publico($novo ?? $u)['avatar'] . '&v=' . time()], 200);
    }

    /**
     * GET /erp/api/avatar/ver[?id=] — serve SÓ o avatar de quem está logado (id de outro usuário → 404, sem IDOR),
     * com Content-Type FIXO pela extensão gerada pelo servidor (nunca o que o navegador disse), nosniff, CSP sandbox e
     * Content-Disposition: um arquivo malicioso aberto direto na aba não executa nada.
     */
    public function avatarVer()
    {
        $u = self::logado();
        $pedido = $_GET['id'] ?? null;
        if (!$u || ($pedido !== null && (!is_string($pedido) || (int) $pedido !== (int) $u['id']))) {
            http_response_code(404);
            exit;
        }
        $nome = (string) ($u['avatar'] ?? '');
        $f = Upload::storage('erp-avatares') . '/' . $nome;
        if (!preg_match('/^[a-f0-9]{32}\.(png|jpe?g|webp)$/', $nome, $m) || !is_file($f)) {
            http_response_code(404);
            exit;
        }
        $tipos = ['png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'webp' => 'image/webp'];
        header('Content-Type: ' . $tipos[$m[1]]);
        header('X-Content-Type-Options: nosniff');
        header('Content-Disposition: inline; filename="avatar.' . $m[1] . '"');
        header("Content-Security-Policy: default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
        header('Cross-Origin-Resource-Policy: same-origin');
        header('Cache-Control: private, max-age=300');
        header('Content-Length: ' . filesize($f));
        readfile($f);
        exit;
    }
}
