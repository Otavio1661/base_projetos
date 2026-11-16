<?php

/**
 * EXECUTA as migrations pendentes de src/Migration/*Migration.php (criadas com `composer make:migration Nome`).
 * Uso: composer migrate            (ou: php core/Migration/RunMigration.php [--status])
 *
 * - Roda em ordem alfabética do nome do arquivo (use prefixos: 001_..., ou datas) e só as que ainda não constam
 *   na tabela `migrations` (criada aqui, se não existir). Cada migration é registrada DEPOIS de rodar sem erro.
 * - A migration precisa ter `public static function migrate()` e lançar exceção em caso de falha (o molde gerado já faz isso).
 * - --status só lista (executadas / pendentes), sem rodar nada.
 * - Precisa do banco configurado no .env (DB_HOST, DB_DATABASE, DB_USERNAME, DB_PASSWORD).
 * Nome diferente de Migration.php de propósito: MakeMigration.php CRIA o arquivo, este EXECUTA.
 */
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$raiz = dirname(__DIR__, 2);
chdir($raiz);
require $raiz . '/vendor/autoload.php';
require $raiz . '/src/Env.php';

use Core\Database;

$soStatus = in_array('--status', $argv, true);
$arquivos = glob($raiz . '/src/Migration/*Migration.php') ?: [];
sort($arquivos, SORT_STRING);

if (!$arquivos) {
    echo "Nenhuma migration em src/Migration/. Crie uma com: composer make:migration Nome\n";
    exit(0);
}

try {
    $pdo = Database::getInstance();
    $pdo->exec('CREATE TABLE IF NOT EXISTS `migrations` (`migration` VARCHAR(190) NOT NULL PRIMARY KEY, `executada_em` DATETIME NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    $feitas = $pdo->query('SELECT `migration` FROM `migrations`')->fetchAll(PDO::FETCH_COLUMN);
} catch (Throwable $e) {
    fwrite(STDERR, "Sem acesso ao banco (confira DB_* no .env): " . $e->getMessage() . "\n");
    exit(1);
}

$pendentes = 0;
$rodou = 0;
foreach ($arquivos as $arq) {
    $classe = basename($arq, '.php');
    $feita = in_array($classe, $feitas, true);
    if ($soStatus) {
        echo ($feita ? '[executada] ' : '[pendente]  ') . $classe . "\n";
        $pendentes += $feita ? 0 : 1;
        continue;
    }
    if ($feita) {
        continue;
    }
    $fqcn = 'App\\Migration\\' . $classe;
    require_once $arq;
    if (!class_exists($fqcn) || !method_exists($fqcn, 'migrate')) {
        fwrite(STDERR, "$classe: classe ou método migrate() não encontrado. Parando.\n");
        exit(1);
    }
    echo "Executando $classe... ";
    try {
        $fqcn::migrate();
        $st = $pdo->prepare('INSERT INTO `migrations` (`migration`, `executada_em`) VALUES (:m, NOW())');
        $st->execute([':m' => $classe]);
        echo "ok\n";
        $rodou++;
    } catch (Throwable $e) {
        echo "FALHOU\n";
        fwrite(STDERR, $classe . ': ' . $e->getMessage() . "\nParando: as seguintes não foram executadas.\n");
        exit(1);
    }
}
echo $soStatus ? "$pendentes pendente(s).\n" : ($rodou ? "$rodou migration(s) executada(s).\n" : "Nada a executar: tudo em dia.\n");
exit(0);
