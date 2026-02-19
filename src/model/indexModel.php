<?php
namespace src\model;

use core\Database;
use Exception;
use PDO;
use core\Controller as ctrl;

class IndexModel {

    public function login($params) {
        try {
            // Validar parâmetros
            if (empty($params['username'])) {
                return [
                    'success' => false,
                    'message' => 'Usuário é obrigatório.'
                ];
            }

            if (empty($params['password'])) {
                return [
                    'success' => false,
                    'message' => 'Senha é obrigatória.'
                ];
            }

            // Buscar usuário no banco de dados
            $info = Database::switchParams($params, 'login', true, true);

            // Verificar se o usuário foi encontrado
            if (empty($info)) {
                return [
                    'success' => false,
                    'message' => 'Usuário ou senha incorretos.'
                ];
            }

            // Se encontrou múltiplos resultados, pega o primeiro
            $usuario = is_array($info) && isset($info[0]) ? $info[0] : $info;

            // Verificar se retornou dados válidos
            if (!is_array($usuario) || empty($usuario)) {
                return [
                    'success' => false,
                    'message' => 'Usuário ou senha incorretos.'
                ];
            }

            // Retornar dados do usuário (sem criar sessão - isso é feito no middleware)
            return [
                'success' => true,
                'user' => [
                    'id' => $usuario['id'] ?? null,
                    'nome' => $usuario['nome'] ?? $params['username'],
                    'email' => $usuario['email'] ?? null
                ]
            ];

        } catch (Exception $e) {
            // Log do erro
            error_log('Erro no login: ' . $e->getMessage());
            
            return [
                'success' => false,
                'message' => 'Erro ao processar login. Tente novamente.'
            ];
        }
    }
}
