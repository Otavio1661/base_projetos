<?php

namespace App\Middleware;

use Core\Controller as ctrl;
use Exception;

class AuthMiddleware
{
    /**
     * Inicia a sessão de forma segura
     */
    private static function initSession()
    {
        if (session_status() === PHP_SESSION_NONE) {
            // Configurações de segurança para sessão
            ini_set('session.cookie_httponly', '1');
            ini_set('session.cookie_secure', '0'); // Mude para '1' se usar HTTPS
            ini_set('session.cookie_samesite', 'Strict');
            ini_set('session.use_strict_mode', '1');
            ini_set('session.use_only_cookies', '1');

            session_start();
        }
    }

    /**
     * Cria a sessão do usuário após login bem-sucedido
     */
    public static function createUserSession($userData)
    {
        try {
            self::initSession();
            
            // Regenerar ID da sessão para prevenir session fixation
            session_regenerate_id(true);
            
            // Armazenar dados do usuário na sessão
            $_SESSION['user_id'] = $userData['id'] ?? null;
            $_SESSION['username'] = $userData['nome'] ?? null;
            $_SESSION['email'] = $userData['email'] ?? null;
            $_SESSION['logged_in'] = true;
            $_SESSION['login_time'] = time();
            $_SESSION['last_activity'] = time();
            
            // Fingerprint para segurança adicional
            $_SESSION['user_agent'] = $_SERVER['HTTP_USER_AGENT'] ?? '';
            $_SESSION['ip_address'] = $_SERVER['REMOTE_ADDR'] ?? '';
            
            return true;
        } catch (Exception $e) {
            error_log('Erro ao criar sessão: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Verifica se o usuário está autenticado
     */
    public static function checkAuth()
    {
        self::initSession();
        
        // Verificar se está logado
        if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
            return false;
        }
        
        // Verificar timeout de inatividade (30 minutos)
        if (isset($_SESSION['last_activity'])) {
            $inactive = time() - $_SESSION['last_activity'];
            if ($inactive > 1800) { // 30 minutos
                self::destroySession();
                return false;
            }
        }
        
        // Validar fingerprint
        if (isset($_SESSION['user_agent']) && $_SESSION['user_agent'] !== ($_SERVER['HTTP_USER_AGENT'] ?? '')) {
            self::destroySession();
            return false;
        }
        
        if (isset($_SESSION['ip_address']) && $_SESSION['ip_address'] !== ($_SERVER['REMOTE_ADDR'] ?? '')) {
            self::destroySession();
            return false;
        }
        
        // Atualizar última atividade
        $_SESSION['last_activity'] = time();
        
        return true;
    }

    /**
     * Retorna os dados do usuário da sessão
     */
    public static function getUserData()
    {
        if (!self::checkAuth()) {
            return null;
        }
        
        return [
            'id' => $_SESSION['user_id'] ?? null,
            'username' => $_SESSION['username'] ?? null,
            'email' => $_SESSION['email'] ?? null,
            'login_time' => $_SESSION['login_time'] ?? null
        ];
    }

    /**
     * Destrói a sessão de forma segura
     */
    private static function destroySession()
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            // Limpar todas as variáveis de sessão
            $_SESSION = [];
            
            // Destruir o cookie de sessão
            if (isset($_COOKIE[session_name()])) {
                $params = session_get_cookie_params();
                setcookie(
                    session_name(),
                    '',
                    time() - 42000,
                    $params['path'],
                    $params['domain'],
                    $params['secure'],
                    $params['httponly']
                );
            }
            
            // Destruir a sessão
            session_destroy();
        }
    }

    /**
     * Realiza o logout do usuário
     */
    public function logout()
    {
        try {
            self::destroySession();
            
            ctrl::retorno([
                'success' => true,
                'message' => 'Logout realizado com sucesso!',
                'redirect' => '/'
            ], 200);
        } catch (Exception $e) {
            error_log('Erro no logout: ' . $e->getMessage());
            ctrl::retorno([
                'success' => false,
                'error' => 'Erro ao realizar logout.'
            ], 400);
        }
    }

    /**
     * Middleware para proteger rotas
     */
    public function handle()
    {
        self::requireAuth();
    }

    /**
     * Middleware para proteger rotas
     */
    public static function requireAuth()
    {
        if (!self::checkAuth()) {
            http_response_code(401);
            echo json_encode([
                'success' => false,
                'message' => 'Não autenticado. Faça login para continuar.',
                'redirect' => '/login'
            ]);
            exit;
        }
    }
}
