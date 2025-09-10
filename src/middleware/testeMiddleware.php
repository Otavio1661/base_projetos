<?php
namespace src\middleware;

use core\Controller as ctrl;
use Exception;

class TesteMiddlewareMiddleware {

    public function Logout() {
        try {

            ctrl::retorno(['message' => ''], 200);
        } catch (Exception $e) {
            ctrl::retorno(['error' => $e->getMessage()], 400);
        }
    }
}
