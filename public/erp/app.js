/* Mini ERP — shell da aplicação (libr4: treepanel, dropdown, avatar, themeswitch, i18n, notify, window, grid).
 * Cada página fica em paginas/<nome>.js e se registra em window.ErpPaginas[nome] = { titulo, icone, montar(el, ctx) }.
 * ctx = { usuario, Erp }. montar pode devolver uma função de limpeza. CSP estrita: nada inline. */
(function () {
  'use strict';
  const { el, esc } = R4.util;
  const Erp = window.Erp = {};
  const root = document.getElementById('erp-root');
  R4.i18n.add('pt-BR', { erp: { brand: 'Mini ERP', menu: 'Menu', sair: 'Sair', dashboard: 'Painel', clientes: 'Clientes', produtos: 'Produtos', pedidos: 'Pedidos', transacoes: 'Transações (2 mi)', arquivos: 'Importar arquivos', perfil: 'Meu perfil', novo: 'Novo', editar: 'Editar', excluir: 'Excluir' } });
  R4.i18n.add('en', { erp: { brand: 'Mini ERP', menu: 'Menu', sair: 'Sign out', dashboard: 'Dashboard', clientes: 'Customers', produtos: 'Products', pedidos: 'Orders', transacoes: 'Transactions (2M)', arquivos: 'Import files', perfil: 'My profile', novo: 'New', editar: 'Edit', excluir: 'Delete' } });
  const t = k => R4.t('erp.' + k);
  Erp.t = t;
  /* monta um componente num <span> e devolve o nó (para renderers de célula e barras de título) */
  Erp.mk = cfg => { const h = el('span'); R4.create(Object.assign({}, cfg, { renderTo: h })); return h; };
  Erp.badge = (text, variant, extra) => Erp.mk(Object.assign({ xtype: 'badge', text, variant, pill: true }, extra));
  window.ErpPaginas = window.ErpPaginas || {};

  /* ---------- API: 401 volta para o login ---------- */
  const sessaoExpirada = e => { if (e && e.status === 401) { location.href = '/erp/login'; return true; } return false; };
  Erp.get = async url => { try { return await R4.http.get(url); } catch (e) { sessaoExpirada(e); throw e; } };
  Erp.post = async (url, data, opts) => { try { return await R4.http.post(url, data == null ? {} : data, opts); } catch (e) { sessaoExpirada(e); throw e; } };
  Erp.falha = (e, f) => {
    const d = e && e.data;
    if (f && e && e.status === 422 && d && d.erros) { f.markErrors(d.erros); return; }
    R4.notify({ type: 'err', text: (e && e.message) || 'Falha na operação.' });
  };
  Erp.money = v => R4.i18n.money ? R4.i18n.money(+v || 0, 'BRL') : R4.util.money(+v || 0);
  Erp.num = v => R4.util.number(+v || 0);
  Erp.statusTag = s => el('span', { class: 'erp-st erp-st-' + String(s).toLowerCase(), text: String(s) });
  Erp.opcoes = async rec => { try { const r = await R4.http.get('/erp/api/' + rec + '/opcoes'); return r.retorno || r; } catch (e) { sessaoExpirada(e); return {}; } };
  Erp.titulo = (alvo, texto, extras) => {
    const h = el('div', { class: 'erp-page-title' }, [el('h2', { text: texto }), el('span', { class: 'erp-fill' })]);
    (extras || []).forEach(x => h.append(x));
    alvo.append(h); return h;
  };
  Erp.card = (alvo, titulo, filho) => {
    const c = el('div', { class: 'erp-card' }); if (titulo) c.append(el('h3', { text: titulo }));
    if (filho) c.append(filho); alvo.append(c); return c;
  };

  /* Opções comuns de grid remoto (paginação, ordenação, busca e destaque no servidor). */
  Erp.gridOpts = (extra) => {
    const o = Object.assign({
      xtype: 'grid', remote: true, pageSize: 10, pageSizeSelector: true, pageSizes: '10,30,50,100,all', filter: true,
      exportable: true, columnMenu: true, resizable: true, striped: true,
      listeners: { loaderror: (g, e) => { if (e && /HTTP 401/.test(e.message || '')) location.href = '/erp/login'; } }
    }, extra);
    // coluna com `filtrar: true` ganha o funil de valores (marcar "pago", "aberto"...): os valores e as contagens vêm de <src>/valores
    (o.columns || []).forEach(c => { if (c.filtrar) { c.filterValues = true; c.optionsUrl = o.src + '/valores'; } });
    return o;
  };

  /* ---------- CRUD genérico (clientes, produtos, pedidos) ---------- */
  Erp.crud = function (o) {
    return (alvo, ctx) => {
      const sel = { rows: [] };
      const barra = el('div', { class: 'erp-bar' });
      Erp.titulo(alvo, o.titulo, []);
      alvo.append(barra);
      const holder = el('div', { class: 'erp-card' }); alvo.append(holder);
      const btnNovo = R4.create({ xtype: 'button', text: t('novo'), icon: 'plus', variant: 'primary', renderTo: barra, handler: () => abrir(null) });
      const btnEd = R4.create({ xtype: 'button', text: t('editar'), icon: 'edit', disabled: true, renderTo: barra, handler: () => sel.rows[0] && abrir(sel.rows[0]) });
      const btnEx = R4.create({ xtype: 'button', text: t('excluir'), icon: 'trash', disabled: true, renderTo: barra, handler: () => excluir(sel.rows) });
      const info = el('span', { class: 'erp-muted', text: 'Duplo clique em uma linha para editar.' });
      barra.append(info);
      const grid = R4.create(Erp.gridOpts({
        src: '/erp/api/' + o.recurso, columns: o.columns, selectable: 'multi', renderTo: holder,
        listeners: {
          loaderror: (g, e) => { if (e && /HTTP 401/.test(e.message || '')) location.href = '/erp/login'; },
          selectionchange: (g, rows) => { sel.rows = rows; btnEd.setDisabled(rows.length !== 1); btnEx.setDisabled(!rows.length); info.textContent = rows.length ? rows.length + ' selecionado(s)' : 'Duplo clique em uma linha para editar.'; },
          rowdblclick: (g, row) => abrir(row)
        }
      }));

      async function abrir(row) {
        const op = await Erp.opcoes(o.recurso);
        const win = R4.create({ xtype: 'window', title: (row ? t('editar') : t('novo')) + ' — ' + o.singular, width: 620 });
        const f = {
          xtype: 'form', submitText: 'Salvar', resetText: '', values: row ? o.paraForm(row) : (o.padrao || {}),
          fields: o.campos(op), buttons: [
            { text: 'Cancelar', handler: () => win.close() },
            { text: 'Salvar', variant: 'primary', action: 'submit' }
          ],
          listeners: { submit: async (form, v) => {
            try {
              const corpo = o.paraApi ? o.paraApi(v) : v;
              if (row) corpo.id = row.id;
              await Erp.post('/erp/api/' + o.recurso + '/salvar', corpo);
              R4.notify({ type: 'ok', text: o.singular + (row ? ' atualizado.' : ' criado.') });
              win.close(); grid.reload(); grid.clearSelection();
            } catch (e) { Erp.falha(e, form); }
          } }
        };
        win.items = [f];
        win.show();
      }
      function excluir(rows) {
        if (!rows.length) return;
        R4.msg.confirm('Excluir', 'Excluir ' + rows.length + ' registro(s) de ' + o.titulo.toLowerCase() + '? Esta ação não pode ser desfeita.', async ok => {
          if (!ok) return;
          let feitos = 0;
          for (const r of rows) { try { await Erp.post('/erp/api/' + o.recurso + '/excluir', { id: r.id }); feitos++; } catch (e) { Erp.falha(e); break; } }
          R4.notify({ type: feitos === rows.length ? 'ok' : 'warn', text: feitos + ' de ' + rows.length + ' excluído(s).' });
          grid.clearSelection(); grid.reload();
        });
      }
      return () => { try { grid.destroy(); btnNovo.destroy(); btnEd.destroy(); btnEx.destroy(); } catch (e) { /* já destruído */ } };
    };
  };

  /* ---------- shell ---------- */
  const ORDEM = ['dashboard', 'clientes', 'produtos', 'pedidos', 'transacoes', 'arquivos', 'perfil'];
  let usuario = null, shell = null, limpeza = null, tree = null, main = null, atual = '';

  function nome() { const h = (location.hash || '').replace(/^#\/?/, ''); return ORDEM.includes(h) ? h : 'dashboard'; }

  function montarPagina() {
    const n = nome(), pg = window.ErpPaginas[n];
    if (typeof limpeza === 'function') { try { limpeza(); } catch (e) { /* ignora */ } }
    limpeza = null; main.textContent = ''; atual = n;
    if (tree && tree.nodeEls && tree.nodeEls[n]) tree.select(n, true);
    shell.classList.remove('erp-open');
    if (!pg) { main.append(el('p', { class: 'erp-muted', text: 'Página não encontrada.' })); return; }
    document.title = t(n) + ' — Mini ERP';
    try { limpeza = pg.montar(main, { usuario, Erp }) || null; }
    catch (e) { console.error('[erp]', n, e); R4.notify({ type: 'err', text: 'Falha ao abrir a página.' }); }
  }

  async function sair() {
    try { await R4.http.post('/erp/api/logout', {}); } catch (e) { /* já saiu */ }
    location.href = '/erp/login';
  }

  function montarShell() {
    root.textContent = '';
    if (typeof limpeza === 'function') { try { limpeza(); } catch (e) { /* ignora */ } limpeza = null; }
    const nodes = ORDEM.map(k => ({ id: k, text: t(k) }));
    shell = el('div', { class: 'erp-shell' });
    const top = el('div', { class: 'erp-top' });
    const menuBtn = el('button', { type: 'button', class: 'r4-btn erp-menu-btn', 'aria-label': t('menu') }, [R4.icon('list')]);
    menuBtn.addEventListener('click', () => shell.classList.toggle('erp-open'));
    top.append(menuBtn, el('div', { class: 'erp-brand' }, [R4.icon('chart-bar', { size: 20 }), el('span', { text: t('brand') })]), el('span', { class: 'erp-fill' }));
    R4.create({ xtype: 'themeswitch', presets: false, renderTo: top });
    const idioma = el('div', { class: 'r4-btn-group' });
    ['pt-BR', 'en'].forEach(l => {
      const b = el('button', { type: 'button', class: 'r4-btn' + (R4.i18n.locale === l ? ' r4-btn-primary' : ''), text: l === 'en' ? 'EN' : 'PT', 'aria-pressed': String(R4.i18n.locale === l) });
      b.addEventListener('click', () => { R4.i18n.set(l); Erp.post('/erp/api/perfil', { nome: usuario.nome, tema: usuario.tema || 'auto', idioma: l }).catch(() => {}); });
      idioma.append(b);
    });
    top.append(idioma);
    const quem = el('div', { class: 'erp-user' }, [
      Erp.mk({ xtype: 'avatar', name: usuario.nome, src: usuario.avatar || '', size: 'sm' }),
      el('div', { class: 'erp-user-txt' }, [el('span', { text: usuario.nome }), el('small', { text: usuario.cargo })])
    ]);
    top.append(quem);
    R4.create({ xtype: 'dropdown', text: '', icon: 'settings', align: 'right', renderTo: top, items: [
      { text: t('perfil'), icon: 'user', handler: () => { location.hash = '#/perfil'; } },
      '-',
      { text: t('sair'), icon: 'arrow-right', handler: sair }
    ] });
    const side = el('div', { class: 'erp-side' });
    tree = R4.create({ xtype: 'treepanel', nodes, filterable: false, renderTo: side, listeners: { select: (tr, n) => { location.hash = '#/' + n.id; } } });
    main = el('div', { class: 'erp-main' });
    shell.append(top, side, main);
    root.append(shell);
    montarPagina();
  }

  async function iniciar() {
    root.append(el('div', { class: 'erp-card', style: { margin: '24px' } }, [Erp.mk({ xtype: 'spinner', text: 'Carregando...' })]));
    try { const r = await R4.http.get('/erp/api/eu'); usuario = r.retorno ? (r.retorno.usuario || r.retorno) : (r.usuario || r); }
    catch (e) { if (!sessaoExpirada(e)) root.textContent = 'Não foi possível carregar o aplicativo.'; return; }
    if (usuario && usuario.idioma && usuario.idioma !== R4.i18n.locale && ['pt-BR', 'en'].includes(usuario.idioma)) R4.i18n.set(usuario.idioma);
    Erp.usuario = () => usuario;
    Erp.atualizarUsuario = u => { usuario = Object.assign(usuario, u); montarShell(); };
    montarShell();
    window.addEventListener('hashchange', () => { if (nome() !== atual) montarPagina(); });
    R4.i18n.onChange(() => montarShell());
  }
  iniciar();
})();
