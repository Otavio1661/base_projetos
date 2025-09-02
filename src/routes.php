<?php

require_once __DIR__ . '/../core/RouterBase.php';
require_once __DIR__ . '/../core/Controller.php';
require_once __DIR__ . '/../core/Router.php';

$router = new \core\Router();

// obs. O middleware opcional, e será executado antes do controlador
// Registra rotas: metodo ( get/post ), rota, controller@metodo, middleware@metodo

$router->get('/home', 'RenderController@home');
$router->get('/menu', 'RenderController@menu', 'AuthMiddleware@handle');
$router->get('/login', 'RenderController@login');
$router->get('/getuser', 'HomeController@getUser');
$router->post('/postlogin', 'LoginController@loginPost');
$router->post('/logout', [], 'AuthMiddleware@Logout');

return $router;

