<?php

namespace src\model;

use core\Database;
use Exception;
use PDO;

class LoginModel
{

    public function verificarLogin($data)
    {

        try {
            $verificarLogin = [
                'login' => $data['usuario']
            ];
            $Login = [
                'login' => 'admin'
            ];

            if ($verificarLogin == $Login) {
                return [
                    'login' => $verificarLogin['login'],
                    'success' => true
                ];
            }

            return [
                'login' => null,
                'success' => false
            ];
        } catch (Exception $e) {
            throw new Exception("Erro ao verificar login: " . $e->getMessage());
        }
    }
}
