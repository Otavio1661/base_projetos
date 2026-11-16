/* suíte store: R4.store — TTL, sliding, lixeira (expirados/corrompidos/órfãos/LRU), cota estourada, esquema, proteção (__proto__, chaves, segredos,
   valores perigosos), falha segura em memória, desempenho (cache/lote), migração das chaves antigas e "nenhum acúmulo".
   Quase tudo usa R4.store.create({ area, _agora }) com uma "área" falsa e relógio falso (determinístico; não toca no seu localStorage). */
(() => {
  const { suite, test, assert } = R4Test;
  const T0 = 1700000000000;

  /** Área de armazenamento falsa (com a mesma interface do Storage). `cap` = limite de caracteres (chave + valor); estourou → QuotaExceededError. */
  class Area {
    constructor(cap) { this.m = new Map(); this.cap = cap || Infinity; this.sets = 0; this.reads = 0; this.erro = null; }
    get length() { return this.m.size; }
    key(i) { const k = [...this.m.keys()][i]; return k === undefined ? null : k; }
    getItem(k) { if (this.erro) throw this.erro; this.reads++; return this.m.has(k) ? this.m.get(k) : null; }
    setItem(k, v) {
      if (this.erro) throw this.erro;
      v = String(v);
      if (this.size() - (this.m.has(k) ? k.length + this.m.get(k).length : 0) + k.length + v.length > this.cap) { const e = new Error('cota'); e.name = 'QuotaExceededError'; throw e; }
      this.m.set(k, v); this.sets++;
    }
    removeItem(k) { if (this.erro) throw this.erro; this.m.delete(k); }
    size() { let n = 0; this.m.forEach((v, k) => { n += k.length + v.length; }); return n; }
    has(k) { return this.m.has(k); }
    nomes() { return [...this.m.keys()].filter(k => k !== 'r4:__meta').sort(); }
  }
  /** armazenamento isolado com área e relógio falsos; a varredura de "ao carregar" já está em dia (META recente), salvo due: true */
  function mk(o) {
    o = o || {};
    const area = o.area || new Area(o.cap), clock = { t: T0 };
    if (!o.due) area.m.set('r4:__meta', '{"v":1,"t":' + T0 + '}');
    const s = R4.store.create(Object.assign({ area, _agora: () => clock.t }, o.cfg));
    return { s, area, clock };
  }
  const env = (d, e, extra) => JSON.stringify(Object.assign({ v: 1, d, e, a: T0, b: 10 }, extra));
  const tira = t => t.logs.take('warn');

  suite('store', () => {
    test('módulo registrado em Núcleo, API completa, padrões e configure() com limites', t => {
      assert.ok(R4.store && R4.modules.store && R4.modules.store.meta.group === 'Núcleo');
      assert.gt(R4.modules.store.meta.props.length, 8, 'documentado');
      ['set', 'get', 'has', 'del', 'keys', 'clear', 'sweep', 'stats', 'configure', 'onEvict', 'flush', 'use', 'create'].forEach(f => assert.eq(typeof R4.store[f], 'function', f));
      assert.eq(typeof R4.store.session.set, 'function', 'R4.store.session (sessionStorage)');
      const { s } = mk();
      assert.deepEq(s.configure(), { maxBytes: 262144, maxItemBytes: 32768, defaultTtl: 7 * 86400000, sweepEvery: 3600000, maxKeys: 200 });
      const c = s.configure({ maxBytes: 5000, maxKeys: '50', defaultTtl: '2h', sweepEvery: 5000, lixo: 1, maxItemBytes: 99999999 });
      assert.eq(c.maxBytes, 5000); assert.eq(c.maxKeys, 50); assert.eq(c.defaultTtl, 7200000); assert.eq(c.sweepEvery, 5000);
      assert.eq(c.maxItemBytes, 5000, 'item nunca maior que o total');
      assert.eq(c.lixo, undefined, 'opção desconhecida ignorada');
      s.configure({ maxBytes: 'abc', maxKeys: -5 });
      assert.eq(s.configure().maxBytes, 5000, 'valor inválido mantém o atual');
      assert.eq(s.configure().maxKeys, 1, 'limite mínimo');
      const c2 = s.configure(); c2.maxKeys = 9999;
      assert.eq(s.configure().maxKeys, 1, 'configure devolve uma cópia');
    });

    test('set/get/has/del/keys/clear: envelope {v,d,e,a,b} com prefixo r4:, cópia ao ler e gravação adiada em lote', t => {
      const { s, area } = mk();
      assert.eq(s.set('prefs', { cor: 'azul', n: [1, 2, { x: null }] }, { ttl: '1h' }), true);
      assert.eq(area.has('r4:prefs'), false, 'set responde na hora; a gravação é em lote (flush)');
      s.flush();
      const raw = JSON.parse(area.getItem('r4:prefs'));
      assert.eq(raw.v, 1);
      assert.deepEq(raw.d, { cor: 'azul', n: [1, 2, { x: null }] });
      assert.eq(raw.e, T0 + 3600000, 'e = agora + ttl');
      assert.eq(raw.a, T0);
      assert.gt(raw.b, 10, 'b = bytes do valor');
      const v = s.get('prefs');
      v.cor = 'mudou'; v.n.push(9);
      assert.deepEq(s.get('prefs'), { cor: 'azul', n: [1, 2, { x: null }] }, 'o que foi lido é uma cópia: não altera o guardado');
      assert.eq(s.has('prefs'), true); assert.eq(s.has('nada'), false);
      assert.eq(s.get('nada', { fallback: 'padrão' }), 'padrão'); assert.eq(s.get('nada'), undefined);
      s.set('a.1', 1); s.set('a.2', 2); s.set('b.1', 3);
      assert.deepEq(s.keys('a.'), ['a.1', 'a.2']);
      assert.deepEq(s.keys(), ['a.1', 'a.2', 'b.1', 'prefs']);
      assert.eq(s.del('a.1'), true); assert.eq(s.del('a.1'), false);
      assert.eq(s.clear('a.'), 1);
      assert.deepEq(s.keys(), ['b.1', 'prefs']);
      assert.eq(s.clear(), 2); assert.deepEq(s.keys(), []);
      assert.deepEq(area.nomes(), [], 'clear apaga também da área (só o namespace r4:)');
    });

    test('desempenho: ler não relê nem reparseia o armazenamento (cache) e uma rajada de set vira UMA gravação por chave', async t => {
      const { s, area } = mk();
      area.m.set('r4:x', env({ a: 1 }, T0 + 1e6));
      const antes = area.reads;
      for (let i = 0; i < 200; i++) s.get('x');
      assert.eq(area.reads - antes, 1, '200 leituras = 1 acesso ao armazenamento');
      const sets = area.sets;
      for (let i = 0; i < 100; i++) s.set('rajada', { i });
      assert.eq(area.sets, sets, 'nada gravado ainda (adiado)');
      await t.sleep(300);
      assert.eq(area.sets - sets, 1, 'depois de ~200 ms: uma única gravação');
      assert.deepEq(JSON.parse(area.getItem('r4:rajada')).d, { i: 99 }, 'vale o último valor');
    });

    test('TTL: expira, é apagado na leitura (armazenamento e cache) e devolve o fallback; formatos de ttl', t => {
      const { s, area, clock } = mk();
      s.set('a', 1, { ttl: '10m', now: true });
      assert.eq(area.has('r4:a'), true);
      clock.t += 9 * 60000; assert.eq(s.get('a'), 1, 'ainda vale');
      clock.t += 2 * 60000;
      assert.eq(s.has('a'), false, 'has() também respeita a validade');
      assert.eq(s.get('a', { fallback: 'x' }), 'x');
      assert.eq(area.has('r4:a'), false, 'apagado na hora da leitura');
      assert.eq(s.stats().expired, 1);
      const ms = (ttl) => { s.set('t', 1, { ttl, now: true }); return JSON.parse(area.getItem('r4:t')).e - clock.t; };
      assert.eq(ms('30m'), 1800000); assert.eq(ms('12h'), 43200000); assert.eq(ms('7d'), 604800000); assert.eq(ms('2w'), 1209600000);
      assert.eq(ms('500ms'), 500); assert.eq(ms(5000), 5000); assert.eq(ms('90s'), 90000); assert.eq(ms('1.5h'), 5400000);
      assert.eq(ms(undefined), 7 * 86400000, 'sem ttl: padrão de 7 dias');
      assert.eq(ms('lixo'), 7 * 86400000, 'ttl inválido: padrão');
      assert.eq(ms(-5), 7 * 86400000); assert.eq(ms(Infinity), 7 * 86400000); assert.eq(ms('0'), 7 * 86400000);
      assert.eq(ms('9999d'), 365 * 86400000, 'nada é eterno: no máximo 365 dias');
    });

    test('sliding: a leitura renova a validade, mas a escrita é limitada a 1 por minuto por chave', t => {
      const { s, area, clock } = mk();
      s.set('s', 'v', { ttl: '1h', sliding: true, now: true });
      const n0 = area.sets;
      clock.t += 50 * 60000; assert.eq(s.get('s'), 'v');
      clock.t += 50 * 60000; assert.eq(s.get('s'), 'v', 'sem sliding já teria expirado aos 60 min');
      s.flush();
      assert.eq(area.sets - n0, 1, 'duas leituras seguidas viram uma única gravação');
      clock.t += 10000; s.get('s'); s.flush();
      assert.eq(area.sets - n0, 1, 'dentro de 1 minuto: nenhuma escrita nova');
      clock.t += 61000; s.get('s'); s.flush();
      assert.eq(area.sets - n0, 2, 'passou 1 minuto: grava de novo');
      assert.eq(JSON.parse(area.getItem('r4:s')).e, clock.t + 3600000, 'a validade gravada acompanha a última leitura');
      assert.eq(JSON.parse(area.getItem('r4:s')).s, 3600000, 'janela do sliding guardada');
      s.set('n', 1, { ttl: '1h', now: true });
      clock.t += 50 * 60000; s.get('n'); clock.t += 20 * 60000;
      assert.eq(s.get('n', { fallback: 'expirou' }), 'expirou', 'sem sliding a leitura não renova');
    });

    test('sweep(): remove expirados, corrompidos e órfãos (versão antiga, sem envelope, e=0, nome inválido) e NUNCA toca em chaves de fora do namespace', t => {
      const { s, area } = mk();
      area.m.set('r4:vivo', env({ ok: 1 }, T0 + 60000));
      area.m.set('r4:velho', env(1, T0 - 1));
      area.m.set('r4:quebrado', '{isto nao e json');
      area.m.set('r4:eterno', env(1, 0));
      area.m.set('r4:semcampos', '{"v":1,"d":1}');
      area.m.set('r4:v0', JSON.stringify({ v: 0, d: 1, e: T0 + 1e6, a: T0, b: 1 }));
      area.m.set('r4:v2', JSON.stringify({ v: 2, d: 1, e: T0 + 1e6, a: T0, b: 1 }));
      area.m.set('r4:semenvelope', '"texto puro"');
      area.m.set('r4:objsimples', '{"x":1}');
      area.m.set('r4:nome invalido!', env(1, T0 + 1e6));
      area.m.set('r4:', env(1, T0 + 1e6));
      area.m.set('outro:app', 'intocado'); area.m.set('r4-theme', 'chave-sem-namespace'); area.m.set('tema', 'x');
      const r = s.sweep();
      assert.eq(r.expired, 1, 'expirado'); assert.eq(r.corrupt, 3, 'JSON quebrado, e=0 e campos faltando'); assert.eq(r.orphan, 6, 'v0, v2, texto puro, objeto sem v, nome inválido, nome vazio');
      assert.eq(r.items, 1); assert.gt(r.bytes, 0);
      assert.deepEq(area.nomes(), ['outro:app', 'r4-theme', 'r4:vivo', 'tema'], 'só sobrou o válido e o que não é do namespace');
      assert.deepEq(s.get('vivo'), { ok: 1 });
      assert.eq(s.stats().sweeps, 1);
    });

    test('lixeira LRU: passou de maxKeys ou maxBytes, expulsa os MENOS usados até ≤ 80%; ler uma chave a protege', t => {
      const a = mk({ cfg: { maxKeys: 10 } });
      const ev = []; a.s.onEvict((k, why) => ev.push(k + ':' + why));
      for (let i = 0; i < 10; i++) { a.clock.t += 1000; a.s.set('k' + i, { i }, { now: true }); }
      assert.eq(a.s.keys().length, 10, 'no limite: nada expulso');
      a.clock.t += 1000; a.s.get('k0');                       // k0 é a mais antiga, mas acaba de ser usada
      a.clock.t += 1000; a.s.set('k10', { i: 10 }, { now: true });   // 11 chaves > 10: expulsa até 8
      assert.eq(a.s.keys().length, 8, 'até 80% do limite');
      assert.eq(a.s.has('k0'), true, 'k0 usada recentemente fica');
      assert.eq(a.s.has('k10'), true, 'a recém-gravada fica');
      assert.deepEq(ev, ['k1:lru', 'k2:lru', 'k3:lru'], 'saíram as menos recentes, avisadas em onEvict');
      assert.deepEq(a.area.nomes().length, 8, 'e sumiram do armazenamento');
      assert.eq(a.s.stats().evictions, 3);
      const b = mk({ cfg: { maxBytes: 3000 } });
      for (let i = 0; i < 12; i++) { b.clock.t += 1000; b.s.set('b' + i, 'x'.repeat(300), { now: true }); }
      const st = b.s.stats();
      assert.ok(st.bytes <= 3000, 'bytes dentro do limite (' + st.bytes + ')');
      assert.gt(st.evictions, 0);
      assert.eq(b.s.has('b0'), false, 'a mais antiga saiu'); assert.eq(b.s.has('b11'), true, 'a mais nova ficou');
      b.s.sweep();
      assert.ok(b.s.stats().bytes <= 3000, 'continua dentro do limite depois de varrer');
    });

    test('cota do armazenamento estourada (QuotaExceededError): varre, expulsa os menos usados e tenta de novo UMA vez', t => {
      const { s, area, clock } = mk({ cap: 1500 });
      const ev = []; s.onEvict((k, why) => ev.push(why));
      for (let i = 0; i < 5; i++) { clock.t += 1000; s.set('k' + i, 'x'.repeat(200), { now: true }); }
      assert.eq(area.nomes().length, 5, 'cabem 5 (cota de 1500 caracteres)');
      clock.t += 1000;
      assert.eq(s.set('novo', 'y'.repeat(200), { now: true }), true);
      assert.eq(area.has('r4:novo'), true, 'gravou depois de abrir espaço');
      assert.eq(area.has('r4:k0'), false, 'as menos usadas saíram'); assert.eq(area.has('r4:k1'), false);
      assert.eq(area.has('r4:k4'), true);
      assert.deepEq(ev, ['quota', 'quota']);
      assert.eq(s.stats().evictions, 2);
      assert.eq(s.stats().memory, false);
      assert.eq(tira(t).length, 0, 'sem avisos: deu certo');
      // cota que nunca cede: nada lança, o valor segue em memória
      const m = mk({ cap: 50 });
      assert.eq(m.s.set('grande', 'z'.repeat(300), { now: true }), true);
      assert.eq(m.s.get('grande'), 'z'.repeat(300), 'continua legível (memória)');
      assert.eq(m.s.stats().memory, true);
      assert.eq(tira(t).length, 1, 'um aviso (só uma vez)');
    });

    test('esquema ao ler: função ou objeto {campo:tipo}; fora do esquema é descartado, a chave é apagada e vira fallback', t => {
      const { s, area } = mk();
      const ev = []; s.onEvict((k, why) => ev.push(k + ':' + why));
      s.set('p', { nome: 'Ana', idade: 30, admin: true, tags: ['a'] }, { now: true });
      assert.deepEq(s.get('p', { schema: { nome: 'string', idade: 'number', tags: 'array' } }), { nome: 'Ana', idade: 30, tags: ['a'] }, 'campos fora do esquema (admin) não voltam');
      assert.deepEq(s.get('p', { schema: { nome: 'string', cidade: 'string?' } }), { nome: 'Ana' }, 'campo opcional ausente é aceito');
      assert.eq(s.get('p', { schema: { nome: { t: 'string', max: 2 } }, fallback: 'F' }), 'F', 'texto maior que o limite');
      assert.eq(area.has('r4:p'), false, 'fora do esquema: apagada');
      assert.deepEq(ev, ['p:schema']);
      assert.eq(s.stats().rejected, 1);
      s.set('q', { idade: 'trinta' }, { now: true });
      assert.eq(s.get('q', { schema: { idade: 'number' }, fallback: null }), null, 'tipo errado');
      s.set('r', { x: 1 }); assert.eq(s.get('r', { schema: { x: 'number', y: 'string' }, fallback: 0 }), 0, 'campo obrigatório ausente');
      s.set('n', { v: 7 });
      assert.eq(s.get('n', { schema: { v: { t: 'number', min: 10 } }, fallback: 'baixo' }), 'baixo', 'limite mínimo');
      s.set('e', { m: 'azul' });
      assert.deepEq(s.get('e', { schema: { m: { t: 'string', in: ['azul', 'verde'] } } }), { m: 'azul' });
      s.set('e', { m: 'roxo' });
      assert.eq(s.get('e', { schema: { m: { t: 'string', in: ['azul', 'verde'] } }, fallback: 'F' }), 'F', 'fora da lista');
      s.set('f', 'dark');
      assert.eq(s.get('f', { schema: v => (['light', 'dark'].includes(v) ? v : undefined) }), 'dark', 'esquema em função');
      s.set('f', 'neon');
      assert.eq(s.get('f', { schema: v => (['light', 'dark'].includes(v) ? v : undefined), fallback: 'light' }), 'light');
      assert.eq(s.has('f'), false);
      s.set('g', 1);
      assert.eq(s.get('g', { schema: () => { throw new Error('esquema ruim'); }, fallback: 'F' }), 'F', 'esquema que lança nunca derruba');
      s.set('h', [1]);
      assert.eq(s.get('h', { schema: { a: 'number' }, fallback: 'F' }), 'F', 'esquema de objeto num array');
    });

    test('proteção: __proto__/constructor/prototype nunca poluem (ao gravar, ao ler e com o armazenamento adulterado)', t => {
      const { s, area } = mk();
      assert.eq(s.set('p', JSON.parse('{"__proto__":{"polui":1},"constructor":{"prototype":{"polui2":1}},"prototype":3,"ok":{"__proto__":{"polui3":1},"n":1}}'), { now: true }), true);
      assert.deepEq(JSON.parse(area.getItem('r4:p')).d, { ok: { n: 1 } }, 'chaves perigosas ignoradas em qualquer nível');
      const v = s.get('p');
      assert.eq(v.polui, undefined); assert.eq(({}).polui, undefined); assert.eq(({}).polui2, undefined); assert.eq(({}).polui3, undefined);
      assert.eq(Object.getPrototypeOf(v), Object.prototype, 'protótipo intacto');
      // adulterado direto no armazenamento (outro script/extensão)
      area.m.set('r4:adulterado', '{"v":1,"d":{"__proto__":{"pwn":1},"x":1,"constructor":{"prototype":{"pwn2":1}}},"e":' + (T0 + 1e6) + ',"a":' + T0 + ',"b":5}');
      const w = s.get('adulterado');
      assert.deepEq(w, { x: 1 });
      assert.eq(({}).pwn, undefined); assert.eq(({}).pwn2, undefined);
      assert.eq(Object.prototype.hasOwnProperty.call(w, '__proto__'), false);
      // o esquema também ignora chaves perigosas
      assert.deepEq(s.get('adulterado', { schema: { x: 'number', __proto__: 'string?', constructor: 'string?' } }), { x: 1 });
    });

    test('chaves inválidas e sensíveis são recusadas (com aviso, sem gravar); permitirSensivel libera', t => {
      const { s, area } = mk();
      const ruins = ['', 'a b', 'x/y', 'ç', 'a'.repeat(65), '__meta', '__x', null, 42, {}, 'a\nb', 'a;b'];
      ruins.forEach(k => assert.eq(s.set(k, 1, { now: true }), false, 'chave ' + JSON.stringify(k)));
      assert.eq(s.set('a'.repeat(64), 1, { now: true }), true, '64 caracteres ainda vale');
      ['A-z0-9._:-', 'a.b:c-d_e'].forEach(k => assert.eq(s.set(k, 1), true, k));
      assert.eq(tira(t).length, ruins.length, 'um aviso por recusa');
      ['token', 'user.Token', 'meuTOKEN', 'senha', 'user.password', 'secret', 'client_secret', 'cpf', 'meuCPF', 'cartao', 'card.num', 'jwt', 'auth', 'x.auth.y']
        .forEach(k => { assert.eq(s.set(k, 'x', { now: true }), false, 'sensível: ' + k); assert.eq(s.has(k), false); });
      assert.deepEq(area.nomes().filter(n => /token|senha|password|secret|cpf|cartao|card|jwt|auth/i.test(n)), [], 'nada sensível chegou ao armazenamento');
      const av = tira(t); assert.eq(av.length, 14); assert.contains(av[0], 'NUNCA');
      assert.eq(s.set('sessao.token', 'abc', { permitirSensivel: true, now: true }), true, 'liberação consciente');
      assert.eq(s.get('sessao.token'), 'abc');
      assert.eq(s.get('a b', { fallback: 'F' }), 'F'); assert.eq(s.has('a b'), false); assert.eq(s.del('a b'), false);
    });

    test('valores perigosos ou grandes são recusados: função, símbolo, undefined, NaN, Date, Map, ciclo, profundidade > 8, > 32 KB', t => {
      const { s, area } = mk();
      const ciclo = { a: 1 }; ciclo.eu = ciclo;
      const ruins = { função: () => 1, símbolo: Symbol('x'), undefined: undefined, NaN: NaN, Infinity: Infinity, bigint: 10n, Date: new Date(), Map: new Map(), Set: new Set(), classe: new (class X {})(), ciclo,
        'array com função': [1, () => 2], 'array com undefined': [undefined], 'objeto com função': { a: { b: () => 1 } } };
      Object.keys(ruins).forEach(k => assert.eq(s.set('k', ruins[k], { now: true }), false, k));
      assert.eq(s.has('k'), false);
      const fundo = n => { let o = 1; for (let i = 0; i < n; i++) o = { o }; return o; };
      assert.eq(s.set('f8', fundo(8), { now: true }), true, '8 níveis de objeto é o máximo');
      assert.eq(s.set('f9', fundo(9), { now: true }), false, '9 níveis');
      assert.eq(s.set('f9b', JSON.parse('[[[[[[[[[1]]]]]]]]]'), { now: true }), false, 'arrays também contam');
      assert.eq(s.set('muitos', Array.from({ length: 25000 }, () => 1), { now: true }), false, 'estrutura enorme');
      assert.eq(s.set('big', 'x'.repeat(32766), { now: true }), true, 'no limite (32768 bytes de JSON, com as aspas)');
      assert.eq(s.set('big2', 'x'.repeat(32767), { now: true }), false, 'acima de maxItemBytes (32 KB)');
      assert.eq(s.set('utf8', 'é'.repeat(16400), { now: true }), false, 'o limite é em bytes UTF-8 (2 bytes por "é")');
      assert.eq(s.set('utf8ok', 'é'.repeat(16000), { now: true }), true);
      assert.eq(s.has('big2'), false); assert.eq(area.has('r4:big2'), false);
      assert.deepEq(s.get('f8'), fundo(8));
      s.set('ok', { a: 1, b: undefined, c: [1, 'x', null, true], d: 1.5 }, { now: true });
      assert.deepEq(s.get('ok'), { a: 1, c: [1, 'x', null, true], d: 1.5 }, 'undefined em objeto é descartado (como no JSON)');
      assert.ok(tira(t).length >= Object.keys(ruins).length);
      // um item adulterado/gigante no armazenamento também é descartado na leitura
      area.m.set('r4:enorme', '{"v":1,"d":"' + 'x'.repeat(40000) + '","e":' + (T0 + 1e6) + ',"a":' + T0 + ',"b":1}');
      assert.eq(s.get('enorme', { fallback: 'F' }), 'F'); assert.eq(area.has('r4:enorme'), false);
    });

    test('falha segura: armazenamento bloqueado/ausente cai para memória com a mesma semântica de TTL e limites, sem lançar', t => {
      const quebrada = new Area(); quebrada.erro = new DOMException('bloqueado', 'SecurityError');
      const ck2 = { t: T0 };
      const casos = [mk({ area: quebrada, cfg: { maxKeys: 5 } }), { s: R4.store.create({ maxKeys: 5, _agora: () => ck2.t }), clock: ck2 }];
      casos.forEach(c => {
        const s = c.s, ck = c.clock;
        assert.eq(s.set('a', { x: 1 }, { ttl: '1m', now: true }), true);
        assert.deepEq(s.get('a'), { x: 1 }, 'funciona em memória');
        ck.t += 61000;
        assert.eq(s.get('a', { fallback: 'expirou' }), 'expirou', 'TTL também vale em memória');
        for (let i = 0; i < 30; i++) { ck.t += 10; s.set('m' + i, i); }
        assert.ok(s.keys().length <= 5, 'limite de chaves também vale em memória (' + s.keys().length + ')');
        assert.eq(s.has('m29'), true);
        s.sweep(); s.stats(); s.keys('m'); s.clear('m'); s.configure({ maxKeys: 3 }); s.flush(); s.del('zzz');
        assert.eq(s.stats().memory, true);
        s.use(null);
      });
      // o global com Storage quebrado de verdade (como o modo privado de alguns navegadores)
      const orig = R4.store._area(), ruim = new Area(); ruim.erro = new Error('bloqueado');
      t.cleanup(() => { R4.store.use(orig); });
      R4.store.use(ruim);
      R4.store.set('teste.falha', 1, { now: true }); assert.eq(R4.store.get('teste.falha'), 1);
      R4.store.del('teste.falha'); R4.store.sweep(); R4.store.clear('teste.');
      assert.eq(t.logs.take('error').length, 0);
    });

    test('sweep respeita sweepEvery: automático só se já passou o intervalo; a hora da última varredura fica em r4:__meta', t => {
      const { s, area, clock } = mk({ cfg: { sweepEvery: 600000 } });
      assert.eq(s.sweep({ auto: true }), null, 'varredura recente (META em dia): não roda');
      clock.t += 599000; assert.eq(s.sweep({ auto: true }), null);
      clock.t += 2000;
      const r = s.sweep({ auto: true });
      assert.ok(r && typeof r.items === 'number', 'passou o intervalo: roda');
      assert.eq(JSON.parse(area.getItem('r4:__meta')).t, clock.t, 'hora gravada no meta');
      assert.eq(s.sweep({ auto: true }), null, 'acabou de rodar');
      assert.ok(s.sweep() && s.sweep(), 'sweep() manual roda sempre');
      assert.eq(s.stats().lastSweep, clock.t);
    });

    test('varredura automática ao carregar: em ociosidade, só se o META estiver vencido, em fatias, sem travar', async t => {
      const area = new Area();
      for (let i = 0; i < 60; i++) area.m.set('r4:v' + i, env(i, T0 - 1));            // 60 expirados
      area.m.set('r4:bom', env('ok', T0 + 1e9)); area.m.set('r4:lixo', 'nao json');
      area.m.set('r4:__meta', '{"v":1,"t":' + (T0 - 7200000) + '}');                  // última varredura há 2 h (sweepEvery padrão 1 h)
      const s = R4.store.create({ area, _agora: () => T0 });
      assert.eq(area.has('r4:v0'), true, 'não varre de forma síncrona ao criar');
      await t.waitFor(() => area.nomes().length === 1, 3000, 'a varredura ociosa');
      assert.deepEq(area.nomes(), ['r4:bom']);
      assert.eq(JSON.parse(area.getItem('r4:__meta')).t, T0);
      assert.eq(s.stats().sweeps, 1);
      // META recente: nada é varrido sozinho
      const b = new Area(); b.m.set('r4:velho', env(1, T0 - 1)); b.m.set('r4:__meta', '{"v":1,"t":' + (T0 - 1000) + '}');
      R4.store.create({ area: b, _agora: () => T0 });
      await t.sleep(200);
      assert.eq(b.has('r4:velho'), true, 'ainda não deu o intervalo');
      // META adulterado (futuro, lixo) conta como "nunca varreu"
      const c = new Area(); c.m.set('r4:velho', env(1, T0 - 1)); c.m.set('r4:__meta', '{"v":1,"t":99999999999999}');
      R4.store.create({ area: c, _agora: () => T0 });
      await t.waitFor(() => !c.has('r4:velho'), 3000, 'varredura com meta inválido');
    }, { timeout: 12000 });

    test('onEvict: recebe (chave, motivo) de expired/corrupt/orphan/schema/lru/quota; erro no ouvinte não derruba; dá para cancelar', t => {
      const { s, area } = mk();
      const log = []; const off = s.onEvict((k, why) => log.push(k + ':' + why));
      s.onEvict(() => { throw new Error('ouvinte ruim'); });
      area.m.set('r4:a', env(1, T0 - 1)); area.m.set('r4:b', 'xx'); area.m.set('r4:c', '{"v":9}');
      s.sweep();
      assert.deepEq(log.sort(), ['a:expired', 'b:corrupt', 'c:orphan']);
      off(); s.set('z', 1); s.del('z'); area.m.set('r4:d', env(1, T0 - 1)); s.sweep();
      assert.eq(log.length, 3, 'cancelado');
      assert.eq(typeof s.onEvict('não é função'), 'function');
    });

    test('stats(): itens, bytes e contadores coerentes com o que aconteceu', t => {
      const { s, clock } = mk();
      assert.deepEq([s.stats().items, s.stats().bytes], [0, 0]);
      s.set('a', 'x'.repeat(100)); s.set('b', 'y'.repeat(50), { ttl: '1m' });
      const st = s.stats();
      assert.eq(st.items, 2);
      assert.ok(st.bytes > 150 && st.bytes < 400, 'bytes ~ valores + chaves + envelope (' + st.bytes + ')');
      assert.eq(st.maxBytes, 262144); assert.eq(st.maxKeys, 200); assert.eq(st.pending, 2, 'gravações pendentes (lote)');
      s.flush(); assert.eq(s.stats().pending, 0);
      clock.t += 120000;
      s.sweep();
      const s2 = s.stats();
      assert.eq(s2.items, 1); assert.eq(s2.expired, 1); assert.eq(s2.evictions, 0); assert.eq(s2.corrupt, 0); assert.eq(s2.memory, false);
      s.del('a'); assert.eq(s.stats().items, 0);
    });

    test('NENHUM ACÚMULO: criar e expirar 1.000 itens (e 1.000 sem expirar) mantém tamanho e quantidade dentro dos limites', t => {
      // (1) itens de vida curta: tudo que expira é varrido; no fim quase nada resta
      const a = mk({ cfg: { maxKeys: 100, maxBytes: 20000 } });
      for (let i = 0; i < 1000; i++) { a.clock.t += 1000; a.s.set('c' + i, { i, pad: 'p'.repeat(40) }, { ttl: '5s', now: true }); }
      a.clock.t += 60000;
      const r = a.s.sweep();
      assert.eq(r.items, 0, 'tudo expirou e foi varrido');
      assert.deepEq(a.area.nomes(), [], 'armazenamento vazio (só o meta)');
      assert.gt(a.s.stats().expired + a.s.stats().evictions, 900);
      // (2) itens de vida longa: o limite de chaves/bytes segura o crescimento DURANTE o laço, não só no fim
      const b = mk({ cfg: { maxKeys: 50, maxBytes: 12000 } });
      let max = 0;
      for (let i = 0; i < 1000; i++) {
        b.clock.t += 1000; b.s.set('d' + i, { i, pad: 'p'.repeat(60) }, { ttl: '30d', now: true });
        max = Math.max(max, b.area.nomes().length);
      }
      b.s.sweep();
      const st = b.s.stats();
      assert.ok(max <= 51, 'pico de chaves no armazenamento: ' + max);
      assert.ok(st.items <= 50 && st.items > 0, 'itens: ' + st.items);
      assert.ok(st.bytes <= 12000, 'bytes: ' + st.bytes);
      assert.ok(b.area.size() <= 12000 + 200, 'tamanho real no armazenamento: ' + b.area.size());
      assert.gt(st.evictions, 900);
      assert.eq(b.s.has('d999'), true, 'os mais recentes ficam');
      // (3) o mesmo em memória (sem armazenamento)
      const c = R4.store.create({ maxKeys: 40, _agora: () => a.clock.t });
      for (let i = 0; i < 1000; i++) c.set('e' + i, i);
      assert.ok(c.keys().length <= 40);
    });

    test('um item que passa do limite sozinho nunca esvazia o resto, e o limite 80% não expulsa a chave que acabou de ser gravada', t => {
      const { s, clock } = mk({ cfg: { maxKeys: 3 } });
      ['a', 'b', 'c'].forEach(k => { clock.t += 1; s.set(k, 1); });
      clock.t += 0; s.set('d', 1);                       // mesmo milissegundo que o anterior: o empate não pode expulsar 'd'
      assert.eq(s.has('d'), true);
      assert.ok(s.keys().length <= 3);
      const p = mk({ cfg: { maxKeys: 1 } });
      p.s.set('x', 1); p.s.set('y', 2);
      assert.eq(p.s.has('y'), true, 'maxKeys: 1 ainda guarda a mais nova');
    });

    test('R4.store.use(área) e _agora: o armazenamento principal aceita área e relógio injetados (e volta ao normal)', t => {
      const orig = R4.store._area(), area = new Area(), antes = R4.store._agora;
      t.cleanup(() => { R4.store.use(orig); R4.store._agora = antes; });
      let agora = T0; R4.store._agora = () => agora;
      R4.store.use(area);
      R4.store.set('teste.use', { v: 1 }, { ttl: '1h', now: true });
      assert.deepEq(JSON.parse(area.getItem('r4:teste.use')).d, { v: 1 }, 'gravou na área injetada');
      assert.eq(JSON.parse(area.getItem('r4:teste.use')).e, T0 + 3600000, 'relógio injetado');
      agora += 2 * 3600000;
      assert.eq(R4.store.get('teste.use', { fallback: 'exp' }), 'exp');
      // a sessão usa o MESMO relógio injetado
      R4.store.session.set('teste.sessao', 1);
      agora += 8 * 86400000;
      assert.eq(R4.store.session.get('teste.sessao', { fallback: 'exp' }), 'exp', 'sessão acompanha o relógio de R4.store');
      R4.store.session.del('teste.sessao');
    });

    test('R4.store.session usa o sessionStorage (namespace r4:), com a mesma API; gravação em lote é feita ao sair da página (pagehide)', t => {
      const orig = R4.store._area();
      t.cleanup(() => { R4.store.del('teste.pagehide'); R4.store.session.del('teste.sess'); });
      assert.eq(R4.store.session.set('teste.sess', { a: 1 }, { now: true }), true);
      let viu = null; try { viu = sessionStorage.getItem('r4:teste.sess'); } catch (e) { /* bloqueado */ }
      if (viu !== null) assert.deepEq(JSON.parse(viu).d, { a: 1 });
      assert.deepEq(R4.store.session.get('teste.sess'), { a: 1 });
      assert.eq(R4.store.has('teste.sess'), false, 'local e sessão são separados');
      if (orig) {
        R4.store.set('teste.pagehide', 1);
        let antes = null; try { antes = localStorage.getItem('r4:teste.pagehide'); } catch (e) { /* */ }
        window.dispatchEvent(new Event('pagehide'));
        let depois = null; try { depois = localStorage.getItem('r4:teste.pagehide'); } catch (e) { /* */ }
        assert.eq(antes, null, 'antes do pagehide ainda não gravou');
        assert.notEq(depois, null, 'pagehide grava o que estava pendente');
      }
    });

    test('mudança feita por OUTRA aba (evento storage) invalida o cache em memória', t => {
      const orig = R4.store._area(), area = new Area();
      t.cleanup(() => { R4.store.use(orig); });
      R4.store.use(area);
      R4.store.set('teste.multi', 'minha', { now: true });
      assert.eq(R4.store.get('teste.multi'), 'minha');
      area.m.set('r4:teste.multi', env('da outra aba', T0 + 1e13));
      assert.eq(R4.store.get('teste.multi'), 'minha', 'sem o evento, o cache vale');
      window.dispatchEvent(new StorageEvent('storage', { key: 'r4:teste.multi' }));
      assert.eq(R4.store.get('teste.multi'), 'da outra aba');
      window.dispatchEvent(new StorageEvent('storage', { key: null }));
      area.m.delete('r4:teste.multi');
      assert.eq(R4.store.get('teste.multi', { fallback: 'sumiu' }), 'sumiu', 'clear() em outra aba');
    });

    test('migração: chaves antigas (r4-theme, r4-locale, r4-dark) são importadas UMA vez, validadas, e APAGADAS; lixo é descartado', async t => {
      const chaves = ['r4-theme', 'r4-locale', 'r4-dark', 'r4:theme', 'r4:locale'];
      const guardado = {}; chaves.forEach(k => { try { guardado[k] = localStorage.getItem(k); } catch (e) { guardado[k] = null; } });
      t.cleanup(() => chaves.forEach(k => { try { guardado[k] == null ? localStorage.removeItem(k) : localStorage.setItem(k, guardado[k]); } catch (e) { /* */ } }));
      const carrega = async () => {
        const { W, D } = await R4Test.iframeVazio(t.box);
        ['TextEncoder', 'TextDecoder'].forEach(k => { if (!W[k]) W[k] = window[k]; });
        await R4Test.carregarLib(D, ['core', 'store', 'net', 'components', 'declarative', 'quick', 'tabs', 'icons', 'form', 'sanitize', 'files', 'ui', 'chart', 'theme']);
        return W;
      };
      const ls = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
      // 1) valores antigos válidos (e um campo malicioso) → importados e apagados
      chaves.forEach(k => localStorage.removeItem(k));
      localStorage.setItem('r4-theme', '{"mode":"dark","primary":"#0b7d55","radius":9,"font":"x;}*{display:none","extra":1}');
      localStorage.setItem('r4-locale', 'en');
      localStorage.setItem('r4-dark', '1');
      let W = await carrega();
      assert.eq(W.R4.theme.get().mode, 'dark'); assert.eq(W.R4.theme.get().primary, '#0b7d55'); assert.eq(W.R4.theme.get().radius, 9);
      assert.eq(W.R4.theme.get().font, '', 'campo malicioso descartado');
      assert.eq(W.R4.i18n.locale, 'en');
      chaves.slice(0, 3).forEach(k => assert.eq(ls(k), null, 'chave antiga apagada: ' + k));
      const novo = JSON.parse(ls('r4:theme'));
      assert.eq(novo.v, 1); assert.eq(novo.d.primary, '#0b7d55'); assert.eq(novo.d.font, undefined);
      assert.near(novo.e - Date.now(), 180 * 86400000, 60000, 'validade de 180 dias');
      assert.eq(JSON.parse(ls('r4:locale')).d, 'en');
      // 2) só r4-dark antigo
      chaves.forEach(k => localStorage.removeItem(k));
      localStorage.setItem('r4-dark', 'true');
      W = await carrega();
      assert.eq(W.R4.theme.get().mode, 'dark', 'r4-dark antigo vira modo escuro'); assert.eq(ls('r4-dark'), null);
      // 3) lixo antigo: descartado e apagado, nada aplicado
      chaves.forEach(k => localStorage.removeItem(k));
      localStorage.setItem('r4-theme', 'isto não é json {{{'); localStorage.setItem('r4-locale', 'en"><img src=x onerror=1>');
      W = await carrega();
      assert.eq(W.R4.theme.get().mode, 'light'); assert.eq(W.R4.i18n.locale, 'pt-BR');
      assert.eq(ls('r4-theme'), null); assert.eq(ls('r4-locale'), null); assert.eq(ls('r4:theme'), null, 'nada de inválido foi importado');
      // 4) o formato novo adulterado também é descartado (e a chave apagada pela lixeira)
      localStorage.setItem('r4:theme', JSON.stringify({ v: 1, d: { mode: 'dark;}', primary: 'red;}*{x:y' }, e: Date.now() + 1e9, a: Date.now(), b: 5 }));
      localStorage.setItem('r4:locale', JSON.stringify({ v: 1, d: { x: 1 }, e: Date.now() + 1e9, a: Date.now(), b: 5 }));
      W = await carrega();
      assert.eq(W.R4.theme.get().mode, 'light'); assert.eq(W.R4.i18n.locale, 'pt-BR');
      assert.eq(ls('r4:theme'), null, 'esquema reprovou: apagada'); assert.eq(ls('r4:locale'), null);
    }, { timeout: 30000 });
  });
})();
