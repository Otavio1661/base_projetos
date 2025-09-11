<?php

namespace src\controllers;

use core\Controller as ctrl;
use src\model\LoginModel;

class LoginController extends ctrl
{
    private $Model;

    public function __construct()
    {
        $this->Model = new LoginModel();
    }

}