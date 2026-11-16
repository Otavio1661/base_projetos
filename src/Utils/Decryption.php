<?php
/**
 * ============================================
 * Decryption.php
 * ============================================
 *
 * @author Otavio
 * @github https://github.com/Otavio1661
 * @version 2.0.0
 * @created 2025-12-17
 *
 * Fachada de compatibilidade para a criptografia v2 (Core\Security\Crypto).
 *
 * O esquema antigo (v1: {x,y,z} com PBKDF2 sobre BASE_CRIPTOGRAFIA, chave entregue ao navegador)
 * foi REMOVIDO. No v2 nenhum segredo sai do servidor: o navegador faz ECDH P-256 com a chave
 * pública do servidor e cifra com AES-256-GCM (AAD = método + caminho). Detalhes em
 * core/Security/Crypto.php e docs/SEGURANCA.md.
 *
 * Em código novo use direto:
 *   Controller::getPost()            — corpo decifrado (ou JSON em claro)
 *   Controller::responderCifrado($d) — resposta cifrada quando o cliente pede (X-R4-Res: 1)
 * ============================================
 */

namespace App\Utils;

use Core\Controller;
use Core\Security\Crypto;

class Decryption
{
    /**
     * Decifra um envelope v2 {v,kid,k,s,z,x}. O AAD padrão é o da requisição atual
     * (REQUEST_METHOD + caminho de REQUEST_URI). Devolve os dados ou null (pacote inválido,
     * adulterado, de outro endpoint, expirado ou no formato antigo {x,y,z}).
     *
     * @param array $envelope
     * @param string|null $aad
     * @param int $maxDepth profundidade máxima do JSON decifrado
     * @return mixed|null
     */
    public static function decrypt($envelope, ?string $aad = null, int $maxDepth = 32)
    {
        if (!is_array($envelope)) {
            return null;
        }
        $r = Crypto::decryptRequest($envelope, $aad ?? Crypto::aadDaRequisicao(), $maxDepth);
        if ($r === null) {
            error_log('[R4 crypto] Decryption::decrypt recusou o pacote (' . Crypto::motivo() . ')');
            return null;
        }
        return $r['d'];
    }

    /**
     * Cifra $data como RESPOSTA para a sessão do cliente desta requisição ({v:2, z, x}).
     * Só existe sessão se o corpo do pedido veio cifrado (lido por Controller::getPost()).
     *
     * @param mixed $data
     * @return array|null
     */
    public static function encrypt($data)
    {
        return Controller::cifrar($data);
    }

    /**
     * Dados do POST (decifrados se vierem no envelope v2). Mesmo que Controller::getPost().
     *
     * @return array|null
     */
    public static function getDecryptedPost()
    {
        return Controller::getPost();
    }
}
