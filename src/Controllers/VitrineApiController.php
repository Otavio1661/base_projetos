<?php

namespace App\Controllers;

use App\Config;
use Core\Controller as ctrl;
use Core\Security\Crypto;
use Core\Security\Input;
use Core\Security\Prompt;
use Core\Security\Upload;

/**
 * Endpoints de TESTE da vitrine (dados em public/showcase/vitrineData).
 * Só respondem com APP_DEBUG=true; em produção devolvem 404.
 *
 * Endurecimento (mesmo sendo só de teste, servem de modelo para APIs reais):
 *  - cabeçalhos: nosniff, Cache-Control: no-store, CSP "default-src 'none'" (resposta é só JSON);
 *  - corpo limitado a 1 MB (413); envelope cifrado v2 conferido antes de qualquer rota (falha → 400
 *    JSON limpo; o formato antigo {x,y,z} também é recusado);
 *  - parâmetros GET só como texto (q[]=... não vira "Array" nem aviso PHP), com limites de tamanho;
 *  - ordenação só por campo existente e escalar; JSON com < > & ' " escapados (JSON_HEX_*).
 *
 * Criptografia v2 (docs/SEGURANCA.md, seção 5): POST /vitrine/api/echo e /vitrine/api/echo-cifrado
 * (este último responde cifrado quando o cliente manda X-R4-Res: 1).
 *
 * Demonstrações de defesa contra injeção (docs/SEGURANCA.md, seção 13):
 *  - POST /vitrine/api/cadastro   → validação por ESQUEMA (Core\Security\Input), recusa campos extras;
 *  - POST /vitrine/api/upload     → upload seguro (Core\Security\Upload), grava em storage/uploads/vitrine;
 *  - POST /vitrine/api/prompt     → texto para LLM (Core\Security\Prompt), SEM chamar nenhum modelo;
 *  - GET  /vitrine/api/busca?q=   → busca literal nos JSON do vitrineData (nada vira SQL/regex);
 *  - GET  /vitrine/api/sql-seguro?nome= → SQLite em memória com prepare/bind.
 */
class VitrineApiController extends ctrl
{
    private const DIR = __DIR__ . '/../../public/showcase/vitrineData/';
    private const MAX_BODY = 1048576;          // 1 MB (JSON)
    private const MAX_UPLOAD_BODY = 3145728;   // 3 MB (multipart do /upload; o arquivo em si: 2 MB)

