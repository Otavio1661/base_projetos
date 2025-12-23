<?php
/**
 * ============================================
 * RouterBase.php
 * ============================================
 *
 * @author Otavio
 * @github https://github.com/Otavio1661
 * @version 1.0.0
 * @created 2025-12-23
 *
 * Implementa um roteador simples para registrar rotas
 * e despachar requisições para controllers e middlewares
 * definidos em `src/controllers` e `src/middleware`.
 *
 * Recursos principais:
 * - Registro com métodos HTTP (`get`, `post`, `put`, `delete`).
 * - Grupos de rotas com prefixo e middleware aplicado ao grupo.
 * - Suporte a arquivos SQL (via `core/Database::switchParams`) e
 *   visualização de erros em `Config::APP_DEBUG`.
 *
 * Observação:
 * - O roteador usa correspondência exata de caminho (`/minha/rota`).
 * - Para rotas com parâmetros dinâmicos é necessário adaptação.
 *
 * ============================================
 */

namespace core;

use src\Config;

class RouterBase
{
    /**
     * Lista interna de rotas registradas.
     * Cada rota é um array com chaves: method, route, controllerAction, middleware
     * @var array
     */
    private $routes = [];


    public function group($prefix, $middleware, $callback)
    {
        /**
         * Registra um grupo de rotas com um prefixo comum e middleware.
         *
         * - `$prefix`: string adicionada no início de cada rota do grupo.
         * - `$middleware`: controller@method a ser executado antes das rotas do grupo.
         * - `$callback`: função que recebe um sub-roteador para registrar rotas locais.
         *
         * O middleware do grupo é aplicado a todas as rotas registradas pelo callback.
         */
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
        // Registra rota GET simples: `$route` e `Controller@method`.
        $this->addRoute('GET', $route, $controllerAction, $middleware);
    }

    public function post($route, $controllerAction, $middleware = null)
    {
        // Registra rota POST simples: `$route` e `Controller@method`.
        $this->addRoute('POST', $route, $controllerAction, $middleware);
    }

    public function put($route, $controllerAction, $middleware = null)
    {
        // Registra rota PUT simples: `$route` e `Controller@method`.
        $this->addRoute('PUT', $route, $controllerAction, $middleware);
    }

    public function delete($route, $controllerAction, $middleware = null)
    {
        // Registra rota DELETE simples: `$route` e `Controller@method`.
        $this->addRoute('DELETE', $route, $controllerAction, $middleware);
    }

    private function addRoute($method, $route, $controllerAction, $middleware = null)
    {
        /**
         * Adiciona uma rota à lista interna.
         * - `$method`: verbo HTTP (GET, POST, ...)
         * - `$route`: caminho exato (ex: '/users')
         * - `$controllerAction`: 'Controller@method'
         * - `$middleware`: opcional 'MiddlewareController@method'
         */
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

        /**
         * Busca uma rota que corresponda exatamente à URI.
         * - Se encontrada e o método HTTP coincidir: executa middleware (se houver)
         *   e despacha para o controller.
         * - Se encontrada mas com método diferente: retorna 405 (Method Not Allowed).
         * - Se não encontrada: retorna 404.
         */
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
        /**
         * Despacha a requisição para o controller indicado.
         * - `$controllerAction`: string no formato 'Controller@method'.
         *
         * Fluxo:
         * 1. Resolve a classe em `src\controllers\Controller`.
         * 2. Verifica existência da classe e do método; em `APP_DEBUG`
         *    exibe erros detalhados e lança exceções para facilitar depuração.
         * 3. Caso contrário retorna 404 quando não encontrado.
         */
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

    /**
     * Despacha e executa um middleware.
     *
     * Espera `$middleware` no formato 'MiddlewareController@method'.
     * O método verifica existência da classe em `src\middleware` e do método
     * solicitado. Em `Config::APP_DEBUG` exibe mensagens detalhadas e lança
     * exceções para facilitar a depuração; em ambiente não-debug retorna
     * uma página 404.
     *
     * @param string $middleware
     * @return mixed
     */
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
