/* suíte files: toCSV (proteção de fórmula), parseCSV, toXLSX/parseXLSX (ZIP/CRC, DOCTYPE, zip bomb), filedrop e download */
(() => {
  const { suite, test, assert } = R4Test;
  const F = () => R4.files;
  const enc = s => new TextEncoder().encode(s);
  const latin = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return s; };
  const NSX = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const WB = '<?xml version="1.0"?><workbook xmlns="' + NSX + '" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="P" sheetId="1" r:id="rId1"/></sheets></workbook>';
  const PNG = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
  const arq = (conteudo, nome, tipo) => new File([conteudo], nome, tipo ? { type: tipo } : {});

  /* ZIP mínimo (com ou sem deflate) para montar XLSX maliciosos de teste */
  async function deflate(u8) {
    const cs = new CompressionStream('deflate-raw'), w = cs.writable.getWriter();
    w.write(u8); w.close();
    const r = cs.readable.getReader(), partes = []; let n = 0;
    for (;;) { const { done, value } = await r.read(); if (done) break; partes.push(value); n += value.length; }
    const out = new Uint8Array(n); let o = 0; partes.forEach(p => { out.set(p, o); o += p.length; });
    return out;
  }
  async function zipar(entradas) {   // [{name, data (string|Uint8Array), deflate}]
    const partes = [], central = []; let off = 0;
    const u32 = (dv, p, v) => dv.setUint32(p, v, true), u16 = (dv, p, v) => dv.setUint16(p, v, true);
    for (const e of entradas) {
      const nome = enc(e.name), cru = typeof e.data === 'string' ? enc(e.data) : e.data, dados = e.deflate ? await deflate(cru) : cru, crc = R4.files.crc32(cru);
      const h = new Uint8Array(30), hv = new DataView(h.buffer);
      u32(hv, 0, 0x04034b50); u16(hv, 4, 20); u16(hv, 6, 0x0800); u16(hv, 8, e.deflate ? 8 : 0); u32(hv, 14, crc); u32(hv, 18, dados.length); u32(hv, 22, cru.length); u16(hv, 26, nome.length);
      partes.push(h, nome, dados);
      const c = new Uint8Array(46), cv = new DataView(c.buffer);
      u32(cv, 0, 0x02014b50); u16(cv, 4, 20); u16(cv, 6, 20); u16(cv, 8, 0x0800); u16(cv, 10, e.deflate ? 8 : 0); u32(cv, 16, crc); u32(cv, 20, dados.length); u32(cv, 24, cru.length); u16(cv, 28, nome.length); u32(cv, 42, off);
      central.push(c, nome);
      off += 30 + nome.length + dados.length;
    }
    const tam = central.reduce((s, p) => s + p.length, 0), fim = new Uint8Array(22), fv = new DataView(fim.buffer);
    u32(fv, 0, 0x06054b50); u16(fv, 8, entradas.length); u16(fv, 10, entradas.length); u32(fv, 12, tam); u32(fv, 16, off);
    const todos = [...partes, ...central, fim], total = todos.reduce((s, p) => s + p.length, 0), out = new Uint8Array(total); let o = 0;
    todos.forEach(p => { out.set(p, o); o += p.length; });
    return out;
  }
  const xlsx = (sheet, extra = [], opts = {}) => zipar([{ name: 'xl/workbook.xml', data: opts.wb || WB }, { name: 'xl/worksheets/sheet1.xml', data: sheet, deflate: !!opts.deflate }, ...extra]);
  const planilha = corpo => '<worksheet xmlns="' + NSX + '"><sheetData>' + corpo + '</sheetData></worksheet>';

  suite('files', () => {
    test('toCSV: ; por padrão, BOM, cabeçalho, aspas/quebras/delimitador escapados (RFC 4180), nulos vazios', t => {
      const csv = F().toCSV([{ a: 1, b: 'x;y', c: 'quebra\nlinha', d: 'aspas "q"', e: null, f: undefined, g: true, h: 1.5 }]);
      assert.eq(csv.charCodeAt(0), 0xFEFF, 'BOM para o Excel abrir em UTF-8');
      assert.eq(csv.slice(1), 'a;b;c;d;e;f;g;h\r\n1;"x;y";"quebra\nlinha";"aspas ""q""";;;true;1.5\r\n');
      assert.eq(F().toCSV([{ a: 1 }], { bom: false }), 'a\r\n1\r\n');
      assert.eq(F().toCSV([{ a: 1, b: 2 }], { bom: false, header: false, delimiter: ',', eol: '\n' }), '1,2\n');
      assert.eq(F().toCSV([{ a: 1.5, b: 2 }], { bom: false, decimal: ',', delimiter: ',', header: false, eol: '\n' }), '"1,5",2\n', 'decimal "," com delimitador "," exige aspas');
      assert.eq(F().toCSV([{ n: 'Ana', v: 1234.5 }], { bom: false, columns: [{ key: 'n', header: 'Nome' }, { key: 'v', header: 'Valor', format: 'money' }], formatted: true }).replace(/ /g, ' '), 'Nome;Valor\r\nAna;R$ 1.234,50\r\n');
      assert.eq(F().toCSV([], { bom: false }).trim(), '', 'sem linhas e sem colunas: nada além da quebra de linha');
    });

    test('toCSV: neutraliza fórmulas (=, @, TAB, CR) com apóstrofo; números de verdade e textos numéricos ficam; header também', t => {
      const csv = F().toCSV([{ a: '=HYPERLINK("http://evil","x")' }, { a: '@SUM(1+1)' }, { a: '+1+1' }, { a: '-2+3' }, { a: '\t=1' }, { a: '\r=1' }, { a: -5 }, { a: '-5' }, { a: 'normal' }],
        { bom: false, columns: [{ key: 'a', header: '=cmd|x' }] });
      const cel = F().parseCSV(csv, { header: false, delimiter: ';' }).map(r => r[0]);
      assert.eq(cel[0], "'=cmd|x", 'cabeçalho neutralizado');
      assert.eq(cel[1], '\'=HYPERLINK("http://evil","x")');
      assert.eq(cel[2], "'@SUM(1+1)");
      assert.eq(cel[3], "'+1+1", '+ seguido de fórmula');
      assert.eq(cel[4], "'-2+3");
      assert.ok(cel[5].startsWith("'\t"), 'TAB inicial');
      assert.ok(cel[6].startsWith("'\r"), 'CR inicial');
      assert.eq(cel[7], '-5', 'número negativo de verdade não é alterado');
      assert.eq(cel[8], '-5', 'texto numérico não é alterado');
      assert.eq(cel[9], 'normal');
      assert.eq(F().csvSafe('=x'), "'=x");
      assert.eq(F().csvSafe('abc'), 'abc');
      assert.eq(F().csvSafe('@a'), "'@a");
      assert.eq(F().toCSV([{ a: '=1+1' }], { bom: false, header: false, safe: false }), '=1+1\r\n', 'safe:false desliga');
    });

    test('parseCSV: BOM, CRLF, campos com aspas, vírgula, quebra de linha e "" dentro do campo', t => {
      const r = F().parseCSV('﻿nome,idade\r\n"Ana, Maria",30\r\n"linha\nquebrada","aspas ""x"""\r\n');
      assert.deepEq(r, [{ nome: 'Ana, Maria', idade: '30' }, { nome: 'linha\nquebrada', idade: 'aspas "x"' }]);
      assert.deepEq(F().parseCSV('a;b\n1;2\n3;4'), [{ a: '1', b: '2' }, { a: '3', b: '4' }]);
      assert.deepEq(F().parseCSV('1;2\n3;4', { header: false }), [['1', '2'], ['3', '4']], 'header:false devolve matrizes');
      assert.deepEq(F().parseCSV('a;b\n\n1;2\n\n'), [{ a: '1', b: '2' }], 'linhas vazias ignoradas');
      assert.deepEq(F().parseCSV('a;b\n1;2\n3;4\n5;6', { maxRows: 2 }).length, 2, 'maxRows');
    });

    test('parseCSV: detecta ; , TAB |; cabeçalhos repetidos ganham _2; types converte números/booleanos mantendo zeros à esquerda', t => {
      assert.deepEq(F().parseCSV('a|b\n1|2'), [{ a: '1', b: '2' }]);
      assert.deepEq(F().parseCSV('a\tb\n1\t2'), [{ a: '1', b: '2' }]);
      assert.deepEq(F().parseCSV('a,b\n1,2'), [{ a: '1', b: '2' }]);
      assert.deepEq(F().parseCSV('x;x;x\n1;2;3'), [{ x: '1', x_2: '2', x_3: '3' }]);
      assert.deepEq(F().parseCSV('a;b;c\n001;1,5;true\n2;x;false', { types: true, decimal: ',' }), [{ a: '001', b: 1.5, c: true }, { a: 2, b: 'x', c: false }]);
      assert.deepEq(F().parseCSV('a;b\n1.5;2', { types: true }), [{ a: 1.5, b: 2 }]);
    });

    test('parseCSV: __proto__/constructor como cabeçalho não poluem protótipos; aspas quebradas terminam sem travar', t => {
      const [lin] = F().parseCSV('__proto__;constructor;prototype\n{"x":1};a;b', { delimiter: ';' });
      assert.eq({}.x, undefined, 'Object.prototype.x');
      assert.eq(Object.getPrototypeOf(lin), Object.prototype, 'a linha continua um objeto comum');
      assert.eq(lin.constructor, 'a', 'constructor vira dado, não função');
      assert.ok(Object.keys(lin).includes('__proto__'), '__proto__ vira chave própria');
      const r = F().parseCSV('a;b\n"x;y\n1;2', { delimiter: ';' });
      assert.eq(r.length, 1, 'aspas abertas até o fim do arquivo viram um único campo');
      assert.eq(F().parseCSV('', {}).length, 0);
      assert.eq(F().parseCSV('a;b', {}).length, 0, 'só cabeçalho');
    });

    test('parseCSV: 200 mil linhas terminam em poucos segundos', t => {
      const grande = 'a;b;c\n' + Array.from({ length: 200000 }, (_, i) => i + ';"t""' + i + '";' + (i % 7)).join('\n');
      const t0 = performance.now(), r = F().parseCSV(grande), ms = performance.now() - t0;
      assert.eq(r.length, 200000);
      assert.eq(r[12345].b, 't"12345');
      assert.lt(ms, 8000, '200 mil linhas em ' + Math.round(ms) + ' ms');
    }, { timeout: 15000 });

    test('toCSV → parseCSV: ida e volta com valores difíceis (aspas, quebras, delimitador, acentos)', t => {
      const linhas = [{ n: 'Ana "A" Souza', o: 'linha1\nlinha2', p: 'a;b;c', q: 'ação ✓' }, { n: '', o: ' espaço ', p: '"', q: "'apóstrofo" }];
      const volta = F().parseCSV(F().toCSV(linhas));
      assert.deepEq(volta, linhas.map(l => ({ n: l.n, o: l.o, p: l.p, q: l.q })));
    });

    test('toJSON usa só as colunas pedidas; crc32 e zip geram bytes corretos', t => {
      assert.deepEq(JSON.parse(F().toJSON([{ a: 1, b: 2, c: 3 }], { columns: ['a', 'c'] })), [{ a: 1, c: 3 }]);
      assert.eq(F().toJSON([{ a: 1 }], { space: 0 }), '[{"a":1}]');
      assert.eq(F().crc32(enc('123456789')), 0xCBF43926, 'CRC-32 de referência');
      assert.eq(F().crc32(new Uint8Array(0)), 0);
      const z = F().zip([{ name: 'a.txt', data: enc('hello') }, { name: 'dir/b.txt', data: enc('mundo') }]);
      assert.ok(z instanceof Uint8Array);
      assert.deepEq([...z.slice(0, 4)], [0x50, 0x4B, 0x03, 0x04], 'assinatura PK..');
      const dv = new DataView(z.buffer, z.byteOffset, z.byteLength);
      assert.eq(dv.getUint32(z.length - 22, true), 0x06054b50, 'fim do diretório central');
      assert.eq(dv.getUint16(z.length - 22 + 10, true), 2, 'duas entradas');
      assert.eq(dv.getUint32(14, true), F().crc32(enc('hello')), 'CRC gravado no cabeçalho local');
    });

    test('toXLSX: bytes com assinatura ZIP, CRC de cada arquivo válido, texto nunca vira fórmula', t => {
      const x = F().toXLSX([{ n: 'Ana', f: '=1+1', g: '@SUM(A1)' }], { bytes: true });
      assert.ok(x instanceof Uint8Array, 'bytes:true devolve Uint8Array');
      assert.deepEq([...x.slice(0, 4)], [0x50, 0x4B, 0x03, 0x04], 'assinatura ZIP');
      const dv = new DataView(x.buffer, x.byteOffset, x.byteLength);
      let p = 0, n = 0; const nomes = [];
      while (p + 30 < x.length && dv.getUint32(p, true) === 0x04034b50) {
        const metodo = dv.getUint16(p + 8, true), crc = dv.getUint32(p + 14, true), tam = dv.getUint32(p + 18, true), nl = dv.getUint16(p + 26, true), el = dv.getUint16(p + 28, true);
        const ini = p + 30 + nl + el;
        nomes.push(latin(x.subarray(p + 30, p + 30 + nl)));
        assert.eq(metodo, 0, 'sem compressão');
        assert.eq(F().crc32(x.subarray(ini, ini + tam)) >>> 0, crc, 'CRC válido em ' + nomes.at(-1));
        p = ini + tam; n++;
      }
      assert.gt(n, 3, 'workbook, planilha, estilos...');
      assert.ok(nomes.includes('xl/workbook.xml') && nomes.includes('xl/worksheets/sheet1.xml'), 'arquivos obrigatórios: ' + nomes.join(','));
      assert.eq(dv.getUint32(x.length - 22, true), 0x06054b50, 'diretório central termina o arquivo');
      const txt = latin(x);
      assert.notOk(/<f[ >]/.test(txt), 'nenhuma célula <f> (fórmula)');
      assert.contains(txt, '=1+1');
      const b = F().toXLSX([{ a: 1 }]);
      assert.ok(b instanceof Blob, 'sem bytes:true devolve Blob');
      assert.contains(b.type, 'spreadsheetml');
    });

    test('toXLSX → parseXLSX: ida e volta com texto, número, booleano, data e acentos', async t => {
      const x = F().toXLSX([{ n: 'Ana Ç', v: 1.5, d: '2026-03-05', ok: true, ko: false, f: '=1+1' }, { n: 'Bia', v: 2, d: '2024-02-29', ok: false, ko: true, f: '@x' }],
        { bytes: true, columns: [{ key: 'n', header: 'Nome' }, { key: 'v', header: 'Valor', format: 'money' }, { key: 'd', header: 'Data' }, { key: 'ok', header: 'Ativo' }, { key: 'ko', header: 'Outro' }, { key: 'f', header: 'F' }] });
      const r = await F().parseXLSX(x);
      assert.eq(r.length, 2);
      assert.deepEq(r[0], { Nome: 'Ana Ç', Valor: 1.5, Data: '2026-03-05', Ativo: true, Outro: false, F: '=1+1' });
      assert.eq(r[1].Data, '2024-02-29', 'data sem deslocar o dia');
      assert.eq(r[1].F, '@x', 'texto que parece fórmula volta como texto');
      const m = await F().parseXLSX(x, { header: false });
      assert.deepEq(m[0], ['Nome', 'Valor', 'Data', 'Ativo', 'Outro', 'F'], 'header:false devolve matriz');
      const buf = x.buffer.slice(x.byteOffset, x.byteOffset + x.byteLength);
      assert.eq((await F().parseXLSX(buf)).length, 2, 'aceita ArrayBuffer');
    });

    test('parseXLSX recusa: lixo, arquivo grande demais, DOCTYPE/entidades e caminho "../" no rels', async t => {
      await assert.rejects(F().parseXLSX(enc('isto nem é um zip, só texto qualquer com mais de vinte e dois bytes')), /ZIP|inválid/i, 'texto qualquer');
      await assert.rejects(F().parseXLSX(new Uint8Array(10)), /ZIP|inválid|pequeno/i, 'poucos bytes');
      const bom = F().toXLSX([{ a: 1 }], { bytes: true });
      await assert.rejects(F().parseXLSX(bom, { maxSize: 100 }), /muito grande/, 'maxSize');
      const dt = await xlsx(planilha(''), [], { wb: '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;">]><workbook xmlns="' + NSX + '"><sheets><sheet name="&b;" sheetId="1"/></sheets></workbook>' });
      await assert.rejects(F().parseXLSX(dt), /DOCTYPE/, 'DOCTYPE recusado (billion laughs)');
      const rels = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="../../../../etc/passwd"/></Relationships>';
      const tr = await xlsx(planilha(''), [{ name: 'xl/_rels/workbook.xml.rels', data: rels }]);
      await assert.rejects(F().parseXLSX(tr), /falta|inválid/i, 'caminho fora do pacote não é lido');
      const semplan = await zipar([{ name: 'xl/workbook.xml', data: WB.replace('<sheet name="P" sheetId="1" r:id="rId1"/>', '') }]);
      await assert.rejects(F().parseXLSX(semplan), /sem planilhas|falta/i, 'sem planilhas');
    });

    test('parseXLSX recusa "zip bomb" (descompactado acima do limite) e planilha com células esparsas demais', async t => {
      if (typeof CompressionStream === 'undefined' || typeof DecompressionStream === 'undefined') t.skip('CompressionStream/DecompressionStream indisponível neste ambiente');
      const bomba = await xlsx(planilha(' '.repeat(3 * 1024 * 1024)), [], { deflate: true });
      assert.lt(bomba.length, 64 * 1024, 'o arquivo compactado é pequeno (' + bomba.length + ' B)');
      await assert.rejects(F().parseXLSX(bomba, { maxUncompressed: 1024 * 1024 }), /limite/i, 'passa do limite descompactado');
      let linhas = '';
      for (let i = 1; i <= 1000; i++) linhas += '<row r="' + i + '"><c r="XFD' + i + '"><v>1</v></c></row>';
      const esparsa = await xlsx(planilha(linhas), [], { deflate: true });
      await assert.rejects(F().parseXLSX(esparsa, { header: false }), /c[ée]lulas/i, 'XFD em cada linha estoura o limite de células');
      const ok = await xlsx(planilha('<row r="1"><c r="A1" t="inlineStr"><is><t>ola</t></is></c><c r="B1"><v>2</v></c></row>'), [], { deflate: true });
      assert.deepEq(await F().parseXLSX(ok, { header: false }), [['ola', 2]], 'planilha compactada normal é lida');
    }, { timeout: 15000 });

    test('F.validate: extensão, tipo MIME curinga e tamanho, com mensagens em português', t => {
      assert.eq(F().validate(arq('x', 'a.csv'), { accept: '.csv' }), null);
      assert.eq(F().validate(arq('x', 'A.CSV'), { accept: '.csv' }), null, 'caixa não importa');
      assert.contains(F().validate(arq('x', 'a.exe'), { accept: '.csv' }), 'tipo de arquivo não permitido');
      assert.contains(F().validate(arq('xxxx', 'a.csv'), { maxSize: 2 }), 'muito grande');
      assert.eq(F().validate(arq('x', 'a.PNG', 'image/png'), { accept: 'image/*' }), null, 'image/* aceita png');
      assert.notEq(F().validate(arq('x', 'a.txt', 'text/plain'), { accept: 'image/*' }), null, 'image/* recusa texto');
      assert.eq(F().validate(arq('x', 'a.json', 'application/json'), { accept: '.csv, application/json' }), null, 'lista com espaço e MIME exato');
    });

    test('readText/readArrayBuffer respeitam o limite de tamanho e a codificação', async t => {
      assert.eq(await F().readText(arq('olá', 'a.txt')), 'olá');
      await assert.rejects(F().readText(arq('x'.repeat(100), 'a.txt'), { maxSize: 10 }), /grande/i);
      const buf = await F().readArrayBuffer(arq('abc', 'a.bin'));
      assert.eq(buf.byteLength, 3);
      await assert.rejects(F().readArrayBuffer(arq('x'.repeat(100), 'a.bin'), { maxSize: 10 }), /grande/i);
    });

    test('download: não navega, saneia o nome (caminho, controle, bidi) e revoga a URL', t => {
      let nome = null, clicado = 0;
      const real = HTMLAnchorElement.prototype.click, revoga = URL.revokeObjectURL, cria = URL.createObjectURL;
      HTMLAnchorElement.prototype.click = function () { nome = this.getAttribute('download'); clicado++; };
      let revogadas = 0;
      if (!URL.createObjectURL) URL.createObjectURL = () => 'blob:teste';
      URL.revokeObjectURL = u => { revogadas++; if (revoga) revoga.call(URL, u); };
      t.cleanup(() => { HTMLAnchorElement.prototype.click = real; URL.revokeObjectURL = revoga; if (cria) URL.createObjectURL = cria; else delete URL.createObjectURL; });
      const b = F().download('x', '..\\..\\evil‮txt.exe/../a\u0000b.csv');
      assert.ok(b instanceof Blob, 'devolve o Blob');
      assert.eq(clicado, 1);
      assert.ok(nome && !/[\\/\u0000‮]/.test(nome), 'nome saneado: ' + JSON.stringify(nome));
      assert.notOk(nome.startsWith('.'), 'não começa com ponto');
      F().download('y', 'relatório final.csv', 'text/csv');
      assert.eq(nome, 'relatório final.csv', 'nome normal é mantido');
      return t.sleep(1800).then(() => assert.ok(revogadas >= 2, 'URLs temporárias revogadas'));
    });

    test('filedrop: aceita só o que passa na extensão, tamanho e conteúdo (PNG real ok; php/exe disfarçados recusados)', async t => {
      const inv = t.spy(), aceitos = t.spy();
      const fd = t.create({ xtype: 'filedrop', accept: '.jpg,.png,.csv', multiple: true, listeners: { invalid: inv, files: aceitos } });
      await fd.add([arq('<?php echo 1;', 'shell.php.jpg', 'image/jpeg'), arq('MZ\x90\x00', 'x.exe'), arq(PNG, 'ok.png', 'image/png'), arq('MZ\x90\x00', 'dados.csv'),
        arq('a;b\n1;2', 'ok.csv', 'text/csv'), arq('<script>x</script>', 'p.jpg', 'image/jpeg'), arq('x', '.htaccess'), arq('a;b', 'nota.csv.exe')]);
      assert.deepEq(fd.getFiles().map(f => f.name), ['ok.png', 'ok.csv']);
      assert.eq(aceitos.count, 1);
      const erros = inv.lastArgs[1];
      assert.eq(erros.length, 6, 'seis recusados');
      assert.ok(erros.some(e => e.includes('extensão dupla suspeita')), 'shell.php.jpg');
      assert.ok(erros.some(e => e.includes('"x.exe"') && e.includes('não permitido')), 'x.exe');
      assert.ok(erros.some(e => e.includes('dados.csv') && e.includes('parece exe')), 'executável com nome .csv');
      assert.ok(erros.some(e => e.includes('p.jpg') && e.includes('parece html')), 'HTML com nome .jpg');
      assert.eq(fd.msgEl.hidden, false);
      assert.eq(fd.listEl.children.length, 2, 'lista mostra os aceitos');
    });

    test('filedrop: nome hostil aparece como texto saneado; blockExec:false e sniff:false liberam o que o usuário quiser', async t => {
      const XSS = '<img src=x onerror=window.__r4tpwn=1>';
      const fd = t.create({ xtype: 'filedrop', accept: '.csv', multiple: true });
      await fd.add([arq('a;b', XSS + '.csv', 'text/csv'), arq('a;b', 'RLO‮gpj.csv'), arq('x', '..\\..\\etc\\passwd.csv')]);
      assert.eq(fd.getFiles().length, 3);
      assert.eq(fd.el.querySelector('img'), null, 'nome não vira HTML');
      assert.eq(window.__r4tpwn, undefined);
      const nomes = [...fd.el.querySelectorAll('.r4-fd-name')].map(n => n.textContent);
      assert.eq(nomes.length, 3);
      assert.notContains(nomes[0], '<', 'sem < no nome exibido');
      assert.notContains(nomes[1], '‮', 'sem bidi no nome exibido');
      assert.notContains(nomes[2], '\\', 'sem caminho no nome exibido');
      const livre = t.create({ xtype: 'filedrop', accept: '.php,.csv', blockExec: false, sniff: false });
      await livre.add([arq('<?php echo 1;', 'x.php')]);
      assert.eq(livre.getFiles().length, 1, 'com blockExec:false a extensão passa');
    });

    test('filedrop: maxSize, maxFiles, vários arquivos x um só, duplicados, remove/clear e eventos', async t => {
      const inv = t.spy(), rem = t.spy();
      const um = t.create({ xtype: 'filedrop', accept: '.csv', listeners: { invalid: inv, remove: rem } });
      await um.add([arq('a', 'a.csv'), arq('b', 'b.csv')]);
      assert.eq(um.getFiles().length, 1, 'sem multiple: fica só o primeiro');
      assert.contains(inv.lastArgs[1].join(' '), 'apenas um arquivo');
      const grande = t.create({ xtype: 'filedrop', accept: '.csv', maxSize: 5, listeners: { invalid: inv } });
      await grande.add([arq('123456789', 'g.csv')]);
      assert.eq(grande.getFiles().length, 0);
      assert.contains(inv.lastArgs[1][0], 'muito grande');
      const mf = t.create({ xtype: 'filedrop', accept: '.csv', multiple: true, maxFiles: 2, listeners: { invalid: inv } });
      await mf.add([arq('1', '1.csv'), arq('2', '2.csv'), arq('3', '3.csv')]);
      assert.eq(mf.getFiles().length, 2, 'limita em maxFiles');
      assert.contains(inv.lastArgs[1].join(' '), 'no máximo 2');
      const dup = t.create({ xtype: 'filedrop', accept: '.csv', multiple: true, listeners: { invalid: inv } });
      const f1 = arq('1', '1.csv');
      await dup.add([f1]); await dup.add([f1]);
      assert.eq(dup.getFiles().length, 1, 'mesmo arquivo duas vezes entra uma');
      assert.contains(inv.lastArgs[1][0], 'já está na lista');
      dup.remove(0);
      assert.eq(dup.getFiles().length, 0);
      assert.eq(rem.count, 0, 'remove do outro componente não conta aqui');
      await um.add([arq('z', 'z.csv')]);
      um.listEl.querySelector('.r4-fd-rm').click();
      assert.eq(um.getFiles().length, 0, 'botão × remove');
      assert.eq(rem.count, 1);
      mf.clear();
      assert.eq(mf.getFiles().length, 0);
      assert.eq(mf.listEl.hidden, true);
      const off = t.create({ xtype: 'filedrop', accept: '.csv', disabled: true });
      await off.add([arq('x', 'x.csv')]);
      assert.eq(off.getFiles().length, 0, 'desabilitado não aceita');
    });

    test('filedrop parse: CSV (números e vírgula decimal), JSON, texto e XLSX chegam nos eventos data/files', async t => {
      const dados = [];
      const fd = t.create({ xtype: 'filedrop', accept: '.csv,.json,.txt,.xlsx', multiple: true, parse: 'csv', listeners: { data: (c, d, f) => dados.push([f.name, d]) } });
      await fd.add([arq('nome;preço\nAna;1,5\nBia;2', 'a.csv', 'text/csv')]);
      assert.deepEq(dados[0], ['a.csv', [{ nome: 'Ana', preço: 1.5 }, { nome: 'Bia', preço: 2 }]], '; ⇒ vírgula decimal');
      const j = t.create({ xtype: 'filedrop', accept: '.json', parse: 'json', listeners: { data: (c, d) => dados.push(['json', d]) } });
      await j.add([arq('{"a":[1,2]}', 'a.json', 'application/json')]);
      assert.deepEq(dados.at(-1)[1], { a: [1, 2] });
      const ruim = t.create({ xtype: 'filedrop', accept: '.json', parse: 'json' });
      await ruim.add([arq('{nao json', 'b.json', 'application/json')]);
      assert.contains(ruim.msgEl, 'JSON inválido');
      const tx = t.create({ xtype: 'filedrop', accept: '.txt', parse: 'text', listeners: { files: (c, f, d) => dados.push(['txt', d]) } });
      await tx.add([arq('olá mundo', 'a.txt', 'text/plain')]);
      assert.deepEq(dados.at(-1)[1], ['olá mundo']);
      const xl = t.create({ xtype: 'filedrop', accept: '.xlsx', parse: 'xlsx', listeners: { files: (c, f, d) => dados.push(['xlsx', d]) } });
      await xl.add([arq(F().toXLSX([{ a: 1, b: 'x' }], { bytes: true }), 'p.xlsx')]);
      assert.deepEq(dados.at(-1)[1], [[{ a: 1, b: 'x' }]], 'XLSX lido com cabeçalho');
    });

    test('filedrop.upload: multipart com o nome saneado, campos extras sem __proto__ e eventos upload/uploaderror', async t => {
      const m = t.mockFetch({ '/api/up-ok': { body: { status: 200, retorno: 'ok' } }, '/api/up-erro': { status: 422, body: { erros: { arquivo: 'tipo inválido <b>x</b>' } } } });
      const ok = t.spy(), er = t.spy();
      const fd = t.create({ xtype: 'filedrop', accept: '.csv', listeners: { upload: ok, uploaderror: er } });
      await fd.add([arq('a;b', '..\\..\\relatório‮.csv', 'text/csv')]);
      const r = await fd.upload('/api/up-ok', { data: JSON.parse('{"descricao":"x","__proto__":{"pwn":1},"obj":{"a":1}}'), headers: { 'X-Teste': 'sim' } });
      assert.eq(r.length, 1);
      assert.eq(r[0].ok, true);
      assert.eq(ok.count, 1);
      const corpo = m.calls[0].init.body;
      assert.ok(corpo instanceof FormData, 'multipart/form-data');
      const arquivo = corpo.get('arquivo');
      assert.ok(arquivo, 'campo "arquivo"');
      assert.notOk(/[\\/‮]/.test(arquivo.name), 'nome enviado já saneado: ' + arquivo.name);
      assert.eq(corpo.get('descricao'), 'x');
      assert.eq(corpo.get('obj'), null, 'objetos aninhados não viram campo');
      assert.eq(corpo.get('pwn'), null);
      assert.eq(m.calls[0].init.headers['X-Teste'], 'sim');
      const r2 = await fd.upload('/api/up-erro');
      assert.eq(r2[0].ok, false);
      assert.eq(er.count, 1);
      assert.contains(fd.msgEl, 'tipo inválido <b>x</b>', 'erro do servidor como texto');
      assert.eq(fd.msgEl.querySelector('b'), null);
      await assert.rejects(fd.upload('javascript:alert(1)'), /recusado/);
    });
  });
})();
