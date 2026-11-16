<?php

// Verifica se o nome do middleware foi passado como argumento
if ($argc < 2) {
    echo "Erro: Nome do middleware não foi fornecido.\n";
    exit(1);
}
// Pega o nome do middleware do terminal (vira classe e caminho: só [A-Za-z][A-Za-z0-9_]*)
$middleware = $argv[1];
if (!preg_match('/^[A-Za-z][A-Za-z0-9_]{0,63}$/', $middleware)) {
    echo "Erro: nome inválido. Use apenas letras, números e _ (começando por letra).\n";
    exit(1);
}

// Nome da classe (ex: UserMiddleware)
$className = ucfirst($middleware) . "Middleware";

// Nome do arquivo de destino
$nomeArquivo = "src/Middleware/{$className}.php";

// Cria o diretório se não existir
if (!file_exists("src/Middleware")) {
    mkdir("src/Middleware", 0755, true);
}

// Verifica se o arquivo já existe
if (file_exists($nomeArquivo)) {
    echo "O arquivo '{$nomeArquivo}' já existe. Nenhuma ação foi realizada.\n";
    exit(0);
}

// Conteúdo do middleware
$conteudo = <<<PHP
<?php
namespace App\\Middleware;

use Core\\Controller as ctrl;
use Core\\Security\\Session;

class {$className}
{
    /**
     * Executado antes da rota. Para barrar: responda e encerre (ctrl::retorno faz die).
     * Exemplo: exige sessão autenticada. A sessão é sob demanda: Session::start() (idempotente) aplica o
     * cookie seguro; no login chame Session::regenerar() logo depois de autenticar.
     */
    public function handle()
    {
        Session::start();
        if (empty(\$_SESSION['usuario_id'])) {
            ctrl::retorno('Não autenticado.', 401);
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
