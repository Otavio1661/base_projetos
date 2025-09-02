<?php
namespace src\middleware;

use core\Controller as ctrl;
use Exception;

class AuthMiddleware {

    public function handle() {
        if (!isset($_SESSION['user'])) {
            header('Location: /login?error=unauthorized');
            exit;
        }
    }

    public function Logout() {
        try {

            if (session_status() == PHP_SESSION_NONE) {
                session_start();
            }

            unset($_SESSION['user']);
            session_destroy();

            ctrl::retorno(['message' => 'Logout realizado com sucesso!', 'logout' => true], 200);
        } catch (Exception $e) {
            ctrl::retorno(['error' => $e->getMessage()], 400);
        }
    }
}