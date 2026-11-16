# Segurança — libr4, vitrine e API de teste

Este documento descreve o modelo de ameaça da libr4 (R4 dev), o que a biblioteca garante, o que
continua sendo responsabilidade de quem a usa, a verdade sobre a criptografia no cliente, o
checklist de produção e a auditoria feita (achados, correções e testes).

Testes automatizados: `node tools/testes-seguranca.js` e `php tools/testes-transport.php` (veja a seção 12).
Criptografia v2 (nenhum segredo no navegador) e política HTTPS: seções 5 e 5.1.
Anti-CSRF por origem e sessão sob demanda: seções 5.2 e 5.3. CSP sem `'unsafe-inline'` em scripts: seção 7.
Injeção de SQL, de arquivos e de prompt (servidor + cliente): seção 13.
Como relatar uma vulnerabilidade: [`SECURITY.md`](../SECURITY.md).

---

## 1. Modelo de ameaça

O dado é tratado como **não confiável** quando vem de fora do código que você escreveu:

- JSON de API (inclusive de um servidor comprometido ou de um proxy no meio do caminho);
- CSV/XLSX/JSON/arquivos enviados pelo usuário (`R4.files`, `<r4-filedrop>`);
- query string e `#hash` da URL;
- atributos e HTML vindos de conteúdo dinâmico (CMS, comentários, campos digitados);
- `localStorage` (pode ter sido adulterado por outra aba/extensão/XSS antigo).

A página hospedeira pode ser de terceiros que só incluem `libr4.js`. Objetivos:

1. **Nenhuma XSS/injeção por dado não confiável** quando a API é usada da forma documentada.
2. **Falha segura** quando é usada errado: o dado vira texto, a URL perigosa é recusada, o
   padrão perigoso é ignorado — sempre com aviso no console (`[R4] ...`).

Fora do escopo: o código JavaScript que você mesmo escreve (a lib não protege de `eval` seu), um
atacante que já executa script na página, e o servidor (a validação no backend é obrigatória).

---

## 2. O que a libr4 garante (seguro por padrão)

| Área | Garantia |
|---|---|
| Textos | `title`, `text`, `label`, `header`, `emptyText`, `errorText`, `loadingText`, `summaryLabel`, `helpText`, mensagens de erro (inclusive as do servidor), opções de `select`, rótulos de gráfico, `R4.toast`, `R4.msg.alert/confirm`, `r4-tip`, `R4.notify({text})`, nomes de arquivo do `filedrop` — sempre `textContent`/escapados. |
| Grid | Sem `renderer` → texto. **`renderer` que devolve string/número → texto** (mudou nesta auditoria). HTML só com `R4.html`/`R4.raw`/Node (ou `html: true` explícito na coluna). Impressão escapa tudo e roda num `<iframe sandbox>` sem scripts. `{campo}` em `r4-click`/`r4-confirm` das ações tira `;` e quebras. |
| `r4-click` | Nenhuma ação usa `eval`. `goto:` só navega para relativa, `#`, `http(s)`, `mailto`, `tel` — `javascript:`, `data:`, `vbscript:` são bloqueados (também com espaços/tabs no meio do esquema). `alert:`, `toast:`, `notify:` mostram texto. |
| URLs em atributos | `R4.util.el` e `domAttrs` recusam handlers inline (`onclick="..."`) e URLs perigosas em `href/src/action/formaction/...`. `dropdown`, `breadcrumb` e `avatar` filtram `href`/`src`. |
| Protótipos | `R4.create(cfg)`, `R4.util.merge`, `R4.util.assign`, `R4.notify(obj)` e a leitura de atributos ignoram `__proto__`, `constructor`, `prototype`. `parseCSV`/`parseXLSX` gravam `__proto__` como propriedade própria (nunca mudam o protótipo). |
| Rede | `R4.http`, grid (`src`), form (`action`), select/stat/stats/timeline/chart (`src`): só `http(s)`/relativa; página https não envia para `http://` (conteúdo misto); outra origem gera aviso (ou bloqueio com `R4.config.strictOrigins = true`); `credentials: 'same-origin'`. |
| Dados de servidor como HTML | `<r4-timeline src>` ignora o campo `html` dos eventos vindos do servidor. |
| Tema | Cor, raio, densidade, modo e fonte passam por allowlist antes de virar CSS; valor adulterado no `localStorage` é descartado. Presets só os próprios (nada de `__proto__`). Cores de gráfico só por allowlist (`#hex`, nome, `var(--x)`, `rgb/hsl/...()` numéricos). |
| i18n | `<r4-t>`/`r4-i18n` usam `textContent`; `r4-i18n` só escreve `placeholder`, `title`, `aria-label`, `alt`, `label`, `aria-description` (nunca `on*`, `href`, `src`, `style`). |
| Ícones | `R4.icon(nome)` monta o SVG com `createElementNS` a partir de um **mapa fixo** nome → path (allowlist); o nome nunca vira markup (desconhecido → círculo neutro + aviso). `size` só aceita número/`em`/`rem`/`px`, `cls` só nomes de classe simples, `title` vai por `textContent`. `R4.icon.add` só aceita path com `[MmLlHhVvCcSsQqTtAaZz0-9 .,-]` (máx. 2000) e nome `[a-z][a-z0-9-]*`. A opção `icon` dos componentes (`R4.util.icon`) vira SVG só se o valor for um nome do mapa; qualquer outro valor (inclusive HTML) é texto. |
| i18n dos componentes | Os textos fixos da lib vêm de `R4.t` e são gravados com `textContent`/atributos de texto; params (nome de coluna, mensagem do servidor, nome de arquivo) são dados, nunca markup. `R4.util.tx` grava `r4-i18n` (+ `params` em JSON) só nos atributos permitidos pelo i18n. |
| Arquivos | Exportação CSV/XLSX neutraliza fórmulas (`= + - @ TAB CR` → prefixo `'`; XLSX grava texto como string compartilhada, nunca `<f>`). Leitura: limites de tamanho, XLSX com `DOCTYPE` recusado, limite descompactado ("zip bomb"), de entradas, de linhas e de células, CRC conferido. Nome de download sem caminho, controle ou caracteres bidi (U+202E). |
| Formulários | `pattern` limitado a 512 caracteres; padrão com quantificador aninhado (`(a+)+`, `(\w*x)*`, `(a+){2,}`) é ignorado com aviso (ReDoS); valor com mais de 5.000 caracteres nem chega à regex. |
| Criptografia | v2: **nenhum segredo no navegador** (só a chave pública P-256 do servidor). ECDH efêmero por sessão de página + HKDF-SHA256 + AES-256-GCM com IV novo por mensagem; AAD = método + caminho; janela de tempo no servidor; tudo que falha → `null`/erro claro no cliente e 400 JSON limpo no servidor. Detalhes e limites na seção 5. |

---

## 3. O que é responsabilidade de quem usa (HTML confiável)

Estes pontos **recebem HTML de propósito** e não escapam nada. Só passe conteúdo escrito por você
(constante) ou montado com `R4.html`/`R4.util.esc`:

- `html` de `panel`, `window`, `div`, `fieldset`, `formrow`, `form`, `accordion` (itens), `steps`
  (etapas), `timeline` (itens passados por código), `alert`, `badge`, `tag`, `emptystate`,
  `tooltip`, `R4.notify({html})`; `setHtml(...)`; `R4.util.el(tag, { html })`;
- o **conteúdo** das tags `<r4-*>` (e o atributo `html` delas);
- `R4.render(alvo, html)`, `R4.panel(alvo, título, html)`, `R4.div(alvo, html)`,
  `R4.window(título, html)`, `R4.tabpanel(alvo, {Título: html})`, `R4.accordion(alvo, {Título: html})`,
  `R4.tooltip(alvo, texto, html)`;
- coluna do grid com `html: true` (modo antigo);
- `R4.raw(string)` — é você afirmando "isto é HTML confiável".

### Como fazer certo

```js
// ERRADO: nome vem da API
R4.panel('#p', 'Cliente', '<b>' + cliente.nome + '</b>');
// CERTO: R4.html escapa cada ${}
R4.panel('#p', 'Cliente', R4.html`<b>${cliente.nome}</b>`);
// CERTO: ou escape manual
R4.panel('#p', 'Cliente', '<b>' + R4.util.esc(cliente.nome) + '</b>');
// MELHOR ainda, quando não precisa de HTML: use os campos de texto
R4.alert('#aviso', cliente.nome);           // text → textContent

// Grid: string vira texto; HTML só com R4.html
{ dataIndex: 'estoque', renderer: v => v < 20 ? R4.html`<b class="baixo">${v}</b>` : v }

// r4-click com dado dinâmico: escArg tira ";" (que encadearia outra ação) e escapa o HTML
host.innerHTML = '<button r4-click="toast:' + R4.util.escArg(msg) + '">ok</button>';
// goto: a lib já recusa javascript:/data:, mas valide destinos de redirecionamento no servidor
// (um "goto:https://site-do-atacante" continua sendo um redirecionamento aberto)

// URL de dado externo em href/src: R4.util.safeUrl devolve '' se for perigosa
a.href = R4.util.safeUrl(link) || '#';
```

