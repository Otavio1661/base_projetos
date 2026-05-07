<?php

namespace App\Controllers;

use App\Model\IndexModel;
use Core\Controller as ctrl;

class IndexController extends ctrl
{
    private IndexModel $indexModel;

    public function __construct()
    {
        $this->indexModel = new IndexModel();
    }

    public function index()
    {
        header('Location: /login');
        exit;
    }

    public function login()
    {
        ctrl::render('index', [
            'titulo' => 'index',
        ]);
    }

    public function sobre()
    {
        ctrl::render('sobre', [
            'titulo' => 'Sobre',
        ]);
    }

    public function servicos()
    {
        ctrl::render('servicos', [
            'titulo' => 'Serviços',
        ]);
    }

    public function contato()
    {
        ctrl::render('contato', [
            'titulo' => 'Contato',
        ]);
    }
}
