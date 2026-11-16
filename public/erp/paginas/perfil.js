/* Meu perfil: form (nome, tema, idioma), upload de avatar, tabs, store (preferências por usuário). */
(function () {
  'use strict';
  const { el } = R4.util;
  window.ErpPaginas.perfil = { titulo: 'Meu perfil', icone: 'user', montar(alvo, ctx) {
    const { Erp } = ctx, u = Erp.usuario();
    Erp.titulo(alvo, Erp.t('perfil'), []);
    const wrap = el('div', { class: 'erp-card', style: { maxWidth: '720px' } }); alvo.append(wrap);
    const topo = el('div', { class: 'erp-avatar-line' }); wrap.append(topo);
    const av = R4.create({ xtype: 'avatar', name: u.nome, src: u.avatar || '', size: 'xl', renderTo: topo });
    topo.append(el('div', {}, [el('strong', { text: u.nome }), el('div', { class: 'erp-muted', text: u.email + ' · ' + u.cargo }), el('div', { class: 'erp-muted', text: 'Conta criada em ' + R4.util.date(u.criadoEm) })]));

    const dados = {
      title: 'Dados', items: [{ xtype: 'form', id: 'erp-form-perfil', submitText: 'Salvar', resetText: '',
        values: { nome: u.nome, tema: u.tema || 'auto', idioma: u.idioma || 'pt-BR' },
        fields: [
          { type: 'text', name: 'nome', label: 'Nome', required: true, minLength: 3, maxLength: 120 },
          { type: 'row', items: [
            { type: 'select', name: 'tema', label: 'Tema', options: [{ value: 'light', text: 'Claro' }, { value: 'dark', text: 'Escuro' }, { value: 'auto', text: 'Automático' }] },
            { type: 'select', name: 'idioma', label: 'Idioma', options: [{ value: 'pt-BR', text: 'Português' }, { value: 'en', text: 'English' }] }
          ] }
        ],
        listeners: { submit: async (f, v) => {
          try {
            const r = await Erp.post('/erp/api/perfil', { nome: v.nome, tema: v.tema, idioma: v.idioma });
            const novo = (r.retorno && r.retorno.usuario) || r.usuario || { nome: v.nome, tema: v.tema, idioma: v.idioma };
            R4.theme.set({ mode: v.tema });
            R4.notify({ type: 'ok', text: 'Perfil salvo.' });
            if (v.idioma !== R4.i18n.locale) R4.i18n.set(v.idioma);
            Erp.atualizarUsuario(novo);
          } catch (e) { Erp.falha(e, f); }
        } } }] };

    const fotoBox = { title: 'Foto', html: '<p class="erp-muted">PNG, JPG ou WebP até 1 MB. O envio passa pela validação do servidor (tipo, tamanho e conteúdo).</p><div id="erp-avatar-drop"></div>' };
    const tabs = R4.create({ xtype: 'tabpanel', items: [dados, fotoBox], renderTo: wrap });
    const alvoDrop = wrap.querySelector('#erp-avatar-drop');
    const fd = R4.create({ xtype: 'filedrop', accept: '.png,.jpg,.jpeg,.webp', maxSize: 1024 * 1024, text: 'Arraste a foto aqui', renderTo: alvoDrop,
      listeners: {
        files: async (c, files) => {
          const f = files && files[0]; if (!f) return;
          const fdata = new FormData(); fdata.append('arquivo', f);
          try {
            const res = await fetch('/erp/api/avatar', { method: 'POST', credentials: 'same-origin', body: fdata });
            const j = await res.json().catch(() => ({}));
            if (res.status === 401) { location.href = '/erp/login'; return; }
            if (!res.ok) throw new Error(j.retorno || 'Falha no envio');
            const url = (j.retorno && j.retorno.url) || j.url;
            R4.notify({ type: 'ok', text: 'Foto atualizada.' });
            Erp.atualizarUsuario({ avatar: url });
          } catch (e) { R4.notify({ type: 'err', text: e.message }); }
        },
        invalid: (c, erros) => R4.notify({ type: 'warn', text: Array.isArray(erros) ? erros.map(e => e.message || e).join(' ') : String(erros) })
      } });
    // preferência local por usuário (R4.store): lembra a última aba aberta
    try { const s = R4.store && R4.store.get && R4.store.get('erp:perfil:aba'); if (s === 1) tabs.setActive(1); tabs.on('tabchange', (tp, tb) => { R4.store.set && R4.store.set('erp:perfil:aba', tp.tabs.indexOf(tb)); }); } catch (e) { /* sem store */ }
    return () => { [fd, tabs, av].forEach(c => { try { c.destroy(); } catch (e) { /* ok */ } }); };
  } };
})();
