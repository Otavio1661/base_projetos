/* Painel: KPIs (stat), gráficos (line/area, donut, bar), progresso, timeline e estado vazio. */
(function () {
  'use strict';
  const { el, esc } = R4.util;
  /** R$ 25,7 mi (cabe no card e no centro da rosca) */
  const compacto = (v) => 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi';
  const VAR = { aberto: 'info', pago: 'ok', enviado: 'info', cancelado: 'err' };
  const ICO = { aberto: 'cart', pago: 'check', enviado: 'arrow-right', cancelado: 'error' };

  window.ErpPaginas.dashboard = { titulo: 'Painel', icone: 'chart-bar', montar(alvo, ctx) {
    const { Erp } = ctx;
    Erp.titulo(alvo, Erp.t('dashboard'), [
      Erp.mk({ xtype: 'badge', text: 'Dados fictícios', variant: 'info', outline: true }),
      Erp.mk({ xtype: 'button', text: 'Atualizar', icon: 'refresh', handler: () => carregar() })
    ]);
    const corpo = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } });
    alvo.append(corpo);
    let vivos = [];
    const limpar = () => { vivos.forEach(c => { try { c.destroy(); } catch (e) { /* ok */ } }); vivos = []; corpo.textContent = ''; };

    async function carregar() {
      limpar();
      const esp = R4.create({ xtype: 'spinner', text: 'Carregando painel...', renderTo: corpo }); vivos.push(esp);
      let d;
      try { const r = await Erp.get('/erp/api/dashboard'); d = r.retorno || r; }
      catch (e) { limpar(); R4.create({ xtype: 'emptystate', icon: 'warning', title: 'Não foi possível carregar o painel', text: e.message || '', renderTo: corpo }); return; }
      limpar();
      const kp = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: '12px' } });
      const ic = { receita: 'dollar', pedidos: 'cart', clientes: 'user', ticket: 'tag' };
      (d.kpis || []).forEach(k => {
        const s = R4.create({ xtype: 'stat', title: k.titulo, value: k.formato === 'money' && k.valor >= 1e6 ? compacto(k.valor) : k.valor, format: k.formato === 'money' && k.valor >= 1e6 ? undefined : (k.formato === 'money' ? 'money' : 'number'), change: k.variacao, changeText: 'vs. mês anterior', icon: ic[k.chave] || 'chart-bar', renderTo: kp });
        vivos.push(s);
      });
      corpo.append(kp);

      const g1 = el('div', { class: 'erp-grid3' }), c1 = el('div', { class: 'erp-card' }), c2 = el('div', { class: 'erp-card' });
      g1.append(c1, c2); corpo.append(g1);
      vivos.push(R4.chart(c1, d.vendasMensais || [], { type: 'area', smooth: true, x: 'mes', y: 'valor', format: 'money', title: 'Vendas por mês', height: 260 }));
      vivos.push(R4.chart(c2, d.porCategoria || [], { type: 'donut', x: 'categoria', y: 'valor', format: 'money', title: 'Vendas por categoria', height: 260, centerText: compacto((d.porCategoria || []).reduce((a, c) => a + c.valor, 0)), centerSub: 'total' }));

      const g2 = el('div', { class: 'erp-grid2' }), c3 = el('div', { class: 'erp-card' }), c4 = el('div', { class: 'erp-card' });
      g2.append(c3, c4); corpo.append(g2);
      vivos.push(R4.chart(c3, d.series || [], { type: 'line', x: 'dia', y: 'valor', format: 'money', title: 'Faturamento diário (60 dias)', height: 240 }));
      vivos.push(R4.chart(c4, d.porStatus || [], { type: 'bar', x: 'status', y: 'qtd', title: 'Pedidos por status', height: 240 }));

      const g3 = el('div', { class: 'erp-grid2' }), c5 = el('div', { class: 'erp-card' }), c6 = el('div', { class: 'erp-card' });
      g3.append(c5, c6); corpo.append(g3);
      c5.append(el('h3', { text: 'Últimos pedidos' }));
      const ult = d.ultimosPedidos || [];
      if (!ult.length) vivos.push(R4.create({ xtype: 'emptystate', icon: 'inbox', title: 'Nenhum pedido ainda', text: 'Crie um pedido na página Pedidos.', renderTo: c5 }));
      else vivos.push(R4.create({ xtype: 'timeline', renderTo: c5, items: ult.map(p => ({
        title: 'Pedido #' + p.id + ' — ' + p.cliente, date: p.data, icon: ICO[p.status] || 'cart', variant: VAR[p.status] || 'default',
        html: Erp.money(p.total) + ' · ' + esc(p.status) + ' · ' + p.itens + ' item(ns)' })) }));

      c6.append(el('h3', { text: 'Resumo do funil' }));
      const tot = (d.porStatus || []).reduce((a, s) => a + (+s.qtd || 0), 0) || 1;
      (d.porStatus || []).forEach(s => {
        const pct = Math.round((+s.qtd || 0) * 100 / tot);
        const p = R4.create({ xtype: 'progress', value: pct, label: s.status + ' (' + Erp.num(s.qtd) + ')', variant: VAR[s.status] === 'err' ? 'err' : VAR[s.status] === 'ok' ? 'ok' : 'primary', renderTo: c6 });
        vivos.push(p); p.el.style.marginBottom = '10px';
      });
      R4.create({ xtype: 'tooltip', text: 'Percentual sobre o total de pedidos', renderTo: c6 });
    }
    carregar();
    return () => { limpar(); };
  } };
})();
