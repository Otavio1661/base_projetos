/* Importar arquivos: filedrop (CSV/XLSX/JSON) → pré-visualização em grid → importação em lotes com progresso. */
(function () {
  'use strict';
  const { el, esc } = R4.util;
  const CAMPOS = ['nome', 'email', 'telefone', 'cidade', 'uf', 'tipo', 'documento', 'limite'];
  const norm = s => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  window.ErpPaginas.arquivos = { titulo: 'Importar arquivos', icone: 'file', montar(alvo, ctx) {
    const { Erp } = ctx;
    Erp.titulo(alvo, Erp.t('arquivos'), [
      Erp.mk({ xtype: 'button', text: 'Baixar modelo CSV', icon: 'download', handler: () => {
        const csv = R4.files.toCSV([
          { nome: 'Ana Souza', email: 'ana@exemplo.com', telefone: '(44) 99999-0001', cidade: 'Umuarama', uf: 'PR', tipo: 'PF', documento: '', limite: 2500 },
          { nome: 'Mercado Central Ltda', email: 'contato@mercado.example', telefone: '', cidade: 'Maringa', uf: 'PR', tipo: 'PJ', documento: '', limite: 12000 }
        ], { columns: CAMPOS, delimiter: ';', decimal: ',' });
        R4.files.download(csv, 'modelo-clientes.csv', 'text/csv');
      } })
    ]);
    alvo.append(el('p', { class: 'erp-muted', text: 'Arraste um CSV, XLSX ou JSON com as colunas: ' + CAMPOS.join(', ') + '. Até 500 linhas por arquivo. Tudo é lido no navegador (nada sobe até você clicar em Importar).' }));
    const drop = el('div', { class: 'erp-card erp-drop' }); alvo.append(drop);
    const area = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }); alvo.append(area);
    let linhas = [], vivos = [];
    const limpar = () => { vivos.forEach(c => { try { c.destroy(); } catch (e) { /* ok */ } }); vivos = []; area.textContent = ''; };

    const fd = R4.create({ xtype: 'filedrop', accept: '.csv,.xlsx,.json', parse: 'csv', maxSize: 1024 * 1024, renderTo: drop,
      listeners: {
        data: (c, dados, f) => preview(Array.isArray(dados) ? dados : [], f),
        invalid: (c, erros) => R4.notify({ type: 'warn', text: Array.isArray(erros) ? erros.map(e => e.message || e).join(' ') : String(erros) })
      } });

    function mapear(r) {
      const o = {}; Object.keys(r || {}).forEach(k => { const n = norm(k); if (CAMPOS.includes(n)) o[n] = r[k]; });
      if (o.limite != null && o.limite !== '') o.limite = Number(String(o.limite).replace(',', '.')) || 0;
      if (o.uf) o.uf = String(o.uf).toUpperCase();
      if (o.tipo) o.tipo = String(o.tipo).toUpperCase();
      return o;
    }
    function preview(rows, f) {
      limpar();
      linhas = rows.slice(0, 500).map(mapear);
      if (!linhas.length) { vivos.push(R4.create({ xtype: 'emptystate', icon: 'file', title: 'Arquivo sem linhas', text: 'Confira o cabeçalho e o delimitador.', renderTo: area })); return; }
      const card = el('div', { class: 'erp-card' }, [el('h3', { text: 'Pré-visualização — ' + f.name + ' (' + linhas.length + ' linha(s)' + (rows.length > 500 ? ', cortado em 500' : '') + ')' })]);
      area.append(card);
      const g = R4.create({ xtype: 'grid', data: linhas, pageSize: 10, pageSizeSelector: true, pageSizes: '10,30,50,100,all', columns: CAMPOS.map(k => ({ header: k, dataIndex: k })), renderTo: card, exportable: false });
      vivos.push(g);
      const bar = el('div', { class: 'erp-bar', style: { marginTop: '10px' } }); card.append(bar);
      const prog = R4.create({ xtype: 'progress', value: 0, label: 'Importação', renderTo: card, hidden: true }); prog.el.hidden = true; vivos.push(prog);
      const btn = R4.create({ xtype: 'button', text: 'Importar ' + linhas.length + ' cliente(s)', icon: 'upload', variant: 'primary', renderTo: bar, handler: async () => {
        btn.setDisabled(true); prog.el.hidden = false; prog.setValue && prog.setValue(0);
        let ok = 0; const rej = [];
        try {
          for (let i = 0; i < linhas.length; i += 100) {
            const lote = linhas.slice(i, i + 100);
            const r = await Erp.post('/erp/api/clientes/importar', { linhas: lote });
            const d = r.retorno || r; ok += d.importados || 0;
            (d.rejeitados || []).forEach(x => rej.push({ linha: (x.linha || 0) + i, erro: x.erro }));
            prog.setValue ? prog.setValue(Math.round(Math.min(i + 100, linhas.length) * 100 / linhas.length)) : prog.increment(Math.round(100 / Math.ceil(linhas.length / 100)));
          }
          R4.notify({ type: rej.length ? 'warn' : 'ok', text: ok + ' importado(s), ' + rej.length + ' rejeitado(s).' });
          mostrarRejeitados(rej, ok);
        } catch (e) { Erp.falha(e); }
        btn.setDisabled(false);
      } });
      vivos.push(btn);
    }
    function mostrarRejeitados(rej, ok) {
      const old = area.querySelector('.erp-rej'); old && old.remove();
      const c = el('div', { class: 'erp-card erp-rej' }, [el('h3', { text: 'Resultado: ' + ok + ' importado(s), ' + rej.length + ' rejeitado(s)' })]);
      area.append(c);
      if (!rej.length) { vivos.push(R4.create({ xtype: 'alert', variant: 'ok', html: 'Todas as linhas foram aceitas. Veja os novos clientes na página Clientes.', renderTo: c })); return; }
      vivos.push(R4.create({ xtype: 'grid', data: rej, pageSize: 10, filter: false, columns: [{ header: 'Linha', dataIndex: 'linha', width: 80, align: 'right' }, { header: 'Motivo', dataIndex: 'erro' }], renderTo: c }));
    }
    return () => { limpar(); try { fd.destroy(); } catch (e) { /* ok */ } };
  } };
})();
