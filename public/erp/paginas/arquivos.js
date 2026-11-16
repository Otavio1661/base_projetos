/* Importar arquivos, em dois modos:
 *  1) Automático: o framework LÊ o arquivo (JSON, CSV, XLSX...) e descobre sozinho colunas, tipos e linhas (R4.files.interpret);
 *     a tabela já nasce com filtro por valores no cabeçalho, busca, ordenação, "Todos" e exportação.
 *  2) Esquema fixo: o arquivo precisa ter as colunas de cliente; pré-visualiza e importa em lotes para o mini banco (/erp/api/clientes/importar). */
(function () {
  'use strict';
  const { el } = R4.util;
  const CAMPOS = ['nome', 'email', 'telefone', 'cidade', 'uf', 'tipo', 'documento', 'limite'];
  const norm = s => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const FORMAS = {
    'array-de-objetos': 'lista de objetos', 'objeto-com-lista': 'objeto com uma lista dentro', 'objeto-de-objetos': 'objeto de objetos (a chave virou uma coluna)',
    'array-de-arrays': 'lista de listas (linhas e colunas)', 'array-de-primitivos': 'lista de valores simples', objeto: 'um único objeto', 'chave-valor': 'pares chave/valor',
    misto: 'lista mista', primitivo: 'valor único', vazio: 'vazio', ndjson: 'JSON em linhas (NDJSON)', csv: 'texto com delimitador (CSV)', xlsx: 'planilha XLSX'
  };
  const TIPOS = { number: 'número', integer: 'inteiro', money: 'dinheiro', date: 'data', datetime: 'data e hora', boolean: 'sim/não', text: 'texto' };

  window.ErpPaginas.arquivos = { titulo: 'Importar arquivos', icone: 'file', montar(alvo, ctx) {
    const { Erp } = ctx;
    const vivos = [];
    const guardar = c => { vivos.push(c); return c; };
    Erp.titulo(alvo, Erp.t('arquivos'), []);

    /* ---- seletor de modo ---- */
    const modos = el('div', { class: 'erp-bar' });
    const auto = el('div'), fixo = el('div');
    alvo.append(modos, auto, fixo);
    const btns = {};
    const modo = qual => { auto.hidden = qual !== 'auto'; fixo.hidden = qual !== 'fixo'; Object.keys(btns).forEach(k => btns[k].el.classList.toggle('r4-btn-primary', k === qual)); };
    btns.auto = guardar(R4.create({ xtype: 'button', text: 'Interpretar automaticamente', icon: 'file', renderTo: modos, handler: () => modo('auto') }));
    btns.fixo = guardar(R4.create({ xtype: 'button', text: 'Importar como clientes (esquema fixo)', icon: 'upload', renderTo: modos, handler: () => modo('fixo') }));

    /* =========================== 1) AUTOMÁTICO =========================== */
    auto.append(el('p', { class: 'erp-muted', text: 'Arraste qualquer JSON, CSV, TSV ou XLSX. O framework descobre as colunas, os tipos e as linhas sozinho: lista de objetos, objeto com uma lista dentro, objeto de objetos, lista de listas, NDJSON, planilha... Nada sai do navegador.' }));
    const dropA = el('div', { class: 'erp-card erp-drop' }); auto.append(dropA);
    const areaA = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' } }); auto.append(areaA);
    let vivosA = [], atual = null;
    const limparA = () => { vivosA.forEach(c => { try { c.destroy(); } catch (e) { /* ok */ } }); vivosA = []; areaA.textContent = ''; };

    async function mostrar(file, opts) {
      limparA();
      let r;
      try { r = await R4.files.interpretFile(file, opts || {}); } catch (e) { R4.notify({ type: 'warn', text: e.message || String(e) }); return; }
      atual = { file, opts: opts || {} };
      const m = r.meta || {};
      if (!r.rows.length) { vivosA.push(R4.create({ xtype: 'emptystate', icon: 'file', title: 'Nada para mostrar', text: 'O arquivo não tem linhas reconhecíveis.', renderTo: areaA })); return; }
      const card = el('div', { class: 'erp-card' }); areaA.append(card);
      card.append(el('h3', { text: file.name + ' — ' + R4.util.number(r.rows.length, 0) + ' linha(s) × ' + r.columns.length + ' coluna(s)' }));
      card.append(el('p', { class: 'erp-muted', text: 'Forma detectada: ' + (FORMAS[m.shape] || m.shape || '?') + (m.path ? ' (em "' + m.path + '")' : '') + '.' }));
      (m.warnings || []).forEach(w => vivosA.push(R4.create({ xtype: 'alert', variant: 'warn', html: R4.util.esc(w), renderTo: card })));

      const ctl = el('div', { class: 'erp-bar', style: { margin: '8px 0' } }); card.append(ctl);
      if (m.candidates && m.candidates.length > 1) {
        ctl.append(el('span', { class: 'erp-muted', text: 'Lista usada:' }));
        vivosA.push(R4.create({ xtype: 'select', value: m.path, options: m.candidates.map(c => ({ value: c.path || c, text: (c.path || c) + (c.length != null ? ' (' + c.length + ')' : '') })), renderTo: ctl,
          listeners: { change: (c, v) => mostrar(file, Object.assign({}, atual.opts, { path: v })) } }));
      }
      if (m.sheets && m.sheets.length > 1) {
        ctl.append(el('span', { class: 'erp-muted', text: 'Aba:' }));
        vivosA.push(R4.create({ xtype: 'select', value: m.sheet || m.sheets[0], options: m.sheets.map(s => ({ value: s, text: s })), renderTo: ctl,
          listeners: { change: (c, v) => mostrar(file, Object.assign({}, atual.opts, { sheet: v })) } }));
      }
      // colunas descobertas e seus tipos
      const tipos = el('div', { class: 'erp-bar', style: { flexWrap: 'wrap', gap: '6px', marginBottom: '8px' } }); card.append(tipos);
      r.columns.slice(0, 40).forEach(c => tipos.append(Erp.badge(c.header + ' · ' + (TIPOS[c.type] || c.type), c.type === 'text' ? 'default' : 'primary')));
      if (r.columns.length > 40) tipos.append(el('span', { class: 'erp-muted', text: '+ ' + (r.columns.length - 40) + ' coluna(s)' }));

      const g = R4.create({ xtype: 'grid', data: r.rows, columns: r.columns, pageSize: 10, pageSizeSelector: true, pageSizes: '10,30,50,100,all', columnFilters: true,
        filter: true, exportable: true, columnMenu: true, resizable: true, striped: true, height: 460, renderTo: card });
      vivosA.push(g);
    }
    guardar(R4.create({ xtype: 'filedrop', accept: '.csv,.tsv,.txt,.json,.ndjson,.jsonl,.xlsx', maxSize: 10 * 1024 * 1024, renderTo: dropA,
      listeners: {
        files: (c, files) => { const f = files && files[0]; if (f) mostrar(f, {}); },
        invalid: (c, erros) => R4.notify({ type: 'warn', text: Array.isArray(erros) ? erros.map(e => e.message || e).join(' ') : String(erros) })
      } }));
    // exemplos prontos para testar sem ter arquivo
    const ex = el('div', { class: 'erp-bar', style: { marginTop: '8px' } }); auto.insertBefore(ex, dropA.nextSibling);
    ex.append(el('span', { class: 'erp-muted', text: 'Sem arquivo à mão? Teste com um exemplo:' }));
    const amostras = {
      'JSON: objeto com lista': () => new File([JSON.stringify({ gerado: '2026-11-17', total: 6, pedidos: [
        { numero: 1001, cliente: { nome: 'Ana Souza', cidade: 'Umuarama' }, valor: 1250.5, status: 'pago', pago: true, data: '2026-11-01' },
        { numero: 1002, cliente: { nome: 'Bruno Lima', cidade: 'Maringá' }, valor: 89.9, status: 'aberto', pago: false, data: '2026-11-03' },
        { numero: 1003, cliente: { nome: 'Carla Dias', cidade: 'Londrina' }, valor: 560, status: 'pago', pago: true, data: '2026-11-04' },
        { numero: 1004, cliente: { nome: 'Daniel Rocha', cidade: 'Maringá' }, valor: 2300.75, status: 'enviado', pago: true, data: '2026-11-07' },
        { numero: 1005, cliente: { nome: 'Elisa Nunes', cidade: 'Cascavel' }, valor: 15, status: 'cancelado', pago: false, data: '2026-11-08' },
        { numero: 1006, cliente: { nome: 'Fabio Costa', cidade: 'Londrina' }, valor: 740, status: 'aberto', pago: false, data: '2026-11-09' }] })], 'pedidos.json', { type: 'application/json' }),
      'CSV pt-BR (;)': () => new File(['produto;categoria;preço;estoque;entrada\nCafé especial;Alimentos;69,90;120;15/10/2026\nMouse sem fio;Informática;89,00;40;02/11/2026\nTeclado mecânico;Informática;349,00;12;05/11/2026\nChocolate 70%;Alimentos;18,50;300;10/11/2026\n'], 'estoque.csv', { type: 'text/csv' }),
      'JSON: objeto de objetos': () => new File([JSON.stringify({ PR: { nome: 'Paraná', regiao: 'Sul', populacao: 11444380 }, SP: { nome: 'São Paulo', regiao: 'Sudeste', populacao: 44411238 }, BA: { nome: 'Bahia', regiao: 'Nordeste', populacao: 14136417 }, AM: { nome: 'Amazonas', regiao: 'Norte', populacao: 3941613 } })], 'estados.json', { type: 'application/json' })
    };
    Object.keys(amostras).forEach(k => guardar(R4.create({ xtype: 'button', text: k, size: 'sm', renderTo: ex, handler: () => mostrar(amostras[k](), {}) })));

    /* =========================== 2) ESQUEMA FIXO (clientes) =========================== */
    const cab = el('div', { class: 'erp-bar', style: { marginBottom: '8px' } }); fixo.append(cab);
    guardar(R4.create({ xtype: 'button', text: 'Baixar modelo CSV', icon: 'download', renderTo: cab, handler: () => {
      const csv = R4.files.toCSV([
        { nome: 'Ana Souza', email: 'ana@exemplo.com', telefone: '(44) 99999-0001', cidade: 'Umuarama', uf: 'PR', tipo: 'PF', documento: '', limite: 2500 },
        { nome: 'Mercado Central Ltda', email: 'contato@mercado.example', telefone: '', cidade: 'Maringa', uf: 'PR', tipo: 'PJ', documento: '', limite: 12000 }
      ], { columns: CAMPOS, delimiter: ';', decimal: ',' });
      R4.files.download(csv, 'modelo-clientes.csv', 'text/csv');
    } }));
    fixo.append(el('p', { class: 'erp-muted', text: 'Esquema pré-determinado: o arquivo precisa ter as colunas ' + CAMPOS.join(', ') + '. Até 500 linhas por arquivo; cada linha é validada no servidor. Tudo é lido no navegador (nada sobe até você clicar em Importar).' }));
    const drop = el('div', { class: 'erp-card erp-drop' }); fixo.append(drop);
    const area = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' } }); fixo.append(area);
    let linhas = [], vivosF = [];
    const limpar = () => { vivosF.forEach(c => { try { c.destroy(); } catch (e) { /* ok */ } }); vivosF = []; area.textContent = ''; };

    guardar(R4.create({ xtype: 'filedrop', accept: '.csv,.xlsx,.json', parse: 'csv', maxSize: 1024 * 1024, renderTo: drop,
      listeners: {
        data: (c, dados, f) => preview(Array.isArray(dados) ? dados : [], f),
        invalid: (c, erros) => R4.notify({ type: 'warn', text: Array.isArray(erros) ? erros.map(e => e.message || e).join(' ') : String(erros) })
      } }));

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
      if (!linhas.length) { vivosF.push(R4.create({ xtype: 'emptystate', icon: 'file', title: 'Arquivo sem linhas', text: 'Confira o cabeçalho e o delimitador.', renderTo: area })); return; }
      const card = el('div', { class: 'erp-card' }, [el('h3', { text: 'Pré-visualização — ' + f.name + ' (' + linhas.length + ' linha(s)' + (rows.length > 500 ? ', cortado em 500' : '') + ')' })]);
      area.append(card);
      const g = R4.create({ xtype: 'grid', data: linhas, pageSize: 10, pageSizeSelector: true, pageSizes: '10,30,50,100,all', columns: CAMPOS.map(k => ({ header: k, dataIndex: k })), renderTo: card, exportable: false });
      vivosF.push(g);
      const bar = el('div', { class: 'erp-bar', style: { marginTop: '10px' } }); card.append(bar);
      const prog = R4.create({ xtype: 'progress', value: 0, label: 'Importação', renderTo: card, hidden: true }); prog.el.hidden = true; vivosF.push(prog);
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
      vivosF.push(btn);
    }
    function mostrarRejeitados(rej, ok) {
      const old = area.querySelector('.erp-rej'); old && old.remove();
      const c = el('div', { class: 'erp-card erp-rej' }, [el('h3', { text: 'Resultado: ' + ok + ' importado(s), ' + rej.length + ' rejeitado(s)' })]);
      area.append(c);
      if (!rej.length) { vivosF.push(R4.create({ xtype: 'alert', variant: 'ok', html: 'Todas as linhas foram aceitas. Veja os novos clientes na página Clientes.', renderTo: c })); return; }
      vivosF.push(R4.create({ xtype: 'grid', data: rej, pageSize: 10, filter: false, columns: [{ header: 'Linha', dataIndex: 'linha', width: 80, align: 'right' }, { header: 'Motivo', dataIndex: 'erro' }], renderTo: c }));
    }

    modo('auto');
    return () => { limparA(); limpar(); vivos.forEach(c => { try { c.destroy(); } catch (e) { /* ok */ } }); };
  } };
})();
