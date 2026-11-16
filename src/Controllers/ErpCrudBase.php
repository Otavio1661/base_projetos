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
    /** Cargos que podem GRAVAR (salvar, excluir, importar) neste recurso. Ler: qualquer cargo logado. 'gestor' pode tudo. */
    protected const ESCRITA = ['gestor'];
    /** Tamanho máximo do termo de busca q= (caracteres). */
    protected const MAX_Q = 100;

    abstract protected function regras(): array;

    /** Ajustes antes de gravar (ex.: preencher o nome do cliente no pedido). */
    protected function preparar(array $d): array
    {
        return $d;
    }

    /** Parâmetro de query como TEXTO: array (q[]=x), ausente ou outro tipo → '' (nunca "Array" nem aviso do PHP). */
    protected static function qs(string $k, int $max = 100): string
    {
        $v = $_GET[$k] ?? '';
        return is_string($v) ? mb_substr($v, 0, $max) : '';
    }

    /** Parâmetro de query inteiro (só dígitos; senão $padrao). */
    protected static function qi(string $k, int $padrao): int
    {
        $v = $_GET[$k] ?? null;
        return is_string($v) && preg_match('/^\s*-?[0-9]{1,9}\s*$/', $v) ? (int) $v : $padrao;
    }

    protected static function id(): int
    {
        return max(0, self::qi('id', 0));
    }

    /** Autorização por cargo: só ESCRITA (ou gestor) altera este recurso; senão 403 e encerra. */
    protected static function exigirEscrita(): void
    {
        $u = ErpAuthController::logado();
        $cargo = (string) ($u['cargo'] ?? '');
        if (!$u || ($cargo !== 'gestor' && !in_array($cargo, static::ESCRITA, true))) {
            ctrl::retorno('Seu cargo não tem permissão para alterar ' . static::TABELA . '.', 403);
        }
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
            'page' => self::qi('page', 1), 'size' => self::qi('size', 25), 'sort' => self::qs('sort', 40), 'dir' => self::qs('dir', 10), 'q' => self::qs('q', static::MAX_Q),
            'filtro' => self::filtros(),
        ], static::COLUNAS, static::BUSCA);
        ctrl::responder(['status' => 200, 'total' => $r['total'], 'retorno' => $r['retorno']]);
    }

    /** GET .../valores?col=status[&q=] — valores distintos da coluna com contagem (alimenta o filtro por valores do cabeçalho). */
    public function valores()
    {
        $col = self::qs('col', 40);
        if (!in_array($col, static::COLUNAS, true)) {
            ctrl::retorno('Coluna inválida.', 422);
        }
        ctrl::retorno(JsonDb::valores(static::TABELA, $col, static::BUSCA, self::qs('q', static::MAX_Q), self::filtros()), 200);
    }

    public function obter()
    {
        $r = JsonDb::achar(static::TABELA, self::id());
        $r ? ctrl::retorno($r, 200) : ctrl::retorno('Registro não encontrado.', 404);
    }

    public function salvar()
    {
        self::exigirEscrita();
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
        self::exigirEscrita();
        $d = ctrl::validate(['id' => ['type' => 'int', 'required' => true, 'min' => 1]]);
        JsonDb::excluir(static::TABELA, (int) $d['id']) ? ctrl::retorno('ok', 200) : ctrl::retorno('Registro não encontrado.', 404);
    }

    public function opcoes()
    {
        ctrl::retorno((object) [], 200);
    }
}
