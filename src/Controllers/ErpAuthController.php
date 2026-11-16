<?php

namespace App\Controllers;

use App\Utils\ErpDados;
use App\Utils\JsonDb;
use Core\Controller as ctrl;
use Core\Security\Session;
use Core\Security\Transport;
use Core\Security\Upload;

/** Login, cadastro, sessão, perfil e avatar do mini ERP de demonstração (dados fictícios em JSON). */
class ErpAuthController extends ctrl
{
    private const MAX_FALHAS = 5;
    private const COOLDOWN = 60;

    public static function publico(array $u): array
    {
        return [
            'id' => (int) $u['id'], 'nome' => $u['nome'], 'email' => $u['email'], 'cargo' => $u['cargo'],
            'tema' => $u['tema'] ?? 'auto', 'idioma' => $u['idioma'] ?? 'pt-BR',
            'avatar' => !empty($u['avatar']) ? '/erp/api/avatar/ver?id=' . (int) $u['id'] : '',
            'criadoEm' => $u['criadoEm'] ?? '',
        ];
    }

    public static function logado(): ?array
    {
        Session::start();
        $id = (int) ($_SESSION['erp_uid'] ?? 0);
        return $id > 0 ? JsonDb::achar('usuarios', $id) : null;
    }

    /* ---- limite de tentativas de login por IP (arquivo em storage/cache) ---- */
    private static function arqLimite(): string
    {
        $d = dirname(__DIR__, 2) . '/storage/cache';
        if (!is_dir($d)) {
            @mkdir($d, 0750, true);
        }
        return $d . '/erp-login-' . hash('sha256', Transport::ipCliente()) . '.json';
    }

    private static function lerLimite(): array
    {
        $a = json_decode((string) @file_get_contents(self::arqLimite()), true);
        return is_array($a) ? $a : ['n' => 0, 'ate' => 0];
    }

    public function login()
    {
        $d = ctrl::validate([
            'email' => ['type' => 'email', 'required' => true],
            'senha' => ['type' => 'string', 'required' => true, 'minLength' => 1, 'maxLength' => 200],
        ]);
        $lim = self::lerLimite();
        if ($lim['n'] >= self::MAX_FALHAS && time() < $lim['ate']) {
            header('Retry-After: ' . ($lim['ate'] - time()));
            ctrl::retorno('Muitas tentativas. Aguarde um minuto e tente de novo.', 429);
        }
        $user = null;
        foreach (JsonDb::todos('usuarios') as $u) {
            if (strcasecmp($u['email'], $d['email']) === 0) {
                $user = $u;
                break;
            }
        }
        $ok = password_verify($d['senha'], $user['senhaHash'] ?? password_hash('x', PASSWORD_DEFAULT)) && $user !== null;   // sem usuário: faz um hash do mesmo custo (tempo parecido)
        if (!$ok) {
            $lim['n'] = ($lim['ate'] > 0 && time() >= $lim['ate']) ? 1 : $lim['n'] + 1;
            $lim['ate'] = time() + self::COOLDOWN;
            @file_put_contents(self::arqLimite(), json_encode($lim), LOCK_EX);
            ctrl::retorno('E-mail ou senha incorretos.', 401);
        }
        @unlink(self::arqLimite());
        Session::start();
        Session::regenerar();
        $_SESSION['erp_uid'] = (int) $user['id'];
        ctrl::retorno(['usuario' => self::publico($user)], 200);
    }

