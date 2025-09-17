<?php

namespace src\controllers;

use core\Controller as ctrl;
use src\model\HomeModel;
use tidy;

class HomeController extends ctrl
{
    private $Model;

    public function __construct()
    {
        $this->Model = new HomeModel();
    }

    public function home() {
        ctrl::render('Home', [
            'titulo' => 'Home',
        ]);
    }
}