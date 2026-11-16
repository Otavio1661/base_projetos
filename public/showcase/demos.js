/**
 * Demos da vitrine. Chave = xtype ou nome do módulo (R4.modules).
 * Cada exemplo: { title, fn(el) }. O código exibido na vitrine é o próprio
 * texto da função (fn.toString()), então o exemplo nunca fica desatualizado.
 * `el` é o contêiner onde o exemplo deve renderizar; `out(valor)` mostra resultado.
 */
window.R4Demos = {
  button: [
    { title: 'Variantes', fn(el) {
      ['default', 'primary', 'danger'].forEach(v =>
        R4.create({ xtype: 'button', text: v, variant: v, icon: '●', renderTo: el, style: { marginRight: '8px' },
          handler: b => R4.msg.alert('Clique', 'Botão "' + b.text + '" acionado.') }));
    } }
  ],
  toolbar: [
    { title: 'Com espaçador', fn(el) {
      R4.create({ xtype: 'toolbar', renderTo: el, items: [
        { text: 'Novo', variant: 'primary' }, { text: 'Editar' }, '-', { text: 'Excluir', variant: 'danger' }, '->',
        { xtype: 'textfield', placeholder: 'Buscar...' }
      ] });
    } }
  ],
  panel: [
    { title: 'Panel recolhível com toolbar', fn(el) {
      R4.create({ xtype: 'panel', title: 'Meu painel', collapsible: true, renderTo: el,
        tbar: [{ text: 'Ação' }, '->', { text: 'Ajuda' }],
        html: '<p>Conteúdo do painel. Clique no título para recolher.</p>' });
    } },
    { title: 'Painéis aninhados', fn(el) {
      R4.create({ xtype: 'panel', title: 'Pai', renderTo: el, items: [
        { title: 'Filho 1', html: 'Primeiro' },
        { title: 'Filho 2', html: 'Segundo', style: { marginTop: '10px' } }
      ] });
    } }
  ],
  textfield: [
    { title: 'Evento change', fn(el, out) {
      R4.create({ xtype: 'textfield', label: 'Nome', placeholder: 'Digite...', renderTo: el,
        listeners: { change: (f, v) => out({ digitado: v }) } });
    } }
  ],
  tabpanel: [
    { title: 'Abas com fechar', fn(el) {
      const tp = R4.create({ xtype: 'tabpanel', renderTo: el, style: { height: '200px', border: '1px solid var(--r4-line)' }, items: [
        { title: 'Primeira', html: 'Conteúdo 1' }, { title: 'Segunda', html: 'Conteúdo 2' }
      ] });
      let n = 3;
      R4.create({ xtype: 'button', text: 'Adicionar aba', renderTo: el, style: { marginTop: '8px' },
        handler: () => tp.add({ title: 'Aba ' + n, html: 'Criada dinamicamente #' + n++, closable: true }) });
    } }
  ],
  treepanel: [
    { title: 'Árvore com seleção', fn(el, out) {
      R4.create({ xtype: 'treepanel', renderTo: el, style: { height: '240px', border: '1px solid var(--r4-line)' },
        nodes: [
          { text: 'Frutas', children: [{ id: 'm', text: 'Maçã' }, { id: 'b', text: 'Banana' }] },
          { text: 'Legumes', children: [{ id: 'c', text: 'Cenoura' }] }
        ],
        listeners: { select: (t, n) => out({ selecionado: n.text }) } });
    } }
  ],
  grid: [
    { title: 'Ordenar, filtrar e paginar', fn(el, out) {
      const data = Array.from({ length: 47 }, (_, i) => ({
        id: i + 1, nome: 'Produto ' + (i + 1), preco: +(Math.random() * 500).toFixed(2), estoque: Math.floor(Math.random() * 100) }));
      R4.create({ xtype: 'grid', renderTo: el, pageSize: 8, data,
        columns: [
          { header: '#', dataIndex: 'id', width: 60 },
          { header: 'Nome', dataIndex: 'nome' },
          { header: 'Preço', dataIndex: 'preco', align: 'right', renderer: v => R4.util.money(v) },
          { header: 'Estoque', dataIndex: 'estoque', align: 'right',
            // string vira texto; para HTML use R4.html (cada ${} é escapado)
            renderer: v => v < 20 ? R4.html`<b style="color:var(--r4-err)">${v}</b>` : v }
        ],
        listeners: { rowclick: (g, r) => out(r) } });
    } }
  ],
  window: [
    { title: 'Janela com botões', fn(el) {
      R4.create({ xtype: 'button', text: 'Abrir janela', variant: 'primary', renderTo: el, handler: () => {
        R4.create({ xtype: 'window', title: 'Exemplo', html: '<p>Fecha com Esc, clique fora ou ×.</p>',
          buttons: [{ text: 'Cancelar' }, { text: 'Salvar', variant: 'primary' }] }).show();
      } });
    } }
  ],
  viewport: [
    { title: 'Estrutura da própria vitrine', fn(el, out) {
      // Um viewport ocupa a tela toda, então aqui só mostramos a configuração usada:
      out({ xtype: 'viewport', items: [
        { region: 'north', title: 'Cabeçalho' }, { region: 'west', xtype: 'treepanel' }, { region: 'center', xtype: 'tabpanel' }] });
    } }
  ],
  crypto: [
    { title: 'Ida e volta', async fn(el, out) {
      const pacote = await R4.crypto.encrypt({ usuario: 'otavio', senha: '123456' });
      out({ pacote, original: await R4.crypto.decrypt(pacote) });
    } }
  ],
  http: [
    { title: 'Corpo criptografado (fetch simulado)', async fn(el, out) {
      const real = window.fetch; let enviado;
      window.fetch = async (url, o) => { enviado = { url, method: o.method, body: JSON.parse(o.body) }; return { ok: true, text: async () => JSON.stringify({ ok: true }) }; };
      try {
        const resposta = await R4.http.post('/api/exemplo', { nome: 'R4' });
        out({ enviado, resposta, corpoDescriptografado: await R4.crypto.decrypt(enviado.body) });
      } finally { window.fetch = real; }
    } }
  ],
  msg: [
    { title: 'alert e confirm', fn(el) {
      R4.create({ xtype: 'button', text: 'alert', renderTo: el, style: { marginRight: '8px' }, handler: () => R4.msg.alert('Aviso', 'Olá da libr4!') });
      R4.create({ xtype: 'button', text: 'confirm', renderTo: el,
        handler: () => R4.msg.confirm('Confirmar', 'Deseja continuar?', ok => R4.msg.alert('Resposta', ok ? 'Sim' : 'Cancelou')) });
    } }
  ],
  util: [
    { title: 'Formatação pt-BR', fn(el, out) {
      out({ bytes: R4.util.bytes(5242880), number: R4.util.number(1234567.891), money: R4.util.money(1999.9), date: R4.util.date('2026-11-09T12:00:00') });
    } }
  ]
};

