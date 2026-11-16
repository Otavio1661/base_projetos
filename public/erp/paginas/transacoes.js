/* Transações: tabela de 2 milhões de linhas. Paginação, ordenação e busca rodam no SERVIDOR (grid remote);
 * o navegador só recebe a página pedida (10 a 100 linhas). Gráficos de resumo vêm de /erp/api/transacoes/resumo. */
(function () {
  'use strict';
  const { el } = R4.util;
  window.ErpPaginas.transacoes = { titulo: 'Transações', icone: 'table', montar(alvo, ctx) {
    const { Erp } = ctx;
    Erp.titulo(alvo, Erp.t('transacoes'), [Erp.mk({ xtype: 'badge', text: 'Servidor', variant: 'primary', outline: true })]);
    const aviso = R4.create({ xtype: 'alert', variant: 'info', title: 'Busca, ordenação e paginação no servidor',
      html: 'Esta tabela tem milhões de linhas e o navegador nunca as recebe todas: cada clique em ordenar, página ou busca pede só a página atual ao PHP. As células que contêm o termo buscado ficam destacadas. O seletor de linhas vai até 100 (sem "Todos", de propósito).', renderTo: alvo });
    const kp = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: '12px' } });
    alvo.append(kp);
    const cardG = el('div', { class: 'erp-grid2' }), cA = el('div', { class: 'erp-card' }), cB = el('div', { class: 'erp-card' });
    cardG.append(cA, cB); alvo.append(cardG);
    const holder = el('div', { class: 'erp-card' }); alvo.append(holder);
    const vivos = [aviso];

    const grid = R4.create(Erp.gridOpts({
      src: '/erp/api/transacoes', pageSizes: '10,30,50,100', renderTo: holder, selectable: '',
      columns: [
        { header: '#', dataIndex: 'id', width: 90, align: 'right' },
        { header: 'Cliente', dataIndex: 'cliente', width: 200 },
        { header: 'Cidade', dataIndex: 'cidade', width: 150 },
        { header: 'UF', dataIndex: 'uf', width: 60 },
        { header: 'Produto', dataIndex: 'produto', width: 200 },
        { header: 'Categoria', dataIndex: 'categoria', width: 130 },
        { header: 'Valor', dataIndex: 'valor', format: 'money', align: 'right', width: 120 },
        { header: 'Data', dataIndex: 'data', format: 'date', width: 110 },
        { header: 'Status', dataIndex: 'status', width: 120, renderer: v => Erp.statusTag(v) }
      ]
    }));
    vivos.push(grid);
    grid.on('load', () => { if (grid._total) totalEl.textContent = Number(grid._total).toLocaleString('pt-BR') + (grid.q ? ' linhas encontradas na busca' : ' linhas no total'); });
    const totalEl = el('span', { class: 'erp-muted', text: '' });
    holder.insertBefore(el('div', { class: 'erp-bar', style: { marginBottom: '8px' } }, [totalEl]), holder.firstChild);

    (async () => {
      let d;
      try { const r = await Erp.get('/erp/api/transacoes/resumo'); d = r.retorno || r; } catch (e) { return; }
      if (!el.isConnected && !holder.isConnected) return;
      vivos.push(R4.create({ xtype: 'stat', title: 'Transações', value: d.total, format: 'number', icon: 'table', renderTo: kp }));
      vivos.push(R4.create({ xtype: 'stat', title: 'Valor total', value: d.valorTotal, format: 'money', icon: 'dollar', variant: 'primary', renderTo: kp }));
      vivos.push(R4.create({ xtype: 'stat', title: 'Ticket médio', value: d.total ? d.valorTotal / d.total : 0, format: 'money', icon: 'tag', renderTo: kp }));
      vivos.push(R4.chart(cA, (d.porUf || []).slice(0, 10), { type: 'bar', horizontal: true, x: 'uf', y: 'qtd', title: 'Top 10 UFs por transações', height: 280 }));
      vivos.push(R4.chart(cB, d.porStatus || [], { type: 'donut', x: 'status', y: 'qtd', title: 'Transações por status', height: 280, centerText: '{total}', centerSub: 'transações' }));
    })();
    return () => vivos.forEach(c => { try { c.destroy(); } catch (e) { /* ok */ } });
  } };
})();
