<?php

namespace App\Controllers;

use App\Utils\ErpDados;
use App\Utils\JsonDb;
use Core\Controller as ctrl;

class ErpPedidosController extends ErpCrudBase
{
    protected const TABELA = 'pedidos';
    protected const COLUNAS = ['id', 'cliente', 'data', 'itens', 'total', 'status', 'obs'];
    protected const BUSCA = ['id', 'cliente', 'data', 'itens', 'total', 'status', 'obs'];
    protected const ESCRITA = ['gestor', 'vendas', 'financeiro'];

    protected function regras(): array
    {
        return [
            'clienteId' => ['type' => 'int', 'required' => true, 'min' => 1],
            'data' => ['type' => 'date', 'required' => true],
            'itens' => ['type' => 'int', 'required' => true, 'min' => 1, 'max' => 1000],
            'total' => ['type' => 'float', 'required' => true, 'min' => 0, 'max' => 100000000],
            'status' => ['type' => 'enum', 'in' => ErpDados::STATUS_PEDIDO, 'required' => true],
            'obs' => ['type' => 'string', 'required' => false, 'maxLength' => 200, 'default' => ''],
        ];
    }

    protected function preparar(array $d): array
    {
        $c = JsonDb::achar('clientes', (int) $d['clienteId']);
        if (!$c) {
            ctrl::responder(['status' => 422, 'retorno' => 'Dados inválidos', 'erros' => ['clienteId' => 'Cliente inexistente.']], 422);
        }
        $d['cliente'] = $c['nome'];
        return $d;
    }

    public function opcoes()
    {
        $cl = array_map(static fn ($c) => ['id' => $c['id'], 'nome' => $c['nome']], array_slice(JsonDb::todos('clientes'), 0, 200));
        ctrl::retorno(['status' => ErpDados::STATUS_PEDIDO, 'clientes' => $cl], 200);
    }
}