/* ===== Exemplos em HTML puro (camada declarativa) ===== */
const _h = (k, item) => (R4Demos[k] ||= []).push(item);

_h('button', { title: 'HTML: botão com ação', html: `
<r4-button variant="primary" icon="★" r4-click="toast:Salvo com sucesso">Salvar</r4-button>
<r4-button variant="danger" r4-click="alert:Item excluído" r4-confirm="Excluir este item?">Excluir</r4-button>` });

_h('panel', { title: 'HTML: panel com toolbar', html: `
<r4-panel title="Meu painel" collapsible>
  <r4-tbar><r4-button r4-click="toast:Ação!">Ação</r4-button><r4-fill></r4-fill><r4-button>Ajuda</r4-button></r4-tbar>
  <p>Qualquer HTML aqui dentro. Tags r4-* aninhadas também funcionam.</p>
  <r4-button variant="primary">Botão dentro do painel</r4-button>
</r4-panel>` });

_h('toolbar', { title: 'HTML: toolbar', html: `
<r4-toolbar>
  <r4-button variant="primary">Novo</r4-button><r4-button>Editar</r4-button><r4-sep></r4-sep>
  <r4-button variant="danger">Excluir</r4-button><r4-fill></r4-fill>
  <r4-textfield placeholder="Buscar..."></r4-textfield>
</r4-toolbar>` });

_h('textfield', { title: 'HTML: campo', html: `<r4-textfield label="E-mail" name="email" placeholder="voce@exemplo.com" input-type="email"></r4-textfield>` });

_h('tabpanel', { title: 'HTML: abas', html: `
<r4-tabpanel style="height:180px;border:1px solid var(--r4-line)">
  <r4-tab title="Resumo"><p>Conteúdo do resumo.</p></r4-tab>
  <r4-tab title="Detalhes" closable><p>Aba que pode ser fechada.</p></r4-tab>
</r4-tabpanel>` });

