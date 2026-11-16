<?php

namespace App\Middleware;

use Core\Controller as ctrl;
use Core\Security\Session;

/**
 * Exige sessão do mini ERP. API (/erp/api/*) → 401 JSON; página → 302 para /erp/login.
 * Gerado pelo molde de `composer middleware`, ajustado para a demonstração.
 */
class ErpAuth
{
    public function handle()
    {
        Session::start();
        if (!empty($_SESSION['erp_uid'])) {
            return;
        }
        $uri = parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH) ?: '/';
        if (str_starts_with($uri, '/erp/api/')) {
            ctrl::retorno('Não autenticado.', 401);
        }
        header('Location: /erp/login', true, 302);
        exit;
    }
}