### Conteúdo de usuário com `r4-ignore`

A camada declarativa monta qualquer `<r4-*>` e executa qualquer `r4-click` que apareça na página
(inclusive via `innerHTML`/AJAX, pelo `MutationObserver`). Se você exibe HTML de usuário (mesmo
sanitizado), envolva-o com `r4-ignore` — lá dentro nada é montado nem executado:

```html
<div class="comentario" r4-ignore><?= $htmlSanitizado ?></div>
```

E não deixe o seu sanitizador aceitar tags `r4-*` nem atributos `r4-*`. `R4.config.autoScan = false`
desliga a montagem automática (aí chame `R4.scan(el)` só onde quiser).

### Outros cuidados

- Os componentes da lib nunca põem o resultado de `R4.t` em `innerHTML`; no seu código, escape (`R4.util.esc`) se for montar HTML.
- `R4.t()` devolve **texto** (os `{params}` não são escapados): ao concatenar em HTML, escape.
- `pattern` dado como `RegExp` (por código) não passa pelo filtro anti-ReDoS; alternâncias
  sobrepostas como `(a|aa)+$` não são detectadas — escreva padrões lineares.
- Validação no navegador é conforto, não segurança: valide tudo de novo no servidor.
- Arquivos importados são dados, não código: ao reexportar, mantenha `safe: true` no `toCSV`.

---

## 4. Rede (`R4.http` e componentes com `src`/`action`)

- Esquemas aceitos: `http:`, `https:` e URLs relativas. `javascript:`, `data:`, `vbscript:`,
  `file:`... → erro `R4.http: esquema de URL recusado`.
- Outra origem: aviso `[R4] requisição para outra origem: ...` (uma vez por origem).
  - `R4.config.allowedOrigins = ['https://api.exemplo.com']` silencia o aviso para essas origens;
  - `R4.config.strictOrigins = true` recusa qualquer origem fora da lista (recomendado em produção).
- `credentials: 'same-origin'` explícito (cookies/sessão nunca vão para outra origem sem você pedir;
  `R4.http.request(url, { credentials: 'include' })` muda isso conscientemente).
- Erros: a mensagem mostrada é a do campo `retorno` do servidor (texto, até 300 caracteres) ou
  `Erro HTTP <status>`; nada de stack trace.
- A CSP do nginx (`connect-src 'self'`) também bloqueia requisições para outras origens.

---

## 5. Criptografia v2 (`R4.crypto` / `Core\Security\Crypto`)

O esquema antigo (v1: `{x,y,z}` com PBKDF2 sobre `BASE_CRIPTOGRAFIA`, uma chave **entregue a todo
visitante**) foi **removido**. No v2 **nenhum segredo sai do servidor**.

### Como funciona

1. O servidor tem um par de chaves **P-256 fixo**. A chave **privada** fica só no `.env`
   (`CRYPTO_PRIVATE_KEY`, gerada por `php tools/gerar-chave.php`); em `APP_ENV=local`, se faltar, é
   gerada em `storage/dev-crypto-key.pem` (0600, fora do Git). Em produção é obrigatória.
2. A página recebe só a chave **pública** `{v:2, pub, kid}`: numa
   `<meta name="r4-server-key" content="{...}">` inserida pelo `public/index.php` antes do `</head>`
   (JSON escapado com `htmlspecialchars(ENT_QUOTES)`; **sem script inline**, compatível com a CSP estrita
   da seção 7) ou em `GET /r4/chave` (mesmo JSON, `Cache-Control: no-cache`). `window.R4_SERVER_KEY`
   continua aceito pela lib como alternativa (definido pelo seu próprio script externo). `kid` = 8 primeiros
   hex do SHA-256 do ponto público; a lib confere que `kid` e `pub` batem.
3. A cada **sessão de página** a libr4 gera um par ECDH efêmero (WebCrypto, chave privada **não
   exportável**, só em memória — nunca em `localStorage`/`sessionStorage`/cookie), faz ECDH com a chave
   do servidor e deriva com **HKDF-SHA256** (salt aleatório de 16 bytes por sessão, info `"R4v2 req"`)
   uma chave **AES-256-GCM**. Cada mensagem usa **IV aleatório de 12 bytes**.
4. Envelope enviado: `{v:2, kid, k, s, z, x}` (base64url sem `=`): `k` = chave pública efêmera do
   cliente (65 bytes), `s` = salt, `z` = IV, `x` = cifra + tag de 16 bytes.
5. **AAD** = `"R4v2|" + MÉTODO + "|" + caminho` (sem query). O pacote só abre no **mesmo método e
   endpoint**: copiar o corpo de um `POST /api/perfil` para `POST /api/transferir` (ou trocar por `PUT`)
   falha na tag.
6. Texto claro = `{t, n, d}`: `t` = hora (epoch s) e `n` = nonce aleatório. O servidor recusa `t` mais
   velho que `CRYPTO_JANELA_SEG` (padrão 300 s) ou mais de 60 s no futuro.
7. **Resposta cifrada** (opcional): com o cabeçalho `X-R4-Res: 1` (`R4.http.post(url, dados,
   {cifrarResposta: true})`) e a rota usando `Controller::responderCifrado()`, o servidor responde
   `{v:2, z, x}` com a **mesma sessão** (HKDF info `"R4v2 res"`, IV novo, AAD `"R4v2|res|" + caminho`)
   e o texto claro leva o nonce do pedido (`{n, d}`): a resposta não serve para outro pedido. Se o
   servidor responder em claro, o `R4.http` **recusa** (falha fechada).
8. No PHP: `Controller::getPost()` decifra (AAD montado de `REQUEST_METHOD` + `parse_url(REQUEST_URI,
   PHP_URL_PATH)`); `Core\Security\Crypto::decryptRequest()` confere versão, `kid`, chaves exatas do
   envelope, base64url **estrito e canônico**, tamanhos (`k` 65 bytes começando em `0x04` e **na curva** —
   o OpenSSL recusa ponto inválido), tag GCM, JSON, janela de tempo; qualquer falha → `null` (sem
   exceção) e a rota responde **400 JSON limpo** (`{status:400, retorno:"Pacote de criptografia inválido
   ou expirado."}`), com o motivo só no log. JSON em claro continua aceito, salvo com
   `CRYPTO_OBRIGATORIA=true` (ou `getPost(true)` na rota) → 400.
9. Recuperação automática: só dois códigos vão ao cliente — `R4_CHAVE` (kid desconhecido: a chave do
   servidor mudou) e `R4_TEMPO` (relógio fora da janela). O `R4.http` então busca `/r4/chave` (ou ajusta o
   relógio pelo cabeçalho `Date`) e tenta de novo **uma** vez.
10. Rotação: `CRYPTO_PRIVATE_KEY_ANTERIOR` continua aceita pelo `kid` (sessões abertas não caem); só a
    atual é publicada. Passo a passo em `docs/PRODUCAO.md`.

### O que o v2 garante

- **O segredo nunca sai do servidor**: ler o HTML, o JavaScript, o `localStorage` ou o tráfego não
  entrega nenhuma chave capaz de decifrar o tráfego de **outro** usuário.
- **Chave por sessão**: cada aba/carregamento tem chave AES própria; capturar o tráfego de uma sessão
  não ajuda com as outras (a chave efêmera do cliente morre com a página).
- **Integridade + amarração ao endpoint**: AES-GCM detecta qualquer bit alterado; o AAD impede usar o
  pacote em outra rota ou método.
- **Janela temporal**: pacote capturado deixa de valer depois de `CRYPTO_JANELA_SEG`.
- **Falha fechada** em tudo: pacote inválido nunca vira "dado em claro"; o formato v1 `{x,y,z}` é recusado.

### Limites honestos (leia antes de confiar)

- **Sem HTTPS, um atacante ATIVO no caminho pode se passar pelo servidor**: ele troca a chave pública
  dentro do HTML (ou da resposta de `/r4/chave`) pela dele, lê tudo e repassa. A criptografia v2 só
  resolve o atacante **passivo** sem TLS. **HTTPS continua obrigatório em produção** (seção 5.1).
- **XSS lê os dados em claro**: um script injetado na página vê o que o usuário digita antes de cifrar
  (e pode chamar `R4.http` como a página). CSP, escape e `r4-ignore` continuam sendo a defesa.
