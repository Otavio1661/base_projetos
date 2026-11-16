# Compatibilidade de navegadores e CSP estrita (libr4)

Resumo: a libr4 mira as **duas últimas versões** de Chrome, Edge, Firefox e Safari (desktop e celular:
Chrome/Android, Safari/iOS). Só a criptografia (`R4.crypto` e a `R4.http` cifrada) é **obrigatoriamente**
dependente de recursos modernos; todo o resto tem alternativa. `R4.support` detecta o que existe e **nunca lança**.

## 1. O que foi realmente verificado (leia antes de confiar na matriz)

| Ambiente | Situação |
|---|---|
| jsdom (Node) pela suíte automática (`tools/rodar-testes.js`) | **Verificado.** Não tem layout, `IntersectionObserver` nem `ResizeObserver`: ele próprio exercita os caminhos de degradação. |
| Chrome (desktop) | **Verificado em parte**, de forma manual, em rodadas anteriores. Não há Chrome automatizado nesta máquina. |
| Firefox, Safari (desktop e iOS), Edge, Chrome Android, Samsung Internet | **NÃO testados por nós.** As versões da matriz abaixo vêm da documentação pública de compatibilidade (MDN / caniuse), de memória, e devem ser conferidas. Use o checklist da seção 6 antes de declarar suporte. |

## 2. Requisitos de contexto: HTTPS ou localhost

`crypto.subtle` (base de toda a criptografia v2) só existe em **contexto seguro**: HTTPS, `http://localhost`,
`http://127.0.0.1`, `http://[::1]` e `*.localhost`. Fora disso o navegador simplesmente **não define**
`crypto.subtle` e `R4.crypto` falha com uma mensagem clara em português.

Pegadinha comum: abrir o servidor de desenvolvimento pelo **IP da rede** (`http://192.168.x.y:8087`, por exemplo, do
celular). A lib aceita HTTP em rede privada sem reclamar (`R4.http.check`), mas o navegador **não libera
`crypto.subtle` ali**: os exemplos cifrados falham. Soluções: HTTPS (certificado local com mkcert, ou o proxy do
`docs/PRODUCAO.md`), túnel para `localhost` (`adb reverse tcp:8087 tcp:8087` no Android; `ssh -L`), ou, só em
desenvolvimento no Chrome, a flag `chrome://flags/#unsafely-treat-insecure-origin-as-secure`.

`navigator.clipboard` (botões "Copiar" da vitrine) também exige contexto seguro; sem ele aparece o aviso "não foi possível copiar".

## 3. Matriz de suporte

Versões mínimas em que o recurso existe (referência pública, **não verificada por nós** fora do Chrome/jsdom):

| Recurso | Obrigatório? | Chrome / Edge | Firefox | Safari (macOS / iOS) | Sem ele |
|---|---|---|---|---|---|
| `crypto.subtle` (WebCrypto) em contexto seguro | **Sim** | 60 | 52 | 11 | `R4.crypto` e a `R4.http` cifrada recusam, com mensagem clara; **nada é enviado em claro por engano** |
| ECDH P-256, HKDF-SHA256, AES-256-GCM | **Sim** | 60 | 52 | 11 | idem (`R4.support.probe()` confirma com operação real) |
| `TextEncoder` / `TextDecoder` | **Sim** | 38 | 19 | 10.1 | idem (a lib nem falha ao carregar) |
| `fetch` | **Sim** | 42 | 39 | 10.1 | `R4.http`, grid remoto, formulário com `url`, envio de arquivos não falam com o servidor |
| `IntersectionObserver` | não | 58 | 55 | 12.1 | `r4-anim` anima direto, sem esperar entrar na tela |
| `ResizeObserver` | não | 64 | 69 | 13.1 | gráficos ajustam só no `resize` da janela; grid virtual só repinta ao rolar / `refresh()` |
| CSS `color-mix()` | não | 111 | 113 | 16.2 | bloco `@supports not (color: color-mix(...))` em `libr4.css` usa cores sólidas aproximadas (sem translucidez) |
| `structuredClone` | não | 98 | 94 | 15.4 | `core.js` copia a config padrão com cópia recursiva própria (objetos simples e arrays) |
| `DecompressionStream('deflate-raw')` | não | 103 | 113 | 16.4 | só a **leitura** de XLSX compactado falha (aviso claro); CSV, JSON e gerar XLSX seguem |
| `requestIdleCallback` | não | 47 | 55 | **não existe** | `R4.store` usa `setTimeout(50)` no lugar |
| `localStorage` | não | todos | todos | todos (modo privado antigo lança) | `R4.store` guarda em memória (tema/idioma/abas não persistem) |
| `matchMedia` | não | todos | todos | todos | tema "auto" assume claro; "reduzir movimento" ignorado |
| `AbortController` | não | 66 | 57 | 12.1 | a lib não usa hoje |
| `adoptedStyleSheets` | não | 73 | 101 | 16.4 | a lib não usa hoje (ver seção 5) |

