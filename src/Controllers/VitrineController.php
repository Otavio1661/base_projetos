<?php

namespace App\Controllers;

use Core\Controller as ctrl;

class VitrineController extends ctrl
{
    public function index()
    {
        ctrl::render('vitrine', [
            'titulo' => 'Vitrine r4.js',
        ]);
    }
}
