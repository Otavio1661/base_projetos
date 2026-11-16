# Produção: `.env`, HTTPS e checklist

Este projeto é **código aberto**: o GitHub guarda só o código. Segredos (chave privada da criptografia, senha do banco) vivem
**apenas** no `.env` do servidor, que **nunca** é commitado.

## Arquivos

| Arquivo | No Git? | Para quê |
|---|---|---|
| `.env` | **Não** (ignorado) | Valores reais da máquina. Cada ambiente tem o seu. |
| `Exemplo.env` | Sim | Modelo para desenvolvimento local (`APP_ENV=local`, debug ligado, `HTTPS_MODE=optional`). |
| `Exemplo.producao.env` | Sim | Modelo para produção: debug desligado, `HTTPS_MODE=required` e a chave privada **vazia** de propósito. |
| `storage/dev-crypto-key.pem` | **Não** (`storage/` ignorado) | Chave de criptografia gerada sozinha em `APP_ENV=local` quando o `.env` não tem `CRYPTO_PRIVATE_KEY`. |
| `storage/cache/nonces/` | **Não** (`storage/` ignorado) | Anti-replay sem APCu: um arquivo vazio por pacote cifrado aceito (apagado sozinho depois da janela). Precisa ser gravável pelo PHP. |
| `SECURITY.md` | Sim | Como relatar vulnerabilidades (canal privado), escopo e prazos. |

O `.gitignore` bloqueia `.env`, `.env.*`, `*.env` (exceto os dois exemplos) e `storage/`. O `.dockerignore` também exclui `.env` da
imagem; no `docker compose` ele entra por volume em tempo de execução.

O `.env` é lido como INI: uma linha `CHAVE=valor` por variável, **sem comentários**, valores com símbolos entre aspas.

## Como configurar a produção

1. No servidor: `cp Exemplo.producao.env .env` (e `chmod 600 .env`, dono = usuário do PHP-FPM).
2. Gere a chave da criptografia: `php tools/gerar-chave.php` e cole a linha `CRYPTO_PRIVATE_KEY="..."` que ele imprime.
   (Ele mostra também o `kid` e a chave pública — essas são públicas e vão para o navegador.)
