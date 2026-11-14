/**
 * ============================================
 * vitrineData — dados de teste da vitrine (R4 dev)
 * ============================================
 *
 * ============================================
 * CONTRATO DE DADOS  (API/JSON  →  <r4-grid>)
 * ============================================
 * Como o JSON que a API entrega deve ser montado para o grid gerar a tabela.
 *
 * 1) Requisição: GET (ou POST) em `src`, resposta HTTP 200, UTF-8,
 *    Content-Type: application/json.
 *
 * 2) Corpo — qualquer UM destes formatos é aceito:
 *      a) array puro .................. [ {...}, {...} ]
 *      b) envelope do framework ....... { "status": 200, "retorno": [ {...} ] }
 *         (também vale a chave "data" ou "rows" no lugar de "retorno")
 *      c) paginado pelo servidor ...... { "status": 200, "total": 60, "page": 1, "size": 10,
 *                                         "retorno": [ {...} ] }     (modo remote do grid)
 *
 * 3) Cada linha é um OBJETO PLANO (sem objetos aninhados); as chaves são o `field`
 *    (dataIndex) das <r4-col>. Todas as linhas devem ter as mesmas chaves — sem
 *    <r4-col>, as colunas saem automáticas a partir das chaves da 1ª linha.
 *
 * 4) Tipos dos valores:
 *      número ..... JSON number (10.5), NÃO string "10,5" — a formatação é do front
 *                   (<r4-col format="money|number|bytes|date|bool|upper">)
 *      texto ...... string (é escapada: nunca envie HTML esperando que renderize)
 *      data ....... "AAAA-MM-DD" ou ISO 8601 ("2026-03-15T10:30:00")
 *      booleano ... true/false;   vazio ... null (aparece como célula em branco)
 *
 * 5) Ordenação/filtro: no modo normal o grid ordena e filtra no navegador (envie tudo).
 *    No modo remote ele manda ?page=&size=&sort=&dir=&q= e espera só aquela página
 *    em "retorno" + o "total" geral. Exemplo pronto: GET /vitrine/api/clientes.
 *
 * 6) Erros: devolva status HTTP 4xx/5xx com { "status": 4xx, "retorno": "mensagem" }.
 *    Validação de formulário: 422 com { "erros": { "campo": "mensagem" } }.
 *
 * 7) Corpo ENVIADO pelo front com criptografia (R4.http.post / encrypt) é { x, y, z }
 *    (AES-GCM); o PHP descriptografa com Controller::getPost(). A RESPOSTA é JSON comum.
 * ============================================
 *
 * Arquivos JSON em /showcase/vitrineData/*.json (gerados por tools/gerar-vitrine-data.js)
 * + endpoints de teste em /vitrine/api/* (só com APP_DEBUG=true).
 *
 *   VitrineData.url('clientes')          -> '/showcase/vitrineData/clientes.json'  (use em src="...")
 *   await VitrineData.load('clientes')   -> array/objeto (com cache)
 *   VitrineData.rows(20000)              -> linhas sintéticas na hora (teste de volume)
 *   VitrineData.api.clientes             -> '/vitrine/api/clientes' (paginação/busca/ordem no servidor)
 */
