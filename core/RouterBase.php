<?php

namespace core;

use src\Config;

class RouterBase
{
    private $routes = [];

    public function group($prefix, $middleware, $callback)
    {
        $subRouter = new self();
        $callback($subRouter);
        foreach ($subRouter->routes as $route) {
            $this->addRoute(
                $route['method'],
                $prefix . $route['route'],
                $route['controllerAction'],
                $middleware // Aplica o middleware do grupo
            );
        }
    }

    public function get($route, $controllerAction, $middleware = null)
    {
        $this->addRoute('GET', $route, $controllerAction, $middleware);
    }

    public function post($route, $controllerAction, $middleware = null)
    {
        $this->addRoute('POST', $route, $controllerAction, $middleware);
    }

    public function put($route, $controllerAction, $middleware = null)
    {
        $this->addRoute('PUT', $route, $controllerAction, $middleware);
    }

    public function delete($route, $controllerAction, $middleware = null)
    {
        $this->addRoute('DELETE', $route, $controllerAction, $middleware);
    }

    private function addRoute($method, $route, $controllerAction, $middleware = null)
    {
        $this->routes[] = [
            'method' => $method,
            'route' => $route,
            'controllerAction' => $controllerAction,
            'middleware' => $middleware
        ];
    }

    public function run()
    {
        $method = $_SERVER['REQUEST_METHOD'];

        // Pega a URI real
        $uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

        // Remove a barra no final, se houver
        $uri = '/' . trim($uri, '/');

        $rotaEncontrada = false;

        // Compara cada rota registrada
        foreach ($this->routes as $r) {
            // Se a rota corresponde à URI
            if ($r['route'] === $uri) {
                $rotaEncontrada = true;

                // Se o método também corresponde
                if ($r['method'] === $method) {
                    if ($r['middleware'] !== null) {
                        $this->dispatchMiddleware($r['middleware']);
                    }
                    return $this->dispatch($r['controllerAction']);
                }
            }
        }

        // Se a rota foi encontrada mas o método é diferente
        if ($rotaEncontrada) {
            http_response_code(405);
            include(__DIR__ . '/../public/erro405.php');
            return;
        }

        // Se nem a rota foi encontrada
        http_response_code(404);
        include(__DIR__ . '/../public/erro404.php');
    }


    private function dispatch($controllerAction)
    {
        list($controller, $method) = explode('@', $controllerAction);

        $controllerClass = "src\\controllers\\{$controller}";

        if (!class_exists($controllerClass)) {
            if (Config::APP_DEBUG === true) {
                $linha = __LINE__;
                $arquivo = str_replace(getcwd() . DIRECTORY_SEPARATOR, '', __FILE__);
                echo '<div style="margin:40px auto;max-width:600px;padding:30px;border-radius:12px;background:#fff3f3;color:#b71c1c;border:2px solid #f44336;font-family:Montserrat,Arial,sans-serif;box-shadow:0 2px 16px 0 rgba(244,67,54,0.10);text-align:center;">';
                echo '<h2 style="color:#f44336;margin-bottom:12px;">Erro: Controller não encontrado</h2>';
                echo '<p>O controller <strong>' . htmlspecialchars($controllerClass) . '</strong> não foi localizado.</p>';
                echo '<code style="background:#ffeaea;padding:6px 12px;border-radius:6px;display:inline-block;">' . $arquivo . ' linha ' . $linha . '</code>';
                echo '<p>Verifique se o nome e o caminho do controller estão corretos.</p>';
                echo '</div>';
                throw new \Exception("Controller {$controllerClass} não encontrado");
            } else {
                http_response_code(404);
                include(__DIR__ . '/../public/erro404.php');
            }
            exit;
        }

        $instance = new $controllerClass();

        if (!method_exists($instance, $method)) {
            if (Config::APP_DEBUG === true) {
                $linha = __LINE__;
                $arquivo = str_replace(getcwd() . DIRECTORY_SEPARATOR, '', __FILE__);
                echo '<div style="margin:40px auto;max-width:600px;padding:30px;border-radius:12px;background:#fff3f3;color:#b71c1c;border:2px solid #f44336;font-family:Montserrat,Arial,sans-serif;box-shadow:0 2px 16px 0 rgba(244,67,54,0.10);text-align:center;">';
                echo "<h6 style=\"color:#f44336;margin-bottom:12px;\">Método = public function " . htmlspecialchars($method) . "(){}";
                echo '<h2 style="color:#f44336;margin-bottom:12px;">Erro: Método não encontrado</h2>';
                echo '<p>O método <strong>' . htmlspecialchars($method) . '</strong> não foi localizado em <strong>' . htmlspecialchars($controllerClass) . '</strong>.</p>';
                echo '<code style="background:#ffeaea;padding:6px 12px;border-radius:6px;display:inline-block;">' . $arquivo . ' linha ' . $linha . '</code>';
                echo '<p>Verifique se o nome do método está correto e se ele existe no controller.</p>';
                echo '</div>';
                throw new \Exception("Método {$method} não encontrado em {$controllerClass}");
            } else {
                http_response_code(404);
                include(__DIR__ . '/../public/erro404.php');
            }
            exit;
        }

        return call_user_func([$instance, $method]);
    }

