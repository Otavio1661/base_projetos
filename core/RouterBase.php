<?php

namespace core;

class RouterBase
{
    private $routes = [];

    public function get($route, $controllerAction)
    {
        $this->addRoute('GET', $route, $controllerAction);
    }

    public function post($route, $controllerAction)
    {
        $this->addRoute('POST', $route, $controllerAction);
    }

    public function put($route, $controllerAction)
    {
        $this->addRoute('PUT', $route, $controllerAction);
    }

    public function delete($route, $controllerAction)
    {
        $this->addRoute('DELETE', $route, $controllerAction);
    }

    private function addRoute($method, $route, $controllerAction)
    {
        $this->routes[] = [
            'method' => $method,
            'route' => $route,
            'controllerAction' => $controllerAction
        ];
    }

    public function run()
    {
        $method = $_SERVER['REQUEST_METHOD'];

        // Pega a URI real
        $uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

        // Remove a barra no final, se houver
        $uri = '/' . trim($uri, '/');

        // Compara cada rota registrada
        foreach ($this->routes as $r) {
            if ($r['method'] === $method && $r['route'] === $uri) {
                return $this->dispatch($r['controllerAction']);
            }
        }

        http_response_code(404);
        include(__DIR__ . '/../public/erro404.php');
    }


    private function dispatch($controllerAction)
    {
        list($controller, $method) = explode('@', $controllerAction);

        $controllerClass = "src\\controllers\\{$controller}";

        if (!class_exists($controllerClass)) {
            throw new \Exception("Controller {$controllerClass} não encontrado");
        }

        $instance = new $controllerClass();

        if (!method_exists($instance, $method)) {
            throw new \Exception("Método {$method} não encontrado em {$controllerClass}");
        }

        return call_user_func([$instance, $method]);
    }
}
