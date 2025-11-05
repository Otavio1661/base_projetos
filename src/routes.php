<?php

require_once __DIR__ . '/../core/RouterBase.php';
require_once __DIR__ . '/../core/Controller.php';
require_once __DIR__ . '/../core/Router.php';

$router = new \core\Router();

/**
 * ============================================
 * SISTEMA DE ROTAS - FRAMEWORK
 * ============================================
 * 
 * MÉTODOS DISPONÍVEIS:
 * @method get(string $route, string $controller, string $middleware = null)
 * @method post(string $route, string $controller, string $middleware = null)
 * @method put(string $route, string $controller, string $middleware = null)
 * @method delete(string $route, string $controller, string $middleware = null)
 * @method group(string $prefix, string $middleware, callable $callback)
 * 
 * PARÂMETROS:
 * @param string $route Rota/URI a ser registrada (ex: '/home', '/user/profile')
 * @param string $controller Nome do controller e método no formato 'Controller@method'
 * @param string $middleware (Opcional) Middleware a ser executado antes do controller no formato 'Middleware@method'
 * 
 * ============================================
 * EXEMPLOS DE USO:
 * ============================================
 */

/**
 * Rota simples sem middleware
 * @example $router->get('/exemplo', 'ExampleController@exampleMethod');
 * @description Resultado da rota: /exemplo (sem proteção de middleware)
 */
// $router->get('/exemplo', 'ExampleController@exampleMethod');

/**
 * Rota com middleware
 * @example $router->get('/exemplo', 'ExampleController@exampleMethod', 'ExampleMiddleware@handle');
 * @description Resultado da rota: /exemplo (com middleware ExampleMiddleware executado antes)
 */
// $router->get('/exemplo', 'ExampleController@exampleMethod', 'ExampleMiddleware@handle');

/**
 * Grupo de rotas protegidas com middleware
 * @example $router->group('/exemplo1', 'ExampleMiddleware@handle', function($router) {
 *     $router->get('/exemplo2', 'ExampleController@dashboard');
 * });
 * @description Resultado da rota protegida: /exemplo1/exemplo2
 * @description O middleware 'ExampleMiddleware@handle' será aplicado a todas as rotas do grupo
 */
// $router->group('/exemplo1', 'ExampleMiddleware@handle' , function($router) {
//     $router->get('/exemplo2', 'ExampleController@dashboard');
// });

/**
 * ============================================
 * ROTAS DA APLICAÇÃO
 * ============================================
*/

$router->group('/especiais', 'Especiais@handle' , function($router) {
    $router->get('/alert', 'Controller@alertErrorMini');
});

$router->get('/', 'HomeController@index');

$router->get('/home', 'HomeController@home');

return $router;
