/* suíte theme: validação (rejeita CSS malicioso), contraste WCAG, modo auto com matchMedia, persistência (inclusive com localStorage bloqueado) e themeswitch */
(() => {
  const { suite, test, assert } = R4Test;
  const css = () => (document.getElementById('r4-theme') || {}).textContent || '';
  const KEY = 'r4-theme';
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const dark = () => document.documentElement.classList.contains('r4-dark');

  suite('theme', () => {
    // o tema é global (a própria página de testes usa): cada teste volta ao estado anterior
    let guardado;
    beforeEach(() => { guardado = { st: R4.theme.get(), raw: lsGet(KEY), dark: dark(), tem: !!document.getElementById('r4-theme') }; });
    afterEach(() => {
      R4.theme.reset();
      if (guardado.raw != null) try { localStorage.setItem(KEY, guardado.raw); } catch (e) { /* */ }
      if (guardado.tem || guardado.raw != null) { const s = guardado.st; R4.theme.set({ mode: s.mode, primary: s.primary, radius: s.radius, density: s.density, font: s.font }, { persist: false, reason: 'teste' }); }
      document.documentElement.classList.toggle('r4-dark', guardado.dark);
    });

    test('validate(): aceita cores hex/rgb e valores certos; recusa injeção de CSS campo a campo', t => {
      assert.deepEq(R4.theme.validate({ primary: '#3b5bdb', radius: 8, density: 'compact', mode: 'auto', font: 'Segoe UI, Arial' }), { ok: true, errors: {} });
      assert.eq(R4.theme.validate({ primary: 'rgb(59, 91, 219)' }).ok, true);
      assert.eq(R4.theme.validate({ primary: '#abc' }).ok, true);
      const ruim = R4.theme.validate({ primary: 'red;}body{display:none', font: 'x;}*{display:none', radius: '5px;}*{x:y}', density: '__proto__', mode: 'dark;}' });
      assert.eq(ruim.ok, false);
      ['primary', 'font', 'density', 'mode'].forEach(k => assert.ok(ruim.errors[k], k + ' recusado'));
      assert.eq(R4.theme.validate({ primary: 'red' }).ok, false, 'nome de cor CSS não é aceito (só hex/rgb)');
      assert.eq(R4.theme.validate({ primary: 'rgb(300,0,0)' }).ok, false, 'canal acima de 255');
      assert.eq(R4.theme.validate({ primary: 'url(javascript:1)' }).ok, false);
      assert.deepEq(R4.theme.validate(null), { ok: true, errors: {} }, 'sem config: nada a recusar');
    });

    test('set(): aplica os tokens --r4-* num <style id="r4-theme">, atualiza get() e liga/desliga r4-dark', t => {
      R4.theme.reset();
      assert.eq(document.getElementById('r4-theme'), null, 'reset remove o estilo');
      R4.theme.set({ primary: '#e8590c', radius: 10, density: 'compact', font: 'Georgia, Arial' }, { persist: false });
      const c = css();
      assert.contains(c, '--r4-acc:#e8590c');
      assert.contains(c, '--r4-radius:10px');
      assert.contains(c, '--r4-density:0.75', 'densidade compacta');
      assert.contains(c, '--r4-font:Georgia,Arial');
      assert.contains(c, ':root.r4-dark{', 'tokens do modo escuro também');
      assert.contains(c, '--r4-pad-y:calc(6px * var(--r4-density))');
      const st = R4.theme.get();
      assert.eq(st.primary, '#e8590c');
      assert.eq(st.radius, 10);
      assert.eq(st.density, 'compact');
      assert.eq(st.preset, null, 'cor própria: sem preset');
      R4.theme.set({ mode: 'dark' }, { persist: false });
      assert.eq(dark(), true);
      assert.eq(R4.theme.isDark(), true);
      assert.eq(R4.theme.get().dark, true);
      R4.theme.set({ mode: 'light' }, { persist: false });
      assert.eq(dark(), false);
      assert.eq(R4.theme.isDark(), false);
      R4.theme.set({ radius: 99 }, { persist: false });
      assert.eq(R4.theme.get().radius, 24, 'raio limitado a 24');
      R4.theme.set({ radius: -5 }, { persist: false });
      assert.eq(R4.theme.get().radius, 0, 'e a 0');
    });

    test('set() com payloads de injeção ignora os campos ruins (com aviso), aplica os bons e nunca escreve CSS perigoso', t => {
      R4.theme.set({ primary: 'red;}body{display:none', font: 'x;}*{display:none', radius: '5px;}*{x:y}', density: '__proto__', mode: 'dark;}' }, { persist: false });
      R4.theme.set({ preset: '__proto__' }, { persist: false });
      R4.theme.preset('constructor');
      const c = css();
      assert.notOk(/display:none|\*\{|x:y/.test(c), 'nenhum CSS injetado: ' + c.slice(0, 120));
      assert.notEq(R4.theme.get().preset, '__proto__');
      assert.notEq(R4.theme.get().preset, 'constructor');
      assert.gt(t.logs.take('warn').filter(m => m.includes('ignorado')).length, 3, 'um aviso por campo recusado');
      R4.theme.set({ primary: '#0b7d55', font: 'Evil;}*{x:y' }, { persist: false });
      assert.eq(R4.theme.get().primary, '#0b7d55', 'campo bom é aplicado mesmo com outro ruim');
      assert.eq(R4.theme.get().font, '');
      assert.notContains(css(), 'x:y');
      assert.eq({}.pwnTheme, undefined);
    });

    test('presets: aplica cor e raio, preset desconhecido avisa, editar a cor tira o rótulo do preset', t => {
      assert.deepEq(Object.keys(R4.theme.presets), ['R4 Azul', 'Esmeralda', 'Laranja', 'Grafite', 'Violeta']);
      R4.theme.preset('Esmeralda');
      const st = R4.theme.get();
      assert.eq(st.preset, 'Esmeralda');
      assert.eq(st.primary, R4.theme.presets.Esmeralda.primary);
      assert.eq(st.radius, R4.theme.presets.Esmeralda.radius);
      assert.contains(css(), '--r4-acc:' + R4.theme.presets.Esmeralda.primary);
      R4.theme.preset('não existe');
      assert.contains(t.logs.take('warn').join('|'), 'não existe');
      assert.eq(R4.theme.get().preset, 'Esmeralda', 'preset inexistente não muda nada');
      R4.theme.set({ primary: '#123456' });
      assert.eq(R4.theme.get().preset, null);
      R4.theme.presets.R4t = { primary: '#d6336c', radius: 6 };
      t.cleanup(() => { delete R4.theme.presets.R4t; });
      R4.theme.preset('R4t');
      assert.eq(R4.theme.get().primary, '#d6336c', 'preset próprio adicionado em R4.theme.presets');
    });

    test('contraste WCAG: contrast(), parseColor() e textOn() escolhem texto claro ou escuro legível', t => {
      assert.eq(R4.theme.contrast('#000', '#fff'), 21);
      assert.eq(R4.theme.contrast('#fff', '#fff'), 1);
      assert.near(R4.theme.contrast('#777777', '#ffffff'), 4.48, 0.02, '#777 sobre branco é ~4.48');
      assert.gt(R4.theme.contrast('#767676', '#fff'), 4.5, '#767676 já passa AA');
      assert.near(R4.theme.contrast('#3b5bdb', '#ffffff'), R4.theme.contrast('#ffffff', '#3b5bdb'), 1e-9, 'simétrico');
      assert.deepEq(R4.theme.parseColor('#abc'), [170, 187, 204]);
      assert.deepEq(R4.theme.parseColor('#aabbcc'), [170, 187, 204]);
      assert.deepEq(R4.theme.parseColor('rgb(1,2,3)'), [1, 2, 3]);
      assert.eq(R4.theme.parseColor('red'), null);
      assert.eq(R4.theme.parseColor('rgb(300,0,0)'), null);
      assert.eq(R4.theme.parseColor(5), null);
      const sobreBranco = R4.theme.textOn('#ffffff'), sobrePreto = R4.theme.textOn('#000000');
      assert.eq(sobrePreto.color, '#ffffff', 'fundo preto: texto claro');
      assert.notEq(sobreBranco.color, '#ffffff', 'fundo branco: texto escuro');
      assert.gt(sobreBranco.ratio, 4.5);
      assert.gt(sobrePreto.ratio, 4.5);
      ['#3b5bdb', '#e8590c', '#ffeb3b', '#0b7d55', '#7048e8', '#212529'].forEach(c => assert.gt(R4.theme.textOn(c).ratio, 4.5, 'texto sobre ' + c + ' legível'));
    });

    test('--r4-acc-txt acompanha a cor primária (amarelo → texto escuro) e cor sem contraste gera aviso', t => {
      R4.theme.set({ primary: '#ffeb3b' }, { persist: false });
      assert.contains(css(), '--r4-acc-txt:' + R4.theme.textOn('#ffeb3b').color);
      assert.notContains(css(), '--r4-acc-txt:#ffffff', 'amarelo não leva texto branco');
      assert.ok(t.logs.take('warn').some(m => m.includes('contraste') && m.includes('#ffeb3b')), 'aviso de contraste da cor primária');
      R4.theme.set({ primary: '#0b1020' }, { persist: false });
      assert.contains(css(), '--r4-acc-txt:#ffffff', 'escuro leva texto claro');
      t.logs.clear();
    });

    test('modo auto segue prefers-color-scheme (matchMedia simulado), reage à mudança do sistema e avisa onChange', t => {
      const real = window.matchMedia;
      let escuro = true, ouvintes = [];
      window.matchMedia = q => ({ media: q, get matches() { return escuro; }, addEventListener: (e, f) => ouvintes.push(f), removeEventListener: (e, f) => { ouvintes = ouvintes.filter(x => x !== f); }, addListener() {}, removeListener() {} });
      t.cleanup(() => { window.matchMedia = real; });
      const mudancas = t.spy();
      const cancela = R4.theme.onChange(mudancas);
      t.cleanup(cancela);
      R4.theme.set({ mode: 'auto' }, { persist: false });
      assert.eq(dark(), true, 'sistema escuro → r4-dark');
      assert.eq(R4.theme.isDark(), true);
      assert.eq(R4.theme.get().mode, 'auto');
      assert.eq(ouvintes.length, 1, 'escuta o sistema');
      escuro = false;
      ouvintes.forEach(f => f({ matches: false }));
      assert.eq(dark(), false, 'sistema claro → remove r4-dark');
      assert.eq(R4.theme.isDark(), false);
      assert.ok(mudancas.calls.some(c => c[1].reason === 'system'), 'onChange com reason "system"');
      R4.theme.set({ mode: 'light' }, { persist: false });
      assert.eq(ouvintes.length, 0, 'fora do modo auto para de escutar');
      const n = mudancas.count;
      cancela();
      R4.theme.set({ mode: 'dark' }, { persist: false });
      assert.eq(mudancas.count, n, 'ouvinte cancelado não é chamado');
    });

    test('modo auto sem matchMedia (ambiente antigo) não quebra e fica claro', t => {
      const real = window.matchMedia;
      window.matchMedia = undefined;
      t.cleanup(() => { window.matchMedia = real; });
      R4.theme.set({ mode: 'auto' }, { persist: false });
      assert.eq(R4.theme.isDark(), false);
      assert.eq(dark(), false);
    });

    test('persistência: set grava JSON no localStorage; persist:false não grava; reset apaga', t => {
      R4.theme.reset();
      R4.theme.set({ primary: '#0b7d55', mode: 'dark' }, { persist: false });
      assert.eq(lsGet(KEY), null, 'persist:false não grava');
      R4.theme.set({ primary: '#e8590c', radius: 12 });
      const salvo = JSON.parse(lsGet(KEY));
      assert.eq(salvo.primary, '#e8590c');
      assert.eq(salvo.radius, 12);
      assert.eq(salvo.mode, 'dark');
      assert.eq(R4.theme.storageKey, KEY);
      R4.theme.reset();
      assert.eq(lsGet(KEY), null, 'reset apaga');
      assert.eq(R4.theme.get().primary, '#3b5bdb', 'volta ao padrão');
      assert.eq(R4.theme.get().mode, 'light');
    });

    test('localStorage bloqueado (modo privado/política): set e reset continuam funcionando em memória', t => {
      const set = Storage.prototype.setItem, get = Storage.prototype.getItem, rem = Storage.prototype.removeItem;
      const bloqueia = () => { throw new DOMException('bloqueado', 'SecurityError'); };
      Storage.prototype.setItem = bloqueia; Storage.prototype.getItem = bloqueia; Storage.prototype.removeItem = bloqueia;
      t.cleanup(() => { Storage.prototype.setItem = set; Storage.prototype.getItem = get; Storage.prototype.removeItem = rem; });
      R4.theme.set({ primary: '#7048e8', mode: 'dark' });
      assert.eq(R4.theme.get().primary, '#7048e8');
      assert.eq(dark(), true);
      assert.contains(css(), '--r4-acc:#7048e8');
      R4.theme.reset();
      assert.eq(dark(), false);
      assert.eq(t.logs.take('error').length, 0, 'nenhum erro registrado');
      R4.i18n.set(R4.i18n.locale);
      assert.eq(t.logs.take('error').length, 0, 'i18n também tolera storage bloqueado');
    });

    test('restauração ao carregar: JSON malicioso no localStorage é descartado campo a campo (página recarregada simulada)', async t => {
      const anterior = lsGet(KEY);   // devolve o tema salvo do usuário no fim (o afterEach já o restaurou antes desta limpeza)
      t.cleanup(() => { try { anterior == null ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, anterior); } catch (e) { /* */ } });
      localStorage.setItem(KEY, '{"mode":"dark","primary":"red;}*{display:none}","font":"a}*{x:y","radius":"1;}","__proto__":{"pwnTheme":1}}');
      const f = document.createElement('iframe');
      f.style.display = 'none';
      t.box.append(f);
      const D = f.contentDocument, W = f.contentWindow;
      ['TextEncoder', 'TextDecoder'].forEach(k => { if (!W[k]) W[k] = window[k]; });   // só ambientes sem suporte (jsdom)
      const erros = [];
      W.addEventListener('error', e => erros.push(e.message));
      for (const s of ['core', 'net', 'components', 'declarative', 'quick', 'tabs', 'icons', 'form', 'sanitize', 'files', 'ui', 'chart', 'theme']) {
        await new Promise((ok, no) => { const el = D.createElement('script'); el.src = location.origin + '/libr4/' + s + '.js'; el.onload = ok; el.onerror = () => no(new Error('não carregou ' + s)); D.head.append(el); });
      }
      const estilo = (D.getElementById('r4-theme') || {}).textContent || '';
      assert.deepEq(erros, [], 'nenhum erro ao carregar');
      assert.notOk(/display:none|\*\{|x:y/.test(estilo), 'nenhum CSS injetado');
      assert.eq(W.R4.theme.get().mode, 'dark', 'o campo válido (mode) é restaurado');
      assert.eq(W.R4.theme.get().primary, '#3b5bdb', 'primary inválido descartado');
      assert.eq(W.R4.theme.get().font, '');
      assert.eq(({}).pwnTheme, undefined);
      assert.eq(W.Object.prototype.pwnTheme, undefined);
      assert.eq(D.documentElement.classList.contains('r4-dark'), true);
      localStorage.setItem(KEY, 'isto não é json {{{');
      const f2 = document.createElement('iframe');
      t.box.append(f2);
      const D2 = f2.contentDocument, W2 = f2.contentWindow;
      ['TextEncoder', 'TextDecoder'].forEach(k => { if (!W2[k]) W2[k] = window[k]; });
      for (const s of ['core', 'net', 'components', 'declarative', 'quick', 'tabs', 'icons', 'form', 'sanitize', 'files', 'ui', 'chart', 'theme']) {
        await new Promise((ok, no) => { const el = D2.createElement('script'); el.src = location.origin + '/libr4/' + s + '.js'; el.onload = ok; el.onerror = () => no(new Error('não carregou ' + s)); D2.head.append(el); });
      }
      assert.eq(W2.R4.theme.get().mode, 'light', 'JSON quebrado: segue o padrão');
    }, { timeout: 15000 });

    test('themeswitch: botões Claro/Escuro/Auto com aria-pressed refletem e controlam o tema; seletor de preset', t => {
      const ts = t.create({ xtype: 'themeswitch', presets: true });
      const botoes = [...ts.el.querySelectorAll('button')];
      assert.ok(botoes.length >= 3, 'três modos');
      const por = txt => botoes.find(b => b.textContent.trim().toLowerCase().includes(txt));
      const claro = por('claro'), escuro = por('escuro'), auto = por('auto');
      assert.ok(claro && escuro && auto, 'botões Claro, Escuro e Auto');
      R4.theme.set({ mode: 'light' }, { persist: false });
      ts.sync();
      assert.eq(claro.getAttribute('aria-pressed'), 'true');
      assert.eq(escuro.getAttribute('aria-pressed'), 'false');
      escuro.click();
      assert.eq(R4.theme.get().mode, 'dark', 'clicar em Escuro muda o tema');
      assert.eq(dark(), true);
      assert.eq(escuro.getAttribute('aria-pressed'), 'true');
      assert.eq(claro.getAttribute('aria-pressed'), 'false');
      R4.theme.set({ mode: 'light' }, { persist: false });
      assert.eq(claro.getAttribute('aria-pressed'), 'true', 'acompanha mudanças feitas por código');
      auto.click();
      assert.eq(R4.theme.get().mode, 'auto');
      ts.destroy();
      R4.theme.set({ mode: 'dark' }, { persist: false });
      assert.eq(t.logs.take('error').length, 0, 'depois de destruído não reage mais (sem erro)');
    });
  });
})();
