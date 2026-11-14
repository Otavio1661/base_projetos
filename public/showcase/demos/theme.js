/* Demos da vitrine: theme (R4.theme, themeswitch) e i18n. Use window.R4Demos[nome] = [{ title, html | fn(el, out) }] */
(window.R4Demos = window.R4Demos || {}).themeswitch = [
  { title: 'Alternador pronto (tag)', html: `<r4-themeswitch picker></r4-themeswitch>
<r4-div cols="3" gap="12" class="r4-mt-3">
  <div class="r4-card"><b>Cartão</b><p class="r4-text-muted">Muda de cor, raio e densidade ao vivo.</p><r4-button variant="primary">Primário</r4-button></div>
  <div class="r4-card"><label class="r4-label">Campo</label><input class="r4-input" placeholder="Digite..."></div>
  <div class="r4-card"><span class="r4-tag">tag</span> <span class="r4-text-primary r4-bold">destaque</span></div>
</r4-div>` },
  { title: 'Função rápida', fn(el, out) {
    el.innerHTML = '<div id="ts-alvo"></div>';
    const ts = R4.themeswitch('#ts-alvo', { picker: true });
    out('Tema atual: ' + JSON.stringify(R4.theme.get()));
  } },
  { title: 'Só botões de modo', html: `<r4-themeswitch presets="false"></r4-themeswitch>` }
];

(window.R4Demos = window.R4Demos || {}).theme = [
  { title: 'Ao vivo: preset, modo, cor, raio e densidade', fn(el, out) {
    const { el: h } = R4.util;
    const bar = h('div', { class: 'r4-flex r4-wrap r4-gap-2 r4-items-center' });
    Object.keys(R4.theme.presets).forEach(n => bar.append(h('button', { class: 'r4-btn', type: 'button', text: n, onclick: () => R4.theme.preset(n) })));
    const color = h('input', { type: 'color', value: '#3b5bdb', 'aria-label': 'Cor primária' });
    color.addEventListener('input', () => R4.theme.set({ primary: color.value }));
    const radius = h('input', { type: 'range', min: 0, max: 24, value: 6, 'aria-label': 'Raio' });
    radius.addEventListener('input', () => R4.theme.set({ radius: Number(radius.value) }));
    const dens = h('select', { class: 'r4-input', style: { width: 'auto' }, 'aria-label': 'Densidade' },
      ['compact', 'normal', 'comfortable'].map(d => h('option', { value: d, text: d, selected: d === 'normal' })));
    dens.addEventListener('change', () => R4.theme.set({ density: dens.value }));
    const modes = h('div', { class: 'r4-flex r4-gap-2 r4-mt-2' }, ['light', 'dark', 'auto'].map(m =>
      h('button', { class: 'r4-btn', type: 'button', text: m, onclick: () => R4.theme.set({ mode: m }) })));
    const reset = h('button', { class: 'r4-btn r4-btn-danger', type: 'button', text: 'Restaurar tema original', onclick: () => R4.theme.reset() });
    const sample = h('div', { class: 'r4-mt-3' });
    el.append(bar, h('div', { class: 'r4-flex r4-wrap r4-gap-3 r4-items-center r4-mt-2' }, [color, radius, dens, reset]), modes, sample);
    R4.render(sample, `<r4-div cols="2" gap="16">
      <div class="r4-card"><b>Botões e campos</b><div class="r4-flex r4-gap-2 r4-mt-2"><r4-button variant="primary">Salvar</r4-button><r4-button>Cancelar</r4-button><r4-button variant="danger">Excluir</r4-button></div>
        <input class="r4-input r4-mt-2" placeholder="Campo de texto"></div>
      <r4-grid src="/showcase/vitrineData/clientes.json" page-size="4" filter="false">
        <r4-col field="nome" header="Nome"></r4-col><r4-col field="cidade" header="Cidade"></r4-col>
      </r4-grid></r4-div>`);
    const off = R4.theme.onChange(s => { if (!el.isConnected) return off(); out(JSON.stringify(s, null, 2)); });
    out(JSON.stringify(R4.theme.get(), null, 2));
  } },
  { title: 'Contraste WCAG e texto automático sobre o primário', fn(el, out) {
    el.innerHTML = '<input type="color" id="ct-cor" value="#e8590c" aria-label="Cor"> <span id="ct-box" class="r4-tag" style="padding:8px 16px">Texto sobre a cor</span>';
    const inp = el.querySelector('#ct-cor'), box = el.querySelector('#ct-box');
    const run = () => {
      const on = R4.theme.textOn(inp.value);
      box.style.background = inp.value; box.style.color = on.color;
      out({ cor: inp.value, textoEscolhido: on.color, contraste: +on.ratio.toFixed(2), AA: on.ratio >= 4.5,
        '#000 sobre #fff': R4.theme.contrast('#000', '#fff'), '#777 sobre #fff': +R4.theme.contrast('#777', '#fff').toFixed(2) });
    };
    inp.addEventListener('input', run); run();
  } },
  { title: 'Entrada validada (rejeita injeção de CSS)', fn(el, out) {
    const r = R4.theme.validate({ primary: 'red;}body{display:none', radius: '8;}', density: 'gigante', font: 'x;}*{display:none', mode: 'dark' });
    out(r);   // só "mode" é válido; nada disso chega ao <style id="r4-theme">
  } }
];