- **Replay dentro da janela**: o servidor guarda o nonce de cada pacote aceito (chave
  `sha256(kid|nonce)`, validade = `CRYPTO_JANELA_SEG` + 65 s) e recusa a repetição com 400 (motivo
  `replay` no log). Ordem: **APCu** se estiver ligado (`apcu_add`, atômico); senão **um arquivo por nonce**
  em `storage/cache/nonces/` (pasta 0700, fora do Git; criação exclusiva `fopen(..., 'x')` = atômica entre
  processos; limpeza oportunista no máximo 1x por minuto, que apaga os vencidos examinando até 20.000
  arquivos por vez, e teto de 10.000 nonces válidos — passou disso, os mais velhos são apagados); senão
  (storage sem permissão de escrita) o pacote é **aceito** e o log avisa uma vez por dia — sobra só a
  janela de tempo. Limites: com vários servidores atrás de um balanceador cada um tem o seu cache (use
  APCu+afinidade de sessão, um `storage/` compartilhado ou Redis); o teto existe contra encher o disco e, sob
  inundação de pacotes válidos, um nonce apagado antes da hora volta a ser aceito. Rotas que movem dinheiro
  continuam precisando de idempotência própria (id de transação).
- Não autentica o usuário (qualquer um pode fazer uma sessão com a chave pública) — e por isso **não impede
  CSRF sozinho**: um site de terceiros também consegue montar um pacote válido. A checagem de origem da
  seção 5.2 cobre isso; **autenticação, autorização e validação** (`ctrl::validate`) continuam obrigatórias.
- Relógio: o `t` vem do navegador (corrigido pelo `Date` do servidor quando há diferença > 30 s).
- O caminho do AAD é o que o PHP vê em `REQUEST_URI`: um proxy que **reescreve o caminho** (ex.: tira
  um prefixo `/app`) faz o pacote falhar — publique a aplicação no mesmo caminho que o navegador usa.
- Custo: uma derivação ECDH + HKDF por requisição cifrada (barato; o antigo PBKDF2 de 100 mil
  iterações por requisição deixou de existir). Limite de taxa no proxy continua recomendado.
- `form.js` (form com `encrypt`) e `components.js` (grid com `encrypt`) ainda chamam
  `R4.crypto.encrypt(dados)` sem `{metodo, caminho}`: o AAD vira `POST` + caminho da **página** e o
  servidor recusa se o `action`/`src` for outra rota (aviso no console). Corrigir passando
  `{ metodo, caminho: url }` nesses dois pontos (ver relatório da migração).

### API resumida

```js
// padrão: corpo cifrado; resposta em JSON comum
await R4.http.post('/api/pedido', { item: 1 });
// pedido E resposta cifrados (resposta em claro é recusada)
await R4.http.post('/api/pedido', { item: 1 }, { cifrarResposta: true });
// baixo nível
const env = await R4.crypto.encrypt(dados, { metodo: 'POST', caminho: '/api/pedido' });
await R4.crypto.decrypt(respostaCifrada);    // {v,z,x} da sessão → dados (ou null)
R4.config.exigirHttps = true;                // página http fora de localhost → recusa enviar
```

```php
$d = ctrl::getPost();             // decifrado (ou JSON em claro); null + Controller::$postErro=400 se pacote ruim
$d = ctrl::getPost(true);         // esta rota só aceita corpo cifrado
if (ctrl::$postErro === 400 && ctrl::$cryptoErro !== '') ctrl::falhaCripto();   // 400 JSON limpo
ctrl::responderCifrado(['status' => 200, 'retorno' => $r]);   // cifra se o cliente pediu (X-R4-Res: 1)
```

## 5.1 Política HTTPS/HTTP (`Core\Security\Transport`)

Aplicada no começo do `public/index.php` (logo após o `src/Env.php`). Variáveis e cenários completos em
`docs/PRODUCAO.md`. Resumo:

- HTTPS é reconhecido por `$_SERVER['HTTPS']`, porta 443 ou `X-Forwarded-Proto: https` **vindo de um IP
  em `TRUSTED_PROXIES`**. Cabeçalhos `X-Forwarded-*` de qualquer outro cliente são ignorados (forjá-los
  não muda nada).
- `HTTPS_MODE=required` (padrão em produção): GET/HEAD em HTTP → **308** para
  `https://<host validado><uri>`; outros métodos → **426** (POST nunca é redirecionado). IPs/CIDRs em
  `HTTP_PERMITIDO_PARA` (padrão `127.0.0.1,::1`) podem usar HTTP (chamadas internas). Em HTTPS envia
  `Strict-Transport-Security` (`HSTS_MAX_AGE`, `HSTS_SUBDOMAINS`).
- `HTTPS_MODE=optional` (padrão fora de produção): nada é bloqueado, sem HSTS; em produção registra um
  aviso no log (no máximo 1x por dia).
- `APP_HOSTS` preenchido: Host fora da lista → 400 (anti Host-header injection). Vazio: o Host só é
  usado no redirecionamento se tiver sintaxe válida (nunca é refletido cru).
- O cookie de sessão (seção 5.3) usa `Secure` = detecção real de HTTPS (`Transport::isHttps()`).
- No cliente: página https não envia para `http://` (conteúdo misto); página http fora de
  localhost/rede privada avisa uma vez no console; com `R4.config.exigirHttps = true` recusa enviar.

## 5.2 Anti-CSRF por origem (`Core\Security\Csrf`)

O envelope cifrado **não autentica o remetente** (a chave pública é pública): sem esta camada, uma página
de outro site poderia fazer o navegador da vítima enviar um POST para cá, com os cookies dela.
`Csrf::guard()` roda no `public/index.php` logo depois de `Transport::aplicar()`, em toda requisição cujo
método altera estado (tudo que não é GET, HEAD ou OPTIONS):

| Regra | Recusa |
|---|---|
| `Sec-Fetch-Site` presente e diferente de `same-origin`/`none` (inclui `same-site`: subdomínio irmão) | 403 |
| `Origin` presente e diferente da origem da requisição — **esquema + host + porta**, exatos (host validado pelo `Transport`, com `APP_HOSTS`; esquema pela detecção real de HTTPS, inclusive atrás de proxy confiável) — e fora de `CSRF_ORIGENS_PERMITIDAS`. `Origin: null`, com caminho, barra final ou usuário → inválido | 403 |
| `Content-Type` que não é `application/json` (ou `application/*+json`) nem `multipart/form-data`: `text/plain` e `application/x-www-form-urlencoded` são justamente o que um `<form>`/`fetch` “simples” de outro site envia **sem preflight**; corpo sem `Content-Type` também | 415 |

- Resposta: JSON `{status, retorno}` (`"Requisição recusada."` / `"Tipo de conteúdo não suportado."`), sem
  detalhes; o motivo (`origin-outra`, `origin-invalida`, `sec-fetch-site`, `content-type`...) vai só para o log.
- **A proteção é contra NAVEGADORES**: requisições sem `Origin` e sem `Sec-Fetch-Site` (curl, cron, serviço
  interno, app mobile) continuam aceitas se o `Content-Type` estiver certo. Todo navegador atual manda
  `Origin` em POST entre origens; `multipart/form-data` é forjável por `<form enctype>` e por isso depende
  dessa checagem de origem.
- `CSRF_ORIGENS_PERMITIDAS="https://app.parceiro.com,https://admin.exemplo.com:8443"`: origens extras
  (API consumida de propósito por outro domínio). Uma origem listada dispensa a regra do `Sec-Fetch-Site`;
  o `Content-Type` continua exigido. O projeto não envia cabeçalhos CORS — configure-os se precisar.
- `CSRF_ATIVO=false` desliga tudo (em produção o log avisa 1x/dia). Não use além de um diagnóstico.
- Atrás de proxy/LB que termina o TLS: configure `TRUSTED_PROXIES` (senão o PHP acha que a requisição é
  `http` e recusa o `Origin: https://...`) e preserve o cabeçalho `Host` original (com a porta, se não for a padrão).
- Com cookie `SameSite=Lax` (seção 5.3) o navegador já não manda o cookie de sessão em POST entre sites;
  esta checagem cobre o resto (rotas sem cookie, navegadores antigos, subdomínios) e é independente da sessão.

## 5.3 Sessão sob demanda (`Core\Security\Session`)

- O `public/index.php` **não inicia sessão**: páginas, vitrine, `/r4/chave` e a API não criam cookie nem
  travam o arquivo de sessão (`session_start()` serializa as requisições do mesmo usuário).
- Quem precisa chama `Session::start()` (idempotente). Ela aplica `session.use_strict_mode=1` (ID inventado
  pelo cliente é descartado), `use_only_cookies=1`, `use_trans_sid=0` e cookie `HttpOnly`, `SameSite=Lax`,
  `Path=/`, sem `Domain`, `Secure` em HTTPS. Em HTTPS o nome é **`__Host-R4SID`** (o navegador só aceita o
  cookie se for Secure, Path=/ e sem Domain — um subdomínio não consegue plantá-lo); em HTTP, `R4SID`.
