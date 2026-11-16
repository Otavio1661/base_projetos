<?php

namespace App\Controllers;

use App\Utils\ErpDados;
use Core\Controller as ctrl;

class ErpProdutosController extends ErpCrudBase
{
    protected const TABELA = 'produtos';
    protected const COLUNAS = ['id', 'sku', 'nome', 'categoria', 'preco', 'estoque', 'ativo'];
    protected const BUSCA = ['sku', 'nome', 'categoria', 'preco', 'estoque'];
    protected const ESCRITA = ['gestor', 'estoque'];

    private static function categorias(): array
    {
        return array_values(array_unique(array_column(ErpDados::PRODUTOS, 1)));
    }

    protected function regras(): array
    {
        return [
            'sku' => ['type' => 'string', 'required' => true, 'minLength' => 3, 'maxLength' => 30, 'pattern' => '/^[A-Za-z0-9._-]+$/'],
            'nome' => ['type' => 'string', 'required' => true, 'minLength' => 2, 'maxLength' => 120],
            'categoria' => ['type' => 'enum', 'in' => self::categorias(), 'required' => true],
            'preco' => ['type' => 'float', 'required' => true, 'min' => 0, 'max' => 10000000],
            'estoque' => ['type' => 'int', 'required' => true, 'min' => 0, 'max' => 1000000],
            'ativo' => ['type' => 'bool', 'required' => false, 'default' => true],
        ];
    }

    public function opcoes()
    {
        ctrl::retorno(['categorias' => self::categorias()], 200);
    }
}
