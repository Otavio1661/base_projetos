
<?php

// Uso: php core/Generator/MakeMVC.php NomeMvc [get|post|put|delete] [/rota]
if ($argc < 2) {
    echo "Erro: Nome do MVC não foi fornecido.\n";
    echo "Uso: php core/Generator/MakeMVC.php Produto get /produto\n";
    exit(1);
}

$name = $argv[1];
$httpMethod = isset($argv[2]) ? strtolower($argv[2]) : 'get';
$httpMethod = in_array($httpMethod, ['get','post','put','delete'], true) ? $httpMethod : 'get';
$routePath = isset($argv[3]) ? $argv[3] : '/' . strtolower(preg_replace('/[^a-z0-9]+/i', '-', $name));

// Nomes de classes/método
$controllerClass = ucfirst($name) . "Controller";
$modelClass      = ucfirst($name) . "Model";
$actionMethod    = preg_replace('/[^A-Za-z0-9_]/', '', $name); // método válido em PHP

// Arquivos de destino
$controllerFile = "src/controllers/{$name}Controller.php";
$modelFile      = "src/model/{$name}Model.php";
$viewFile       = "src/view/{$name}.php";

// Garante diretórios
@mkdir("src/controllers", 0777, true);
@mkdir("src/model", 0777, true);
@mkdir("src/view", 0777, true);

// Templates
$controllerContent = <<<PHP
<?php

namespace src\\controllers;

use core\\Controller as ctrl;
use src\\model\\{$modelClass};

class {$controllerClass} extends ctrl
{
    private \${$modelClass};

    public function __construct()
    {
        \$this->{$modelClass} = new {$modelClass}();
    }

    public function {$actionMethod}() {
        ctrl::render('{$name}', [
            'titulo' => '{$name}',
        ]);
    }
}

PHP;

$modelContent = <<<PHP
<?php
namespace src\\model;

use core\\Database;
use Exception;
use PDO;
use core\\Controller as ctrl;

class {$modelClass} {

    public function example() {
        try {
            // Exemplo de chamada ao Database::switchParams
            // \$info = Database::switchParams(\$params, 'seu_sql', true);

            ctrl::retorno(['message' => 'OK'], 200);
        } catch (Exception \$e) {
            ctrl::retorno(['error' => \$e->getMessage()], 400);
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
function addRouteIfMissing($routesFile, $method, $path, $controllerAction) {
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