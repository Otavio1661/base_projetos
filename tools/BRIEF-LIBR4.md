# Briefing libr4 (R4 dev) — leia inteiro antes de codar

Projeto: `C:\Users\Otavio\Documents\proj\base_projetos` (PHP MVC próprio + **libr4**, biblioteca JS sem dependências, estilo ExtJS).
Servidor de dev JÁ está rodando em http://127.0.0.1:8087 (PHP built-in, docroot `public/`). Vitrine: http://127.0.0.1:8087/vitrine
Idioma de TUDO que o usuário vê (textos, docs, mensagens, comentários): **português do Brasil**.

## Arquitetura (já existe, funcionando)
- `public/libr4/core.js` — `R4`, `R4.define(xtype, proto, meta)`, `R4.create(cfg)`, `R4.Component` (`config` herdado, `build()`, `afterRender()`, `render(alvo)`, `destroy()`, `on/fire`, `renderItems`), `R4.module(nome, api, meta)`, `R4.util` (`el`, `esc`, `debounce`, `money`, `number`, `date`, `bytes`, `merge`, `uid`), `R4.get(id)`, `R4.resolve(alvo)`.
- `public/libr4/net.js` — `R4.crypto` (AES-GCM), `R4.http.request/get/post`.
- `public/libr4/components.js` — button, toolbar, panel, textfield, tabpanel, treepanel, grid, window, viewport, div, `R4.msg`.
- `public/libr4/declarative.js` — tags `<r4-xtype>` (atributo kebab → config camel; conteúdo vira `html`; tags filhas aninhadas montam sozinhas), `r4-click`/`r4-confirm`/`r4-anim`/`r4-hover`, `R4.scan`, `R4.actions`, `R4.toast`, avisos de erro de digitação. **Ganchos para módulos:** `R4.declare('xtype', (host, cfg, h) => cfg)` (lê filhos estruturais próprios; `h = {toCfg, itemsFrom, coerce, isTag, camel, defs}`), `R4.structural('r4-option', ...)` (tags-filhas válidas).
- `public/libr4/quick.js` — toda `xtype` vira função `R4.xtype(alvo, dados, extra)`. Módulos registram o atalho em `R4.quickMap.xtype = (a, b) => cfg`.
- `public/libr4/libr4.js` — carregador (já lista os módulos novos: `form, files, ui, chart, theme`, nessa ordem, depois de `quick`).
- `public/libr4/libr4.css` — tema por variáveis `--r4-*` (modo escuro `.r4-dark`). Já importa `parts/form.css, files.css, ui.css, chart.css, theme.css` — **cada agente escreve só no SEU arquivo de parts**.
- `public/showcase/` — a vitrine (`app.js`, `demos.js`, `vitrine.css`, `demos/<modulo>.js`). Ela é gerada a partir do registro: **o que for registrado com `R4.define`/`R4.module` aparece sozinho no menu**, com a tabela de `meta.props`/`meta.events`, painel de propriedades (`meta.playground`) e exemplos de `window.R4Demos[nome]`.
- **vitrineData** (`public/showcase/vitrineData/`): JSON de teste (clientes, produtos, pedidos, usuarios, arvore, vendas-mensais, vendas-categoria, series-diarias, kpis, estados, opcoes, eventos, grande[5000]) + `vitrineData.js` (`VitrineData.url(nome)`, `.load(nome)`, `.rows(n)`, `.api`) + endpoints `/vitrine/api/{clientes,echo,cadastro,lento,falha}`. **Use esses dados nos exemplos e testes** (ex.: `<r4-grid src="/showcase/vitrineData/clientes.json">`). Se faltar um dado, NÃO edite o gerador: monte o dado no próprio demo.