Piso de sintaxe JavaScript/CSS que o código usa hoje (`??`, `?.`, `||=`, `replaceChildren`, `inset`): **Chrome/Edge 87, Firefox 79,
Safari 14.1** (estimado a partir do que o código usa; o alvo declarado, "últimas 2 versões", é bem acima disso).
Navegadores antigos (IE, Edge legado) **não são suportados**.

Pacote minificado: `libr4/dist` é gerado de `libr4.js` (a lista de módulos é lida de lá). Depois de mexer em módulos
rode `php tools/build.php`.

## 4. Como a lib degrada (o que fazer ao faltar cada coisa)

- **Detecção:** `R4.support.report()` → `{ ok, faltando[], opcionais[], detalhes[], contexto }`; `R4.support.has('IntersectionObserver')`;
  `await R4.support.probe()` testa de verdade ECDH/HKDF/AES-GCM. Nunca lançam. Na vitrine, a página Início mostra um alerta se faltar
  algo obrigatório (e uma nota se só faltarem opcionais).
- **Aviso único:** ao carregar, se faltar algo **obrigatório** a lib escreve **um** `console.warn` (`R4.config.avisoSuporte = false` silencia).
- **Criptografia:** sem `crypto.subtle`, `R4.crypto.encrypt` rejeita com `R4.crypto: criptografia indisponível: <motivo em português>`
  (distingue "contexto não seguro: use HTTPS ou localhost" de "navegador sem WebCrypto"). `decrypt` devolve `null` (com `console.error`).
  O resto da lib (componentes, grid, formulários, `R4.http` com `encrypt: false`) continua.
- **Chave pública do servidor** (ordem): `R4.config.serverKey` → `window.R4_SERVER_KEY` → `<meta name="r4-server-key">` → `GET /r4/chave`.
  A primeira fonte presente vale; se estiver **malformada a lib recusa** (não troca silenciosamente pela próxima: isso mascararia adulteração).
- **Estilo:** sem `color-mix()`, o fim de `libr4.css` redefine as misturas com cores sólidas (`@supports not`).

## 5. CSP estrita

Objetivo: `script-src 'self'` **sem** `'unsafe-inline'` e **sem** `'unsafe-eval'` (a rota `/vitrine` mantém `unsafe-eval` só por causa do
playground, que roda os exemplos em JS com `eval` indireto).

Feito:
- Nenhum `<script>` inline nas respostas de `/vitrine`, `/vitrine/testes` e `/` (varredura estática na suíte `support`):
  a flag da vitrine vai em `<meta name="r4-vitrine">`; o anti-flash do tema é o arquivo externo e síncrono `public/showcase/boot.js`;
  a chave pública vai em `<meta name="r4-server-key">` (o `window.R4_SERVER_KEY` continua aceito).
- A lib não usa `eval`, `new Function`, `javascript:`, atributos `on*=` em HTML gerado, `setAttribute('on…')` nem `<script>` criado por código.
  `core.js` (`safeAttr`/`util.el`) recusa `on*` em texto. O carregador `libr4.js` usa `document.write` de `<script src>` externo da própria
  origem (permitido por `script-src 'self'`; `?min=1` / `dist` evita até isso).