- **Login**: autenticou (ou mudou de privilégio) → `Session::regenerar()` (novo ID, dados mantidos,
  anti fixação de sessão). **Logout**: `Session::encerrar()` (apaga dados, destrói e expira o cookie).
- O middleware gerado por `composer middleware X` já chama `Session::start()` antes de ler `$_SESSION`.

```php
use Core\Security\Session;
Session::start();
if (senhaConfere($u, $senha)) { Session::regenerar(); $_SESSION['usuario_id'] = $u['id']; }
```

---

## 6. Vitrine e API de teste

- `/vitrine` (e `/`, que hoje abre a vitrine) e `/vitrine/api/*` **só respondem com
  `APP_DEBUG=true`**; em produção devolvem 404. Quando a aplicação real existir, aponte `/` para
  ela em `src/routes.php`.
- O playground executa com `eval` **apenas** o código que o próprio usuário digitou/clicou no editor
  (o texto inicial é o código-fonte das demos). Nada vem da URL, do `#hash` ou do `localStorage`:
  o `#hash` só seleciona um item já registrado (comparação exata com `R4.registry`/`R4.modules`).
- `vitrine.php` só carrega arquivos locais (`/libr4`, `/showcase`) e não tem script inline: o tema salvo
  é aplicado antes de pintar a página por um script externo (`/showcase/boot.js`, que lê o
  `localStorage` e só liga/desliga uma classe).
- A API de teste: `nosniff`, `Cache-Control: no-store`, CSP `default-src 'none'`, corpo ≤ 1 MB
  (413), envelope cifrado v2 conferido antes de qualquer rota (400 JSON limpo; `{x,y,z}` antigo
  também recusado), parâmetros GET só como texto e com limites, ordenação só por campo existente,
  JSON com `JSON_HEX_*` (o eco não reflete `<`/`>`). `POST /vitrine/api/echo-cifrado` responde
  cifrado quando o pedido manda `X-R4-Res: 1`.

---

## 7. Cabeçalhos HTTP e CSP (`docker/nginx/default.conf`)

Aplicado no nginx:

