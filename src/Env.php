<?php
/**
 * Carrega o .env (formato INI) e define cada chave como constante.
 *
 * Segurança (ver docs/PRODUCAO.md):
 *  - o .env NUNCA vai para o Git (só Exemplo.env e Exemplo.producao.env);
 *  - sem .env, ou com .env ilegível, a aplicação responde 500 genérico (sem caminhos) e registra no log;
 *  - APP_ENV e APP_DEBUG têm padrão SEGURO (production / false) quando ausentes;
 *  - em APP_ENV=production o debug é sempre desligado e a chave de criptografia precisa ter 32+ caracteres.
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

    // Padrões seguros quando a chave não existe
    $env += ['APP_ENV' => 'production', 'APP_DEBUG' => false];

    if (strtolower((string) $env['APP_ENV']) === 'production') {
        if ($env['APP_DEBUG'] !== false) {
            error_log('[R4 env] APP_ENV=production com APP_DEBUG ligado: debug foi DESLIGADO automaticamente.');
        }
        $env['APP_DEBUG'] = false;

        $chave = (string) ($env['BASE_CRIPTOGRAFIA'] ?? '');
        if (strlen($chave) < 32) {
            $falhar('BASE_CRIPTOGRAFIA ausente ou com menos de 32 caracteres em produção (gere uma com: php -r "echo bin2hex(random_bytes(32));")');
        }
    }

    foreach ($env as $key => $value) {
        if (!defined($key)) {
            define($key, $value);
        }
    }
})();
