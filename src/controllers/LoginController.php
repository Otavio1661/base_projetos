<?php

namespace src\controllers;

use core\Controller as ctrl;
use src\model\LoginModel;

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
            } else {
                $info['msg'] = 'Erro: Login falhou';
                $info['erro_login'] = 'true';
            }

            return ctrl::retorno(['message' => $info['msg'], 'erro_login' => $info['erro_login'] ], 200);
        } catch (\Exception $e) {
            // Falha na autenticação
            return ctrl::retorno(['error' => $e], 401);
        }
    }
}
