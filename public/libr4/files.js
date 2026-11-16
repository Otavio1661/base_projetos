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
  const { el } = R4.util;
  const MB = 1024 * 1024;
  const fail = msg => { throw new Error(msg); };
  const bytes = n => R4.util.bytes(n);

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
  /** Mensagem de erro em português, ou null se o arquivo passar em accept/maxSize. */
  function validate(file, opts) {
    const o = opts || {};
    if (!file || typeof file.size !== 'number') return 'Arquivo inválido.';
    if (o.accept && !acceptOk(file, o.accept)) return '"' + file.name + '": tipo de arquivo não permitido (aceitos: ' + o.accept + ').';
    if (o.maxSize && file.size > o.maxSize) return '"' + file.name + '": arquivo muito grande (' + bytes(file.size) + '; máximo ' + bytes(o.maxSize) + ').';
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
      fr.onerror = () => reject(new Error('Não foi possível ler "' + file.name + '".'));
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
    const sh = sheets[o.sheet] || sheets[0];
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

  /* ================= módulo ================= */
  const api = { toCSV, parseCSV, csvSafe, toJSON, toXLSX, parseXLSX, download, pick, validate, readText, readArrayBuffer, zip, crc32 };
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
    config: { accept: '', multiple: false, maxSize: 10 * MB, maxFiles: 0, parse: '', text: 'Arraste arquivos para cá ou', buttonText: 'Escolher arquivo',
      hint: '', disabled: false, list: true, delimiter: 'auto', header: true },
    build() {
      this._files = [];
      const hint = this.hint || [this.accept ? 'Tipos: ' + this.accept : '', this.maxSize ? 'Máx. ' + bytes(this.maxSize) + (this.multiple ? ' por arquivo' : '') : ''].filter(Boolean).join(' · ');
      this.input = el('input', { type: 'file', class: 'r4-fd-input', accept: this.accept || null, multiple: this.multiple, tabindex: '-1', 'aria-hidden': 'true' });
      this.btn = el('button', { type: 'button', class: 'r4-btn r4-btn-primary', disabled: this.disabled, text: this.buttonText });
      this.zone = el('div', { class: 'r4-fd-zone' }, [
        el('span', { class: 'r4-fd-ico', 'aria-hidden': 'true', text: '⇪' }),
        el('span', { class: 'r4-fd-text', text: this.text }), this.btn,
        hint ? el('span', { class: 'r4-fd-hint', id: this.id + '-hint', text: hint }) : null]);
      if (hint) this.btn.setAttribute('aria-describedby', this.id + '-hint');
      this.msgEl = el('div', { class: 'r4-fd-msg', role: 'alert', hidden: true });
      this.listEl = el('ul', { class: 'r4-fd-list', 'aria-label': 'Arquivos selecionados', hidden: true });
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
      for (const f of files) {
        const e = validate(f, { accept: this.accept, maxSize: this.maxSize });
        if (e) errs.push(e);
        else if (this.multiple && this._files.concat(ok).some(x => x.name === f.name && x.size === f.size && x.lastModified === f.lastModified)) errs.push('"' + f.name + '" já está na lista.');
        else ok.push(f);
      }
      if (this.multiple && this.maxFiles && this._files.length + ok.length > this.maxFiles) {
        errs.push('Selecione no máximo ' + this.maxFiles + ' arquivo' + (this.maxFiles > 1 ? 's' : '') + '.');
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
          catch (e) { data.push(null); errs.push('"' + f.name + '": ' + e.message); }
        }
        this._msg(errs);
      }
      this.fire('files', this, ok, data);
      return this;
    },
    async _read(f) {
      const p = String(this.parse).toLowerCase();
      if (p === 'xlsx') return parseXLSX(await readArrayBuffer(f, { maxSize: this.maxSize || 50 * MB }), { header: this.header });
      const text = await readText(f, { maxSize: this.maxSize || 20 * MB });
      if (p === 'csv') return parseCSV(text, { delimiter: this.delimiter, header: this.header, types: true, decimal: this.delimiter === ';' || (this.delimiter === 'auto' && detectDelimiter(text) === ';') ? ',' : '.' });
      if (p === 'json') { try { return JSON.parse(text); } catch (e) { throw new Error('JSON inválido.'); } }
      return text;
    },
    _msg(errs) { this.msgEl.hidden = !errs.length; this.msgEl.textContent = errs.join('\n'); },
    _list() {
      this.listEl.hidden = !this.list || !this._files.length;
      this.listEl.replaceChildren(...this._files.map((f, i) => el('li', { class: 'r4-fd-item' }, [
        el('span', { class: 'r4-fd-name', text: f.name, title: f.name }), el('span', { class: 'r4-fd-size', text: bytes(f.size) }),
        el('button', { type: 'button', class: 'r4-fd-rm', 'data-i': i, 'aria-label': 'Remover ' + f.name, title: 'Remover', text: '×' })])));
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
      { name: 'text / buttonText / hint', type: 'string', desc: 'Textos da área (hint padrão mostra tipos e tamanho máximo).' },
      { name: 'disabled / list', type: 'boolean', default: 'false / true', desc: 'Desabilita; mostra a lista de arquivos.' },
      { name: 'add(files) / open() / remove(i|file) / clear() / getFiles() / setDisabled(b)', type: 'método', desc: 'add aceita FileList/array (ex.: new File([...], "x.csv")) e devolve Promise.' },
      { name: 'files(cmp, novos, dados)', type: 'evento', desc: 'Arquivos aceitos; dados = array paralelo com o conteúdo lido (quando parse).' },
      { name: 'data(cmp, dados, file) / invalid(cmp, mensagens) / remove(cmp, file)', type: 'evento', desc: 'Conteúdo de cada arquivo, erros de validação e remoção.' }
    ],
    events: ['files', 'data', 'invalid', 'remove']
  });
  R4.registry.filedrop.meta.playground = {
    html: '<r4-filedrop{attrs}></r4-filedrop>', cfg: {},
    controls: { accept: '.csv,.json,.xlsx,.txt', multiple: true, maxSize: 1048576, maxFiles: 0, parse: ['', 'csv', 'json', 'xlsx', 'text'], buttonText: 'Escolher arquivo', disabled: false }
  };
  /** R4.filedrop(alvo, aoReceber(files, dados)) | R4.filedrop(alvo, '.csv', {parse:'csv'}) */
  if (R4.quickMap) R4.quickMap.filedrop = (a, b) => {
    const fn = typeof a === 'function' ? a : typeof b === 'function' ? b : null;
    const cfg = typeof a === 'string' ? { accept: a } : a && typeof a === 'object' ? a : {};
    const extra = b && typeof b === 'object' ? b : {};
    return Object.assign({}, cfg, extra, fn ? { listeners: Object.assign({}, cfg.listeners, extra.listeners, { files: (c, f, d) => fn(f, d, c) }) } : {});
  };
})(window.R4);
