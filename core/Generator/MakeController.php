<?php

// Verifica se o nome do controller foi passado como argumento
if ($argc < 2) {
    echo "Erro: Nome do controller não foi fornecido.\n";
    exit(1);
}

// Pega o nome do controller do terminal
$controller = $argv[1];

// Nome da classe (ex: UserController)
$className = ucfirst($controller) . "Controller";

// Nome do arquivo de destino
$nomeArquivo = "src/Controllers/{$className}.php";

// Cria o diretório se não existir
if (!file_exists("src/Controllers")) {
    mkdir("src/Controllers", 0777, true);
}

// Verifica se o arquivo já existe
if (file_exists($nomeArquivo)) {
    echo "O arquivo '{$nomeArquivo}' já existe. Nenhuma ação foi realizada.\n";
    exit(0);
}

// Conteúdo do arquivo da migration
$conteudo = <<<PHP
<?php

namespace App\\Controllers;

use App\\Model\\Model;
use Core\\Controller as ctrl;

class {$className} extends ctrl
{
    private \$model;

    public function __construct()
    {
        \$this->model = new Model();
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