(window.R4Demos = window.R4Demos || {}).i18n = [
  { title: 'Trocar idioma: R4.t, <r4-t>, plural e formatos', fn(el, out) {
    const { el: h } = R4.util;
    const bar = h('div', { class: 'r4-flex r4-gap-2' }, ['pt-BR', 'en'].map(l =>
      h('button', { class: 'r4-btn', type: 'button', text: l, onclick: () => R4.i18n.set(l) })));
    const n = h('input', { type: 'number', class: 'r4-input', value: 1, min: 0, style: { width: '90px' }, 'aria-label': 'Quantidade' });
    const view = h('div', { class: 'r4-card r4-mt-3' });
    el.append(bar, h('div', { class: 'r4-mt-2' }, [n]), view);
    const draw = () => {
      view.innerHTML = '';
      const rows = [
        ['R4.t("r4.empty")', R4.t('r4.empty')],
        ['R4.t("r4.items", {n})', R4.t('r4.items', { n: n.value })],
        ['R4.t("r4.error", {message})', R4.t('r4.error', { message: 'x' })],
        ['<r4-t key="r4.copied">', '<r4-t key="r4.copied"></r4-t>'],
        ['<r4-t key="r4.items" n>', '<r4-t key="r4.items" n="' + Number(n.value) + '"></r4-t>'],
        ['r4-i18n (placeholder)', '<input class="r4-input" r4-i18n="placeholder:r4.search" style="max-width:200px">'],
        ['number(1234567.891)', R4.i18n.number(1234567.891)],
        ['money(1234.5)', R4.i18n.money(1234.5)],
        ['date("2026-03-09")', R4.i18n.date('2026-03-09', { dateStyle: 'long' })]
      ];
      const tbl = h('table', { class: 'r4-table' });
      rows.forEach(([k, v]) => {
        const td = h('td'); if (v.charAt(0) === '<') td.innerHTML = v; else td.textContent = v;
        tbl.append(h('tr', {}, [h('td', {}, [h('code', { text: k })]), td]));
      });
      view.append(tbl);
      R4.i18n.bind(view);
    };
    n.addEventListener('input', draw);
    const off = R4.i18n.onChange(() => { if (!el.isConnected) return off(); draw(); });
    draw();
    out('Idioma atual: ' + R4.i18n.locale + ' (o <html lang> também muda)');
  } },
  { title: 'Adicionar um idioma e mensagens próprias', fn(el, out) {
    R4.i18n.add('pt-BR', { app: { ola: 'Olá, {nome}!', msgs: { um: '{n} mensagem', outros: '{n} mensagens' } } });
    R4.i18n.add('en', { app: { ola: 'Hello, {nome}!', msgs: { one: '{n} message', other: '{n} messages' } } });
    el.innerHTML = '<p><r4-t key="app.ola" params=\'{"nome":"Ana"}\'></r4-t></p><p><r4-t key="app.msgs" n="3"></r4-t></p>';
    out(R4.t('app.ola', { nome: 'Ana' }) + ' | ' + R4.t('app.msgs', { n: 1 }) + ' | ' + R4.t('app.msgs', { n: 5 }));
  } },
  { title: 'Todas as chaves r4.* da biblioteca', fn(el, out) {
    out(['r4.ok', 'r4.cancel', 'r4.yes', 'r4.confirm', 'r4.notice', 'r4.copied', 'r4.empty', 'r4.filter', 'r4.search', 'r4.loadFail', 'r4.pager.info']
      .map(k => k + ' = ' + R4.t(k, { n: 2, page: 1, pages: 3 })).join('\n'));
  } }
];
