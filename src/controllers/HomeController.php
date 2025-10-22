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

    public function index() {
        ctrl::render('Home', [
            'titulo' => 'Home',
        ]);
    }

    public function home() {

        $dados = $this->Model->getDadosHome();

        ctrl::render('Home', [
            'titulo' => 'Home',
        ]);
    }
}