<?php

// Verifica se o nome do middleware foi passado como argumento
if ($argc < 2) {
    echo "Erro: Nome do middleware não foi fornecido.\n";
    exit(1);
}
// Pega o nome do middleware do terminal
$middleware = $argv[1];

// Nome da classe (ex: UserMiddleware)
$className = ucfirst($middleware) . "Middleware";

// Nome do arquivo de destino
$nomeArquivo = "src/Middleware/{$className}.php";

// Cria o diretório se não existir
if (!file_exists("src/Middleware")) {
    mkdir("src/Middleware", 0777, true);
}

// Verifica se o arquivo já existe
if (file_exists($nomeArquivo)) {
    echo "O arquivo '{$nomeArquivo}' já existe. Nenhuma ação foi realizada.\n";
    exit(0);
}

// Conteúdo do arquivo da migration
$conteudo = <<<PHP
<?php
namespace App\\Middleware;

use Core\\Controller as ctrl;
use Exception;

class {$className}
{
    public function logout()
    {
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
