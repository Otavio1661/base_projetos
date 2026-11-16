<?php

// Verifica se o nome do controller foi passado como argumento
if ($argc < 2) {
    echo "Erro: Nome do controller não foi fornecido.\n";
    exit(1);
}

// Pega o nome do controller do terminal.
// O nome vira nome de classe E caminho de arquivo: só [A-Za-z][A-Za-z0-9_]* (nada de "../", aspas ou ";",
// que permitiriam gravar fora de src/ ou injetar código no arquivo gerado).
$controller = $argv[1];
if (!preg_match('/^[A-Za-z][A-Za-z0-9_]{0,63}$/', $controller)) {
    echo "Erro: nome inválido. Use apenas letras, números e _ (começando por letra).\n";
    exit(1);
}

// Nome da classe (ex: UserController)
$className = ucfirst($controller) . "Controller";

// Nome do arquivo de destino
$nomeArquivo = "src/Controllers/{$className}.php";

// Cria o diretório se não existir
if (!file_exists("src/Controllers")) {
    mkdir("src/Controllers", 0755, true);
}

// Verifica se o arquivo já existe
if (file_exists($nomeArquivo)) {
    echo "O arquivo '{$nomeArquivo}' já existe. Nenhuma ação foi realizada.\n";
    exit(0);
}

// Conteúdo do controller (seguro por padrão: entrada validada por esquema)
$conteudo = <<<PHP
<?php

namespace App\\Controllers;

use Core\\Controller as ctrl;

class {$className} extends ctrl
{
    /**
     * Exemplo: POST com validação por esquema.
     * ctrl::validate() responde 422 sozinho se algo estiver errado e recusa campos não declarados.
     * Os dados que chegam aqui JÁ estão validados — mas no banco use SEMPRE consultas preparadas
     * (veja o Model gerado) e, ao mostrar em HTML, htmlspecialchars().
     */
    public function salvar()
    {
        \$dados = ctrl::validate([
            'nome' => ['type' => 'string', 'required' => true, 'minLength' => 2, 'maxLength' => 120],
            // 'email' => ['type' => 'email', 'required' => true],
            // 'id'    => ['type' => 'int', 'min' => 1],
        ]);

        ctrl::retorno(['recebido' => \$dados], 200);
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
