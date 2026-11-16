/* Demos da vitrine: R4.store (armazenamento com validade, validação e lixeira) e abas persistentes. Use window.R4Demos[nome] = [{ title, fn(el, out) }] */
(window.R4Demos = window.R4Demos || {}).store = [
  { title: 'Guardar com validade (TTL) e ler de volta — recarregue a página e rode de novo', fn(el, out) {
    // grava de verdade no localStorage (chave r4:demo.visitas); a validade de 1 h é renovada a cada leitura (sliding)
    const visitas = (R4.store.get('demo.visitas', { schema: v => (typeof v === 'number' && v >= 0 && v < 1e9 ? v : undefined), fallback: 0 })) + 1;
    R4.store.set('demo.visitas', visitas, { ttl: '1h', sliding: true });
    out({ visitas, validade: '1 hora, renovada a cada leitura', chavesDemo: R4.store.keys('demo.'), stats: R4.store.stats() });
    el.append(R4.util.el('button', { class: 'r4-btn', type: 'button', text: 'Apagar as chaves demo.*', onclick: () => out({ apagadas: R4.store.clear('demo.') }) }));
  } },

  { title: 'Validar o que é lido com um esquema (dado fora do esquema é descartado e a chave apagada)', fn(el, out) {
    const s = R4.store.create();                       // armazenamento só em memória: não mexe no seu localStorage
    s.set('perfil', { nome: 'Ana', idade: 30, admin: true });
    const esquema = { nome: { t: 'string', max: 40 }, idade: { t: 'number', min: 0, max: 130 }, 'cidade': 'string?' };
    const bom = s.get('perfil', { schema: esquema });          // só os campos do esquema voltam (admin some)
    s.set('perfil', { nome: 'Ana', idade: 'trinta' });         // idade com tipo errado
    const ruim = s.get('perfil', { schema: esquema, fallback: 'descartado' });
    out({ bom, ruim, aindaExiste: s.has('perfil'), motivoDaLixeira: 'schema' });
    el.append(R4.util.el('p', { class: 'r4-text-muted', text: 'Também aceita função: schema: v => (valor válido ? v : undefined).' }));
  } },

  { title: 'O que o store recusa: segredos, chaves e valores perigosos (nada é gravado)', fn(el, out) {
    const s = R4.store.create();
    const ciclo = { a: 1 }; ciclo.eu = ciclo;
    const resultado = {
      'chave "meu.token"': s.set('meu.token', 'abc'),
      'chave "senha"': s.set('senha', '123'),
      'chave com espaço': s.set('a b', 1),
      'função': s.set('f', () => 1),
      'referência circular': s.set('c', ciclo),
      'Date (não é JSON puro)': s.set('d', new Date()),
      'valor de 40 KB (limite 32 KB)': s.set('g', 'x'.repeat(40000)),
      'objeto normal': s.set('ok', { a: 1 })
    };
    s.set('p', JSON.parse('{"__proto__":{"pwn":1},"n":1}'));
    out({ resultado, protoPoluido: ({}).pwn === undefined ? 'não (chave __proto__ ignorada)' : 'SIM', guardado: s.get('p') });
    el.append(R4.util.el('p', { class: 'r4-text-muted', text: 'Veja os avisos [R4.store] no console. NUNCA guarde token, senha ou dado pessoal no navegador.' }));
  } },

  { title: 'A lixeira em ação (relógio simulado): expira, varre e expulsa os menos usados', fn(el, out) {
    const s = R4.store.create({ maxKeys: 10, maxBytes: 100000 });
    let agora = Date.now();
    s._agora = () => agora;                            // relógio simulado só deste armazenamento
    const relatorio = {};
    for (let i = 0; i < 6; i++) s.set('item' + i, { i }, { ttl: i < 3 ? '1h' : '30d' });
    relatorio.criados = s.keys().length;
    agora += 2 * 3600 * 1000;                          // 2 horas depois
    relatorio.lidoExpirado = s.get('item0', { fallback: 'expirou e foi apagado na leitura' });
    relatorio.varredura = s.sweep();                   // apaga os outros 2 expirados
    for (let i = 0; i < 20; i++) { agora += 1000; s.set('extra' + i, { i }); }   // passa de 10 chaves: expulsa as menos usadas (LRU) até 80%
    relatorio.depoisDoExcesso = { chaves: s.keys().length, limite: 10, stats: s.stats() };
    out(relatorio);
  } },

  { title: 'Abas que sobrevivem ao recarregar (tabpanel persist) — abra abas, recarregue a página e rode de novo', fn(el, out) {
    const barra = R4.util.el('div', { class: 'r4-flex r4-wrap r4-gap-2 r4-mb-2' });
    const palco = R4.util.el('div', { style: { height: '150px', border: '1px solid var(--r4-line)', borderRadius: 'var(--r4-radius)', overflow: 'hidden' } });
    el.append(barra, palco);
    const PERMITIDAS = { resumo: 'Resumo', detalhes: 'Detalhes', extras: 'Extras' };    // lista permitida: qualquer outra chave salva é descartada
    const cfgAba = k => ({ title: PERMITIDAS[k], key: k, closable: true, html: 'Conteúdo da aba <b>' + R4.util.esc(PERMITIDAS[k]) + '</b>.' });
    const abas = R4.create({ xtype: 'tabpanel', renderTo: palco, persist: 'demo.abas', persistTtl: '1h', maxTabs: 5,
      items: [{ title: 'Início', key: 'inicio', html: 'Abra abas, recarregue a página e rode este exemplo de novo.' }] });
    const voltaram = abas.restoreSaved(s => (Object.prototype.hasOwnProperty.call(PERMITIDAS, s.key) ? cfgAba(s.key) : null));
    const mostra = () => { abas.saveState(); out({ restauradas: voltaram, salvo: abas.getSavedState() }); };
    Object.keys(PERMITIDAS).forEach(k => barra.append(R4.util.el('button', { class: 'r4-btn', type: 'button', text: 'Abrir ' + PERMITIDAS[k],
      onclick: () => { abas.find(k) ? abas.setActive(abas.find(k)) : abas.add(cfgAba(k)); mostra(); } })));
    barra.append(R4.util.el('button', { class: 'r4-btn', type: 'button', text: 'Apagar o estado salvo', onclick: () => { abas.clearSaved(); out({ salvo: abas.getSavedState() }); } }));
    mostra();
  } }
];
