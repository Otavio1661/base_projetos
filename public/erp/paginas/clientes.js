/* Clientes: grid remoto (busca com destaque, ordenação, seletor de linhas, exportação), janela + form, confirmação. */
(function () {
  'use strict';
  const { el } = R4.util;
  const ufs = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
  const tag = (txt, v) => window.Erp.badge(txt, v);
  window.ErpPaginas.clientes = { titulo: 'Clientes', icone: 'user', montar(alvo, ctx) {
    return ctx.Erp.crud({
      recurso: 'clientes', titulo: 'Clientes', singular: 'Cliente',
      columns: [
        { header: '#', dataIndex: 'id', width: 70, align: 'right' },
        { header: 'Nome', dataIndex: 'nome', width: 200 },
        { header: 'E-mail', dataIndex: 'email', width: 220 },
        { header: 'Telefone', dataIndex: 'telefone', width: 140 },
        { header: 'Cidade', dataIndex: 'cidade', filtrar: true, width: 150 },
        { header: 'UF', dataIndex: 'uf', filtrar: true, width: 60 },
        { header: 'Tipo', dataIndex: 'tipo', filtrar: true, width: 70, renderer: v => tag(v, v === 'PJ' ? 'primary' : 'default') },
        { header: 'Limite', dataIndex: 'limite', format: 'money', align: 'right', width: 120 },
        { header: 'Ativo', dataIndex: 'ativo', filtrar: true, width: 80, align: 'center', renderer: v => tag(v ? 'Sim' : 'Não', v ? 'ok' : 'err') },
        { header: 'Desde', dataIndex: 'criadoEm', format: 'date', width: 110 }
      ],
      padrao: { tipo: 'PF', ativo: true, limite: 1000 },
      paraForm: r => ({ nome: r.nome, email: r.email, telefone: r.telefone, cidade: r.cidade, uf: r.uf, tipo: r.tipo, documento: r.documento, limite: r.limite, ativo: !!r.ativo }),
      paraApi: v => Object.assign({}, v, { limite: Number(v.limite) || 0, ativo: !!v.ativo }),
      campos: op => [
        { type: 'text', name: 'nome', label: 'Nome', required: true, minLength: 3, maxLength: 120 },
        { type: 'row', items: [
          { type: 'email', name: 'email', label: 'E-mail', required: true },
          { type: 'telefone', name: 'telefone', label: 'Telefone' }
        ] },
        { type: 'row', items: [
          { type: 'text', name: 'cidade', label: 'Cidade', required: true, maxLength: 80 },
          { type: 'select', name: 'uf', label: 'UF', required: true, searchable: true, options: (op.ufs || ufs).map(u => ({ value: u, text: u })) },
          { type: 'select', name: 'tipo', label: 'Tipo', options: (op.tipos || ['PF', 'PJ']).map(u => ({ value: u, text: u })) }
        ] },
        { type: 'text', name: 'documento', label: 'CPF / CNPJ', maxLength: 18 },
        { type: 'row', items: [
          { type: 'moeda', name: 'limite', label: 'Limite de crédito' },
          { type: 'switch', name: 'ativo', label: 'Cliente ativo' }
        ] }
      ]
    })(alvo, ctx);
  } };
})();
