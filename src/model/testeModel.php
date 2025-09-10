<?php
namespace src\model;

use core\Database;
use Exception;
use PDO;
use core\Controller as ctrl;

class TesteModel {

    public function Logout() {
        try {

            ctrl::retorno(['message' => ''], 200);
        } catch (Exception $e) {
            ctrl::retorno(['error' => $e->getMessage()], 400);
        }
    }
}
