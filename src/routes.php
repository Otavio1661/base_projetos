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
$router->post('/vitrine/api/echo-cifrado', 'VitrineApiController@echoCifrado');   // resposta cifrada (X-R4-Res: 1)
$router->post('/vitrine/api/cadastro', 'VitrineApiController@cadastro');
$router->get('/vitrine/api/lento', 'VitrineApiController@lento');
$router->get('/vitrine/api/falha', 'VitrineApiController@falha');
// demonstrações de defesa contra injeção (SQL, arquivo, prompt) — docs/SEGURANCA.md seção 13
$router->post('/vitrine/api/upload', 'VitrineApiController@upload');
$router->post('/vitrine/api/prompt', 'VitrineApiController@prompt');
$router->get('/vitrine/api/busca', 'VitrineApiController@busca');
$router->get('/vitrine/api/sql-seguro', 'VitrineApiController@sqlSeguro');

// ----------------------------------------------------------------------------------------------
// Mini ERP de demonstração (/erp): dados fictícios em JSON + SQLite. Ver docs/ERP.md
// Públicas: página de login e as rotas de login/cadastro. O resto exige sessão (middleware ErpAuth).
// ----------------------------------------------------------------------------------------------
$router->get('/erp/login', 'ErpController@login');
$router->post('/erp/api/login', 'ErpAuthController@login');
$router->post('/erp/api/cadastro', 'ErpAuthController@cadastro');
$router->get('/erp/api/avatar/ver', 'ErpAuthController@avatarVer');   // imagem de perfil (só <img>, content-type fixo)

$router->group('/erp', 'ErpAuth@handle', function ($r) {
    $r->get('', 'ErpController@app');
    $r->get('/api/eu', 'ErpAuthController@eu');
    $r->post('/api/logout', 'ErpAuthController@logout');
    $r->post('/api/perfil', 'ErpAuthController@perfil');
    $r->post('/api/avatar', 'ErpAuthController@avatar');
    $r->get('/api/dashboard', 'ErpController@dashboard');
    foreach (['clientes' => 'ErpClientesController', 'produtos' => 'ErpProdutosController', 'pedidos' => 'ErpPedidosController'] as $rec => $ctl) {
        $r->get("/api/$rec", "$ctl@listar");
        $r->get("/api/$rec/obter", "$ctl@obter");
        $r->get("/api/$rec/opcoes", "$ctl@opcoes");
        $r->post("/api/$rec/salvar", "$ctl@salvar");
        $r->post("/api/$rec/excluir", "$ctl@excluir");
    }
    $r->post('/api/clientes/importar', 'ErpClientesController@importar');
    $r->get('/api/transacoes', 'ErpTransacoesController@listar');
    $r->get('/api/transacoes/resumo', 'ErpTransacoesController@resumo');
});


return $router;