3. Preencha `APP_HOSTS` com os domínios do site (ex.: `APP_HOSTS="exemplo.com,www.exemplo.com"`).
4. Se houver proxy/Load Balancer na frente, ponha o IP/CIDR dele em `TRUSTED_PROXIES` (ver cenários).
5. Preencha `DB_HOST`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`.
6. Mantenha `APP_ENV=production`, `APP_DEBUG=false` e `HTTPS_MODE=required`.
7. Remova `BASE_CRIPTOGRAFIA` se ainda existir (deprecada: é ignorada e só gera aviso no log).

## Variáveis

| Variável | Padrão | Valores | O que faz |
|---|---|---|---|
| `APP_ENV` | `production` | `production`, `local`, ... | Ambiente. Em `production`: debug desligado à força, chave obrigatória, HTTPS exigido por padrão. |
| `APP_DEBUG` | `false` | `true`/`false` | Erros na tela e vitrine (`/vitrine`, `/vitrine/api/*`). Sempre `false` em produção. |
| `CRYPTO_PRIVATE_KEY` | — (local: gerada em `storage/`) | base64 do PKCS#8 DER (P-256), uma linha | Chave **privada** da criptografia v2. **Obrigatória em produção**; formato validado na subida. |
| `CRYPTO_PRIVATE_KEY_ANTERIOR` | vazio | idem | Chave anterior, ainda aceita (pelo `kid`) durante a rotação. Não é publicada. |
| `CRYPTO_JANELA_SEG` | `300` | 30 a 3600 | Idade máxima (s) de um pacote cifrado (anti-replay por tempo). |
| `CRYPTO_OBRIGATORIA` | `false` | `true`/`false` | `true`: toda rota que usa `getPost()` recusa corpo em claro (400). Por rota: `ctrl::getPost(true)`. |
| `HTTPS_MODE` | production → `required`; outros → `optional` | `required`, `optional` | Política de transporte (abaixo). Outro valor → a aplicação não sobe. |
| `HTTP_PERMITIDO_PARA` | `127.0.0.1,::1` | IPs/CIDRs (IPv4 e IPv6), vírgula | Clientes que podem usar HTTP mesmo com `required` (chamadas internas). Vazio = ninguém. |
| `TRUSTED_PROXIES` | vazio | IPs/CIDRs, vírgula | Proxies cujos `X-Forwarded-Proto`/`X-Forwarded-For` são considerados. Vazio = **nunca** confiar nesses cabeçalhos. |
| `APP_HOSTS` | vazio | hosts, vírgula (aceita `*.dominio` e `:porta`) | Hosts aceitos no cabeçalho `Host` (anti Host-header injection): fora da lista → 400. Vazio = não valida (aviso no log em produção). |
| `HSTS_MAX_AGE` | `15552000` (180 dias) | 0 a 63072000 | `Strict-Transport-Security` (só em HTTPS + `required`). `0` desliga. |
| `HSTS_SUBDOMAINS` | `false` | `true`/`false` | Acrescenta `; includeSubDomains` (só ligue se TODOS os subdomínios tiverem HTTPS). |
| `CSRF_ATIVO` | `true` | `true`/`false` | Recusa POST/PUT/PATCH/DELETE vindos de outro site (`Origin`/`Sec-Fetch-Site` → 403) e `Content-Type` forjável (`text/plain`, formulário → 415). `false` desliga (em produção: aviso no log 1x/dia). Ver `docs/SEGURANCA.md`, seção 5.2. |
| `CSRF_ORIGENS_PERMITIDAS` | vazio | origens `esquema://host[:porta]`, vírgula | Outras origens que podem chamar a API (ex.: `https://app.parceiro.com,https://admin.exemplo.com:8443`). Sem caminho, barra final ou curinga (inválido → a aplicação não sobe); `http://` em produção gera aviso. |
| `VITRINE_PUBLICA` | `false` | `true`/`false` | **Modo demonstração**: libera só `/vitrine` (sem ligar o debug). `/vitrine/testes` e `/vitrine/api/*` continuam só com `APP_DEBUG=true`. Veja "Vitrine pública". |
| `MAX_POST_BYTES` | `2097152` | bytes | Teto do corpo lido por `getPost()`. |
| `BASE_CRIPTOGRAFIA` | — | — | **Deprecada**: ignorada; se presente, só gera aviso no log. |

Valor inválido em qualquer uma (modo desconhecido, IP/CIDR malformado, host com barra/espaço, número fora da faixa, chave que não é
P-256) → **500 genérico** para o cliente e o motivo exato só no `error_log`.

## Política HTTPS/HTTP (`Core\Security\Transport`)

- HTTPS é reconhecido por `$_SERVER['HTTPS']`, porta 443 ou `X-Forwarded-Proto: https` **vindo de um IP em `TRUSTED_PROXIES`**.
- `required` + requisição HTTP de IP não isento: GET/HEAD → **308** para `https://<host validado><uri>`; POST/PUT/PATCH/DELETE → **426**
  (JSON se o cliente pede JSON; texto senão). POST nunca é redirecionado (o corpo iria em claro de novo).
- `required` + HTTPS: envia `Strict-Transport-Security`.
- `optional`: nada é bloqueado e não há HSTS. Em produção registra no log (no máximo 1x por dia): "HTTPS_MODE=optional em produção".
- O host do redirecionamento é sempre validado (lista `APP_HOSTS` ou sintaxe de host) — um `Host:` forjado nunca vira `Location`.
- O cookie de sessão sai com `Secure` (e nome `__Host-R4SID`) quando a requisição é HTTPS (detecção real, inclusive atrás de proxy
  confiável). A sessão só existe quando o código chama `Core\Security\Session::start()` (abaixo).
- A checagem anti-CSRF compara o `Origin` com esquema + host + porta desta detecção: atrás de proxy que termina o TLS, sem
  `TRUSTED_PROXIES` certo, todo POST de navegador recebe 403 (o log mostra `origin-outra ... esperada: http://...`).

## Sessão (`Core\Security\Session`)

O `public/index.php` não inicia sessão (páginas e API não criam cookie). Quem precisa:

```php
use Core\Security\Session;
Session::start();                 // idempotente; cookie HttpOnly, SameSite=Lax, Secure + __Host-R4SID em HTTPS
// login ok:
Session::regenerar();             // novo ID (anti fixação de sessão), dados mantidos
$_SESSION['usuario_id'] = $id;
// logout:
Session::encerrar();
```

Com mais de um servidor PHP, as sessões precisam de armazenamento compartilhado (ou afinidade no balanceador).

## Cenários

**1. Desenvolvimento em HTTP** (`php -S 127.0.0.1:8087 -t public` ou docker na porta 80): `APP_ENV=local`, `HTTPS_MODE=optional`
(é o padrão). A chave de criptografia é gerada em `storage/dev-crypto-key.pem` na primeira requisição (aviso no log). Nada muda no
fluxo atual.

**2. Produção com HTTPS** (TLS no próprio nginx — exemplo comentado no fim de `docker/nginx/default.conf`):
```
APP_ENV=production
APP_DEBUG=false
CRYPTO_PRIVATE_KEY="MIGHAgEAMBMG...."
HTTPS_MODE=required
APP_HOSTS="exemplo.com,www.exemplo.com"
```
O nginx passa `fastcgi_param HTTPS $https` e o PHP vê HTTPS; quem chegar por `http://` recebe 308 (GET) ou 426 (POST).

**3. Produção temporariamente em HTTP para teste** (ex.: antes do certificado sair): `HTTPS_MODE=optional`. Tudo funciona por HTTP,
sem HSTS, e o log avisa uma vez por dia. **Volte para `required` assim que o TLS estiver no ar**: sem HTTPS, um atacante no caminho
pode trocar a chave pública entregue com a página e ler os dados (docs/SEGURANCA.md, seção 5).

**4. Chamada interna por HTTP** (cron, healthcheck, outro serviço na mesma rede) com `required`: liste o IP/rede de origem em
`HTTP_PERMITIDO_PARA="127.0.0.1,::1,10.0.5.0/24"`. Só o IP real do cliente conta (`REMOTE_ADDR`, ou o `X-Forwarded-For` quando ele vem
de um proxy confiável). Não use o redirecionamento cego HTTP→HTTPS no nginx nesse caso: deixe o PHP decidir por IP.

**5. Atrás de proxy / Load Balancer** que termina o TLS e fala HTTP com o nginx:
```
HTTPS_MODE=required
TRUSTED_PROXIES="10.0.0.10"          (IP ou CIDR do LB; nunca 0.0.0.0/0)
APP_HOSTS="exemplo.com"
```
O LB precisa enviar `X-Forwarded-Proto` e `X-Forwarded-For`. O PHP só acredita nesses cabeçalhos quando a conexão vem de
`TRUSTED_PROXIES`; de qualquer outro cliente eles são ignorados (forjar `X-Forwarded-Proto: https` ou `X-Forwarded-For: 127.0.0.1` não
adianta). Atenção: se o IP do LB estiver em `HTTP_PERMITIDO_PARA` **sem** estar em `TRUSTED_PROXIES`, todo tráfego via LB seria isento.

## Chave da criptografia

**Gerar:** `php tools/gerar-chave.php` → cole `CRYPTO_PRIVATE_KEY="..."` no `.env`. Use uma chave por ambiente. A chave **pública**
correspondente vai para as páginas (`<meta name="r4-server-key">`) e para `GET /r4/chave` — isso é esperado e seguro.

**Anti-replay:** cada pacote cifrado aceito tem o nonce guardado até `CRYPTO_JANELA_SEG` + 65 s; o mesmo pacote reenviado → 400.
Usa APCu se estiver ligado; senão arquivos em `storage/cache/nonces/` (criados sozinhos, 0700; limpeza automática no máximo 1x por
minuto; teto de 10.000). Garanta que `storage/` seja gravável pelo usuário do PHP-FPM — se não for, o pacote repetido é aceito e o log
avisa 1x/dia. Vários servidores atrás de um balanceador: cada um tem o seu cache (compartilhe `storage/cache/nonces` ou use afinidade).

**Rotação sem derrubar sessões abertas** (o `kid` identifica a chave usada em cada pacote):
1. Gere uma chave nova (`php tools/gerar-chave.php`).
2. No `.env`: mova o valor atual de `CRYPTO_PRIVATE_KEY` para `CRYPTO_PRIVATE_KEY_ANTERIOR` e cole a nova em `CRYPTO_PRIVATE_KEY`.
3. Recarregue o PHP-FPM. Páginas novas recebem a chave nova; páginas abertas antes continuam funcionando com a anterior.
4. Depois de um tempo maior que a vida de uma página aberta (ex.: 1 dia), apague `CRYPTO_PRIVATE_KEY_ANTERIOR`.
   Uma página muito antiga recebe 400 com `codigo: "R4_CHAVE"`, e o `R4.http` busca `/r4/chave` e reenvia sozinho uma vez.

**Vazou a chave privada?** Gere outra e troque **sem** colocar a vazada em `_ANTERIOR`.

## O que a aplicação garante (`src/Env.php`)

- `.env` ausente, ilegível ou com sintaxe quebrada → resposta **500 genérica** (sem caminhos) e o motivo vai para o `error_log`.
- `APP_ENV` e `APP_DEBUG` ausentes → assumem **production / false** (padrão seguro).
- Com `APP_ENV=production`: o **debug é desligado automaticamente** (mesmo que o `.env` diga `true`) e a aplicação **se recusa a subir**
  sem `CRYPTO_PRIVATE_KEY` válida. Por isso o exemplo de produção deixa a chave vazia: nada "funciona por acidente".
- Política HTTPS e listas de IP/host validadas na subida (valor inválido → 500 genérico + log).
- `CSRF_ATIVO` (booleano) e `CSRF_ORIGENS_PERMITIDAS` (cada item `http(s)://host[:porta]`, normalizado para minúsculas e sem a porta
  padrão) validados na subida; `CSRF_ATIVO=false` ou origem `http://` em produção → aviso no log.
- Com debug desligado, `/vitrine`, `/vitrine/testes` e `/vitrine/api/*` respondem **404**.

## Checklist antes de publicar

- [ ] `.env` só no servidor; `git status` não mostra nenhum `.env` nem `storage/`.
- [ ] `CRYPTO_PRIVATE_KEY` gerada por `php tools/gerar-chave.php`, diferente em cada ambiente; `BASE_CRIPTOGRAFIA` removida.
- [ ] `APP_ENV=production` e `APP_DEBUG=false`.
- [ ] HTTPS ativo e `HTTPS_MODE=required`; `APP_HOSTS` preenchido; `TRUSTED_PROXIES` só com o proxy real (se houver).
- [ ] HSTS ligado (`HSTS_MAX_AGE` > 0); `HSTS_SUBDOMAINS=true` só se todos os subdomínios tiverem HTTPS.
- [ ] `php tools/testes-transport.php` passando no servidor (confere OpenSSL e a política).
- [ ] `/` aponta para a sua aplicação real (hoje abre a vitrine, que é só de desenvolvimento).
- [ ] Usuário do banco com o mínimo de permissões (sem DROP/ALTER em tempo de execução).
- [ ] `storage/` fora do docroot, com permissão restrita e **gravável pelo PHP** (uploads, chave de dev, nonces anti-replay).
- [ ] `CSRF_ATIVO=true`; `CSRF_ORIGENS_PERMITIDAS` só com as origens que realmente chamam a API.
- [ ] Nenhuma view com `<script>` inline nem `onclick="..."` (a CSP tem `script-src 'self'`); sessão só via `Session::start()`.
- [ ] Imagem construída com `docker/php/zz-fpm-seguranca.conf` (o build roda `php-fpm -t`) e compose com `no-new-privileges`/`cap_drop`.
- [ ] Servir `libr4/dist/libr4.min.js` e `.css` com `integrity` (hash em `dist/manifest.json`) e gzip/brotli no nginx.
- [ ] Validar o `nginx.conf` com `nginx -t` no servidor; depois de publicar arquivos novos, `nginx -s reload` (limpa o `open_file_cache`).
- [ ] Contato de segurança definido no `SECURITY.md` (trocar o marcador `[definir contato]`) e "Private vulnerability reporting"
      ligado no GitHub (Settings → Code security).
- [ ] Trocar a senha/chave imediatamente se algum `.env` real for exposto (commit, print, log): **apagar do Git não basta**, o histórico guarda.

## Docker: endurecimento do PHP e dos containers

| Arquivo | Vale para | O que faz |
|---|---|---|
| `docker/php/zz-app.ini` → `conf.d/` | PHP-FPM **e** linha de comando | `expose_php=0`, `allow_url_include=0`, erros só no log (`display_errors=0`, `log_errors=1`), `zend.exception_ignore_args=1` (stack trace sem valores de argumentos), `memory_limit=128M`, `max_input_vars=1000`, `max_input_time=30`, `post_max_size=10M`/`upload_max_filesize=8M` (coerentes com `client_max_body_size 10m` do nginx), sessão `use_strict_mode`/`use_only_cookies`/`cookie_httponly`/`cookie_samesite=Lax`. |
| `docker/php/zz-fpm-seguranca.conf` → `php-fpm.d/` | **só** a aplicação web (pool `www`) | `disable_functions` (exec, passthru, shell_exec, system, proc_open, popen, pcntl_exec, pcntl_fork, dl, show_source, highlight_file, symlink, link, posix_kill, posix_mkfifo), `allow_url_fopen=off`, `open_basedir=/var/www/html:/tmp` (projeto inteiro — `vendor/`, `storage/`, `.env` — e `/tmp` para uploads em curso e sessões). `php_admin_*`: o código não desfaz com `ini_set()`. |

Por que dois arquivos: `conf.d/` vale também para a CLI do container, e o composer (usa `proc_open` e baixa pacotes por URL) e os
geradores (`composer controller X` roda o PHP via `proc_open`) quebrariam. Nada do app em FPM usa as funções desligadas (só
`tools/build.php` usa `exec`, pela linha de comando). O `Dockerfile` roda `php-fpm -t` (erro de configuração derruba o build) e deixa o
código só para leitura do `www-data` (dono `root`), com `storage/` gravável.

`docker-compose.yml`: `security_opt: no-new-privileges:true` e `cap_drop: [ALL]` nos dois serviços, com o mínimo de volta —
`app`: `SETUID`, `SETGID` (o mestre do php-fpm troca para `www-data`); `web`: `CHOWN`, `SETUID`, `SETGID`, `NET_BIND_SERVICE` (porta 80).
Se o nginx não subir com "Permission denied" em `/var/cache/nginx`, acrescente `DAC_OVERRIDE`. `read_only: true` (com `tmpfs`) está
como **exemplo comentado**: teste upload, login e POST cifrado antes de ligar.

Não exercitado aqui (sem Docker na máquina de desenvolvimento): o build, `nginx -t`, o efeito dos `cap_drop` e o `read_only`.
O comportamento de `disable_functions` + `allow_url_fopen=Off` + `open_basedir` foi testado com `php -S` (vitrine, upload, POST cifrado,
replay, SQLite em memória).

## Lembrete sobre a criptografia

A criptografia v2 da libr4 não entrega segredo nenhum ao navegador (só a chave pública) e amarra cada pacote ao endpoint e ao tempo,
mas **não substitui o HTTPS**: sem TLS um atacante ativo pode se passar pelo servidor. Detalhes e limites em `docs/SEGURANCA.md`
(seções 5 e 5.1).

## Vitrine pública (demonstração)

Para mostrar a vitrine na web **sem** ligar o debug:

1. No `.env` do servidor de demonstração: `VITRINE_PUBLICA=true` (mantenha `APP_ENV=production`, `APP_DEBUG=false`, `HTTPS_MODE=required`).
2. O que passa a existir: `/vitrine` (e `/`, que hoje abre a vitrine). O que **não** existe: `/vitrine/testes` e toda a API de teste (`/vitrine/api/*` → 404). Os exemplos que dependem dessa API mostram o aviso "disponível só em desenvolvimento"; tabelas e gráficos que leem os JSON estáticos de `vitrineData` funcionam normalmente.
3. **Proteja o acesso** (recomendado): senha no nginx — `htpasswd -c /etc/nginx/.htpasswd demo` e, no `server {}`: `auth_basic "Vitrine"; auth_basic_user_file /etc/nginx/.htpasswd;` — ou `allow SEU.IP; deny all;`.
4. O nginx já limita ~30 requisições/s por IP (`limit_req`, resposta 429). Ajuste `rate`/`burst` em `docker/nginx/default.conf` se precisar.
5. O playground executa o código que a própria pessoa digita (só no navegador dela); a CSP libera `'unsafe-eval'` apenas na rota `/vitrine`.
6. Rode `php tools/build.php` e confira `?min=1` antes de publicar; valide o `nginx.conf` com `nginx -t`.
