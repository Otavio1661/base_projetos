<?php

namespace src\controllers;

use core\Controller as ctrl;

class RenderController extends ctrl
{
    public function home()
    {
        $this->render('home', [
            'title' => 'Home',
            'navlogin' => false
        ]);
    }

    public function login()
    {
        $this->render('login', [
            'title' => 'Login',
            'navlogin' => true
        ]);
    }

    public function menu()
    {
        $this->render('menu', [
            'title' => 'Menu',
            'navlogin' => true
        ]);
    }

}
