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

    public function listar()
    {
        $r = JsonDb::listar(static::TABELA, [
            'page' => $_GET['page'] ?? 1, 'size' => $_GET['size'] ?? 25, 'sort' => $_GET['sort'] ?? '', 'dir' => $_GET['dir'] ?? 'asc', 'q' => $_GET['q'] ?? '',
        ], static::COLUNAS, static::BUSCA);
        ctrl::responder(['status' => 200, 'total' => $r['total'], 'retorno' => $r['retorno']]);
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
