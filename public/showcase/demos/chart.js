/* Demos da vitrine: chart e sparkline. Cada exemplo `fn` é autocontido (a vitrine o executa a partir do texto editável). */
(window.R4Demos = window.R4Demos || {}).chart = [
  {
    title: 'Barras agrupadas (HTML + src)',
    html: `<r4-chart type="bar" title="Receita x despesa por mês" src="/showcase/vitrineData/vendas-mensais.json" x="mes" y="receita,despesa" format="money" height="280"></r4-chart>
<p class="r4-text-muted">Clique na legenda para ligar/desligar uma série. Passe o mouse (ou use as setas do teclado com o gráfico focado) para ver o tooltip. "Ver como tabela" mostra os mesmos dados em texto.</p>`
  },
  {
    title: 'Barras empilhadas e horizontais (HTML)',
    html: `<r4-div cols="2">
  <r4-chart type="bar" stacked title="Empilhadas" src="/showcase/vitrineData/vendas-mensais.json" x="mes" y="receita,despesa" format="money" height="260"></r4-chart>
  <r4-chart type="bar" horizontal title="Horizontais" src="/showcase/vitrineData/vendas-categoria.json" x="categoria" y="valor" format="money" height="260"></r4-chart>
</r4-div>`
  },
  {
    title: 'Linhas, suave e com área (HTML)',
    html: `<r4-div cols="2">
  <r4-chart type="line" smooth title="Receita (linha suave)" src="/showcase/vitrineData/vendas-mensais.json" x="mes" y="receita" format="money" height="240"></r4-chart>
  <r4-chart type="area" title="Receita e despesa (área)" src="/showcase/vitrineData/vendas-mensais.json" x="mes" y="receita,despesa" format="money" height="240"></r4-chart>
</r4-div>`
  },
  {
    title: 'Linha com 90 dias (datas pt-BR, rótulos ralos)',
    html: `<r4-chart type="line" area smooth title="Visitas por dia" src="/showcase/vitrineData/series-diarias.json" x="data" y="visitas" height="280"></r4-chart>`
  },
  {
    title: 'Pizza e rosca com texto central (HTML)',
    html: `<r4-div cols="2">
  <r4-chart type="pie" title="Vendas por categoria" src="/showcase/vitrineData/vendas-categoria.json" x="categoria" y="valor" format="money" height="280"></r4-chart>
  <r4-chart type="donut" title="Rosca" src="/showcase/vitrineData/vendas-categoria.json" x="categoria" y="valor" format="money" height="280" center-text="{total}" center-sub="Total vendido"></r4-chart>
</r4-div>`
  },
  {
    title: 'Séries com rótulo e cor própria (<r4-series>)',
    html: `<r4-chart type="bar" title="Séries customizadas" src="/showcase/vitrineData/vendas-mensais.json" x="mes" format="money" height="260">
  <r4-series key="receita" label="Entradas" color="#1baf7a"></r4-series>
  <r4-series key="despesa" label="Saídas" color="var(--r4-c8)"></r4-series>
</r4-chart>`
  },
  {
    title: 'Pedidos agregados por status (JS)',
    fn(el, out) {
      VitrineData.load('pedidos').then(pedidos => {
        const por = {};
        pedidos.forEach(p => { const s = por[p.status] || (por[p.status] = { status: p.status, pedidos: 0, total: 0 }); s.pedidos++; s.total += p.total; });
        const linhas = Object.values(por);
        el.innerHTML = '<r4-div cols="2"><div id="g-qtd"></div><div id="g-val"></div></r4-div>';
        R4.scan(el);
        R4.chart(el.querySelector('#g-qtd'), linhas, { type: 'bar', x: 'status', y: 'pedidos', title: 'Pedidos por status', height: 240 });
        R4.chart(el.querySelector('#g-val'), linhas, { type: 'donut', x: 'status', y: 'total', format: 'money', title: 'Valor por status', height: 240, centerText: '{total}', centerSub: 'em pedidos' });
        out(linhas);
      });
    }
  },
  {
    title: 'Dispersão: itens x total do pedido (JS)',
    fn(el, out) {
      VitrineData.load('pedidos').then(pedidos => {
        R4.chart(el, pedidos, { type: 'scatter', x: 'itens', y: 'total', format: 'money', title: 'Itens x total (cada ponto é um pedido)', height: 300 });
        out('Passe o mouse perto de um ponto; use as setas para percorrer em ordem de X.');
      });
    }
  },
  {
    title: 'Barras + linha no mesmo gráfico (JS)',
    fn(el, out) {
      VitrineData.load('vendas-mensais').then(dados => {
        R4.create({
          xtype: 'chart', renderTo: el, data: dados, x: 'mes', format: 'money', height: 280, title: 'Receita (barras) e despesa (linha)',
          series: [{ key: 'receita', label: 'Receita', type: 'bar' }, { key: 'despesa', label: 'Despesa', type: 'line' }]
        });
      });
    }
  },
  {
    title: 'Função rápida R4.chart(alvo, dados, opções)',
    fn(el, out) {
      const g = R4.chart(el, [
        { dia: 'Seg', vendas: 12 }, { dia: 'Ter', vendas: 18 }, { dia: 'Qua', vendas: 9 },
        { dia: 'Qui', vendas: 22 }, { dia: 'Sex', vendas: 30 }
      ], { type: 'bar', x: 'dia', y: 'vendas', title: 'Vendas na semana', height: 220 });
      g.on('pointclick', (c, info) => out('Clicou em ' + info.label + ': ' + JSON.stringify(info.row)));
      out('Clique em uma barra: o evento pointclick traz a linha de dados.');
    }
  },
  {
    title: 'Atualização dinâmica e troca de tipo (JS)',
    fn(el, out) {
      el.innerHTML = '<div class="r4-flex r4-gap-2 r4-wrap r4-mb-2"></div><div></div>';
      const barra = el.firstChild, alvo = el.lastChild;
      const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'];
      const gerar = () => meses.map(m => ({ mes: m, receita: Math.round(20000 + Math.random() * 30000), despesa: Math.round(8000 + Math.random() * 20000) }));
      const g = R4.chart(alvo, gerar(), { type: 'bar', x: 'mes', y: 'receita,despesa', format: 'money', height: 260, title: 'Atualize os dados' });
      const tipos = ['bar', 'line', 'area', 'bar'];
      let t = 0;
      R4.button(barra, 'Novos dados', () => g.update(gerar()));
      R4.button(barra, 'Menos meses', () => g.update(gerar().slice(0, 3 + Math.floor(Math.random() * 3))));
      R4.button(barra, 'Trocar tipo', () => { t = (t + 1) % 3; g.setOptions({ type: tipos[t] }); out('type = ' + tipos[t]); });
    }
  },
  {
    title: 'Alternar tema claro/escuro',
    fn(el, out) {
      el.innerHTML = '<div class="r4-mb-2"></div><div></div>';
      R4.button(el.firstChild, 'Alternar tema', { icon: 'contrast', handler: () => document.documentElement.classList.toggle('r4-dark') });
      R4.chart(el.lastChild, [
        { k: 'A', a: 30, b: 22, c: 14, d: 9, e: 17, f: 25, g: 12, h: 20 },
        { k: 'B', a: 20, b: 28, c: 18, d: 12, e: 9, f: 15, g: 22, h: 11 },
        { k: 'C', a: 26, b: 14, c: 24, d: 16, e: 21, f: 10, g: 8, h: 18 }
      ], { type: 'bar', x: 'k', y: 'a,b,c,d,e,f,g,h', height: 240, title: 'As 8 cores da paleta (--r4-c1 … --r4-c8)' });
    }
  },
  {
    title: 'Estados: vazio, carregando e erro',
    html: `<r4-div cols="3">
  <r4-chart type="bar" title="Vazio" data="[]" height="180" empty-text="Nenhuma venda no período."></r4-chart>
  <r4-chart type="bar" title="Carregando (resposta lenta)" src="/vitrine/api/lento?ms=3000" x="nome" y="saldo" format="money" height="180"></r4-chart>
  <r4-chart type="bar" title="Erro (com nova tentativa)" src="/vitrine/api/falha" height="180"></r4-chart>
</r4-div>`
  },
  {
    title: 'Dados difíceis: NaN, negativos, 1 ponto, pizza zerada',
    fn(el, out) {
      el.innerHTML = '<r4-div cols="2"><div id="d1"></div><div id="d2"></div><div id="d3"></div><div id="d4"></div></r4-div>';
      R4.scan(el);
      const q = id => el.querySelector(id);
      R4.chart(q('#d1'), [{ x: 'a', v: 5 }, { x: 'b', v: NaN }, { x: 'c', v: -3 }, { x: 'd', v: 'texto' }, { x: 'e', v: Infinity }, { x: 'f', v: 8 }], { type: 'bar', x: 'x', y: 'v', title: 'NaN, texto e negativo', height: 200 });
      R4.chart(q('#d2'), [{ x: 'único', v: 42 }], { type: 'line', x: 'x', y: 'v', title: 'Um ponto só', height: 200 });
      R4.chart(q('#d3'), [{ n: 'A', v: 0 }, { n: 'B', v: 0 }], { type: 'pie', x: 'n', y: 'v', title: 'Pizza com soma 0', height: 200 });
      R4.chart(q('#d4'), [3, 5, -2, null, 7, 4], { type: 'line', area: true, title: 'Array de números com lacuna', height: 200 });
    }
  },
  {
    title: '10.000 pontos em linha (decimação)',
    fn(el, out) {
      const n = 10000, dados = [];
      let v = 100;
      for (let i = 0; i < n; i++) { v += Math.sin(i / 40) * 2 + (((i * 7919) % 13) - 6) * 0.6; dados.push({ i, valor: Math.round(v * 100) / 100 }); }
      const t0 = performance.now();
      const g = R4.chart(el, dados, { type: 'line', x: 'i', y: 'valor', title: '10.000 pontos', height: 260, points: false });
      out('Desenhado em ' + Math.round(performance.now() - t0) + ' ms. Acima de maxPoints (1500) só o mínimo/máximo de cada trecho é desenhado; o tooltip e a tabela usam todos os dados.');
    }
  },
  {
    title: 'Exportar SVG / PNG e data URL',
    fn(el, out) {
      const g = R4.chart(el, [
        { m: 'Jan', v: 12 }, { m: 'Fev', v: 19 }, { m: 'Mar', v: 8 }, { m: 'Abr', v: 24 }
      ], { type: 'bar', x: 'm', y: 'v', title: 'Gráfico exportável', height: 220, exportButtons: true });
      out('Use os botões SVG e PNG no topo. Por código: g.exportSVG("nome"), g.exportPNG("nome") (Promise; precisa de canvas.toBlob), g.toDataURL().\nData URL do SVG: ' + g.toDataURL().length + ' caracteres.');
    }
  }
];

