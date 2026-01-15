<?php
/**
 * ============================================
 * Decryption.php
 * ============================================
 * 
 * @author Otavio
 * @github https://github.com/Otavio1661
 * @version 1.0.0
 * @created 2025-12-17
 * 
 * Classe responsável pela descriptografia de dados
 * criptografados pelo frontend usando AES-GCM.
 * 
 * ============================================
 */

namespace src\utils;

use src\Config;

class Decryption
{
    /**
     * Descriptografa dados enviados pelo frontend usando AES-GCM
     * 
     * @param array $encryptedData Array contendo 'x' (dados), 'y' (salt) e 'z' (iv)
     * @return array|null Retorna os dados descriptografados ou null em caso de erro
     */
    public static function decrypt($encryptedData)
    {
        try {
            // Verificar se os dados necessários estão presentes
            if (!isset($encryptedData['x'], $encryptedData['y'], $encryptedData['z'])) {
                throw new \Exception('Dados de criptografia incompletos');
            }

            // Decodificar base64
            $encrypted = base64_decode($encryptedData['x']); // data
            $salt = base64_decode($encryptedData['y']);      // salt
            $iv = base64_decode($encryptedData['z']);        // iv

            // Chave base (mesma usada no frontend)
            $baseKey = Config::BASE_CRIPTOGRAFIA;

            // Derivar chave usando PBKDF2 (compatível com o frontend)
            $key = hash_pbkdf2('sha256', $baseKey, $salt, 100000, 32, true);

            // Descriptografar usando openssl (AES-256-GCM)
            // O tag de autenticação está nos últimos 16 bytes
            $tag = substr($encrypted, -16);
            $ciphertext = substr($encrypted, 0, -16);

            $decrypted = openssl_decrypt(
                $ciphertext,
                'aes-256-gcm',
                $key,
                OPENSSL_RAW_DATA,
                $iv,
                $tag
            );

            if ($decrypted === false) {
                throw new \Exception('Falha ao descriptografar dados');
            }

            // Retornar dados decodificados
            return json_decode($decrypted, true);

        } catch (\Exception $e) {
            error_log('Erro na descriptografia: ' . $e->getMessage());
            return null;
        }
    }

    /**
     * Criptografa dados usando AES-GCM (compatível com o frontend)
     * 
     * @param array|object $data Dados a serem criptografados
     * @return array|null Retorna array com 'x' (dados), 'y' (salt) e 'z' (iv) ou null em caso de erro
     */
    public static function encrypt($data)
    {
        try {
            // Converter dados para JSON
            $jsonData = json_encode($data);
            
            if ($jsonData === false) {
                throw new \Exception('Erro ao converter dados para JSON');
            }

            // Gerar salt e IV aleatórios
            $salt = random_bytes(16);
            $iv = random_bytes(12); // GCM usa IV de 12 bytes

            // Chave base (mesma usada no frontend)
            $baseKey = Config::BASE_CRIPTOGRAFIA;

            // Derivar chave usando PBKDF2 (compatível com o frontend)
            $key = hash_pbkdf2('sha256', $baseKey, $salt, 100000, 32, true);

            // Criptografar usando openssl (AES-256-GCM)
            $tag = '';
            $ciphertext = openssl_encrypt(
                $jsonData,
                'aes-256-gcm',
                $key,
                OPENSSL_RAW_DATA,
                $iv,
                $tag,
                '',
                16
            );

            if ($ciphertext === false) {
                throw new \Exception('Falha ao criptografar dados');
            }

            // Concatenar ciphertext com tag
            $encrypted = $ciphertext . $tag;

            // Retornar dados codificados em base64
            return [
                'x' => base64_encode($encrypted), // data
                'y' => base64_encode($salt),      // salt
                'z' => base64_encode($iv)         // iv
            ];

        } catch (\Exception $e) {
            error_log('Erro na criptografia: ' . $e->getMessage());
            return null;
        }
    }

    /**
     * Pega os dados descriptografados do POST
     * 
     * @return array|null Retorna os dados descriptografados ou null em caso de erro
     */
    public static function getDecryptedPost()
    {
        $input = file_get_contents('php://input');
        $data = json_decode($input, true);

        if (!$data) {
            return null;
        }

        // Se os dados estão criptografados (contém 'x', 'y', 'z')
        if (isset($data['x'], $data['y'], $data['z'])) {
            return self::decrypt($data);
        }

        // Se os dados não estão criptografados, retorna como está
        return $data;
    }
}



