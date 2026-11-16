<?php

namespace App\Controllers;

use App\Config;
use Core\Controller as ctrl;

/**
 * Vitrine da libr4 (ferramenta de desenvolvimento).
 * Tem um playground que executa (eval) o código digitado pelo próprio usuário e documenta toda a
 * API, por isso só responde com APP_DEBUG=true; em produção devolve 404 (como VitrineApiController).
 */
class VitrineController extends ctrl
{
    public function __construct()
    {
        if (Config::APP_DEBUG !== true) {
            http_response_code(404);
            exit;
        }
    }

    public function index()
    {
        header('X-Content-Type-Options: nosniff');
        header('Referrer-Policy: no-referrer');
        ctrl::render('vitrine', [
            'titulo' => 'Vitrine r4.js',
        ]);
    }
}
