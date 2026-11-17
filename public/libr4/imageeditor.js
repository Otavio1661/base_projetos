/**
 * ============================================
 * libr4 / imageeditor.js  —  R4 dev
 * ============================================
 * Editor de imagem no navegador (cortar, girar, espelhar e dar zoom) ANTES de enviar a foto.
 * JavaScript puro, sem dependências. A saída é sempre re-codificada via <canvas>: isso remove EXIF/GPS
 * e qualquer carga extra anexada ao arquivo (benefício de privacidade e segurança).
 *
 *   <r4-imageeditor aspect="1" shape="circle" fine-rotate></r4-imageeditor>
 *   const ed = R4.imageeditor('#alvo', arquivo, { aspect: 4 / 3 });  await ed.getFile('foto.jpg');
 *   const editado = await R4.imageeditor.open(arquivo, { aspect: 1 });   // File | null (cancelou)
 *   <r4-filedrop edit="image" accept="image/*" aspect="1">
 *
 * Só PNG, JPEG, WebP e GIF (primeiro quadro), conferidos pela ASSINATURA dos bytes; SVG e o resto são recusados.
 * A matemática do recorte são funções puras em R4.imageeditor._math (testáveis sem canvas).
 * ============================================
 */
(function (R4) {
  'use strict';
  const { el, tx } = R4.util;
  const T = R4.util.T;
  const MB = 1048576, HALF = Math.PI / 2, PAD = 14, HEAD = 65536;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const num = (v, d) => { const n = typeof v === 'string' ? parseFloat(v) : v; return typeof n === 'number' && isFinite(n) ? n : d; };
  const TT = (k, d, p) => T('r4.imageeditor.' + k, p, d);

  /* ---------------- erros (mensagens em pt-BR / idioma atual) ---------------- */
  const MSG = {
    badType: '"{name}": formato não aceito. Use PNG, JPEG, WebP ou GIF.',
    svg: '"{name}": SVG não é aceito (pode conter scripts). Use PNG, JPEG, WebP ou GIF.',
    tooBig: '"{name}": arquivo muito grande ({size}; máximo {max}).',
    dims: 'Imagem grande demais ({w} × {h} px; máximo {max} px por lado).',
    pixels: 'Imagem com megapixels demais (máximo {mp} MP).',
    decode: 'Não foi possível abrir a imagem (arquivo corrompido ou incompatível).',
    support: 'Este navegador não consegue editar imagens.',
    badSrc: 'Origem da imagem não permitida: use um arquivo (File/Blob) ou um endereço data:/blob:.',
    noImage: 'Nenhuma imagem para exportar.',
    encode: 'Não foi possível gerar a imagem editada.'
  };
  function err(code, p) { const e = new Error(TT(code, MSG[code], p)); e.code = code; return e; }
  const shown = n => (R4.sanitize ? R4.sanitize.filename(n || 'imagem') : String(n || 'imagem'));
  const jsdom = () => typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent);
  const canDecode = () => typeof createImageBitmap === 'function' || !jsdom();

  /* ================= matemática pura (sem DOM) ================= */
  /** Aceita número, "4/3", "4:3" ou "4x3". 0 (ou inválido) = livre. */
  function parseAspect(v) {
    if (typeof v === 'string') { const m = /^\s*(\d+(?:\.\d+)?)\s*[/:x]\s*(\d+(?:\.\d+)?)\s*$/.exec(v); v = m ? (+m[2] ? m[1] / m[2] : 0) : parseFloat(v); }
    return typeof v === 'number' && isFinite(v) && v > 0 ? clamp(v, 0.1, 10) : 0;
  }
  /** Orientação EXIF 1..8 → { rot (quartos de volta horários), flip (espelho horizontal, aplicado ANTES de girar) }. */
  function orient(o) {
    const t = [[0, 0], [0, 0], [0, 1], [2, 0], [2, 1], [3, 1], [1, 0], [1, 1], [3, 0]][o] || [0, 0];
    return { rot: t[0], flip: !!t[1] };
  }
  /** Para onde vai o pixel (x, y) de uma imagem w×h depois de aplicar a transformação t. Devolve [x, y, w, h]. */
  function mapPixel(t, x, y, w, h) {
    if (t.flip) x = w - 1 - x;
    for (let i = 0; i < (t.rot & 3); i++) { const nx = h - 1 - y; y = x; x = nx; const s = w; w = h; h = s; }
    return [x, y, w, h];
  }
  /**
   * Geometria da moldura. s = { rot, flip, fine (graus), zoom, cx, cy } (cx, cy = centro da moldura em px da imagem de origem,
   * relativo ao centro da imagem, no espaço já girado/espelhado). iw/ih = imagem já orientada pelo EXIF. aspect 0 = proporção da imagem.
   * zoom 1 = a maior moldura que cabe dentro da imagem (inclusive com o ajuste fino). Devolve também a folga (lx, ly) do centro.
   */
  function frame(s, iw, ih, aspect, maxZoom) {
    const odd = (s.rot & 1) === 1, W = odd ? ih : iw, H = odd ? iw : ih, a = aspect > 0 ? aspect : W / H;
    const th = num(s.fine, 0) * Math.PI / 180, c = Math.abs(Math.cos(th)), sn = Math.abs(Math.sin(th));
    const z = clamp(num(s.zoom, 1), 1, maxZoom || 5);
    const fw = Math.min(W / (c + sn / a), H / (sn + c / a)) / z, fh = fw / a;
    return { W, H, a, th, z, fw, fh, lx: Math.max(0, W / 2 - (c * fw + sn * fh) / 2), ly: Math.max(0, H / 2 - (sn * fw + c * fh) / 2) };
  }
  /** Estado válido: zoom, ângulo e centro dentro dos limites (a moldura nunca sai da imagem). Não altera o original. */
  function norm(s, iw, ih, aspect, maxZoom) {
    const r = { rot: (((Math.round(num(s.rot, 0)) % 4) + 4) % 4), flip: !!s.flip, fine: clamp(num(s.fine, 0), -45, 45), zoom: clamp(num(s.zoom, 1), 1, maxZoom || 5), cx: num(s.cx, 0), cy: num(s.cy, 0) };
    const f = frame(r, iw, ih, aspect, maxZoom), co = Math.cos(f.th), si = Math.sin(f.th);
    const a = clamp(r.cx * co + r.cy * si, -f.lx, f.lx), b = clamp(-r.cx * si + r.cy * co, -f.ly, f.ly);   // projeção no retângulo girado
    r.cx = a * co - b * si; r.cy = a * si + b * co;
    return r;
  }
  /** Gira n quartos de volta no sentido horário (negativo = anti-horário). O centro acompanha. */
  function rotate(s, n) {
    const r = Object.assign({}, s);
    for (let i = 0, k = ((Math.round(n) % 4) + 4) % 4; i < k; i++) { const x = r.cx; r.cx = -r.cy; r.cy = x; r.rot = (r.rot + 1) & 3; }
    return r;
  }
  /** Espelha na horizontal (como se vê na tela): troca o sentido do giro e do ajuste fino. */
  function flip(s) { return Object.assign({}, s, { flip: !s.flip, rot: (4 - s.rot) & 3, fine: -s.fine, cx: -s.cx }); }
  /** Retângulo de origem {x, y, w, h} na imagem já orientada. Exato com fine = 0 (com ajuste fino é só a caixa não girada). */
  function cropRect(s, iw, ih, aspect, maxZoom) {
    const f = frame(s, iw, ih, aspect, maxZoom);
    let x = s.cx, y = s.cy, w = f.fw, h = f.fh;
    for (let i = 0; i < (s.rot & 3); i++) { const t = x; x = y; y = -t; const u = w; w = h; h = u; }   // desfaz o giro
    if (s.flip) x = -x;
    return { x: iw / 2 + x - w / 2, y: ih / 2 + y - h / 2, w, h, fine: s.fine };
  }
  /** Tamanho da saída: nunca amplia acima do original, respeita maxWidth/maxHeight (1600) e outputWidth. */
  function outSize(fw, fh, o) {
    o = o || {};
    const mw = num(o.maxWidth, 1600), mh = num(o.maxHeight, 1600), ow = num(o.outputWidth, 0);
    let k = 1;
    if (ow > 0) k = Math.min(k, ow / fw);
    if (mw > 0) k = Math.min(k, mw / fw);
    if (mh > 0) k = Math.min(k, mh / fh);
    k = Math.min(k, 8192 / fw, 8192 / fh);
    return { w: Math.max(1, Math.round(fw * k)), h: Math.max(1, Math.round(fh * k)), k };
  }

  /* ---------------- leitores mínimos de cabeçalho (só os primeiros 64 KB, sem laços sem fim) ---------------- */
  function tiffOrient(u, b, end) {
    if (b + 8 > end) return 0;
    const le = u[b] === 0x49 && u[b + 1] === 0x49;
    if (!le && !(u[b] === 0x4D && u[b + 1] === 0x4D)) return 0;
    const r16 = p => (p >= b && p + 2 <= end ? (le ? u[p] | (u[p + 1] << 8) : (u[p] << 8) | u[p + 1]) : -1);
    const r32 = p => (p >= b && p + 4 <= end ? (le ? (u[p] | (u[p + 1] << 8) | (u[p + 2] << 16) | (u[p + 3] << 24)) >>> 0 : ((u[p] << 24) | (u[p + 1] << 16) | (u[p + 2] << 8) | u[p + 3]) >>> 0) : -1);
    if (r16(b + 2) !== 42) return 0;
    const ifd = r32(b + 4);
    if (ifd < 8 || ifd > end - b) return 0;
    const n = r16(b + ifd);
    for (let i = 0; i < n && i < 64; i++) {
      const e = b + ifd + 2 + i * 12;
      if (r16(e) === 0x0112 && r16(e + 2) === 3) { const v = r16(e + 8); return v >= 1 && v <= 8 ? v : 0; }
    }
    return 0;
  }
  /** JPEG → { w, h, o } (o = orientação EXIF, 1 se não houver) ou null. Nunca lança; lê no máximo 64 KB e 256 segmentos. */
  function jpegInfo(u) {
    const n = Math.min(u.length, HEAD), r = { w: 0, h: 0, o: 1 };
    if (n < 4 || u[0] !== 0xFF || u[1] !== 0xD8) return null;
    const u16 = p => (p + 2 <= n ? (u[p] << 8) | u[p + 1] : -1);
    let p = 2;
    for (let i = 0; i < 256 && p + 4 <= n; i++) {
      if (u[p] !== 0xFF) break;
      const m = u[p + 1];
      if (m === 0xFF) { p++; continue; }
      if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { p += 2; continue; }
      if (m === 0xD9 || m === 0xDA) break;
      const len = u16(p + 2);
      if (len < 2) break;
      if (m === 0xE1 && len >= 8 && u[p + 4] === 0x45 && u[p + 5] === 0x78 && u[p + 6] === 0x69 && u[p + 7] === 0x66 && u[p + 8] === 0 && u[p + 9] === 0)
        r.o = tiffOrient(u, p + 10, Math.min(p + 2 + len, n)) || 1;
      else if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC && len >= 8) { r.h = u16(p + 5); r.w = u16(p + 7); }
      p += 2 + len;
    }
    return r;
  }
  /** Dimensões lidas só do cabeçalho (PNG, GIF, JPEG, WebP) → { w, h } ou null. Serve para recusar "bombas" antes de decodificar. */
  function imageInfo(u, kind) {
    const b = p => u[p] | 0, be32 = p => ((b(p) << 24) | (b(p + 1) << 16) | (b(p + 2) << 8) | b(p + 3)) >>> 0;
    const le16 = p => b(p) | (b(p + 1) << 8), le24 = p => le16(p) | (b(p + 2) << 16);
    if (kind === 'png') return u.length >= 24 && be32(12) === 0x49484452 ? { w: be32(16), h: be32(20) } : null;
    if (kind === 'gif') return u.length >= 10 ? { w: le16(6), h: le16(8) } : null;
    if (kind === 'jpeg') { const j = jpegInfo(u); return j && j.w && j.h ? { w: j.w, h: j.h } : null; }
    if (kind === 'webp' && u.length >= 30) {
      const t = String.fromCharCode(b(12), b(13), b(14), b(15));
      if (t === 'VP8X') return { w: le24(24) + 1, h: le24(27) + 1 };
      if (t === 'VP8 ') return b(23) === 0x9D && b(24) === 1 && b(25) === 0x2A ? { w: le16(26) & 0x3FFF, h: le16(28) & 0x3FFF } : null;
      if (t === 'VP8L' && b(20) === 0x2F) { const v = (b(21) | (b(22) << 8) | (b(23) << 16) | (b(24) << 24)) >>> 0; return { w: (v & 0x3FFF) + 1, h: ((v >>> 14) & 0x3FFF) + 1 }; }
    }
    return null;
  }
  /** Assinatura dos bytes: 'png' | 'jpeg' | 'gif' | 'webp' | '' (qualquer outra coisa). */
  function kindOf(u) {
    const s = (p, t) => { for (let i = 0; i < t.length; i++) if (u[p + i] !== t.charCodeAt(i)) return false; return true; };
    if (u[0] === 0x89 && s(1, 'PNG') && u[4] === 0x0D && u[5] === 0x0A && u[6] === 0x1A && u[7] === 0x0A) return 'png';
    if (u[0] === 0xFF && u[1] === 0xD8 && u[2] === 0xFF) return 'jpeg';
    if (s(0, 'GIF87a') || s(0, 'GIF89a')) return 'gif';
    if (s(0, 'RIFF') && s(8, 'WEBP')) return 'webp';
    return '';
  }
  const readHead = (blob, n) => new Promise((ok, no) => {
    const sl = blob.slice(0, n);
    if (sl.arrayBuffer) { sl.arrayBuffer().then(ok, no); return; }
    const fr = new FileReader();
    fr.onload = () => ok(fr.result); fr.onerror = () => no(err('decode'));
    fr.readAsArrayBuffer(sl);
  });
  function isSvg(u, blob) {
    let t = ''; for (let i = 0; i < Math.min(u.length, 2048); i++) t += String.fromCharCode(u[i]);
    return /<svg[\s>]/i.test(t) || /svg/i.test(String(blob.type || '')) || /\.svgz?$/i.test(String(blob.name || ''));
  }
  const isBlob = v => v && typeof v === 'object' && typeof v.size === 'number' && typeof v.slice === 'function';

  /* ---------------- validação (sem decodificar) ---------------- */
  function checkDims(w, h, lim) {
    if (w > lim.maxDimension || h > lim.maxDimension) throw err('dims', { w, h, max: lim.maxDimension });
    if (w * h > lim.maxPixels) throw err('pixels', { mp: Math.round(lim.maxPixels / 1e6) });
  }
  const LIM = { maxSize: 15 * MB, maxDimension: 12000, maxPixels: 64e6 };
  /** Confere origem, tipo (por assinatura), tamanho e dimensões. Devolve { blob | url, name, kind, w, h, o, jw, jh }. */
  async function prepare(src, o) {
    const lim = Object.assign({}, LIM, o);
    let blob = src;
    if (typeof src === 'string') {
      const m = /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.exec(src.slice(0, 40));
      if (m) {
        const body = src.slice(m[0].length).replace(/\s+/g, '');
        if (body.length * 0.75 > lim.maxSize) throw err('tooBig', { name: shown(''), size: R4.util.bytes(Math.round(body.length * 0.75)), max: R4.util.bytes(lim.maxSize) });
        let bin; try { bin = atob(body); } catch (e) { throw err('decode'); }
        const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        blob = new Blob([u]);
      } else if (/^blob:/i.test(src)) return { url: src, name: '', kind: '', o: 1 };   // gerado pela página; o limite de dimensões é conferido depois de decodificar
      else throw err('badSrc');
    }
    if (!isBlob(blob)) throw err('badSrc');
    const name = shown(blob.name);
    if (blob.size > lim.maxSize) throw err('tooBig', { name, size: R4.util.bytes(blob.size), max: R4.util.bytes(lim.maxSize) });
    let head;
    try { head = new Uint8Array(await readHead(blob, HEAD)); } catch (e) { throw err('decode'); }
    const kind = kindOf(head);
    if (!kind) throw err(isSvg(head, blob) ? 'svg' : 'badType', { name });
    const info = imageInfo(head, kind), jp = kind === 'jpeg' ? jpegInfo(head) : null;
    if (info) { if (!info.w || !info.h) throw err('decode'); checkDims(info.w, info.h, lim); }
    return { blob, name: blob.name || '', kind, w: info && info.w, h: info && info.h, o: jp ? jp.o : 1, jw: jp && jp.w, jh: jp && jp.h, size: blob.size };
  }

  /* ---------------- decodificação (uma vez) ---------------- */
  const closeSrc = s => { try { if (s.close) s.close(); else if (s.tagName === 'CANVAS') s.width = s.height = 0; } catch (e) { /* ignora */ } };
  function loadImg(p) {
    return new Promise((ok, no) => {
      const img = new Image(), u = p.blob ? URL.createObjectURL(p.blob) : p.url;
      let t;
      const end = (f, v) => { clearTimeout(t); img.onload = img.onerror = null; if (p.blob) URL.revokeObjectURL(u); f(v); };
      img.onload = () => end(ok, img); img.onerror = () => end(no, err('decode'));
      t = setTimeout(() => end(no, err('decode')), 20000);
      img.src = u;
    });
  }
  /** Decodifica e devolve { src, w, h, close() } já com a orientação EXIF aplicada. */
  async function decode(p, lim) {
    if (!canDecode()) throw err('support');
    lim = Object.assign({}, LIM, lim);
    let src = null, applied = false;
    if (p.blob && typeof createImageBitmap === 'function') {
      try { src = await createImageBitmap(p.blob, { imageOrientation: 'from-image' }); applied = true; } catch (e) { src = null; }
      if (!src) { try { src = await createImageBitmap(p.blob); } catch (e) { src = null; } }
    }
    if (!src) { src = await loadImg(p); applied = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('image-orientation', 'from-image'); }
    let w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
    if (!w || !h) { closeSrc(src); throw err('decode'); }
    try { checkDims(w, h, lim); } catch (e) { closeSrc(src); throw e; }
    if (p.o >= 5 && p.jw && p.jh && p.jw !== p.jh) applied = w === p.jh;   // as dimensões dizem se o navegador já girou
    if (p.o > 1 && !applied) {   // navegador antigo: aplica a orientação uma vez, num canvas
      const t = orient(p.o), sw = t.rot & 1, c = document.createElement('canvas');
      c.width = sw ? h : w; c.height = sw ? w : h;
      const x = c.getContext('2d');
      x.translate(c.width / 2, c.height / 2); x.rotate(t.rot * HALF); if (t.flip) x.scale(-1, 1);
      x.drawImage(src, -w / 2, -h / 2);
      closeSrc(src); src = c; w = c.width; h = c.height;
    }
    return { src, w, h, close() { closeSrc(src); } };
  }
  /** Desenha a imagem como o estado s manda (o chamador já posicionou a origem no centro da moldura e fez o scale). */
  function place(ctx, im, s, th) {
    ctx.translate(-s.cx, -s.cy); ctx.rotate(th + s.rot * HALF); if (s.flip) ctx.scale(-1, 1);
    ctx.drawImage(im.src, -im.w / 2, -im.h / 2);
  }
  const toBlob = (c, type, q) => new Promise((ok, no) => {
    try { c.toBlob(b => (b ? ok(b) : no(err('encode'))), type, q); } catch (e) { no(err('encode')); }
  });
  const FMT = { jpeg: 'image/jpeg', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

  /* ================= componente ================= */
  R4.define('imageeditor', {
    config: {
      src: null, aspect: 0, shape: 'rect', zoom: 1, maxZoom: 5, fineRotate: false, height: 360,
      format: 'jpeg', quality: 0.86, maxWidth: 1600, maxHeight: 1600, outputWidth: 0, background: '#ffffff',
      maxSize: 15 * MB, maxDimension: 12000, maxPixels: 64e6
    },
    build() {
      const id = this.id, B = (cls, glyph, key, fb) => {
        const b = el('button', { type: 'button', class: 'r4-btn r4-ie-btn ' + cls }, [el('span', { 'aria-hidden': 'true', text: glyph })]);
        tx(b, 'r4.imageeditor.' + key, fb, 'aria-label'); tx(b, 'r4.imageeditor.' + key, fb, 'title');
        return b;
      };
      const BL = (cls, glyph, key, fb) => {
        const b = el('button', { type: 'button', class: 'r4-btn r4-ie-btn ' + cls }, [el('span', { 'aria-hidden': 'true', text: glyph }), tx(el('span', { class: 'r4-ie-lbl' }), 'r4.imageeditor.' + key, fb)]);
        tx(b, 'r4.imageeditor.' + key, fb, 'title');
        return b;
      };
      this._cw = 0; this._ch = 0; this._dpr = 1; this._tok = 0; this._s = this._init(); this._ptrs = new Map();
      this.cv = el('canvas', { class: 'r4-ie-cv', 'aria-hidden': 'true' });
      this.fileIn = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true, tabindex: '-1' });
      this.btnChoose = el('button', { type: 'button', class: 'r4-btn r4-btn-primary' });
      tx(this.btnChoose, 'r4.imageeditor.choose', 'Escolher imagem');
      this.emptyTx = tx(el('span', { class: 'r4-ie-emptytx' }), 'r4.imageeditor.empty', 'Nenhuma imagem carregada.');
      this.emptyEl = el('div', { class: 'r4-ie-empty' }, [this.emptyTx, this.btnChoose]);
      this.stage = el('div', { class: 'r4-ie-stage', tabindex: '0', role: 'application', 'aria-describedby': id + '-help', style: { height: (num(this.height, 360)) + 'px' } }, [this.cv, this.emptyEl]);
      tx(this.stage, 'r4.imageeditor.area', 'Área de edição da imagem', 'aria-label');
      this.help = tx(el('p', { class: 'r4-ie-help', id: id + '-help' }), 'r4.imageeditor.help', 'Arraste para mover a imagem. Use a roda do mouse, a pinça (toque) ou as teclas + e − para ampliar, [ e ] para girar 90° e as setas para mover (Shift: passo de 1 px).');
      this.zOut = B('r4-ie-zo', '−', 'zoomOut', 'Diminuir o zoom');
      this.zIn = B('r4-ie-zi', '+', 'zoomIn', 'Aumentar o zoom');
      this.zoomR = el('input', { type: 'range', class: 'r4-ie-range', min: '1', max: String(num(this.maxZoom, 5)), step: '0.01', value: '1' });
      tx(this.zoomR, 'r4.imageeditor.zoom', 'Zoom', 'aria-label');
      this.rotL = B('r4-ie-rl', '⟲', 'rotateL', 'Girar 90° à esquerda');
      this.rotR = B('r4-ie-rr', '⟳', 'rotateR', 'Girar 90° à direita');
      this.flipB = BL('r4-ie-fl', '⇋', 'flip', 'Espelhar');
      this.resetB = BL('r4-ie-rs', '↺', 'reset', 'Redefinir');
      const kids = [this.stage, this.help,
        el('div', { class: 'r4-ie-bar' }, [this.zOut, this.zoomR, this.zIn]),
        el('div', { class: 'r4-ie-bar r4-ie-bar2' }, [this.rotL, this.rotR, this.flipB, this.resetB])];
      if (this.fineRotate) {
        this.fineR = el('input', { type: 'range', class: 'r4-ie-range', min: '-45', max: '45', step: '0.5', value: '0' });
        tx(this.fineR, 'r4.imageeditor.fine', 'Ajuste fino', 'aria-label');
        this.fineO = el('output', { class: 'r4-ie-fineo', text: '0°' });
        kids.push(el('div', { class: 'r4-ie-bar r4-ie-fine' }, [tx(el('span', { class: 'r4-ie-finel' }), 'r4.imageeditor.fine', 'Ajuste fino'), this.fineR, this.fineO]));
      }
      this.msgEl = el('div', { class: 'r4-ie-msg', role: 'alert', hidden: true });
      kids.push(this.msgEl, this.fileIn);
      this._ctl(false);
      return el('div', { class: 'r4-ie' }, kids);
    },
    afterRender() {
      const offs = this._offs = [], st = this.stage, pt = this._ptrs;
      const on = (t, e, f, o) => { t.addEventListener(e, f, o); offs.push(() => t.removeEventListener(e, f, o)); };
      const rect = () => st.getBoundingClientRect();
      on(st, 'pointerdown', ev => {
        if (!this._img || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
        st.focus({ preventScroll: true });
        try { st.setPointerCapture(ev.pointerId); } catch (e) { /* ignora */ }
        pt.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
        st.classList.add('r4-ie-grab');
        ev.preventDefault();
      });
      on(st, 'pointermove', ev => {
        const p = pt.get(ev.pointerId);
        if (!p || !this._img) return;
        const nx = ev.clientX, ny = ev.clientY;
        if (pt.size === 1) this._pan(nx - p.x, ny - p.y);
        else if (pt.size === 2) {   // pinça: zoom pela variação da distância, ancorado no ponto médio, e arrasto pelo ponto médio
          const q = [...pt.entries()].find(e => e[0] !== ev.pointerId)[1];
          const d0 = Math.hypot(p.x - q.x, p.y - q.y), d1 = Math.hypot(nx - q.x, ny - q.y);
          const r = rect(), mx = (nx + q.x) / 2 - r.left - this._cw / 2, my = (ny + q.y) / 2 - r.top - this._ch / 2;
          this._pan((nx - p.x) / 2, (ny - p.y) / 2);
          if (d0 > 0) this.zoomTo(this._s.zoom * d1 / d0, mx, my);
        }
        p.x = nx; p.y = ny;
      });
      const up = ev => { pt.delete(ev.pointerId); if (!pt.size) st.classList.remove('r4-ie-grab'); };
      on(st, 'pointerup', up); on(st, 'pointercancel', up); on(st, 'lostpointercapture', up);
      on(st, 'wheel', ev => {
        if (!this._img) return;
        ev.preventDefault();
        const k = Math.exp(-ev.deltaY * (ev.deltaMode === 1 ? 0.05 : ev.deltaMode === 2 ? 1 : 0.0015)), r = rect();
        this.zoomTo(this._s.zoom * k, ev.clientX - r.left - this._cw / 2, ev.clientY - r.top - this._ch / 2);
      }, { passive: false });
      on(st, 'keydown', ev => {
        if (!this._img || ev.ctrlKey || ev.metaKey || ev.altKey) return;
        const step = (ev.shiftKey ? 1 : 10), k = ev.key, g = this._geom();
        const mv = (dx, dy) => this._set({ cx: this._s.cx - dx / g.ps, cy: this._s.cy - dy / g.ps }, true);   // a imagem anda na direção da seta
        if (k === 'ArrowLeft') mv(-step, 0); else if (k === 'ArrowRight') mv(step, 0);
        else if (k === 'ArrowUp') mv(0, -step); else if (k === 'ArrowDown') mv(0, step);
        else if (k === '+' || k === '=') this.zoomTo(this._s.zoom * 1.1);
        else if (k === '-' || k === '_') this.zoomTo(this._s.zoom / 1.1);
        else if (k === '[') this.rotate(-90); else if (k === ']') this.rotate(90);
        else return;
        ev.preventDefault();
      });
      on(this.zoomR, 'input', () => this.zoomTo(+this.zoomR.value));
      on(this.zIn, 'click', () => this.zoomTo(this._s.zoom * 1.1));
      on(this.zOut, 'click', () => this.zoomTo(this._s.zoom / 1.1));
      on(this.rotL, 'click', () => this.rotate(-90));
      on(this.rotR, 'click', () => this.rotate(90));
      on(this.flipB, 'click', () => this.flip());
      on(this.resetB, 'click', () => this.reset());
      if (this.fineR) on(this.fineR, 'input', () => this.setFine(+this.fineR.value));
      on(this.btnChoose, 'click', () => this.fileIn.click());
      on(this.fileIn, 'change', () => { const f = this.fileIn.files && this.fileIn.files[0]; this.fileIn.value = ''; if (f) this.load(f); });
      if (typeof ResizeObserver === 'function') { this._ro = new ResizeObserver(() => this._resize()); this._ro.observe(st); offs.push(() => this._ro.disconnect()); }
      else on(window, 'resize', () => this._resize());
      this._resize();
      if (this.src) this.load(this.src);
    },
    _init() { return { rot: 0, flip: false, fine: 0, zoom: clamp(num(this.zoom, 1), 1, num(this.maxZoom, 5)), cx: 0, cy: 0 }; },
    _asp() { return parseAspect(this.aspect); },
    _lim() { return { maxSize: num(this.maxSize, LIM.maxSize), maxDimension: num(this.maxDimension, LIM.maxDimension), maxPixels: num(this.maxPixels, LIM.maxPixels) }; },
    _geom(s) {
      const im = this._img, f = frame(s || this._s, im.w, im.h, this._asp(), this.maxZoom);
      return { f, ps: Math.min((this._cw - 2 * PAD) / f.fw, (this._ch - 2 * PAD) / f.fh) };
    },
    _ctl(on) { [this.zOut, this.zIn, this.zoomR, this.rotL, this.rotR, this.flipB, this.resetB, this.fineR].forEach(c => { if (c) c.disabled = !on; }); },
    _err(m) { this.msgEl.hidden = !m; this.msgEl.textContent = m || ''; },
    _sync() {
      const z = Math.round(this._s.zoom * 100) / 100;
      this.zoomR.value = String(z); this.zoomR.setAttribute('aria-valuetext', z + '×');
      if (this.fineR) { this.fineR.value = String(this._s.fine); this.fineO.textContent = (Math.round(this._s.fine * 10) / 10) + '°'; }
    },
    /** Aplica uma mudança de estado já validada (clamp) e agenda o redesenho. */
    _set(patch, user) {
      if (!this._img) return this;
      this._s = norm(Object.assign({}, this._s, patch), this._img.w, this._img.h, this._asp(), this.maxZoom);
      this._sync(); this._touch(user !== false);
      return this;
    },
    _pan(dx, dy) { const g = this._geom(); this._set({ cx: this._s.cx - dx / g.ps, cy: this._s.cy - dy / g.ps }, true); },
    _touch(user) {
      if (user) this._chg = true;
      if (this._raf || this._destroyed) return;
      this._raf = requestAnimationFrame(() => {
        this._raf = 0;
        if (this._destroyed) return;
        this._draw();
        if (this._chg) { this._chg = false; this.fire('change', this, this.getState()); }
      });
    },
    _resize() {
      if (this._destroyed) return;
      const w = this.stage.clientWidth || 320, h = this.stage.clientHeight || num(this.height, 240), d = Math.min(window.devicePixelRatio || 1, 2);
      if (w === this._cw && h === this._ch && d === this._dpr) return;
      this._cw = w; this._ch = h; this._dpr = d;
      if (canDecode() && this._img) { this.cv.width = Math.round(w * d); this.cv.height = Math.round(h * d); }
      try { this._acc = (getComputedStyle(this.el).getPropertyValue('--r4-acc') || '').trim() || '#3b5bdb'; } catch (e) { this._acc = '#3b5bdb'; }
      this._touch(false);
    },
    _draw() {
      const im = this._img;
      if (!im || this._destroyed) return;
      if (this.cv.width !== Math.round(this._cw * this._dpr)) { this.cv.width = Math.round(this._cw * this._dpr); this.cv.height = Math.round(this._ch * this._dpr); }
      const ctx = this._ctx || (this._ctx = this.cv.getContext('2d'));
      if (!ctx) return;
      const g = this._geom(), f = g.f, ps = g.ps, cw = this._cw, ch = this._ch, d = this._dpr;
      ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, cw, ch);
      ctx.save(); ctx.translate(cw / 2, ch / 2); ctx.scale(ps, ps); ctx.imageSmoothingQuality = 'high'; place(ctx, im, this._s, f.th); ctx.restore();
      const dw = f.fw * ps, dh = f.fh * ps, x = (cw - dw) / 2, y = (ch - dh) / 2, circ = this.shape === 'circle';
      const shape = () => { if (circ) { ctx.moveTo(cw / 2 + dw / 2, ch / 2); ctx.ellipse(cw / 2, ch / 2, dw / 2, dh / 2, 0, 0, 2 * Math.PI); ctx.closePath(); } else ctx.rect(x, y, dw, dh); };
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.beginPath(); ctx.rect(0, 0, cw, ch); shape(); ctx.fill('evenodd');
      if (!circ) {   // regra dos terços
        ctx.beginPath(); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1;
        for (let i = 1; i < 3; i++) { ctx.moveTo(x + dw * i / 3, y); ctx.lineTo(x + dw * i / 3, y + dh); ctx.moveTo(x, y + dh * i / 3); ctx.lineTo(x + dw, y + dh * i / 3); }
        ctx.stroke();
      }
      ctx.beginPath(); shape(); ctx.strokeStyle = this._acc || '#3b5bdb'; ctx.lineWidth = 2; ctx.stroke();
    },
    _unload() {
      if (this._img) { this._img.close(); this._img = null; }
      if (this.cv) this.cv.width = this.cv.height = 0;   // solta o buffer do canvas
      this._ctx = null;
      this._ctl(false);
    },
    _fail(e) {
      this._busy(false); this._unload();
      this.emptyEl.hidden = false; this._err(e.message);
      this.fire('error', this, e.message, e.code);
    },
    _busy(b) {
      this.stage.setAttribute('aria-busy', b ? 'true' : 'false');
      this.emptyTx.removeAttribute('r4-i18n');   // tx() acumula chaves; recomeça para o idioma seguir só a atual
      if (b) { tx(this.emptyTx, 'r4.imageeditor.loading', 'Carregando imagem…'); this.btnChoose.hidden = true; this.emptyEl.hidden = false; }
      else { tx(this.emptyTx, 'r4.imageeditor.empty', 'Nenhuma imagem carregada.'); this.btnChoose.hidden = false; }
    },
    /** Carrega File/Blob (ou data:/blob: gerado por você). Nunca rejeita: erros vão para o evento `error` e para a mensagem na tela. */
    async load(src) {
      const tok = ++this._tok;
      this._unload(); this._err(''); this._busy(true);
      let p, im;
      try {
        p = await prepare(src, this._lim());
        if (tok !== this._tok || this._destroyed) return this;
        im = await decode(p, this._lim());
        if (tok !== this._tok || this._destroyed) { im.close(); return this; }
      } catch (e) { if (tok === this._tok && !this._destroyed) this._fail(e); return this; }
      this._img = im; this._name = p.name; this._s = this._init();
      this._busy(false); this.emptyEl.hidden = true; this._ctl(true);
      this._s = norm(this._s, im.w, im.h, this._asp(), this.maxZoom);
      this._sync(); this._cw = 0; this._resize(); this._draw();
      this.fire('ready', this);
      return this;
    },
    isReady() { return !!this._img && !this._destroyed; },
    focus() { this.stage && this.stage.focus(); return this; },
    getState() { const s = Object.assign({}, this._s); s.aspect = this._asp(); return s; },
    /** Retângulo de origem {x, y, w, h} (na imagem já orientada) que vai para a saída. */
    getCrop() { return this._img ? cropRect(this._s, this._img.w, this._img.h, this._asp(), this.maxZoom) : null; },
    /** Gira em graus (múltiplos de 90; negativo = anti-horário). */
    rotate(deg) { if (this._img) { this._s = rotate(this._s, num(deg, 0) / 90); this._set({}, true); } return this; },
    flip() { if (this._img) { this._s = flip(this._s); this._set({}, true); } return this; },
    /** Zoom absoluto (1..maxZoom). ax/ay = ponto fixo em px de tela, relativo ao centro da moldura (padrão: o centro). */
    zoomTo(n, ax, ay) {
      if (!this._img) return this;
      const z = clamp(num(n, 1), 1, num(this.maxZoom, 5)), a = num(ax, 0), b = num(ay, 0), g0 = this._geom(), s = this._s;
      const vx = s.cx + a / g0.ps, vy = s.cy + b / g0.ps, g1 = this._geom(Object.assign({}, s, { zoom: z }));
      return this._set({ zoom: z, cx: vx - a / g1.ps, cy: vy - b / g1.ps }, true);
    },
    setFine(deg) { return this.fineRotate ? this._set({ fine: clamp(num(deg, 0), -45, 45) }, true) : this; },
    setAspect(a) { this.aspect = a; if (this._img) this._set({}, true); return this; },
    setShape(s) { this.shape = s === 'circle' ? 'circle' : 'rect'; this._touch(false); return this; },
    reset() { if (this._img) { this._s = this._init(); this._set({}, true); } return this; },
    /** Imagem final (re-codificada: sem EXIF/GPS). Promise<Blob>. opções: format, quality, maxWidth, maxHeight, outputWidth, background. */
    async getBlob(o) {
      const im = this._img;
      if (!im || this._destroyed) throw err('noImage');
      if (!canDecode()) throw err('support');
      o = Object.assign({ format: this.format, quality: this.quality, maxWidth: this.maxWidth, maxHeight: this.maxHeight, outputWidth: this.outputWidth, background: this.background }, o);
      const s = this._s, f = frame(s, im.w, im.h, this._asp(), this.maxZoom), z = outSize(f.fw, f.fh, o);
      const mime = FMT[String(o.format).toLowerCase()] || 'image/jpeg', q = clamp(num(o.quality, 0.86), 0.1, 1);
      const bg = /^#[0-9a-f]{3,8}$/i.test(String(o.background)) ? o.background : '#ffffff';
      const c = document.createElement('canvas');
      c.width = z.w; c.height = z.h;
      try {
        const x = c.getContext('2d');
        if (!x) throw err('encode');
        x.imageSmoothingQuality = 'high'; x.translate(z.w / 2, z.h / 2); x.scale(z.k, z.k); place(x, im, s, f.th);
        x.setTransform(1, 0, 0, 1, 0, 0);
        const paint = () => { x.globalCompositeOperation = 'destination-over'; x.fillStyle = bg; x.fillRect(0, 0, z.w, z.h); x.globalCompositeOperation = 'source-over'; };
        if (mime === 'image/jpeg') paint();
        let b = await toBlob(c, mime, q);
        if (mime === 'image/webp' && b.type !== 'image/webp') { paint(); b = await toBlob(c, 'image/jpeg', q); }   // navegador sem WebP
        return b;
      } finally { c.width = c.height = 0; }
    },
    /** Como getBlob, mas um File. Nome saneado (R4.sanitize.filename) e extensão coerente com o formato; padrão = nome do original. */
    async getFile(name, o) {
      const b = await this.getBlob(o);
      // tira só a extensão de imagem do original; o resto passa por R4.sanitize.filename DEPOIS de juntar a extensão nova
      // (pontos no meio viram "_": "x.exe" nunca vira "x.exe.jpg")
      let base = String(name || this._name || '').replace(/\.(jpe?g|jfif|png|webp|gif|bmp|avif|heic|tiff?)\s*$/i, '');
      if (!base.replace(/[\s.\\/]/g, '')) base = 'imagem';
      return new File([b], shown(base + '.' + (EXT[b.type] || 'jpg')), { type: b.type, lastModified: Date.now() });
    },
    destroy() {
      const was = this._destroyed;
      R4.Component.prototype.destroy.call(this);
      if (was || !this._destroyed) return this;
      this._tok++;
      if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
      (this._offs || []).splice(0).forEach(f => f());
      this._ptrs.clear();
      this._unload(); this._ctx = null;
      return this;
    }
  }, {
    title: 'imageeditor', group: 'Dados',
    description: 'Editor de imagem no navegador: cortar (moldura com proporção fixa ou livre), dar zoom, mover, girar de 90 em 90° (e ajuste fino opcional) e espelhar ANTES de enviar. A saída é re-codificada pelo canvas: remove EXIF/GPS e qualquer carga extra anexada ao arquivo (privacidade). Só PNG, JPEG, WebP e GIF (primeiro quadro), conferidos pela assinatura dos bytes; SVG e demais tipos são recusados. Corrige a orientação EXIF das fotos de celular. Mouse, caneta e toque (pinça); teclado: setas movem 10 px (Shift: 1 px), + e − ampliam, [ e ] giram.',
    props: [
      { name: 'src', type: 'File | Blob | "data:image/..." | "blob:..."', default: 'null', desc: 'Imagem a editar. Nunca URL externa (http/https/relativa são recusadas). Sem src, o editor mostra o botão "Escolher imagem". load(src) troca a imagem.' },
      { name: 'aspect', type: "number | '4/3'", default: '0', desc: 'Proporção da moldura (largura/altura): 1, 4/3, 3/4, 16/9... 0 = livre (a moldura segue a proporção da própria imagem; o recorte é feito com zoom e arraste). Em HTML aceita aspect="4/3".' },
      { name: 'shape', type: "'rect' | 'circle'", default: "'rect'", desc: 'Só a pré-visualização da moldura (círculo para avatar). A imagem de saída é sempre retangular.' },
      { name: 'zoom / maxZoom', type: 'number', default: '1 / 5', desc: 'Zoom inicial e máximo (o slider vai de 1x a maxZoom). A moldura nunca sai da imagem.' },
      { name: 'fineRotate', type: 'boolean', default: 'false', desc: 'Mostra o ajuste fino de rotação (-45° a 45°). O recorte continua dentro da imagem.' },
      { name: 'format / quality', type: "'jpeg'|'webp'|'png' / number", default: "'jpeg' / 0.86", desc: 'Formato da saída (sem WebP no navegador, cai para JPEG) e qualidade (JPEG/WebP). JPEG recebe fundo branco onde a imagem era transparente.' },
      { name: 'maxWidth / maxHeight / outputWidth', type: 'number (px)', default: '1600 / 1600 / 0', desc: 'Limites da saída (maior lado 1600 px por padrão). outputWidth fixa a largura. Nunca amplia acima do original.' },
      { name: 'maxSize / maxDimension / maxPixels', type: 'number', default: '15 MB / 12000 / 64000000', desc: 'Limites de segurança: tamanho do arquivo, lado máximo e megapixels. Dimensões são lidas do cabeçalho ANTES de decodificar.' },
      { name: 'height', type: 'number (px)', default: '360', desc: 'Altura da área de edição (limitada a 65% da altura da tela).' },
      { name: 'getBlob(opções) / getFile(nome, opções)', type: 'Promise<Blob> / Promise<File>', desc: 'Imagem final. getFile saneia o nome (R4.sanitize.filename) e ajusta a extensão ao formato.' },
      { name: 'rotate(graus) / flip() / zoomTo(n) / reset() / setFine(graus) / setAspect(a) / setShape(s) / load(src) / destroy()', type: 'método', desc: 'Operações. destroy() libera o ImageBitmap, o canvas e todos os listeners.' },
      { name: 'getState() / getCrop() / isReady()', type: 'método', desc: 'Estado atual (rot, flip, fine, zoom, cx, cy), retângulo de origem do recorte e se há imagem pronta.' },
      { name: 'R4.imageeditor.open(arquivo, opções)', type: 'Promise<File | null>', desc: 'Abre o editor numa janela modal (Aplicar/Cancelar; Esc e clique fora cancelam; foco preso na janela). Resolve com o File editado ou null ao cancelar. Rejeita com mensagem clara se o arquivo for recusado (tipo, tamanho, dimensões).' },
      { name: 'R4.imageeditor.check(arquivo, opções)', type: 'Promise<{kind, w, h, size}>', desc: 'Só valida (assinatura, tamanho, dimensões), sem decodificar. Rejeita com Error (code: badType, svg, tooBig, dims, pixels, decode, badSrc).' },
      { name: 'filedrop edit="image"', type: 'integração', desc: 'No <r4-filedrop edit="image" accept="image/*" aspect="1">, cada imagem aceita passa pelo editor antes de entrar na lista; cancelar descarta. O upload() envia o arquivo já editado.' },
      { name: 'ready / change / error', type: 'evento', desc: 'ready(cmp) depois de decodificar; change(cmp, estado) a cada ajuste (no máximo um por quadro); error(cmp, mensagem, código).' }
    ],
    events: ['ready', 'change', 'error']
  });
  R4.registry.imageeditor.meta.playground = {
    html: '<r4-imageeditor{attrs}></r4-imageeditor>', cfg: {},
    controls: { aspect: ['0', '1', '4/3', '3/4', '16/9'], shape: ['rect', 'circle'], fineRotate: false, maxZoom: 5, format: ['jpeg', 'webp', 'png'], quality: 0.86, maxWidth: 1600 }
  };
  R4.declare && R4.declare('imageeditor', (host, cfg) => { if (host.hasAttribute('aspect')) cfg.aspect = parseAspect(host.getAttribute('aspect')); return cfg; });
  if (R4.quickMap) R4.quickMap.imageeditor = (a, b) => (a && typeof a === 'object' && !isBlob(a) && !a.nodeType ? a : Object.assign({ src: a }, b));

  /* ================= API: R4.imageeditor.open / check / _math ================= */
  const IMG_EXT = /\.(png|jpe?g|jfif|webp|gif|svgz?|bmp|avif|heic|tiff?|ico)$/i;
  /** O arquivo se apresenta como imagem (tipo MIME ou extensão)? Usado pelo filedrop: o editor decide se ele é aceito. */
  const isImageLike = f => !!f && (/^image\//i.test(String(f.type || '')) || IMG_EXT.test(String(f.name || '')));
  /** Valida sem decodificar → { kind, w, h, size }. Rejeita com Error (e.code). */
  async function check(src, o) { const p = await prepare(src, o); return { kind: p.kind, w: p.w || 0, h: p.h || 0, size: p.size || 0 }; }
  /** Abre o editor numa janela modal. Promise<File | null>. */
  async function open(file, o) {
    o = Object.assign({}, o);
    await check(file, o);   // recusa SVG, tipo errado, arquivo/dimensão grande ANTES de abrir a janela
    const prev = document.activeElement;
    let ed, win, done = false, busy = false, btnApply = null;
    const finish = v => { if (done) return; done = true; res(v); };
    let res;
    const pr = new Promise(r => { res = r; });
    const cfg = {}; ['aspect', 'shape', 'zoom', 'maxZoom', 'fineRotate', 'format', 'quality', 'maxWidth', 'maxHeight', 'outputWidth', 'background', 'maxSize', 'maxDimension', 'maxPixels', 'height']
      .forEach(k => { if (o[k] !== undefined && o[k] !== '') cfg[k] = o[k]; });
    ed = R4.create(Object.assign({ xtype: 'imageeditor', src: file, height: 320 }, cfg, { renderTo: null }));
    const apply = async () => {
      if (busy || !ed.isReady()) return;
      busy = true; if (btnApply) btnApply.disabled = true;
      try { const f = await ed.getFile(o.name || file.name || 'imagem'); finish(f); win.close(); }
      catch (e) { busy = false; if (btnApply) btnApply.disabled = false; ed._err(e.message); }
    };
    win = R4.create({ xtype: 'window', title: o.title || TT('title', 'Editar imagem'), width: o.width || 560, cls: 'r4-ie-modal', items: [ed],
      buttons: [{ text: T('r4.cancel', 0, 'Cancelar'), handler: () => finish(null) },
        { text: TT('apply', 'Aplicar'), variant: 'primary', close: false, handler: apply }] });
    win.on('close', () => finish(null));
    win.on('destroy', () => { finish(null); try { if (prev && prev.isConnected && prev.focus) prev.focus(); } catch (e) { /* ignora */ } });
    win.show();
    win._win.setAttribute('aria-modal', 'true');
    win._win.setAttribute('aria-label', o.title || TT('title', 'Editar imagem'));
    win.el.classList.add('r4-ie-modal');
    btnApply = win.el.querySelector('.r4-foot .r4-btn-primary');
    if (btnApply) { btnApply.disabled = !ed.isReady(); ed.on('ready', () => { if (btnApply) btnApply.disabled = false; }); }
    win.el.addEventListener('keydown', ev => {   // foco preso na janela
      if (ev.key !== 'Tab') return;
      const list = [...win.el.querySelectorAll('button, input, [tabindex="0"]')].filter(n => !n.disabled && !n.hidden && !n.closest('[hidden]') && n.getAttribute('tabindex') !== '-1' && n.type !== 'file');
      if (!list.length) return;
      const a = document.activeElement, first = list[0], last = list[list.length - 1];
      if (!win.el.contains(a)) { ev.preventDefault(); first.focus(); }
      else if (ev.shiftKey && a === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && a === last) { ev.preventDefault(); first.focus(); }
    });
    ed.focus();
    return pr;
  }
  Object.assign(R4.imageeditor, {
    open, check, isImageLike,
    _math: { parseAspect, orient, mapPixel, frame, norm, rotate, flip, cropRect, outSize, jpegInfo, imageInfo, kindOf, tiffOrient, clamp },
    _prepare: prepare
  });
})(window.R4);