(function () {
  'use strict';
  const BASE = '/showcase/vitrineData/';

  const catalogo = {
    clientes:          { linhas: 60,   campos: 'id, nome, email, cidade, uf, status, plano, criadoEm, saldo', uso: 'grid, form, select' },
    produtos:          { linhas: 80,   campos: 'id, sku, nome, categoria, preco, estoque, ativo, atualizadoEm', uso: 'grid, filtros, gráficos' },
    pedidos:           { linhas: 120,  campos: 'id, clienteId, cliente, itens, total, status, pagamento, data', uso: 'grid, gráficos, kpis' },
    usuarios:          { linhas: 20,   campos: 'id, nome, email, perfil, ativo, ultimoAcesso', uso: 'grid, selects, permissões' },
    arvore:            { linhas: 4,    campos: 'id, text, badge, expanded, children[]', uso: 'treepanel / menu lateral' },
    'vendas-mensais':  { linhas: 12,   campos: 'mes, receita, despesa, pedidos', uso: 'gráfico de barras/linhas' },
    'vendas-categoria':{ linhas: 6,    campos: 'categoria, valor', uso: 'gráfico de pizza/donut' },
    'series-diarias':  { linhas: 90,   campos: 'data, visitas, conversoes', uso: 'gráfico de linhas/área' },
    kpis:              { linhas: 4,    campos: 'id, titulo, valor, variacao, formato', uso: 'cartões de indicadores (stat)' },
    estados:           { linhas: 27,   campos: 'valor, texto', uso: 'select / combobox' },
    opcoes:            { linhas: 4,    campos: 'planos, status, perfis, categorias → [{valor, texto}]', uso: 'selects, radios' },
    eventos:           { linhas: 30,   campos: 'id, titulo, descricao, data', uso: 'lista / linha do tempo' },
    grande:            { linhas: 5000, campos: 'id, nome, valor, data, status', uso: 'desempenho / virtualização do grid' }
  };

  const api = {
    clientes: '/vitrine/api/clientes',   // GET ?q=&status=&page=&size=&sort=&dir= → {total, page, size, retorno[]}
    echo: '/vitrine/api/echo',           // POST: devolve o que recebeu (descriptografa {x,y,z})
    cadastro: '/vitrine/api/cadastro',   // POST: valida nome/email; 422 com {erros:{campo:msg}}
    lento: '/vitrine/api/lento',         // GET ?ms=800 → resposta atrasada (estado de carregamento)
    falha: '/vitrine/api/falha'          // GET ?code=500 → erro proposital
  };

  const cache = {};
  const VitrineData = {
    base: BASE, names: Object.keys(catalogo), catalogo, api,
    url: nome => BASE + nome + '.json',
    async load(nome) {
      if (!catalogo[nome]) throw new Error('vitrineData: conjunto desconhecido "' + nome + '"');
      if (!cache[nome]) cache[nome] = fetch(BASE + nome + '.json').then(r => {
        if (!r.ok) throw new Error('vitrineData: falha ao carregar ' + nome + ' (' + r.status + ')');
        return r.json();
      });
      return cache[nome];
    },
    /** Linhas sintéticas determinísticas: VitrineData.rows(50000) */
    rows(n = 1000) {
      let s = 12345;
      const r = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
      const st = ['ok', 'erro', 'alerta'];
      return Array.from({ length: n }, (_, i) => ({
        id: i + 1, nome: 'Registro ' + (i + 1), valor: +(r() * 10000).toFixed(2),
        data: (2020 + Math.floor(r() * 7)) + '-' + String(1 + Math.floor(r() * 12)).padStart(2, '0') + '-' + String(1 + Math.floor(r() * 28)).padStart(2, '0'),
        status: st[Math.floor(r() * 3)]
      }));
    }
  };
  window.VitrineData = VitrineData;

  /* ---- documentação na vitrine (grupo "Dados de teste") ---- */
  if (window.R4 && R4.module) {
    R4.module('vitrineData', VitrineData, {
      group: 'Dados de teste', title: 'vitrineData',
      description: 'Dados de exemplo para testar os componentes: arquivos JSON estáticos (use em src="...") e endpoints de teste com paginação, validação e falhas. Regenere com: node tools/gerar-vitrine-data.js.',
      props: [
        ...Object.entries(catalogo).map(([nome, c]) => ({ name: 'VitrineData.url("' + nome + '")', type: c.linhas + ' linhas', desc: c.campos + '  ·  uso: ' + c.uso })),
        { name: 'CONTRATO: formatos aceitos pelo grid', type: 'JSON', desc: 'Array puro [{...}]  |  envelope {status, retorno:[{...}]} (ou data/rows)  |  paginado {status, total, page, size, retorno:[{...}]}.' },
        { name: 'CONTRATO: cada linha', type: 'objeto plano', desc: 'Chaves = field das colunas; mesmas chaves em todas as linhas; sem objetos aninhados; sem HTML (texto é escapado).' },
        { name: 'CONTRATO: tipos', type: 'valores', desc: 'Números como number (10.5, não "10,5"); datas "AAAA-MM-DD" ou ISO 8601; booleano true/false; vazio null. Formatação (money, date...) é do front, via format.' },
        { name: 'CONTRATO: erros', type: 'HTTP', desc: 'Status 4xx/5xx com {status, retorno:"mensagem"}; validação 422 com {erros:{campo:mensagem}}. Corpo enviado criptografado é {x,y,z}; a resposta é JSON comum.' },
        { name: 'VitrineData.load(nome)', type: 'Promise', desc: 'Carrega e guarda em cache.' },
        { name: 'VitrineData.rows(n)', type: 'Array', desc: 'Gera n linhas sintéticas na hora (ex.: 50000) para teste de volume.' },
        { name: 'GET /vitrine/api/clientes', type: 'api', desc: 'Parâmetros q, status, page, size, sort, dir. Resposta {total, page, size, retorno[]}.' },
        { name: 'POST /vitrine/api/echo', type: 'api', desc: 'Devolve o corpo recebido; descriptografa {x,y,z} (testa R4.http com criptografia).' },
        { name: 'POST /vitrine/api/cadastro', type: 'api', desc: 'Valida nome/email. 422 com {erros:{campo:mensagem}} (testa validação de formulário).' },
        { name: 'GET /vitrine/api/lento?ms=800', type: 'api', desc: 'Resposta atrasada (máx. 3000ms) para testar loading.' },
        { name: 'GET /vitrine/api/falha?code=500', type: 'api', desc: 'Erro proposital para testar tratamento de falhas.' }
      ]
    });
    (window.R4Demos = window.R4Demos || {}).vitrineData = [
      { title: 'Arquivo JSON → tabela (HTML, atributo src)', html: '<r4-grid src="' + VitrineData.url('clientes') + '" page-size="6" filter></r4-grid>' },
      { title: 'API → tabela (HTML, src com parâmetros na URL)', html: `
<r4-grid src="${VitrineData.api.clientes}?size=8&sort=saldo&dir=desc" filter="false">
  <r4-col field="nome" header="Cliente"></r4-col>
  <r4-col field="cidade" header="Cidade"></r4-col>
  <r4-col field="status" header="Status"></r4-col>
  <r4-col field="saldo" header="Saldo" format="money" align="right"></r4-col>
</r4-grid>` },
      { title: 'API → tabela (o mesmo exemplo em JavaScript)', fn(el) {
        R4.grid(el, VitrineData.api.clientes + '?size=8&sort=saldo&dir=desc', {
          filter: false,
          columns: ['nome', 'cidade', 'status', { dataIndex: 'saldo', header: 'Saldo', format: 'money', align: 'right' }]
        });
      } },
      { title: 'O JSON que a API entrega (formato esperado pelo grid)', async fn(el, out) {
        // 3 linhas reais da API: é exatamente este formato que o grid consome
        const r = await fetch(VitrineData.api.clientes + '?size=3').then(x => x.json());
        out(r);
      } },
      { title: 'Enviar dados criptografados para a API (R4.http → /echo)', async fn(el, out) {
        // o corpo vai em {x, y, z} (AES-GCM); o servidor descriptografa e devolve; "cifrado: true" prova isso
        const resposta = await R4.http.post(VitrineData.api.echo, { nome: 'R4 dev', segredo: 123 });
        out(resposta);
      } },
      { title: 'Carregar um conjunto e mostrar os cartões (JS)', async fn(el) {
        const kpis = await VitrineData.load('kpis');
        R4.render(el, '<r4-div cols="4" gap="3">' + kpis.map(k =>
          '<div class="r4-card r4-text-center"><div class="r4-text-muted">' + R4.util.esc(k.titulo) + '</div>' +
          '<div class="r4-text-lg r4-bold r4-text-primary">' + R4.util.esc(k.formato === 'money' ? R4.util.money(k.valor) : k.formato === 'percent' ? R4.util.number(k.valor, 1) + '%' : R4.util.number(k.valor, 0)) + '</div>' +
          '<span class="r4-tag">' + (k.variacao > 0 ? '▲ ' : '▼ ') + R4.util.number(Math.abs(k.variacao), 1) + '%</span></div>').join('') + '</r4-div>');
      } },
      { title: 'Volume: 20 mil linhas geradas na hora', fn(el, out) {
        const t = performance.now();
        const rows = VitrineData.rows(20000);
        R4.grid(el, rows, { pageSize: 10 });
        out({ linhas: rows.length, ms: Math.round(performance.now() - t) });
      } }
    ];
  }
})();
