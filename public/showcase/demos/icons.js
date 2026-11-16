/* Demos da vitrine: icon (R4.icon, <r4-icon>, opção icon dos componentes). window.R4Demos[nome] = [{ title, html | fn(el, out) }] */
(window.R4Demos = window.R4Demos || {}).icon = [
  { title: 'Todos os ícones: busque pelo nome e clique para copiar', fn(el, out) {
    const h = R4.util.el;
    const busca = h('input', { type: 'search', class: 'r4-input', style: { maxWidth: '260px' }, placeholder: 'Buscar ícone...', 'aria-label': 'Buscar ícone' });
    const contagem = h('span', { class: 'r4-text-muted', style: { marginLeft: '10px' }, role: 'status' });
    const grade = h('div', { role: 'list', 'aria-label': 'Grade de ícones', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(104px,1fr))', gap: '8px', marginTop: '12px' } });
    const vazio = h('p', { class: 'r4-text-muted', hidden: true, text: 'Nenhum ícone com esse nome.' });
    const itens = R4.icon.names.map(nome => {
      const b = h('button', { type: 'button', class: 'r4-btn', title: "R4.icon('" + nome + "')  ·  icon=\"" + nome + '"',
        style: { flexDirection: 'column', gap: '6px', padding: '10px 4px', fontSize: '12px', justifyContent: 'center' },
        onclick: async () => {
          const codigo = "R4.icon('" + nome + "')";
          try { await navigator.clipboard.writeText(codigo + '  // ou  icon="' + nome + '"'); R4.toast('Copiado: ' + codigo); }
          catch (e) { R4.toast(R4.t('r4.copyFail')); }
          out(codigo + '\n<r4-button icon="' + nome + '">...</r4-button>');
        } }, [R4.icon(nome, { size: 26 }), h('code', { text: nome, style: { background: 'none', padding: 0, fontSize: '11px' } })]);
      const li = h('div', { role: 'listitem' }, [b]);
      li.setAttribute('data-n', nome);
      return li;
    });
    grade.append(...itens);
    const filtrar = () => {
      const q = busca.value.trim().toLowerCase();
      let n = 0;
      itens.forEach(li => { const ok = !q || li.getAttribute('data-n').includes(q); li.hidden = !ok; if (ok) n++; });
      contagem.textContent = n + ' ícones';
      vazio.hidden = n > 0;
    };
    busca.addEventListener('input', filtrar);
    filtrar();
    el.append(h('div', {}, [busca, contagem]), grade, vazio);
  } },
  { title: 'HTML: a tag <r4-icon> e a opção icon dos componentes', html: `
<p>
  <r4-icon name="home" size="20"></r4-icon>
  <r4-icon name="star-fill" size="24" title="Favorito" style="color:var(--r4-acc)"></r4-icon>
  <r4-icon name="heart" size="32" style="color:var(--r4-err)"></r4-icon>
  <r4-icon name="settings"></r4-icon> (sem size: acompanha o tamanho do texto)
</p>
<p>
  <r4-button icon="edit">Editar</r4-button>
  <r4-button icon="save" variant="primary">Salvar</r4-button>
  <r4-button icon="trash" variant="danger">Excluir</r4-button>
  <r4-button icon="★">Emoji/texto continua funcionando</r4-button>
</p>
<r4-dropdown text="Ações" icon="settings">
  <r4-item text="Editar" icon="edit" r4-click="toast:Editar"></r4-item>
  <r4-item text="Copiar" icon="copy" r4-click="toast:Copiado"></r4-item>
  <r4-item divider></r4-item>
  <r4-item text="Excluir" icon="trash" danger r4-click="toast:Excluído"></r4-item>
</r4-dropdown>
<div class="r4-flex r4-gap-2 r4-mt-3">
  <r4-stat title="Receita" value="384250.9" format="money" change="12.4" icon="dollar"></r4-stat>
  <r4-stat title="Clientes" value="1280" format="number" change="-2.3" icon="users"></r4-stat>
</div>
<r4-alert variant="ok" title="Pronto" class="r4-mt-3">Os ícones padrão por variante também são SVG (info, success, warning, error).</r4-alert>` },
  { title: 'JS: R4.icon(nome, { size, title, cls }), R4.icon.fill e R4.icon.add', fn(el, out) {
    const linha = (rotulo, node) => R4.util.el('p', {}, [node, ' ' + rotulo]);
    el.append(
      linha("R4.icon('bell')", R4.icon('bell')),
      linha("R4.icon('bell', { size: 28 })", R4.icon('bell', { size: 28 })),
      linha("R4.icon('lock', { title: 'Protegido' })  → role=\"img\" + <title>", R4.icon('lock', { title: 'Protegido' })));
    // R4.icon.fill: nome vira SVG; qualquer outro texto/emoji continua texto
    const a = R4.util.el('span'), b = R4.util.el('span');
    R4.icon.fill(a, 'mail'); R4.icon.fill(b, '✉ emoji');
    el.append(R4.util.el('p', {}, [a, " R4.icon.fill(el, 'mail')   ", b, " R4.icon.fill(el, '✉ emoji')"]));
    // ícone próprio: só comandos de path 24x24 (allowlist); o resto é recusado
    const ok = R4.icon.add('losango', 'M12 3l9 9-9 9-9-9z');
    const ruim = R4.icon.add('x', 'M0 0 L1 1 <script>');
    el.append(linha("R4.icon.add('losango', 'M12 3l9 9-9 9-9-9z')", R4.icon('losango', { size: 24 })));
    out({ losangoRegistrado: ok, pathInvalidoRecusado: ruim === false, total: R4.icon.names.length, existe: R4.icon.has('edit') });
  } },
  { title: 'JS: função rápida R4.icon(alvo, nome) e troca de ícone em botão', fn(el, out) {
    const comp = R4.icon(el, 'refresh', { size: 28 });
    const btn = R4.button(el, 'Alternar', { icon: 'play', handler: b => { b.setIcon(b.icon === 'play' ? 'pause' : 'play'); comp.setName(comp.name === 'refresh' ? 'check' : 'refresh'); } });
    out('Componente: ' + comp.xtype + ' · botão: ' + btn.xtype + ' (setIcon troca o ícone)');
  } }
];
