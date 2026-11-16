<?php

// Uso: php core/Generator/MakeMVC.php NomeMvc [get|post|put|delete] [/rota]
if ($argc < 2) {
    echo "Erro: Nome do MVC não foi fornecido.\n";
    echo "Uso: php core/Generator/MakeMVC.php Produto get /produto\n";
    exit(1);
}

$name = $argv[1];
// O nome vira classe, método, caminho de arquivo e texto dentro do código gerado:
// só [A-Za-z][A-Za-z0-9_]* (sem "../", aspas, ";" — que gravariam fora de src/ ou injetariam código).
if (!preg_match('/^[A-Za-z][A-Za-z0-9_]{0,63}$/', $name)) {
    echo "Erro: nome inválido. Use apenas letras, números e _ (começando por letra).\n";
    exit(1);
}
$httpMethod = isset($argv[2]) ? strtolower($argv[2]) : 'get';
$httpMethod = in_array($httpMethod, ['get','post','put','delete'], true) ? $httpMethod : 'get';
$routePath = isset($argv[3]) ? $argv[3] : '/' . strtolower(preg_replace('/[^a-z0-9]+/i', '-', $name));
// A rota vai para dentro de src/routes.php entre aspas simples: só caminho simples
if (!preg_match('#^/[A-Za-z0-9_\-/]*$#', $routePath)) {
    echo "Erro: rota inválida. Use algo como /produto ou /admin/produtos.\n";
    exit(1);
}

// Nomes de classes/método
$controllerClass = ucfirst($name) . "Controller";
$modelClass      = ucfirst($name) . "Model";
$actionMethod    = preg_replace('/[^A-Za-z0-9_]/', '', $name); // método válido em PHP
$modelProperty   = lcfirst($modelClass);

// Arquivos de destino
$controllerFile = "src/Controllers/{$controllerClass}.php";
$modelFile      = "src/Model/{$modelClass}.php";
$viewFile       = "src/view/{$name}.php";

// Garante diretórios
@mkdir("src/Controllers", 0755, true);
@mkdir("src/Model", 0755, true);
@mkdir("src/view", 0755, true);

// Templates
$controllerContent = <<<PHP
<?php

namespace App\\Controllers;

use App\\Model\\{$modelClass};
use Core\\Controller as ctrl;

class {$controllerClass} extends ctrl
{
    private \${$modelProperty};

    public function __construct()
    {
        \$this->{$modelProperty} = new {$modelClass}();
    }

    public function {$actionMethod}()
    {
        ctrl::render('{$name}', [
            'titulo' => '{$name}',
        ]);
    }
}

PHP;

$modelContent = <<<PHP
<?php
namespace App\\Model;

use Core\\Database;
use Exception;
use PDO;
use Core\\Controller as ctrl;

class {$modelClass}
{
    /**
     * Exemplo de consulta SEGURA: valor sempre por parâmetro (prepare/bind), nunca concatenado.
     *   ERRADO: "SELECT * FROM tabela WHERE nome = '" . \$nome . "'"
     *   CERTO : prepare('... WHERE nome = :nome') + execute([':nome' => \$nome])
     * Coluna/tabela dinâmica (ORDER BY) não pode ser parâmetro: use allowlist ou Database::ident().
     */
    public function example(string \$nome = '')
    {
        try {
            \$pdo = Database::getInstance();
            \$stmt = \$pdo->prepare('SELECT * FROM tabela WHERE nome = :nome LIMIT 50');
            \$stmt->bindValue(':nome', \$nome, PDO::PARAM_STR);
            \$stmt->execute();
            return \$stmt->fetchAll(PDO::FETCH_ASSOC);

            // ou com SQL em arquivo (src/sql/seu_sql.sql com :nome):
            // \$info = Database::switchParams(['nome' => \$nome], 'seu_sql', true);
        } catch (Exception \$e) {
            // detalhe (SQL, tabela) só no log; o cliente recebe mensagem genérica
            error_log('[{$modelClass}] ' . \$e->getMessage());
            ctrl::retorno('Erro ao consultar os dados.', 500);
        }
    }
}

PHP;

$viewContent = <<<HTML
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{$name}</title>
</head>
<body>
    <h1>{$name} View</h1>
    <p>Edite esta view em src/view/{$name}.php</p>
</body>
</html>

HTML;

// Criação dos arquivos (sem abortar se algum já existir)
if (!file_exists($controllerFile)) {
    file_put_contents($controllerFile, $controllerContent);
    echo "Criado: {$controllerFile}\n";
} else {
    echo "Já existe: {$controllerFile}\n";
}

if (!file_exists($modelFile)) {
    file_put_contents($modelFile, $modelContent);
    echo "Criado: {$modelFile}\n";
} else {
    echo "Já existe: {$modelFile}\n";
}

if (!file_exists($viewFile)) {
    file_put_contents($viewFile, $viewContent);
    echo "Criado: {$viewFile}\n";
} else {
    echo "Já existe: {$viewFile}\n";
}

// ==== Adiciona rota no src/routes.php, se não existir ====
function addRouteIfMissing($routesFile, $method, $path, $controllerAction)
{
    if (!file_exists($routesFile)) {
        echo "Aviso: '{$routesFile}' não encontrado. Pulei a adição da rota.\n";
        return;
    }

    $content = file_get_contents($routesFile);
    $routeLine = "\$router->{$method}('{$path}', '{$controllerAction}');";

    if (strpos($content, $routeLine) !== false) {
        echo "Rota já existe em '{$routesFile}': {$routeLine}\n";
        return;
    }

    // Marcadores opcionais
    $startMarker = '>>> AUTO-ROUTES (inseridas pelo gerador) >>>';
    $endMarker   = '<<< AUTO-ROUTES END <<<';

    if (strpos($content, $startMarker) !== false && strpos($content, $endMarker) !== false) {
        $content = preg_replace(
            '/(>>> AUTO-ROUTES \(inseridas pelo gerador\) >>>)(.*?)(<<< AUTO-ROUTES END <<<)/s',
            "\$1\n    {$routeLine}\n\$2\$3",
            $content,
            1
        );
        file_put_contents($routesFile, $content);
        echo "Rota adicionada entre marcadores: {$routeLine}\n";
        return;
    }

    // Inserir antes de "return $router;"
    $pattern = '/(\s*)return\s+\$router\s*;\s*$/m';
    if (preg_match($pattern, $content, $m)) {
        $indent = $m[1] ?? "";
        $insertion = "\n{$indent}{$routeLine}\n\n{$indent}return \$router;";
        $content = preg_replace($pattern, $insertion, $content, 1);
        file_put_contents($routesFile, $content);
        echo "Rota adicionada: {$routeLine}\n";
    } else {
        // Fallback
        $content .= "\n\n{$routeLine}\nreturn \$router;\n";
        file_put_contents($routesFile, $content);
        echo "Rota adicionada no final do arquivo: {$routeLine}\n";
    }
}

$controllerAction = "{$controllerClass}@{$actionMethod}";
addRouteIfMissing("src/routes.php", $httpMethod, $routePath, $controllerAction);

exit(0);