- `Content-Security-Policy` por rota (via `map $request_uri`):
  - padrão: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
    img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'self' blob:;
    worker-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; base-uri 'self';
    form-action 'self'; frame-ancestors 'self'`;
  - `/vitrine...` (inclui `/vitrine/testes`): igual + `'unsafe-eval'` (playground). **Só nessa rota.**
- **`script-src` sem `'unsafe-inline'`** em todas as rotas: a chave pública vai numa `<meta>` (seção 5) e o
  tema da vitrine é aplicado por `/showcase/boot.js`. Um `<script>` inline ou `onclick="..."` injetado por
  XSS **não executa**. No seu código: só `<script src>` de arquivos da própria origem e `addEventListener`.
- `style-src 'unsafe-inline'` **continua** necessário: a libr4 cria `<style>` em tempo de execução (tema,
  variáveis `--r4-*`, tags declarativas), os gráficos usam `style="..."` nos SVG e as páginas de erro têm
  `<style>`. CSS injetado não executa código, mas pode vazar dados por seletores. Plano para eliminá-lo:
  tema por classes + CSSOM (`element.style`/`adoptedStyleSheets` não são bloqueados pela CSP), atributos de
  apresentação (`fill=`, `stroke=`) nos SVG e CSS das páginas de erro em arquivo — aí `style-src 'self'`.
- `Permissions-Policy` (câmera, microfone, geolocalização, pagamento, USB, sensores desligados),
  `Cross-Origin-Opener-Policy: same-origin`, **`Cross-Origin-Resource-Policy: same-origin`** (outro site não
  embute nossos scripts/imagens/JSON; a própria origem, `/r4/chave` e o `fetch` da página não são afetados —
  não há CDN; se um parceiro precisar carregar um arquivo daqui, troque para `cross-origin` só naquele
  `location`), `X-Frame-Options`, `Referrer-Policy`, `nosniff` — todos repetidos no bloco de estáticos
  (no nginx, `add_header` dentro de um `location` anula os do `server`); `X-Powered-By` escondido.
- Cache: estáticos com `?v=` (o `asset()` versiona pelo `mtime`) → `public, max-age=31536000, immutable`;
  sem `?v=` → 7 dias. `open_file_cache` moderado (recarregue o nginx depois de publicar arquivos) e
  `gzip_static` comentado (exige o módulo; ver `default.conf`).
- `Strict-Transport-Security` é enviado pelo PHP (`Core\Security\Transport`) só em HTTPS com
  `HTTPS_MODE=required` — não ligue também no nginx (duplicaria). O `default.conf` tem, comentado, um
  exemplo de server 443 com TLS, redirecionamento e repasse de `X-Forwarded-Proto` atrás de proxy.
- Endurecimento do PHP-FPM e dos containers (`disable_functions`, `allow_url_fopen=Off`, `open_basedir`,
  `no-new-privileges`, `cap_drop: ALL`): `docs/PRODUCAO.md`, seção "Docker".

---

## 8. Checklist de produção

- [ ] `APP_DEBUG=false` no `.env` (vitrine e API de teste viram 404; erros PHP não aparecem).
- [ ] `CRYPTO_PRIVATE_KEY` gerada com `php tools/gerar-chave.php` (uma por ambiente) e `BASE_CRIPTOGRAFIA`
      removida do `.env` (deprecada, ignorada).
- [ ] HTTPS em tudo: `HTTPS_MODE=required` (padrão em produção), `APP_HOSTS` preenchido,
      `TRUSTED_PROXIES` só com o IP do proxy/LB (se houver) e HSTS ativo (`HSTS_MAX_AGE` > 0).
- [ ] Rotas sensíveis com `ctrl::getPost(true)` (ou `CRYPTO_OBRIGATORIA=true`) se o corpo precisar vir cifrado;
      `storage/` gravável pelo PHP (cache de nonces anti-replay) ou APCu ligado (seção 5).
- [ ] `CSRF_ATIVO=true` (padrão) e `CSRF_ORIGENS_PERMITIDAS` só com origens que realmente consomem a API (seção 5.2).
- [ ] Sessão só com `Session::start()`; `Session::regenerar()` no login, `Session::encerrar()` no logout (seção 5.3).
- [ ] CSP do nginx ativa (script-src sem `'unsafe-inline'`; seção 7) e nenhum `<script>` inline nas suas views.
- [ ] PHP-FPM com `docker/php/zz-fpm-seguranca.conf` e containers com `no-new-privileges`/`cap_drop` (`docs/PRODUCAO.md`).
- [ ] `R4.config.strictOrigins = true` (e `allowedOrigins` se usar API de outro domínio).
- [ ] Vitrine desabilitada (automático com `APP_DEBUG=false`) e rota `/` apontando para a aplicação.
- [ ] Toda entrada validada de novo no servidor (tamanho, tipo, formato); limite de taxa no proxy.
      Use `ctrl::validate([...])` / `Core\Security\Input` em toda rota que recebe dados (seção 13).
- [ ] Nenhum SQL montado com concatenação de entrada: só `prepare`/`bind`; colunas dinâmicas por allowlist.
- [ ] Upload só com `Core\Security\Upload` (allowlist, destino em `storage/`, fora do `public/`); `storage/`
      gravável só pelo usuário do PHP e fora do backup público.
- [ ] Texto que vai para IA com `Core\Security\Prompt`; o modelo sem ferramentas perigosas; a SAÍDA dele
      escapada/validada antes de virar HTML, SQL ou comando.
- [ ] HTML de usuário só sanitizado e dentro de `r4-ignore`.
- [ ] Revisar os pontos "não corrigidos" da seção 11 (`Decryption.php`, `index.php`, sessão).

---

## 9. Inventário de sinks (estado atual)

| Sink | Onde | Origem do dado | Decisão |
|---|---|---|---|
| `innerHTML` (`html` de panel/window/div) | components.js:64, 70, 1154, 1246, 1250 | config do desenvolvedor | HTML confiável, documentado |
| `innerHTML` renderer `html:true` | components.js:581 | renderer do desenvolvedor | só com opt-in explícito; padrão é texto |
| `srcdoc` impressão | components.js:1061 | dados da grade | tudo escapado + `iframe sandbox` sem scripts |
| `innerHTML` (`setContent` com `R4.raw/R4.html`) | core.js:94 | HTML marcado pelo desenvolvedor | `R4.html` escapa interpolações |
| `innerHTML` (`el({html})`) | core.js:138 | lib/desenvolvedor | HTML confiável, documentado |
| `setAttribute` genérico (`el`, `domAttrs`) | core.js `safeAttr` | lib/config | recusa `on*`, `srcdoc` e URL perigosa |
| conteúdo de `<r4-*>` → `html` | declarative.js:92, 133; form.js:1653; ui.js:243, 860 | HTML da página | confiável (é o próprio HTML); use `r4-ignore` para conteúdo de usuário |
| `style.cssText += hostStyle` | declarative.js:150 | atributo `style` da própria tag | já estava no DOM; sem ganho para atacante |
| `location.href` (`goto:`) | declarative.js:206 | atributo `r4-click` (pode ter dado) | `safeUrl` (só relativa/#/http(s)/mailto/tel) |
| `DOMParser` (XLSX) | files.js:488 | arquivo do usuário | `DOCTYPE` recusado, só leitura de texto/atributos |
| `innerHTML` form/fieldset/formrow | form.js:1291, 1329, 1388 | config | HTML confiável, documentado |
| `document.write` (carregador) | libr4.js:11 | `src` do próprio `<script>` | aspas e `< >` removidos |
| `innerHTML` (`R4.render`) | quick.js:64 | desenvolvedor | HTML confiável, documentado |
| `innerHTML`/`insertAdjacentHTML` ui | ui.js:195, 227, 794, 891, 942, 995, 1095, 1201, 1243 | config `html` | HTML confiável, documentado; `timeline` via `src` descarta `html` |
| `setAttribute('style', cor)` | chart.js:940, 1023, 1116 (+ `style:` em S()) | config de cor | allowlist `cssColor` |
| `<style>` de tema | theme.js `applyDom` | `R4.theme.set` / `localStorage` | allowlist por campo |
| `innerHTML` da vitrine | app.js:76, 127 | texto digitado no editor/playground | self-only (ferramenta de dev, só com APP_DEBUG) |
| `eval` da vitrine | app.js:129 | texto do editor | self-only; nunca da URL/hash/storage |
| `outerHTML` (leitura) | icons.js `R4.icon.html` | SVG montado por DOM a partir do mapa fixo | só serializa (não é sink); devolve `R4.raw` |
| `eval`, `new Function`, `window.open`, `createContextualFragment` | — | — | não existem na lib |

---

## 10. Achados e correções

Severidade: **C**rítica, **A**lta, **M**édia, **B**aixa, **I**nformativa. Linhas = posição original
(antes da correção). "Antes/depois" = resultado do teste correspondente em `tools/testes-seguranca.js`.

| # | Sev. | Onde | Prova de conceito | Correção |
|---|---|---|---|---|
| 1 | A | declarative.js:195 (`goto:`) | `r4-click="goto:javascript:window.__pwn=1"`; também via coluna de ações `{ 'r4-click': 'goto:{url}' }` com `url` da API, e `emptystate.actionClick`. Antes: `window.__pwn === 1` (o jsdom executou). | `R4.util.safeUrl`: só relativa/#/http(s)/mailto/tel; resto bloqueado com aviso. |
| 2 | A | components.js:575 (grid `renderer`) | `renderer: v => '<b>' + v + '</b>'` com `nome = '<img src=x onerror=...>'` → `img[onerror]` na célula. | String/número → texto; HTML só com `R4.html`/`R4.raw`/Node; `html:true` mantém o modo antigo. Demo atualizada. |
| 3 | A | ui.js:899-906 (`timeline` com `src`) | JSON da API `[{ "titulo": "x", "html": "<img src=x onerror=...>" }]` → HTML ativo. | Campo `html` de eventos vindos de `src` é descartado (vira texto). |
| 4 | A | core.js:36-38 (`R4.util.merge`) | `merge({}, JSON.parse('{"__proto__":{"pwn":1}}'))` → `({}).pwn === 1` (poluição global). | Ignora `__proto__/constructor/prototype`, só chaves próprias, não altera objetos herdados. |
| 5 | M | core.js:93 (`Object.assign(this, cfg)`) | `R4.create(JSON.parse('{"xtype":"panel","__proto__":{"build":null}}'))` → protótipo trocado (`c.render is not a function`). | `R4.util.assign` ignora as chaves perigosas; atributos HTML com esses nomes são ignorados. |
| 6 | M | form.js:162-176, 328 (`pattern`) | `pattern="(a+)+$"` + valor `"a"×27 + "!"` → **21,5 s** de página travada (25 → ~5 s). | Detector de quantificador aninhado (padrão ignorado com aviso) + valor > 5.000 caracteres não roda a regex. |
| 7 | M | files.js:548-551 (`parseXLSX`) | XLSX de ~10 KB com 1.000 linhas, cada uma com célula em `XFD` → 16 milhões de células alocadas. | `maxCells` (padrão 10 milhões) → recusa com mensagem. |
| 8 | M | net.js:26 (`secret()`) | `BASE_CRIPTOGRAFIA=""` em produção → cifra com chave vazia (pública) sem aviso. | Fora de localhost lança erro (nada é enviado); em localhost avisa uma vez. `decrypt` exige strings e IV de 12 bytes. |
| 9 | M | net.js:73, components.js:367, form.js:1324 | `src="data:application/json,[...]"`/`action="https://evil"` aceitos em silêncio (injeção de dados / exfiltração de formulário). | `R4.http.check`: só http(s)/relativa; aviso para outra origem; `strictOrigins`/`allowedOrigins`; `credentials: 'same-origin'`. |
| 10 | M | VitrineController.php | `/vitrine` (com `eval` de playground) respondia mesmo com `APP_DEBUG=false`. | 404 sem `APP_DEBUG=true` (como a API de teste). |
| 11 | M | default.conf | Sem CSP/Permissions-Policy; bloco de estáticos perdia os cabeçalhos do `server`. | CSP por rota (`unsafe-eval` só em `/vitrine`), Permissions-Policy, COOP, cabeçalhos repetidos nos estáticos, `X-Powered-By` oculto. |
| 12 | M (core) / B (vitrine) | Decryption.php:36-39 via VitrineApiController | `{"x":["a"],"y":{},"z":3}` → `Fatal error: Uncaught TypeError ... Decryption.php:39` (caminho e stack na resposta com debug). | Na API de teste: pacote conferido antes (400). No core: **não editado** (ver seção 11). |
| 13 | B | VitrineApiController.php:51-59 | `?q[]=a&sort[]=b` → `Warning: Array to string conversion in C:\...\VitrineApiController.php` no corpo. | Parâmetros só como texto com limite; ordenação só por campo escalar existente. |
| 14 | B | VitrineApiController.php (geral) | Sem `nosniff`/`no-store`; corpo sem limite; eco refletia `</script><img ...>` cru. | Cabeçalhos, 413 acima de 1 MB, JSON com `JSON_HEX_*`, tamanhos máximos em `cadastro`. |
| 15 | B | core.js:60, 101 (`el`, `domAttrs`) | `el('a', {href: 'javascript:...', onclick: '...'})` / `domAttrs: {onclick: '...'}` criavam handler/URL ativos. | `safeAttr`: recusa `on*` em texto, `srcdoc` e URL perigosa. |
| 16 | B | chart.js:42 (`cssColor`) | `color: 'image-set("https://evil/y.png" 1x)'` passava e ia para `style` (requisição externa / rastreio). | Allowlist de cores. |
| 17 | B | files.js:175 (`safeName`) | `download('x', 'evil\u202Etxt.exe')` mantinha o RLO (nome visualmente falso). | Remove bidi/zero-width/controles e `_`/`.` iniciais. |
| 18 | B | components.js:1051 (impressão) | iframe `srcdoc` sem `sandbox` (conteúdo já escapado). | `sandbox="allow-same-origin allow-modals"` (sem scripts). |
| 19 | I | theme.js:239, 251 | `R4.theme.set({preset:'__proto__'})` aceitava o rótulo herdado. | `hasOwnProperty` nos presets. |
| 20 | I | libr4.js:7-9 | `document.write` com `src`/query do próprio script sem sanitizar. | Remove aspas/`< >` da base e caracteres fora de `[\w.=&%?-]` da query. |
| 21 | I | declarativo (geral) | HTML de usuário com `<r4-*>`/`r4-click` é montado/executado pelo MutationObserver ("script gadget"). | `r4-ignore` + `R4.config.autoScan`; documentado. |
| 22 | I | ui.js:1230 (`R4.notify(obj)`) | objeto de dados com `__proto__` próprio trocava o protótipo das opções. | `R4.util.assign`. |

Já estavam corretos (confirmados por teste): textos de grid/form/select/stat/notify/tooltip/
dropdown/breadcrumb/avatar como texto; `toCSV` contra fórmulas; `toXLSX` sem `<f>`; `parseCSV` com
`__proto__`; CSV com aspas quebradas e 200 mil linhas; XLSX com `DOCTYPE`, "zip bomb" e `../`;
validação do `filedrop`; tema com JSON malicioso no `localStorage`; i18n (texto + allowlist de
atributos); `#hash` hostil na vitrine; IV/salt aleatórios e detecção de adulteração no AES-GCM.

