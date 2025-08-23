<?php

namespace src\controllers;

use core\Controller as ctrl;
use src\model\LoginModel;

class HomeController extends ctrl
{
    private $loginModel;

    public function __construct()
    {
        $this->loginModel = new LoginModel();
    }

}
