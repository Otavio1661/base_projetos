<?php
$envPath = __DIR__ . '/../.env';
if (!file_exists($envPath)) {
    die('Arquivo .env não localizado!');
}

// Lê o arquivo .env
$env = parse_ini_file($envPath, false, INI_SCANNER_TYPED);

foreach ($env as $key => $value) {
    if (!defined($key)) {
        define($key, $value);
    }
}
