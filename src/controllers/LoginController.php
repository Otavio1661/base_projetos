<?php

namespace src\controllers;

use core\Controller as ctrl;
use src\model\LoginModel;
use Exception;

class LoginController extends ctrl
{
    private $loginModel;

    public function __construct()
    {
        $this->loginModel = new LoginModel();
    }

    public function loginPost()
    {
        try {
            // Obtém os dados JSON enviados via POST
            $data = ctrl::getPost();

            // Verifica se os dados foram recebidos corretamente
            if (!isset($data['usuario'])) {
                return $this->json(['error' => 'Dados incompletos'], 400);
            }

            $info = $this->loginModel->verificarLogin($data);

            if ($info['success'] == true) {
                $info['msg'] = 'Login bem-sucedido';
                $info['erro_login'] = 'false';
                $_SESSION['user'] = $data['usuario'];
            } else {
                $info['msg'] = 'Erro: Usuário não encontrado';
                $info['erro_login'] = 'true';
            }

            return ctrl::retorno(['message' => $info['msg'], 'erro_login' => $info['erro_login'] ], 200);
        } catch (\Exception $e) {
            // Falha na autenticação
            return ctrl::retorno(['error' => $e], 401);
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
