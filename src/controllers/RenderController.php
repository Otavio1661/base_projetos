<?php

namespace src\controllers;

use core\Controller as ctrl;

class RenderController extends ctrl
{
    public function home()
    {
        $this->render('home', [
            'title' => 'Home',
            'navhome' => true
        ]);
    }

    public function login()
    {
        $this->render('login', [
            'title' => 'Login'
        ]);
    }

}
