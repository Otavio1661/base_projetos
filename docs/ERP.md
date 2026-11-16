# Mini ERP de demonstração (`/erp`)

Showcase da **libr4** (front) + **framework PHP** (back). Tudo é fictício: os dados vêm de um "mini banco" em JSON
(`storage/data/*.json`) e, para a tabela de 2 milhões de linhas, de um arquivo SQLite somente leitura
(`storage/data/transacoes.sqlite`). Nada disso fica dentro de `public/libr4/` — quem clonar só a lib não leva dados.

- Telas (front, só usam a libr4): `public/erp/` (`login.js`, `app.js`, `paginas/*.js`, `erp.css`).
- Back: `src/Controllers/Erp*.php`, `src/Middleware/ErpAuth.php`, `src/Utils/JsonDb.php`, `src/Utils/ErpDados.php`.
- Dados: gerados por `php tools/erp-seed.php` (determinístico; clientes, produtos, pedidos, usuário demo) e
  `php tools/erp-seed-transacoes.php [linhas]` (padrão 2.000.000). Nenhum dado real, nenhum download externo.
- **Conta de teste** `demo@r4dev.com.br` / `Demo@1234` (cargo `gestor`): a senha é PÚBLICA, só para demonstração.
  Com `APP_ENV=production` (ou sem `.env`) o `erp-seed.php` **recusa rodar** sem `--forcar` e, mesmo com `--forcar`, **não**
  cria a conta de teste sem `--com-demo`. Para remover a conta depois: apague o registro dela em `storage/data/usuarios.json`.
  A tela de login só mostra a dica da conta de teste se ela existir.
- **Cadastro público:** `ERP_CADASTRO_ABERTO` no `.env` (validada em `src/Env.php`; padrão `true` fora de produção e
  **`false` em produção**). Fechado → `POST /erp/api/cadastro` responde 403 e a aba "Criar conta" some.
- Segurança do ERP (achados, correções e testes): `docs/SEGURANCA.md`, seção 14.

### Cargos e permissões

| Cargo | Lê tudo | Grava/exclui clientes (e importa) | Grava/exclui produtos | Grava/exclui pedidos |
|---|---|---|---|---|
| `gestor` | sim | sim | sim | sim |
| `vendas` | sim | sim | — | sim |
| `financeiro` | sim | — | — | sim |
| `estoque` | sim | — | sim | — |

Sem permissão → `403 { retorno: "Seu cargo não tem permissão para alterar <recurso>." }`. No cadastro o usuário escolhe
`vendas`, `financeiro` ou `estoque`; **`gestor` não pode ser escolhido** (só quem administra os dados atribui).

## Páginas (HTML)

| Rota | O que é |
|---|---|
| `GET /erp/login` | Login e cadastro (abas). Redireciona para `/erp` se já houver sessão. |
| `GET /erp` | Aplicação (precisa de sessão; senão 302 → `/erp/login`). Uma única página, navegação por abas/menu em JS. |

## API JSON (`/erp/api/*`)

Envelope padrão: `{ "status": 200, "retorno": ... }`. Listagens (grid `remote: true`): `{ "total": N, "retorno": [ ...linhas ] }`.
Erros: `{ "status": 4xx, "retorno": "mensagem", "erros": { campo: "mensagem" } }` (422 tem `erros`).
Todas as rotas, menos `login` e `cadastro`, exigem sessão (401 sem sessão; a sessão só vale se o usuário ainda existir com
o mesmo e-mail/senha do login e expira após 8 h sem uso). POST aceita corpo cifrado da libr4 (`encrypt: true`).
CSRF: o framework recusa POST de outra origem (403) e Content-Type de formulário (415); não há token.
Respostas autenticadas: `Cache-Control: no-store`. Parâmetros de query em formato errado (`q[]=x`, `sort[]=`) são ignorados (JSON limpo, nunca aviso do PHP).

### Sessão

| Rota | Corpo / resposta |
|---|---|
| `POST /erp/api/login` | `{ email, senha }` → `200 { usuario }` · `401` credencial inválida (mesma resposta e mesmo tempo para e-mail inexistente) · `429` + `Retry-After` muitas tentativas: 5 por IP (60 s) e 10 por e-mail (120 s), contadas de forma atômica antes de conferir a senha |
| `POST /erp/api/cadastro` | `{ nome, email, senha, cargo }` (cargo ∈ `vendas`,`financeiro`,`estoque`; `gestor` → 422) → `201 { usuario }` e já entra · `422` (e-mail repetido vem em `erros.email`; senha: 8+ caracteres, letras e números, até 72 bytes, sem o e-mail) · `403` cadastro fechado · `429` mais de 10 tentativas por IP em 10 min |
| `POST /erp/api/logout` | `200` |
| `GET /erp/api/eu` | `{ usuario }` ou `401` |
| `POST /erp/api/perfil` | `{ nome, tema ('light'|'dark'|'auto'), idioma ('pt-BR'|'en') }` → `{ usuario }` |
| `POST /erp/api/avatar` | upload (`multipart`, campo `arquivo`, png/jpg/webp até 1 MB, via `Core\Security\Upload`) → `{ url }` |
| `GET /erp/api/avatar/ver[?id=]` | a foto **do próprio usuário logado** (id de outro → 404), Content-Type fixo, `nosniff`, CSP `sandbox` |

