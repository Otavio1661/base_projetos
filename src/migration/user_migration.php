<?php

namespace src\migration;

use core\Database;
use Exception;

class UserMigration
{
    public static function migrate()
    {
        try {
            $db = Database::getInstance();
            $db->beginTransaction();

            // Exemplo de criação de tabela
            $query = "";
            $db->exec($query);
            $db->commit();
        } catch (Exception $e) {
            $db->rollBack();
            error_log("Migration failed: " . $e->getMessage());
        }
    }
}
