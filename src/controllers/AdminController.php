<?php

namespace src\controllers;

use core\Controller as ctrl;
use src\model\LoginModel;

class AdminController extends ctrl
{

    public function dashboard()
    {
        // Lógica para exibir o dashboard
        $this->render('admin/dashboard');
    }

    public function listUsers()
    {
        // Lógica para listar usuários
        $this->render('admin/users');
    }

    public function createUser()
    {
        // Lógica para criar um novo usuário
        $this->render('admin/create-user');
    }

}
