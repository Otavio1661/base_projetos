<?php
/**
 * ============================================
 * Core\Security\Upload — recebimento seguro de arquivos ($_FILES)
 * ============================================
 *
 *   $r = Upload::save('arquivo', [
 *       'permitidos' => ['png', 'jpg', 'pdf'],      // allowlist de extensões
 *       'maxBytes'   => 2 * 1024 * 1024,
 *       'destino'    => Upload::storage('documentos'),  // FORA do public/
 *       'imagem'     => ['maxLargura' => 4000, 'maxAltura' => 4000],
 *   ]);
 *   if (!$r['ok']) { ... 422 com $r['erros'] ... }
 *   $r['arquivo']['nome'];      // "9f86d081884c7d659a2feaa0c55ad015.png" (aleatório)
 *   $r['arquivo']['original'];  // nome enviado, saneado (só para EXIBIR)
 *   $r['arquivo']['caminho'];   // caminho absoluto no servidor (nunca devolva ao cliente)
 *
 * O que é conferido (tudo no servidor; nada do que o navegador diz é confiável):
 *  1. um arquivo por campo, erro de upload do PHP, is_uploaded_file();
 *  2. tamanho REAL (filesize), não o declarado; arquivo vazio recusado;
 *  3. nome: NUL, controles, caminho (../, \) → recusado; extensão final em allowlist;
 *     dupla extensão perigosa (shell.php.jpg, nota.exe.pdf) → recusado;
 *     extensões executáveis/ativas (php, phtml, phar, exe, js, svg, html, htaccess...) NUNCA são aceitas;
 *  4. MIME real via finfo (ignora $_FILES['type']) coerente com a extensão;
 *  5. assinatura (magic bytes) coerente: PNG, JPEG, GIF, WebP, PDF, ZIP/XLSX; texto (csv/txt/json)
 *     sem bytes nulos e em UTF-8 válido;
 *  6. "<?php" em qualquer ponto do arquivo (e "<?=" em texto) → recusado (poliglota);
 *  7. imagens: getimagesize() precisa ler a imagem; limite de pixels (contra "bomba de descompressão");
 *  8. grava com nome ALEATÓRIO (bin2hex(random_bytes(16)) + extensão da allowlist), FORA do docroot,
 *     com permissão 0640; diretório criado com 0750 + .htaccess "deny" (Apache/XAMPP).
 *  O arquivo nunca é incluído/executado. Para servir de volta, use um controller que leia o arquivo
 *  e envie com Content-Type fixo + "Content-Disposition: attachment" + "X-Content-Type-Options: nosniff".
 * ============================================
 */

namespace Core\Security;

final class Upload
{
    /** Extensões que NUNCA são aceitas (executáveis, scripts, conteúdo ativo no navegador, configuração). */
    public const BLOQUEADAS = [
        'php', 'php3', 'php4', 'php5', 'php7', 'php8', 'phps', 'pht', 'phtml', 'phar', 'pgif', 'inc',
        'exe', 'com', 'bat', 'cmd', 'scr', 'msi', 'msp', 'dll', 'so', 'dylib', 'sys', 'cpl', 'lnk', 'reg', 'hta', 'wsf', 'vbs', 'vbe', 'ps1', 'psm1',
        'sh', 'bash', 'zsh', 'csh', 'ksh', 'cgi', 'pl', 'py', 'pyc', 'rb', 'jar', 'class', 'war',
        'js', 'mjs', 'cjs', 'html', 'htm', 'xhtml', 'shtml', 'svg', 'svgz', 'xml', 'xsl', 'swf',
        'asp', 'aspx', 'asmx', 'ashx', 'jsp', 'jspx', 'htaccess', 'htpasswd', 'ini', 'user.ini', 'config', 'env',
    ];

