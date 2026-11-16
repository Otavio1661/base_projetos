<?php

namespace App\Controllers;

use App\Utils\ErpDados;
use App\Utils\JsonDb;
use Core\Controller as ctrl;
use Core\Security\Input;

class ErpClientesController extends ErpCrudBase
{
    protected const TABELA = 'clientes';
    protected const COLUNAS = ['id', 'nome', 'email', 'telefone', 'cidade', 'uf', 'tipo', 'documento', 'limite', 'ativo', 'criadoEm'];
    protected const BUSCA = ['nome', 'email', 'telefone', 'cidade', 'uf', 'tipo', 'documento', 'criadoEm'];

    private static function ufs(): array
    {
        return array_values(array_unique(array_column(ErpDados::CIDADES, 1)));
    }

    protected function regras(): array
    {
        return [
            'nome' => ['type' => 'string', 'required' => true, 'minLength' => 3, 'maxLength' => 120],
            'email' => ['type' => 'email', 'required' => true],
            'telefone' => ['type' => 'string', 'required' => false, 'maxLength' => 20, 'default' => ''],
            'cidade' => ['type' => 'string', 'required' => true, 'maxLength' => 80],
            'uf' => ['type' => 'enum', 'in' => self::ufs(), 'required' => true],
            'tipo' => ['type' => 'enum', 'in' => ['PF', 'PJ'], 'required' => true],
            'documento' => ['type' => 'string', 'required' => false, 'maxLength' => 18, 'default' => ''],
            'limite' => ['type' => 'float', 'required' => false, 'min' => 0, 'max' => 10000000, 'default' => 0],
            'ativo' => ['type' => 'bool', 'required' => false, 'default' => true],
            'criadoEm' => ['type' => 'date', 'required' => false],
        ];
    }

    protected function preparar(array $d): array
    {
        if (empty($d['criadoEm'])) {
            $d['criadoEm'] = date('Y-m-d');
        }
        return $d;
    }

    public function opcoes()
    {
        ctrl::retorno(['ufs' => self::ufs(), 'tipos' => ['PF', 'PJ']], 200);
    }

    /** POST /erp/api/clientes/importar { linhas: [...] } — recebe as linhas já lidas no navegador (filedrop da libr4). */
    public function importar()
    {
        $corpo = ctrl::getPost();
        $linhas = is_array($corpo) && isset($corpo['linhas']) && is_array($corpo['linhas']) && array_is_list($corpo['linhas']) ? $corpo['linhas'] : null;
        if ($linhas === null || !$linhas) {
            ctrl::responder(['status' => 422, 'retorno' => 'Dados inválidos', 'erros' => ['linhas' => 'Envie uma lista de linhas.']], 422);
        }
        if (count($linhas) > 500) {
            ctrl::responder(['status' => 422, 'retorno' => 'Dados inválidos', 'erros' => ['linhas' => 'No máximo 500 linhas por envio.']], 422);
        }
        $corpo = ['linhas' => $linhas];
        $regras = $this->regras();
        unset($regras['criadoEm']);
        $ok = [];
        $rej = [];
        foreach ($corpo['linhas'] as $i => $linha) {
            $r = Input::validate(is_array($linha) ? $linha : [], $regras, ['extras' => 'ignorar']);
            if ($r['valido']) {
                $ok[] = $this->preparar($r['dados']);
            } else {
                $rej[] = ['linha' => $i + 1, 'erro' => implode('; ', array_map(static fn ($k, $v) => "$k: $v", array_keys($r['erros']), $r['erros']))];
            }
        }
        $n = 0;
        if ($ok) {
            JsonDb::mutar('clientes', static function (array $l) use ($ok, &$n) {
                $max = 0;
                foreach ($l as $c) {
                    $max = max($max, (int) $c['id']);
                }
                foreach ($ok as $c) {
                    if (count($l) >= 20000) {
                        break;
                    }
                    $c['id'] = ++$max;
                    $l[] = $c;
                    $n++;
                }
                return $l;
            });
        }
        ctrl::retorno(['importados' => $n, 'rejeitados' => array_slice($rej, 0, 50)], 200);
    }
}
