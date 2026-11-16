/**
 * Receitas: telas completas prontas para copiar e adaptar (HTML da libr4 + dados do vitrineData).
 * Cada receita é um módulo no grupo "Receitas" da vitrine; o código é editável ao vivo.
 */
(function () {
  if (!window.R4) return;
  const D = '/showcase/vitrineData/';
  const rec = (id, title, description, props, demos) => {
    R4.module(id, {}, { group: 'Receitas', title, description, props });
    (window.R4Demos = window.R4Demos || {})[id] = demos;
  };

  /* ---------- 1. Login ---------- */
  rec('receita-login', 'Tela de login',
    'Cartão de login centralizado com e-mail, senha, "lembrar de mim" e envio criptografado. Troque o action pela sua rota de autenticação (o PHP lê com Controller::getPost()).',
    [{ name: 'Componentes usados', type: 'lista', desc: 'r4-div, r4-form, r4-textfield, r4-passwordfield, r4-checkbox, r4-button, R4.notify' },
     { name: 'Para adaptar', type: 'dica', desc: 'action = sua rota; encrypt envia {x,y,z}; no sucesso redirecione com location.href dentro de listeners.success.' }],
    [
      { title: 'Login em HTML', html: `
<r4-div pad="3" style="max-width:380px;margin:0 auto">
  <div class="r4-card r4-shadow r4-rounded">
    <h3 class="r4-text-center r4-text-primary" style="margin:0 0 4px">Entrar</h3>
    <p class="r4-text-center r4-text-muted r4-mb-3">Acesse sua conta</p>
    <r4-form action="/vitrine/api/echo" encrypt>
      <r4-textfield name="email" label="E-mail" input-type="email" placeholder="voce@exemplo.com" required email></r4-textfield>
      <r4-passwordfield name="senha" label="Senha" required min-length="6"></r4-passwordfield>
      <r4-checkbox name="lembrar" label="Lembrar de mim"></r4-checkbox>
      <r4-button type="submit" variant="primary">Entrar</r4-button>
    </r4-form>
  </div>
</r4-div>` },
      { title: 'Login em JavaScript (R4.form)', fn(el) {
        R4.form(el, {
          action: '/vitrine/api/echo', encrypt: true,
          fields: [
            { type: 'text', name: 'email', label: 'E-mail', required: true, email: true },
            { type: 'password', name: 'senha', label: 'Senha', required: true, minLength: 6 }
          ],
          listeners: { success: (f, r) => R4.notify({ type: 'ok', text: 'Login enviado (cifrado: ' + r.retorno.cifrado + ')' }) }
        });
      } }
    ]);

  /* ---------- 2. Listagem + cadastro (CRUD) ---------- */
  rec('receita-crud', 'Listagem com cadastro',
    'Tabela com busca, seleção múltipla, exportação e botão "Novo" que abre uma janela com formulário. Troque o src pela sua API (formato em vitrineData.js: CONTRATO).',
    [{ name: 'Componentes usados', type: 'lista', desc: 'r4-panel, r4-grid (src, selectable, exportable), r4-window, r4-form, r4-select, r4-maskfield' },
     { name: 'Para adaptar', type: 'dica', desc: 'Para muitos registros use remote (paginação no servidor). A janela abre com r4-click="modal:#id".' }],
    [
      { title: 'Clientes (HTML)', html: `
<r4-panel title="Clientes">
  <r4-tbar>
    <r4-button variant="primary" icon="plus" r4-click="modal:#rc-novo">Novo cliente</r4-button>
    <r4-button r4-click="reload:#rc-grid">Atualizar</r4-button>
  </r4-tbar>
  <r4-grid id="rc-grid" src="${D}clientes.json" page-size="8" filter selectable="multi" exportable>
    <r4-col field="nome" header="Nome"></r4-col>
    <r4-col field="email" header="E-mail"></r4-col>
    <r4-col field="cidade" header="Cidade"></r4-col>
    <r4-col field="status" header="Status"></r4-col>
    <r4-col field="saldo" header="Saldo" format="money" align="right"></r4-col>
  </r4-grid>
</r4-panel>
<r4-window id="rc-novo" title="Novo cliente" width="420">
  <r4-form action="/vitrine/api/cadastro" encrypt>
    <r4-textfield name="nome" label="Nome" required min-length="3"></r4-textfield>
    <r4-textfield name="email" label="E-mail" required email></r4-textfield>
    <r4-maskfield name="cpf" label="CPF" mask="cpf"></r4-maskfield>
    <r4-select name="plano" label="Plano" src="${D}opcoes.json" root="planos"></r4-select>
    <r4-button type="submit" variant="primary">Salvar</r4-button>
  </r4-form>
</r4-window>` }
    ]);

  /* ---------- 3. Painel (dashboard) ---------- */
  rec('receita-painel', 'Painel de indicadores',
    'Indicadores no topo, dois gráficos lado a lado e a lista dos últimos pedidos. Todos carregam sozinhos pelo atributo src.',
    [{ name: 'Componentes usados', type: 'lista', desc: 'r4-stats, r4-div (cols), r4-chart (bar, donut), r4-grid' },
     { name: 'Para adaptar', type: 'dica', desc: 'Troque os src pelas suas APIs; x e y dizem quais campos do JSON viram eixos.' }],
    [
      { title: 'Painel em HTML', html: `
<r4-stats src="${D}kpis.json"></r4-stats>
<r4-div cols="2" gap="3" class="r4-mt-3">
  <div class="r4-card"><b>Receita x despesa</b>
    <r4-chart type="bar" src="${D}vendas-mensais.json" x="mes" y="receita,despesa" format="money" height="240"></r4-chart>
  </div>
  <div class="r4-card"><b>Vendas por categoria</b>
    <r4-chart type="donut" src="${D}vendas-categoria.json" x="categoria" y="valor" format="money" height="240"></r4-chart>
  </div>
</r4-div>
<r4-panel title="Últimos pedidos" class="r4-mt-3">
  <r4-grid src="${D}pedidos.json" page-size="5" filter="false">
    <r4-col field="id" header="Pedido" width="90"></r4-col>
    <r4-col field="cliente" header="Cliente"></r4-col>
    <r4-col field="status" header="Status"></r4-col>
    <r4-col field="total" header="Total" format="money" align="right"></r4-col>
  </r4-grid>
</r4-panel>` }
    ]);
})();
