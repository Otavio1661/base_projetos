<?php

// Verifica se o nome da migration foi passado como argumento
if ($argc < 2) {
    echo "Erro: Nome da migration não foi fornecido.\n";
    exit(1);
}

// Pega o nome da migration do terminal (vira classe e caminho: só [A-Za-z][A-Za-z0-9_]*)
$migration = $argv[1];
if (!preg_match('/^[A-Za-z][A-Za-z0-9_]{0,63}$/', $migration)) {
    echo "Erro: nome inválido. Use apenas letras, números e _ (começando por letra).\n";
    exit(1);
}

// Nome da classe (ex: UserMigration)
$className = ucfirst($migration) . "Migration";

// Nome do arquivo de destino
$nomeArquivo = "src/Migration/{$className}.php";

// Cria o diretório se não existir
if (!file_exists("src/Migration")) {
    mkdir("src/Migration", 0755, true);
}

// Verifica se o arquivo já existe
if (file_exists($nomeArquivo)) {
    echo "O arquivo '{$nomeArquivo}' já existe. Nenhuma ação foi realizada.\n";
    exit(0);
}

// Conteúdo do arquivo da migration
$conteudo = <<<PHP
<?php

namespace App\\Migration;

use Core\\Database;

class {$className}
{
    public static function migrate()
    {
        \$db = Database::getInstance();
        try {
            // DDL (CREATE/ALTER) no MySQL faz commit implícito; a transação vale para os INSERTs.
            \$db->beginTransaction();

            // Exemplo de criação de tabela (SQL fixo, escrito por você — nunca com entrada do usuário)
            // \$db->exec('CREATE TABLE IF NOT EXISTS exemplo (id INT AUTO_INCREMENT PRIMARY KEY, nome VARCHAR(120) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');

            // Dados iniciais SEMPRE com prepare/bind:
            // \$st = \$db->prepare('INSERT INTO exemplo (nome) VALUES (:nome)');
            // \$st->execute([':nome' => 'Primeiro']);

            if (\$db->inTransaction()) {
                \$db->commit();
            }
        } catch (\\Throwable \$e) {
            if (\$db->inTransaction()) {
                \$db->rollBack();
            }
            error_log("Migration failed: " . \$e->getMessage());
        }
    }
}

PHP;

// Cria o arquivo com a estrutura padrão
$arquivo = fopen($nomeArquivo, "x");

if ($arquivo) {
    fwrite($arquivo, $conteudo);
    fclose($arquivo);
    echo "Arquivo '{$nomeArquivo}' criado com sucesso!\n";
} else {
    echo "Erro ao criar o arquivo.\n";
}

exit(0);
