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

  /* ---------- 4. Painel administrativo declarativo (zero JS escrito à mão) ---------- */
  rec('receita-admin', 'Painel administrativo declarativo',
    'Edição de uma página pública (perfil, cores, horários, foto) só com tags: o form carrega os dados por src e salva por action; abas, repeater de horários, cor com contraste, estilo em cartões, foto com editor e upload, prévia num celular ao lado (botão "Visualizar pré-review" no celular) e textos ao vivo com r4-bind. Nenhuma linha de JavaScript: troque src/action/upload-url pelas suas rotas.',
    [{ name: 'Componentes usados', type: 'lista', desc: 'r4-phonepreview, r4-form (src, action, encrypt), r4-tabpanel, r4-textfield, r4-textarea, r4-switch, r4-numberfield, r4-repeater, r4-colorfield, r4-choice, r4-filedrop (edit="image", upload-url), r4-bind, r4-show-if, r4-enable-if' },
     { name: 'Página de prévia', type: 'dica', desc: '/showcase/preview-demo.html carrega /libr4/preview.js e chama R4.preview.listen({text, var, class, show}) dizendo o que cada chave pode mudar (veja docs/DECLARATIVO.md).' },
     { name: 'Para adaptar', type: 'dica', desc: 'src = GET dos dados ({retorno:{...}}); action = POST/PUT (erros 422 {erros:{campo:msg}} aparecem nos campos); upload-url devolve {retorno:{url}}; map = campos que a prévia recebe.' }],
    [
      { title: 'Painel completo em HTML', html: `
<r4-phonepreview src="/showcase/preview-demo.html" for="#adm-perfil" title="Prévia da página"
  map="titulo,bio,botao,mostrarBio,cor,corTexto,raio,estilo,layout,horarios,mostrarHorarios">
  <r4-form id="adm-perfil" src="/showcase/demos/painel.json" action="/vitrine/api/echo" encrypt success-text="Página atualizada!">
    <r4-div flex gap="2" align="center" class="r4-mb-2">
      <h3 style="margin:0;flex:1">Editando: <span r4-bind="texto:titulo|(sem título)"></span></h3>
      <r4-button icon="refresh" r4-click="recarregar:#adm-perfil">Recarregar</r4-button>
      <r4-button type="submit" icon="save">Salvar</r4-button>
    </r4-div>
    <r4-tabpanel>
      <r4-tab title="Perfil">
        <r4-textfield name="titulo" label="Nome da página" required max-length="60"></r4-textfield>
        <r4-switch name="mostrarBio">Mostrar a bio</r4-switch>
        <div r4-show-if="mostrarBio">
          <r4-textarea name="bio" label="Bio" max-length="160" counter></r4-textarea>
        </div>
        <r4-formrow>
          <r4-textfield name="botao" label="Texto do botão" placeholder="Fale comigo"></r4-textfield>
          <r4-textfield name="email" label="E-mail de contato" input-type="email" email></r4-textfield>
        </r4-formrow>
        <r4-filedrop name="foto" label="Foto do perfil" accept="image/png,image/jpeg" edit="image" aspect="1" max-width="800"
          upload-url="/vitrine/api/upload" value-field="retorno.nome" max-size="2097152"></r4-filedrop>
      </r4-tab>
      <r4-tab title="Aparência">
        <r4-choice name="estilo" label="Estilo do topo" columns="3">
          <r4-option value="solido" label="Sólido"><svg viewBox="0 0 60 40" width="60" height="40" aria-hidden="true"><rect width="60" height="14" fill="currentColor"/><rect y="18" width="60" height="22" fill="currentColor" opacity=".15"/></svg></r4-option>
          <r4-option value="gradiente" label="Degradê"><svg viewBox="0 0 60 40" width="60" height="40" aria-hidden="true"><defs><linearGradient id="adm-g" x2="1" y2="1"><stop offset="0" stop-color="currentColor"/><stop offset="1" stop-color="currentColor" stop-opacity=".2"/></linearGradient></defs><rect width="60" height="14" fill="url(#adm-g)"/><rect y="18" width="60" height="22" fill="currentColor" opacity=".15"/></svg></r4-option>
          <r4-option value="contorno" label="Contorno"><svg viewBox="0 0 60 40" width="60" height="40" aria-hidden="true"><rect x="1" y="1" width="58" height="13" fill="none" stroke="currentColor" stroke-width="2"/><rect y="18" width="60" height="22" fill="currentColor" opacity=".15"/></svg></r4-option>
        </r4-choice>
        <r4-formrow>
          <r4-colorfield name="cor" label="Cor principal" presets="#0b3d2e,#1e88e5,#6a1b9a,#c62828,#f9a825,#212121"></r4-colorfield>
          <r4-colorfield name="corTexto" label="Cor do texto no topo" presets="#ffffff,#000000,#fff8e1" contrast-with="cor" min-contrast="4.5" required-contrast="3"></r4-colorfield>
        </r4-formrow>
        <r4-numberfield name="raio" label="Arredondamento (px)" min="0" max="32" step="2"></r4-numberfield>
        <r4-choice name="layout" label="Galeria" columns="3">
          <r4-option value="grade" label="Grade" icon="grid"></r4-option>
          <r4-option value="lista" label="Lista" icon="list"></r4-option>
          <r4-option value="carrossel" label="Carrossel" icon="image"></r4-option>
        </r4-choice>
        <div class="r4-card" r4-bind="var:--adm-cor:cor; var:--adm-txt:corTexto; var:--adm-raio:raio:px">
          <b>Amostra:</b> <span style="display:inline-block;padding:6px 14px;background:var(--adm-cor);color:var(--adm-txt);border-radius:var(--adm-raio)" r4-bind="texto:botao|Fale comigo; attr:title:botao">Fale comigo</span>
        </div>
      </r4-tab>
      <r4-tab title="Horários">
        <r4-switch name="mostrarHorarios">Mostrar horários na página</r4-switch>
        <r4-repeater name="horarios" label="Horários de atendimento" min="0" max="4" item-title="{dias} {inicio}–{fim}" add-text="Adicionar horário" r4-enable-if="mostrarHorarios">
          <r4-item-template>
            <r4-formrow>
              <r4-textfield name="dias" label="Dias" required placeholder="Seg a Sex"></r4-textfield>
              <r4-textfield name="inicio" label="Abre" input-type="time" required></r4-textfield>
              <r4-textfield name="fim" label="Fecha" input-type="time" required></r4-textfield>
            </r4-formrow>
          </r4-item-template>
        </r4-repeater>
        <p class="r4-text-muted" r4-show-if="#horarios>=4">Limite de 4 horários atingido.</p>
      </r4-tab>
    </r4-tabpanel>
  </r4-form>
</r4-phonepreview>` }
    ]);
})();