    private function dispatchMiddleware($middleware)
    {
        list($controller, $method) = explode('@', $middleware);

        $controllerClass = "src\\middleware\\{$controller}";

        if (!class_exists($controllerClass)) {
            if (Config::APP_DEBUG === true) {
                $linha = __LINE__;
                $arquivo = str_replace(getcwd() . DIRECTORY_SEPARATOR, '', __FILE__);
                echo '<div style="margin:40px auto;max-width:600px;padding:30px;border-radius:12px;background:#fff3f3;color:#b71c1c;border:2px solid #f44336;font-family:Montserrat,Arial,sans-serif;box-shadow:0 2px 16px 0 rgba(244,67,54,0.10);text-align:center;">';
                echo '<h2 style="color:#f44336;margin-bottom:12px;">Erro: Middleware não encontrado</h2>';
                echo '<p>O middleware <strong>' . htmlspecialchars($controllerClass) . '</strong> não foi localizado.</p>';
                echo '<code style="background:#ffeaea;padding:6px 12px;border-radius:6px;display:inline-block;">' . $arquivo . ' linha ' . $linha . '</code>';
                echo '<p>Verifique se o nome e o caminho do middleware estão corretos.</p>';
                echo '</div>';
                throw new \Exception("middleware {$controllerClass} não encontrado");
            } else {
                http_response_code(404);
                include(__DIR__ . '/../public/erro404.php');
            }
            exit;
        }

        $instance = new $controllerClass();

        if (!method_exists($instance, $method)) {
            if (Config::APP_DEBUG === true) {
                $linha = __LINE__;
                $arquivo = str_replace(getcwd() . DIRECTORY_SEPARATOR, '', __FILE__);
                echo '<div style="margin:40px auto;max-width:600px;padding:30px;border-radius:12px;background:#fff3f3;color:#b71c1c;border:2px solid #f44336;font-family:Montserrat,Arial,sans-serif;box-shadow:0 2px 16px 0 rgba(244,67,54,0.10);text-align:center;">';
                echo "<h6 style=\"color:#f44336;margin-bottom:12px;\">Método = public function " . htmlspecialchars($method) . "(){}</h6>";
                echo '<h2 style="color:#f44336;margin-bottom:12px;">Erro: Método não encontrado</h2>';
                echo '<p>O método <strong>' . htmlspecialchars($method) . '</strong> não foi localizado em <strong>' . htmlspecialchars($controllerClass) . '</strong>.</p>';
                echo '<code style="background:#ffeaea;padding:6px 12px;border-radius:6px;display:inline-block;">' . $arquivo . ' linha ' . $linha . '</code>';
                echo '<p>Verifique se o nome do método está correto e se ele existe no middleware.</p>';
                echo '</div>';
                throw new \Exception("Método {$method} não encontrado em {$controllerClass}");
            } else {
                http_response_code(404);
                include(__DIR__ . '/../public/erro404.php');
            }
            exit;
        }

        return call_user_func([$instance, $method]);
    }
}
