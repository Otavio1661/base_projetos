<?php

namespace App\Controllers;

use App\Config;
use Core\Controller as ctrl;

/**
 * Endpoints de TESTE da vitrine (dados em public/showcase/vitrineData).
 * Só respondem com APP_DEBUG=true; em produção devolvem 404.
 *
 * Endurecimento (mesmo sendo só de teste, servem de modelo para APIs reais):
 *  - cabeçalhos: nosniff, Cache-Control: no-store, CSP "default-src 'none'" (resposta é só JSON);
 *  - corpo limitado a 1 MB (413), pacote cifrado {x,y,z} conferido antes de descriptografar (400);
 *  - parâmetros GET só como texto (q[]=... não vira "Array" nem aviso PHP), com limites de tamanho;
 *  - ordenação só por campo existente e escalar; JSON com < > & ' " escapados (JSON_HEX_*).
 */
class VitrineApiController extends ctrl
{
    private const DIR = __DIR__ . '/../../public/showcase/vitrineData/';
    private const MAX_BODY = 1048576;   // 1 MB

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
            $bruto = file_get_contents('php://input', false, null, 0, self::MAX_BODY + 1);
            if ($tamanho > self::MAX_BODY || strlen((string)$bruto) > self::MAX_BODY) {
                $this->json(['status' => 413, 'retorno' => 'Corpo da requisição grande demais (máx. 1 MB)'], 413);
            }
            $json = json_decode((string)$bruto, true);
            if (is_array($json) && (isset($json['x']) || isset($json['y']) || isset($json['z'])) && !$this->pacoteValido($json)) {
                $this->json(['status' => 400, 'retorno' => 'Pacote de criptografia inválido'], 400);
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

    /** {x,y,z}: strings base64; salt de 16 bytes, IV de 12 bytes, dados com pelo menos a tag GCM (16). */
    private function pacoteValido(array $p): bool
    {
        foreach (['x', 'y', 'z'] as $k) {
            if (!isset($p[$k]) || !is_string($p[$k]) || strlen($p[$k]) > self::MAX_BODY) return false;
        }
        $x = base64_decode($p['x'], true);
        $y = base64_decode($p['y'], true);
        $z = base64_decode($p['z'], true);
        return $x !== false && $y !== false && $z !== false && strlen($y) === 16 && strlen($z) === 12 && strlen($x) >= 16;
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

    /** POST /vitrine/api/echo — devolve o que recebeu (descriptografado, se vier em {x,y,z}) */
    public function echo()
    {
        $bruto = json_decode(file_get_contents('php://input'), true);
        $cifrado = is_array($bruto) && isset($bruto['x'], $bruto['y'], $bruto['z']);
        $dados = ctrl::getPost();
        if ($cifrado && $dados === null) {
            $this->json(['status' => 400, 'retorno' => 'Falha ao descriptografar (chave diferente?)'], 400);
        }
        $this->json(['status' => 200, 'retorno' => ['cifrado' => $cifrado, 'recebido' => $dados ?? $bruto]]);
    }

    /** POST /vitrine/api/cadastro — valida nome/email; 422 com erros por campo (testa formulários) */
    public function cadastro()
    {
        $d = ctrl::getPost() ?? [];
        $txt = fn($v) => is_string($v) ? trim($v) : '';
        $erros = [];
        $nome = $txt($d['nome'] ?? '');
        $email = $txt($d['email'] ?? '');
        if ($nome === '' || mb_strlen($nome) < 3 || mb_strlen($nome) > 120) $erros['nome'] = 'Informe o nome (de 3 a 120 letras).';
        if (strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL)) $erros['email'] = 'E-mail inválido.';
        if ($erros) {
            $this->json(['status' => 422, 'retorno' => 'Dados inválidos', 'erros' => $erros], 422);
        }
        $this->json(['status' => 200, 'retorno' => ['id' => random_int(1000, 9999), 'nome' => $nome, 'email' => $email]]);
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
