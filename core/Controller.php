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
 *    (integração com `App\Utils\Decryption`);
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

namespace Core;

use App\Config;
use App\Utils\Decryption;
use Core\Security\Input;

class Controller
{
    // (constantes privadas: não colidem com constantes de mesmo nome nos controllers filhos)
    /** Corpo máximo lido por getPost() (bytes). Ajuste com MAX_POST_BYTES no .env. */
    private const MAX_BODY = 2097152;   // 2 MB
    /** Profundidade máxima do JSON do corpo (objetos/arrays aninhados). */
    private const MAX_JSON_DEPTH = 32;

    /** Flags do json_encode das respostas: < > & ' " escapados e UTF-8 inválido substituído (nunca corpo vazio). */
    private const JSON_FLAGS = JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE;

    /** Por que o último getPost() devolveu null: 0 (ok/vazio), 400 (JSON inválido/profundo), 413 (grande demais). */
    public static int $postErro = 0;
    private static ?array $postCache = null;
    private static bool $postLido = false;

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
        $base = $basePath;
        $partials = $basePath . '/src/view/partials/';

        // Nome da view vira caminho de arquivo incluído: só letras/números/_/-/ (subpasta), nunca "..".
        // (Impede inclusão de arquivo local se um dia o nome vier de entrada do usuário.)
        $viewOk = is_string($view) && preg_match('#^[A-Za-z0-9_\-]+(/[A-Za-z0-9_\-]+)*$#', $view) === 1;

        // Caminho do arquivo de view
        $viewFile = __DIR__ . '/../src/view/' . ($viewOk ? $view : '__invalida__') . '.php';

        if (!$viewOk || !is_file($viewFile)) {
            if (Config::APP_DEBUG !== true) {
                // produção: sem caminhos do servidor na tela
                error_log('[Controller] view não encontrada: ' . (is_string($view) ? $view : gettype($view)));
                http_response_code(500);
                echo '<h1>Erro interno</h1>';
                throw new \Exception('View não encontrada');
            }
            $linha = __LINE__;
            $arquivo = str_replace(getcwd() . DIRECTORY_SEPARATOR, '', __FILE__);
            echo '<div style="margin:40px auto;max-width:600px;padding:30px;border-radius:12px;background:#fff3f3;color:#b71c1c;border:2px solid #f44336;font-family:Montserrat,Arial,sans-serif;box-shadow:0 2px 16px 0 rgba(244,67,54,0.10);text-align:center;">';
            echo '<h2 style="color:#f44336;margin-bottom:12px;">Erro: View não encontrada</h2>';
            echo '<p>A view <strong>' . htmlspecialchars((string) (is_scalar($view) ? $view : gettype($view))) . '</strong> não foi localizada em:</p>';
            echo '<code style="background:#ffeaea;padding:6px 12px;border-radius:6px;display:inline-block;">' . htmlspecialchars($viewFile) . '</code>';
            echo '<br><code style="background:#ffeaea;padding:6px 12px;border-radius:6px;display:inline-block;margin-top:8px;">' . htmlspecialchars($arquivo) . ' linha ' . $linha . '</code>';
            echo '<p>Verifique se o nome e o caminho da view estão corretos.</p>';
            echo '</div>';
            throw new \Exception("View não encontrada: " . (is_scalar($view) ? $view : gettype($view)));
        }

        // Extrai as variáveis para uso na view. EXTR_SKIP: uma chave de $data nunca sobrescreve
        // $viewFile/$view/$base... (com extract() comum, render('x', $_GET) permitiria ?viewFile=...).
        if (is_array($data)) {
            extract($data, EXTR_SKIP);
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
        header('X-Content-Type-Options: nosniff');
        echo json_encode($data, self::JSON_FLAGS);
        exit;
    }

    /**
     * Lê os dados do POST e, se necessário, realiza a descriptografia.
     *
     * Retorna `null` quando o payload é inválido ou vazio.
     * Integra com `App\Utils\Decryption` para suportar payloads criptografados pelo frontend.
     *
     * Limites (proteção contra corpo gigante e JSON aninhado demais):
     *  - corpo acima de MAX_BODY (2 MB; ou MAX_POST_BYTES no .env) → null e Controller::$postErro = 413;
     *  - JSON inválido ou com profundidade > MAX_JSON_DEPTH (32) → null e $postErro = 400.
     * O resultado é guardado: chamar getPost() de novo não relê nem redecifra o corpo.
     *
     * @return array|null
     */
    public static function getPost(): ?array
    {
        header('Content-Type: application/json; charset=utf-8');
        if (self::$postLido) {
            return self::$postCache;
        }
        self::$postLido = true;
        self::$postErro = 0;
        $max = defined('MAX_POST_BYTES') && (int) constant('MAX_POST_BYTES') > 0 ? (int) constant('MAX_POST_BYTES') : self::MAX_BODY;

        if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > $max) {
            self::$postErro = 413;
            return null;
        }
        $input = file_get_contents('php://input', false, null, 0, $max + 1);
        if ($input === false || $input === '') {
            return null;
        }
        if (strlen($input) > $max) {
            self::$postErro = 413;
            return null;
        }
        $data = json_decode($input, true, self::MAX_JSON_DEPTH);
        if (!is_array($data)) {
            self::$postErro = 400;
            return null;
        }
        // Pacote criptografado {x,y,z}
        if (isset($data['x'], $data['y'], $data['z'])) {
            $data = Decryption::decrypt($data, self::MAX_JSON_DEPTH);
            if (!is_array($data)) {
                self::$postErro = 400;
                return null;
            }
        }
        if (empty($data)) {
            return null;
        }
        return self::$postCache = $data;
    }

    /**
     * Valida o corpo do POST com um esquema (Core\Security\Input::validate) e devolve os dados limpos.
     * Se for inválido, responde 422 e encerra:
     *   { "status": 422, "retorno": "Dados inválidos", "erros": { "campo": "mensagem" } }
     * Corpo grande demais → 413; JSON quebrado/profundo demais → 400.
     *
     *   $d = ctrl::validate([
     *       'nome'  => ['type' => 'string', 'required' => true, 'maxLength' => 120],
     *       'email' => ['type' => 'email', 'required' => true],
     *   ]);
     *   // $d['nome'], $d['email'] já normalizados; campos não declarados foram recusados.
     *
     * @param array $regras esquema (veja Core\Security\Input)
     * @param array $opts   ['extras' => 'ignorar'] para descartar (em vez de recusar) campos extras
     * @return array dados validados
     */
    public static function validate(array $regras, array $opts = []): array
    {
        $dados = self::getPost();
        if (self::$postErro === 413) {
            self::retorno('Corpo da requisição grande demais', 413);
        }
        if (self::$postErro === 400) {
            self::responder(['status' => 400, 'retorno' => 'JSON inválido', 'erros' => ['_' => 'Corpo da requisição inválido.']], 400);
        }
        $r = Input::validate($dados, $regras, $opts);
        if (!$r['valido']) {
            self::responder(['status' => 422, 'retorno' => 'Dados inválidos', 'erros' => $r['erros']], 422);
        }
        return $r['dados'];
    }

    /** JSON com as flags seguras, código HTTP e fim da execução. */
    public static function responder($data, int $status = 200): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('X-Content-Type-Options: nosniff');
        echo json_encode($data, self::JSON_FLAGS);
        exit;
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
        header('X-Content-Type-Options: nosniff');
        if ($pure == true) {
            echo $item;
        } else {
            echo json_encode([
                'status' => $status,
                'retorno' => $item
            ], self::JSON_FLAGS);
        }
        die;
    }
}