/* sparkline ---------------------------------------------------- */
(window.R4Demos = window.R4Demos || {}).sparkline = [
  {
    title: 'Sparklines em cartões (HTML)',
    html: `<r4-div cols="4">
  <div class="r4-card"><div class="r4-text-muted">Receita</div><div class="r4-text-lg r4-bold">R$ 384,3 mil</div>
    <r4-sparkline data="[12,18,14,22,19,28,26,34]" area smooth height="40"></r4-sparkline></div>
  <div class="r4-card"><div class="r4-text-muted">Pedidos</div><div class="r4-text-lg r4-bold">2.184</div>
    <r4-sparkline data="[30,28,35,31,29,40,38,44]" color="var(--r4-c3)" height="40"></r4-sparkline></div>
  <div class="r4-card"><div class="r4-text-muted">Ticket médio</div><div class="r4-text-lg r4-bold">R$ 175,90</div>
    <r4-sparkline data="[9,8,10,9,7,8,6,7]" color="var(--r4-c2)" height="40"></r4-sparkline></div>
  <div class="r4-card"><div class="r4-text-muted">Conversão</div><div class="r4-text-lg r4-bold">3,8%</div>
    <r4-sparkline data="[2.1,2.5,3,2.8,3.4,3.6,3.5,3.8]" format="percent" area height="40"></r4-sparkline></div>
</r4-div>`
  },
  {
    title: 'Sparklines dentro de uma tabela de KPIs (JS)',
    fn(el, out) {
      VitrineData.load('kpis').then(kpis => {
        const serie = (seed, base) => { let s = seed * 9301 + 49297, v = base; return Array.from({ length: 14 }, () => { s = (s * 9301 + 49297) % 233280; v += (s / 233280 - 0.45) * base * 0.12; return Math.round(v * 100) / 100; }); };
        const fmt = (k) => k.formato === 'money' ? R4.util.money(k.valor) : k.formato === 'percent' ? R4.util.number(k.valor, 1) + '%' : R4.util.number(k.valor, 0);
        const tbl = R4.util.el('table', { class: 'r4-table r4-striped' }, [
          R4.util.el('thead', {}, [R4.util.el('tr', {}, ['Indicador', 'Valor', 'Variação', 'Últimos 14 dias'].map(t => R4.util.el('th', { text: t })))])
        ]);
        const body = R4.util.el('tbody');
        kpis.forEach((k, i) => {
          const td = R4.util.el('td', { style: { width: '160px' } });
          const tr = R4.util.el('tr', {}, [
            R4.util.el('td', { text: k.titulo }), R4.util.el('td', { text: fmt(k) }),
            R4.util.el('td', { text: (k.variacao > 0 ? '▲ ' : '▼ ') + R4.util.number(Math.abs(k.variacao), 1) + '%', style: { color: k.variacao > 0 ? 'var(--r4-ok)' : 'var(--r4-err)' } }), td]);
          body.append(tr);
          R4.sparkline(td, serie(i + 3, k.valor), { height: 32, area: true, color: k.variacao > 0 ? 'var(--r4-c3)' : 'var(--r4-c8)', format: k.formato });
        });
        tbl.append(body);
        el.append(tbl);
      });
    }
  },
  {
    title: 'Minibarras e sparkline com objetos (JS)',
    fn(el, out) {
      el.innerHTML = '<div class="r4-flex r4-gap-4 r4-items-center"><div id="sp1" style="width:200px"></div><div id="sp2" style="width:200px"></div></div>';
      const dados = [{ d: '2026-08-01', v: 4 }, { d: '2026-08-02', v: 7 }, { d: '2026-08-03', v: 5 }, { d: '2026-08-04', v: 9 }, { d: '2026-08-05', v: 6 }];
      R4.sparkline(el.querySelector('#sp1'), dados, { x: 'd', y: 'v', height: 40, smooth: true });
      R4.sparkline(el.querySelector('#sp2'), dados, { x: 'd', height: 40, series: [{ key: 'v', label: 'Vendas', type: 'bar' }] });
      out('Passe o mouse para ver a data e o valor.');
    }
  }
];