_h('treepanel', { title: 'HTML: árvore', html: `
<r4-treepanel style="height:200px;border:1px solid var(--r4-line)">
  <r4-node text="Frutas"><r4-node id="h-maca" text="Maçã"></r4-node><r4-node id="h-banana" text="Banana" badge="novo"></r4-node></r4-node>
  <r4-node text="Legumes"><r4-node id="h-cenoura" text="Cenoura"></r4-node></r4-node>
</r4-treepanel>` });

_h('grid', { title: 'HTML: grid com dados inline', html: `
<r4-grid page-size="4" data='[
  {"nome":"Notebook","preco":4200.5,"criado":"2026-01-10"},
  {"nome":"Mouse","preco":89.9,"criado":"2026-02-03"},
  {"nome":"Teclado","preco":199,"criado":"2026-03-15"},
  {"nome":"Monitor","preco":1350,"criado":"2026-04-21"},
  {"nome":"Webcam","preco":259.9,"criado":"2026-05-02"}]'>
  <r4-col field="nome" header="Produto"></r4-col>
  <r4-col field="preco" header="Preço" format="money" align="right"></r4-col>
  <r4-col field="criado" header="Criado em" format="date"></r4-col>
</r4-grid>` });

_h('window', { title: 'HTML: janela aberta por r4-click', html: `
<r4-button variant="primary" r4-click="modal:#demo-win">Abrir janela</r4-button>
<r4-window id="demo-win" title="Novo cliente" width="380">
  <r4-textfield label="Nome" name="nome"></r4-textfield>
  <r4-button r4-click="toast:Cancelado">Cancelar</r4-button>
  <r4-button variant="primary" r4-click="toast:Cliente salvo">Salvar</r4-button>
</r4-window>` });

_h('tags', { title: 'Tela completa só com HTML', html: `
<r4-panel title="Clientes" collapsible>
  <r4-tbar>
    <r4-button variant="primary" r4-click="modal:#demo-novo">Novo</r4-button>
    <r4-button r4-click="toast:Atualizado">Atualizar</r4-button>
  </r4-tbar>
  <r4-grid filter data='[{"nome":"Ana","valor":1200},{"nome":"Bruno","valor":830.5},{"nome":"Carla","valor":2210}]'>
    <r4-col field="nome" header="Nome"></r4-col>
    <r4-col field="valor" header="Valor" format="money" align="right"></r4-col>
  </r4-grid>
</r4-panel>
<r4-window id="demo-novo" title="Novo cliente" width="360">
  <r4-textfield label="Nome" name="nome"></r4-textfield>
  <r4-button variant="primary" r4-click="toast:Salvo">Salvar</r4-button>
</r4-window>` });

_h('actions', { title: 'Ações e confirmação', html: `
<div class="r4-flex r4-wrap r4-gap-2">
  <button class="r4-btn" r4-click="toast:Olá!">toast</button>
  <button class="r4-btn" r4-click="alert:Mensagem de aviso">alert</button>
  <button class="r4-btn" r4-click="copy:texto copiado">copy</button>
  <button class="r4-btn" r4-click="anim:shake">shake</button>
  <button class="r4-btn r4-btn-danger" r4-click="toast:Apagado" r4-confirm="Tem certeza?">com confirmação</button>
  <button class="r4-btn" r4-click="toast:um;anim:bounce">duas ações</button>
</div>` });

_h('anim', { title: 'Entrada animada com delay', html: `
<r4-div cols="3">
  <div class="r4-card" r4-anim="fade-up">fade-up</div>
  <div class="r4-card" r4-anim="fade-up" r4-delay="150">fade-up +150ms</div>
  <div class="r4-card" r4-anim="zoom-in" r4-delay="300" r4-hover="lift">zoom-in + hover lift</div>
</r4-div>` });

/* ----- Classes r4-*: um exemplo por linha da tabela ----- */
const _box = 'style="background:var(--r4-sel);border:1px dashed var(--r4-acc);border-radius:4px"';

_h('css', { title: 'r4-container — centraliza com largura máxima', html: `
<div class="r4-container" style="background:var(--r4-sel)">
  <div class="r4-p-3">Conteúdo centralizado (máx. 1100px) com margem lateral de 16px.</div>
</div>` });

