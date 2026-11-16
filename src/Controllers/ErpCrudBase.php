<?php

namespace App\Controllers;

use App\Utils\JsonDb;
use Core\Controller as ctrl;

/**
 * Base de CRUD do mini ERP sobre o mini banco JSON. Cada recurso (clientes, produtos, pedidos) só declara
 * a tabela, o esquema de validação (ctrl::validate: campos fora do esquema são recusados — sem mass-assignment)
 * e em quais colunas a busca/ordenação podem atuar.
 */
abstract class ErpCrudBase extends ctrl
{
    protected const TABELA = '';
    /** colunas aceitas em sort= e pesquisadas por q= */
    protected const COLUNAS = [];
    protected const BUSCA = [];

    abstract protected function regras(): array;

    /** Ajustes antes de gravar (ex.: preencher o nome do cliente no pedido). */
    protected function preparar(array $d): array
    {
        return $d;
    }

    protected static function id(): int
    {
        return max(0, (int) ($_GET['id'] ?? 0));
    }

    /** filtro[coluna][]=valor (PHP já monta o array): só colunas conhecidas, só texto, no máximo 200 valores por coluna. */
    protected static function filtros(): array
    {
        $f = $_GET['filtro'] ?? [];
        $out = [];
        if (is_array($f)) {
            foreach ($f as $col => $vals) {
                if (is_string($col) && in_array($col, static::COLUNAS, true) && is_array($vals)) {
                    $out[$col] = array_slice(array_values(array_filter(array_map(static fn ($v) => is_scalar($v) ? mb_substr((string) $v, 0, 200) : null, $vals), static fn ($v) => $v !== null)), 0, 200);
                }
            }
        }
        return array_filter($out);
    }

    public function listar()
    {
        $r = JsonDb::listar(static::TABELA, [
            'page' => $_GET['page'] ?? 1, 'size' => $_GET['size'] ?? 25, 'sort' => $_GET['sort'] ?? '', 'dir' => $_GET['dir'] ?? 'asc', 'q' => $_GET['q'] ?? '',
            'filtro' => self::filtros(),
        ], static::COLUNAS, static::BUSCA);
        ctrl::responder(['status' => 200, 'total' => $r['total'], 'retorno' => $r['retorno']]);
    }

    /** GET .../valores?col=status[&q=] — valores distintos da coluna com contagem (alimenta o filtro por valores do cabeçalho). */
    public function valores()
    {
        $col = (string) ($_GET['col'] ?? '');
        if (!in_array($col, static::COLUNAS, true)) {
            ctrl::retorno('Coluna inválida.', 422);
        }
        ctrl::retorno(JsonDb::valores(static::TABELA, $col, static::BUSCA, (string) ($_GET['q'] ?? ''), self::filtros()), 200);
    }

    public function obter()
    {
        $r = JsonDb::achar(static::TABELA, self::id());
        $r ? ctrl::retorno($r, 200) : ctrl::retorno('Registro não encontrado.', 404);
    }

    public function salvar()
    {
        $regras = $this->regras() + ['id' => ['type' => 'int', 'required' => false, 'min' => 1]];
        $d = ctrl::validate($regras);
        $id = (int) ($d['id'] ?? 0);
        unset($d['id']);
        $d = $this->preparar($d);
        if ($id > 0) {
            $r = JsonDb::atualizar(static::TABELA, $id, $d);
            $r ? ctrl::retorno($r, 200) : ctrl::retorno('Registro não encontrado.', 404);
        }
        if (count(JsonDb::todos(static::TABELA)) >= 20000) {   // demonstração: teto para o arquivo não crescer sem limite
            ctrl::retorno('Limite de registros da demonstração atingido.', 503);
        }
        ctrl::retorno(JsonDb::inserir(static::TABELA, $d), 201);
    }

    public function excluir()
    {
        $d = ctrl::validate(['id' => ['type' => 'int', 'required' => true, 'min' => 1]]);
        JsonDb::excluir(static::TABELA, (int) $d['id']) ? ctrl::retorno('ok', 200) : ctrl::retorno('Registro não encontrado.', 404);
    }

    public function opcoes()
    {
        ctrl::retorno((object) [], 200);
    }
}
