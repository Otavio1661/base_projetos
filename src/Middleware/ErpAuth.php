<?php

namespace App\Middleware;

use App\Controllers\ErpAuthController;
use Core\Controller as ctrl;

/**
 * Exige sessão do mini ERP. API (/erp/api/*) → 401 JSON; página → 302 para /erp/login.
 * Não basta existir erp_uid na sessão: o usuário precisa existir e bater com a impressão gravada no login
 * (ErpAuthController::logado), e a sessão não pode estar ociosa demais.
 * Gerado pelo molde de `composer middleware`, ajustado para a demonstração.
 */
class ErpAuth
{
    public function handle()
    {
        header('Cache-Control: no-store');   // nada autenticado fica em cache de navegador/proxy
        header('Referrer-Policy: no-referrer');
        if (ErpAuthController::logado()) {
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
