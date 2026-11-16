# Segurança — libr4, vitrine e API de teste

Este documento descreve o modelo de ameaça da libr4 (R4 dev), o que a biblioteca garante, o que
continua sendo responsabilidade de quem a usa, a verdade sobre a criptografia no cliente, o
checklist de produção e a auditoria feita (achados, correções e testes).

Testes automatizados: `node tools/testes-seguranca.js` (veja a seção 12).
Injeção de SQL, de arquivos e de prompt (servidor + cliente): seção 13.

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
| Rede | `R4.http`, grid (`src`), form (`action`), select/stat/stats/timeline/chart (`src`): só `http(s)`/relativa; outra origem gera aviso (ou bloqueio com `R4.config.strictOrigins = true`); `credentials: 'same-origin'`. |
| Dados de servidor como HTML | `<r4-timeline src>` ignora o campo `html` dos eventos vindos do servidor. |
| Tema | Cor, raio, densidade, modo e fonte passam por allowlist antes de virar CSS; valor adulterado no `localStorage` é descartado. Presets só os próprios (nada de `__proto__`). Cores de gráfico só por allowlist (`#hex`, nome, `var(--x)`, `rgb/hsl/...()` numéricos). |
| i18n | `<r4-t>`/`r4-i18n` usam `textContent`; `r4-i18n` só escreve `placeholder`, `title`, `aria-label`, `alt`, `label`, `aria-description` (nunca `on*`, `href`, `src`, `style`). |
| Ícones | `R4.icon(nome)` monta o SVG com `createElementNS` a partir de um **mapa fixo** nome → path (allowlist); o nome nunca vira markup (desconhecido → círculo neutro + aviso). `size` só aceita número/`em`/`rem`/`px`, `cls` só nomes de classe simples, `title` vai por `textContent`. `R4.icon.add` só aceita path com `[MmLlHhVvCcSsQqTtAaZz0-9 .,-]` (máx. 2000) e nome `[a-z][a-z0-9-]*`. A opção `icon` dos componentes (`R4.util.icon`) vira SVG só se o valor for um nome do mapa; qualquer outro valor (inclusive HTML) é texto. |
| i18n dos componentes | Os textos fixos da lib vêm de `R4.t` e são gravados com `textContent`/atributos de texto; params (nome de coluna, mensagem do servidor, nome de arquivo) são dados, nunca markup. `R4.util.tx` grava `r4-i18n` (+ `params` em JSON) só nos atributos permitidos pelo i18n. |
| Arquivos | Exportação CSV/XLSX neutraliza fórmulas (`= + - @ TAB CR` → prefixo `'`; XLSX grava texto como string compartilhada, nunca `<f>`). Leitura: limites de tamanho, XLSX com `DOCTYPE` recusado, limite descompactado ("zip bomb"), de entradas, de linhas e de células, CRC conferido. Nome de download sem caminho, controle ou caracteres bidi (U+202E). |
| Formulários | `pattern` limitado a 512 caracteres; padrão com quantificador aninhado (`(a+)+`, `(\w*x)*`, `(a+){2,}`) é ignorado com aviso (ReDoS); valor com mais de 5.000 caracteres nem chega à regex. |
| Criptografia | AES-GCM 256, PBKDF2-SHA-256 100 mil iterações, salt (16 B) e IV (12 B) novos a cada mensagem, tag conferida (pacote adulterado → `null`). **Chave vazia fora de localhost → erro** (não cifra com chave pública "vazia"). |

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

## 5. A verdade sobre a criptografia (`R4.crypto` / `BASE_CRIPTOGRAFIA`)

- O `public/index.php` injeta `window.BASE_CRIPTOGRAFIA = "..."` em **toda** página HTML.
  **A chave está no navegador de todo visitante.** Qualquer pessoa (ou script de XSS) que abre a
  página consegue cifrar e decifrar exatamente como o front-end.
