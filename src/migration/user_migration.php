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

            Database::RunMigration([
                'users' => [
                    'id' => 'INT PRIMARY KEY AUTO_INCREMENT',
                    'login' => 'VARCHAR(50) NOT NULL',
                    'password' => 'VARCHAR(255) NOT NULL',
                    'created_at' => 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
                ]
            ]);
        } catch (Exception $e) {
            $db->rollBack();
            error_log("Migration failed: " . $e->getMessage());
        }
    }
}