### Mudanças de API / comportamento

1. **grid `renderer`**: string devolvida agora é **texto**. Para HTML: `R4.html\`...${v}...\``,
   `R4.raw(html)` ou um elemento DOM; `html: true` na coluna restaura o comportamento antigo.
2. Novos: `R4.html`, `R4.raw`, `R4.util.escArg`, `R4.util.safeUrl`, `R4.util.setContent`,
   `R4.util.isRaw`, `R4.util.assign`, `R4.http.check`, `R4.config.strictOrigins`,
   `R4.config.allowedOrigins`, `R4.config.autoScan`, atributo `r4-ignore`, opção `maxCells` do
   `parseXLSX`, opção `credentials` do `R4.http.request`.
3. `goto:` recusa esquemas perigosos; `R4.http`/grid/form/select/... recusam esquemas não-http(s).
4. ~~`R4.crypto` recusa chave vazia fora de localhost; `decrypt` exige `{x,y,z}`~~ — substituído pela
   criptografia v2 (seção 5): `BASE_CRIPTOGRAFIA`, `window.BASE_CRIPTOGRAFIA`, `R4.config.cryptoKey` e o
   formato `{x,y,z}` **deixaram de existir** (o servidor responde 400 a um `{x,y,z}`); envelope agora
   `{v:2,kid,k,s,z,x}`; `R4.crypto.encrypt(dados, {metodo, caminho})`; `R4.crypto.decrypt` abre respostas
   `{v,z,x}` da sessão (ou pedidos da própria sessão); novos `R4.crypto.sessao/novaSessao/chaveServidor`,
   `R4.http` `cifrarResposta`, `R4.config.serverKey/serverKeyUrl/exigirHttps`, `GET /r4/chave`,
   `Controller::cifrar/responderCifrado/falhaCripto/postCifrado`, `getPost(?bool $exigirCifra)`.
5. `R4.util.el`/`domAttrs` ignoram `on*` em texto e URLs perigosas; `merge` não altera objetos herdados.
6. `pattern` com quantificador aninhado é ignorado (aviso); valor > 5.000 caracteres falha no `pattern`.
7. `/vitrine` e `/` (vitrine) → 404 com `APP_DEBUG=false`.
8. Novos: `R4.icon`, `<r4-icon>`, `R4.util.icon`, `R4.util.T`, `R4.util.tx`, `R4.suggest`; `emptyText`/`loadingText`/`errorText`/`summaryLabel`/`placeholder` (grid, select, treepanel, chart, filedrop, form) têm padrão `''` = texto no idioma atual. Cobertos por 5 casos novos em `tools/testes-seguranca.js` (ícones e i18n).

---

## 11. Não corrigido (fora dos arquivos desta tarefa) — recomendações

- ~~**`src/Utils/Decryption.php`**~~: virou fachada fina da criptografia v2 (`Core\Security\Crypto`);
  o esquema v1 com PBKDF2 foi removido.
- ~~**`public/index.php`**~~: chave pública numa `<meta>` (sem script inline), sessão sob demanda
  (`Core\Security\Session`), anti-CSRF (`Core\Security\Csrf`), erros sempre no log; `expose_php=0` no
  `zz-app.ini`.
- ~~**`core/Controller.php`**: a página de "view não encontrada" mostra caminhos do servidor~~ —
  corrigido na seção 13 (com `APP_DEBUG=false` só "Erro interno"; detalhe no log).
- ~~**CSP estrita**~~: `script-src` sem `'unsafe-inline'` (seção 7); falta só eliminar `style-src 'unsafe-inline'` (plano na seção 7).
- **ReDoS por alternância sobreposta** (`(a|aa)+$`) não é detectado — limitação documentada.
- **HTML confiável por design** (seção 3) continua sendo HTML: a lib documenta, não escapa.
- **Redirecionamento aberto**: `goto:https://outro-site` é permitido (é navegação legítima);
  valide destinos vindos de dados.
- ~~Custo do PBKDF2 no servidor~~: removido com o v2 (ECDH + HKDF por requisição cifrada).
- A configuração do nginx e do Docker não pôde ser validada com `nginx -t`/`docker compose up` neste
  ambiente (sem nginx/docker): valide no servidor. O `Dockerfile` roda `php-fpm -t` no build. O efeito de
  `disable_functions` + `allow_url_fopen=Off` + `open_basedir` foi exercitado com `php -S` (vitrine, upload,
  POST cifrado, replay, SQLite).

---

## 12. Como rodar os testes

```bash
# servidor de desenvolvimento (APP_DEBUG=true)
php -S 127.0.0.1:8087 -t public
# jsdom: npm i -D jsdom   (ou aponte para uma instalação existente)
JSDOM_PATH=/caminho/node_modules/jsdom node tools/testes-seguranca.js
# só alguns casos (a vitrine nem é aberta se nenhum caso da seção 1 casar — economiza memória)
R4_CASOS='^(crypto|api|config|php)' JSDOM_PATH=... node tools/testes-seguranca.js
# política HTTPS/HTTP + criptografia v2 no servidor (PHP puro, sem servidor nem .env)
php tools/testes-transport.php
```

Criptografia v2 (casos `crypto v2:`): interoperabilidade real Node (`crypto.webcrypto`) → PHP → Node
(pedido e resposta cifrados), a libr4 de verdade no jsdom → PHP → libr4, e falha fechada (400 JSON
limpo, sem caminho/stack) para pacote adulterado, AAD de outra rota/método (replay em outro endpoint),
`t` expirado/no futuro (`R4_TEMPO`), `kid` errado (`R4_CHAVE`), ponto fora da curva/comprimido/zero,
tamanhos absurdos, `k`/`s`/`z`/`x` fora do base64url, campos com tipo errado/extras, `v` errado, formato
v1 `{x,y,z}`, corpo gigante (413) e **replay do mesmo pacote na mesma rota** (2º envio → 400). Casos
`csrf:`/`sessao:`: POST real com `Origin` de outro domínio/`null`/outra porta, `Sec-Fetch-Site: cross-site`
e `same-site` → 403, `text/plain`/formulário → 415, same-origin e curl sem `Origin` → 200, GET entre sites
→ 200, nenhuma rota cria cookie de sessão; `config:` confere a CSP sem `'unsafe-inline'` em `script-src`,
COOP/CORP/cache no nginx e o endurecimento do PHP-FPM/compose. `tools/testes-transport.php` cobre a
política HTTPS (https direto, porta 443, proxy confiável × não confiável, IP isento IPv4/IPv6/CIDR, Host
fora de `APP_HOSTS`, GET→308, POST→426, optional, HSTS, cabeçalho forjado), o `Crypto` unitário (rotação de
chave, motivos), o **cache de nonces em arquivos** (replay, memo no mesmo request, arquivo vencido × recente,
limpeza 1x/min com relógio simulado, teto, varredura limitada, storage não gravável), o **`Csrf`** (origem
exata com porta/IPv6/esquema, proxy confiável, `APP_HOSTS`, `CSRF_ORIGENS_PERMITIDAS`, tipos de
conteúdo, métodos) e a **`Session`** (opções do cookie, `__Host-`, start/regenerar/encerrar num processo separado).

Cada caso imprime `PASSOU`/`FALHOU`; o processo sai com código 1 se algum falhar (2 se o ambiente
não estiver pronto). Os testes usam payloads reais (`<img src=x onerror=...>`, `<script>`,
`"><svg onload=...>`, `javascript:`, `__proto__`, `=HYPERLINK(...)`, `@SUM(...)`, CSV com aspas
quebradas, valores gigantes, `(a+)+$`, XLSX malicioso, JSON malicioso no `localStorage`) e conferem
`window.__pwn` indefinido, nenhum `alert()` e nenhum elemento/atributo ativo no DOM (o jsdom não
carrega imagens, então além da execução o teste procura `on*`, `<script>` e `javascript:` no DOM).

A parte de injeção (seção 13) faz requisições HTTP reais contra o `:8087` (equivalentes a `curl`,
inclusive multipart montado byte a byte para nomes com NUL/`../`), roda o PHP pela linha de comando
(`Input`/`Prompt` unitários e os geradores numa pasta temporária) e confere que nada foi gravado fora
de `storage/uploads/vitrine`. Payloads: `' OR 1=1 --`, `'; DROP TABLE`, `UNION SELECT`, `%`, `../`,
`%00`/NUL, `.php` disfarçado de imagem, `shell.php.jpg`, `.phtml`/`.phar`/`.htaccess`/`.user.ini`, PNG
poliglota, arquivo de 2,5 MB e de 5 MB, PNG de 20000×20000, "ignore as instruções anteriores"/"ignore
all previous instructions", `<|im_start|>`, arrays/objetos no lugar de texto, JSON com 100 níveis,
bidi/zero-width/"tags" Unicode, `__proto__`.

---

