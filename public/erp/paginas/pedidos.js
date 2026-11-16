/* Pedidos: select pesquisável de cliente, status com cor, data, textarea. */
(function () {
  'use strict';
  const { el } = R4.util;
  window.ErpPaginas.pedidos = { titulo: 'Pedidos', icone: 'cart', montar(alvo, ctx) {
    return ctx.Erp.crud({
      recurso: 'pedidos', titulo: 'Pedidos', singular: 'Pedido',
      columns: [
        { header: '#', dataIndex: 'id', width: 80, align: 'right' },
        { header: 'Cliente', dataIndex: 'cliente', width: 220 },
        { header: 'Data', dataIndex: 'data', format: 'date', width: 110 },
        { header: 'Itens', dataIndex: 'itens', align: 'right', width: 80 },
        { header: 'Total', dataIndex: 'total', format: 'money', align: 'right', width: 130 },
        { header: 'Status', dataIndex: 'status', filtrar: true, width: 120, renderer: v => ctx.Erp.statusTag(v) },
        { header: 'Observação', dataIndex: 'obs', width: 220 }
      ],
      padrao: { status: 'aberto', itens: 1, data: new Date().toISOString().slice(0, 10) },
      paraForm: r => ({ clienteId: String(r.clienteId), data: r.data, itens: r.itens, total: r.total, status: r.status, obs: r.obs || '' }),
      paraApi: v => Object.assign({}, v, { clienteId: Number(v.clienteId), itens: Math.trunc(Number(v.itens)) || 1, total: Number(v.total) || 0 }),
      campos: op => [
        { type: 'select', name: 'clienteId', label: 'Cliente', required: true, searchable: true,
          options: (op.clientes || []).map(c => ({ value: String(c.id), text: c.nome })), helpText: 'Mostra os 200 primeiros clientes; use a busca.' },
        { type: 'row', items: [
          { type: 'date', name: 'data', label: 'Data', required: true },
          { type: 'number', name: 'itens', label: 'Itens', min: 1, decimals: 0 },
          { type: 'moeda', name: 'total', label: 'Total' }
        ] },
        { type: 'select', name: 'status', label: 'Status', required: true, options: (op.status || ['aberto', 'pago', 'enviado', 'cancelado']).map(s => ({ value: s, text: s })) },
        { type: 'textarea', name: 'obs', label: 'Observação', maxLength: 300, autoGrow: true }
      ]
    })(alvo, ctx);
  } };
})();
