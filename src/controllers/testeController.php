<?php

namespace src\controllers;

use core\Controller as ctrl;
use src\model\Model;

class TesteController extends ctrl
{
    private $Model;

    public function __construct()
    {
        $this->Model = new Model();
    }

}