- Testado no jsdom com carregador que bloqueia script de outra origem, vigia `<script>` dinâmico/inline e (modo estrito) bloqueia `eval`:
  a vitrine carrega a lib, abre itens do menu e faz a criptografia ponta a ponta com `/vitrine/api/echo` sem nenhum script inline.
  **Limite:** o jsdom não aplica CSP de verdade; num navegador real confira o console (nenhuma violação) e o cabeçalho pelo `curl -I`.

**`style-src 'unsafe-inline'` continua necessário.** Onde a lib cria estilo inline:
- `theme.js` cria `<style id="r4-theme">`; `declarative.js` cria `<style id="r4-tags">` (`display:contents` das tags `<r4-*>`);
- `chart.js` usa `setAttribute('style', ...)` em 3 pontos (cores de série/legenda); `components.js` imprime o grid num `iframe srcdoc`
  com `<style>` e `style=` (o `srcdoc` herda a CSP da página);
- a vitrine e vários exemplos usam `style="..."` em HTML gerado.
(Atribuir `el.style.x = ...` / `style.cssText` pelo DOM **não** é bloqueado pela CSP; só `<style>` e o atributo `style=` são.)

`CSSStyleSheet` + `adoptedStyleSheets` **não foi implementado**: avaliado e descartado por ora. (1) Só dá ganho de CSP se **todos** os pontos acima
migrarem; trocar apenas o `theme.js` não remove a necessidade de `'unsafe-inline'` (o `declarative.js`, o `chart.js` e os `style=` da vitrine
continuam). (2) `<style id="r4-theme">` é contrato público: as suítes, a documentação e quem estiver usando leem o texto dele; mudar exigiria
fallback e ajuste de tudo isso. (3) Ganho de desempenho **não medido**: não há navegador real aqui (jsdom não tem `CSSStyleSheet`), e para ~4 KB
de CSS por troca de tema o esperado é desprezível. Se um dia a CSP estrita de estilo for requisito: migrar `theme.js` e `declarative.js` para
`adoptedStyleSheets` (com `<style>` de reserva em navegadores sem suporte), trocar os `setAttribute('style')` do `chart.js` por `el.style`, e
refazer o `srcdoc` de impressão.

## 6. Checklist manual de teste entre navegadores

Faça em cada navegador-alvo (Chrome, Edge, Firefox, Safari no macOS; Safari/iOS e Chrome/Android no celular), com o servidor em HTTPS
ou `localhost` (seção 2):

1. Abra `/vitrine/testes`, clique **Executar tudo** (ou `?auto=1`) e espere terminar. Esperado: **0 falhas**. Testes marcados "pulado: sem layout"
   não devem aparecer (só o jsdom pula). Anote versão do navegador e o resumo.
2. Na suíte **support**: confira os testes de `report()`, aviso único, chave por meta/global/endpoint e `boot.js` (todos passam).
3. No console da página: `R4.support.report()` — `ok: true`; leia `opcionais` e compare com a matriz da seção 3. Rode `await R4.support.probe()`
   (`verificado: true`).
4. Abra `/vitrine`: nenhum erro/violação de CSP no console; a página Início **não** mostra alerta de navegador sem recursos.
5. `/vitrine#crypto`: execute os 3 exemplos (ida e volta com o servidor, pacote, AAD recusado).
6. Tema: escolha Escuro, recarregue: a página já nasce escura (sem clarão branco). Alterne Auto e mude o tema do sistema.
7. `/vitrine#grid` com 5 000 linhas (rolagem virtual suave, redimensionar a janela), `#chart` (redimensionar; exportar SVG e PNG),
   `#files` (exportar CSV/XLSX e **importar** XLSX: exige `DecompressionStream`), imprimir o grid.
8. Abas da vitrine: arraste para reordenar (mouse e **toque**), recarregue e confira que restauram (localStorage).
9. Celular: rotacione, confira rolagem, toque nos botões, teclado virtual sobre os campos de `#form`.
10. Modo privado/anônimo (Safari e Firefox): a vitrine abre e nada quebra (tema, idioma e abas ficam só em memória: `R4.support.has('localStorage')`).
11. Registre o que falhar com: navegador + versão + SO, resultado de `R4.support.report()` e o texto do console.
