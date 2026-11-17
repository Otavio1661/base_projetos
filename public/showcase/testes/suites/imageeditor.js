/* suíte imageeditor: matemática pura (EXIF, giro, espelho, clamp, zoom, aspect), leitor EXIF/dimensões, validação de tipo e limites,
 * interação (teclado, roda, ponteiro) com um contexto 2D falso, destroy, janela modal, integração do filedrop e — só onde existe
 * canvas/ImageBitmap (Chrome, Firefox, Safari; NÃO o jsdom) — a saída real: pixels, EXIF removido, dimensões e orientação. */
(() => {
  const { suite, test, assert } = R4Test;
  const IE = () => R4.imageeditor;
  const M = () => R4.imageeditor._math;
  const semCanvas = () => typeof createImageBitmap !== 'function' || /jsdom/i.test(navigator.userAgent);
  const MOTIVO = 'sem canvas/ImageBitmap neste ambiente (jsdom): rode em /vitrine/testes no Chrome';
  const arq = (conteudo, nome, tipo) => new File([conteudo], nome, tipo ? { type: tipo } : {});
  const u32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const pngHdr = (w, h) => new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...u32(w), ...u32(h), 8, 6, 0, 0, 0, 0, 0, 0, 0]);

  /* segmento APP1/EXIF com a orientação o (little ou big endian) e JPEG mínimo (SOI, APP1, SOF0, EOI) */
  function exifSeg(o, be) {
    const tiff = be ? [0x4D, 0x4D, 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, o, 0, 0, 0, 0, 0, 0]
      : [0x49, 0x49, 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, o, 0, 0, 0, 0, 0, 0, 0];
    return [0xFF, 0xE1, 0, 2 + 6 + tiff.length, 0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  }
  function jpeg(o, w = 40, h = 20, be = false) {
    const sof = [0xFF, 0xC0, 0, 17, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
    return new Uint8Array([0xFF, 0xD8, ...exifSeg(o, be), ...sof, 0xFF, 0xD9]);
  }
  const PNG1 = () => arq(pngHdr(1, 1), 'ok.png', 'image/png');

  /* contexto 2D falso: aceita qualquer chamada (para testar a interação onde o jsdom não tem canvas) */
  const ctxFalso = () => new Proxy({}, { get: (o, k) => (k in o ? o[k] : () => ({})), set: (o, k, v) => { o[k] = v; return true; } });
  function editorFalso(t, cfg) {
    const ed = t.create(Object.assign({ xtype: 'imageeditor', aspect: 1 }, cfg));
    ed.cv.getContext = () => ctxFalso();
    ed._img = { w: 400, h: 300, src: null, closed: false, close() { this.closed = true; } };
    ed._ctl(true); ed._s = ed._init(); ed._sync(); ed._cw = 0; ed._resize();
    return ed;
  }
  const tecla = (el, key, extra) => { const ev = new KeyboardEvent('keydown', Object.assign({ key, bubbles: true, cancelable: true }, extra)); el.dispatchEvent(ev); return ev; };
  const ptr = (el, type, x, y, id = 1) => {
    const E = window.PointerEvent || window.MouseEvent;
    el.dispatchEvent(new E(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: id, pointerType: 'touch', button: 0 }));
  };

  /* só no navegador real: imagens geradas por canvas e leitura de pixels */
  const gerar = (w, h, desenhar, tipo = 'image/png', nome = 'q.png') => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; desenhar(c.getContext('2d'), w, h);
    return new Promise(ok => c.toBlob(b => ok(new File([b], nome, { type: b.type })), tipo, 0.95));
  };
  const quadrantes = (x, w, h) => {
    x.fillStyle = '#ff0000'; x.fillRect(0, 0, w / 2, h / 2); x.fillStyle = '#00ff00'; x.fillRect(w / 2, 0, w / 2, h / 2);
    x.fillStyle = '#0000ff'; x.fillRect(0, h / 2, w / 2, h / 2); x.fillStyle = '#ffff00'; x.fillRect(w / 2, h / 2, w / 2, h / 2);
  };
  async function pixels(blob) {
    const bm = await createImageBitmap(blob), c = document.createElement('canvas');
    c.width = bm.width; c.height = bm.height;
    const x = c.getContext('2d'); x.drawImage(bm, 0, 0); bm.close();
    const d = x.getImageData(0, 0, c.width, c.height).data;
    return { w: c.width, h: c.height, at: (px, py) => { const i = (py * c.width + px) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; } };
  }
  const perto = (a, e, tol = 40) => a.slice(0, 3).every((v, i) => Math.abs(v - e[i]) <= tol);
  const VERM = [255, 0, 0], VERDE = [0, 255, 0], AZUL = [0, 0, 255], AMAR = [255, 255, 0];
  const temTexto = (u8, s) => { const b = [...s].map(c => c.charCodeAt(0)); outer: for (let i = 0; i + b.length <= u8.length; i++) { for (let j = 0; j < b.length; j++) if (u8[i + j] !== b[j]) continue outer; return true; } return false; };

  suite('imageeditor', () => {
    /* ---------------- matemática pura ---------------- */
    test('orientação EXIF 1-8: onde cai o pixel de origem (0,0) conforme a tabela do padrão', () => {
      // [x, y, largura, altura] depois de aplicar a orientação a uma imagem 4×2
      const esperado = { 1: [0, 0, 4, 2], 2: [3, 0, 4, 2], 3: [3, 1, 4, 2], 4: [0, 1, 4, 2], 5: [0, 0, 2, 4], 6: [1, 0, 2, 4], 7: [1, 3, 2, 4], 8: [0, 3, 2, 4] };
      for (let o = 1; o <= 8; o++) assert.deepEq(M().mapPixel(M().orient(o), 0, 0, 4, 2), esperado[o], 'orientação ' + o);
      assert.deepEq(M().orient(0), { rot: 0, flip: false }, 'valor fora da faixa = sem giro');
      assert.deepEq(M().orient(99), { rot: 0, flip: false });
      assert.deepEq(M().orient(6), { rot: 1, flip: false });
      // um segundo pixel: orientação 6 (90° horário) leva o canto superior direito (3,0) para o inferior direito
      assert.deepEq(M().mapPixel(M().orient(6), 3, 0, 4, 2), [1, 3, 2, 4]);
    });

    test('moldura: aspect fixo/livre, zoom (limites 1..maxZoom) e giro de 90° trocando largura e altura', () => {
      const s = { rot: 0, flip: false, fine: 0, zoom: 1, cx: 0, cy: 0 };
      let f = M().frame(s, 400, 300, 1, 5);
      assert.near(f.fw, 300); assert.near(f.fh, 300);
      f = M().frame(s, 400, 300, 4 / 3, 5); assert.near(f.fw, 400); assert.near(f.fh, 300);
      f = M().frame(s, 400, 300, 0, 5); assert.near(f.fw, 400, 1e-6, 'livre = proporção da imagem'); assert.near(f.fh, 300);
      f = M().frame(s, 400, 300, 16 / 9, 5); assert.near(f.fw, 400); assert.near(f.fh, 225);
      f = M().frame(s, 400, 300, 3 / 4, 5); assert.near(f.fh, 300); assert.near(f.fw, 225);
      f = M().frame(Object.assign({}, s, { zoom: 2 }), 400, 300, 1, 5); assert.near(f.fw, 150);
      f = M().frame(Object.assign({}, s, { zoom: 0.2 }), 400, 300, 1, 5); assert.near(f.fw, 300, 1e-6, 'zoom abaixo de 1 vira 1');
      f = M().frame(Object.assign({}, s, { zoom: 99 }), 400, 300, 1, 5); assert.near(f.fw, 60, 1e-6, 'zoom acima do máximo vira o máximo');
      f = M().frame(Object.assign({}, s, { zoom: NaN }), 400, 300, 1, 5); assert.near(f.fw, 300, 1e-6, 'NaN vira 1');
      f = M().frame(Object.assign({}, s, { rot: 1 }), 400, 300, 0, 5); assert.near(f.fw, 300); assert.near(f.fh, 400);
      f = M().frame(Object.assign({}, s, { rot: 1 }), 400, 300, 1, 5); assert.near(f.fw, 300);
    });

    test('clamp: a moldura nunca sai da imagem (zoom 1, zoom 2, girada e com ajuste fino)', () => {
      const base = { rot: 0, flip: false, fine: 0, zoom: 1, cx: 0, cy: 0 };
      let n = M().norm(Object.assign({}, base, { cx: 999, cy: 999 }), 400, 300, 1, 5);
      assert.near(n.cx, 50); assert.near(n.cy, 0, 1e-9);
      n = M().norm(Object.assign({}, base, { cx: -999, cy: -999 }), 400, 300, 1, 5);
      assert.near(n.cx, -50); assert.near(n.cy, 0, 1e-9);
      n = M().norm(Object.assign({}, base, { zoom: 2, cx: 999, cy: -999 }), 400, 300, 1, 5);
      assert.near(n.cx, 125); assert.near(n.cy, -75);
      n = M().norm(Object.assign({}, base, { rot: 1, cx: 999, cy: 999 }), 400, 300, 1, 5);   // vista 300×400: só o y tem folga
      assert.near(n.cx, 0, 1e-9); assert.near(n.cy, 50);
      assert.eq(M().norm(Object.assign({}, base, { rot: 5 }), 400, 300, 1, 5).rot, 1, 'rot é módulo 4');
      assert.eq(M().norm(Object.assign({}, base, { rot: -1 }), 400, 300, 1, 5).rot, 3);
      assert.eq(M().norm(Object.assign({}, base, { fine: 80 }), 400, 300, 1, 5).fine, 45, 'ajuste fino limitado a ±45');
      assert.eq(M().norm(Object.assign({}, base, { zoom: 'x', cx: 'y' }), 400, 300, 1, 5).cx, 0, 'lixo vira padrão');
      // com ajuste fino: os 4 cantos da moldura têm de ficar dentro da imagem girada, mesmo empurrando o centro para longe
      for (const fine of [-30, -7.5, 5, 20, 45]) for (const zoom of [1, 1.7, 4]) for (const a of [0, 1, 4 / 3, 0.5]) {
        const s = M().norm({ rot: 0, flip: false, fine, zoom, cx: 9999, cy: -9999 }, 400, 300, a, 5), f = M().frame(s, 400, 300, a, 5), c = Math.cos(f.th), si = Math.sin(f.th);
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
          const px = s.cx + sx * f.fw / 2, py = s.cy + sy * f.fh / 2;
          const qx = px * c + py * si, qy = -px * si + py * c;   // volta ao sistema da imagem
          assert.ok(Math.abs(qx) <= f.W / 2 + 1e-6 && Math.abs(qy) <= f.H / 2 + 1e-6, 'canto fora: fine=' + fine + ' zoom=' + zoom + ' aspect=' + a);
        });
      }
    });

    test('giro e espelho: o centro acompanha, 4 giros voltam ao início, espelho duplo é identidade, giro depois do espelho', () => {
      const s = { rot: 0, flip: false, fine: 0, zoom: 2, cx: 10, cy: 20 };
      const r = M().rotate(s, 1);
      assert.deepEq([r.rot, r.cx, r.cy], [1, -20, 10], 'horário: (x, y) → (-y, x)');
      assert.deepEq(M().rotate(M().rotate(M().rotate(M().rotate(s, 1), 1), 1), 1), s);
      assert.deepEq(M().rotate(s, -1), M().rotate(s, 3), 'anti-horário = 3 horários');
      assert.deepEq(M().rotate(M().rotate(s, -1), 1), s);
      assert.deepEq(M().flip(M().flip(s)), s);
      const f = M().flip(Object.assign({}, s, { rot: 1, fine: 10 }));
      assert.deepEq([f.flip, f.rot, f.fine, f.cx], [true, 3, -10, -10], 'espelho na tela: troca o sentido do giro e do ajuste');
    });

    test('retângulo de origem (cropRect): centro, giro e espelho mapeados de volta para a imagem', () => {
      const s = { rot: 0, flip: false, fine: 0, zoom: 1, cx: 0, cy: 0 };
      assert.deepEq(M().cropRect(s, 400, 300, 1, 5), { x: 50, y: 0, w: 300, h: 300, fine: 0 });
      assert.near(M().cropRect(Object.assign({}, s, { cx: 50 }), 400, 300, 1, 5).x, 100);
      assert.near(M().cropRect(Object.assign({}, s, { zoom: 2 }), 400, 300, 1, 5).x, 125);
      // 90° horário: o topo da vista é a esquerda da imagem de origem
      const r = M().cropRect(Object.assign({}, s, { rot: 1, cy: -50 }), 400, 300, 1, 5);
      assert.near(r.x, 0); assert.near(r.w, 300);
      // espelho: ir para a direita na vista = ir para a esquerda na origem
      assert.near(M().cropRect(Object.assign({}, s, { flip: true, cx: 50 }), 400, 300, 1, 5).x, 0);
      // livre com giro: 300×400 na vista = 400×300 na origem
      const l = M().cropRect(Object.assign({}, s, { rot: 1 }), 400, 300, 0, 5);
      assert.near(l.w, 400); assert.near(l.h, 300);
    });

    test('tamanho de saída: limite de 1600 no maior lado, nunca amplia, outputWidth e maxWidth/maxHeight', () => {
      let z = M().outSize(3000, 2000, {}); assert.deepEq([z.w, z.h], [1600, 1067]);
      z = M().outSize(2000, 3000, {}); assert.deepEq([z.w, z.h], [1067, 1600]);
      z = M().outSize(400, 300, {}); assert.deepEq([z.w, z.h], [400, 300], 'não amplia');
      z = M().outSize(400, 300, { outputWidth: 2000 }); assert.eq(z.w, 400, 'outputWidth acima do original é cortado');
      z = M().outSize(400, 300, { outputWidth: 200 }); assert.deepEq([z.w, z.h], [200, 150]);
      z = M().outSize(3000, 2000, { maxWidth: 800, maxHeight: 800 }); assert.deepEq([z.w, z.h], [800, 533]);
      z = M().outSize(3000, 2000, { maxWidth: 0, maxHeight: 0 }); assert.eq(z.w, 3000, '0 = sem limite');
      z = M().outSize(20000, 100, { maxWidth: 0 }); assert.ok(z.w <= 8192, 'teto de segurança do canvas');
      z = M().outSize(1, 1000, {}); assert.ok(z.w >= 1, 'nunca 0');
    });

    test('parseAspect: número, "4/3", "4:3", livre e lixo', () => {
      assert.eq(M().parseAspect(1), 1); assert.near(M().parseAspect('4/3'), 4 / 3); assert.near(M().parseAspect('3:4'), 0.75);
      assert.near(M().parseAspect('16x9'), 16 / 9); assert.eq(M().parseAspect(0), 0); assert.eq(M().parseAspect('0'), 0);
      assert.eq(M().parseAspect('abc'), 0); assert.eq(M().parseAspect(null), 0); assert.eq(M().parseAspect(-2), 0); assert.eq(M().parseAspect('4/0'), 0);
      assert.eq(M().parseAspect(1000), 10, 'limitado');
    });

    /* ---------------- leitores de cabeçalho ---------------- */
    test('leitor EXIF: JPEG sintético com cada orientação (little e big endian) e dimensões do SOF', () => {
      for (let o = 1; o <= 8; o++) for (const be of [false, true]) {
        const j = M().jpegInfo(jpeg(o, 640, 480, be));
        assert.deepEq([j.o, j.w, j.h], [o, 640, 480], 'orientação ' + o + (be ? ' (BE)' : ' (LE)'));
      }
      assert.eq(M().jpegInfo(jpeg(9)).o, 1, 'valor fora de 1..8 é ignorado');
      assert.eq(M().jpegInfo(jpeg(0)).o, 1);
      assert.eq(M().kindOf(jpeg(1)), 'jpeg');
    });

    test('leitor EXIF: cabeçalhos truncados, malformados e aleatórios nunca lançam exceção nem travam', () => {
      const bom = jpeg(6, 100, 50);
      let n = 0;
      for (let k = 0; k <= bom.length; k++) { try { M().jpegInfo(bom.subarray(0, k)); M().imageInfo(bom.subarray(0, k), 'jpeg'); n++; } catch (e) { throw new Error('lançou com ' + k + ' bytes: ' + e.message); } }
      assert.eq(n, bom.length + 1);
      assert.eq(M().jpegInfo(new Uint8Array(0)), null);
      assert.eq(M().jpegInfo(new Uint8Array([0xFF, 0xD8])), null, 'só SOI: sem erro');
      let sem = 123456789;
      const rnd = () => (sem = (sem * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
      for (let i = 0; i < 400; i++) {   // fuzz: bytes do JPEG bom trocados ao acaso
        const m = Uint8Array.from(bom);
        for (let j = 0; j < 1 + Math.floor(rnd() * 6); j++) m[Math.floor(rnd() * m.length)] = Math.floor(rnd() * 256);
        const cut = m.subarray(0, 2 + Math.floor(rnd() * (m.length - 1)));
        M().jpegInfo(cut); M().imageInfo(cut, 'jpeg'); M().kindOf(cut);
      }
      // comprimento de segmento gigante, offset do IFD gigante e contagem enorme de entradas
      const ruim1 = Uint8Array.from(bom); ruim1[4] = 0xFF; ruim1[5] = 0xFF;
      assert.ok(M().jpegInfo(ruim1), 'segmento gigante: devolve o que achou');
      const ruim2 = Uint8Array.from(bom); ruim2[16] = 0xFF; ruim2[17] = 0xFF; ruim2[18] = 0xFF; ruim2[19] = 0x7F;
      assert.eq(M().jpegInfo(ruim2).o, 1, 'IFD fora do segmento');
      const ruim3 = Uint8Array.from(bom); ruim3[20] = 0xFF; ruim3[21] = 0xFF;
      assert.eq(M().jpegInfo(ruim3).o, 6, 'contagem de entradas enorme: lê só as primeiras (limite) e não passa do segmento');
      // muitos segmentos (laço limitado) e arquivo gigante só lê o começo
      const muitos = new Uint8Array(70000); muitos[0] = 0xFF; muitos[1] = 0xD8;
      for (let p = 2; p + 4 < muitos.length; p += 4) { muitos[p] = 0xFF; muitos[p + 1] = 0xE5; muitos[p + 2] = 0; muitos[p + 3] = 2; }
      assert.ok(M().jpegInfo(muitos), 'laço termina');
    });

    test('dimensões pelo cabeçalho: PNG, GIF, WebP (VP8X, VP8L, VP8) e lixo', () => {
      assert.deepEq(M().imageInfo(pngHdr(1234, 567), 'png'), { w: 1234, h: 567 });
      const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x2C, 0x01, 0xC8, 0, 0, 0]);
      assert.deepEq(M().imageInfo(gif, 'gif'), { w: 300, h: 200 });
      const riff = (tag, corpo) => { const u = new Uint8Array(30); u.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], 0); u.set([...tag].map(c => c.charCodeAt(0)), 12); u.set(corpo, 20); return u; };
      const x = riff('VP8X', [0, 0, 0, 0, 99, 0, 0, 49, 0, 0]);
      assert.deepEq(M().imageInfo(x, 'webp'), { w: 100, h: 50 }, 'VP8X');
      const v = 99 | (49 << 14), l = riff('VP8L', [0x2F, v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]);
      assert.deepEq(M().imageInfo(l, 'webp'), { w: 100, h: 50 }, 'VP8L');
      const y = riff('VP8 ', [0, 0, 0, 0x9D, 0x01, 0x2A, 100, 0, 50, 0]);
      assert.deepEq(M().imageInfo(y, 'webp'), { w: 100, h: 50 }, 'VP8');
      assert.eq(M().imageInfo(new Uint8Array(5), 'png'), null);
      assert.eq(M().imageInfo(new Uint8Array(40), 'webp'), null);
      assert.eq(M().imageInfo(pngHdr(1, 1), 'xyz'), null);
    });

    /* ---------------- validação de tipo e limites (sem decodificar) ---------------- */
    test('tipo: só PNG/JPEG/WebP/GIF pela ASSINATURA; SVG, HTML, PHP e extensão trocada são recusados', async t => {
      const ok = await IE().check(PNG1());
      assert.deepEq([ok.kind, ok.w, ok.h], ['png', 1, 1]);
      assert.eq((await IE().check(arq(pngHdr(8, 8), 'foto.jpg', 'image/jpeg'))).kind, 'png', 'PNG com nome .jpg: o conteúdo manda');
      assert.eq((await IE().check(arq(jpeg(6, 60, 30), 'a.jpg', 'image/jpeg'))).w, 60);
      const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
      const e1 = await assert.rejects(IE().check(arq(svg, 'x.svg', 'image/svg+xml')), /SVG/);
      assert.eq(e1.code, 'svg');
      assert.eq((await assert.rejects(IE().check(arq(svg, 'x.png', 'image/png')))).code, 'svg', 'SVG disfarçado de .png também');
      assert.eq((await assert.rejects(IE().check(arq('<!doctype html><script>1</script>', 'p.png', 'image/png')))).code, 'badType', 'HTML com nome .png');
      assert.eq((await assert.rejects(IE().check(arq('<?php system($_GET[1]);', 'shell.jpg', 'image/jpeg')))).code, 'badType', 'PHP com nome .jpg');
      assert.eq((await assert.rejects(IE().check(arq('MZ\x90\x00', 'a.png', 'image/png')))).code, 'badType', 'executável com nome .png');
      assert.eq((await assert.rejects(IE().check(arq('', 'vazio.png', 'image/png')))).code, 'badType', 'arquivo vazio');
      assert.eq((await assert.rejects(IE().check(arq('%PDF-1.4', 'a.png', 'image/png')))).code, 'badType', 'PDF');
      assert.eq((await assert.rejects(IE().check(arq(new Uint8Array([0x42, 0x4D, 0, 0, 0, 0, 0, 0]), 'a.bmp', 'image/bmp')))).code, 'badType', 'BMP não está na lista');
    });

    test('origem: só File/Blob ou data:/blob: gerado pela página; URL externa, relativa e esquemas perigosos são recusados', async t => {
      for (const u of ['http://exemplo.com/a.png', 'https://exemplo.com/a.png', '/img/a.png', 'a.png', '//evil.com/a.png', 'javascript:alert(1)', 'file:///etc/passwd', 'data:text/html;base64,PHNjcmlwdD4=', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 42, {}, null])
        assert.eq((await assert.rejects(IE().check(u), null, String(u))).code, 'badSrc', String(u));
      let bin = ''; pngHdr(3, 2).forEach(b => { bin += String.fromCharCode(b); });
      const r = await IE().check('data:image/png;base64,' + btoa(bin));
      assert.deepEq([r.kind, r.w, r.h], ['png', 3, 2], 'data: PNG válido');
      let falso = ''; for (const c of '<svg></svg>') falso += c;
      assert.eq((await assert.rejects(IE().check('data:image/png;base64,' + btoa(falso)))).code, 'svg', 'data:image/png com SVG dentro');
      assert.eq((await assert.rejects(IE().check('data:image/png;base64,@@@'))).code, 'decode', 'base64 inválido');
    });

    test('limites: tamanho do arquivo, dimensões (12000) e megapixels (64) são recusados ANTES de decodificar', async t => {
      const bm = window.createImageBitmap, espia = t.spy();
      if (bm) { window.createImageBitmap = function () { espia(); return bm.apply(this, arguments); }; t.cleanup(() => { window.createImageBitmap = bm; }); }
      assert.eq((await assert.rejects(IE().check(arq(pngHdr(20000, 20000), 'bomba.png', 'image/png')))).code, 'dims', 'PNG 20000×20000');
      assert.eq((await assert.rejects(IE().check(arq(pngHdr(12001, 10), 'a.png')))).code, 'dims');
      assert.eq((await IE().check(arq(pngHdr(12000, 1000), 'a.png'))).w, 12000, '12000 é aceito');
      assert.eq((await assert.rejects(IE().check(arq(pngHdr(10000, 7000), 'a.png')))).code, 'pixels', '70 MP');
      assert.eq((await assert.rejects(IE().check(arq(jpeg(1, 13000, 100), 'a.jpg')))).code, 'dims', 'JPEG largo demais');
      assert.eq((await assert.rejects(IE().check(arq(new Uint8Array([...pngHdr(1, 1), ...new Uint8Array(2000)]), 'a.png'), { maxSize: 1000 }))).code, 'tooBig');
      assert.eq((await assert.rejects(IE().check(arq(pngHdr(1, 1), 'a.png'), { maxDimension: 0 }))).code, 'dims', 'limites configuráveis');
      assert.eq((await assert.rejects(IE().check(arq(pngHdr(5000, 5000), 'a.png'), { maxPixels: 1e6 }))).code, 'pixels');
      assert.eq((await assert.rejects(IE().check(arq(pngHdr(0, 5), 'a.png')))).code, 'decode', 'dimensão zero');
      assert.eq(espia.count, 0, 'nenhuma decodificação foi tentada');
      // arquivo de 16 MB (limite padrão de 15 MB): recusado sem ler tudo
      const grande = new Uint8Array(16 * 1048576); grande.set(pngHdr(10, 10));
      assert.eq((await assert.rejects(IE().check(arq(grande, 'g.png', 'image/png')))).code, 'tooBig');
    });

    test('componente: arquivo recusado dispara error, mostra a mensagem como TEXTO e não trava (nome hostil não vira HTML)', async t => {
      const ed = t.create({ xtype: 'imageeditor' }), er = t.spy();
      ed.on('error', er);
      await ed.load(arq('<svg xmlns="http://www.w3.org/2000/svg"/>', '<img src=x onerror=window.__ie=1>.svg', 'image/svg+xml'));
      assert.eq(er.count, 1);
      assert.eq(er.lastArgs[2], 'svg');
      assert.eq(ed.msgEl.hidden, false); assert.contains(ed.msgEl, 'SVG');
      assert.eq(ed.el.querySelector('img'), null, 'nome do arquivo nunca vira HTML');
      assert.eq(window.__ie, undefined);
      assert.eq(ed.isReady(), false);
      assert.eq(ed.emptyEl.hidden, false, 'volta ao botão "Escolher imagem"');
      await ed.load('https://exemplo.com/a.png');
      assert.eq(er.lastArgs[2], 'badSrc');
      await ed.load(PNG1());   // só o cabeçalho: sem decodificador (jsdom) ou imagem corrompida (navegador) → erro claro, sem exceção
      assert.ok(['support', 'decode'].includes(er.lastArgs[2]), 'código: ' + er.lastArgs[2]);
      assert.eq(ed.stage.getAttribute('aria-busy'), 'false');
      assert.eq(await ed.getBlob().catch(e => e.code), 'noImage', 'sem imagem não exporta');
    });

    /* ---------------- interação (contexto 2D falso) ---------------- */
    test('teclado: setas movem 10 px (Shift 1 px), + e − dão zoom, [ e ] giram, Esc não é consumido', async t => {
      const ed = editorFalso(t, { aspect: 1 }), mudou = t.spy();
      ed.on('change', mudou);
      ed.zoomTo(2);   // com zoom 2 há folga nos dois eixos
      const ps = () => ed._geom().ps;
      let x0 = ed._s.cx;
      let ev = tecla(ed.stage, 'ArrowRight');
      assert.ok(ev.defaultPrevented);
      assert.near(ed._s.cx, x0 - 10 / ps(), 1e-6, 'a imagem anda 10 px de tela para a direita');
      x0 = ed._s.cx; tecla(ed.stage, 'ArrowLeft', { shiftKey: true });
      assert.near(ed._s.cx, x0 + 1 / ps(), 1e-6, 'Shift = 1 px');
      const y0 = ed._s.cy; tecla(ed.stage, 'ArrowDown'); assert.near(ed._s.cy, y0 + (-10 / ps()), 1e-6);
      const z0 = ed._s.zoom;
      tecla(ed.stage, '+'); assert.near(ed._s.zoom, z0 * 1.1, 1e-9);
      tecla(ed.stage, '-'); assert.near(ed._s.zoom, z0, 1e-9);
      tecla(ed.stage, '['); assert.eq(ed._s.rot, 3);
      tecla(ed.stage, ']'); assert.eq(ed._s.rot, 0);
      const esc = tecla(ed.stage, 'Escape'); assert.notOk(esc.defaultPrevented, 'Esc fica para a janela');
      assert.notOk(tecla(ed.stage, 'a').defaultPrevented);
      assert.notOk(tecla(ed.stage, '+', { ctrlKey: true }).defaultPrevented, 'Ctrl++ é do navegador');
      await t.sleep(60);
      assert.ok(mudou.count >= 1 && mudou.count <= 12, 'change agrupado por quadro: ' + mudou.count);
      assert.eq(typeof mudou.lastArgs[1].zoom, 'number');
    });

    test('zoom e giro: limites 1..maxZoom, slider, botões, espelhar, redefinir e getState/getCrop', async t => {
      const ed = editorFalso(t, { aspect: 1, maxZoom: 4 });
      ed.zoomTo(99); assert.eq(ed._s.zoom, 4); ed.zoomTo(0); assert.eq(ed._s.zoom, 1); ed.zoomTo('abc'); assert.eq(ed._s.zoom, 1);
      assert.eq(ed.zoomR.max, '4');
      ed.zoomR.value = '2.5'; ed.zoomR.dispatchEvent(new Event('input', { bubbles: true }));
      assert.near(ed._s.zoom, 2.5);
      assert.eq(ed.zoomR.getAttribute('aria-valuetext'), '2.5×');
      ed.rotL.click(); assert.eq(ed._s.rot, 3);
      ed.rotR.click(); ed.rotR.click(); assert.eq(ed._s.rot, 1);
      ed.rotate(180); assert.eq(ed._s.rot, 3); ed.rotate(-270); assert.eq(ed._s.rot, 0, '-270° = 90° horário');
      ed.flipB.click(); assert.eq(ed._s.flip, true); ed.flip(); assert.eq(ed._s.flip, false);
      const c = ed.getCrop(); assert.ok(c.w > 0 && c.h > 0);
      assert.eq(ed.getState().aspect, 1);
      ed.resetB.click();
      assert.deepEq([ed._s.rot, ed._s.flip, ed._s.zoom, ed._s.cx, ed._s.cy], [0, false, 1, 0, 0]);
      assert.deepEq(ed.getCrop(), { x: 50, y: 0, w: 300, h: 300, fine: 0 });
      ed.setAspect(0); assert.near(ed.getCrop().w, 400);
      ed.setAspect('4/3'); assert.near(ed.getCrop().h, 300);
    });

    test('ajuste fino (fineRotate): slider -45..45, saída mostrada e sem o slider quando desligado', t => {
      const ed = editorFalso(t, { aspect: 1, fineRotate: true });
      assert.ok(ed.fineR, 'slider existe');
      ed.fineR.value = '20'; ed.fineR.dispatchEvent(new Event('input', { bubbles: true }));
      assert.eq(ed._s.fine, 20); assert.eq(ed.fineO.textContent, '20°');
      ed.setFine(99); assert.eq(ed._s.fine, 45);
      ed.setFine(-99); assert.eq(ed._s.fine, -45);
      ed.reset(); assert.eq(ed._s.fine, 0);
      const sem = editorFalso(t, { aspect: 1 });
      assert.notOk(sem.fineR, 'sem fineRotate não há slider'); sem.setFine(10); assert.eq(sem._s.fine, 0);
    });

    test('ponteiro: arrastar move (com clamp), roda do mouse dá zoom ancorado, pinça amplia; sem imagem nada acontece', async t => {
      const ed = editorFalso(t, { aspect: 1 });
      ed.zoomTo(3);
      const c0 = [ed._s.cx, ed._s.cy], ps = ed._geom().ps;
      ptr(ed.stage, 'pointerdown', 100, 100); ptr(ed.stage, 'pointermove', 130, 120);
      assert.near(ed._s.cx, c0[0] - 30 / ps, 1e-6); assert.near(ed._s.cy, c0[1] - 20 / ps, 1e-6);
      assert.ok(ed.stage.classList.contains('r4-ie-grab'));
      ptr(ed.stage, 'pointermove', 100000, 100000);   // arrasto absurdo: a moldura fica dentro da imagem
      const g = ed._geom(), lim = M().frame(ed._s, 400, 300, 1, 5);
      assert.ok(Math.abs(ed._s.cx) <= lim.lx + 1e-6 && Math.abs(ed._s.cy) <= lim.ly + 1e-6, 'clamp');
      ptr(ed.stage, 'pointerup', 0, 0);
      assert.notOk(ed.stage.classList.contains('r4-ie-grab'));
      const z = ed._s.zoom;
      const w = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true, clientX: 10, clientY: 10 });
      ed.stage.dispatchEvent(w);
      assert.ok(w.defaultPrevented, 'a roda não rola a página');
      assert.gt(ed._s.zoom, z);
      ed.stage.dispatchEvent(new WheelEvent('wheel', { deltaY: 100000, bubbles: true, cancelable: true }));
      assert.eq(ed._s.zoom, 1, 'roda para baixo até o mínimo');
      if (window.PointerEvent) {
        ptr(ed.stage, 'pointerdown', 100, 100, 1); ptr(ed.stage, 'pointerdown', 200, 100, 2);
        ptr(ed.stage, 'pointermove', 300, 100, 2);   // distância dobra
        assert.near(ed._s.zoom, 2, 0.2, 'pinça');
        ptr(ed.stage, 'pointerup', 0, 0, 1); ptr(ed.stage, 'pointerup', 0, 0, 2);
      }
      const vazio = t.create({ xtype: 'imageeditor' });
      ptr(vazio.stage, 'pointerdown', 1, 1); tecla(vazio.stage, 'ArrowLeft'); vazio.zoomTo(3); vazio.rotate(90); vazio.flip(); vazio.reset();
      assert.eq(vazio.getCrop(), null);
    });

    test('estrutura e acessibilidade: role=application, aria-describedby, rótulos nos botões, touch-action só na área, sem inline handlers', () => {
      const ed = R4.create({ xtype: 'imageeditor', renderTo: document.body, fineRotate: true });
      try {
        assert.eq(ed.stage.getAttribute('role'), 'application');
        assert.ok(ed.stage.getAttribute('aria-label'));
        assert.eq(document.getElementById(ed.stage.getAttribute('aria-describedby')), ed.help, 'instruções ligadas à área');
        assert.ok(ed.help.textContent.length > 20);
        assert.eq(ed.stage.tabIndex, 0);
        [ed.zOut, ed.zIn, ed.rotL, ed.rotR].forEach(b => { assert.ok(b.getAttribute('aria-label') && b.title, 'botão sem rótulo: ' + b.className); assert.eq(b.type, 'button'); });
        [ed.zoomR, ed.fineR].forEach(r => assert.ok(r.getAttribute('aria-label')));
        assert.ok(ed.flipB.textContent.includes('Espelhar') || ed.flipB.title, 'texto visível do espelhar');
        assert.eq(ed.msgEl.getAttribute('role'), 'alert');
        assert.eq(ed.el.querySelectorAll('[onclick],[onpointerdown],[onkeydown]').length, 0);
        assert.eq(ed.cv.getAttribute('aria-hidden'), 'true');
        assert.eq(ed.zoomR.disabled, true, 'sem imagem os controles ficam desabilitados');
      } finally { ed.destroy(); }
    });

    test('tag <r4-imageeditor>, função R4.imageeditor(alvo, ...) e meta (grupo Dados, playground, eventos)', async t => {
      t.html('<r4-imageeditor aspect="4/3" shape="circle" fine-rotate max-zoom="4" max-width="800" format="webp" quality="0.7"></r4-imageeditor>');
      const ed = Object.values(R4.instances).find(c => c.xtype === 'imageeditor' && t.box.contains(c.el));
      assert.ok(ed, 'montou pela tag');
      assert.near(ed._asp(), 4 / 3); assert.eq(ed.shape, 'circle'); assert.eq(ed.fineRotate, true); assert.eq(ed.maxZoom, 4);
      assert.eq(ed.maxWidth, 800); assert.eq(ed.format, 'webp'); assert.eq(ed.quality, 0.7);
      assert.deepEq(t.logs.warn, [], 'nenhum atributo desconhecido');
      const f = R4.imageeditor(t.box, { aspect: 2 });
      assert.eq(f.aspect, 2); assert.ok(f.el.classList.contains('r4-ie'));
      const g = R4.imageeditor(t.box, undefined, { aspect: 3 }); assert.eq(g.aspect, 3);
      const meta = R4.registry.imageeditor.meta;
      assert.eq(meta.group, 'Dados'); assert.ok(meta.props.length >= 10); assert.deepEq(meta.events, ['ready', 'change', 'error']);
      assert.ok(meta.playground && meta.playground.html.includes('<r4-imageeditor{attrs}>') && meta.playground.controls.aspect);
      assert.eq(typeof IE().open, 'function'); assert.eq(typeof IE()._math.frame, 'function');
      assert.ok(window.R4Demos.imageeditor.length >= 5, 'demos registradas');
    });

    test('i18n: chaves r4.imageeditor.* em pt-BR e en', async t => {
      const chaves = ['title', 'area', 'help', 'zoom', 'zoomIn', 'zoomOut', 'rotateL', 'rotateR', 'flip', 'reset', 'fine', 'apply', 'choose', 'empty', 'loading',
        'badType', 'svg', 'tooBig', 'dims', 'pixels', 'decode', 'support', 'badSrc', 'noImage', 'encode'];
      const antes = R4.i18n.locale;
      t.cleanup(() => R4.i18n.set(antes, { persist: false }));
      for (const loc of ['pt-BR', 'en']) {
        R4.i18n.set(loc, { persist: false });
        chaves.forEach(k => assert.notEq(R4.t('r4.imageeditor.' + k, { name: 'a', size: '1', max: '2', w: 1, h: 2, mp: 64 }), 'r4.imageeditor.' + k, loc + ' sem ' + k));
      }
      R4.i18n.set('pt-BR', { persist: false });
      assert.eq(R4.t('r4.imageeditor.apply'), 'Aplicar');
      R4.i18n.set('en', { persist: false });
      assert.eq(R4.t('r4.imageeditor.apply'), 'Apply');
    });

    test('destroy(): sem listeners sobrando em document/window, fecha o bitmap, libera o canvas, cancela o quadro agendado e é idempotente', async t => {
      let ed;
      const sobras = await R4Test.leaks(async () => {
        ed = R4.create({ xtype: 'imageeditor', renderTo: document.body, fineRotate: true, aspect: 1 });
        ed.cv.getContext = () => ctxFalso();
        ed._img = { w: 400, h: 300, src: null, closed: false, close() { this.closed = true; } };
        ed._ctl(true); ed._cw = 0; ed._resize();
        ed.zoomTo(2);   // agenda um quadro
        const im = ed._img, el = ed.el, id = ed.id, destruiu = t.spy();
        ed.on('destroy', destruiu);
        ed.destroy(); ed.destroy();
        assert.eq(destruiu.count, 1, 'destroy uma vez só');
        assert.eq(im.closed, true, 'bitmap fechado');
        assert.eq(ed._img, null);
        assert.eq(ed.cv.width, 0, 'canvas liberado');
        assert.eq(el.isConnected, false);
        assert.eq(R4.instances[id], undefined);
      });
      assert.deepEq(sobras, [], 'ouvintes que ficaram: ' + sobras.join(','));
      const mudou = t.spy(); ed.on('change', mudou);
      await t.sleep(50);
      assert.eq(mudou.count, 0, 'nenhum quadro depois do destroy');
      ed.zoomTo(3); ed.rotate(90); ed.load(PNG1());   // depois de destruído: não lança
      await t.sleep(20);
    });

    test('getFile: nome saneado, extensão coerente com o formato, tipo certo (Blob simulado)', async t => {
      const ed = editorFalso(t, {});
      let formato = 'image/jpeg';
      ed.getBlob = async o => new Blob(['x'], { type: (o && o.format === 'png') ? 'image/png' : (o && o.format === 'webp') ? 'image/webp' : formato });
      let f = await ed.getFile('foto.png'); assert.deepEq([f.name, f.type], ['foto.jpg', 'image/jpeg']);
      f = await ed.getFile('minha foto.jpeg', { format: 'png' }); assert.deepEq([f.name, f.type], ['minha foto.png', 'image/png']);
      f = await ed.getFile('x.JPG', { format: 'webp' }); assert.deepEq([f.name, f.type], ['x.webp', 'image/webp']);
      f = await ed.getFile('..\\..\\etc/passwd\u0000<b>.php.jpg'); assert.ok(!/[\\/<>\u0000]/.test(f.name) && f.name.endsWith('.jpg'), 'nome: ' + f.name);
      f = await ed.getFile(); assert.match(f.name, /^imagem\.jpg$/);
      f = await ed.getFile('RLO‮gpj.exe'); assert.ok(!/‮/.test(f.name) && !/\.exe/i.test(f.name) && f.name.endsWith('.jpg'), 'bidi e dupla extensão neutralizados: ' + f.name);
      ed._name = 'original.webp'; f = await ed.getFile(); assert.eq(f.name, 'original.jpg', 'padrão = nome do original');
      assert.ok(f instanceof File);
    });

    /* ---------------- janela modal: R4.imageeditor.open ---------------- */
    test('open(): arquivo recusado rejeita ANTES de abrir a janela', async t => {
      const antes = document.querySelectorAll('.r4-ie-modal').length;
      await assert.rejects(IE().open(arq('<svg/>', 'a.svg', 'image/svg+xml')), /SVG/);
      await assert.rejects(IE().open(arq('texto', 'a.png', 'image/png')), /formato|format/);
      assert.eq(document.querySelectorAll('.r4-ie-modal').length, antes, 'nenhuma janela aberta');
    });

    test('open(): Esc cancela (null), foco volta a quem abriu, janela e editor destruídos; clique fora e Cancelar também cancelam', async t => {
      const gatilho = document.createElement('button'); gatilho.textContent = 'abrir'; t.box.append(gatilho);
      const total = () => Object.values(R4.instances).filter(c => c.xtype === 'imageeditor').length;
      const n0 = total();
      for (const como of ['esc', 'fora', 'cancelar']) {
        gatilho.focus();
        const p = IE().open(PNG1());
        await t.waitFor(() => document.querySelector('.r4-ie-modal .r4-window'), 1000, 'janela');
        const mask = document.querySelector('.r4-ie-modal');
        assert.eq(mask.querySelector('.r4-window').getAttribute('aria-modal'), 'true');
        assert.eq(total(), n0 + 1);
        assert.eq(document.activeElement.classList.contains('r4-ie-stage'), true, 'foco vai para a área de edição');
        if (como === 'esc') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        else if (como === 'fora') mask.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        else [...mask.querySelectorAll('.r4-foot .r4-btn')].find(b => !b.classList.contains('r4-btn-primary')).click();
        assert.eq(await p, null, como);
        assert.eq(document.querySelector('.r4-ie-modal'), null, 'janela removida (' + como + ')');
        assert.eq(total(), n0, 'editor destruído (' + como + ')');
        assert.eq(document.activeElement, gatilho, 'foco devolvido (' + como + ')');
      }
    });

    test('open(): Tab é preso na janela (volta do último ao primeiro e vice-versa) e Aplicar só vale com imagem pronta', async t => {
      const p = IE().open(PNG1());
      await t.waitFor(() => document.querySelector('.r4-ie-modal .r4-window'), 1000);
      await t.sleep(40);   // a imagem de teste não decodifica: Aplicar fica desabilitado
      const mask = document.querySelector('.r4-ie-modal'), apply = mask.querySelector('.r4-foot .r4-btn-primary');
      assert.eq(apply.disabled, true, 'Aplicar desabilitado sem imagem pronta');
      const cancelar = [...mask.querySelectorAll('.r4-foot .r4-btn')].find(b => b !== apply);
      cancelar.focus();
      const ev = tecla(cancelar, 'Tab');
      assert.ok(ev.defaultPrevented, 'Tab no último volta ao primeiro');
      assert.ok(mask.contains(document.activeElement) && document.activeElement !== cancelar, 'foco continua dentro da janela');
      const primeiro = document.activeElement;
      const ev2 = tecla(primeiro, 'Tab', { shiftKey: true });
      assert.ok(ev2.defaultPrevented, 'Shift+Tab no primeiro vai ao último');
      assert.eq(document.activeElement, cancelar);
      const lixo = document.createElement('button'); document.body.append(lixo); lixo.focus();
      tecla(mask, 'Tab'); assert.ok(mask.contains(document.activeElement), 'foco fora da janela é trazido de volta');
      lixo.remove();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      assert.eq(await p, null);
    });

    test('open(): Aplicar resolve com o File editado (editor com imagem simulada)', async t => {
      const p = IE().open(PNG1(), { name: 'minha.png' });
      await t.waitFor(() => document.querySelector('.r4-ie-modal .r4-window'), 1000);
      const ed = Object.values(R4.instances).find(c => c.xtype === 'imageeditor');
      await t.sleep(40);
      ed._img = ed._img || { w: 10, h: 10, src: null, close() {} };
      ed.getFile = async nome => { assert.eq(nome, 'minha.png'); return arq('editado', 'minha.jpg', 'image/jpeg'); };
      const apply = document.querySelector('.r4-ie-modal .r4-foot .r4-btn-primary');
      apply.disabled = false; apply.click();
      const f = await p;
      assert.ok(f instanceof File); assert.eq(f.name, 'minha.jpg');
      assert.eq(document.querySelector('.r4-ie-modal'), null);
    });

    /* ---------------- integração com o filedrop ---------------- */
    function stubOpen(t, impl) {
      const real = IE().open, chamadas = [];
      IE().open = async (f, o) => { chamadas.push({ f, o }); return impl(f, o); };
      t.cleanup(() => { IE().open = real; });
      return chamadas;
    }
    test('filedrop edit="image": imagem passa pelo editor ANTES da lista; o editado substitui o original; não-imagem segue o fluxo normal', async t => {
      const ch = stubOpen(t, async f => arq('EDITADO', 'ok.jpg', 'image/jpeg'));
      const fd = t.create({ xtype: 'filedrop', edit: 'image', multiple: true }), arqs = t.spy();
      fd.on('files', arqs);
      await fd.add([PNG1(), arq('a;b\n1;2', 'dados.csv', 'text/csv')]);
      assert.eq(ch.length, 1, 'editor aberto só para a imagem');
      assert.eq(ch[0].f.name, 'ok.png');
      assert.deepEq(fd.getFiles().map(f => f.name).sort(), ['dados.csv', 'ok.jpg']);
      const ed = fd.getFiles().find(f => f.name === 'ok.jpg');
      assert.eq(ed.type, 'image/jpeg'); assert.eq(ed.size, 7);
      assert.eq(arqs.count, 1);
      assert.contains(fd.listEl, 'ok.jpg'); assert.notContains(fd.listEl, 'ok.png');
    });

    test('filedrop edit="image": cancelar descarta o arquivo sem erro; padrão (sem edit) não abre o editor', async t => {
      const ch = stubOpen(t, async () => null), inv = t.spy();
      const fd = t.create({ xtype: 'filedrop', edit: 'image', listeners: { invalid: inv } });
      await fd.add([PNG1()]);
      assert.eq(ch.length, 1); assert.eq(fd.getFiles().length, 0, 'cancelou: nada entra'); assert.eq(inv.count, 0, 'sem mensagem de erro');
      assert.eq(fd.msgEl.hidden, true); assert.eq(fd.listEl.hidden, true);
      const normal = t.create({ xtype: 'filedrop' });
      await normal.add([PNG1()]);
      assert.eq(ch.length, 1, 'sem edit o editor não abre'); assert.eq(normal.getFiles().length, 1);
      assert.eq(normal.edit, '');
    });

    test('filedrop edit="image": SVG e imagem falsa são recusados com mensagem (o editor nem abre); opções chegam ao editor', async t => {
      const ch = stubOpen(t, async f => arq('E', 'e.jpg', 'image/jpeg')), inv = t.spy();
      const fd = t.create({ xtype: 'filedrop', edit: 'image', accept: 'image/*', multiple: true, aspect: '4/3', shape: 'circle', maxWidth: 512, quality: 0.7, editOptions: { quality: 0.9, format: 'webp' }, listeners: { invalid: inv } });
      await fd.add([arq('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>', 'x.svg', 'image/svg+xml'), arq('<?php 1;', 'sh.jpg', 'image/jpeg'), PNG1()]);
      assert.eq(ch.length, 1, 'só o PNG verdadeiro abre o editor');
      assert.eq(inv.count, 1);
      assert.eq(inv.lastArgs[1].length, 2, 'dois recusados');
      assert.ok(inv.lastArgs[1].some(e => /SVG/.test(e)), 'mensagem do SVG');
      assert.deepEq(fd.getFiles().map(f => f.name), ['e.jpg']);
      const o = ch[0].o;
      assert.eq(o.aspect, '4/3'); assert.eq(o.shape, 'circle'); assert.eq(o.maxWidth, 512); assert.eq(o.maxHeight, 512);
      assert.eq(o.quality, 0.9, 'editOptions vence os atalhos'); assert.eq(o.format, 'webp');
    });

    test('filedrop edit="image": accept sem JPEG escolhe PNG; o editado ainda precisa respeitar accept e maxSize', async t => {
      const ch = stubOpen(t, async () => arq('x'.repeat(100), 'g.png', 'image/png'));
      const so = t.create({ xtype: 'filedrop', edit: 'image', accept: '.png' });
      await so.add([PNG1()]);
      assert.eq(ch[0].o.format, 'png', 'accept .png → formato png');
      assert.eq(so.getFiles().length, 1);
      const pequeno = t.create({ xtype: 'filedrop', edit: 'image', accept: 'image/*', maxSize: 50 });
      await pequeno.add([PNG1()]);
      assert.eq(pequeno.getFiles().length, 0, 'editado maior que maxSize é recusado');
      assert.contains(pequeno.msgEl, 'muito grande');
      stubOpen(t, async () => arq('x', 'g.gif', 'image/gif'));
      const tipo = t.create({ xtype: 'filedrop', edit: 'image', accept: '.png' });
      await tipo.add([PNG1()]);
      assert.eq(tipo.getFiles().length, 0, 'tipo fora do accept recusado'); assert.contains(tipo.msgEl, 'não permitido');
    });

    test('filedrop edit="image": upload() envia o arquivo JÁ editado (nome e tipo coerentes); atributos HTML sem avisos', async t => {
      stubOpen(t, async f => arq('BYTES-EDITADOS', 'foto.jpg', 'image/jpeg'));
      const m = t.mockFetch({ '/api/foto': { body: { status: 200, retorno: 'ok' } } });
      t.html('<r4-filedrop edit="image" accept="image/*" aspect="1" shape="circle" max-width="256" format="jpeg" quality="0.8"></r4-filedrop>');
      const fd = Object.values(R4.instances).find(c => c.xtype === 'filedrop' && t.box.contains(c.el));
      assert.deepEq([fd.edit, fd.aspect, fd.shape, fd.maxWidth, fd.format, fd.quality], ['image', '1', 'circle', 256, 'jpeg', 0.8]);
      assert.deepEq(t.logs.warn, [], 'nenhum atributo desconhecido');
      await fd.add([arq(pngHdr(4, 4), 'camera-IMG_0001.png', 'image/png')]);
      assert.eq(fd.getFiles().length, 1);
      const r = await fd.upload('/api/foto');
      assert.eq(r[0].ok, true);
      const enviado = m.calls[0].init.body.get('arquivo');
      assert.eq(enviado.name, 'foto.jpg'); assert.eq(enviado.type, 'image/jpeg'); assert.eq(enviado.size, 14, 'o que sai é o editado, não o original');
    });

    test('filedrop: API atual intacta (accept, maxSize, blockExec, sniff, remove/clear) com os novos campos de edição', async t => {
      const fd = t.create({ xtype: 'filedrop', accept: '.png,.csv', multiple: true });
      assert.deepEq([fd.edit, fd.editOptions, fd.aspect, fd.shape, fd.maxWidth, fd.format, fd.quality], ['', {}, '', '', 0, '', 0]);
      await fd.add([PNG1(), arq('<?php 1;', 'a.png', 'image/png'), arq('a;b', 'b.csv', 'text/csv')]);
      assert.deepEq(fd.getFiles().map(f => f.name), ['ok.png', 'b.csv']);
      fd.remove(0); assert.eq(fd.getFiles().length, 1); fd.clear(); assert.eq(fd.getFiles().length, 0);
      assert.deepEq(R4.registry.filedrop.meta.events, ['files', 'data', 'invalid', 'remove', 'upload', 'uploaderror']);
      assert.ok(R4.registry.filedrop.meta.props.some(p => /edit/.test(p.name)), 'documentado');
    });

    /* ---------------- saída real (só com canvas: Chrome/Firefox/Safari) ---------------- */
    test('saída real: recorte sem rotação mantém as cores certas e o tamanho do original (livre)', async t => {
      if (semCanvas()) t.skip(MOTIVO);
      const ed = t.create({ xtype: 'imageeditor', aspect: 0, format: 'png' });
      await ed.load(await gerar(200, 100, quadrantes));
      assert.ok(ed.isReady());
      const p = await pixels(await ed.getBlob());
      assert.deepEq([p.w, p.h], [200, 100]);
      assert.ok(perto(p.at(50, 25), VERM) && perto(p.at(150, 25), VERDE) && perto(p.at(50, 75), AZUL) && perto(p.at(150, 75), AMAR), 'quadrantes');
    });

    test('saída real: moldura 1:1 recorta o centro (pixels conferidos)', async t => {
      if (semCanvas()) t.skip(MOTIVO);
      const ed = t.create({ xtype: 'imageeditor', aspect: 1, format: 'png' });
      await ed.load(await gerar(200, 100, quadrantes));
      const p = await pixels(await ed.getBlob());
      assert.deepEq([p.w, p.h], [100, 100]);
      assert.ok(perto(p.at(25, 25), VERM), 'esq-cima = vermelho'); assert.ok(perto(p.at(75, 25), VERDE), 'dir-cima = verde');
      assert.ok(perto(p.at(25, 75), AZUL), 'esq-baixo = azul'); assert.ok(perto(p.at(75, 75), AMAR), 'dir-baixo = amarelo');
      ed.zoomTo(2);   // moldura 50×50 no centro: só o miolo de cada quadrante
      const z = await pixels(await ed.getBlob());
      assert.deepEq([z.w, z.h], [50, 50], 'zoom 2 = metade da moldura (nunca amplia)');
      assert.ok(perto(z.at(10, 10), VERM) && perto(z.at(40, 10), VERDE) && perto(z.at(10, 40), AZUL) && perto(z.at(40, 40), AMAR));
    });

    test('saída real: girar 90° horário e espelhar levam os quadrantes para o lugar certo', async t => {
      if (semCanvas()) t.skip(MOTIVO);
      const ed = t.create({ xtype: 'imageeditor', aspect: 0, format: 'png' });
      await ed.load(await gerar(200, 100, quadrantes));
      ed.rotate(90);
      let p = await pixels(await ed.getBlob());
      assert.deepEq([p.w, p.h], [100, 200], 'largura e altura trocam');
      assert.ok(perto(p.at(25, 50), AZUL), 'esq-baixo foi para esq-cima'); assert.ok(perto(p.at(75, 50), VERM), 'esq-cima foi para dir-cima');
      assert.ok(perto(p.at(75, 150), VERDE)); assert.ok(perto(p.at(25, 150), AMAR));
      ed.reset(); ed.flip();
      p = await pixels(await ed.getBlob());
      assert.deepEq([p.w, p.h], [200, 100]);
      assert.ok(perto(p.at(50, 25), VERDE) && perto(p.at(150, 25), VERM) && perto(p.at(50, 75), AMAR) && perto(p.at(150, 75), AZUL), 'espelho horizontal');
      ed.reset(); ed.rotate(180);
      p = await pixels(await ed.getBlob());
      assert.ok(perto(p.at(50, 25), AMAR) && perto(p.at(150, 75), VERM), '180°');
      ed.reset(); ed.rotate(-90);
      p = await pixels(await ed.getBlob());
      assert.ok(perto(p.at(25, 50), VERDE) && perto(p.at(75, 50), AMAR), '90° anti-horário');
    });

    test('saída real: maxWidth reduz, nunca amplia acima do original, outputWidth e formato (extensão coerente)', async t => {
      if (semCanvas()) t.skip(MOTIVO);
      const grande = await gerar(400, 200, quadrantes), ed = t.create({ xtype: 'imageeditor', aspect: 0, format: 'png', maxWidth: 100 });
      await ed.load(grande);
      let p = await pixels(await ed.getBlob()); assert.deepEq([p.w, p.h], [100, 50], 'maxWidth 100');
      p = await pixels(await ed.getBlob({ maxWidth: 1600, outputWidth: 150 })); assert.deepEq([p.w, p.h], [150, 75], 'outputWidth');
      p = await pixels(await ed.getBlob({ maxWidth: 1600, outputWidth: 9999 })); assert.eq(p.w, 400, 'não amplia');
      p = await pixels(await ed.getBlob({ maxWidth: 1600, maxHeight: 60 })); assert.eq(p.h, 60, 'maxHeight');
      const pad = t.create({ xtype: 'imageeditor' });   // sem opções: limite de 1600 no maior lado
      await pad.load(await gerar(2400, 800, (x, w, h) => { x.fillStyle = '#336699'; x.fillRect(0, 0, w, h); }));
      p = await pixels(await pad.getBlob()); assert.deepEq([p.w, p.h], [1600, 533], 'padrão 1600');
      const f = await ed.getFile('foto.jpeg', { format: 'png' }); assert.deepEq([f.name, f.type], ['foto.png', 'image/png']);
      const j = await ed.getFile('foto.png', { format: 'jpeg' }); assert.deepEq([j.name, j.type], ['foto.jpg', 'image/jpeg']);
      const w = await ed.getFile('foto.png', { format: 'webp' });
      assert.ok(['image/webp', 'image/jpeg'].includes(w.type), 'webp ou, sem suporte, jpeg: ' + w.type);
      assert.eq(w.name, 'foto.' + (w.type === 'image/webp' ? 'webp' : 'jpg'));
    });

    test('saída real: EXIF/GPS e carga extra anexada NÃO passam para a saída (privacidade)', async t => {
      if (semCanvas()) t.skip(MOTIVO);
      const base = new Uint8Array(await (await gerar(60, 40, quadrantes, 'image/jpeg', 'a.jpg')).arrayBuffer());
      const marca = [...'LIBR4-GPS-MARCADOR-SECRETO'].map(c => c.charCodeAt(0));
      const com = [0xFF, 0xFE, 0, 2 + marca.length, ...marca];                 // segmento de comentário com o marcador
      const cauda = [...'CARGA-EXTRA-APOS-O-EOI'].map(c => c.charCodeAt(0));
      const suja = new Uint8Array([0xFF, 0xD8, ...exifSeg(1, false), ...com, ...base.subarray(2), ...cauda]);
      assert.ok(temTexto(suja, 'LIBR4-GPS-MARCADOR-SECRETO') && temTexto(suja, 'CARGA-EXTRA'), 'a entrada tem o marcador (controle do teste)');
      const ed = t.create({ xtype: 'imageeditor', aspect: 0 });
      await ed.load(arq(suja, 'suja.jpg', 'image/jpeg'));
      assert.ok(ed.isReady(), 'a imagem com EXIF/lixo carregou');
      for (const formato of ['jpeg', 'png', 'webp']) {
        const saida = new Uint8Array(await (await ed.getBlob({ format: formato })).arrayBuffer());
        assert.notOk(temTexto(saida, 'LIBR4-GPS-MARCADOR-SECRETO'), 'marcador removido (' + formato + ')');
        assert.notOk(temTexto(saida, 'CARGA-EXTRA'), 'carga anexada removida (' + formato + ')');
        assert.notOk(temTexto(saida, 'Exif'), 'sem bloco EXIF (' + formato + ')');
      }
    });

    test('saída real: orientação EXIF 6 (foto de celular) é aplicada — a imagem abre em pé e a saída sai em pé', async t => {
      if (semCanvas()) t.skip(MOTIVO);
      const base = new Uint8Array(await (await gerar(40, 20, (x, w, h) => { x.fillStyle = '#ff0000'; x.fillRect(0, 0, w / 2, h); x.fillStyle = '#0000ff'; x.fillRect(w / 2, 0, w / 2, h); }, 'image/jpeg', 'a.jpg')).arrayBuffer());
      const info = await IE().check(arq(new Uint8Array([0xFF, 0xD8, ...exifSeg(6, false), ...base.subarray(2)]), 'celular.jpg', 'image/jpeg'));
      assert.deepEq([info.w, info.h], [40, 20], 'o cabeçalho diz 40×20 (armazenado deitado)');
      const ed = t.create({ xtype: 'imageeditor', aspect: 0, format: 'png' });
      await ed.load(arq(new Uint8Array([0xFF, 0xD8, ...exifSeg(6, false), ...base.subarray(2)]), 'celular.jpg', 'image/jpeg'));
      assert.deepEq([ed._img.w, ed._img.h], [20, 40], 'imagem já em pé (EXIF 6 = 90° horário)');
      const p = await pixels(await ed.getBlob());
      assert.deepEq([p.w, p.h], [20, 40]);
      assert.ok(perto(p.at(10, 8), VERM, 60), 'o lado esquerdo armazenado (vermelho) vai para cima');
      assert.ok(perto(p.at(10, 32), AZUL, 60), 'o lado direito armazenado (azul) vai para baixo');
    });

    test('saída real: PNG transparente vira JPEG com fundo BRANCO; PNG mantém a transparência', async t => {
      if (semCanvas()) t.skip(MOTIVO);
      const ed = t.create({ xtype: 'imageeditor', aspect: 0 });
      await ed.load(await gerar(20, 20, () => { /* totalmente transparente */ }));
      const j = await pixels(await ed.getBlob({ format: 'jpeg' }));
      assert.ok(perto(j.at(10, 10), [255, 255, 255], 12), 'JPEG com fundo branco: ' + j.at(10, 10));
      const n = await pixels(await ed.getBlob({ format: 'png' }));
      assert.eq(n.at(10, 10)[3], 0, 'PNG continua transparente');
      const cor = await ed.getBlob({ format: 'jpeg', background: '#ff0000' }); const c = await pixels(cor);
      assert.ok(perto(c.at(10, 10), VERM, 20), 'fundo configurável');
      const hostil = await pixels(await ed.getBlob({ format: 'jpeg', background: 'url(javascript:1)' }));
      assert.ok(perto(hostil.at(10, 10), [255, 255, 255], 12), 'cor inválida cai no branco');
    });

    test('saída real: com ajuste fino a moldura fica toda dentro da imagem (sem cantos transparentes)', async t => {
      if (semCanvas()) t.skip(MOTIVO);
      const ed = t.create({ xtype: 'imageeditor', aspect: 1.5, fineRotate: true, format: 'png' });
      await ed.load(await gerar(300, 200, (x, w, h) => { x.fillStyle = '#2255cc'; x.fillRect(0, 0, w, h); }));
      for (const fino of [-30, 12, 45]) {
        ed.reset(); ed.setFine(fino); ed.zoomTo(1.05);
        const p = await pixels(await ed.getBlob());
        [[2, 2], [p.w - 3, 2], [2, p.h - 3], [p.w - 3, p.h - 3]].forEach(([x, y]) => assert.gt(p.at(x, y)[3], 250, 'canto (' + x + ',' + y + ') opaco com fine=' + fino));
      }
    });

    test('saída real: imagem de verdade abre pronta, evento ready/change, object URLs criadas são revogadas e destroy() libera tudo', async t => {
      if (semCanvas()) t.skip(MOTIVO);
      const criadas = [], revogadas = [], cu = URL.createObjectURL, ru = URL.revokeObjectURL;
      URL.createObjectURL = function (b) { const u = cu.call(URL, b); criadas.push(u); return u; };
      URL.revokeObjectURL = function (u) { revogadas.push(u); return ru.call(URL, u); };
      t.cleanup(() => { URL.createObjectURL = cu; URL.revokeObjectURL = ru; });
      const pronto = t.spy(), mudou = t.spy(), ed = t.create({ xtype: 'imageeditor', aspect: 1 });
      ed.on('ready', pronto); ed.on('change', mudou);
      await ed.load(await gerar(120, 80, quadrantes));
      assert.eq(pronto.count, 1); assert.eq(ed.emptyEl.hidden, true); assert.eq(ed.zoomR.disabled, false);
      ed.zoomTo(2); ed.rotate(90); await t.sleep(60);
      assert.ok(mudou.count >= 1);
      const im = ed._img; ed.destroy();
      assert.eq(ed._img, null);
      assert.deepEq(criadas.filter(u => !revogadas.includes(u)), [], 'toda URL de objeto criada foi revogada');
      assert.eq(ed.cv.width, 0);
      // 20000×20000 de verdade nunca chega a decodificar (cabeçalho recusado)
      const g = t.create({ xtype: 'imageeditor' }), er = t.spy(); g.on('error', er);
      await g.load(arq(pngHdr(20000, 20000), 'b.png', 'image/png'));
      assert.eq(er.lastArgs[2], 'dims');
      assert.ok(im);
    });

    test('saída real: open() com imagem de verdade — Aplicar devolve um File JPEG re-codificado; teclado funciona dentro da janela', async t => {
      if (semCanvas()) t.skip(MOTIVO);
      const p = IE().open(await gerar(300, 200, quadrantes, 'image/png', 'camera.png'), { aspect: 1, maxWidth: 80 });
      await t.waitFor(() => document.querySelector('.r4-ie-modal .r4-foot .r4-btn-primary:not(:disabled)'), 3000, 'Aplicar habilitado');
      tecla(document.activeElement, ']');   // gira pelo teclado
      const ed = Object.values(R4.instances).find(c => c.xtype === 'imageeditor');
      assert.eq(ed._s.rot, 1);
      document.querySelector('.r4-ie-modal .r4-foot .r4-btn-primary').click();
      const f = await p;
      assert.ok(f instanceof File); assert.eq(f.type, 'image/jpeg'); assert.eq(f.name, 'camera.jpg');
      const px = await pixels(f); assert.deepEq([px.w, px.h], [80, 80], 'maxWidth 80 e moldura quadrada');
      assert.eq(document.querySelector('.r4-ie-modal'), null);
    });
  });
})();
