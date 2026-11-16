<?php

// Verifica se o nome do model foi passado como argumento
if ($argc < 2) {
    echo "Erro: Nome do model não foi fornecido.\n";
    exit(1);
}
// Pega o nome do model do terminal (vira classe e caminho: só [A-Za-z][A-Za-z0-9_]*)
$model = $argv[1];
if (!preg_match('/^[A-Za-z][A-Za-z0-9_]{0,63}$/', $model)) {
    echo "Erro: nome inválido. Use apenas letras, números e _ (começando por letra).\n";
    exit(1);
}

// Nome da classe (ex: UserModel)
$className = ucfirst($model) . "Model";

// Nome do arquivo de destino
$nomeArquivo = "src/Model/{$className}.php";

// Cria o diretório se não existir
if (!file_exists("src/Model")) {
    mkdir("src/Model", 0755, true);
}

// Verifica se o arquivo já existe
if (file_exists($nomeArquivo)) {
    echo "O arquivo '{$nomeArquivo}' já existe. Nenhuma ação foi realizada.\n";
    exit(0);
}

// Conteúdo do model (seguro por padrão: consulta preparada, erro detalhado só no log)
$conteudo = <<<PHP
<?php
namespace App\\Model;

use Core\\Database;
use Core\\Controller as ctrl;
use PDO;

class {$className}
{
    /**
     * Exemplo de consulta SEGURA: o valor vai por parâmetro (prepare/bind), nunca concatenado.
     *   ERRADO: "SELECT * FROM clientes WHERE id = " . \$id
     *   CERTO : prepare("... WHERE id = :id") + bindValue(':id', \$id, PDO::PARAM_INT)
     * Nome de tabela/coluna dinâmico (ORDER BY) não pode ser parâmetro: use allowlist
     * (in_array(\$col, ['nome', 'criado_em'], true)) ou Database::ident(\$col).
     */
    public function buscarPorId(int \$id)
    {
        try {
            \$pdo = Database::getInstance();
            \$stmt = \$pdo->prepare('SELECT * FROM tabela WHERE id = :id');
            \$stmt->bindValue(':id', \$id, PDO::PARAM_INT);
            \$stmt->execute();
            return \$stmt->fetch(PDO::FETCH_ASSOC) ?: null;

            // ou com SQL em arquivo (src/sql/seu_sql.sql com :id):
            // \$info = Database::switchParams(['id' => \$id], 'seu_sql', true);
        } catch (\\Throwable \$e) {
            // detalhe (SQL, tabela) só no log; para o cliente, mensagem genérica
            error_log('[{$className}] ' . \$e->getMessage());
            ctrl::retorno('Erro ao consultar os dados.', 500);
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