## Como registrar um componente (padrão obrigatório)
```js
R4.define('xtype', {
  extend: 'component',               // ou outro xtype
  config: { prop: 'padrão', ... },   // TODA opção precisa ter padrão aqui (o tipo do padrão define a conversão dos atributos HTML)
  build() { return R4.util.el('div', {...}); },   // devolve o elemento raiz
  afterRender() {}, métodos públicos...
}, {
  title: 'xtype', group: 'Formulários'|'Dados'|'Interface'|'Gráficos'|'Núcleo',
  description: '...',
  props: [{ name, type, default, desc }, ...],    // documentação (aparece na vitrine)
  events: ['change', ...]
});
R4.registry.xtype.meta.playground = { html: '<r4-xtype{attrs}>...</r4-xtype>', cfg: {...}, controls: { prop: valorInicial | [opções] } };
R4.quickMap.xtype = (a, b) => ({ ...config... });   // atalho R4.xtype(alvo, a, b)
R4.declare('xtype', (host, cfg, h) => { ...preenche cfg a partir de filhos <r4-...>; return cfg; });   // só se tiver filhos estruturais
R4.structural('r4-filho');
```
Demos (um arquivo por módulo): `(window.R4Demos = window.R4Demos || {}).xtype = [{ title: '...', html: `<r4-xtype ...>` }, { title: '...', fn(el, out) { ... } }]`.
Cada exemplo `html` é renderizado e **editável ao vivo** na vitrine; `fn(el, out)` recebe o contêiner e uma função `out(valor)` para mostrar resultado. Faça exemplos em HTML E em JS quando fizer sentido, usando dados do vitrineData.

## Regras de qualidade (valem para todos)
1. **Segurança:** nunca `innerHTML` com dado do usuário sem `R4.util.esc`; nada de `eval`/`new Function` na lib; sem `javascript:` URLs; valide/normalize entradas; arquivos lidos do usuário são tratados como não confiáveis (limite de tamanho, escape de fórmulas CSV `= + - @` ao EXPORTAR); sem dependências externas/CDN; respeite CSP razoável (sem inline handlers `onclick="..."` em HTML gerado).
2. **Acessibilidade:** `role`/`aria-*` corretos, foco visível, teclado (Enter/Espaço/Setas/Esc) onde fizer sentido, `label` ligado a campo.
3. **Desempenho:** sem reflow em loop, `DocumentFragment`, evite re-render total quando der, nada de timers soltos sem limpar no `destroy()`.
4. **Estilo:** use variáveis `--r4-*` (nunca cores fixas, para funcionar no tema escuro), prefixo de classe `r4-`; responsivo (celular ≥ 360px).
5. **API consistente** com os componentes existentes (nomes de config em camelCase, eventos via `fire`, `destroy()` limpa tudo, métodos encadeáveis quando natural).
6. **Compatibilidade:** não quebre nada existente. Arquivos que NÃO são seus: só leia. Se achar bug em arquivo de outro dono, **não edite**: descreva no relatório final.
7. Sem backslashes problemáticos em comandos bash (heredoc/`node -e` com `\n` ou regex com `\d` já corromperam arquivos aqui): **escreva/edite arquivos com as ferramentas Write/Edit**, não com `echo`/heredoc/`sed` contendo `\`.
8. **NÃO faça git commit/push/add** (o dono do projeto faz). Não apague nem renomeie arquivos que não sejam seus. Não mexa em `src/`, `core/`, `composer*`, `docker*` (PHP) a menos que sua tarefa diga.

## Como testar (obrigatório antes de finalizar)
- `node --check arquivo.js` em todo JS que tocar.
- Teste real no jsdom com o ajudante: `const { open } = require('C:/Users/Otavio/AppData/Local/Temp/claude/fd66087851d3f5b9/0adb2e19-67f2-4875-a93c-3ba9e456c43a/scratchpad/jsdom-helper.js');` → `const { w, d, logs, close } = await open('/vitrine#SEU_XTYPE', 1500);`. Escreva seus scripts de teste em `C:/Users/Otavio/AppData/Local/Temp/claude/fd66087851d3f5b9/0adb2e19-67f2-4875-a93c-3ba9e456c43a/scratchpad/<seu_nome>/` (NÃO no projeto). Confira: componente monta, interações (click/input/change/keydown) funcionam, **nenhum `logs.error`/`logs.jsdom`**, todos os exemplos da vitrine rodam (`.vt-status.err` = 0), tags HTML e função rápida `R4.xtype(...)` funcionam, `destroy()` não deixa lixo.
- O Chrome real NÃO está disponível (extensão desconectada): não tente.
- Rode também o teste de regressão da vitrine (abre `#grid`, `#button`, `#quick` e confere 0 erros) para garantir que nada existente quebrou.

## Entrega
Responda com um relatório curto (até ~25 linhas): o que criou (arquivos), API pública resumida, o que testou e o resultado, limitações conhecidas, bugs que viu em arquivos de outros donos.
