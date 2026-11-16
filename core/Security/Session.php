<?php
/**
 * ============================================
 * Core\Security\Session — sessão PHP sob demanda, com cookie forte
 * ============================================
 *
 * O public/index.php NÃO inicia sessão: páginas estáticas, a vitrine e a API pública não criam cookie
 * nem travam o arquivo de sessão (session_start() bloqueia requisições paralelas do mesmo usuário).
 * Quem precisa de sessão (login, carrinho, middleware de autenticação) chama:
 *
 *   use Core\Security\Session;
 *   Session::start();                 // idempotente: pode ser chamada várias vezes
 *   $_SESSION['usuario_id'] = $id;
 *   Session::regenerar();             // SEMPRE logo depois do login (troca o ID: anti fixação de sessão)
 *   Session::encerrar();              // logout: apaga os dados e expira o cookie
 *
 * Cookie: HttpOnly, SameSite=Lax, Path=/, sem Domain; Secure quando a requisição é HTTPS
 * (Transport::isHttps(), inclusive atrás de proxy confiável). Em HTTPS o nome é "__Host-R4SID" (o prefixo
 * __Host- faz o navegador recusar o cookie se não for Secure, com Path=/ e sem Domain — um subdomínio
 * não consegue plantá-lo); em HTTP é "R4SID".
 * Também: session.use_strict_mode (ID desconhecido enviado pelo cliente é descartado),
 * use_only_cookies (nunca ID na URL), use_trans_sid desligado.
 * ============================================
 */

namespace Core\Security;

final class Session
{
    public const NOME_HTTPS = '__Host-R4SID';
    public const NOME_HTTP = 'R4SID';

    /**
     * Inicia (ou reaproveita) a sessão com as opções seguras. Devolve true se a sessão está ativa.
     * Falha (cabeçalhos já enviados, sessões desligadas) → false + log; nunca exceção.
     */
    public static function start(): bool
    {
        $st = session_status();
        if ($st === PHP_SESSION_ACTIVE) {
            return true;
        }
        if ($st === PHP_SESSION_DISABLED) {
            error_log('[R4 sessao] sessões desabilitadas neste PHP.');
            return false;
        }
        if (headers_sent()) {
            error_log('[R4 sessao] Session::start() depois de enviar a saída: o cookie não pode ser criado.');
            return false;
        }
        $o = self::opcoes();
        foreach ($o['ini'] as $k => $v) {
            ini_set($k, $v);
        }
        session_name($o['nome']);
        session_set_cookie_params($o['cookie']);
        try {
            return session_start();
        } catch (\Throwable $e) {
            error_log('[R4 sessao] falha ao iniciar: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Troca o ID da sessão mantendo os dados (chame logo após autenticar ou mudar privilégios).
     * Inicia a sessão se preciso. Devolve true em caso de sucesso.
     */
    public static function regenerar(): bool
    {
        if (!self::start()) {
            return false;
        }
        return session_regenerate_id(true);
    }

    /** Logout: apaga os dados, destrói a sessão no servidor e expira o cookie no navegador. */
    public static function encerrar(): void
    {
        if (session_status() !== PHP_SESSION_ACTIVE && !isset($_COOKIE[self::opcoes()['nome']])) {
            return;
        }
        if (!self::start()) {
            return;
        }
        $_SESSION = [];
        $nome = session_name();
        $p = session_get_cookie_params();
        session_destroy();
        if (!headers_sent()) {
            setcookie($nome, '', [
                'expires' => time() - 3600,
                'path' => $p['path'],
                'domain' => $p['domain'],
                'secure' => $p['secure'],
                'httponly' => $p['httponly'],
                'samesite' => $p['samesite'] ?? 'Lax',
            ]);
        }
    }

    /** A sessão já foi iniciada nesta requisição? */
    public static function ativa(): bool
    {
        return session_status() === PHP_SESSION_ACTIVE;
    }

    /**
     * Opções aplicadas (puro; usado pelos testes): ['nome', 'cookie' => params do cookie, 'ini' => diretivas].
     * @param bool|null $https null = detecção real (Transport::isHttps())
     */
    public static function opcoes(?bool $https = null): array
    {
        $https ??= Transport::isHttps();
        return [
            'nome' => $https ? self::NOME_HTTPS : self::NOME_HTTP,
            'cookie' => [
                'lifetime' => 0,
                'path' => '/',
                'domain' => '',
                'secure' => $https,
                'httponly' => true,
                'samesite' => 'Lax',
            ],
            'ini' => [
                'session.use_strict_mode' => '1',
                'session.use_only_cookies' => '1',
                'session.use_trans_sid' => '0',
                'session.cookie_httponly' => '1',
                'session.cookie_samesite' => 'Lax',
            ],
        ];
    }
}
