<?php

namespace core;

class Controller
{
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

    protected function json($data, $statusCode = 200)
    {
        http_response_code($statusCode);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data);
        exit;
    }

    public static function getPost(): ?array
    {
        header('Content-Type: application/json; charset=utf-8');
        $body = file_get_contents('php://input');
        return json_decode($body, true);
    }

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
