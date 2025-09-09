<?php

require_once __DIR__ . '/../core/RouterBase.php';
require_once __DIR__ . '/../core/Controller.php';
require_once __DIR__ . '/../core/Router.php';

$router = new \core\Router();

// obs. O middleware opcional, e será executado antes do controlador
// Registra rotas: metodo ( get/post ), rota, controller@metodo, middleware@metodo

$router->get('/home', 'RenderController@home');
$router->get('/login', 'RenderController@login');
$router->get('/getuser', 'HomeController@getUser');
$router->post('/postlogin', 'LoginController@loginPost');
$router->post('/logout', [], 'AuthMiddleware@Logout');

$router->group('/admin', 'AuthMiddleware@handle' , function($router) {
    $router->get('/menu', 'RenderController@menu');
    $router->get('/dashboard', 'AdminController@dashboard');
    $router->get('/users', 'AdminController@listUsers');
    $router->post('/create-user', 'AdminController@createUser');
});

return $router;

