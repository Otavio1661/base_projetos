/**
 * ============================================
 * libr4 / files.js  —  R4 dev
 * ============================================
 * R4.files: CSV (RFC 4180, com proteção contra injeção de fórmula), JSON,
 * XLSX gerado à mão (ZIP "stored" + CRC32, sem bibliotecas), leitura de XLSX
 * (DecompressionStream, com limites anti "zip bomb"), download sem navegar,
 * escolha e leitura de arquivos com validação de tipo/tamanho.
 * Componente `filedrop`: área de arrastar/soltar com lista, validação e leitura.
 * Também registra o gancho HTML de <r4-grid> que lê os atributos extras das <r4-col>.
 *
 * Arquivos do usuário são dados NÃO confiáveis: tudo tem limite de tamanho,
 * nada vira HTML sem escape e o XML lido nunca aceita DOCTYPE.
 * ============================================
 */
(function (R4) {
  'use strict';
  const { el, tx } = R4.util;
  const T = R4.util.T;   // R4.t com reserva (resolvido em tempo de uso)
  const MB = 1024 * 1024;
  const fail = msg => { throw new Error(msg); };
  const bytes = n => R4.util.bytes(n);
  const bool = v => v === true || v === 'true' || v === '' || v === '1' || v === 1;
  /** Nome para mostrar/enviar: R4.sanitize.filename (sem caminho, bidi, controles; só a última extensão). */
  const shownName = n => (R4.sanitize ? R4.sanitize.filename(n) : String(n ?? ''));

  /* ================= colunas ================= */
  // aceita ['campo', {key|dataIndex|field, header, format, width}]; vazio = chaves dos primeiros registros
  function cols(rows, columns) {
    if (!columns || !columns.length) {
      const seen = new Set();
      (rows || []).slice(0, 50).forEach(r => r && typeof r === 'object' && Object.keys(r).forEach(k => seen.add(k)));
      columns = [...seen];
    }
    return columns.map(c => {
      if (typeof c === 'string') return { key: c, header: c };
      const key = c.key ?? c.dataIndex ?? c.field;
      return { key, header: c.header ?? c.text ?? key, format: c.format, width: c.width };
    }).filter(c => c.key != null);
  }
  // chave vinda de arquivo: "__proto__" vira propriedade própria (nunca altera o protótipo)
  const put = (o, k, v) => { if (k === '__proto__') Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true }); else o[k] = v; };
  function headerKeys(row) {
    const used = new Map();
    return row.map((h, i) => {
      let k = String(h ?? '').trim() || 'coluna_' + (i + 1);
      const n = used.get(k) || 0; used.set(k, n + 1);
      return n ? k + '_' + (n + 1) : k;
    });
  }

  /* ================= CSV ================= */
  const FORMULA = /^[=+\-@\t\r]/;
  const NUMERIC = /^[+-]?(\d+([.,]\d*)?|[.,]\d+)([eE][+-]?\d+)?$/;
  /** Prefixa ' em textos que o Excel/LibreOffice executariam como fórmula (= + - @ TAB CR), exceto números. */
  const csvSafe = s => (FORMULA.test(s) && !NUMERIC.test(s) ? "'" + s : s);
  function csvCell(v, o) {
    if (v == null) return '';
    let s;
    if (typeof v === 'number') s = isFinite(v) ? (o.decimal === ',' ? String(v).replace('.', ',') : String(v)) : '';
    else if (typeof v === 'boolean') s = v ? 'true' : 'false';
    else if (v instanceof Date) s = isNaN(v) ? '' : v.toISOString();
    else s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (o.safe !== false && typeof v !== 'number') s = csvSafe(s);
    return s.includes('"') || s.includes(o.delimiter) || s.includes('\n') || s.includes('\r') ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCSV(rows, opts) {
    const o = Object.assign({ delimiter: ';', bom: true, header: true, decimal: '.', eol: '\r\n', safe: true, formatted: false }, opts);
    if (typeof o.delimiter !== 'string' || o.delimiter.length !== 1 || /["\r\n]/.test(o.delimiter)) fail('toCSV: delimitador inválido.');
    rows = rows || [];
    const d = o.delimiter, lines = [];
    if (Array.isArray(rows[0])) {
      if (o.header && o.columns) lines.push(o.columns.map(c => csvCell(typeof c === 'string' ? c : c.header ?? c.key, o)).join(d));
      rows.forEach(r => lines.push(r.map(v => csvCell(v, o)).join(d)));
    } else {
      const cs = cols(rows, o.columns);
      const val = (c, v) => (o.formatted && c.format && R4.formats && R4.formats[c.format] && v != null ? R4.formats[c.format](v) : v);
      if (o.header) lines.push(cs.map(c => csvCell(c.header, o)).join(d));
      for (const r of rows) lines.push(cs.map(c => csvCell(val(c, r == null ? null : r[c.key]), o)).join(d));
    }
    return (o.bom ? '﻿' : '') + lines.join(o.eol) + (lines.length ? o.eol : '');
  }
  function detectDelimiter(text) {
    const cands = [',', ';', '\t', '|'], per = cands.map(() => []), cur = cands.map(() => 0), s = text.slice(0, 65536);
    let q = false, lines = 0;
    for (let i = 0; i < s.length && lines < 10; i++) {
      const ch = s[i];
      if (ch === '"') q = !q;
      else if (q) continue;
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && s[i + 1] === '\n') i++;
        cands.forEach((_, k) => { per[k].push(cur[k]); cur[k] = 0; }); lines++;
      } else { const k = cands.indexOf(ch); if (k >= 0) cur[k]++; }
    }
    if (lines < 10) cands.forEach((_, k) => per[k].push(cur[k]));
    let best = ',', score = 0;
    cands.forEach((c, k) => {   // nota: linhas com a mesma contagem da 1ª (consistência) pesam mais que a quantidade
      const first = per[k][0] || 0;
      if (!first) return;
      const sc = per[k].filter(x => x === first).length * 1000 + first;
      if (sc > score) { score = sc; best = c; }
    });
    return best;
  }
  function convert(s, o) {
    const t = s.trim();
    if (t === '') return null;
    if (/^-?0\d/.test(t)) return s;   // zeros à esquerda (CEP, código): mantém texto
    if (o.decimal === ',') {
      if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$|^-?\d+(,\d+)?$/.test(t)) return Number(t.replace(/\./g, '').replace(',', '.'));
    } else if (/^-?(\d+(\.\d+)?|\.\d+)([eE][-+]?\d+)?$/.test(t)) return Number(t);
    if (/^(true|false)$/i.test(t)) return t.toLowerCase() === 'true';
    return s;
  }
  /**
   * parseCSV(texto, {delimiter:'auto', header:true, types:false, decimal:'.', skipEmpty:true, maxRows:0})
   * RFC 4180 tolerante: BOM, CRLF/LF/CR, aspas escapadas (""), quebras dentro de campo.
   */
  function parseCSV(text, opts) {
    const o = Object.assign({ delimiter: 'auto', header: true, types: false, decimal: '.', skipEmpty: true, maxRows: 0 }, opts);
    text = String(text ?? '');
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const d = o.delimiter === 'auto' ? detectDelimiter(text) : o.delimiter;
    if (typeof d !== 'string' || d.length !== 1) fail('parseCSV: delimitador inválido.');
    const D = d.charCodeAt(0), n = text.length, out = [];
    const sep = c => c === D || c === 10 || c === 13;
    let i = 0, row = [];
    while (i < n) {
      let f;
      if (text.charCodeAt(i) === 34) {   // campo entre aspas
        let j = i + 1; f = '';
        for (;;) {
          const k = text.indexOf('"', j);
          if (k < 0) { f += text.slice(j); i = n; break; }   // aspas sem fechar: aceita até o fim
          f += text.slice(j, k);
          if (text.charCodeAt(k + 1) === 34) { f += '"'; j = k + 2; continue; }
          i = k + 1; break;
        }
        let e = i; while (e < n && !sep(text.charCodeAt(e))) e++;   // tolera lixo após a aspa de fechamento
        f += text.slice(i, e); i = e;
      } else {
        let e = i; while (e < n && !sep(text.charCodeAt(e))) e++;
        f = text.slice(i, e); i = e;
      }
      row.push(f);
      if (i >= n) break;
      const c = text.charCodeAt(i);
      if (c === D) { i++; if (i >= n) row.push(''); continue; }
      if (c === 13 && text.charCodeAt(i + 1) === 10) i++;
      i++;
      out.push(row); row = [];
      if (o.maxRows && out.length > o.maxRows + (o.header ? 1 : 0)) break;
    }
    if (row.length) out.push(row);
    let rows = o.skipEmpty ? out.filter(r => !(r.length === 1 && r[0] === '')) : out;
    if (o.maxRows) rows = rows.slice(0, o.maxRows + (o.header ? 1 : 0));
    const cv = o.types ? s => convert(s, o) : s => s;
    if (!o.header) return rows.map(r => r.map(cv));
    if (!rows.length) return [];
    const keys = headerKeys(rows[0]);
    return rows.slice(1).map(r => {
      const obj = {};
      keys.forEach((k, j) => put(obj, k, j < r.length ? cv(r[j]) : o.types ? null : ''));
      for (let j = keys.length; j < r.length; j++) put(obj, 'coluna_' + (j + 1), cv(r[j]));
      return obj;
    });
  }
  function toJSON(rows, opts) {
    const o = Object.assign({ space: 2 }, opts);
    let data = rows || [];
    if (o.columns && o.columns.length && !Array.isArray(data[0])) {
      const cs = cols(data, o.columns);
      data = data.map(r => { const x = {}; cs.forEach(c => put(x, c.key, r == null ? null : r[c.key] ?? null)); return x; });
    }
    return JSON.stringify(data, null, o.space);
  }

  /* ================= arquivos do usuário ================= */
  // nome de arquivo: sem caminho/controle e sem caracteres bidi invisíveis (ex.: U+202E faria "fdp.exe" parecer "exe.pdf")
  // (faixas montadas por código para não deixar caracteres invisíveis no fonte: U+200B-200F, U+202A-202E, U+2066-2069, U+FEFF)
  const INVIS = [[0x200b, 0x200f], [0x202a, 0x202e], [0x2066, 0x2069], [0xfeff, 0xfeff]].map(([a, b]) => String.fromCharCode(a) + '-' + String.fromCharCode(b)).join('');
  const BAD_NAME = new RegExp('[\\x00-\\x1f\\x7f-\\x9f<>:"/\\\\|?*' + INVIS + ']+', 'g');
  const safeName = n => String(n ?? '').replace(BAD_NAME, '_').replace(/^[.\s_]+/, '').slice(0, 150) || 'arquivo';
  /** Baixa conteúdo (texto, bytes ou Blob) sem navegar: <a download> + URL temporária revogada em seguida. */
  function download(content, name, mime) {
    const blob = content instanceof Blob && !mime ? content
      : new Blob([content], { type: mime || (content && content.type) || (typeof content === 'string' ? 'text/plain;charset=utf-8' : 'application/octet-stream') });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: safeName(name), rel: 'noopener', hidden: true });
    document.body.append(a);
    try { a.click(); } finally { a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500); }
    return blob;
  }
  function acceptOk(file, accept) {
    const list = String(accept || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (!list.length) return true;
    const name = String(file.name || '').toLowerCase(), type = String(file.type || '').toLowerCase();
    return list.some(a => (a.startsWith('.') ? name.endsWith(a) : a.endsWith('/*') ? type.startsWith(a.slice(0, -1)) : type === a));
  }
  /** Mensagem de erro (no idioma atual), ou null se o arquivo passar em accept/maxSize. */
  function validate(file, opts) {
    const o = opts || {};
    if (!file || typeof file.size !== 'number') return T('r4.files.invalid', 0, 'Arquivo inválido.');
    const nm = shownName(file.name);
    if (o.accept && !acceptOk(file, o.accept)) return T('r4.files.badType', { name: nm, accept: o.accept }, '"' + nm + '": tipo de arquivo não permitido (aceitos: ' + o.accept + ').');
    if (o.maxSize && file.size > o.maxSize) return T('r4.files.tooBig', { name: nm, size: bytes(file.size), max: bytes(o.maxSize) }, '"' + nm + '": arquivo muito grande (' + bytes(file.size) + '; máximo ' + bytes(o.maxSize) + ').');
    return null;
  }
  /** Abre o seletor do sistema. Promise<File[]>; rejeita com erro (e.errors, e.files) se algum arquivo não passar. */
  function pick(opts) {
    const o = opts || {};
    return new Promise((resolve, reject) => {
      const inp = el('input', { type: 'file', accept: o.accept || null, multiple: !!o.multiple, hidden: true });
      let done = false;
      const end = (fn, v) => { if (done) return; done = true; inp.remove(); fn(v); };
      inp.addEventListener('change', () => {
        const files = [...inp.files], errors = [];
        const ok = files.filter(f => { const e = validate(f, o); e && errors.push(e); return !e; });
        if (errors.length) { const er = new Error(errors.join('\n')); er.errors = errors; er.files = ok; return end(reject, er); }
        end(resolve, ok);
      });
      inp.addEventListener('cancel', () => end(resolve, []));
      document.body.append(inp);
      inp.click();
    });
  }
  function readAs(file, kind, maxSize, enc) {
    return new Promise((resolve, reject) => {
      const e = validate(file, { maxSize });
      if (e) return reject(new Error(e));
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(new Error(T('r4.files.readFail', { name: file.name }, 'Não foi possível ler "' + file.name + '".')));
      kind === 'text' ? fr.readAsText(file, enc) : fr.readAsArrayBuffer(file);
    });
  }
  const readText = (file, o = {}) => readAs(file, 'text', o.maxSize ?? 20 * MB, o.encoding || 'utf-8');
  const readArrayBuffer = (file, o = {}) => readAs(file, 'buffer', o.maxSize ?? 50 * MB);

  /* ================= ZIP (stored) + CRC32 ================= */
  const CRC_T = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(b) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  const concat = parts => {
    const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
    let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  };
  /** zip([{name, data: string|Uint8Array}]) → Uint8Array (sem compressão, nomes UTF-8) */
  function zip(files) {
    const enc = new TextEncoder(), now = new Date();
    const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const date = ((Math.max(1980, now.getFullYear()) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const parts = [], central = [];
    let off = 0;
    for (const f of files) {
      const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, crc, true);
      h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, time, true); c.setUint16(14, date, true); c.setUint32(16, crc, true);
      c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true);
      c.setUint32(42, off, true);   // demais campos (extra, comentário, disco, atributos) = 0
      central.push(new Uint8Array(c.buffer), name);
      off += 30 + name.length + data.length;
      if (off > 0xFFFFFFFF) fail('Arquivo grande demais para ZIP (limite de 4 GB).');
    }
    const cd = concat(central), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, cd.length, true); e.setUint32(16, off, true);
    return concat([...parts, cd, new Uint8Array(e.buffer)]);
  }
  function zipIndex(u8, o) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eo = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eo = i; break; }
    if (eo < 0) fail('O arquivo não é um XLSX/ZIP válido.');
    const count = dv.getUint16(eo + 10, true), cdOff = dv.getUint32(eo + 16, true);
    if (count === 0xFFFF || cdOff === 0xFFFFFFFF) fail('ZIP64 não é suportado.');
    if (count > o.maxEntries) fail('ZIP com entradas demais (' + count + ').');
    const dec = new TextDecoder(), map = new Map();
    let p = cdOff;
    for (let k = 0; k < count; k++) {
      if (p + 46 > u8.length || dv.getUint32(p, true) !== 0x02014b50) fail('Diretório do ZIP corrompido.');
      const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      map.set(dec.decode(u8.subarray(p + 46, p + 46 + nl)), {
        flags: dv.getUint16(p + 8, true), method: dv.getUint16(p + 10, true), crc: dv.getUint32(p + 16, true),
        csize: dv.getUint32(p + 20, true), usize: dv.getUint32(p + 24, true), lo: dv.getUint32(p + 42, true)
      });
      p += 46 + nl + xl + cl;
    }
    return { u8, dv, map };
  }
  async function inflateRaw(raw, limit) {
    if (typeof DecompressionStream === 'undefined')
      fail('Seu navegador não tem DecompressionStream (necessário para ler XLSX compactado): use Chrome/Edge 103+, Firefox 113+ ou Safari 16.4+.');
    const ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter();
    w.write(raw).catch(() => {}); w.close().catch(() => {});
    const r = ds.readable.getReader(), chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await r.read();
      if (done) break;
      total += value.length;
      if (total > limit) { r.cancel().catch(() => {}); fail('Conteúdo descompactado passa do limite (' + bytes(limit) + '): arquivo recusado (possível "zip bomb").'); }
      chunks.push(value);
    }
    return concat(chunks);
  }
  async function zipRead(z, e, limit) {
    if (e.flags & 1) fail('ZIP/XLSX protegido por senha não é suportado.');
    const { u8, dv } = z, lo = e.lo;
    if (lo + 30 > u8.length || dv.getUint32(lo, true) !== 0x04034b50) fail('Cabeçalho do ZIP inválido.');
    const start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
    if (start + e.csize > u8.length) fail('ZIP truncado.');
    const raw = u8.subarray(start, start + e.csize);
    let out;
    if (e.method === 0) out = raw;
    else if (e.method === 8) out = await inflateRaw(raw, limit);
    else fail('Método de compressão do ZIP não suportado (' + e.method + ').');
    if (out.length > limit) fail('Conteúdo do ZIP passa do limite (' + bytes(limit) + ').');
    if (crc32(out) !== e.crc) fail('CRC inválido: arquivo corrompido.');
    return out;
  }

  /* ================= XLSX (escrita) ================= */
  const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const XH = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const xesc = s => {
    s = String(s);
    if (s.toWellFormed) s = s.toWellFormed();   // remove surrogates soltos (XML inválido)
    return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
      .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  };
  const colName = i => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };
  const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
  const serial = (y, m, d, hh = 0, mi = 0, ss = 0) => (Date.UTC(y, m - 1, d, hh, mi, ss) - Date.UTC(1899, 11, 30)) / 864e5;
  // estilos (índices de cellXfs em styles.xml)
  const S = { header: 1, money: 2, date: 3, number: 4, datetime: 5 };
  const STYLES = XH + '<styleSheet xmlns="' + NS + '">' +
    '<numFmts count="3"><numFmt numFmtId="164" formatCode="&quot;R$&quot; #,##0.00"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/><numFmt numFmtId="166" formatCode="dd/mm/yyyy hh:mm"/></numFmts>' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  const sheetTitle = n => (String(n ?? '').replace(/[\\/?*[\]:]/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 31) || 'Planilha1');

  /**
   * toXLSX(linhas, {columns, sheetName, dates:true, bytes:false}) → Blob (.xlsx)
   * Textos vão como strings compartilhadas (t="s"): o Excel nunca os executa como fórmula.
   * Números com format money/number recebem formato de moeda/milhar; datas (Date ou 'AAAA-MM-DD[THH:MM]') viram data real.
   */
  function toXLSX(rows, opts) {
    const o = Object.assign({ sheetName: 'Planilha1', dates: true, bytes: false }, opts);
    rows = rows || [];
    const arr = Array.isArray(rows[0]);
    const cs = arr ? (o.columns ? cols([], o.columns) : (rows[0] || []).map((_, i) => ({ key: i, header: null })))
      : cols(rows, o.columns);
    if (arr) cs.forEach((c, i) => { c.key = i; });
    const sst = [], sidx = new Map();
    const str = s => {
      s = String(s);
      if (s.length > 32767) s = s.slice(0, 32767);   // limite do Excel por célula
      let i = sidx.get(s);
      if (i === undefined) { i = sst.length; sst.push(s); sidx.set(s, i); }
      return i;
    };
    const cell = (ref, v, c) => {
      if (v == null || v === '') return '';
      if (typeof v === 'boolean') return '<c r="' + ref + '" t="b"><v>' + (v ? 1 : 0) + '</v></c>';
      if (typeof v === 'string' && (c.format === 'money' || c.format === 'number') && /^-?\d+(\.\d+)?$/.test(v.trim())) v = Number(v);
      if (typeof v === 'number') {
        if (!isFinite(v)) return '';
        const s = c.format === 'money' ? S.money : c.format === 'number' ? S.number : 0;
        return '<c r="' + ref + '"' + (s ? ' s="' + s + '"' : '') + '><v>' + v + '</v></c>';
      }
      let dt = null;
      if (v instanceof Date) { if (!isNaN(v)) dt = [v.getFullYear(), v.getMonth() + 1, v.getDate(), v.getHours(), v.getMinutes(), v.getSeconds()]; }
      else if (typeof v === 'string' && (o.dates || c.format === 'date')) {
        const m = ISO.exec(v.trim());
        if (m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31) dt = [+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)];
      }
      if (dt) {
        const n = serial(...dt), timed = dt[3] || dt[4] || dt[5];
        return '<c r="' + ref + '" s="' + (timed ? S.datetime : S.date) + '"><v>' + n + '</v></c>';
      }
      if (v instanceof Date) return '';
      return '<c r="' + ref + '" t="s"><v>' + str(typeof v === 'object' ? JSON.stringify(v) : v) + '</v></c>';
    };
    const L = cs.map((_, j) => colName(j)), out = [];
    const hasHeader = cs.some(c => c.header != null);
    let r = 0;
    if (hasHeader) {
      r = 1;
      out.push('<row r="1">' + cs.map((c, j) => '<c r="' + L[j] + '1" t="s" s="' + S.header + '"><v>' + str(c.header ?? '') + '</v></c>').join('') + '</row>');
    }
    for (const row of rows) {
      r++;
      let x = '<row r="' + r + '">';
      for (let j = 0; j < cs.length; j++) x += cell(L[j] + r, row == null ? null : row[cs[j].key], cs[j]);
      out.push(x + '</row>');
    }
    // largura: maior texto entre o título e as primeiras 500 linhas (ou width em px / 7)
    const widths = cs.map(c => {
      if (c.width) return Math.min(80, Math.max(6, c.width / 7));
      let w = String(c.header ?? '').length;
      for (let i = 0; i < Math.min(rows.length, 500); i++) {
        const v = rows[i] == null ? null : rows[i][c.key];
        const len = v == null ? 0 : typeof v === 'boolean' ? 10 /* VERDADEIRO */ : c.format === 'money' && typeof v === 'number' ? R4.util.money(v).length : c.format === 'date' ? 10 : String(v).length;
        if (len > w) w = len;
      }
      return Math.min(60, Math.max(8, w + 3));   // +3: o Excel desconta ~5px de margem da largura gravada
    });
    const name = sheetTitle(o.sheetName), last = (L[L.length - 1] || 'A') + Math.max(1, r);
    const sheet = XH + '<worksheet xmlns="' + NS + '" xmlns:r="' + RNS + '">' +
      '<dimension ref="A1' + (r > 1 || cs.length > 1 ? ':' + last : '') + '"/>' +
      '<sheetViews><sheetView workbookViewId="0">' + (hasHeader ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : '') + '</sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/>' +
      (cs.length ? '<cols>' + widths.map((w, j) => '<col min="' + (j + 1) + '" max="' + (j + 1) + '" width="' + w.toFixed(1) + '" customWidth="1"/>').join('') + '</cols>' : '') +
      '<sheetData>' + out.join('') + '</sheetData>' +
      (hasHeader && cs.length ? '<autoFilter ref="A1:' + last + '"/>' : '') + '</worksheet>';
    const wb = XH + '<workbook xmlns="' + NS + '" xmlns:r="' + RNS + '"><sheets><sheet name="' + xesc(name) + '" sheetId="1" r:id="rId1"/></sheets>' +
      (hasHeader && cs.length ? '<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">' +
        xesc("'" + name.replace(/'/g, "''") + "'!$A$1:$" + (L[L.length - 1] || 'A') + '$' + Math.max(1, r)) + '</definedName></definedNames>' : '') + '</workbook>';
    const ss = XH + '<sst xmlns="' + NS + '" count="' + sst.length + '" uniqueCount="' + sst.length + '">' +
      sst.map(s => '<si><t xml:space="preserve">' + xesc(s) + '</t></si>').join('') + '</sst>';
    const ct = XH + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>';
    const rel = t => 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/' + t;
    const rels = XH + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' + rel('officeDocument') + '" Target="xl/workbook.xml"/></Relationships>';
    const wbRels = XH + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="' + rel('worksheet') + '" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="' + rel('styles') + '" Target="styles.xml"/>' +
      '<Relationship Id="rId3" Type="' + rel('sharedStrings') + '" Target="sharedStrings.xml"/></Relationships>';
    const z = zip([
      { name: '[Content_Types].xml', data: ct }, { name: '_rels/.rels', data: rels },
      { name: 'xl/workbook.xml', data: wb }, { name: 'xl/_rels/workbook.xml.rels', data: wbRels },
      { name: 'xl/worksheets/sheet1.xml', data: sheet }, { name: 'xl/styles.xml', data: STYLES },
      { name: 'xl/sharedStrings.xml', data: ss }
    ]);
    return o.bytes ? z : new Blob([z], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /* ================= XLSX (leitura) ================= */
  const DATE_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
  const isDateFmt = code => /[dmyhs]/i.test(String(code).replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/\[[^\]]*\]/g, '').replace(/General/gi, ''));
  const colIndex = ref => { let n = 0; for (const ch of String(ref).toUpperCase()) { const c = ch.charCodeAt(0); if (c < 65 || c > 90) break; n = n * 26 + c - 64; } return n - 1; };
  const fromSerial = n => {
    const ms = Math.round((n - 25569) * 864e5), d = new Date(ms), p = x => String(x).padStart(2, '0');
    const day = d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
    return n % 1 ? day + 'T' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds()) : day;
  };
  /**
   * parseXLSX(arrayBuffer, {header:true, sheet:0, maxSize:50MB, maxUncompressed:200MB, maxEntries:2000, maxRows:200000})
   * Lê a 1ª planilha (ou a indicada). Requer DOMParser e, para partes compactadas, DecompressionStream('deflate-raw').
   */
  async function parseXLSX(buf, opts) {
    const o = Object.assign({ header: true, sheet: 0, maxSize: 50 * MB, maxUncompressed: 200 * MB, maxEntries: 2000, maxRows: 200000, maxCells: 10000000 }, opts);
    let cells = 0;   // células alocadas (inclui as vazias até a última coluna usada de cada linha)
    const u8 = buf instanceof Uint8Array ? buf : ArrayBuffer.isView(buf) ? new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) : new Uint8Array(buf);
    if (u8.length > o.maxSize) fail('Arquivo muito grande (' + bytes(u8.length) + '; máximo ' + bytes(o.maxSize) + ').');
    const z = zipIndex(u8, o), dec = new TextDecoder();
    let budget = o.maxUncompressed;
    const get = async (name, need) => {
      const e = z.map.get(name);
      if (!e) { if (need) fail('XLSX inválido: falta ' + name + '.'); return null; }
      const out = await zipRead(z, e, budget);
      budget -= out.length;
      return dec.decode(out);
    };
    const xml = s => {
      if (/<!DOCTYPE/i.test(s)) fail('XLSX recusado: contém DOCTYPE.');
      const d = new DOMParser().parseFromString(s, 'application/xml');
      if (d.getElementsByTagName('parsererror').length) fail('XML inválido dentro do XLSX.');
      return d;
    };
    const T = (n, tag) => n.getElementsByTagNameNS('*', tag);
    const kid = (n, tag) => { for (const k of n.children) if (k.localName === tag) return k; return null; };
    const wb = xml(await get('xl/workbook.xml', true));
    const sheets = [...T(wb, 'sheet')];
    if (!sheets.length) fail('XLSX sem planilhas.');
    if (Array.isArray(o.sheetsOut)) sheets.forEach(x => o.sheetsOut.push(x.getAttribute('name') || ''));
    const sh = (typeof o.sheet === 'string' ? sheets.find(x => x.getAttribute('name') === o.sheet) : sheets[o.sheet]) || sheets[0];
    const rid = sh.getAttributeNS(RNS, 'id') || sh.getAttribute('r:id');
    let target = 'worksheets/sheet1.xml';
    const relsTxt = await get('xl/_rels/workbook.xml.rels', false);
    if (relsTxt) { const rel = [...T(xml(relsTxt), 'Relationship')].find(r => r.getAttribute('Id') === rid); if (rel) target = rel.getAttribute('Target'); }
    const path = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
    // strings compartilhadas (texto rico: junta os <t> dos <r>, ignora a fonética <rPh>)
    const sst = [];
    const ssTxt = await get('xl/sharedStrings.xml', false);
    if (ssTxt) for (const si of T(xml(ssTxt), 'si')) {
      let s = '';
      for (const k of si.children) {
        if (k.localName === 't') s += k.textContent;
        else if (k.localName === 'r') { const t = kid(k, 't'); if (t) s += t.textContent; }
      }
      sst.push(s);
    }
    // estilos com formato de data
    const dateXf = new Set();
    const stTxt = await get('xl/styles.xml', false);
    if (stTxt) {
      const st = xml(stTxt), custom = new Map();
      for (const f of T(st, 'numFmt')) custom.set(+f.getAttribute('numFmtId'), f.getAttribute('formatCode') || '');
      const xfs = T(st, 'cellXfs')[0];
      if (xfs) [...xfs.children].filter(x => x.localName === 'xf').forEach((x, i) => {
        const id = +x.getAttribute('numFmtId') || 0;
        if (DATE_IDS.has(id) || (custom.has(id) && isDateFmt(custom.get(id)))) dateXf.add(i);
      });
    }
    const ws = xml(await get(path, true));
    const grid = [];
    let rn = 0;
    for (const row of T(ws, 'row')) {
      const ri = row.hasAttribute('r') ? +row.getAttribute('r') - 1 : rn;
      rn = ri + 1;
      if (ri < 0 || ri > o.maxRows + 1) { if (ri > o.maxRows + 1) fail('Planilha com linhas demais (máximo ' + o.maxRows + ').'); continue; }
      const vals = [];
      let cn = 0;
      for (const c of row.children) {
        if (c.localName !== 'c') continue;
        const ci = c.hasAttribute('r') ? colIndex(c.getAttribute('r')) : cn;
        cn = ci + 1;
        if (ci < 0 || ci > 16383) continue;
        const t = c.getAttribute('t'), vEl = kid(c, 'v'), v = vEl ? vEl.textContent : null;
        let val = null;
        if (t === 's') val = v == null ? null : sst[+v] ?? null;
        else if (t === 'inlineStr') { const is = kid(c, 'is'); val = is ? [...T(is, 't')].map(x => x.textContent).join('') : ''; }
        else if (t === 'str' || t === 'e') val = v;
        else if (t === 'b') val = v === '1';
        else if (v != null && v !== '') {
          const n = Number(v);
          val = isNaN(n) ? v : dateXf.has(+c.getAttribute('s') || 0) ? fromSerial(n) : n;
        }
        vals[ci] = val;
      }
      // "A1 e XFD1" numa linha alocaria 16.384 células: limita o total para não estourar a memória
      if ((cells += vals.length) > o.maxCells) fail('Planilha com células demais (máximo ' + o.maxCells + '; colunas muito distantes ou linhas demais).');
      for (let j = 0; j < vals.length; j++) if (vals[j] === undefined) vals[j] = null;
      grid[ri] = vals;
    }
    for (let i = 0; i < grid.length; i++) if (!grid[i]) grid[i] = [];
    while (grid.length && grid[grid.length - 1].every(v => v == null || v === '')) grid.pop();
    if (!o.header) return grid;
    if (!grid.length) return [];
    const keys = headerKeys(grid[0]);
    return grid.slice(1).map(r => {
      const obj = {};
      keys.forEach((k, j) => put(obj, k, r[j] ?? null));
      for (let j = keys.length; j < r.length; j++) if (r[j] != null) put(obj, 'coluna_' + (j + 1), r[j]);
      return obj;
    });
  }

  /* ================= interpretar: o arquivo "se explica" (sem esquema pré-definido) ================= */
  const LIM = { rows: 200000, cols: 200, text: 5 * MB, cell: 5000, sample: 2000, depth: 4 };
  const badKey = k => k === '__proto__' || k === 'constructor' || k === 'prototype';
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !ArrayBuffer.isView(v);
  const isPrim = v => v == null || typeof v !== 'object';
  const nfmt = n => R4.util.number(n, 0);

  /** "dataNascimento" / "data_nascimento" / "endereco.cidade" → "Data Nascimento" / "Endereco Cidade" (siglas ficam como estão). */
  function humanize(key) {
    const s = String(key).replace(/[._\-\s]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim();
    return s ? s.split(' ').map(w => (w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ') : String(key);
  }
  /** Valor de célula seguro: só primitivos (texto limitado, número finito, booleano ou null). */
  function cell(v, ctx) {
    if (v == null) return null;
    if (typeof v === 'string') {
      if (v.length > LIM.cell) { ctx.cut = true; return v.slice(0, LIM.cell); }
      return v;
    }
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'bigint') return String(v);
    if (v instanceof Date) return isNaN(v) ? null : v.toISOString();
    return null;   // função, símbolo...
  }
  /** Achata um objeto: aninhado vira chave pontuada; lista de primitivos vira "a, b"; lista de objetos vira JSON curto. */
  function flatten(o, ctx, prefix, out, depth) {
    for (const k of Object.keys(o)) {
      if (badKey(k)) { ctx.badKeys.add(k); continue; }
      const key = prefix ? prefix + '.' + k : k, v = o[k];
      if (Array.isArray(v)) {
        let t;
        if (v.every(isPrim)) t = v.map(x => (x == null ? '' : String(x))).join(', ');
        else { try { t = JSON.stringify(v, (kk, vv) => (badKey(kk) ? undefined : vv)); } catch (e) { t = ''; } }
        out[key] = cell(t, ctx);
      } else if (isObj(v) && depth < LIM.depth) flatten(v, ctx, key, out, depth + 1);
      else if (isObj(v)) { let t = ''; try { t = JSON.stringify(v, (kk, vv) => (badKey(kk) ? undefined : vv)); } catch (e) { /* ok */ } out[key] = cell(t, ctx); }
      else out[key] = cell(v, ctx);
    }
    return out;
  }
  /** Listas de objetos dentro de um objeto (até 3 níveis): [{ path, length }]. */
  function listCandidates(o, base, depth, out) {
    for (const k of Object.keys(o)) {
      if (badKey(k)) continue;
      const v = o[k], path = base ? base + '.' + k : k;
      if (Array.isArray(v) && v.length && v.filter(isObj).length * 2 >= v.length) out.push({ path, length: v.length });
      else if (isObj(v) && depth < 3) listCandidates(v, path, depth + 1, out);
    }
    return out;
  }
  const byPath = (o, path) => {
    let cur = o;
    for (const p of String(path).split('.')) { if (badKey(p) || cur == null || typeof cur !== 'object' || !Object.prototype.hasOwnProperty.call(cur, p)) return undefined; cur = cur[p]; }
    return cur;
  };

  /* ---- inferência de tipos ---- */
  const TRUE_ = new Set(['true', 'sim', 'yes', 'verdadeiro']), FALSE_ = new Set(['false', 'nao', 'não', 'no', 'falso']);
  const RE_ISO_D = /^(\d{4})-(\d{2})-(\d{2})$/;
  const RE_ISO_DT = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/;
  const RE_BR_D = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
  const okDate = (y, m, d) => m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1000;
  const pad2 = n => String(n).padStart(2, '0');
  const NAME_MONEY = /(valor|preco|preço|total|saldo|limite|custo|price|amount|salario|salário|receita|faturamento|desconto|frete|subtotal)/i;
  const NAME_TEXT = /(^|[^a-z])(cpf|cnpj|cep|telefone|celular|fone|documento|rg|codigo|código|cod|sku|ean|matricula|matrícula|zip|phone|chave)([^a-z]|$)/i;

  /** Converte uma string de número (pt-BR "1.234,56", en "1,234.56", "1234.5") conforme o estilo da coluna; null se não for número. */
  function parseNum(s, style) {
    let t = String(s).trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
    if (!t || !/^[+-]?[\d.,]+$/.test(t) || !/\d/.test(t)) return null;
    if (/^[+-]?0\d/.test(t)) return null;                 // zeros à esquerda (código, CEP): continua texto
    if (/^[+-]?\d{16,}$/.test(t)) return null;            // inteiro enorme: perderia precisão
    const hasC = t.includes(','), hasD = t.includes('.');
    let dec = null;
    if (hasC && hasD) dec = t.lastIndexOf(',') > t.lastIndexOf('.') ? ',' : '.';
    else if (hasC) dec = (t.match(/,/g).length > 1) ? null : (style === 'en' && /,\d{3}$/.test(t) ? null : ',');
    else if (hasD) dec = (t.match(/\./g).length > 1) ? null : (style !== 'en' && /\.\d{3}$/.test(t) && /^[+-]?\d{1,3}\.\d{3}$/.test(t) ? null : '.');
    let norm;
    if (dec === ',') { if (/,.*,/.test(t) || (t.indexOf('.') > -1 && t.indexOf('.') > t.indexOf(','))) return null; norm = t.replace(/\./g, '').replace(',', '.'); }
    else if (dec === '.') { if (/\..*\./.test(t) || (t.indexOf(',') > -1 && t.indexOf(',') > t.indexOf('.'))) return null; norm = t.replace(/,/g, ''); }
    else {   // só separador de milhar
      if (hasC && !/^[+-]?\d{1,3}(,\d{3})+$/.test(t)) return null;
      if (hasD && !/^[+-]?\d{1,3}(\.\d{3})+$/.test(t)) return null;
      norm = t.replace(/[.,]/g, '');
    }
    const n = Number(norm);
    return Number.isFinite(n) ? n : null;
  }
  const dateOf = (s, us) => {
    let m = RE_ISO_D.exec(s);
    if (m) return okDate(+m[1], +m[2], +m[3]) ? { kind: 'date', v: s } : null;
    m = RE_ISO_DT.exec(s);
    if (m) return okDate(+m[1], +m[2], +m[3]) ? { kind: 'datetime', v: s } : null;
    m = RE_BR_D.exec(s);
    if (m) {
      const a = +m[1], b = +m[2], y = +m[3], d = us ? b : a, mo = us ? a : b;
      if (!okDate(y, mo, d)) return null;
      const iso = y + '-' + pad2(mo) + '-' + pad2(d);
      return m[4] != null ? { kind: 'datetime', v: iso + ' ' + pad2(+m[4]) + ':' + m[5] + ':' + (m[6] || '00') } : { kind: 'date', v: iso };
    }
    return null;
  };

  /**
   * Descobre o tipo de UMA coluna olhando até LIM.sample valores e devolve {type, conv(v)} — conv só converte o que cabe no tipo.
   * Regra de segurança: só vira número/data/booleano se TODOS os valores não vazios da amostra couberem (senão fica texto).
   */
  function inferColumn(key, values) {
    const vals = [];
    for (let i = 0; i < values.length && vals.length < LIM.sample; i++) { const v = values[i]; if (v != null && v !== '') vals.push(v); }
    const text = { type: 'text', conv: v => v };
    if (!vals.length) return text;
    const strs = vals.filter(v => typeof v === 'string'), nStr = strs.length;
    // booleano
    if (vals.every(v => typeof v === 'boolean' || (typeof v === 'string' && (TRUE_.has(v.trim().toLowerCase()) || FALSE_.has(v.trim().toLowerCase())))))
      return { type: 'boolean', conv: v => (typeof v === 'boolean' ? v : typeof v === 'string' && TRUE_.has(v.trim().toLowerCase()) ? true : typeof v === 'string' && FALSE_.has(v.trim().toLowerCase()) ? false : v) };
    // números
    if (!(nStr && NAME_TEXT.test(key))) {
      let pt = 0, en = 0;
      strs.forEach(s => { const t = s.trim(); if (/^[+-]?\d{1,3}(\.\d{3}){2,}$/.test(t)) pt++; else if (/^[+-]?\d{1,3}(,\d{3}){2,}$/.test(t)) en++; else if (/,\d{1,2}$|,\d{4,}$/.test(t) || (/\./.test(t) && /,/.test(t) && t.lastIndexOf(',') > t.lastIndexOf('.'))) pt++; else if (/\.\d{1,2}$|\.\d{4,}$/.test(t) || (/\./.test(t) && /,/.test(t) && t.lastIndexOf('.') > t.lastIndexOf(','))) en++; });
      const style = pt > en ? 'pt' : en > pt ? 'en' : (strs.some(s => s.includes(',')) || (strs.some(s => s.includes('.')) && strs.every(x => !x.includes('.') || /^[+-]?\d{1,3}(\.\d{3})+$/.test(x.trim()))) ? 'pt' : 'en');   // sem pistas: "1.500" é milhar (pt-BR)
      const conv = v => (typeof v === 'number' ? v : typeof v === 'string' ? (parseNum(v, style) ?? v) : v);
      if (vals.every(v => (typeof v === 'number') || (typeof v === 'string' && parseNum(v, style) != null))) {
        const nums = vals.map(v => (typeof v === 'number' ? v : parseNum(v, style)));
        const int = nums.every(Number.isInteger), money = vals.some(v => typeof v === 'string' && /^R\$/i.test(v.trim())) || NAME_MONEY.test(key);
        return { type: money ? 'money' : int ? 'integer' : 'number', conv };
      }
    }
    // datas
    if (nStr === vals.length) {
      const probe = strs.map(s => s.trim());
      let us = false;
      const br = probe.map(s => RE_BR_D.exec(s)).filter(Boolean);
      if (br.length && br.every(m => +m[1] <= 12) && br.some(m => +m[2] > 12)) us = true;
      const ds = probe.map(s => dateOf(s, us));
      if (ds.every(Boolean)) {
        const kinds = new Set(ds.map(d => d.kind));
        return { type: kinds.has('datetime') ? 'datetime' : 'date', conv: v => { if (typeof v !== 'string') return v; const d = dateOf(v.trim(), us); return d ? (kinds.has('datetime') && d.kind === 'date' ? d.v + ' 00:00:00' : d.v) : v; } };
      }
    }
    return text;
  }
  function columnDef(key, inf, values) {
    const type = inf.type;
    let maxLen = 0;
    for (let i = 0; i < values.length && i < LIM.sample; i++) { const v = values[i]; if (v != null) { const l = String(v).length; if (l > maxLen) maxLen = l; } }
    const col = { dataIndex: key, header: humanize(key), type };
    if (type === 'number' || type === 'integer' || type === 'money') col.align = 'right';
    if (type === 'boolean') col.align = 'center';
    if (type === 'money') col.format = 'money';
    else if (type === 'number') col.format = 'number';
    else if (type === 'date') col.format = 'date';
    else if (type === 'boolean') col.format = 'bool';
    const chars = type === 'money' ? 14 : type === 'datetime' ? 19 : type === 'date' ? 11 : Math.min(maxLen, 40);
    col.width = Math.max(70, Math.min(320, Math.max(chars, col.header.length + 2) * 8 + 28));
    return col;
  }

  /* ---- montagem: linhas planas + colunas ---- */
  function build(rowsIn, ctx, meta) {
    let truncated = false;
    if (rowsIn.length > LIM.rows) { rowsIn = rowsIn.slice(0, LIM.rows); truncated = true; ctx.warn.push(T('r4.files.warnRows', { n: nfmt(LIM.rows) }, 'Arquivo truncado em ' + nfmt(LIM.rows) + ' linhas.')); }
    const keys = [], seen = new Set();
    for (const r of rowsIn) for (const k of Object.keys(r)) if (!seen.has(k)) { if (keys.length >= LIM.cols) { ctx.colCut = true; continue; } seen.add(k); keys.push(k); }
    if (ctx.colCut) { truncated = true; ctx.warn.push(T('r4.files.warnCols', { n: nfmt(LIM.cols) }, 'Colunas limitadas a ' + nfmt(LIM.cols) + '.')); }
    const colDefs = [], tipos = {}, convs = [];
    keys.forEach(k => {
      const vals = new Array(rowsIn.length);
      for (let i = 0; i < rowsIn.length; i++) vals[i] = rowsIn[i][k];
      const inf = inferColumn(k, vals);
      colDefs.push(columnDef(k, inf, vals)); tipos[k] = inf.type;
      convs.push(inf.type === 'text' ? null : inf.conv);
    });
    const rows = rowsIn.map(r => {
      const o = {};
      keys.forEach((k, j) => { const v = r[k] === undefined ? null : r[k]; o[k] = convs[j] && v != null && v !== '' ? convs[j](v) : v; });
      return o;
    });
    if (ctx.cut) ctx.warn.push(T('r4.files.warnCell', { n: nfmt(LIM.cell) }, 'Textos longos foram cortados em ' + nfmt(LIM.cell) + ' caracteres.'));
    if (ctx.badKeys.size) ctx.warn.push(T('r4.files.warnKey', { keys: [...ctx.badKeys].join(', ') }, 'Chaves ignoradas por segurança: ' + [...ctx.badKeys].join(', ') + '.'));
    return { rows, columns: colDefs, meta: Object.assign({ total: rows.length, truncated: truncated || !!meta.truncated, warnings: ctx.warn, tipos }, meta) };
  }
  /** objetos quaisquer → linhas planas (achata) */
  const flatRows = (list, ctx) => list.map(it => (isObj(it) ? flatten(it, ctx, '', {}, 0) : { valor: cell(it, ctx) }));
  /** Nomes de coluna únicos e seguros a partir de uma linha de cabeçalho. */
  function uniqueKeys(hdr, ctx) {
    const used = new Map(), out = [];
    hdr.forEach((h, i) => {
      let k = String(h ?? '').trim().slice(0, 120) || 'coluna_' + (i + 1);
      if (badKey(k)) { ctx.badKeys.add(k); out.push(null); return; }
      const n = used.get(k) || 0; used.set(k, n + 1);
      out.push(n ? k + '_' + (n + 1) : k);
    });
    return out;
  }
  // 1ª linha é cabeçalho? todas as células preenchidas são texto "de rótulo" (nem número, data ou booleano) e há ao menos uma preenchida
  const looksLikeHeader = r => { const f = r.filter(c => c != null && String(c).trim() !== ''); return f.length > 0 && f.length >= r.length / 2 && f.every(c => typeof c === 'string' && parseNum(c, 'pt') == null && !dateOf(c.trim(), false) && !TRUE_.has(c.trim().toLowerCase()) && !FALSE_.has(c.trim().toLowerCase())); };

  /** Fábrica de resultado a partir de dados já "parseados" (array, objeto, primitivo). */
  function fromData(data, opts, ctx, extra) {
    const meta = Object.assign({}, extra);
    if (Array.isArray(data)) {
      if (!data.length) return build([], ctx, Object.assign(meta, { shape: 'vazio' }));
      if (data.every(isObj)) return build(flatRows(data, ctx), ctx, Object.assign(meta, { shape: 'array-de-objetos' }));
      if (data.every(Array.isArray)) {
        const header = opts.header === true || (opts.header !== false && data.length > 1 && looksLikeHeader(data[0]));
        let keys, body = data;
        const largura = data.reduce((m, r) => Math.max(m, r.length), 0);
        if (header) { const h = data[0].slice(); while (h.length < largura) h.push(''); keys = uniqueKeys(h, ctx); body = data.slice(1); }
        else keys = uniqueKeys(Array.from({ length: largura }, () => ''), ctx);
        const rows = body.map(r => {
          const o = {};
          keys.forEach((k, j) => { if (k != null) o[k] = cell(r[j], ctx); });
          return o;
        });
        // colunas além do cabeçalho
        return build(rows, ctx, Object.assign(meta, { shape: 'array-de-arrays', header }));
      }
      if (data.every(isPrim)) return build(data.map(v => ({ valor: cell(v, ctx) })), ctx, Object.assign(meta, { shape: 'array-de-primitivos' }));
      return build(flatRows(data, ctx), ctx, Object.assign(meta, { shape: 'misto' }));
    }
    if (isObj(data)) {
      if (opts.path) {
        const sub = byPath(data, opts.path);
        if (sub === undefined) { ctx.warn.push(T('r4.files.warnPath', { path: String(opts.path) }, 'Caminho "' + opts.path + '" não encontrado; usando a estrutura inteira.')); }
        else return fromData(sub, Object.assign({}, opts, { path: null }), ctx, Object.assign(meta, { path: String(opts.path) }));
      }
      const cands = listCandidates(data, '', 1, []);
      if (cands.length) {
        const best = cands.reduce((a, b) => (b.length > a.length ? b : a));
        const r = fromData(byPath(data, best.path), Object.assign({}, opts, { path: null }), ctx, Object.assign(meta, { path: best.path }));
        r.meta.shape = 'objeto-com-lista'; r.meta.candidates = cands;
        return r;
      }
      const keys = Object.keys(data).filter(k => !badKey(k)), vals = keys.map(k => data[k]);
      if (keys.length !== Object.keys(data).length) Object.keys(data).filter(badKey).forEach(k => ctx.badKeys.add(k));
      if (keys.length >= 2 && vals.every(isObj)) {
        return build(keys.map(k => Object.assign({ chave: k }, flatten(data[k], ctx, '', {}, 0))), ctx, Object.assign(meta, { shape: 'objeto-de-objetos' }));
      }
      if (opts.keyValue) return build(keys.map(k => ({ chave: k, valor: cell(isPrim(data[k]) ? data[k] : JSON.stringify(data[k]), ctx) })), ctx, Object.assign(meta, { shape: 'chave-valor' }));
      return build([flatten(data, ctx, '', {}, 0)], ctx, Object.assign(meta, { shape: 'objeto' }));
    }
    return build([{ valor: cell(data, ctx) }], ctx, Object.assign(meta, { shape: 'primitivo' }));
  }

  const newCtx = () => ({ warn: [], badKeys: new Set(), cut: false, colCut: false });
  /** Texto (JSON, NDJSON, CSV/TSV/;) → resultado. */
  function fromText(text, opts, ctx) {
    text = String(text ?? '');
    const extra = {};
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    if (text.length > LIM.text) {
      // JSON inteiro não dá para "cortar no meio"; CSV e NDJSON (uma linha por registro) são truncados na última linha completa
      const inteiro = /^\s*\[/.test(text) || (/^\s*\{/.test(text) && !/\}\s*\r?\n\s*\{/.test(text.slice(0, 20000)));
      if (inteiro) fail(T('r4.files.textTooBig', { n: bytes(LIM.text) }, 'Texto grande demais (máximo ' + bytes(LIM.text) + ').'));
      const cut = text.lastIndexOf('\n', LIM.text);
      text = text.slice(0, cut > 0 ? cut : LIM.text); extra.truncated = true;
      ctx.warn.push(T('r4.files.warnText', { n: bytes(LIM.text) }, 'Arquivo truncado em ' + bytes(LIM.text) + '.'));
    }
    const t = text.trim();
    if (!t) return build([], ctx, { shape: 'vazio' });
    if (t[0] === '{' || t[0] === '[') {
      let data, ok = true;
      try { data = JSON.parse(t); } catch (e) { ok = false; }
      if (ok) return fromData(data, opts, ctx, Object.assign(extra, { formato: 'json' }));
      const lines = t.split(/\r?\n/).filter(l => l.trim()), arr = [];   // NDJSON / JSON Lines
      if (lines.length > 1) { for (const l of lines) { try { arr.push(JSON.parse(l)); } catch (x) { ok = false; break; } ok = true; } }
      if (ok && arr.length > 1) { const r = fromData(arr, opts, ctx, Object.assign(extra, { formato: 'ndjson' })); r.meta.shape = 'ndjson'; return r; }
      fail(T('r4.files.badJson', 0, 'JSON inválido.'));
    }
    const grid = parseCSV(t, { header: false, delimiter: opts.delimiter || 'auto', maxRows: LIM.rows + 2 });
    const r = fromData(grid, Object.assign({}, opts), ctx, Object.assign(extra, { formato: 'csv' }));
    r.meta.shape = 'csv';
    return r;
  }
  const isBinary = v => v instanceof ArrayBuffer || ArrayBuffer.isView(v) || (typeof Blob !== 'undefined' && v instanceof Blob);
  /** Binário (ArrayBuffer/Uint8Array/File/Blob): XLSX (ZIP "PK") ou texto. Devolve Promise. */
  async function fromBinary(v, opts) {
    const ctx = newCtx();
    let u8;
    if (typeof Blob !== 'undefined' && v instanceof Blob) u8 = new Uint8Array(await readArrayBuffer(v, { maxSize: opts.maxSize || 50 * MB }));
    else u8 = v instanceof Uint8Array ? v : ArrayBuffer.isView(v) ? new Uint8Array(v.buffer, v.byteOffset, v.byteLength) : new Uint8Array(v);
    if (u8.length > 3 && u8[0] === 0x50 && u8[1] === 0x4B) {
      const sheets = [];
      const grid = await parseXLSX(u8, { header: false, sheet: opts.sheet ?? 0, sheetsOut: sheets, maxRows: LIM.rows });
      const r = fromData(grid, opts, ctx, { formato: 'xlsx', sheets });
      r.meta.shape = 'planilha';
      return r;
    }
    return fromText(new TextDecoder('utf-8').decode(u8.length > LIM.text * 2 ? u8.subarray(0, LIM.text * 2) : u8), opts, ctx);
  }
  /**
   * interpret(entrada, opts) → { rows, columns, meta }  (Promise quando a entrada é binária: XLSX, ArrayBuffer, File/Blob)
   * entrada: texto (JSON, NDJSON, CSV/TSV), objeto/array já lidos ou o resultado do filedrop (parse). Sem esquema: tudo é descoberto.
   * opts: path ('dados.itens'), header (true|false|auto), sheet (índice|nome), keyValue, delimiter.
   */
  function interpret(entrada, opts) {
    const o = Object.assign({}, opts);
    if (isBinary(entrada)) return fromBinary(entrada, o);
    const ctx = newCtx();
    if (typeof entrada === 'string') return fromText(entrada, o, ctx);
    return fromData(entrada, o, ctx, { formato: 'objeto' });
  }
  const interpretFile = (file, opts) => Promise.resolve(fromBinary(file, Object.assign({}, opts)));
  /** Interpreta e já cria o grid: toGrid(alvo, entrada, { columnFilters, path, header, sheet, ...configDoGrid }) → Promise<{ grid, meta }> */
  async function toGrid(alvo, entrada, opts) {
    const o = Object.assign({}, opts), keep = {};
    ['path', 'header', 'sheet', 'keyValue', 'delimiter'].forEach(k => { if (k in o) { keep[k] = o[k]; delete o[k]; } });
    const r = await interpret(entrada, keep);
    const cfg = Object.assign({ pageSize: 25, pageSizeSelector: true, exportable: true, columnMenu: true, resizable: true }, o, { columns: r.columns.map(c => { const d = Object.assign({}, c); delete d.type; return d; }), data: r.rows });
    const grid = R4.create(Object.assign({ xtype: 'grid' }, cfg, { renderTo: alvo }));
    return { grid, meta: r.meta, columns: r.columns };
  }

  /* ================= módulo ================= */
  const api = { toCSV, parseCSV, csvSafe, toJSON, toXLSX, parseXLSX, download, pick, validate, readText, readArrayBuffer, zip, crc32, interpret, interpretFile, toGrid };
  R4.module('files', api, {
    title: 'R4.files', group: 'Dados',
    description: 'Arquivos sem dependências: CSV (RFC 4180) com proteção contra injeção de fórmula, JSON, XLSX gerado à mão (ZIP + CRC32) e lido com DecompressionStream, download sem navegar, escolha e leitura de arquivos com validação. O grid usa este módulo para exportar.',
    props: [
      { name: 'toCSV(linhas, {columns, delimiter:";", bom:true, header:true, decimal:".", eol:"\\r\\n", safe:true, formatted:false})', type: 'string', desc: 'Aspas e quebras escapadas (RFC 4180). safe prefixa \' em textos que começam com = + - @ TAB CR (números de verdade ficam como estão). BOM para o Excel abrir em UTF-8; decimal:"," para Excel pt-BR.' },
      { name: 'parseCSV(texto, {delimiter:"auto", header:true, types:false, decimal:".", skipEmpty:true, maxRows:0})', type: 'Array', desc: 'Detecta ; , TAB ou |, aceita BOM, CRLF/LF, "" e quebras dentro de campo. header → objetos (cabeçalhos repetidos ganham _2); types converte números/booleanos (mantém zeros à esquerda como texto).' },
      { name: 'csvSafe(texto)', type: 'string', desc: 'Proteção de fórmula para uma célula.' },
      { name: 'toJSON(linhas, {columns, space:2})', type: 'string', desc: 'JSON só com as colunas pedidas.' },
      { name: 'toXLSX(linhas, {columns, sheetName, dates:true, bytes:false})', type: 'Blob | Uint8Array', desc: 'Planilha .xlsx válida sem bibliotecas: cabeçalho em negrito e congelado, autofiltro, largura das colunas, números, booleanos, datas reais (dd/mm/aaaa) e moeda (format:"money"). Textos vão como texto (nunca fórmula).' },
      { name: 'parseXLSX(buffer, {header:true, sheet:0, maxSize, maxUncompressed, maxEntries, maxRows, maxCells})', type: 'Promise<Array>', desc: 'Lê a 1ª planilha (texto, números, booleanos, datas → "AAAA-MM-DD"). Limites contra "zip bomb" (padrão: 50 MB de arquivo, 200 MB descompactados, 200 mil linhas, 10 milhões de células); XML com DOCTYPE é recusado. Requer navegador moderno (DecompressionStream: Chrome/Edge 103+, Firefox 113+, Safari 16.4+).' },
      { name: 'interpret(entrada, {path, header, sheet, keyValue, delimiter})', type: '{rows, columns, meta} | Promise', desc: 'O arquivo "se explica": sem esquema, devolve linhas planas e colunas inferidas (header legível, type number|integer|money|date|datetime|boolean|text, align, format, width). Entrada: texto JSON/NDJSON/CSV/TSV, objeto/array, ou o resultado do filedrop. JSON: array de objetos, objeto com listas (escolhe a maior; meta.candidates lista as outras; path:"dados.itens" escolhe), objeto de objetos (coluna chave), array de arrays (header auto), primitivos, objeto simples. Aninhados viram chave pontuada. ArrayBuffer/Uint8Array/File/Blob (XLSX ou texto) devolvem Promise (meta.sheets lista as abas; sheet:índice|nome). Limites: 200 mil linhas, 200 colunas, 5 MB de texto, 5.000 caracteres por célula (meta.truncated + meta.warnings). Chaves __proto__/constructor/prototype são ignoradas.' },
      { name: 'interpretFile(file, opts)', type: 'Promise<{rows, columns, meta}>', desc: 'Lê o File respeitando o limite de tamanho e interpreta (XLSX, CSV, JSON...).' },
      { name: 'toGrid(alvo, entrada, {columnFilters, pageSize, ...config do grid, path, header, sheet})', type: 'Promise<{grid, meta, columns}>', desc: 'interpret + cria o grid com as colunas descobertas (paginação com seletor, exportar, menu de colunas e redimensionar ligados por padrão). Equivale a R4.grid(alvo, rows, { columns }).' },
      { name: 'download(conteúdo|Blob, nome, mime)', type: 'Blob', desc: 'Baixa sem navegar (link temporário + URL revogada). Nome é saneado.' },
      { name: 'pick({accept, multiple, maxSize})', type: 'Promise<File[]>', desc: 'Abre o seletor do sistema e valida extensão/tipo e tamanho; rejeita com mensagens em português (erro.errors).' },
      { name: 'validate(file, {accept, maxSize})', type: 'string|null', desc: 'Mensagem de erro ou null.' },
      { name: 'readText(file, {maxSize:20MB, encoding}) / readArrayBuffer(file, {maxSize:50MB})', type: 'Promise', desc: 'Lê o arquivo respeitando o limite de tamanho.' },
      { name: 'zip([{name, data}]) / crc32(bytes)', type: 'Uint8Array / number', desc: 'ZIP sem compressão (base do XLSX) e CRC-32.' }
    ]
  });
  R4.files = R4.modules.files.api;

  /* ================= <r4-grid>: atributos extras das <r4-col> ================= */
  // O gancho substitui o parser padrão do grid em declarative.js, então lê TODAS as colunas.
  const Grid = R4.registry.grid && R4.registry.grid.cls;
  if (R4.declare && Grid && Grid.colsFromHost) R4.declare('grid', (host, cfg) => {
    cfg.columns = Grid.colsFromHost(host);
    if (host.getAttribute('selectable') === '') cfg.selectable = 'single';   // <r4-grid selectable> = seleção simples
    return cfg;
  });

  /* ================= filedrop ================= */
  R4.define('filedrop', {
    config: { accept: '', multiple: false, maxSize: 10 * MB, maxFiles: 0, parse: '', text: '', buttonText: '',   // '' = texto padrão no idioma atual
      hint: '', disabled: false, list: true, delimiter: 'auto', header: true,
      // segurança (R4.sanitize): bloqueia .php/.exe/.js/... e dupla extensão; confere a assinatura dos bytes
      blockExec: true, sniff: true, field: 'arquivo',
      // editor de imagem (R4.imageeditor) antes de entrar na lista: edit="image"; os 5 atalhos abaixo valem como editOptions ('' / 0 = padrão do editor)
      edit: '', editOptions: {}, aspect: '', shape: '', maxWidth: 0, format: '', quality: 0 },
    build() {
      this._files = [];
      const hint = this._hint();
      this.input = el('input', { type: 'file', class: 'r4-fd-input', accept: this.accept || null, multiple: this.multiple, tabindex: '-1', 'aria-hidden': 'true' });
      this.btn = el('button', { type: 'button', class: 'r4-btn r4-btn-primary', disabled: this.disabled, text: this.buttonText });
      this.buttonText || tx(this.btn, 'r4.files.choose', 'Escolher arquivo');
      this.zone = el('div', { class: 'r4-fd-zone' }, [
        el('span', { class: 'r4-fd-ico', 'aria-hidden': 'true' }, [R4.icon('upload')]),
        this.text ? el('span', { class: 'r4-fd-text', text: this.text }) : tx(el('span', { class: 'r4-fd-text' }), 'r4.files.drop', 'Arraste arquivos para cá ou'), this.btn,
        hint ? this.hintEl = el('span', { class: 'r4-fd-hint', id: this.id + '-hint', text: hint }) : null]);
      if (hint) this.btn.setAttribute('aria-describedby', this.id + '-hint');
      this.msgEl = el('div', { class: 'r4-fd-msg', role: 'alert', hidden: true });
      this.listEl = el('ul', { class: 'r4-fd-list', hidden: true });
      tx(this.listEl, 'r4.files.selected', 'Arquivos selecionados', 'aria-label');
      const root = el('div', { class: 'r4-filedrop' + (this.disabled ? ' r4-disabled' : '') }, [this.zone, this.input, this.msgEl, this.listEl]);
      this.btn.addEventListener('click', ev => { ev.stopPropagation(); this.open(); });
      this.zone.addEventListener('click', () => this.open());
      this.input.addEventListener('change', () => { const f = [...this.input.files]; this.input.value = ''; this.add(f); });
      const over = on => ev => { ev.preventDefault(); if (!this.disabled) this.zone.classList.toggle('r4-fd-over', on); };
      this.zone.addEventListener('dragenter', over(true));
      this.zone.addEventListener('dragover', ev => { ev.preventDefault(); if (ev.dataTransfer) ev.dataTransfer.dropEffect = this.disabled ? 'none' : 'copy'; this.zone.classList.toggle('r4-fd-over', !this.disabled); });
      this.zone.addEventListener('dragleave', ev => { if (!this.zone.contains(ev.relatedTarget)) this.zone.classList.remove('r4-fd-over'); });
      this.zone.addEventListener('drop', ev => { ev.preventDefault(); this.zone.classList.remove('r4-fd-over'); ev.dataTransfer && this.add(ev.dataTransfer.files); });
      this.listEl.addEventListener('click', ev => { const b = ev.target.closest('[data-i]'); b && this.remove(+b.getAttribute('data-i')); });
      return root;
    },
    /** Abre o seletor de arquivos do sistema. */
    open() { if (!this.disabled) this.input.click(); return this; },
    getFiles() { return this._files.slice(); },
    clear() { this._files = []; this._list(); this._msg([]); return this; },
    remove(i) {
      const k = typeof i === 'number' ? i : this._files.indexOf(i), f = this._files[k];
      if (!f) return this;
      this._files.splice(k, 1); this._list();
      this.fire('remove', this, f);
      const btns = this.listEl.querySelectorAll('[data-i]');
      (btns[Math.min(k, btns.length - 1)] || this.btn).focus();
      return this;
    },
    setDisabled(d) { this.disabled = !!d; this.btn.disabled = !!d; this.el.classList.toggle('r4-disabled', !!d); return this; },
    /** Valida e adiciona arquivos (do seletor, de um drop ou criados por código). Devolve Promise. */
    async add(list) {
      if (this.disabled) return this;
      let files = [...(list || [])];
      const errs = [], ok = [];
      if (!this.multiple && files.length > 1) { errs.push('Selecione apenas um arquivo.'); files = files.slice(0, 1); }
      const S = R4.sanitize;
      for (const f of files) {
        const shown = shownName(f && f.name);
        let e = validate(f, { accept: this.accept, maxSize: this.maxSize });
        if (!e && S && bool(this.blockExec)) {
          const d = S.dangerousName(f.name);
          if (d === 'exec') e = T('r4.files.blocked', { name: shown }, '"' + shown + '": tipo de arquivo bloqueado por segurança (executável/script).');
          else if (d === 'double') e = T('r4.files.double', { name: shown }, '"' + shown + '": extensão dupla suspeita (ex.: .php.jpg).');
        }
        if (!e && S && bool(this.sniff)) {
          const r = await S.sniffFile(f);
          if (r.match === false || (bool(this.blockExec) && ['exe', 'script', 'php'].includes(r.kind)))
            e = T('r4.files.mismatch', { name: shown, ext: r.ext || '?', kind: r.kind }, '"' + shown + '": o conteúdo não corresponde à extensão .' + (r.ext || '?') + ' (parece ' + r.kind + ').');
        }
        let cur = f;
        if (!e && this.edit === 'image' && R4.imageeditor && R4.imageeditor.open) {
          try { cur = await this._edit(f); } catch (er) { e = er && er.message ? er.message : String(er); }
          if (!e && !cur) continue;   // cancelou: o arquivo é descartado, sem mensagem de erro
        }
        if (e) errs.push(e);
        else if (this.multiple && this._files.concat(ok).some(x => x.name === cur.name && x.size === cur.size && x.lastModified === cur.lastModified)) errs.push(T('r4.files.dup', { name: shown }, '"' + shown + '" já está na lista.'));
        else ok.push(cur);
      }
      if (this._destroyed) return this;
      if (this.multiple && this.maxFiles && this._files.length + ok.length > this.maxFiles) {
        errs.push(T('r4.files.maxFiles', { n: this.maxFiles }, 'Selecione no máximo ' + this.maxFiles + ' arquivo(s).'));
        ok.splice(Math.max(0, this.maxFiles - this._files.length));
      }
      if (errs.length) this.fire('invalid', this, errs);
      this._msg(errs);
      if (!ok.length) return this;
      this._files = this.multiple ? this._files.concat(ok) : ok;
      this._list();
      let data;
      if (this.parse) {
        data = [];
        for (const f of ok) {
          try { const d = await this._read(f); data.push(d); this.fire('data', this, d, f); }
          catch (e) { data.push(null); errs.push('"' + shownName(f.name) + '": ' + e.message); }
        }
        this._msg(errs);
      }
      this.fire('files', this, ok, data);
      return this;
    },
    /**
     * edit="image": abre o editor ANTES de o arquivo entrar na lista. Devolve o File editado (substitui o original),
     * null se o usuário cancelou, ou o próprio arquivo se não se apresenta como imagem. Imagem recusada pelo editor
     * (SVG, tipo falso, grande demais) lança Error com a mensagem. O editado passa de novo por accept/maxSize.
     */
    async _edit(f) {
      const IE = R4.imageeditor;
      if (!IE.isImageLike || !IE.isImageLike(f)) return f;
      const o = {};
      if (this.aspect !== '' && this.aspect != null) o.aspect = this.aspect;
      if (this.shape) o.shape = this.shape;
      if (this.maxWidth > 0) { o.maxWidth = this.maxWidth; o.maxHeight = this.maxWidth; }
      if (this.format) o.format = this.format;
      if (this.quality > 0) o.quality = this.quality;
      Object.assign(o, this.editOptions && typeof this.editOptions === 'object' ? this.editOptions : {});
      if (!o.format) {   // o editor grava JPEG; se o accept não aceita JPEG mas aceita PNG/WebP, usa esse
        const nope = x => !acceptOk({ name: 'x.' + x, type: 'image/' + (x === 'jpg' ? 'jpeg' : x) }, this.accept);
        if (nope('jpg')) o.format = !nope('png') ? 'png' : !nope('webp') ? 'webp' : undefined;
      }
      await IE.check(f, o);
      const out = await IE.open(f, o);
      if (!out) return null;
      const bad = validate(out, { accept: this.accept, maxSize: this.maxSize });
      if (bad) throw new Error(bad);
      return out;
    },
    async _read(f) {
      const p = String(this.parse).toLowerCase();
      if (p === 'xlsx') return parseXLSX(await readArrayBuffer(f, { maxSize: this.maxSize || 50 * MB }), { header: this.header });
      const text = await readText(f, { maxSize: this.maxSize || 20 * MB });
      if (p === 'csv') return parseCSV(text, { delimiter: this.delimiter, header: this.header, types: true, decimal: this.delimiter === ';' || (this.delimiter === 'auto' && detectDelimiter(text) === ';') ? ',' : '.' });
      if (p === 'json') { try { return JSON.parse(text); } catch (e) { throw new Error(T('r4.files.badJson', 0, 'JSON inválido.')); } }
      return text;
    },
    /** Dica padrão (tipos aceitos e tamanho máximo) no idioma atual. */
    _hint() {
      return this.hint || [this.accept ? T('r4.files.types', { types: this.accept }, 'Tipos: ' + this.accept) : '',
        this.maxSize ? T(this.multiple ? 'r4.files.maxEach' : 'r4.files.max', { size: bytes(this.maxSize) }, 'Máx. ' + bytes(this.maxSize)) : ''].filter(Boolean).join(' · ');
    },
    relocalize() { if (this.hintEl) this.hintEl.textContent = this._hint(); this._list(); },
    _msg(errs) { this.msgEl.hidden = !errs.length; this.msgEl.textContent = errs.join('\n'); },
    _list() {
      this.listEl.hidden = !this.list || !this._files.length;
      this.listEl.replaceChildren(...this._files.map((f, i) => { const n = shownName(f.name); return el('li', { class: 'r4-fd-item' }, [
        el('span', { class: 'r4-fd-name', text: n, title: n }), el('span', { class: 'r4-fd-size', text: bytes(f.size) }),
        el('button', { type: 'button', class: 'r4-fd-rm', 'data-i': i, 'aria-label': T('r4.form.remove', { item: n }, 'Remover ' + n), title: T('r4.remove', 0, 'Remover') }, [R4.icon('close')])]); }));
    },
    /**
     * Envia os arquivos aceitos para `url` (multipart/form-data, um POST por arquivo, campo `field`).
     * O nome no corpo é o SANEADO (R4.sanitize.filename); `data` vira campos de texto extras (sem
     * chaves __proto__/constructor/prototype). Promise<[{file, ok, status, data}]>; eventos upload/uploaderror.
     * O servidor precisa validar de novo (Core\Security\Upload): o navegador pode ser contornado.
     */
    async upload(url, opts) {
      const o = Object.assign({ field: this.field || 'arquivo', data: null, headers: null }, opts);
      url = R4.http && R4.http.check ? R4.http.check(url) : url;
      const extra = o.data && typeof o.data === 'object' ? (R4.sanitize ? R4.sanitize.deep(o.data) : o.data) : null;
      const out = [];
      for (const f of this._files.slice()) {
        const fd = new FormData();
        if (extra) Object.keys(extra).forEach(k => { const v = extra[k]; if (v != null && typeof v !== 'object') fd.append(k, String(v)); });
        fd.append(String(o.field), f, shownName(f.name));
        let r;
        try {
          const res = await fetch(url, { method: 'POST', body: fd, credentials: 'same-origin', headers: Object.assign({ Accept: 'application/json' }, o.headers || {}) });
          const text = await res.text();
          let data = null; try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
          r = { file: f, ok: res.ok && !(data && typeof data.status === 'number' && data.status >= 400), status: res.status, data };
        } catch (e) { r = { file: f, ok: false, status: 0, data: null, error: e }; }
        out.push(r);
        if (this._destroyed) return out;
        this.fire(r.ok ? 'upload' : 'uploaderror', this, r);
      }
      const fails = out.filter(r => !r.ok).map(r => {
        const er = r.data && r.data.erros, m = er && typeof er === 'object' ? Object.values(er).filter(x => typeof x === 'string').join(' ') : '';
        return '"' + shownName(r.file.name) + '": ' + (m || (r.data && typeof r.data.retorno === 'string' && r.data.retorno) || T('r4.files.uploadFail', 0, 'falha no envio.'));
      });
      this._msg(fails);
      return out;
    }
  }, {
    title: 'filedrop', group: 'Dados',
    description: 'Área de arrastar e soltar arquivos + botão, com validação de tipo e tamanho (mensagens em português), lista com remover e leitura opcional (CSV, JSON, XLSX ou texto). Arquivos são tratados como não confiáveis: limite de tamanho e nada é exibido como HTML.',
    props: [
      { name: 'accept', type: 'string', default: "''", desc: 'Extensões e/ou tipos MIME: ".csv,.xlsx" ou "image/*". Validado de novo após a escolha.' },
      { name: 'multiple / maxFiles', type: 'boolean / number', default: 'false / 0', desc: 'Vários arquivos e o máximo (0 = sem limite).' },
      { name: 'maxSize', type: 'number (bytes)', default: '10485760', desc: 'Tamanho máximo por arquivo (10 MB).' },
      { name: 'parse', type: "'' | 'csv' | 'json' | 'xlsx' | 'text'", default: "''", desc: 'Lê o conteúdo e entrega no evento files/data. CSV detecta o delimitador e converte números (vírgula decimal quando o separador é ";").' },
      { name: 'delimiter / header', type: "string / boolean", default: "'auto' / true", desc: 'Opções de leitura do CSV/XLSX (primeira linha como cabeçalho).' },
      { name: 'text / buttonText / hint', type: 'string', default: "'' / '' / ''", desc: 'Textos da área (vazios = padrão no idioma atual; o hint padrão mostra tipos e tamanho máximo).' },
      { name: 'disabled / list', type: 'boolean', default: 'false / true', desc: 'Desabilita; mostra a lista de arquivos.' },
      { name: 'blockExec', type: 'boolean', default: 'true', desc: 'Recusa extensões executáveis/script (.php, .phtml, .phar, .exe, .bat, .cmd, .sh, .js, .jar, .msi, .com, .scr, .vbs, .ps1, .htaccess...) e dupla extensão perigosa (shell.php.jpg).' },
      { name: 'sniff', type: 'boolean', default: 'true', desc: 'Lê os primeiros bytes (R4.sanitize.sniffFile) e recusa conteúdo que não bate com a extensão (PHP com nome .png, executável com nome .csv...).' },
      { name: 'edit / editOptions', type: "'' | 'image' / object", default: "'' / {}", desc: "edit=\"image\": cada imagem aceita abre o editor (R4.imageeditor.open: cortar, girar, zoom) ANTES de entrar na lista; o arquivo editado (re-codificado, sem EXIF/GPS) substitui o original e é o que o upload() envia; cancelar descarta o arquivo. Arquivos que não são imagem seguem o fluxo normal; SVG e imagem falsa são recusados com mensagem. editOptions = {aspect, shape, maxWidth, format, quality...}; em HTML os atalhos aspect, shape, max-width, format e quality (<r4-filedrop edit=\"image\" accept=\"image/*\" aspect=\"1\">)." },
      { name: 'upload(url, {field, data, headers})', type: 'Promise', desc: 'Envia cada arquivo aceito em multipart/form-data (campo "arquivo" por padrão) com o nome JÁ saneado. Eventos upload / uploaderror. O servidor valida de novo (Core\\Security\\Upload).' },
      { name: 'Nome exibido', type: 'segurança', desc: 'A lista e as mensagens mostram R4.sanitize.filename(nome): sem caminho, bidi (U+202E), controles; só a última extensão.' },
      { name: 'add(files) / open() / remove(i|file) / clear() / getFiles() / setDisabled(b)', type: 'método', desc: 'add aceita FileList/array (ex.: new File([...], "x.csv")) e devolve Promise.' },
      { name: 'files(cmp, novos, dados)', type: 'evento', desc: 'Arquivos aceitos; dados = array paralelo com o conteúdo lido (quando parse).' },
      { name: 'data(cmp, dados, file) / invalid(cmp, mensagens) / remove(cmp, file)', type: 'evento', desc: 'Conteúdo de cada arquivo, erros de validação e remoção.' }
    ],
    events: ['files', 'data', 'invalid', 'remove', 'upload', 'uploaderror']
  });
  R4.registry.filedrop.meta.playground = {
    html: '<r4-filedrop{attrs}></r4-filedrop>', cfg: {},
    controls: { accept: '.csv,.json,.xlsx,.txt', multiple: true, maxSize: 1048576, maxFiles: 0, parse: ['', 'csv', 'json', 'xlsx', 'text'], buttonText: '', disabled: false }
  };
  /** R4.filedrop(alvo, aoReceber(files, dados)) | R4.filedrop(alvo, '.csv', {parse:'csv'}) */
  if (R4.quickMap) R4.quickMap.filedrop = (a, b) => {
    const fn = typeof a === 'function' ? a : typeof b === 'function' ? b : null;
    const cfg = typeof a === 'string' ? { accept: a } : a && typeof a === 'object' ? a : {};
    const extra = b && typeof b === 'object' ? b : {};
    return Object.assign({}, cfg, extra, fn ? { listeners: Object.assign({}, cfg.listeners, extra.listeners, { files: (c, f, d) => fn(f, d, c) }) } : {});
  };
})(window.R4);