`usuario` = `{ id, nome, email, cargo, tema, idioma, avatar, criadoEm }` (nunca devolve hash de senha).

### Dashboard

`GET /erp/api/dashboard` → `{ kpis: [{ chave, titulo, valor, variacao, formato:'money'|'number' }], vendasMensais: [{ mes:'2026-01', valor }],
porCategoria: [{ categoria, valor }], porStatus: [{ status, qtd }], series: [{ dia:'2026-10-01', pedidos, valor }] (60 dias), ultimosPedidos: [pedido x8] }`

### CRUD (mini banco JSON): `clientes`, `produtos`, `pedidos`

| Rota | Descrição |
|---|---|
| `GET /erp/api/{recurso}?page=1&size=10&sort=nome&dir=asc&q=texto` | Lista paginada no servidor. `size=0` = todas (limite de 5.000). Busca `q` (até 100 caracteres) em todas as colunas de texto/número. `sort` fora das colunas listadas é ignorado. |
| `GET /erp/api/{recurso}/obter?id=123` | Um registro. |
| `POST /erp/api/{recurso}/salvar` | Sem `id` cria (`201`), com `id` atualiza (`200`). Valida com `ctrl::validate`. Devolve o registro. |
| `POST /erp/api/{recurso}/excluir` | `{ id }` → `200`. |
| `GET /erp/api/{recurso}/opcoes` | Listas para selects (ver cada recurso). |

Campos:

- **cliente**: `id, nome, email, telefone, cidade, uf, tipo ('PF'|'PJ'), documento, limite (número), ativo (bool), criadoEm (AAAA-MM-DD)`
- **produto**: `id, sku, nome, categoria, preco (número), estoque (inteiro), ativo (bool)`
- **pedido**: `id, clienteId, cliente (nome, preenchido pelo servidor), data (AAAA-MM-DD), itens (inteiro), total (número), status ('aberto'|'pago'|'enviado'|'cancelado'), obs`

`clientes/opcoes` → `{ ufs: [...], tipos: [...] }` · `produtos/opcoes` → `{ categorias: [...] }` · `pedidos/opcoes` → `{ status: [...], clientes: [{ id, nome }] (os 200 primeiros) }`.

### Tabela grande (2 milhões)

`GET /erp/api/transacoes?page&size&sort&dir&q` → `{ total, retorno: [{ id, cliente, cidade, uf, produto, categoria, valor, data, status }] }`.
`size` máximo 500 (acima disso o servidor limita). `sort` só nas colunas listadas; `q` procura nas colunas de texto (até 60 caracteres;
`%` e `_` são literais). Página além do fim → lista vazia sem consultar. O SQLite é aberto **somente leitura** (`SQLITE_OPEN_READONLY` + `PRAGMA query_only`).
Primeira chamada lenta (conta o total); o servidor guarda o total por consulta em cache.
`GET /erp/api/transacoes/resumo` → `{ total, valorTotal, porStatus: [...], porUf: [...] }` (para gráficos).

### Filtro por valores nas colunas (`filtro[...]`)

As listagens (`clientes`, `produtos`, `pedidos`, `transacoes`) aceitam `filtro[<coluna>][]=<valor>` (repetido): OU dentro da coluna, E entre colunas,
somado à busca `q` e à ordenação. Colunas desconhecidas são ignoradas e os valores sempre vão como parâmetro (nunca concatenados no SQL).
`GET /erp/api/{recurso}/valores?col=status[&q=texto]` devolve `{ retorno: [{ valor, qtd }] }` (valores distintos com contagem, até 1.000; booleanos viram `sim`/`não`),
que alimenta o funil do cabeçalho do grid (`columnFilters` / `filterValues` + `optionsUrl`). Em `transacoes` valem `cliente, cidade, uf, produto, categoria, status`
(contagens em cache por 1 h).

### Importação: dois modos (`/erp#/arquivos`)

1. **Automático:** `R4.files.interpretFile(file)` descobre sozinho a forma do arquivo (JSON de qualquer formato, CSV/TSV, NDJSON, XLSX), as colunas, os tipos e as linhas; a tabela nasce com
   busca, ordenação, filtro por valores, "Todos" e exportação. Nada é enviado ao servidor.
2. **Esquema fixo:** o arquivo precisa ter as colunas de cliente; é validado linha a linha no servidor (`POST /erp/api/clientes/importar`).

### Importação (demonstração de arquivos)

`POST /erp/api/clientes/importar` — corpo `{ linhas: [ {nome, email, cidade, uf, tipo, ...}, ... ] }` (até 500), já lidas no navegador pelo `filedrop`
da libr4 (CSV/XLSX). Valida linha a linha → `{ importados: N, rejeitados: [{ linha, erro }] }`.
O servidor não confia no navegador: reaplica o esquema de cliente em cada linha, aceita só as colunas do esquema (id, criadoEm e
qualquer outra coluna do arquivo são descartados), rejeita e-mail já cadastrado ou repetido no mesmo arquivo, aceita só a chave
`linhas` no corpo e grava as linhas válidas numa única escrita atômica. Precisa de cargo `gestor` ou `vendas` (senão 403).