    public function __construct()
    {
        if (Config::APP_DEBUG !== true) {
            http_response_code(404);
            exit;
        }
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: no-store, max-age=0');
        header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
        header('Referrer-Policy: no-referrer');

        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
            $tamanho = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
            // multipart (upload): o PHP já consumiu o corpo; aqui só o limite pelo Content-Length
            if (stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'multipart/form-data') === 0) {
                if ($tamanho > self::MAX_UPLOAD_BODY) {
                    $this->json(['status' => 413, 'retorno' => 'Envio grande demais (máx. 2 MB por arquivo)'], 413);
                }
                return;
            }
            $bruto = file_get_contents('php://input', false, null, 0, self::MAX_BODY + 1);
            if ($tamanho > self::MAX_BODY || strlen((string)$bruto) > self::MAX_BODY) {
                $this->json(['status' => 413, 'retorno' => 'Corpo da requisição grande demais (máx. 1 MB)'], 413);
            }
            // envelope cifrado (v2) é conferido ANTES de qualquer rota: falha → 400 JSON limpo
            // (o formato antigo {x,y,z} também cai aqui e é recusado)
            $json = json_decode((string)$bruto, true);
            if (Crypto::pareceEnvelope($json)) {
                ctrl::getPost(false);
                if (ctrl::$postErro === 400) {
                    ctrl::falhaCripto();
                }
            }
        }
    }

    /** JSON com escape de < > & ' " (nada vira HTML mesmo se alguém servir isto como text/html). */
    protected function json($data, $statusCode = 200)
    {
        http_response_code($statusCode);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
        exit;
    }

    private function dados(string $nome): array
    {
        $arq = self::DIR . $nome . '.json';
        $json = is_file($arq) ? file_get_contents($arq) : '[]';
        return json_decode($json, true) ?: [];
    }

    /** Parâmetro GET como texto (array/ausente → ''), cortado em $max caracteres. */
    private function texto(string $k, int $max = 100): string
    {
        $v = $_GET[$k] ?? '';
        return is_string($v) ? mb_substr(trim($v), 0, $max) : '';
    }

    private function inteiro(string $k, int $padrao, int $min, int $max): int
    {
        $v = filter_var($_GET[$k] ?? $padrao, FILTER_VALIDATE_INT);
        return max($min, min($max, $v === false ? $padrao : $v));
    }

    /**
     * GET /vitrine/api/clientes?q=&status=&page=1&size=10&sort=nome&dir=asc
     *
     * CONTRATO esperado pelo <r4-grid src="..."> (mesmo texto completo em
     * public/showcase/vitrineData/vitrineData.js):
     *   - HTTP 200, UTF-8, Content-Type: application/json
     *   - corpo: array puro [ {...} ]  OU  { status, retorno: [ {...} ] }
     *     OU, paginado no servidor, { status, total, page, size, retorno: [ {...} ] }
     *   - cada linha = objeto plano; números como number (não "10,5"); datas
     *     "AAAA-MM-DD"/ISO 8601; booleano true/false; vazio null; nunca HTML
     *   - erro: status 4xx/5xx com { status, retorno: "mensagem" }
     */
    public function clientes()
    {
        $rows = $this->dados('clientes');
        $q = mb_strtolower($this->texto('q'));
        $status = $this->texto('status', 30);

        if ($q !== '' || $status !== '') {
            $rows = array_values(array_filter($rows, function ($r) use ($q, $status) {
                if ($status !== '' && ($r['status'] ?? '') !== $status) return false;
                $alvo = ($r['nome'] ?? '') . ' ' . ($r['email'] ?? '') . ' ' . ($r['cidade'] ?? '');
                return $q === '' || str_contains(mb_strtolower((string)$alvo), $q);
            }));
        }

        // só ordena por campo que existe e é escalar (nada de sort=__proto__ / sort[]=...)
        $sort = $this->texto('sort', 40);
        if ($sort !== '' && isset($rows[0]) && array_key_exists($sort, $rows[0]) && (is_scalar($rows[0][$sort]) || $rows[0][$sort] === null)) {
            $dir = $this->texto('dir', 4) === 'desc' ? -1 : 1;
            usort($rows, fn($a, $b) => $dir * (($a[$sort] ?? null) <=> ($b[$sort] ?? null)));
        }

        $total = count($rows);
        $size = $this->inteiro('size', 10, 1, 100);
        $page = $this->inteiro('page', 1, 1, 10000);
        $this->json([
            'status' => 200,
            'total' => $total,
            'page' => $page,
            'size' => $size,
            'retorno' => array_slice($rows, ($page - 1) * $size, $size),
        ]);
    }

    /**
     * POST /vitrine/api/echo — devolve o que recebeu. Envelope v2 → decifrado e "cifrado": true
     * (o pacote só vale para POST /vitrine/api/echo: AAD = método + caminho). A resposta é JSON comum.
     */
    public function echo()
    {
        $this->json(['status' => 200, 'retorno' => $this->eco()]);
    }

    /**
     * POST /vitrine/api/echo-cifrado — igual ao /echo, mas a RESPOSTA vai cifrada para a sessão do
     * cliente quando ele pede (cabeçalho X-R4-Res: 1 + corpo cifrado): {v:2, z, x}.
     * R4.http.post(url, dados, { cifrarResposta: true }) decifra sozinho.
     */
    public function echoCifrado()
    {
        $eco = $this->eco();
        $eco['respostaCifrada'] = ctrl::respostaCifradaPedida();
        ctrl::responderCifrado(['status' => 200, 'retorno' => $eco]);
    }

    /** Corpo recebido (decifrado se veio no envelope v2) + se veio cifrado. */
    private function eco(): array
    {
        $dados = ctrl::getPost();
        if (ctrl::$postErro === 400 && ctrl::$cryptoErro !== '') {
            ctrl::falhaCripto();
        }
        $cifrado = ctrl::postCifrado();
        if ($dados === null && !$cifrado) {
            $dados = json_decode((string) file_get_contents('php://input', false, null, 0, self::MAX_BODY), true, 32);
        }
        return ['cifrado' => $cifrado, 'recebido' => $dados ?? ($cifrado ? [] : null)];
    }

    private const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
        'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

    /**
     * POST /vitrine/api/cadastro — validação por ESQUEMA (modelo para APIs reais).
     * Campos não declarados → 422 "Campo não permitido." (mass-assignment); tipos errados (array no lugar
     * de texto, número gigante, data impossível) → 422 com mensagem por campo, nunca aviso/erro PHP.
     * Texto com cara de SQL ("' OR 1=1 --") é ACEITO como texto: a proteção contra SQL é a consulta
     * preparada na hora de gravar, não a validação. Os "sinais" só mostram o que um log registraria.
     */
    public function cadastro()
    {
        $dados = ctrl::validate([
            'nome'       => ['type' => 'string', 'required' => true, 'minLength' => 3, 'maxLength' => 120, 'mensagem' => 'Informe o nome (de 3 a 120 letras).'],
            'email'      => ['type' => 'email', 'required' => true, 'mensagem' => 'E-mail inválido.'],
            'cpf'        => ['type' => 'cpf'],
            'telefone'   => ['type' => 'phone'],
            'nascimento' => ['type' => 'date', 'min' => '1900-01-01', 'max' => date('Y-m-d')],
            'uf'         => ['type' => 'enum', 'in' => self::UFS],
            'plano'      => ['type' => 'enum', 'in' => ['básico', 'pro', 'empresa'], 'default' => 'básico'],
            'contato'    => ['type' => 'enum', 'in' => ['email', 'whats', 'tel']],
            'obs'        => ['type' => 'string', 'multiline' => true, 'maxLength' => 2000],
            'mensagem'   => ['type' => 'string', 'multiline' => true, 'maxLength' => 5000],
            'aceite'     => ['type' => 'bool'],
        ]);
        $sinais = [];
        foreach (['nome', 'obs', 'mensagem'] as $k) {
            if (!empty($dados[$k]) && ($s = Prompt::looksLikeInjection($dados[$k]))) {
                $sinais[$k] = array_column($s, 'sinal');
            }
            if (!empty($dados[$k]) && preg_match("/('|\")\s*(or|and)\s|union\s+select|;\s*drop\s|--\s*$/i", $dados[$k])) {
                $sinais[$k][] = 'parece-sql (aceito como TEXTO; o banco usa prepare/bind)';
            }
        }
        $this->json(['status' => 200, 'retorno' => [
            'id' => random_int(1000, 9999), 'nome' => $dados['nome'], 'email' => $dados['email'],
            'dados' => $dados, 'sinais' => (object) $sinais,
        ]]);
    }

    /**
     * POST /vitrine/api/upload (multipart, campo "arquivo") — Core\Security\Upload.
     * Allowlist png/jpg/pdf/csv/txt até 2 MB; MIME real + assinatura + bloqueio de dupla extensão;
     * nome aleatório; grava em storage/uploads/vitrine (fora de public/). Apaga o que tiver mais de
     * 1 hora (e mantém no máximo 50 arquivos) a cada chamada. A resposta nunca traz caminho do servidor.
     */
    public function upload()
    {
        $dir = Upload::storage('uploads/vitrine');
        if (is_dir($dir)) {
            Upload::limpar($dir, 3600, 50);
        }
        if (!isset($_FILES['arquivo'])) {
            $this->json(['status' => 422, 'retorno' => 'Dados inválidos', 'erros' => ['arquivo' => 'Envie o arquivo no campo "arquivo" (multipart/form-data).']], 422);
        }
        $r = Upload::save('arquivo', [
            'permitidos' => ['png', 'jpg', 'jpeg', 'pdf', 'csv', 'txt'],
            'maxBytes' => 2 * 1024 * 1024,
            'destino' => $dir,
            'imagem' => ['maxLargura' => 6000, 'maxAltura' => 6000],
        ]);
        if (!$r['ok']) {
            $this->json(['status' => 422, 'retorno' => 'Arquivo recusado', 'erros' => ['arquivo' => implode(' ', $r['erros'])]], 422);
        }
        $a = $r['arquivo'];
        unset($a['caminho']);   // nunca devolva caminho do servidor
        $this->json(['status' => 200, 'retorno' => $a + ['observacao' => 'Gravado com nome aleatório fora da pasta pública; apagado em até 1 hora.']]);
    }

    /**
     * POST /vitrine/api/prompt {texto} — mostra como o texto do usuário iria para um LLM.
     * NÃO chama modelo nenhum: devolve o bloco delimitado, a mensagem de sistema e os sinais.
     */
    public function prompt()
    {
        $bruto = ctrl::getPost();
        $original = is_array($bruto) && isset($bruto['texto']) && is_string($bruto['texto']) ? $bruto['texto'] : '';
        $dados = ctrl::validate([
            'texto' => ['type' => 'string', 'required' => true, 'multiline' => true, 'maxLength' => 8000],
            'instrucao' => ['type' => 'string', 'maxLength' => 500],
        ]);
        $p = Prompt::montar($dados['instrucao'] ?? 'Resuma a mensagem do cliente em até 3 linhas.', $dados['texto'], ['max' => 4000]);
        $this->json(['status' => 200, 'retorno' => [
            'system' => $p['system'],
            'user' => $p['user'],
            'id' => $p['id'],
            'sinais' => Prompt::looksLikeInjection($original !== '' ? $original : $dados['texto']),
            'observacao' => 'Nenhum LLM foi chamado. Filtros não eliminam injeção de prompt: limite as ferramentas do modelo e valide a SAÍDA dele.',
        ]]);
    }

    /**
     * GET /vitrine/api/busca?q= — busca em clientes.json como TEXTO LITERAL (sem SQL, sem regex do usuário).
     * "' OR 1=1 --" procura exatamente esses caracteres → 0 resultados (nada "vaza").
     */
    public function busca()
    {
        $q = Input::text($_GET['q'] ?? '', 100);
        $alvo = mb_strtolower($q);
        $rows = $alvo === '' ? [] : array_values(array_filter($this->dados('clientes'), function ($r) use ($alvo) {
            $t = mb_strtolower(($r['nome'] ?? '') . ' ' . ($r['email'] ?? '') . ' ' . ($r['cidade'] ?? ''));
            return str_contains($t, $alvo);
        }));
        $this->json(['status' => 200, 'q' => $q, 'total' => count($rows), 'retorno' => array_slice(array_map(
            fn($r) => ['id' => $r['id'] ?? null, 'nome' => $r['nome'] ?? '', 'email' => $r['email'] ?? '', 'cidade' => $r['cidade'] ?? ''],
            $rows
        ), 0, 20), 'observacao' => 'q é comparado como texto literal (str_contains); nenhum SQL ou regex é montado com ele.']);
    }

    /**
     * GET /vitrine/api/sql-seguro?nome= — SQL de verdade (SQLite em memória) com prepare/bind.
     * Com nome = x' OR '1'='1 a consulta procura um cliente com ESSE nome → 0 linhas.
     * O campo "sqlSeConcatenado" só MOSTRA o texto que um código vulnerável montaria — nunca é executado.
     */
    public function sqlSeguro()
    {
        if (!extension_loaded('pdo_sqlite')) {
            $this->json(['status' => 501, 'retorno' => 'pdo_sqlite não está disponível neste PHP'], 501);
        }
        $nome = Input::text($_GET['nome'] ?? '', 120);
        $contem = Input::text($_GET['contem'] ?? '', 60);
        try {
            $pdo = new \PDO('sqlite::memory:', null, null, [
                \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
                \PDO::ATTR_DEFAULT_FETCH_MODE => \PDO::FETCH_ASSOC,
                \PDO::ATTR_EMULATE_PREPARES => false,
            ]);
            $pdo->exec('CREATE TABLE clientes (id INTEGER PRIMARY KEY, nome TEXT NOT NULL, email TEXT, cidade TEXT)');
            $ins = $pdo->prepare('INSERT INTO clientes (id, nome, email, cidade) VALUES (:id, :nome, :email, :cidade)');
            foreach (array_slice($this->dados('clientes'), 0, 25) as $r) {
                $ins->execute([':id' => (int)($r['id'] ?? 0), ':nome' => (string)($r['nome'] ?? ''), ':email' => (string)($r['email'] ?? ''), ':cidade' => (string)($r['cidade'] ?? '')]);
            }
            $totalTabela = (int)$pdo->query('SELECT COUNT(*) FROM clientes')->fetchColumn();

            $sql = 'SELECT id, nome, email, cidade FROM clientes WHERE nome = :nome';
            $st = $pdo->prepare($sql);
            $st->bindValue(':nome', $nome, \PDO::PARAM_STR);
            $st->execute();
            $linhas = $st->fetchAll();

            // LIKE também é parâmetro; % e _ digitados são escapados (senão "%" listaria tudo)
            $linhasContem = [];
            $sqlContem = "SELECT id, nome FROM clientes WHERE nome LIKE :padrao ESCAPE '\\' LIMIT 10";
            if ($contem !== '') {
                $st2 = $pdo->prepare($sqlContem);
                $st2->bindValue(':padrao', '%' . strtr($contem, ['\\' => '\\\\', '%' => '\\%', '_' => '\\_']) . '%', \PDO::PARAM_STR);
                $st2->execute();
                $linhasContem = $st2->fetchAll();
            }
        } catch (\Throwable $e) {
            error_log('[vitrine/sql-seguro] ' . $e->getMessage());
            $this->json(['status' => 500, 'retorno' => 'Erro ao consultar'], 500);
        }
        $this->json(['status' => 200, 'retorno' => [
            'nome' => $nome,
            'sql' => $sql,
            'parametros' => [':nome' => $nome],
            'linhas' => $linhas,
            'total' => count($linhas),
            'totalNaTabela' => $totalTabela,
            'contem' => $contem === '' ? null : ['sql' => $sqlContem, 'total' => count($linhasContem), 'linhas' => $linhasContem],
            'sqlSeConcatenado' => "SELECT ... WHERE nome = '" . $nome . "'   ← exemplo do ERRO (nunca executado)",
            'observacao' => 'O valor vai separado do SQL (prepare/bind): aspas, OR, --, UNION são só caracteres do nome procurado.',
        ]]);
    }

    /** GET /vitrine/api/lento?ms=800 — resposta atrasada (testa estados de carregamento; máx. 3000ms) */
    public function lento()
    {
        usleep($this->inteiro('ms', 800, 0, 3000) * 1000);
        $this->json(['status' => 200, 'retorno' => $this->dados('clientes')]);
    }

    /** GET /vitrine/api/falha?code=500 — erro proposital (testa tratamento de falhas) */
    public function falha()
    {
        $code = $this->inteiro('code', 500, 400, 599);
        $this->json(['status' => $code, 'retorno' => 'Erro proposital de teste'], $code);
    }
}
