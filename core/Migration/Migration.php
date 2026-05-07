<?php

// Verifica se o nome da migration foi passado como argumento
if ($argc < 2) {
    echo "Erro: Nome da migration não foi fornecido.\n";
    exit(1);
}

// Pega o nome da migration do terminal
$migration = $argv[1];

// Nome da classe (ex: UserMigration)
$className = ucfirst($migration) . "Migration";

// Nome do arquivo de destino
$nomeArquivo = "src/Migration/{$className}.php";

// Cria o diretório se não existir
if (!file_exists("src/Migration")) {
    mkdir("src/Migration", 0777, true);
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
use Exception;

class {$className}
{
    public static function migrate()
    {
        try {
            \$db = Database::getInstance();
            \$db->beginTransaction();

            // Exemplo de criação de tabela
            \$query = "";
            \$db->exec(\$query);
            \$db->commit();
        } catch (Exception \$e) {
            \$db->rollBack();
            error_log("Migration failed: " . \$e->getMessage());
        }
    }
}

PHP;

// Cria o arquivo com a estrutura padrão
$arquivo = fopen($nomeArquivo, "a");

if ($arquivo) {
    fwrite($arquivo, $conteudo);
    fclose($arquivo);
    echo "Arquivo '{$nomeArquivo}' criado com sucesso!\n";
} else {
    echo "Erro ao criar o arquivo.\n";
}

exit(0);