- Portanto o AES-GCM aqui **protege contra captura passiva** (logs de proxy, ferramentas que gravam
  corpo de requisição, olhares casuais no DevTools de terceiros) e **ofusca** o corpo — **não é
  segredo contra o usuário nem contra um atacante que abre a página**, não autentica ninguém e
  **não substitui HTTPS** (sem TLS, quem intercepta o tráfego também recebe a página com a chave).
- Parâmetros (corretos para o que se propõe): AES-256-GCM, PBKDF2-SHA-256 com 100 mil iterações,
  salt de 16 bytes e IV de 12 bytes aleatórios por mensagem (`crypto.getRandomValues`), sem
  reaproveitamento de IV (cada mensagem também deriva uma chave nova por causa do salt).
- Chave vazia: em `localhost`/`127.*` só gera aviso; **em qualquer outro host a lib se recusa a
  cifrar/decifrar** e `R4.http.post` falha antes de enviar (falha segura).
- Custo: o servidor roda PBKDF2 (100 mil iterações) por requisição cifrada — isso amplifica DoS;
  limite a taxa de requisições no proxy.
- O que realmente protege dados: HTTPS + autenticação/autorização no servidor + validação.

---

## 6. Vitrine e API de teste

- `/vitrine` (e `/`, que hoje abre a vitrine) e `/vitrine/api/*` **só respondem com
  `APP_DEBUG=true`**; em produção devolvem 404. Quando a aplicação real existir, aponte `/` para
  ela em `src/routes.php`.
- O playground executa com `eval` **apenas** o código que o próprio usuário digitou/clicou no editor
  (o texto inicial é o código-fonte das demos). Nada vem da URL, do `#hash` ou do `localStorage`:
  o `#hash` só seleciona um item já registrado (comparação exata com `R4.registry`/`R4.modules`).
- `vitrine.php` só carrega arquivos locais (`/libr4`, `/showcase`); o único script inline aplica o
  tema salvo (lê o `localStorage`, só liga/desliga uma classe).
- A API de teste: `nosniff`, `Cache-Control: no-store`, CSP `default-src 'none'`, corpo ≤ 1 MB
  (413), pacote `{x,y,z}` conferido antes de descriptografar (400), parâmetros GET só como texto e
  com limites, ordenação só por campo existente, JSON com `JSON_HEX_*` (o eco não reflete `<`/`>`).

---

## 7. Cabeçalhos HTTP e CSP (`docker/nginx/default.conf`)

Aplicado no nginx:

