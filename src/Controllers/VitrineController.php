<?php

namespace App\Controllers;

use App\Config;
use Core\Controller as ctrl;

/**
 * Vitrine da libr4 (ferramenta de desenvolvimento).
 * Tem um playground que executa (eval) o código digitado pelo próprio usuário e documenta toda a
 * API, por isso responde com APP_DEBUG=true ou VITRINE_PUBLICA=true (modo demonstração); caso contrário devolve 404.
 * /vitrine/testes e /vitrine/api/* só existem com APP_DEBUG=true.
 */
class VitrineController extends ctrl
{
    private static function negar(): void
    {
        http_response_code(404);
        exit;
    }

    /** /vitrine: APP_DEBUG=true ou VITRINE_PUBLICA=true (demonstração, sem API de teste). */
    public function index()
    {
        if (!Config::vitrineLiberada()) {
            self::negar();
        }
        header('X-Content-Type-Options: nosniff');
        header('Referrer-Policy: no-referrer');
        ctrl::render('vitrine', [
            'titulo' => 'Vitrine r4.js',
        ]);
    }

    /** Testes automatizados da libr4 (runner próprio em JS, roda no navegador) — mesmo gate APP_DEBUG da vitrine. */
    public function testes()
    {
        if (Config::APP_DEBUG !== true) {   // os testes usam a API de teste e upload: só em desenvolvimento
            self::negar();
        }
        header('X-Content-Type-Options: nosniff');
        header('Referrer-Policy: no-referrer');
        ctrl::render('testes', [
            'titulo' => 'Testes da libr4',
        ]);
    }
}
