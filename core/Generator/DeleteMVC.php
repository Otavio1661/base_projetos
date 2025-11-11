<?php

function kebab($s) {
    return '/' . strtolower(preg_replace('/[^a-z0-9]+/i', '-', $s));
}

// Resolve nome passado
if ($argc < 2) {
    echo "Erro: Informe o nome. Ex.: composer excluir mvc Produto\n";
    exit(1);
}
$idx = 1;
if ($argc >= 3 && in_array(strtolower($argv[1]), ['mvc','controller','model','view'], true)) {
    $idx = 2;
}
$name = $argv[$idx] ?? null;
if (!$name) {
    echo "Erro: Nome inválido.\n";
    exit(1);
}

$controllerClass = ucfirst($name) . 'Controller';
$modelClass      = ucfirst($name) . 'Model';
$actionMethod    = preg_replace('/[^A-Za-z0-9_]/', '', $name);
$routePath       = kebab($name);

// Mesmos caminhos criados pelo gerador
$controllerFile = "src/controllers/{$name}Controller.php";
$modelFile      = "src/model/{$name}Model.php";
$viewFile       = "src/view/{$name}.php";

// Remove arquivos com segurança
function rm($file) {
    if (file_exists($file)) {
        if (@unlink($file)) {
            echo "Removido: {$file}\n";
        } else {
            echo "Falha ao remover: {$file}\n";
        }
    } else {
        echo "Não encontrado: {$file}\n";
    }
}

rm($controllerFile);
rm($modelFile);
rm($viewFile);

// Remove linha(s) de rota do src/routes.php
function removeRoutes($routesFile, $controllerClass, $actionMethod, $routePath) {
    if (!file_exists($routesFile)) {
        echo "Aviso: '{$routesFile}' não encontrado. Pulei a remoção da rota.\n";
        return;
    }
    $content = file_get_contents($routesFile);
    $original = $content;

    // Remove exatamente a linha gerada: $router->X('/rota', 'Controller@metodo');
    $patExact = '/^[ \t]*\$router->(?:get|post|put|delete)\s*\(\s*([\'\"])'
        . preg_quote($routePath, '/')
        . '\1\s*,\s*([\'\"])'
        . preg_quote($controllerClass, '/')
        . '@'
        . preg_quote($actionMethod, '/')
        . '\2\s*\)\s*;\s*$/mi';

    $content = preg_replace($patExact, '', $content);

    // Fallback: remove qualquer rota que aponte para esse controller@method (independente do path)
    $patControllerMethod = '/^[ \t]*\$router->(?:get|post|put|delete)\s*\(\s*.*?([\'\"])'
        . preg_quote($controllerClass, '/')
        . '@'
        . preg_quote($actionMethod, '/')
        . '\1\s*\)\s*;\s*$/mi';

    $content = preg_replace($patControllerMethod, '', $content);

    if ($content !== $original) {
        // Limpa múltiplas quebras vazias
        $content = preg_replace("/\n{3,}/", "\n\n", $content);
        file_put_contents($routesFile, $content);
        echo "Rota(s) removida(s) de '{$routesFile}'.\n";
    } else {
        echo "Nenhuma rota correspondente encontrada em '{$routesFile}'.\n";
    }
}

removeRoutes("src/routes.php", $controllerClass, $actionMethod, $routePath);

echo "Exclusão concluída.\n";