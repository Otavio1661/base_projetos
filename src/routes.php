<?php

require_once __DIR__ . '/../core/RouterBase.php';
require_once __DIR__ . '/../core/Controller.php';
require_once __DIR__ . '/../core/Router.php';

$router = new \core\Router();

// obs. O middleware opcional, e será executado antes do controlador
// Registra rotas: metodo ( get/post ), rota, controller@metodo, middleware@metodo

// $router->get('/exemplo', 'ExampleController@exampleMethod'); ---> resultado da rota /exemplo sem middleware

// $router->get('/exemplo', 'ExampleController@exampleMethod', 'ExampleMiddleware@handle'); ---> resultado da rota /exemplo com middleware

// $router->group('/exemplo1', 'ExampleMiddleware@handle' , function($router) {           ---> exemplo rota protegida
//     $router->get('/exemplo2', 'ExampleController@dashboard'); ---> resultado da rota protegida /exemplo1/exemplo2
// });


return $router;

