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
            throw new \Exception("View '{$view}' não encontrada em {$viewFile}");
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