_h('css', { title: 'Flexbox — r4-flex, r4-gap, r4-items-center, r4-justify-between', html: `
<div class="r4-flex r4-gap-2 r4-mb-3">
  <div class="r4-p-2" ${_box}>um</div><div class="r4-p-2" ${_box}>dois</div><div class="r4-p-2" ${_box}>três</div>
</div>
<div class="r4-flex r4-items-center r4-justify-between r4-mb-3">
  <b>título à esquerda</b><button class="r4-btn r4-btn-primary">ação à direita</button>
</div>
<div class="r4-flex-col r4-gap-1 r4-mb-3">
  <div class="r4-p-2" ${_box}>coluna 1</div><div class="r4-p-2" ${_box}>coluna 2</div>
</div>
<div class="r4-flex r4-wrap r4-gap-2" style="max-width:260px">
  <span class="r4-tag">quebra</span><span class="r4-tag">de</span><span class="r4-tag">linha</span><span class="r4-tag">automática</span><span class="r4-tag">com</span><span class="r4-tag">r4-wrap</span>
</div>` });

_h('css', { title: 'Espaçamento — r4-p-1..4, r4-m-1..4, r4-mt-, r4-mb-', html: `
<div style="background:var(--r4-sel)">
  <div class="r4-p-1 r4-mb-1" style="background:var(--r4-acc);color:#fff">r4-p-1 (4px)</div>
  <div class="r4-p-2 r4-mb-1" style="background:var(--r4-acc);color:#fff">r4-p-2 (8px)</div>
  <div class="r4-p-3 r4-mb-1" style="background:var(--r4-acc);color:#fff">r4-p-3 (16px)</div>
  <div class="r4-p-4" style="background:var(--r4-acc);color:#fff">r4-p-4 (24px)</div>
</div>
<div class="r4-flex r4-mt-3" style="background:var(--r4-sel)">
  <div class="r4-m-2 r4-p-2" style="background:var(--r4-acc);color:#fff">r4-m-2</div>
  <div class="r4-m-4 r4-p-2" style="background:var(--r4-acc);color:#fff">r4-m-4</div>
  <div class="r4-mt-4 r4-p-2" style="background:var(--r4-acc);color:#fff">r4-mt-4</div>
</div>` });

_h('css', { title: 'Visual — r4-card, r4-shadow, r4-rounded', html: `
<r4-div cols="3">
  <div class="r4-card">r4-card</div>
  <div class="r4-card r4-shadow">r4-card + r4-shadow</div>
  <div class="r4-card r4-shadow r4-rounded">+ r4-rounded</div>
</r4-div>` });

_h('css', { title: 'Texto — r4-text-center, r4-text-muted, r4-text-primary, r4-bold, r4-text-lg', html: `
<p class="r4-text-center">r4-text-center</p>
<p class="r4-text-muted">r4-text-muted — texto secundário</p>
<p class="r4-text-primary">r4-text-primary — cor de destaque</p>
<p class="r4-bold">r4-bold — negrito</p>
<p class="r4-text-lg">r4-text-lg — maior</p>
<p class="r4-text-center r4-text-lg r4-bold r4-text-primary">todas juntas</p>` });

_h('css', { title: 'Cores de fundo — r4-bg-primary, r4-bg-ok, r4-bg-err', html: `
<r4-div cols="3">
  <div class="r4-bg-primary r4-p-3 r4-rounded r4-text-center">r4-bg-primary</div>
  <div class="r4-bg-ok r4-p-3 r4-rounded r4-text-center">r4-bg-ok</div>
  <div class="r4-bg-err r4-p-3 r4-rounded r4-text-center">r4-bg-err</div>
</r4-div>` });

_h('css', { title: 'Formulário em HTML puro — r4-btn, r4-btn-primary, r4-btn-danger, r4-input', html: `
<div class="r4-flex r4-wrap r4-gap-2 r4-mb-3">
  <button class="r4-btn">padrão</button>
  <button class="r4-btn r4-btn-primary">primary</button>
  <button class="r4-btn r4-btn-danger">danger</button>
  <button class="r4-btn" disabled>desabilitado</button>
</div>
<input class="r4-input" placeholder="r4-input — campo de texto" style="max-width:320px">` });

_h('css', { title: 'Feedback — r4-alert, r4-alert-ok, r4-alert-err, r4-tag', html: `
<div class="r4-alert r4-mb-2">r4-alert — informação</div>
<div class="r4-alert r4-alert-ok r4-mb-2">r4-alert-ok — tudo certo</div>
<div class="r4-alert r4-alert-err r4-mb-3">r4-alert-err — algo deu errado</div>
<span class="r4-tag">novo</span> <span class="r4-tag">r4-tag</span> <span class="r4-tag">v2.0</span>` });