    public function cadastro()
    {
        $d = ctrl::validate([
            'nome' => ['type' => 'string', 'required' => true, 'minLength' => 3, 'maxLength' => 80],
            'email' => ['type' => 'email', 'required' => true],
            'senha' => ['type' => 'string', 'required' => true, 'minLength' => 8, 'maxLength' => 100],
            'cargo' => ['type' => 'enum', 'in' => ErpDados::CARGOS, 'required' => false, 'default' => 'vendas'],
        ]);
        if (!preg_match('/[A-Za-z]/', $d['senha']) || !preg_match('/\d/', $d['senha'])) {
            ctrl::responder(['status' => 422, 'retorno' => 'Dados inválidos', 'erros' => ['senha' => 'Use letras e números na senha.']], 422);
        }
        $novo = null;
        $repetido = false;
        JsonDb::mutar('usuarios', static function (array $l) use ($d, &$novo, &$repetido) {
            $max = 0;
            foreach ($l as $u) {
                $max = max($max, (int) $u['id']);
                if (strcasecmp($u['email'], $d['email']) === 0) {
                    $repetido = true;
                    return null;
                }
            }
            if (count($l) >= 500) {   // demonstração: não deixa o arquivo crescer sem limite
                $repetido = null;
                return null;
            }
            $l[] = $novo = [
                'id' => $max + 1, 'nome' => $d['nome'], 'email' => $d['email'], 'senhaHash' => password_hash($d['senha'], PASSWORD_DEFAULT),
                'cargo' => $d['cargo'], 'tema' => 'auto', 'idioma' => 'pt-BR', 'avatar' => '', 'criadoEm' => date('Y-m-d'),
            ];
            return $l;
        });
        if ($repetido === null) {
            ctrl::retorno('Limite de contas da demonstração atingido.', 503);
        }
        if ($repetido) {
            ctrl::responder(['status' => 422, 'retorno' => 'Dados inválidos', 'erros' => ['email' => 'Este e-mail já está cadastrado.']], 422);
        }
        Session::start();
        Session::regenerar();
        $_SESSION['erp_uid'] = (int) $novo['id'];
        ctrl::retorno(['usuario' => self::publico($novo)], 201);
    }

    public function logout()
    {
        Session::encerrar();
        ctrl::retorno('ok', 200);
    }

    public function eu()
    {
        $u = self::logado();
        if (!$u) {
            ctrl::retorno('Não autenticado.', 401);
        }
        ctrl::retorno(['usuario' => self::publico($u)], 200);
    }

    public function perfil()
    {
        $u = self::logado();
        $d = ctrl::validate([
            'nome' => ['type' => 'string', 'required' => true, 'minLength' => 3, 'maxLength' => 80],
            'tema' => ['type' => 'enum', 'in' => ['light', 'dark', 'auto'], 'required' => false, 'default' => 'auto'],
            'idioma' => ['type' => 'enum', 'in' => ['pt-BR', 'en'], 'required' => false, 'default' => 'pt-BR'],
        ]);
        $novo = JsonDb::atualizar('usuarios', (int) $u['id'], $d);
        ctrl::retorno(['usuario' => self::publico($novo ?? $u)], 200);
    }

    public function avatar()
    {
        $u = self::logado();
        $dir = Upload::storage('erp-avatares');
        $r = Upload::save('arquivo', ['permitidos' => ['png', 'jpg', 'jpeg', 'webp'], 'maxBytes' => 1048576, 'destino' => $dir, 'imagem' => ['maxLargura' => 3000, 'maxAltura' => 3000]]);
        if (!$r['ok']) {
            ctrl::responder(['status' => 422, 'retorno' => 'Arquivo recusado', 'erros' => ['arquivo' => implode(' ', (array) $r['erros'])]], 422);
        }
        $antigo = (string) ($u['avatar'] ?? '');
        $novo = JsonDb::atualizar('usuarios', (int) $u['id'], ['avatar' => $r['arquivo']['nome']]);
        if ($antigo !== '' && preg_match('/^[a-f0-9]{32}\.(png|jpe?g|webp)$/', $antigo)) {
            @unlink($dir . '/' . $antigo);
        }
        ctrl::retorno(['url' => self::publico($novo ?? $u)['avatar'] . '&v=' . time()], 200);
    }

    /** GET /erp/api/avatar/ver?id= — serve o arquivo com Content-Type FIXO (nunca o que o navegador disse). */
    public function avatarVer()
    {
        $alvo = JsonDb::achar('usuarios', (int) ($_GET['id'] ?? 0));
        $nome = (string) ($alvo['avatar'] ?? '');
        $f = Upload::storage('erp-avatares') . '/' . $nome;
        if (!preg_match('/^[a-f0-9]{32}\.(png|jpe?g|webp)$/', $nome, $m) || !is_file($f)) {
            http_response_code(404);
            exit;
        }
        $tipos = ['png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'webp' => 'image/webp'];
        header('Content-Type: ' . $tipos[$m[1]]);
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: private, max-age=300');
        header('Content-Length: ' . filesize($f));
        readfile($f);
        exit;
    }
}
