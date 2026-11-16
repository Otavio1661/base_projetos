<?php
/**
 * Carrega o .env (formato INI) e define cada chave como constante.
 *
 * Segurança (ver docs/PRODUCAO.md):
 *  - o .env NUNCA vai para o Git (só Exemplo.env e Exemplo.producao.env);
 *  - sem .env, com .env ilegível ou com valor inválido, a aplicação responde 500 genérico (sem caminhos)
 *    e o motivo vai só para o log;
 *  - APP_ENV e APP_DEBUG têm padrão SEGURO (production / false) quando ausentes;
 *  - em APP_ENV=production o debug é sempre desligado e CRYPTO_PRIVATE_KEY (chave privada P-256 da
 *    criptografia v2) é OBRIGATÓRIA e precisa ser válida;
 *  - política HTTPS (HTTPS_MODE, HTTP_PERMITIDO_PARA, TRUSTED_PROXIES, APP_HOSTS, HSTS_*) validada aqui e
 *    aplicada por Core\Security\Transport logo depois (public/index.php);
 *  - BASE_CRIPTOGRAFIA está DEPRECADA: é ignorada (só gera aviso no log se ainda existir).
 */

(function () {
    $falhar = static function (string $logar): void {
        error_log('[R4 env] ' . $logar);
        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: text/plain; charset=utf-8');
        }
        exit('Erro de configuração do servidor.');
    };

    $envPath = __DIR__ . '/../.env';
    if (!is_file($envPath) || !is_readable($envPath)) {
        $falhar('arquivo .env não encontrado ou ilegível (copie Exemplo.env para .env)');
    }

    // @ para não vazar o aviso de sintaxe na tela; o erro é tratado abaixo
    $env = @parse_ini_file($envPath, false, INI_SCANNER_TYPED);
    if ($env === false) {
        $falhar('sintaxe inválida no .env (use uma linha CHAVE=valor por chave; valores com espaço ou símbolos entre aspas; sem comentários)');
    }

    // as classes de segurança são usadas na validação (funciona mesmo sem o autoload do Composer)
    foreach (['Crypto', 'Transport'] as $classe) {
        if (!class_exists('Core\\Security\\' . $classe)) {
            require_once __DIR__ . '/../core/Security/' . $classe . '.php';
        }
    }

    // Padrões seguros quando a chave não existe
    $env += ['APP_ENV' => 'production', 'APP_DEBUG' => false];
    $producao = strtolower((string) $env['APP_ENV']) === 'production';

    if ($producao) {
        if ($env['APP_DEBUG'] !== false) {
            error_log('[R4 env] APP_ENV=production com APP_DEBUG ligado: debug foi DESLIGADO automaticamente.');
        }
        $env['APP_DEBUG'] = false;
    }

    $texto = static fn($v): string => is_string($v) ? trim($v) : (($v === null || $v === false) ? '' : trim((string) $v));
    $booleano = static function (string $nome, bool $padrao) use (&$env, $falhar): bool {
        if (!array_key_exists($nome, $env) || $env[$nome] === '' || $env[$nome] === null) {
            return $padrao;
        }
        $b = filter_var($env[$nome], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        if ($b === null) {
            $falhar($nome . ' inválido (use true ou false)');
        }
        return $b;
    };
    $inteiro = static function (string $nome, int $padrao, int $min, int $max) use (&$env, $falhar): int {
        if (!array_key_exists($nome, $env) || $env[$nome] === '' || $env[$nome] === null) {
            return $padrao;
        }
        $i = filter_var($env[$nome], FILTER_VALIDATE_INT, ['options' => ['min_range' => $min, 'max_range' => $max]]);
        if ($i === false) {
            $falhar($nome . " inválido (inteiro de $min a $max)");
        }
        return $i;
    };

    /* ---------- política HTTPS/HTTP (Core\Security\Transport) ---------- */
    $modo = strtolower($texto($env['HTTPS_MODE'] ?? ''));
    if ($modo === '') {
        $modo = $producao ? 'required' : 'optional';
    }
    if (!in_array($modo, ['required', 'optional'], true)) {
        $falhar('HTTPS_MODE inválido (use required ou optional)');
    }
    $env['HTTPS_MODE'] = $modo;

    $listas = [
        'HTTP_PERMITIDO_PARA' => ['ip', '127.0.0.1,::1'],
        'TRUSTED_PROXIES' => ['ip', ''],
        'APP_HOSTS' => ['host', ''],
    ];
    foreach ($listas as $nome => [$tipo, $padrao]) {
        $bruto = array_key_exists($nome, $env) ? $texto($env[$nome]) : $padrao;
        $erros = [];
        $lista = \Core\Security\Transport::lerLista($bruto, $tipo, $erros);
        if ($erros) {
            $falhar($nome . ' com item inválido: ' . implode(', ', $erros) . ($tipo === 'ip' ? ' (use IPs ou CIDRs separados por vírgula)' : ' (use nomes de host separados por vírgula)'));
        }
        $env[$nome] = implode(',', $lista);
    }
    if ($producao && $env['APP_HOSTS'] === '') {
        \Core\Security\Transport::avisoUnico('app-hosts', 'APP_HOSTS vazio em produção: o cabeçalho Host não é validado (recomenda-se listar os domínios do site).');
    }

    $env['HSTS_MAX_AGE'] = $inteiro('HSTS_MAX_AGE', \Core\Security\Transport::HSTS_PADRAO, 0, 63072000);
    $env['HSTS_SUBDOMAINS'] = $booleano('HSTS_SUBDOMAINS', false);

    /* ---------- criptografia v2 (Core\Security\Crypto) ---------- */
    $env['CRYPTO_OBRIGATORIA'] = $booleano('CRYPTO_OBRIGATORIA', false);
    $env['VITRINE_PUBLICA'] = $booleano('VITRINE_PUBLICA', false);   // libera só /vitrine (sem API de teste, sem testes) sem ligar o debug
    $env['CRYPTO_JANELA_SEG'] = $inteiro('CRYPTO_JANELA_SEG', 300, 30, 3600);

    foreach (['CRYPTO_PRIVATE_KEY', 'CRYPTO_PRIVATE_KEY_ANTERIOR'] as $nome) {
        $chave = $texto($env[$nome] ?? '');
        $env[$nome] = $chave;
        if ($chave !== '' && ($erro = \Core\Security\Crypto::validarChave($chave)) !== null) {
            $falhar($nome . ': ' . $erro);
        }
    }
    if ($env['CRYPTO_PRIVATE_KEY'] === '') {
        if ($producao) {
            $falhar('CRYPTO_PRIVATE_KEY ausente em produção (gere com: php tools/gerar-chave.php e cole a linha no .env)');
        }
        if ($env['CRYPTO_PRIVATE_KEY_ANTERIOR'] !== '') {
            $falhar('CRYPTO_PRIVATE_KEY_ANTERIOR definida sem CRYPTO_PRIVATE_KEY');
        }
    } elseif ($env['CRYPTO_PRIVATE_KEY_ANTERIOR'] === $env['CRYPTO_PRIVATE_KEY']) {
        $env['CRYPTO_PRIVATE_KEY_ANTERIOR'] = '';
    }

    // DEPRECADA: a criptografia v2 não usa segredo compartilhado com o navegador
    if ($texto($env['BASE_CRIPTOGRAFIA'] ?? '') !== '') {
        \Core\Security\Transport::avisoUnico('base-criptografia', 'BASE_CRIPTOGRAFIA está DEPRECADA e é ignorada (a criptografia v2 usa CRYPTO_PRIVATE_KEY e nada vai para o navegador). Remova-a do .env.');
    }
    // mantida como constante vazia só para não quebrar código antigo que ainda referencie App\Config::BASE_CRIPTOGRAFIA
    $env['BASE_CRIPTOGRAFIA'] = '';

    foreach ($env as $key => $value) {
        if (!defined($key)) {
            define($key, $value);
        }
    }
})();