## 13. Injeção: SQL, arquivos e prompts

> **Princípio (inegociável):** validação no navegador **não protege o servidor**. Qualquer pessoa
> chama `/sua/api` com `curl`, Postman ou um script, sem passar pela página, sem libr4 e sem os
> avisos dos campos. A proteção real fica no PHP: **consultas preparadas**, **validação por
> esquema**, **upload seguro** e **tratamento do texto que vai para um modelo de IA**. O cliente faz
> defesa em profundidade: normaliza (não manda NUL/bidi/lixo invisível), limita tamanho, avisa ou
> bloqueia o envio de conteúdo suspeito (UX) e gera sinais para log.
>
> O cliente **não** "escapa SQL". Trocar `'` por `\'` no navegador é antipadrão: quebra nomes como
> O'Brien, dá falsa sensação de segurança e não impede nada (o atacante não usa o seu navegador).

### 13.1 O que a lib garante

| Camada | Garantia |
|---|---|
| `Core\Database` | PDO com `ERRMODE_EXCEPTION`, `EMULATE_PREPARES=false` (prepare real no servidor), `utf8mb4`; `switchParams` só faz bind (parâmetro não escalar → erro, nunca "Array"); nome do `.sql` só `[A-Za-z0-9_-/]` (sem `..`); erro detalhado só no log (sem `APP_DEBUG` a resposta é genérica); rollback só da transação que a chamada abriu; `Database::ident()` valida identificadores (tabela/coluna) por formato. |
| `Core\Controller` | `getPost()` lê no máximo 2 MB (`MAX_POST_BYTES` no `.env` muda) e JSON com profundidade ≤ 32 (`Controller::$postErro` = 413/400); `ctrl::validate($regras)` responde 422 `{status, retorno:'Dados inválidos', erros:{campo:msg}}`; JSON das respostas com `JSON_HEX_*` + `JSON_INVALID_UTF8_SUBSTITUTE` + `nosniff`; `render()` só aceita nome de view `[A-Za-z0-9_-/]` e faz `extract(..., EXTR_SKIP)` depois de calcular o caminho (dado nunca troca `$viewFile`). |
| `Core\Security\Input` | Esquema declarativo; **recusa campos não declarados** (mass-assignment); tipos `string, int, float, bool, email, url (só http/https), enum, date, array, object, cpf, cnpj, phone`; texto sempre limpo (UTF-8 válido, NFC se houver `intl`, sem NUL/controles/bidi/zero-width/"tags"), `maxLength` padrão 1000; listas ≤ 100 itens, profundidade ≤ 5, corpo ≤ 200 chaves; nunca erro fatal/aviso com entrada malformada. |
| `Core\Security\Upload` | Um arquivo por campo; erro do PHP; `is_uploaded_file`; tamanho real; nome com NUL/controle/`/`/`\`/bidi recusado; extensão final em allowlist; **dupla extensão perigosa** recusada; extensões executáveis/ativas **nunca** aceitas (php, phtml, phar, exe, js, svg, html, htaccess, ini...); **MIME real (`finfo`) + assinatura** coerentes com a extensão; `<?php` em qualquer ponto (e `<?=` em texto) recusado; texto precisa ser UTF-8; imagem lida por `getimagesize` com limite de pixels; grava com **nome aleatório** (`bin2hex(random_bytes(16))`) **fora do docroot** (`storage/`), pasta 0750 + `.htaccess` "deny", arquivo 0640; nunca inclui/executa; `Upload::limpar()` apaga antigos. |
| `Core\Security\Prompt` | `untrusted()` limpa, corta, neutraliza `system:`/`### Assistant:`, `<system>`/`</instructions>`/`</dados_do_usuario>`, `<|im_start|>`, `[INST]`, `<<SYS>>`, cercas ` ``` `/`~~~`, e embrulha em `<dados_do_usuario id="aleatório">`; `systemGuard($id)` diz ao modelo que aquilo é DADO; `looksLikeInjection()` devolve sinais (pt/en) para log. |
| `R4.sanitize` (cliente) | `text`, `strip`, `deep`, `filename`, `detect`, `prompt`, `sniffFile`, `dangerousName`, `url`. Campos de texto: `sanitize: true` (padrão) — `getValue()` limpo e limitado (1000; textarea 10000; `maxlength` no HTML); `guard: 'warn'` (padrão; aviso visível, `console.warn` **sem o valor**, evento `suspicious`) ou `'block'` (campo inválido, form não envia); senha só perde NUL e nunca é inspecionada. `form.getValues()`/`submit()` tiram NUL/controles/bidi e chaves `__proto__/constructor/prototype`. `filedrop`: nome exibido/enviado saneado, `blockExec` (executáveis e dupla extensão), `sniff` (assinatura × extensão), `upload(url)` em multipart com o nome saneado. |

### 13.2 O que o desenvolvedor DEVE fazer no servidor

1. **SQL: só consulta preparada.** Nunca concatene entrada em SQL — nem "validada", nem "escapada".
   ```php
   // ERRADO (injeção): "SELECT * FROM clientes WHERE nome = '" . $nome . "'"
   $st = Database::getInstance()->prepare('SELECT id, nome FROM clientes WHERE nome = :nome');
   $st->execute([':nome' => $nome]);
   // LIKE: o valor também é parâmetro, e % _ digitados são escapados
   $st = $pdo->prepare("SELECT id FROM clientes WHERE nome LIKE :p ESCAPE '\\'");
   $st->execute([':p' => '%' . strtr($busca, ['\\' => '\\\\', '%' => '\\%', '_' => '\\_']) . '%']);
   // ORDER BY / coluna dinâmica: NÃO pode ser parâmetro → allowlist
   $col = in_array($_GET['sort'] ?? '', ['nome', 'criado_em'], true) ? $_GET['sort'] : 'nome';
   ```
2. **Toda rota que recebe dados valida por esquema** (tipo, tamanho, formato, campos permitidos):
   ```php
   use Core\Controller as ctrl;
   $d = ctrl::validate([
       'nome'  => ['type' => 'string', 'required' => true, 'minLength' => 3, 'maxLength' => 120],
       'email' => ['type' => 'email', 'required' => true],
       'idade' => ['type' => 'int', 'min' => 0, 'max' => 130],
       'plano' => ['type' => 'enum', 'in' => ['basico', 'pro']],
       'tags'  => ['type' => 'array', 'items' => ['type' => 'string', 'maxLength' => 30], 'maxItems' => 10],
       'obs'   => ['type' => 'string', 'multiline' => true, 'maxLength' => 2000],
   ]);
   // chegou aqui: $d tem só esses campos, limpos e com o tipo certo (senão já respondeu 422)
   $id  = Input::id($_GET['id'] ?? null);                       // int > 0 ou null
   $url = Input::safeRedirect($_GET['volta'] ?? '', ['app.exemplo.com']);   // sem redirecionamento aberto
   ```
   Validar **não** substitui o prepare (texto válido pode conter `'`), e **não** substitui escapar na
   saída HTML (`htmlspecialchars($v, ENT_QUOTES, 'UTF-8')` / `R4.util.esc`).
3. **Upload só pela classe, para fora do `public/`:**
   ```php
   $r = Upload::save('arquivo', ['permitidos' => ['png', 'jpg', 'pdf'], 'maxBytes' => 2 * 1024 * 1024,
       'destino' => Upload::storage('documentos'), 'imagem' => ['maxLargura' => 4000, 'maxAltura' => 4000]]);
   if (!$r['ok']) ctrl::responder(['status' => 422, 'retorno' => 'Arquivo recusado', 'erros' => ['arquivo' => implode(' ', $r['erros'])]], 422);
   // guarde $r['arquivo']['nome'] (aleatório) no banco; NUNCA devolva $r['arquivo']['caminho'] ao cliente
   ```
   Para devolver o arquivo: controller que confere a permissão do usuário, lê de `storage/` e envia
   com `Content-Type` fixo da allowlist, `Content-Disposition: attachment` e `X-Content-Type-Options: nosniff`.
   Nunca `include`/`require` de arquivo enviado; nunca sirva `storage/` direto pelo servidor web.
4. **Texto para IA:**
   ```php
   $p = Prompt::montar('Classifique a reclamação em: entrega, produto ou cobrança. Responda só a palavra.', $d['mensagem']);
   if ($p['sinais']) error_log('[ia] possível injeção: ' . json_encode(array_column($p['sinais'], 'sinal')));
   // $resposta = seuClienteLLM($p['system'], $p['user']);
   $categoria = in_array($resposta, ['entrega', 'produto', 'cobranca'], true) ? $resposta : 'indefinida';   // valide a SAÍDA
   ```
   **Injeção de prompt não pode ser eliminada só com filtros.** O modelo não separa instrução de dado
   com garantia; o bloco delimitado e a guarda reduzem a chance, a heurística ajuda a detectar — e
   ambos podem ser contornados (paráfrase, outro idioma, texto codificado, conteúdo de documento/página
   que o modelo lê). O que limita o estrago: **privilégio mínimo** (o modelo só vê o que o usuário
   já pode ver), **nenhuma ferramenta sensível** (apagar, pagar, enviar e-mail, rodar SQL/comando) sem
   **confirmação humana**, **validar/escapar a SAÍDA** do modelo como dado não confiável (HTML → escape;
   SQL → prepare; nunca `eval`/shell), **nunca colocar segredos** no prompt (chaves, senhas, dados de
   outros usuários) e registrar os sinais para auditoria e limite de taxa.

