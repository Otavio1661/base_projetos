# Mini ERP de demonstração (`/erp`)

Showcase da **libr4** (front) + **framework PHP** (back). Tudo é fictício: os dados vêm de um "mini banco" em JSON
(`storage/data/*.json`) e, para a tabela de 2 milhões de linhas, de um arquivo SQLite somente leitura
(`storage/data/transacoes.sqlite`). Nada disso fica dentro de `public/libr4/` — quem clonar só a lib não leva dados.

- Telas (front, só usam a libr4): `public/erp/` (`login.js`, `app.js`, `paginas/*.js`, `erp.css`).
- Back: `src/Controllers/Erp*.php`, `src/Middleware/ErpAuth.php`, `src/Utils/JsonDb.php`, `src/Utils/ErpDados.php`.
- Dados: gerados por `php tools/erp-seed.php` (determinístico; clientes, produtos, pedidos, usuário demo) e
  `php tools/erp-seed-transacoes.php [linhas]` (padrão 2.000.000). Nenhum dado real, nenhum download externo.

## Páginas (HTML)

| Rota | O que é |
|---|---|
| `GET /erp/login` | Login e cadastro (abas). Redireciona para `/erp` se já houver sessão. |
| `GET /erp` | Aplicação (precisa de sessão; senão 302 → `/erp/login`). Uma única página, navegação por abas/menu em JS. |

## API JSON (`/erp/api/*`)

Envelope padrão: `{ "status": 200, "retorno": ... }`. Listagens (grid `remote: true`): `{ "total": N, "retorno": [ ...linhas ] }`.
Erros: `{ "status": 4xx, "retorno": "mensagem", "erros": { campo: "mensagem" } }` (422 tem `erros`).
Todas as rotas, menos `login` e `cadastro`, exigem sessão (401 sem sessão). POST aceita corpo cifrado da libr4 (`encrypt: true`).
CSRF: o framework recusa POST de outra origem (403); não há token.

### Sessão

| Rota | Corpo / resposta |
|---|---|
| `POST /erp/api/login` | `{ email, senha }` → `200 { usuario }` · `401` credencial inválida · `429` muitas tentativas (cooldown 60 s após 5 falhas por IP) |
| `POST /erp/api/cadastro` | `{ nome, email, senha, cargo }` (cargo ∈ `vendas`,`financeiro`,`estoque`,`gestor`) → `201 { usuario }` e já entra · `422` (e-mail repetido vem em `erros.email`) |
| `POST /erp/api/logout` | `200` |
| `GET /erp/api/eu` | `{ usuario }` ou `401` |
| `POST /erp/api/perfil` | `{ nome, tema ('light'|'dark'|'auto'), idioma ('pt-BR'|'en') }` → `{ usuario }` |
| `POST /erp/api/avatar` | upload (`multipart`, campo `arquivo`, png/jpg/webp até 1 MB, via `Core\Security\Upload`) → `{ url }` |

`usuario` = `{ id, nome, email, cargo, tema, idioma, avatar, criadoEm }` (nunca devolve hash de senha).

### Dashboard

`GET /erp/api/dashboard` → `{ kpis: [{ chave, titulo, valor, variacao, formato:'money'|'number' }], vendasMensais: [{ mes:'2026-01', valor }],
porCategoria: [{ categoria, valor }], porStatus: [{ status, qtd }], series: [{ dia:'2026-10-01', pedidos, valor }] (60 dias), ultimosPedidos: [pedido x8] }`

### CRUD (mini banco JSON): `clientes`, `produtos`, `pedidos`

| Rota | Descrição |
|---|---|
| `GET /erp/api/{recurso}?page=1&size=10&sort=nome&dir=asc&q=texto` | Lista paginada no servidor. `size=0` = todas (limite de 5.000). Busca `q` em todas as colunas de texto/número. |
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
`size` máximo 500 (acima disso o servidor limita). `sort` só nas colunas listadas; `q` procura nas colunas de texto.
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
