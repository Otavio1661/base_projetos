<?php

// Verifica se o nome do MVC foi passado como argumento
if ($argc < 2) {
    echo "Erro: Nome do MVC não foi fornecido.\n";
    exit(1);
}

// Pega o nome do MVC do terminal
$name = $argv[1];

// Nome dos arquivos de destino
$controllerFile = "src/controllers/{$name}Controller.php";
$modelFile = "src/model/{$name}Model.php";
$viewFile = "src/view/{$name}.php";

// Nome das classes
$controllerClass = ucfirst($name) . "Controller";
$modelClass = ucfirst($name) . "Model";

// Cria o diretório de controllers se não existir
if (!file_exists("src/controllers")) {
    mkdir("src/controllers", 0777, true);
}

// Cria o diretório de models se não existir
if (!file_exists("src/model")) {
    mkdir("src/model", 0777, true);
}

// Cria o diretório de view se não existir
if (!file_exists("src/view")) {
    mkdir("src/view", 0777, true);
}

// Verifica se os arquivos já existem
if (file_exists($controllerFile) || file_exists($modelFile) || file_exists($viewFile)) {
    echo "Um ou mais arquivos já existem. Nenhuma ação foi realizada.\n";
    exit(0);
}

// Conteúdo do arquivo do controller
$controllerContent = <<<PHP
<?php

namespace src\controllers;

use core\Controller as ctrl;
use src\model\\{$modelClass};

class {$controllerClass} extends ctrl
{
    private \$Model;

    public function __construct()
    {
        \$this->Model = new {$modelClass}();
    }

}
PHP;

// Conteúdo do arquivo do model
$modelContent = <<<PHP
<?php

namespace src\model;

class {$modelClass} {
    // Model logic goes here
}
PHP;

// Conteúdo do arquivo da view
$viewContent = <<<HTML
<!-- View for {$name} goes here -->
<h1>{$name} View</h1>
HTML;

// Cria os arquivos com a estrutura padrão
file_put_contents($controllerFile, $controllerContent);
file_put_contents($modelFile, $modelContent);
file_put_contents($viewFile, $viewContent);

echo "Arquivos '{$controllerFile}', '{$modelFile}' e '{$viewFile}' criados com sucesso!\n";

exit(0);