    /** ext => [tipo da assinatura, MIMEs aceitos do finfo] */
    public const TIPOS = [
        'png'  => ['png',  ['image/png']],
        'jpg'  => ['jpeg', ['image/jpeg', 'image/pjpeg']],
        'jpeg' => ['jpeg', ['image/jpeg', 'image/pjpeg']],
        'gif'  => ['gif',  ['image/gif']],
        'webp' => ['webp', ['image/webp']],
        'pdf'  => ['pdf',  ['application/pdf']],
        'zip'  => ['zip',  ['application/zip', 'application/x-zip-compressed']],
        'xlsx' => ['zip',  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip', 'application/octet-stream']],
        'docx' => ['zip',  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip', 'application/octet-stream']],
        'csv'  => ['text', ['text/plain', 'text/csv', 'application/csv', 'text/x-csv', 'application/vnd.ms-excel', 'text/x-comma-separated-values']],
        'txt'  => ['text', ['text/plain']],
        'json' => ['text', ['application/json', 'text/plain']],
    ];

    private const IMAGENS = ['png', 'jpeg', 'gif', 'webp'];

    /** Pasta storage/<sub> na raiz do projeto (fora de public/). */
    public static function storage(string $sub = 'uploads'): string
    {
        $sub = trim(str_replace('\\', '/', $sub), '/');
        if ($sub === '' || preg_match('#(^|/)\.\.?(/|$)#', $sub) || !preg_match('#^[A-Za-z0-9_\-/]+$#', $sub)) {
            $sub = 'uploads';
        }
        return dirname(__DIR__, 2) . '/storage/' . $sub;
    }

    /**
     * Recebe e grava o arquivo do campo $campo de $_FILES.
     * @return array{ok: bool, arquivo: ?array, erros: string[]}
     */
    public static function save(string $campo, array $opts = []): array
    {
        $f = $_FILES[$campo] ?? null;
        if (!is_array($f)) {
            return self::falha('Nenhum arquivo enviado.');
        }
        return self::handle($f, $opts);
    }

    /** Mesma coisa que save(), recebendo a entrada de $_FILES já separada (um arquivo). */
    public static function handle(array $f, array $opts = []): array
    {
        try {
            return self::processar($f, $opts);
        } catch (\Throwable $e) {
            error_log('[Upload] falha inesperada: ' . $e->getMessage());
            return self::falha('Não foi possível receber o arquivo.');
        }
    }

    /**
     * Separa $_FILES['campo'] com vários arquivos (name="campo[]") em uma lista de entradas.
     * Limita a $max arquivos; subarrays aninhados são ignorados.
     */
    public static function lista(string $campo, int $max = 10): array
    {
        $f = $_FILES[$campo] ?? null;
        if (!is_array($f) || !isset($f['name'])) {
            return [];
        }
        if (!is_array($f['name'])) {
            return [$f];
        }
        $out = [];
        foreach (array_keys($f['name']) as $i) {
            if (count($out) >= $max) {
                break;
            }
            $e = [];
            foreach (['name', 'type', 'tmp_name', 'error', 'size'] as $k) {
                $e[$k] = $f[$k][$i] ?? null;
            }
            if (is_array($e['name']) || is_array($e['tmp_name'])) {
                continue;
            }
            $out[] = $e;
        }
        return $out;
    }

    private static function falha(string ...$erros): array
    {
        return ['ok' => false, 'arquivo' => null, 'erros' => $erros];
    }

    private static function processar(array $f, array $o): array
    {
        $max = (int) ($o['maxBytes'] ?? 5 * 1024 * 1024);
        $permitidos = array_values(array_filter(array_map('strtolower', (array) ($o['permitidos'] ?? ['png', 'jpg', 'jpeg', 'pdf'])), function ($e) {
            if (in_array($e, self::BLOQUEADAS, true)) {
                error_log('[Upload] extensão perigosa ignorada na allowlist: ' . $e);
                return false;
            }
            if (!isset(self::TIPOS[$e])) {
                error_log('[Upload] extensão sem assinatura conhecida ignorada: ' . $e);
                return false;
            }
            return true;
        }));
        if (!$permitidos) {
            return self::falha('Nenhum tipo de arquivo permitido.');
        }

        // 1) estrutura e erro do PHP
        foreach (['name', 'tmp_name', 'error', 'size'] as $k) {
            if (!array_key_exists($k, $f)) {
                return self::falha('Nenhum arquivo enviado.');
            }
        }
        if (is_array($f['name']) || is_array($f['tmp_name']) || is_array($f['error'])) {
            return self::falha('Envie um arquivo por vez.');
        }
        $err = (int) $f['error'];
        if ($err !== UPLOAD_ERR_OK) {
            $msg = [
                UPLOAD_ERR_INI_SIZE => 'Arquivo grande demais.',
                UPLOAD_ERR_FORM_SIZE => 'Arquivo grande demais.',
                UPLOAD_ERR_PARTIAL => 'O envio foi interrompido; tente de novo.',
                UPLOAD_ERR_NO_FILE => 'Nenhum arquivo enviado.',
            ][$err] ?? 'Falha no envio do arquivo.';
            if ($err >= UPLOAD_ERR_NO_TMP_DIR) {
                error_log('[Upload] erro de servidor no upload: código ' . $err);
            }
            return self::falha($msg);
        }
        $tmp = (string) $f['tmp_name'];
        if ($tmp === '' || !is_uploaded_file($tmp)) {
            return self::falha('Arquivo inválido.');
        }

        // 2) tamanho real
        $tam = filesize($tmp);
        if ($tam === false || $tam <= 0) {
            return self::falha('Arquivo vazio.');
        }
        if ($tam > $max) {
            return self::falha('Arquivo grande demais (máximo ' . self::bytes($max) . ').');
        }

        // 3) nome e extensão
        $nome = (string) $f['name'];
        if ($nome === '' || strlen($nome) > 255 || preg_match('/[\x00-\x1F\x7F]/', $nome) || strpbrk($nome, '/\\') !== false
            || str_contains($nome, '..' . '/') || preg_match('/[\x{202A}-\x{202E}\x{2066}-\x{2069}]/u', $nome)) {
            return self::falha('Nome de arquivo inválido.');
        }
        $partes = explode('.', strtolower(rtrim($nome)));
        if (count($partes) < 2 || end($partes) === '') {
            return self::falha('Arquivo sem extensão.');
        }
        $ext = (string) array_pop($partes);
        array_shift($partes);   // o primeiro pedaço é o nome-base
        foreach ($partes as $p) {
            if (in_array(trim($p), self::BLOQUEADAS, true)) {
                return self::falha('Extensão dupla suspeita (".' . $p . '.' . $ext . '").');
            }
        }
        if (in_array($ext, self::BLOQUEADAS, true)) {
            return self::falha('Tipo de arquivo bloqueado (.' . $ext . ').');
        }
        if (!in_array($ext, $permitidos, true)) {
            return self::falha('Tipo de arquivo não permitido (aceitos: ' . implode(', ', $permitidos) . ').');
        }
        [$kind, $mimes] = self::TIPOS[$ext];

        // 4) MIME real
        if (!class_exists(\finfo::class)) {
            error_log('[Upload] extensão fileinfo ausente: upload recusado');
            return self::falha('Servidor sem verificação de tipo de arquivo.');
        }
        $mime = (string) (new \finfo(FILEINFO_MIME_TYPE))->file($tmp);
        if (!in_array($mime, $mimes, true)) {
            return self::falha('O conteúdo do arquivo não corresponde à extensão .' . $ext . '.');
        }

        // 5) assinatura + 6) código embutido
        $fh = fopen($tmp, 'rb');
        if ($fh === false) {
            return self::falha('Arquivo inválido.');
        }
        $cabeca = (string) fread($fh, 8192);
        fclose($fh);
        if (!self::assinaturaOk($kind, $cabeca)) {
            return self::falha('A assinatura do arquivo não corresponde à extensão .' . $ext . '.');
        }
        if (($o['bloquearCodigo'] ?? true) && self::temCodigo($tmp, $kind === 'text')) {
            return self::falha('O arquivo contém código (<?php) e foi recusado.');
        }
        if ($kind === 'text' && !mb_check_encoding(self::semCorte(file_get_contents($tmp, false, null, 0, $max)), 'UTF-8')) {
            return self::falha('Arquivo de texto precisa estar em UTF-8.');
        }

        // 7) imagem
        $larg = $alt = null;
        if (in_array($kind, self::IMAGENS, true)) {
            $info = @getimagesize($tmp);
            if (!is_array($info) || empty($info[0]) || empty($info[1])) {
                return self::falha('Imagem inválida ou corrompida.');
            }
            [$larg, $alt] = [(int) $info[0], (int) $info[1]];
            $lim = (array) ($o['imagem'] ?? []);
            $maxPix = (int) ($lim['maxPixels'] ?? 40000000);
            if ($larg * $alt > $maxPix || (isset($lim['maxLargura']) && $larg > (int) $lim['maxLargura']) || (isset($lim['maxAltura']) && $alt > (int) $lim['maxAltura'])) {
                return self::falha('Imagem grande demais (' . $larg . '×' . $alt . ' px).');
            }
        }

        // 8) destino fora do docroot + nome aleatório
        $destino = self::prepararDestino((string) ($o['destino'] ?? self::storage()));
        if ($destino === null) {
            return self::falha('Destino de upload indisponível.');
        }
        $extFinal = $ext === 'jpeg' ? 'jpg' : $ext;
        $gerado = bin2hex(random_bytes(16)) . '.' . $extFinal;
        $caminho = $destino . DIRECTORY_SEPARATOR . $gerado;
        if (!move_uploaded_file($tmp, $caminho)) {
            error_log('[Upload] move_uploaded_file falhou para ' . $caminho);
            return self::falha('Não foi possível gravar o arquivo.');
        }
        @chmod($caminho, 0640);

        return ['ok' => true, 'erros' => [], 'arquivo' => [
            'nome' => $gerado,
            'original' => Input::filename($nome),
            'ext' => $extFinal,
            'mime' => $mime,
            'tamanho' => $tam,
            'largura' => $larg,
            'altura' => $alt,
            'caminho' => $caminho,
        ]];
    }

    /** Cria a pasta (0750) se precisar, confere que fica FORA de public/ e põe um .htaccess "deny". */
    private static function prepararDestino(string $dir): ?string
    {
        if ($dir === '' || str_contains($dir, "\0")) {
            return null;
        }
        if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) {
            error_log('[Upload] não consegui criar ' . $dir);
            return null;
        }
        $real = realpath($dir);
        $publico = realpath(dirname(__DIR__, 2) . '/public');
        $docroot = isset($_SERVER['DOCUMENT_ROOT']) && $_SERVER['DOCUMENT_ROOT'] !== '' ? realpath($_SERVER['DOCUMENT_ROOT']) : false;
        foreach ([$publico, $docroot] as $raiz) {
            if ($real !== false && $raiz && (strcasecmp($real, $raiz) === 0 || stripos($real . DIRECTORY_SEPARATOR, rtrim($raiz, '\\/') . DIRECTORY_SEPARATOR) === 0)) {
                error_log('[Upload] destino dentro da pasta pública recusado: ' . $real);
                return null;
            }
        }
        if ($real === false || !is_writable($real)) {
            return null;
        }
        $ht = $real . DIRECTORY_SEPARATOR . '.htaccess';
        if (!is_file($ht)) {
            @file_put_contents($ht, "Require all denied\nDeny from all\n");
        }
        return $real;
    }

    private static function assinaturaOk(string $kind, string $b): bool
    {
        switch ($kind) {
            case 'png':
                return strncmp($b, "\x89PNG\r\n\x1A\n", 8) === 0;
            case 'jpeg':
                return strncmp($b, "\xFF\xD8\xFF", 3) === 0;
            case 'gif':
                return strncmp($b, 'GIF87a', 6) === 0 || strncmp($b, 'GIF89a', 6) === 0;
            case 'webp':
                return strncmp($b, 'RIFF', 4) === 0 && substr($b, 8, 4) === 'WEBP';
            case 'pdf':
                return strncmp($b, '%PDF-', 5) === 0;
            case 'zip':
                return strncmp($b, "PK\x03\x04", 4) === 0;
            case 'text':
                if (str_contains($b, "\0")) {
                    return false;
                }
                foreach (["MZ", "\x7FELF", "PK\x03\x04", "%PDF", "\x89PNG", "\xFF\xD8\xFF", "GIF8", "\xCA\xFE\xBA\xBE", "#!"] as $sig) {
                    if (strncmp($b, $sig, strlen($sig)) === 0) {
                        return false;
                    }
                }
                return true;
        }
        return false;
    }

    /** Procura "<?php" (e "<?=" em texto) no arquivo inteiro, em blocos com sobreposição. */
    private static function temCodigo(string $arq, bool $texto): bool
    {
        $fh = fopen($arq, 'rb');
        if ($fh === false) {
            return true;
        }
        $resto = '';
        $achou = false;
        while (!feof($fh)) {
            $bloco = $resto . (string) fread($fh, 65536);
            if (stripos($bloco, '<?php') !== false || ($texto && str_contains($bloco, '<?='))) {
                $achou = true;
                break;
            }
            $resto = substr($bloco, -8);
        }
        fclose($fh);
        return $achou;
    }

    /** Tira um caractere UTF-8 possivelmente cortado no fim do bloco lido. */
    private static function semCorte($s): string
    {
        $s = (string) $s;
        for ($i = 1; $i <= 3 && $i <= strlen($s); $i++) {
            $c = ord($s[strlen($s) - $i]);
            if ($c < 0x80) {
                break;
            }
            if ($c >= 0xC0) {
                $s = substr($s, 0, -$i);
                break;
            }
        }
        return $s;
    }

    private static function bytes(int $n): string
    {
        return $n >= 1048576 ? round($n / 1048576, 1) . ' MB' : ($n >= 1024 ? round($n / 1024) . ' KB' : $n . ' B');
    }

    /**
     * Apaga arquivos comuns de $dir com mais de $idade segundos e, se ainda houver mais de
     * $maxArquivos, os mais antigos. Não entra em subpastas nem apaga arquivos ocultos (.htaccess).
     * Devolve quantos apagou.
     */
    public static function limpar(string $dir, int $idade = 3600, int $maxArquivos = 0): int
    {
        $real = realpath($dir);
        if ($real === false || !is_dir($real)) {
            return 0;
        }
        $lista = [];
        foreach (scandir($real) ?: [] as $n) {
            if ($n === '' || $n[0] === '.') {
                continue;
            }
            $p = $real . DIRECTORY_SEPARATOR . $n;
            if (is_file($p) && !is_link($p)) {
                $lista[$p] = (int) @filemtime($p);
            }
        }
        $apagados = 0;
        $limite = time() - $idade;
        foreach ($lista as $p => $t) {
            if ($t < $limite && @unlink($p)) {
                unset($lista[$p]);
                $apagados++;
            }
        }
        if ($maxArquivos > 0 && count($lista) > $maxArquivos) {
            asort($lista);
            foreach (array_slice(array_keys($lista), 0, count($lista) - $maxArquivos) as $p) {
                if (@unlink($p)) {
                    $apagados++;
                }
            }
        }
        return $apagados;
    }
}
