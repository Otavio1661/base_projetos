# Produção: `.env` e checklist

Este projeto é **código aberto**: o GitHub guarda só o código. Segredos (chave de criptografia, senha do banco) vivem
**apenas** no `.env` do servidor, que **nunca** é commitado.

## Arquivos

| Arquivo | No Git? | Para quê |
|---|---|---|
| `.env` | **Não** (ignorado) | Valores reais da máquina. Cada ambiente tem o seu. |
| `Exemplo.env` | Sim | Modelo para desenvolvimento local (`APP_ENV=local`, debug ligado). |
| `Exemplo.producao.env` | Sim | Modelo para produção: debug desligado e segredos **vazios** de propósito. |

O `.gitignore` bloqueia `.env`, `.env.*` e `*.env` (exceto os dois exemplos). O `.dockerignore` também exclui `.env` da imagem;
no `docker compose` ele entra por volume em tempo de execução.

## Como configurar a produção

1. No servidor: `cp Exemplo.producao.env .env` (e `chmod 600 .env`, dono = usuário do PHP-FPM).
2. Gere a chave de criptografia: `php -r "echo bin2hex(random_bytes(32));"` e cole em `BASE_CRIPTOGRAFIA="..."`.
3. Preencha `DB_HOST`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`.
4. Mantenha `APP_ENV=production` e `APP_DEBUG=false`.

## O que a aplicação garante (`src/Env.php`)

- `.env` ausente, ilegível ou com sintaxe quebrada → resposta **500 genérica** (sem caminhos) e o motivo vai para o `error_log`.
- `APP_ENV` e `APP_DEBUG` ausentes → assumem **production / false** (padrão seguro).
- Com `APP_ENV=production`: o **debug é desligado automaticamente** (mesmo que o `.env` diga `true`) e a aplicação **se recusa a subir**
  se `BASE_CRIPTOGRAFIA` tiver menos de 32 caracteres. Por isso o exemplo de produção deixa a chave vazia: nada "funciona por acidente"
  com uma chave pública conhecida.
- Com debug desligado, `/vitrine`, `/vitrine/testes` e `/vitrine/api/*` respondem **404**.

## Checklist antes de publicar

- [ ] `.env` só no servidor; `git status` não mostra nenhum `.env`.
- [ ] `BASE_CRIPTOGRAFIA` gerada com `random_bytes` (32+ caracteres), diferente em cada ambiente.
- [ ] `APP_ENV=production` e `APP_DEBUG=false`.
- [ ] HTTPS ativo (a criptografia da libr4 **não substitui** o HTTPS).
- [ ] `/` aponta para a sua aplicação real (hoje abre a vitrine, que é só de desenvolvimento).
- [ ] Usuário do banco com o mínimo de permissões (sem DROP/ALTER em tempo de execução).
- [ ] `storage/` fora do docroot e com permissão restrita (uploads).
- [ ] Servir `libr4/dist/libr4.min.js` e `.css` com `integrity` (hash em `dist/manifest.json`) e gzip/brotli no nginx.
- [ ] Validar o `nginx.conf` com `nginx -t` no servidor.
- [ ] Trocar a senha/chave imediatamente se algum `.env` real for exposto (commit, print, log): **apagar do Git não basta**, o histórico guarda.

## Lembrete sobre a chave

A `BASE_CRIPTOGRAFIA` é entregue ao navegador (`window.BASE_CRIPTOGRAFIA`, injetada em `public/index.php`) para a libr4 cifrar o
corpo das requisições. Ela protege contra leitura passiva do tráfego, mas **não é segredo** diante de quem abre a página. Detalhes
em `docs/SEGURANCA.md`.