- `Content-Security-Policy` por rota (via `map $request_uri`):
  - padrão: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
    img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'self' blob:;
    worker-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; base-uri 'self';
    form-action 'self'; frame-ancestors 'self'`;
  - `/vitrine...`: igual + `'unsafe-eval'` (playground). **Só nessa rota.**
- `Permissions-Policy` (câmera, microfone, geolocalização, pagamento, USB, sensores desligados),
  `Cross-Origin-Opener-Policy: same-origin`, `X-Frame-Options`, `Referrer-Policy`, `nosniff`
  (agora repetidos também no bloco de estáticos, que antes os perdia); `X-Powered-By` escondido.
- `Strict-Transport-Security` está comentado: ligue quando o site estiver atrás de HTTPS.

**Para CSP estrita** (sem `'unsafe-inline'` em `script-src`): o `public/index.php` precisa deixar de
injetar script inline sem nonce. Opções: (a) gerar um nonce por requisição no PHP e mandar a CSP
pelo PHP; (b) usar o hash do script da chave (comando no comentário do `default.conf`); (c) trocar a
injeção por `<meta name="r4-crypto-key" content="...">` lida pela lib. A libr4 em si não precisa de
script inline nem de `eval`. `style-src 'unsafe-inline'` continua necessário (a lib cria `<style>`
de tema e usa `style="..."` nos gráficos).

---

## 8. Checklist de produção

- [ ] `APP_DEBUG=false` no `.env` (vitrine e API de teste viram 404; erros PHP não aparecem).
- [ ] `BASE_CRIPTOGRAFIA` com chave real, longa e aleatória no `.env` (ex.: `openssl rand -base64 32`);
      lembre que ela é pública para quem abre a página (seção 5).
- [ ] HTTPS em tudo + `Strict-Transport-Security` (descomente no nginx).
- [ ] CSP do nginx ativa; idealmente estrita (seção 7).
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
4. `R4.crypto` recusa chave vazia fora de localhost; `decrypt` exige `{x,y,z}` em texto e IV de 12 bytes.
5. `R4.util.el`/`domAttrs` ignoram `on*` em texto e URLs perigosas; `merge` não altera objetos herdados.
6. `pattern` com quantificador aninhado é ignorado (aviso); valor > 5.000 caracteres falha no `pattern`.
7. `/vitrine` e `/` (vitrine) → 404 com `APP_DEBUG=false`.
8. Novos: `R4.icon`, `<r4-icon>`, `R4.util.icon`, `R4.util.T`, `R4.util.tx`, `R4.suggest`; `emptyText`/`loadingText`/`errorText`/`summaryLabel`/`placeholder` (grid, select, treepanel, chart, filedrop, form) têm padrão `''` = texto no idioma atual. Cobertos por 5 casos novos em `tools/testes-seguranca.js` (ícones e i18n).

---

## 11. Não corrigido (fora dos arquivos desta tarefa) — recomendações

- **`src/Utils/Decryption.php`**: ~~capturar `\Throwable`, `is_string` em `x/y/z`, IV de 12 bytes,
  tag de 16~~ (já feito); `base64_decode(..., true)` e profundidade do JSON limitada **feitos na seção 13**.
  `getDecryptedPost()` ficou só por compatibilidade: `Controller::getPost()` não usa mais (lê o corpo
  com limite de 2 MB e profundidade 32).
- **`public/index.php`**: injetar a chave com `json_encode($chave, JSON_HEX_TAG|JSON_HEX_AMP|JSON_HEX_APOS|JSON_HEX_QUOT)`
  (aspas ou `</script>` na chave quebrariam/injetariam script); usar nonce de CSP; injetar só nas
  páginas que usam `R4.crypto`; `session_set_cookie_params(['httponly' => true, 'secure' => true, 'samesite' => 'Lax'])`
  antes de `session_start()`; `expose_php=Off`.
- ~~**`core/Controller.php`**: a página de "view não encontrada" mostra caminhos do servidor~~ —
  corrigido na seção 13 (com `APP_DEBUG=false` só "Erro interno"; detalhe no log).
- **CSP estrita**: depende do item do `index.php` (seção 7).
- **ReDoS por alternância sobreposta** (`(a|aa)+$`) não é detectado — limitação documentada.
- **HTML confiável por design** (seção 3) continua sendo HTML: a lib documenta, não escapa.
- **Redirecionamento aberto**: `goto:https://outro-site` é permitido (é navegação legítima);
  valide destinos vindos de dados.
- **Custo do PBKDF2 no servidor** por requisição cifrada: limite de taxa no proxy.
- A configuração do nginx não pôde ser validada com `nginx -t` neste ambiente (sem nginx/docker).

---

## 12. Como rodar os testes

```bash
# servidor de desenvolvimento (APP_DEBUG=true)
php -S 127.0.0.1:8087 -t public
# jsdom: npm i -D jsdom   (ou aponte para uma instalação existente)
JSDOM_PATH=/caminho/node_modules/jsdom node tools/testes-seguranca.js
```

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
| 23 | M | `core/Generator/*`, `core/Migration/Migration.php` | Nome vindo da linha de comando ia direto para o código gerado e para o caminho: `composer controller "../../public/x"` grava fora de `src/`; `x';system('id');//` injeta código no arquivo gerado; `excluir mvc ../../core/Controller` apagaria arquivos do núcleo. | Nome só `[A-Za-z][A-Za-z0-9_]{0,63}`, rota só `/[A-Za-z0-9_-/]*`; `fopen(..., 'x')`; pastas 0755. Testado (nada criado, saída 1). |
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
