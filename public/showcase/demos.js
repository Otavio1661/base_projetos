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
            renderer: v => v < 20 ? '<b style="color:var(--r4-err)">' + v + '</b>' : v }
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
      window.fetch = async (url, o) => { enviado = { url, method: o.method, body: JSON.parse(o.body) }; return { json: async () => ({ ok: true }) }; };
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
