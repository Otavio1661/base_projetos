<?php
namespace core;

use src\Config;
use PDO;
use PDOException;

class Database
{
    private static $instance = null;

    private function __construct() { }
    private function __clone() { }
    public function __wakeup() { }

    /**
     * Retorna a instância única do PDO
     */
    public static function getInstance()
    {
        if (self::$instance === null) {
            try {
                self::$instance = new PDO(
                    "mysql:host=" . Config::DB_HOST . ";port=" . Config::DB_PORT . ";dbname=" . Config::DB_DATABASE . ";charset=utf8",
                    Config::DB_USERNAME,
                    Config::DB_PASSWORD,
                    [
                        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                        PDO::ATTR_EMULATE_PREPARES   => false
                    ]
                );
            } catch (PDOException $e) {
                throw new \Exception("Erro de conexão com o banco: " . $e->getMessage());
            }
        }
        return self::$instance;
    }

    /**
     * Executa SQL com parâmetros e modo transação manual ou automático
     */
    public static function switchParams(
        $params,
        $sqlnome,
        $exec = false,
        $sqlPrm = '',
        $asObject = 0,
        $transacao = true
    ) {
        $sqlFile = $sqlPrm !== '' ? $sqlPrm : __DIR__ . '/../src/sql/' . $sqlnome . '.sql';

        if (!file_exists($sqlFile)) {
            throw new \Exception("Arquivo SQL não encontrado: {$sqlFile}");
        }

        $sql = file_get_contents($sqlFile);
        $res = ['retorno' => false, 'error' => false];
        $pdo = null;

        try {
            $pdo = self::getInstance();

            if ($exec) {
                if ($transacao) $pdo->beginTransaction();

                $stmt = $pdo->prepare($sql);

                if (is_array($params)) {
                    foreach ($params as $nome => $valor) {
                        $stmt->bindValue(':' . $nome, $valor);
                    }
                }

                $stmt->execute();

                $res['retorno'] = $asObject == 1
                    ? $stmt->fetchObject()
                    : $stmt->fetchAll(PDO::FETCH_ASSOC);

                if ($transacao) $pdo->commit();
            } else {
                $res['retorno'] = $sql;
            }

        } catch (\Exception $e) {
            if ($pdo instanceof PDO && $transacao) {
                $pdo->rollBack();
            }
            $res['error'] = $e->getMessage();
        }

        return $res;
    }
    /**
     * Executa migrações para criar tabelas se não existirem
    */
    public static function RunMigration($tables)
    {
        $pdo = self::getInstance();
        foreach ($tables as $tableName => $columns) {
            $cols = [];
            foreach ($columns as $colName => $colType) {
                $cols[] = "`$colName` $colType";
            }
            $colsSql = implode(", ", $cols);
            $sql = "CREATE TABLE IF NOT EXISTS `$tableName` ($colsSql) ENGINE=InnoDB DEFAULT CHARSET=utf8;";
            $pdo->exec($sql);
        }
    }

}