/* ===== div: layout em colunas / flex ===== */
const _b = 'class="r4-p-3" style="background:var(--r4-sel);border:1px dashed var(--r4-acc);border-radius:4px"';
_h('div', { title: 'Colunas iguais (cols) — empilham no celular', html: `
<r4-div cols="2" class="r4-mb-3"><div ${_b}>1 de 2</div><div ${_b}>2 de 2</div></r4-div>
<r4-div cols="3" class="r4-mb-3"><div ${_b}>1</div><div ${_b}>2</div><div ${_b}>3</div></r4-div>
<r4-div cols="4"><div ${_b}>1</div><div ${_b}>2</div><div ${_b}>3</div><div ${_b}>4</div></r4-div>` });
_h('div', { title: 'Modelo livre de colunas e espaçamento (gap)', html: `
<r4-div cols="200px 1fr" gap="4">
  <div ${_b}>menu fixo 200px</div>
  <div ${_b}>conteúdo ocupa o resto (1fr)</div>
</r4-div>` });
_h('div', { title: 'Flex: linha, alinhamento e distribuição', html: `
<r4-div flex justify="between" align="center" class="r4-mb-3">
  <b>Título à esquerda</b><button class="r4-btn r4-btn-primary">Ação à direita</button>
</r4-div>
<r4-div flex wrap gap="2" style="max-width:280px" class="r4-mb-3">
  <span class="r4-tag">quebra</span><span class="r4-tag">de</span><span class="r4-tag">linha</span><span class="r4-tag">com</span><span class="r4-tag">wrap</span>
</r4-div>
<r4-div column gap="1"><div ${_b}>coluna 1</div><div ${_b}>coluna 2</div></r4-div>` });
_h('div', { title: 'Div dentro de div (layout de página)', html: `
<r4-div cols="1fr 3fr" gap="3">
  <r4-div column><div ${_b}>Menu</div><div ${_b}>Menu</div></r4-div>
  <r4-div cols="2"><div class="r4-card">Cartão A</div><div class="r4-card">Cartão B</div></r4-div>
</r4-div>` });

/* ===== Funções prontas ===== */
_h('quick', { title: 'Tabela em uma linha (colunas automáticas)', fn(el) {
  R4.grid(el, [
    { produto: 'Notebook', preco: 4200.5, estoque: 12 },
    { produto: 'Mouse', preco: 89.9, estoque: 140 },
    { produto: 'Teclado', preco: 199, estoque: 63 }
  ]);
} });
_h('quick', { title: 'Tabela escolhendo colunas e formato', fn(el, out) {
  R4.grid(el, [
    { produto: 'Notebook', preco: 4200.5, criado: '2026-01-10' },
    { produto: 'Mouse', preco: 89.9, criado: '2026-02-03' }
  ], {
    columns: ['produto', { dataIndex: 'preco', header: 'Preço', format: 'money', align: 'right' }, { dataIndex: 'criado', header: 'Criado em', format: 'date' }],
    listeners: { rowclick: (g, linha) => out(linha) }
  });
} });
_h('quick', { title: 'Botão e painel', fn(el) {
  R4.panel(el, 'Meu painel', '<p>Conteúdo do painel.</p>');
  R4.button(el, 'Salvar', () => R4.toast('Salvo!'));
} });
_h('quick', { title: 'Árvore e abas', fn(el, out) {
  R4.treepanel(el, [{ text: 'Frutas', children: [{ text: 'Maçã' }, { text: 'Banana' }] }], no => out({ clicou: no.text }));
  R4.tabpanel(el, { Resumo: '<p>Texto do resumo</p>', Detalhes: '<p>Texto dos detalhes</p>' }).el.style.height = '120px';
} });
_h('quick', { title: 'Janela e diálogos (sem alvo)', fn(el) {
  R4.button(el, 'Janela', () => R4.window('Aviso', '<p>Abre direto, sem montar nada.</p>'));
  R4.button(el, 'Confirmar', () => R4.confirm('Excluir', 'Tem certeza?', ok => R4.toast(ok ? 'Excluído' : 'Cancelado')));
} });
_h('quick', { title: 'HTML da lib em qualquer lugar', fn(el) {
  R4.render(el, '<r4-div cols="2"><r4-button variant="primary" r4-click="toast:Oi">Tag</r4-button><span class="r4-tag">r4-render</span></r4-div>');
} });
