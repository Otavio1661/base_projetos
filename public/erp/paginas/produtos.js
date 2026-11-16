/* Produtos: mesmo padrão do CRUD; estoque baixo ganha badge de alerta. */
(function () {
  'use strict';
  const tag = (txt, v) => window.Erp.badge(txt, v);
  window.ErpPaginas.produtos = { titulo: 'Produtos', icone: 'tag', montar(alvo, ctx) {
    return ctx.Erp.crud({
      recurso: 'produtos', titulo: 'Produtos', singular: 'Produto',
      columns: [
        { header: '#', dataIndex: 'id', width: 70, align: 'right' },
        { header: 'SKU', dataIndex: 'sku', width: 110 },
        { header: 'Produto', dataIndex: 'nome', width: 240 },
        { header: 'Categoria', dataIndex: 'categoria', width: 150 },
        { header: 'Preço', dataIndex: 'preco', format: 'money', align: 'right', width: 120 },
        { header: 'Estoque', dataIndex: 'estoque', align: 'right', width: 110, renderer: v => (+v < 20 ? tag(v + ' baixo', 'warn') : document.createTextNode(String(v))) },
        { header: 'Ativo', dataIndex: 'ativo', width: 80, align: 'center', renderer: v => tag(v ? 'Sim' : 'Não', v ? 'ok' : 'err') }
      ],
      padrao: { ativo: true, estoque: 10, preco: 10 },
      paraForm: r => ({ sku: r.sku, nome: r.nome, categoria: r.categoria, preco: r.preco, estoque: r.estoque, ativo: !!r.ativo }),
      paraApi: v => Object.assign({}, v, { preco: Number(v.preco) || 0, estoque: Math.trunc(Number(v.estoque)) || 0, ativo: !!v.ativo }),
      campos: op => [
        { type: 'row', items: [
          { type: 'text', name: 'sku', label: 'SKU', required: true, maxLength: 20 },
          { type: 'select', name: 'categoria', label: 'Categoria', required: true, searchable: true, options: (op.categorias || []).map(c => ({ value: c, text: c })) }
        ] },
        { type: 'text', name: 'nome', label: 'Nome do produto', required: true, minLength: 3, maxLength: 120 },
        { type: 'row', items: [
          { type: 'moeda', name: 'preco', label: 'Preço' },
          { type: 'number', name: 'estoque', label: 'Estoque', min: 0, decimals: 0 },
          { type: 'switch', name: 'ativo', label: 'Ativo' }
        ] }
      ]
    })(alvo, ctx);
  } };
})();
