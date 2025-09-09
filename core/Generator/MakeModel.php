<?php

// Verifica se o nome do model foi passado como argumento
if ($argc < 2) {
    echo "Erro: Nome do model não foi fornecido.\n";
    exit(1);
}
// Pega o nome do model do terminal
$model = $argv[1];

// Nome do arquivo de destino
$nomeArquivo = "src/model/{$model}Model.php";

// Nome da classe (ex: UserController)
$className = ucfirst($model) . "Model";

// Cria o diretório se não existir
if (!file_exists("src/model")) {
    mkdir("src/model", 0777, true);
}

// Verifica se o arquivo já existe
if (file_exists($nomeArquivo)) {
    echo "O arquivo '{$nomeArquivo}' já existe. Nenhuma ação foi realizada.\n";
    exit(0);
}

// Conteúdo do arquivo da migration
$conteudo = <<<PHP
<?php
namespace src\model;

use core\Database;
use Exception;
use PDO;
use core\Controller as ctrl;

class {$className} {

    public function Logout() {
        try {

            ctrl::retorno(['message' => ''], 200);
        } catch (Exception \$e) {
            ctrl::retorno(['error' => \$e->getMessage()], 400);
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