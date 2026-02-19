<?php

namespace src\controllers;

use core\Controller as ctrl;
use src\model\IndexModel;
use src\utils\Decryption;

class IndexController extends ctrl
{
    private $IndexModel;

    public function __construct()
    {
        $this->IndexModel = new IndexModel();
    }

    public function index() {
        header("Location: /login");
        exit;    
    }

    public function login() {
        ctrl::render('index', [
            'titulo' => 'index',
        ]);
    }

    public function sobre() {
        ctrl::render('sobre', [
            'titulo' => 'Sobre',
        ]);
    }

    public function servicos() {
        ctrl::render('servicos', [
            'titulo' => 'Serviços',
        ]);
    }

    public function contato() {
        ctrl::render('contato', [
            'titulo' => 'Contato',
        ]);
    }
}