### 13.3 Exemplos no cliente (UX, não segurança)

```html
<!-- padrão: limpa e avisa; o servidor valida de novo -->
<r4-textfield name="nome" label="Nome" max-length="120"></r4-textfield>
<!-- campo de busca: bloqueia o envio de algo com cara de injeção -->
<r4-textfield name="q" label="Buscar" guard="block"></r4-textfield>
<!-- conteúdo técnico legítimo (ex.: SQL num campo de "consulta salva"): sem aviso -->
<r4-textarea name="sql" label="Consulta" guard="off"></r4-textarea>
<r4-filedrop accept=".png,.jpg,.pdf" max-size="2097152"></r4-filedrop>
```

```js
R4.sanitize.text('  Ana\u0000 Souza  ')          // 'Ana Souza'
R4.sanitize.filename('..\\..\\shell.php.jpg')     // 'shell_php.jpg'
R4.sanitize.kinds(R4.sanitize.detect("' OR '1'='1"))   // ['sql']  (só sinal)
await R4.sanitize.sniffFile(arquivo)               // { kind: 'php', ext: 'png', match: false }
filedrop.upload('/api/upload')                     // multipart com o nome saneado
form.on('suspicious', (f, campo, tipos) => log(campo.name, tipos))
```

Na vitrine, item **R4.sanitize** (grupo Núcleo): cadastro com payload SQL, os três modos de `guard`
com payloads prontos para copiar (`' OR '1'='1`, `'; DROP TABLE x;--`, `../../etc/passwd`,
`shell.php.jpg`, `ignore as instruções anteriores...`), "pular o navegador" (chama a API direto e
mostra o 422 do servidor), upload com arquivos hostis gerados na hora, prompt (prévia no cliente e
bloco montado no servidor) e busca/SQL real com prepare.

Endpoints de demonstração (só com `APP_DEBUG=true`): `POST /vitrine/api/cadastro` (esquema),
`POST /vitrine/api/upload` (campo `arquivo`; png/jpg/pdf/csv/txt até 2 MB; grava em
`storage/uploads/vitrine`, apaga após 1 h e mantém no máximo 50), `POST /vitrine/api/prompt`
(`{texto}`; não chama LLM), `GET /vitrine/api/busca?q=` (texto literal) e
`GET /vitrine/api/sql-seguro?nome=&contem=` (SQLite em memória com prepare/bind; `x' OR '1'='1` → 0 linhas).

### 13.4 Achados no PHP existente e correções

| # | Sev. | Onde | Problema | Correção |
|---|---|---|---|---|
| 23 | M | `core/Generator/*`, `core/Migration/MakeMigration.php` | Nome vindo da linha de comando ia direto para o código gerado e para o caminho: `composer controller "../../public/x"` grava fora de `src/`; `x';system('id');//` injeta código no arquivo gerado; `excluir mvc ../../core/Controller` apagaria arquivos do núcleo. | Nome só `[A-Za-z][A-Za-z0-9_]{0,63}`, rota só `/[A-Za-z0-9_-/]*`; `fopen(..., 'x')`; pastas 0755. Testado (nada criado, saída 1). |
| 24 | M | templates dos geradores | Model gerado devolvia `$e->getMessage()` ao cliente (SQL/tabela no 400) e não tinha exemplo de prepare; controller gerado usava `App\Model\Model` inexistente (erro fatal); migration fazia `rollBack()` depois de DDL (exceção "no active transaction"); `MakeMVC.php` tinha uma linha em branco antes do `<?php`. | Templates com `prepare` + `bindValue`, `ctrl::validate` de exemplo, erro só no log, `inTransaction()`; geradores testados com `php -l`. |
| 25 | M | `core/Controller.php` `render()` | `extract($data)` antes de montar `$viewFile` e sem validar `$view`: `render('x', $_GET)` ou `render($_GET['p'])` permitiria incluir outro `.php` (LFI). Página de erro mostrava caminhos mesmo sem `APP_DEBUG`. | Nome de view por allowlist, `EXTR_SKIP` depois do caminho, sem caminhos fora do debug. |
| 26 | M | `core/Database.php` `switchParams()` | Nome do `.sql` concatenado no caminho (traversal); mensagem do PDO devolvida a quem chamou (e os templates repassavam ao cliente); `rollBack()` mesmo sem transação própria (desfazia a do chamador ou gerava exceção fatal no `catch`); array de JSON virava "Array" com aviso. | Allowlist no nome, `\Throwable`, rollback só do que abriu, erro genérico sem debug, parâmetros só escalares. |
| 27 | M | `core/Controller.php` `getPost()` | Corpo sem limite e JSON com profundidade 512 (DoS por memória/CPU). | 2 MB / profundidade 32, resultado em cache, `Controller::$postErro`. |
| 28 | B | `core/Database.php` | `charset=utf8` (3 bytes no MySQL: corta emoji, histórico de truncamento) e identificadores de `runMigration` sem validação. | `utf8mb4`, `Database::ident()`, definição de coluna sem `;`/comentário. |
| 29 | B | `core/Controller.php` `json()`/`retorno()` | `json_encode` sem flags: UTF-8 inválido → corpo vazio; `<`/`>` crus. | `JSON_HEX_*`, `JSON_INVALID_UTF8_SUBSTITUTE`, `nosniff`. |
| 30 | B | `src/Utils/Decryption.php` | `base64_decode` não estrito; profundidade do JSON decifrado 512. | Estrito; profundidade passada pelo `getPost()`. |
| 31 | B | `VitrineApiController::cadastro` | Validação manual só de nome/e-mail; demais campos ignorados (mass-assignment se fosse gravar). | `ctrl::validate` com esquema completo. |
| 32 | I | `docker/nginx/default.conf`, `docker/php/zz-app.ini` | `client_max_body_size 20m`; `.phtml`/`.phar` em `public/` seriam servidos como texto; nada impedia servir `storage/`. | 10m + `client_body_timeout`; `.php[0-9]`/`.phtml`/`.phar`/`.phps`/`.inc` → 404; `/storage` e `/uploads` → 404; limites de upload/`max_input_*` no PHP; `storage/` no `.gitignore`/`.dockerignore`. |

Procurado e **não encontrado** no PHP: `eval`, `exec`/`shell_exec`/`system`/`passthru`/`proc_open`,
`unserialize`, `include`/`require` com entrada, `file_get_contents` com URL do usuário,
`header('Location: ' . $entrada)` e reflexão de entrada em HTML sem escape (as páginas de erro 404/405
são estáticas). `$_GET` direto só na API de teste, sempre por funções que tipam/limitam.

**Compatibilidade:** `getPost()` agora devolve `null` para corpo acima de 2 MB (antes lia tudo) —
ajuste `MAX_POST_BYTES` se a sua API recebe mais. `Controller` ganhou os métodos estáticos
`validate()` e `responder()` e a propriedade `$postErro`: um controller seu com método de mesmo
nome (`public function validate()`, não estático) passa a dar erro fatal de assinatura — renomeie.
Os campos de texto agora devolvem o valor **aparado e normalizado** e têm `maxlength` padrão
(1000/10000); use `sanitize: false` para o comportamento antigo.

### 13.5 Checklist (injeção)

- [ ] Nenhum `"... WHERE x = '" . $v . "'"` no código (procure por `->query(` e `->exec(` com variável).
- [ ] Toda rota POST/PUT/PATCH usa `ctrl::validate` (ou `Input::validate`) com `maxLength`/`max` em tudo.
- [ ] IDs da URL passam por `Input::id`; redirecionamentos por `Input::safeRedirect`.
- [ ] Ordenação/filtros dinâmicos por allowlist de colunas.
- [ ] Upload só por `Upload::save`, destino em `storage/`, allowlist mínima, sem `svg`/`html`.
- [ ] Saída para HTML sempre escapada; saída de IA tratada como entrada de usuário.
- [ ] Modelo de IA sem ferramentas destrutivas; confirmação humana para ações; nenhum segredo no prompt.
- [ ] Logs registram os sinais (`suspicious` no cliente, `looksLikeInjection` no servidor) sem gravar senhas.
- [ ] `node tools/testes-seguranca.js` passando antes de publicar.
