<?php

namespace App\Controllers;

use App\Utils\ErpDados;
use App\Utils\JsonDb;
use Core\Controller as ctrl;

/** Páginas (login e aplicação) e dashboard do mini ERP de demonstração. */
class ErpController extends ctrl
{
    private static function cabecalhos(): void
    {
        header('X-Content-Type-Options: nosniff');
        header('Referrer-Policy: no-referrer');
        header('Cache-Control: no-store');
    }

    public function login()
    {
        if (ErpAuthController::logado()) {
            header('Location: /erp', true, 302);
            exit;
        }
        self::cabecalhos();
        ctrl::render('erp/login', ['titulo' => 'Entrar — Mini ERP']);
    }

    public function app()
    {
        self::cabecalhos();
        ctrl::render('erp/app', ['titulo' => 'Mini ERP']);
    }

    public function dashboard()
    {
        $pedidos = JsonDb::todos('pedidos');
        $clientes = JsonDb::todos('clientes');
        $produtos = JsonDb::todos('produtos');
        $catDoProduto = [];   // nome do produto não está no pedido: distribui o total por categoria de forma proporcional (demonstração)
        foreach ($produtos as $p) {
            $catDoProduto[$p['categoria']] = ($catDoProduto[$p['categoria']] ?? 0) + 1;
        }
        $mes = [];
        $dia = [];
        $status = array_fill_keys(ErpDados::STATUS_PEDIDO, 0);
        $faturado = 0.0;
        $ticket = 0;
        $hoje = date('Y-m-d');
        $corte = date('Y-m-d', strtotime('-60 days'));
        foreach ($pedidos as $p) {
            $status[$p['status']] = ($status[$p['status']] ?? 0) + 1;
            if ($p['status'] === 'cancelado') {
                continue;
            }
            $m = substr($p['data'], 0, 7);
            $mes[$m] = ($mes[$m] ?? 0) + $p['total'];
            $faturado += $p['total'];
            $ticket++;
            if ($p['data'] >= $corte && $p['data'] <= $hoje) {
                $dia[$p['data']] ??= ['dia' => $p['data'], 'pedidos' => 0, 'valor' => 0];
                $dia[$p['data']]['pedidos']++;
                $dia[$p['data']]['valor'] = round($dia[$p['data']]['valor'] + $p['total'], 2);
            }
        }
        unset($mes[date('Y-m')]);   // o mês corrente está em andamento: não entra no gráfico (a queda no fim parecia erro)
        ksort($mes);
        ksort($dia);
        $totCat = array_sum($catDoProduto) ?: 1;
        $porCategoria = [];
        foreach ($catDoProduto as $c => $n) {
            $porCategoria[] = ['categoria' => $c, 'valor' => round($faturado * $n / $totCat, 2)];
        }
        usort($porCategoria, static fn ($a, $b) => $b['valor'] <=> $a['valor']);
        $ult = $pedidos;
        usort($ult, static fn ($a, $b) => [$b['data'], $b['id']] <=> [$a['data'], $a['id']]);
        $vm = [];
        foreach ($mes as $k => $v) {
            $vm[] = ['mes' => $k, 'valor' => round($v, 2)];
        }
        $n = count($vm);   // compara os dois últimos meses COMPLETOS (o mês corrente ainda está em andamento)
        $variacao = $n >= 3 && $vm[$n - 3]['valor'] > 0 ? round(($vm[$n - 2]['valor'] / $vm[$n - 3]['valor'] - 1) * 100, 1) : 0;
        $ativos = count(array_filter($clientes, static fn ($c) => $c['ativo']));
        $semEstoque = count(array_filter($produtos, static fn ($p) => (int) $p['estoque'] === 0));
        ctrl::retorno([
            'kpis' => [
                ['chave' => 'faturamento', 'titulo' => 'Faturamento', 'valor' => round($faturado, 2), 'variacao' => $variacao, 'formato' => 'money'],
                ['chave' => 'pedidos', 'titulo' => 'Pedidos', 'valor' => count($pedidos), 'variacao' => 0, 'formato' => 'number'],
                ['chave' => 'clientes', 'titulo' => 'Clientes ativos', 'valor' => $ativos, 'variacao' => 0, 'formato' => 'number'],
                ['chave' => 'ticket', 'titulo' => 'Ticket médio', 'valor' => $ticket ? round($faturado / $ticket, 2) : 0, 'variacao' => 0, 'formato' => 'money'],
                ['chave' => 'semEstoque', 'titulo' => 'Produtos sem estoque', 'valor' => $semEstoque, 'variacao' => 0, 'formato' => 'number'],
            ],
            'vendasMensais' => $vm,
            'porCategoria' => $porCategoria,
            'porStatus' => array_map(static fn ($k, $v) => ['status' => $k, 'qtd' => $v], array_keys($status), $status),
            'series' => array_values($dia),
            'ultimosPedidos' => array_slice($ult, 0, 8),
        ], 200);
    }
}
