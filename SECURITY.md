# Política de segurança

Obrigado por ajudar a manter este projeto (framework PHP + libr4) seguro. Este arquivo diz **como relatar
uma vulnerabilidade**, o que está no escopo e o que esperar de resposta. Detalhes técnicos (modelo de
ameaça, criptografia, CSP, CSRF, checklist de produção) estão em [`docs/SEGURANCA.md`](docs/SEGURANCA.md)
e [`docs/PRODUCAO.md`](docs/PRODUCAO.md).

## Como relatar (divulgação responsável)

**Não abra issue pública, pull request ou discussão para relatar uma vulnerabilidade.**

1. **Preferencial:** use o relato **privado** do GitHub — aba **Security** do repositório →
   **Report a vulnerability** (GitHub Security Advisories). Só os mantenedores veem o relato.
2. Alternativa por e-mail: **[definir contato]** *(mantenedor: troque este marcador por um endereço
   real dedicado a segurança antes de publicar; enquanto ele existir, use apenas o item 1)*.

Inclua, se possível:

- versão/commit afetado e ambiente (`APP_ENV`, PHP, nginx, navegador);
- passos para reproduzir e uma prova de conceito **mínima** (requisição `curl`, HTML de exemplo);
- impacto que você observou (o que um atacante consegue) e se depende de configuração específica;
- se quiser crédito, o nome/apelido a citar.

Por favor:

- teste **só** na sua própria instalação (`php -S 127.0.0.1:8087 -t public` ou `docker compose up`);
  nunca em sites de terceiros que usem o projeto;
- não acesse, altere nem guarde dados de outras pessoas; não faça negação de serviço nem engenharia social;
- dê um prazo razoável para a correção antes de divulgar (veja abaixo).

Relatos feitos de boa-fé dentro destas regras não serão alvo de nenhuma ação por parte dos mantenedores.

## Prazos de resposta (metas)

| Etapa | Meta |
|---|---|
| Confirmação de recebimento | até **3 dias úteis** |
| Primeira avaliação (válido? severidade?) | até **10 dias úteis** |
| Correção — severidade crítica/alta | até **30 dias** |
| Correção — média/baixa | até **90 dias** ou na próxima versão |
| Divulgação pública (advisory + crédito) | junto com a correção, combinada com quem relatou |

São metas de um projeto mantido por poucas pessoas, não um contrato. Se um prazo não puder ser cumprido,
avisamos e combinamos uma nova data.

## Versões suportadas

| Versão | Recebe correções de segurança |
|---|---|
| `main` (último commit) | Sim |
| Commits/cópias antigas | Não — atualize para a `main` |

O projeto ainda não publica versões numeradas; quando publicar, esta tabela listará as linhas suportadas.
Requisitos de plataforma assumidos: PHP ≥ 8.2 com OpenSSL (o `Dockerfile` usa 8.5.12), navegadores atuais
com WebCrypto.

## Escopo

Dentro do escopo:

- o código PHP deste repositório: `public/index.php`, `core/` (inclusive `Core\Security\*`: `Crypto`,
  `Transport`, `Csrf`, `Session`, `Input`, `Upload`, `Prompt`), `src/` e os geradores de `core/Generator`;
- a libr4 (`public/libr4/`) usada como documentado — XSS por dado não confiável, poluição de protótipo,
  falhas na criptografia v2, desvio das checagens de URL/origem;
- a configuração entregue: `docker/nginx/default.conf`, `docker/php/*`, `Dockerfile`, `docker-compose.yml`,
  `Exemplo*.env` (ex.: um padrão inseguro);
- os testes de segurança (`tools/testes-*.{php,js}`) quando deixam passar algo que dizem bloquear.

Fora do escopo:

- aplicações de terceiros construídas com o framework (relate ao dono delas);
- a vitrine (`/vitrine`, `/vitrine/testes`, `/vitrine/api/*`) e as ferramentas de desenvolvimento quando
  expostas com `APP_DEBUG=true` em produção — elas existem para desenvolvimento e são 404 com debug desligado;
- dependências e serviços externos (PHP, nginx, OpenSSL, navegadores, sistema operacional): relate ao projeto
  de origem (nos avise se o nosso uso piorar o problema).

## O que NÃO é considerado vulnerabilidade

- **A chave pública** da criptografia v2 aparecer na página (`<meta name="r4-server-key">`) ou em
  `GET /r4/chave`: ela é pública por definição.
- **A criptografia v2 não substituir o HTTPS** nem autenticar o usuário (limites documentados em
  `docs/SEGURANCA.md`, seção 5) — por exemplo, um atacante ativo sem TLS trocar a chave pública.
- **Executar código no playground da vitrine**: ele roda (com `eval`) só o que a própria pessoa digita,
  no navegador dela, e só existe com `APP_DEBUG=true` ou `VITRINE_PUBLICA=true`.
- **HTML confiável por design** (`html` de painel/janela, conteúdo de `<r4-*>`, `R4.raw`, coluna com
  `html: true`) recebendo HTML: é documentado como responsabilidade de quem chama (seção 3 de `docs/SEGURANCA.md`).
- **`style-src 'unsafe-inline'`** na CSP (necessário hoje; motivo e plano no `default.conf`), ausência de
  cabeçalhos em respostas do servidor de desenvolvimento `php -S` (os cabeçalhos ficam no nginx).
- Requisições **sem `Origin`/`Sec-Fetch-Site`** (curl, scripts) passarem pela checagem anti-CSRF: ela protege
  contra navegadores; autenticação/autorização das rotas é responsabilidade da aplicação.
- Relatos só de scanner sem impacto demonstrado (versão de software, falta de um cabeçalho “recomendado”,
  `X-Powered-By` no servidor de desenvolvimento, clickjacking em página sem ação sensível, “self-XSS”).
- Configuração insegura feita de propósito contra a documentação (`APP_DEBUG=true` em produção,
  `HTTPS_MODE=optional` permanente, `CSRF_ATIVO=false`, `TRUSTED_PROXIES=0.0.0.0/0`).
- Negação de serviço por volume (o limite de taxa fica no nginx/infraestrutura).

Na dúvida, relate mesmo assim pelo canal privado — preferimos avaliar a deixar passar.
