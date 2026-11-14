<?php

namespace App\Controllers;

use App\Config;
use Core\Controller as ctrl;

/**
 * Endpoints de TESTE da vitrine (dados em public/showcase/vitrineData).
 * Só respondem com APP_DEBUG=true; em produção devolvem 404.
 */
class VitrineApiController extends ctrl
{
    private const DIR = __DIR__ . '/../../public/showcase/vitrineData/';

    public function __construct()
    {
        if (Config::APP_DEBUG !== true) {
            http_response_code(404);
            exit;
        }
    }

    private function dados(string $nome): array
    {
        $arq = self::DIR . $nome . '.json';
        $json = is_file($arq) ? file_get_contents($arq) : '[]';
        return json_decode($json, true) ?: [];
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
        $q = mb_strtolower(trim((string)($_GET['q'] ?? '')));
        $status = (string)($_GET['status'] ?? '');

        if ($q !== '' || $status !== '') {
            $rows = array_values(array_filter($rows, function ($r) use ($q, $status) {
                if ($status !== '' && $r['status'] !== $status) return false;
                return $q === '' || str_contains(mb_strtolower($r['nome'] . ' ' . $r['email'] . ' ' . $r['cidade']), $q);
            }));
        }

        $sort = (string)($_GET['sort'] ?? '');
        if ($sort !== '' && isset($rows[0][$sort])) {
            $dir = ($_GET['dir'] ?? 'asc') === 'desc' ? -1 : 1;
            usort($rows, fn($a, $b) => $dir * ($a[$sort] <=> $b[$sort]));
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
        $erros = [];
        $nome = trim((string)($d['nome'] ?? ''));
        $email = trim((string)($d['email'] ?? ''));
        if ($nome === '' || mb_strlen($nome) < 3) $erros['nome'] = 'Informe o nome (mín. 3 letras).';
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) $erros['email'] = 'E-mail inválido.';
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
