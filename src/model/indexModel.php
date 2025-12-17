<?php
namespace src\model;

use core\Database;
use Exception;
use PDO;
use core\Controller as ctrl;

class IndexModel {

    public function example() {
        try {
            // Exemplo de chamada ao Database::switchParams
            // $info = Database::switchParams($params, 'seu_sql', true);

            ctrl::retorno(['message' => 'OK'], 200);
        } catch (Exception $e) {
            ctrl::retorno(['error' => $e->getMessage()], 400);
        }
    }
}
