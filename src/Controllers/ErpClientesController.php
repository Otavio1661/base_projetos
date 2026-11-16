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
    protected const ESCRITA = ['gestor', 'vendas'];
    /** Teto de registros da tabela (demonstração: o arquivo não cresce sem limite). */
    private const MAX_REGISTROS = 20000;

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
    /**
     * O navegador NÃO é confiável: o servidor reaplica tudo (esquema de cada linha, só os campos de CAMPOS_IMPORTACAO,
     * até 500 linhas, corpo ≤ 2 MB / JSON ≤ 32 níveis pelo getPost). Linhas inválidas ou com e-mail repetido (na base ou
     * no próprio lote) são rejeitadas uma a uma; as válidas entram numa ÚNICA gravação atômica (tudo do lote ou nada
     * dele em caso de falha de disco). Fórmulas (=, +, -, @) ficam como texto: quem neutraliza é a EXPORTAÇÃO (R4.files.csvSafe).
     */
    public function importar()
    {
        self::exigirEscrita();
        $corpo = ctrl::getPost();
        if (ctrl::$postErro === 413) {
            ctrl::retorno('Corpo da requisição grande demais', 413);
        }
        if (ctrl::$postErro === 400) {
            ctrl::$cryptoErro !== '' ? ctrl::falhaCripto() : ctrl::responder(['status' => 400, 'retorno' => 'JSON inválido', 'erros' => ['_' => 'Corpo da requisição inválido.']], 400);
        }
        if (is_array($corpo) && array_diff(array_keys($corpo), ['linhas'])) {
            ctrl::responder(['status' => 422, 'retorno' => 'Dados inválidos', 'erros' => ['_' => 'Só o campo "linhas" é aceito.']], 422);
        }
        $linhas = is_array($corpo) && isset($corpo['linhas']) && is_array($corpo['linhas']) && array_is_list($corpo['linhas']) ? $corpo['linhas'] : null;
        if ($linhas === null || !$linhas) {
            ctrl::responder(['status' => 422, 'retorno' => 'Dados inválidos', 'erros' => ['linhas' => 'Envie uma lista de linhas.']], 422);
        }
        if (count($linhas) > 500) {
            ctrl::responder(['status' => 422, 'retorno' => 'Dados inválidos', 'erros' => ['linhas' => 'No máximo 500 linhas por envio.']], 422);
        }
        $regras = $this->regras();
        unset($regras['criadoEm']);   // allowlist: criadoEm/id/qualquer outra chave da planilha são descartados
        $ok = [];
        $rej = [];
        foreach ($linhas as $i => $linha) {
            $r = Input::validate(is_array($linha) && !array_is_list($linha) ? $linha : [], $regras, ['extras' => 'ignorar']);
            if ($r['valido']) {
                $ok[$i] = $this->preparar($r['dados']);
            } else {
                $rej[] = ['linha' => $i + 1, 'erro' => implode('; ', array_map(static fn ($k, $v) => "$k: $v", array_keys($r['erros']), $r['erros']))];
            }
        }
        $n = 0;
        if ($ok) {
            JsonDb::mutar('clientes', static function (array $l) use ($ok, &$n, &$rej) {
                $max = 0;
                $emails = [];
                foreach ($l as $c) {
                    $max = max($max, (int) ($c['id'] ?? 0));
                    $emails[mb_strtolower((string) ($c['email'] ?? ''), 'UTF-8')] = true;
                }
                foreach ($ok as $i => $c) {
                    $e = mb_strtolower($c['email'], 'UTF-8');
                    if (isset($emails[$e])) {
                        $rej[] = ['linha' => $i + 1, 'erro' => 'email: já cadastrado (ou repetido no arquivo).'];
                        continue;
                    }
                    if (count($l) >= self::MAX_REGISTROS) {
                        $rej[] = ['linha' => $i + 1, 'erro' => 'limite de registros da demonstração atingido.'];
                        continue;
                    }
                    $emails[$e] = true;
                    $c['id'] = ++$max;
                    $l[] = $c;
                    $n++;
                }
                return $n ? $l : null;
            });
        }
        usort($rej, static fn ($a, $b) => $a['linha'] <=> $b['linha']);
        ctrl::retorno(['importados' => $n, 'rejeitados' => array_slice($rej, 0, 50)], 200);
    }
}
