<?php

namespace src\model;

use core\DataBase;  

class HomeModel {
    // Model logic goes here

    public function getDadosHome() {

        $dados = DataBase::switchParams('', 'ddl', true, '', 0, true);
        return $dados['retorno'];
    }

}