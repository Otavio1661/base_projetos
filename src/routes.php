<?php

use Core\Router;

$router = new Router();

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
$router->get('/', 'VitrineController@index');
$router->get('/vitrine', 'VitrineController@index');
$router->get('/vitrine/testes', 'VitrineController@testes');   // testes automatizados da libr4 (rodam no navegador; só APP_DEBUG)

// API de teste da vitrine (só com APP_DEBUG=true)
$router->get('/vitrine/api/clientes', 'VitrineApiController@clientes');
$router->post('/vitrine/api/echo', 'VitrineApiController@echo');
$router->post('/vitrine/api/cadastro', 'VitrineApiController@cadastro');
$router->get('/vitrine/api/lento', 'VitrineApiController@lento');
$router->get('/vitrine/api/falha', 'VitrineApiController@falha');
// demonstrações de defesa contra injeção (SQL, arquivo, prompt) — docs/SEGURANCA.md seção 13
$router->post('/vitrine/api/upload', 'VitrineApiController@upload');
$router->post('/vitrine/api/prompt', 'VitrineApiController@prompt');
$router->get('/vitrine/api/busca', 'VitrineApiController@busca');
$router->get('/vitrine/api/sql-seguro', 'VitrineApiController@sqlSeguro');


return $router;
