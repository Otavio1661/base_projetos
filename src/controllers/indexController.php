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

    public function index1() {
        header('Location: /index');        
    }
    public function index() {
        ctrl::render('index', [
            'titulo' => 'index',
        ]);
    }

    public function login() {
        $data = ctrl::getPost();

        $dataDecrypted = Decryption::decrypt($data);

        

       print_r($dataDecrypted); die; 
    }

}
