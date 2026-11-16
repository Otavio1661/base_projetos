/* Demos da vitrine: dados (grid avançado, R4.files, filedrop). Use window.R4Demos[nome] = [{ title, html | fn(el, out) }] */
(function () {
  const D = window.R4Demos = window.R4Demos || {};
  const grid = D.grid = D.grid || [];
  const url = n => (window.VitrineData ? VitrineData.url(n) : '/showcase/vitrineData/' + n + '.json');

  /* ===================== grid ===================== */
  grid.push(
    { title: 'HTML: 5.000 linhas (grande.json) — virtualização automática, colunas e exportação', html: `
<r4-grid src="${url('grande')}" height="320" exportable export-name="grande" column-menu resizable selectable="multi">
  <r4-col field="id" header="#" width="80" align="right"></r4-col>
  <r4-col field="nome" header="Nome"></r4-col>
  <r4-col field="valor" header="Valor" format="money" align="right" summary="sum"></r4-col>
  <r4-col field="data" header="Data" format="date" width="120"></r4-col>
  <r4-col field="status" header="Status" width="110" summary="count"></r4-col>
</r4-grid>` },

    { title: 'Virtual: 50.000 linhas geradas na hora (medindo o tempo)', fn(el, out) {
      const rows = VitrineData.rows(50000);
      let t = performance.now();
      const g = R4.grid(el, rows, { pageSize: 0, virtual: true, height: 360, selectable: 'multi', columns: [
        { header: '#', dataIndex: 'id', width: 80, align: 'right' },
        { header: 'Nome', dataIndex: 'nome' },
        { header: 'Valor', dataIndex: 'valor', format: 'money', align: 'right', summary: 'sum' },
        { header: 'Data', dataIndex: 'data', format: 'date' },
        { header: 'Status', dataIndex: 'status' }] });
      const render = performance.now() - t;
      t = performance.now(); g.sort('nome', 'desc'); const sortTexto = performance.now() - t;
      t = performance.now(); g.sort('valor', 'asc'); const sortNum = performance.now() - t;
      t = performance.now(); g.setSorters([{ key: 'status', dir: 'asc' }, { key: 'valor', dir: 'desc' }]); const sortMulti = performance.now() - t;
      out({ linhas: rows.length, linhasNoDOM: g.tbody.rows.length - 1, ms: { render: Math.round(render), ordenarTexto: Math.round(sortTexto), ordenarNumero: Math.round(sortNum), ordenarDuasColunas: Math.round(sortMulti) },
        dica: 'Shift+clique no cabeçalho soma critérios; setas/PageDown navegam; Espaço seleciona.' });
    } },

    { title: 'Seleção múltipla + teclado (clientes.json)', fn(el, out) {
      const g = R4.grid(el, VitrineData.url('clientes'), {
        selectable: 'multi', pageSize: 8,
        columns: [{ header: 'Nome', dataIndex: 'nome' }, { header: 'Cidade', dataIndex: 'cidade' }, { header: 'UF', dataIndex: 'uf', width: 60 },
          { header: 'Saldo', dataIndex: 'saldo', format: 'money', align: 'right' }],
        listeners: { selectionchange: (grid, sel) => out({ selecionados: sel.length, nomes: sel.slice(0, 5).map(r => r.nome) }) }
      });
      R4.button(el, 'Limpar seleção', () => g.clearSelection());
      R4.button(el, 'Selecionar saldo > 5.000', () => g.select(r => r.saldo > 5000));
    } },

    { title: 'Edição na célula com validação (produtos.json)', fn(el, out) {
      R4.grid(el, VitrineData.url('produtos'), {
        pageSize: 8,
        columns: [
          { header: 'SKU', dataIndex: 'sku', width: 110 },
          { header: 'Nome', dataIndex: 'nome', editable: true },
          { header: 'Categoria', dataIndex: 'categoria', editable: { options: ['Acessórios', 'Áudio', 'Monitores', 'Notebooks', 'Periféricos', 'Redes'] } },
          { header: 'Preço', dataIndex: 'preco', format: 'money', align: 'right', editable: 'number', summary: 'avg' },
          { header: 'Estoque', dataIndex: 'estoque', align: 'right', editable: 'number', summary: 'sum' },
          { header: 'Ativo', dataIndex: 'ativo', format: 'bool', align: 'center', editable: { options: [{ value: true, text: 'Sim' }, { value: false, text: 'Não' }] } }],
        listeners: {
          beforecellchange: (g, c) => {
            if ((c.field === 'preco' || c.field === 'estoque') && (c.value == null || c.value < 0)) { R4.toast('Valor inválido: precisa ser ≥ 0'); return false; }
          },
          cellchange: (g, c) => out({ campo: c.field, de: c.oldValue, para: c.value, linha: c.row.sku })
        }
      });
      out('Dê duplo clique (ou Enter/F2) numa célula de Nome, Categoria, Preço, Estoque ou Ativo. Esc cancela; preço negativo é recusado.');
    } },

    { title: 'HTML: rodapé de totais (pedidos.json) respeitando o filtro', html: `
<r4-grid src="${url('pedidos')}" page-size="10" summary-label="Totais">
  <r4-col field="id" header="Pedido" width="90" summary="count"></r4-col>
  <r4-col field="cliente" header="Cliente"></r4-col>
  <r4-col field="status" header="Status" width="110"></r4-col>
  <r4-col field="itens" header="Itens" align="right" width="80" summary="sum"></r4-col>
  <r4-col field="total" header="Total" format="money" align="right" summary="sum"></r4-col>
  <r4-col field="data" header="Data" format="date" width="110"></r4-col>
</r4-grid>` },

    { title: 'HTML: modo remoto (/vitrine/api/clientes) — página, ordem e busca no servidor', html: `
<r4-grid remote src="/vitrine/api/clientes" page-size="8" selectable="multi">
  <r4-col field="id" header="#" width="70" align="right"></r4-col>
  <r4-col field="nome" header="Nome"></r4-col>
  <r4-col field="cidade" header="Cidade"></r4-col>
  <r4-col field="status" header="Status" width="100"></r4-col>
  <r4-col field="saldo" header="Saldo" format="money" align="right"></r4-col>
</r4-grid>` },

    { title: 'HTML: estados de erro e carregamento', html: `
<r4-grid src="/vitrine/api/falha?code=500" filter="false"></r4-grid>
<div style="height:12px"></div>
<r4-grid src="/vitrine/api/lento?ms=1500" page-size="5" filter="false">
  <r4-col field="nome" header="Nome (resposta lenta)"></r4-col>
  <r4-col field="cidade" header="Cidade"></r4-col>
</r4-grid>` },

    { title: 'Coluna de ações (handler e r4-click com {campo})', fn(el, out) {
      R4.grid(el, VitrineData.url('usuarios'), {
        pageSize: 6,
        columns: [{ header: 'Nome', dataIndex: 'nome' }, { header: 'Perfil', dataIndex: 'perfil', width: 120 },
          { header: 'Ações', width: 190, actions: [
            { text: 'Ver', icon: '👁', handler: (linha) => out(linha) },
            { text: 'Avisar', 'r4-click': 'toast:Olá, {nome}!' },
            { text: 'Excluir', variant: 'danger', 'r4-confirm': 'Excluir {nome}?', 'r4-click': 'toast:{nome} excluído (demo)' }] }]
      });
    } },

    { title: 'Exportar CSV / XLSX / JSON / imprimir (só o filtrado e colunas visíveis)', fn(el, out) {
      const g = R4.grid(el, VitrineData.url('clientes'), { pageSize: 6, exportable: true, columnMenu: true, exportName: 'clientes',
        columns: [{ header: 'Nome', dataIndex: 'nome' }, { header: 'E-mail', dataIndex: 'email' }, { header: 'UF', dataIndex: 'uf', width: 60 },
          { header: 'Desde', dataIndex: 'criadoEm', format: 'date' }, { header: 'Saldo', dataIndex: 'saldo', format: 'money', align: 'right', summary: 'sum' }],
        listeners: { export: (grid, tipo) => out({ exportado: tipo, linhas: grid.getView().length }) } });
      R4.button(el, 'CSV', () => g.exportCSV('clientes'));
      R4.button(el, 'Excel', () => g.exportXLSX('clientes'));
      R4.button(el, 'JSON', () => g.exportJSON('clientes'));
      R4.button(el, 'Imprimir', () => g.print('Clientes'));
    } }
  );

  /* ===================== R4.files ===================== */
  D.files = [
    { title: 'CSV seguro: injeção de fórmula neutralizada e ida/volta', fn(el, out) {
      const linhas = [
        { nome: 'Ana', obs: '=HYPERLINK("http://mal.example","clique")', valor: -12.5 },
        { nome: '@SOMA(A1:A9)', obs: 'texto com "aspas", ponto;vírgula\ne quebra', valor: 1200 },
        { nome: '+55 11 99999-0000', obs: '-2+3', valor: 0.1 }];
      const csv = R4.files.toCSV(linhas, { delimiter: ';', decimal: ',', bom: false });
      const volta = R4.files.parseCSV(csv, { types: true, decimal: ',' });
      out({ csv, volta });
    } },
    { title: 'parseCSV: detecção de delimitador, BOM e campos com quebra', fn(el, out) {
      const texto = '﻿id,nome,cidade\r\n1,"Silva, Ana","São\r\nPaulo"\r\n2,Bruno,"Rio ""RJ"""\r\n';
      out(R4.files.parseCSV(texto, { types: true }));
    } },
    { title: 'XLSX sem bibliotecas: gerar, ler de volta e baixar', async fn(el, out) {
      const linhas = await VitrineData.load('pedidos');
      const cols = [{ key: 'id', header: 'Pedido' }, { key: 'cliente', header: 'Cliente' }, { key: 'total', header: 'Total', format: 'money' }, { key: 'data', header: 'Data', format: 'date' }];
      const bytes = R4.files.toXLSX(linhas, { columns: cols, sheetName: 'Pedidos', bytes: true });
      const lido = await R4.files.parseXLSX(bytes);
      R4.button(el, 'Baixar pedidos.xlsx', () => R4.files.download(R4.files.toXLSX(linhas, { columns: cols, sheetName: 'Pedidos' }), 'pedidos.xlsx'));
      out({ tamanho: R4.util.bytes(bytes.length), linhasLidas: lido.length, primeira: lido[0] });
    } },
    { title: 'Escolher e ler um arquivo (pick + readText)', fn(el, out) {
      R4.button(el, 'Escolher .csv/.txt (até 1 MB)', async () => {
        try {
          const [f] = await R4.files.pick({ accept: '.csv,.txt', maxSize: 1024 * 1024 });
          if (f) out(R4.files.parseCSV(await R4.files.readText(f), { types: true }).slice(0, 5));
        } catch (e) { out('Erro: ' + e.message); }
      });
    } }
  ];

  /* ===================== filedrop ===================== */
  D.filedrop = [
    { title: 'HTML: arrastar e soltar com validação', html: `
<r4-filedrop accept=".csv,.json,.xlsx" multiple max-size="1048576" max-files="3"></r4-filedrop>` },
    { title: 'Importar CSV para um grid (com arquivo gerado no próprio demo)', async fn(el, out) {
      const g = R4.grid(document.createElement('div'), [], { pageSize: 6, filter: true });
      const fd = R4.filedrop(el, '.csv,.xlsx,.json', {
        parse: 'csv', maxSize: 2 * 1024 * 1024,
        listeners: {
          data: (c, dados, f) => {
            const rows = Array.isArray(dados) ? dados : [];
            g.columns = []; g.loadData(rows);
            out({ arquivo: f.name, linhas: rows.length, colunas: Object.keys(rows[0] || {}) });
          },
          invalid: (c, erros) => out(erros)
        }
      });
      el.append(g.el);
      const clientes = await VitrineData.load('clientes');
      const csv = R4.files.toCSV(clientes, { columns: ['id', 'nome', 'cidade', 'uf', 'saldo'], delimiter: ';', decimal: ',' });
      R4.button(el, 'Simular arquivo clientes.csv', () => fd.add([new File([csv], 'clientes.csv', { type: 'text/csv' })]));
      R4.button(el, 'Simular arquivo inválido (.exe)', () => fd.add([new File(['MZ'], 'virus.exe')]));
      fd.add([new File([csv], 'clientes.csv', { type: 'text/csv' })]);
    } },
    { title: 'Função rápida: R4.filedrop(alvo, aoReceber)', fn(el, out) {
      R4.filedrop(el, (arquivos) => out(arquivos.map(f => ({ nome: f.name, tamanho: R4.util.bytes(f.size) }))));
    } }
  ];
})();
