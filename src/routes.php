<?php

require_once __DIR__ . '/../core/RouterBase.php';
require_once __DIR__ . '/../core/Controller.php';
require_once __DIR__ . '/../core/Router.php';

$router = new \core\Router();

// Registra rotas: metodo + caminho + controlador + acao

$router->get('/home', 'RenderController@home');
$router->get('/login', 'RenderController@login');
$router->get('/getuser', 'HomeController@getUser');
$router->post('/postlogin', 'LoginController@loginPost');


return $router;

