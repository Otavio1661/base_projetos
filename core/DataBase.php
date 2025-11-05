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
                    Config::DB_HOST_LG.":host=" . Config::DB_HOST . ";port=" . Config::DB_PORT . ";dbname=" . Config::DB_DATABASE . ";charset=utf8",
                    Config::DB_USERNAME,
                    Config::DB_PASSWORD,
                    [
                        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                        PDO::ATTR_EMULATE_PREPARES   => false
                    ]
                );
            } catch (PDOException $e) {
                            $linha = __LINE__;
            $arquivo = str_replace(getcwd() . DIRECTORY_SEPARATOR, '', __FILE__);
            echo '<div style="margin:40px auto;max-width:600px;padding:30px;border-radius:12px;background:#fff3f3;color:#b71c1c;border:2px solid #f44336;font-family:Montserrat,Arial,sans-serif;box-shadow:0 2px 16px 0 rgba(244,67,54,0.10);text-align:center;">';
            echo '<h2 style="color:#f44336;margin-bottom:12px;">Erro de conexão com o banco: </h2>';
            echo '<h4>Verifique: </h4>';
            echo '<p>' . $e->getMessage() . '</p>';
            echo '<p style="text-align:justify"><strong>'
                . Config::DB_HOST_LG . ":DB_HOST=" . Config::DB_HOST
                . ";<br>DB_PORT=" . Config::DB_PORT
                . ";<br>DB_DATABASE=" . Config::DB_DATABASE
                . ";<br>DB_USERNAME:" . Config::DB_USERNAME
                . ";<br>DB_PASSWORD:" . Config::DB_PASSWORD.';'
                . '</strong></p>';
            echo '<code style="background:#ffeaea;padding:6px 12px;border-radius:6px;display:inline-block;">' . htmlspecialchars('.env') . '</code>';
            echo '<br><code style="background:#ffeaea;padding:6px 12px;border-radius:6px;display:inline-block;margin-top:8px;">' . htmlspecialchars('core/Database.php') . ' linha ' . $linha . '</code>';
            echo '<p>Verifique se as credenciais estão corretas.</p>';
            echo '</div>';
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



        // // Converte campos de texto para UTF-8 antes de salvar
        // if (isset($AddLocal['nome'])) {
        //     // Se vier em ISO-8859-1 (Latin1), converte para UTF-8
        //     if (!mb_check_encoding($AddLocal['nome'], 'UTF-8')) {
        //         $AddLocal['nome'] = mb_convert_encoding($AddLocal['nome'], 'UTF-8', 'ISO-8859-1');
        //     }
        // }
        // if (isset($AddLocal['descricao'])) {
        //     if (!mb_check_encoding($AddLocal['descricao'], 'UTF-8')) {
        //         $AddLocal['descricao'] = mb_convert_encoding($AddLocal['descricao'], 'UTF-8', 'ISO-8859-1');
        //     }
        // }