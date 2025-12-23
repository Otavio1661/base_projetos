<?php
/**
 * ============================================
 * Controller.php
 * ============================================
 *
 * @author Otavio
 * @github https://github.com/Otavio1661
 * @version 1.0.0
 * @created 2025-12-23
 *
 * Classe base para controllers. Fornece utilitários comuns:
 * - `render($view, $data)`: renderiza views com layout padrão e partials;
 * - `json($data, $statusCode)`: responde JSON com código HTTP;
 * - `getPost()`: lê dados POST criptografados pelo frontend
 *    (integração com `src\utils\Decryption`);
 * - `retorno(...)`: padrão simples para retorno JSON com status.
 *
 * Observações de segurança e uso:
 * - `render` faz `extract($data)` para tornar variáveis disponíveis na view;
 *   evite expor dados sensíveis via variáveis extraídas.
 * - `getPost` espera payloads compatíveis com o esquema de criptografia do
 *   frontend (chaves 'x','y','z') ou JSON em claro.
 *
 * ============================================
 */

namespace core;

use src\utils\Decryption;

class Controller
{
    /**
     * Renderiza uma view PHP e a inclui em um layout padrão quando disponível.
     *
     * - `$view`: nome do arquivo de view em `src/view` (sem extensão `.php`).
     * - `$data`: array associativo cujas chaves serão extraídas como variáveis
     *   dentro da view (uso via `extract`).
     *
     * Fluxo:
     * 1. Resolve o caminho da view e verifica existência; em caso de falha lança
     *    uma exceção com mensagem amigável (útil em desenvolvimento).
     * 2. Faz buffer de saída (`ob_start`) para capturar o conteúdo da view.
     * 3. Se existir `src/view/layout.php` inclui o layout, caso contrário ecoa
     *    diretamente o conteúdo renderizado.
     *
     * @param string $view
     * @param array $data
     * @return void
     * @throws \Exception Quando a view não é encontrada
     */
    protected function render($view, $data = [])
    {

        $basePath = dirname(__DIR__);
        // Extrai as variáveis para uso na view
        extract($data);
        $base = $basePath;
        $partials = $basePath . '/src/view/partials/';

        // Caminho do arquivo de view
        $viewFile = __DIR__ . '/../src/view/' . $view . '.php';

        if (!file_exists($viewFile)) {
            $linha = __LINE__;
            $arquivo = str_replace(getcwd() . DIRECTORY_SEPARATOR, '', __FILE__);
            echo '<div style="margin:40px auto;max-width:600px;padding:30px;border-radius:12px;background:#fff3f3;color:#b71c1c;border:2px solid #f44336;font-family:Montserrat,Arial,sans-serif;box-shadow:0 2px 16px 0 rgba(244,67,54,0.10);text-align:center;">';
            echo '<h2 style="color:#f44336;margin-bottom:12px;">Erro: View não encontrada</h2>';
            echo '<p>A view <strong>' . htmlspecialchars($view) . '</strong> não foi localizada em:</p>';
            echo '<code style="background:#ffeaea;padding:6px 12px;border-radius:6px;display:inline-block;">' . htmlspecialchars($viewFile) . '</code>';
            echo '<br><code style="background:#ffeaea;padding:6px 12px;border-radius:6px;display:inline-block;margin-top:8px;">' . $arquivo . ' linha ' . $linha . '</code>';
            echo '<p>Verifique se o nome e o caminho da view estão corretos.</p>';
            echo '</div>';
            throw new \Exception("View '{$view}' não encontrada em {$viewFile}");
            exit;
        }

        // Buffer de saída para permitir incluir layouts
        ob_start();
        require $viewFile;
        $content = ob_get_clean();

        // Verifica se existe layout padrão
        $layoutFile = __DIR__ . '/../src/view/layout.php';
        if (file_exists($layoutFile)) {
            require $layoutFile;
        } else {
            echo $content;
        }
    }

    /**
     * Envia uma resposta JSON com o código HTTP informado e encerra a execução.
     *
     * @param mixed $data Dados a serem serializados em JSON
     * @param int $statusCode Código HTTP (padrão 200)
     * @return void
     */
    protected function json($data, $statusCode = 200)
    {
        http_response_code($statusCode);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data);
        exit;
    }

    /**
     * Lê os dados do POST e, se necessário, realiza a descriptografia.
     *
     * Retorna `null` quando o payload é inválido ou vazio.
     * Integra com `src\utils\Decryption::getDecryptedPost()` para suportar
     * payloads criptografados pelo frontend.
     *
     * @return array|null
     */
    public static function getPost(): ?array
    {
        header('Content-Type: application/json; charset=utf-8');
        $data = Decryption::getDecryptedPost();
         if (empty($data) || !is_array($data)) {
            return null;
        }
        return $data;
    }

    /**
     * Padrão simples para retorno JSON.
     *
     * - `$item`: conteúdo do retorno (pode ser string, array, objeto).
     * - `$status`: código HTTP a ser enviado.
     * - `$pure`: quando `true` imprime `$item` puro sem envelope JSON.
     *
     * Exemplo padrão quando `$pure` é `false`:
     * { "status": 200, "retorno": ... }
     *
     * @param mixed $item
     * @param int $status
     * @param bool $pure
     * @return void
     */
    public static function retorno($item, $status, $pure = false)
    {
        header('Content-Type: application/json; charset=utf-8');
        http_response_code($status);
        if ($pure == true) {
            echo $item;
        } else {
            echo json_encode([
                'status' => $status,
                'retorno' => $item
            ]);
        }
        die;
    }
}
