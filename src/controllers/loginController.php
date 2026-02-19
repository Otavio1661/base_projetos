<?php

namespace src\controllers;

use core\Controller as ctrl;
use src\model\IndexModel as Model;
use src\middleware\AuthMiddleware;
use src\utils\Decryption;

class LoginController extends ctrl
{
    private $Model;

    public function __construct()
    {
        $this->Model = new Model();
    }

    public function login() {
        // Pega os dados criptografados do POST e descriptografa
        $params = Decryption::getDecryptedPost();
        
        // Verificar se a descriptografia foi bem-sucedida
        if ($params === null) {
            $errorResponse = Decryption::encrypt([
                'success' => false,
                'message' => 'Erro ao processar dados. Tente novamente.'
            ]);
            echo json_encode($errorResponse);
            return;
        }

        // Validar se usuário e senha foram enviados
        if (empty($params['username']) || empty($params['password'])) {
            $errorResponse = Decryption::encrypt([
                'success' => false,
                'message' => 'Usuário e senha são obrigatórios.'
            ]);
            echo json_encode($errorResponse);
            return;
        }

        // Processar login no model (validação e busca no banco)
        $result = $this->Model->login($params);
        
        // Verificar se o login foi bem-sucedido
        if ($result['success'] === true) {
            // Criar sessão através do middleware
            $sessionCreated = AuthMiddleware::createUserSession($result['user']);
            
            if (!$sessionCreated) {
                $errorResponse = Decryption::encrypt([
                    'success' => false,
                    'message' => 'Erro ao criar sessão. Tente novamente.'
                ]);
                echo json_encode($errorResponse);
                return;
            }
            
            // Preparar resposta de sucesso
            $response = [
                'success' => true,
                'message' => 'Login realizado com sucesso!',
                'redirect' => '/dashboard',
                'user' => [
                    'id' => $result['user']['id'] ?? null,
                    'nome' => $result['user']['nome'] ?? null,
                    'email' => $result['user']['email'] ?? null
                ]
            ];
            
            // Retornar resposta criptografada
            echo json_encode(Decryption::encrypt($response));
        } else {
            // Retornar erro criptografado
            echo json_encode(Decryption::encrypt($result));
        }
    }

}

