/* Demos da vitrine: formulários (form, select, checkbox, switch, radiogroup, textarea,
 * numberfield, datefield, passwordfield, maskfield, fieldset, formrow, R4.validation).
 * Cada exemplo: { title, html } (editável ao vivo) ou { title, fn(el, out) }. */
(function (D) {
  const add = (k, ...list) => { (D[k] = D[k] || []).push(...list); };
  const ESTADOS = '/showcase/vitrineData/estados.json', OPCOES = '/showcase/vitrineData/opcoes.json';

  /* ============================== form ============================== */
  add('form',
    { title: 'Cadastro completo em HTML (envia para /vitrine/api/cadastro)', html: `
<r4-form id="demo-cad" action="/vitrine/api/cadastro" success-text="Cadastro recebido pelo servidor!">
  <r4-formrow>
    <r4-textfield name="nome" label="Nome completo" required min-length="3" autocomplete="name"></r4-textfield>
    <r4-textfield name="email" label="E-mail" input-type="email" email required autocomplete="email"></r4-textfield>
  </r4-formrow>
  <r4-formrow>
    <r4-maskfield name="cpf" label="CPF" mask="cpf" required help-text="Teste 529.982.247-25 (válido) e 529.982.247-24 (inválido)"></r4-maskfield>
    <r4-maskfield name="telefone" label="Celular" mask="telefone"></r4-maskfield>
    <r4-datefield name="nascimento" label="Nascimento" max="2010-12-31"></r4-datefield>
  </r4-formrow>
  <r4-formrow>
    <r4-select name="uf" label="Estado" src="${ESTADOS}" searchable required></r4-select>
    <r4-select name="plano" label="Plano" src="${OPCOES}" root="planos" value="pro"></r4-select>
  </r4-formrow>
  <r4-radiogroup name="contato" label="Prefere contato por" inline value="email">
    <r4-option value="email">E-mail</r4-option>
    <r4-option value="whats">WhatsApp</r4-option>
    <r4-option value="tel">Telefone</r4-option>
  </r4-radiogroup>
  <r4-textarea name="obs" label="Observações" max-length="200" auto-grow></r4-textarea>
  <r4-checkbox name="aceite" required>Li e aceito os termos de uso</r4-checkbox>
  <r4-div flex gap="2" justify="end">
    <r4-button type="reset">Limpar</r4-button>
    <r4-button type="submit">Cadastrar</r4-button>
  </r4-div>
</r4-form>` },

    { title: 'Erro 422 do servidor aparece no campo certo', fn(el, out) {
      // Sem validação no navegador: quem recusa é o servidor ({erros:{nome, email}} com HTTP 422)
      const f = R4.create({ xtype: 'form', renderTo: el, action: '/vitrine/api/cadastro', successText: 'Aceito pelo servidor.',
        fields: [{ type: 'text', name: 'nome', label: 'Nome', value: 'Al' }, { type: 'text', name: 'email', label: 'E-mail', value: 'sem-arroba' }],
        submitText: 'Enviar ao servidor', resetText: '',
        listeners: {
          failure: (form, data, res) => out({ http: res.status, resposta: data }),
          success: (form, data) => out({ ok: true, resposta: data })
        } });
      R4.button(el, 'Preencher certo', () => f.setValues({ nome: 'Ana Souza', email: 'ana@exemplo.com' })).el.style.marginTop = '8px';
    } },

    { title: 'Validação cruzada: confirmar senha (match)', html: `
<r4-form id="demo-senha" success-text="Senha alterada (só no navegador, sem action).">
  <r4-passwordfield name="senha" label="Nova senha" required min-length="8" show-strength min-strength="2"></r4-passwordfield>
  <r4-passwordfield name="confirma" label="Confirme a senha" required match="senha" validate-on="input"></r4-passwordfield>
  <r4-button type="submit">Trocar senha</r4-button>
</r4-form>` },

    { title: 'Envio criptografado (encrypt) para /vitrine/api/echo', fn(el, out) {
      R4.create({ xtype: 'form', renderTo: el, action: '/vitrine/api/echo', encrypt: true,
        fields: [
          { type: 'text', name: 'cliente', label: 'Cliente', value: 'Ana', required: true },
          { type: 'moeda', name: 'valor', label: 'Valor', value: 1500.5 },
          { type: 'switch', name: 'urgente', label: 'Urgente' }
        ],
        submitText: 'Enviar cifrado', resetText: '',
        listeners: { success: (f, data) => out(data.retorno), failure: (f, data, res) => out({ erro: res.status, data }) } });
      // o echo responde { cifrado: true, recebido: {...} } quando o corpo chegou como {x,y,z}
    } },

    { title: 'Form montado só por JavaScript (R4.create + items)', fn(el, out) {
      const f = R4.create({ xtype: 'form', renderTo: el, buttons: [{ text: 'Ver valores', variant: 'primary', action: 'submit' }, { text: 'Desfazer', action: 'reset' }],
        values: { nome: 'Bruno', perfil: 'editor', ativo: true },
        items: [
          { xtype: 'fieldset', title: 'Usuário', items: [
            { xtype: 'formrow', items: [
              { xtype: 'textfield', name: 'nome', label: 'Nome', required: true },
              { xtype: 'select', name: 'perfil', label: 'Perfil', src: '/showcase/vitrineData/opcoes.json', root: 'perfis' }
            ] },
            { xtype: 'switch', name: 'ativo', label: 'Ativo' }
          ] },
          { xtype: 'numberfield', name: 'limite', label: 'Limite de crédito', prefix: 'R$', decimals: 2, min: 0, max: 50000, step: 100 }
        ],
        listeners: { submit: (form, valores) => out({ valores, alterado: form.isDirty() }) } });
      f.on('change', (form, campo, v) => out({ mudou: campo.name, valor: v, isDirty: form.isDirty() }));
    } },

    { title: 'Função pronta R4.form com fields por tipo', fn(el, out) {
      R4.form(el, {
        action: '/vitrine/api/echo',
        fields: [
          { type: 'row', items: [
            { type: 'text', name: 'nome', label: 'Nome', required: true, minLength: 3 },
            { type: 'email', name: 'email', label: 'E-mail', required: true }
          ] },
          { type: 'row', items: [
            { type: 'cpfcnpj', name: 'documento', label: 'CPF ou CNPJ', required: true },
            { type: 'cep', name: 'cep', label: 'CEP' }
          ] },
          { type: 'multiselect', name: 'categorias', label: 'Categorias', src: '/showcase/vitrineData/opcoes.json', root: 'categorias', searchable: true },
          { type: 'checkbox', name: 'novidades', label: 'Quero receber novidades' }
        ],
        submitText: 'Enviar', resetText: 'Limpar',
        listeners: { success: (f, data) => out(data.retorno.recebido) }
      });
    } },

    { title: 'Botões fora do form (r4-click="submit:#id") e beforesubmit cancelável', fn(el, out) {
      R4.render(el, `
        <r4-form id="demo-fora">
          <r4-textfield name="codigo" label="Código (comece com X para bloquear)" required></r4-textfield>
        </r4-form>
        <div class="r4-flex r4-gap-2 r4-mt-2">
          <button class="r4-btn r4-btn-primary" r4-click="submit:#demo-fora">Enviar</button>
          <button class="r4-btn" r4-click="reset:#demo-fora" r4-confirm="Limpar o formulário?">Limpar</button>
        </div>`);
      const f = R4.get('demo-fora');
      f.on('beforesubmit', (form, v) => { if (/^x/i.test(v.codigo)) { form.markErrors({ codigo: 'Códigos com X são bloqueados.' }); return false; } });
      f.on('submit', (form, v) => out({ enviado: v }));
    } }
  );

  /* ============================== select ============================== */
  add('select',
    { title: 'Estados de um JSON (src) com busca', html: `
<r4-select name="uf" label="Estado" src="${ESTADOS}" searchable clearable placeholder="Escolha o estado"></r4-select>` },
    { title: 'Opções de opcoes.json (root escolhe a lista) e múltipla escolha com chips', html: `
<r4-formrow>
  <r4-select name="status" label="Status" src="${OPCOES}" root="status" value="ativo"></r4-select>
  <r4-select name="perfis" label="Perfis" src="${OPCOES}" root="perfis" multiple value="admin,leitor"></r4-select>
</r4-formrow>` },
    { title: 'Opções no próprio HTML com <r4-option>', html: `
<r4-select name="prioridade" label="Prioridade" required help-text="Use as setas, Enter, Esc ou digite a inicial">
  <r4-option value="baixa">Baixa</r4-option>
  <r4-option value="media" selected>Média</r4-option>
  <r4-option value="alta">Alta</r4-option>
  <r4-option value="critica" disabled>Crítica (indisponível)</r4-option>
</r4-select>` },
    { title: 'JavaScript: clientes.json com valueField/textField e eventos', fn(el, out) {
      R4.select(el, '/showcase/vitrineData/clientes.json', { label: 'Cliente', name: 'cliente', valueField: 'id', textField: 'nome', searchable: true,
        listeners: { change: (s, v) => out({ valor: v, texto: s.getText() }), load: (s, opcoes) => out({ carregadas: opcoes.length }) } });
    } },
    { title: 'Lista grande (5.000 linhas de grande.json): desenha 300 por vez, a busca encontra o resto', fn(el, out) {
      R4.select(el, '/showcase/vitrineData/grande.json', { label: 'Registro', searchable: true, valueField: 'id', textField: 'nome',
        listeners: { change: (s, v) => out({ id: v, texto: s.getText() }) } });
    } },
    { title: 'Função rápida: R4.select(alvo, url, opções)', fn(el, out) {
      R4.select(el, '/showcase/vitrineData/opcoes.json', { root: 'categorias', label: 'Categorias', multiple: true, maxItems: 3,
        helpText: 'No máximo 3', listeners: { change: (s, v) => out(v) } });
    } }
  );

  /* ============================== checkbox / switch / radiogroup ============================== */
  add('checkbox',
    { title: 'Obrigatório (marque para continuar)', html: `
<r4-form id="demo-ck" success-text="Ok, termos aceitos.">
  <r4-checkbox name="aceite" required help-text="Precisa marcar para enviar">Li e aceito os termos</r4-checkbox>
  <r4-checkbox name="news" value="true">Receber novidades por e-mail</r4-checkbox>
  <r4-checkbox name="bloq" disabled>Opção desabilitada</r4-checkbox>
  <r4-button type="submit">Continuar</r4-button>
</r4-form>` },
    { title: 'Vários com o mesmo name viram um array (inputValue)', fn(el, out) {
      R4.form(el, { buttons: false, fields: ['email', 'sms', 'push'].map(c => ({ type: 'checkbox', name: 'canais', inputValue: c, label: c.toUpperCase() })),
        values: { canais: ['email', 'push'] },
        listeners: { change: f => out(f.getValues()) } });
    } }
  );
  add('switch',
    { title: 'Interruptores', html: `
<r4-div column gap="2">
  <r4-switch name="wifi" value="true">Wi-Fi</r4-switch>
  <r4-switch name="bt">Bluetooth</r4-switch>
  <r4-switch name="aviao" disabled>Modo avião (desabilitado)</r4-switch>
</r4-div>` },
    { title: 'JavaScript: change', fn(el, out) {
      R4.switch(el, 'Modo escuro na prévia', { listeners: { change: (s, v) => { el.classList.toggle('r4-dark', v); out({ ligado: v }); } } });
    } }
  );
  add('radiogroup',
    { title: 'Inline com <r4-option>', html: `
<r4-radiogroup name="tamanho" label="Tamanho" inline required>
  <r4-option value="P">Pequeno</r4-option>
  <r4-option value="M">Médio</r4-option>
  <r4-option value="G">Grande</r4-option>
</r4-radiogroup>` },
    { title: 'Opções de um JSON (src + root)', fn(el, out) {
      R4.radiogroup(el, '/showcase/vitrineData/opcoes.json', { root: 'status', label: 'Status', name: 'status', value: 'pendente',
        listeners: { change: (r, v) => out({ status: v }) } });
    } }
  );

  /* ============================== textarea / number / date / password ============================== */
  add('textarea',
    { title: 'Contador e crescimento automático', html: `
<r4-textarea name="bio" label="Sobre você" max-length="160" auto-grow placeholder="Até 160 caracteres..."></r4-textarea>` },
    { title: 'Mínimo de caracteres validando ao digitar', html: `
<r4-textarea name="motivo" label="Motivo do cancelamento" required min-length="20" validate-on="input" counter rows="4"></r4-textarea>` }
  );
  add('numberfield',
    { title: 'Preço em reais, quantidade e porcentagem', html: `
<r4-formrow>
  <r4-numberfield name="preco" label="Preço" prefix="R$" decimals="2" min="0" value="1234.5"></r4-numberfield>
  <r4-numberfield name="qtd" label="Quantidade" decimals="0" min="1" max="99" value="1" required></r4-numberfield>
  <r4-numberfield name="desc" label="Desconto" suffix="%" step="0.5" min="0" max="100"></r4-numberfield>
</r4-formrow>` },
    { title: 'JavaScript: getValue() devolve Number', fn(el, out) {
      R4.numberfield(el, 'Peso', { suffix: 'kg', decimals: 3, step: 0.25, listeners: { change: (n, v) => out({ valor: v, tipo: typeof v }) } });
    } }
  );
  add('datefield',
    { title: 'Período com limites (min/max)', html: `
<r4-formrow>
  <r4-datefield name="inicio" label="Início" min="2026-01-01" max="2026-12-31" value="2026-03-10" required></r4-datefield>
  <r4-datefield name="fim" label="Fim" min="2026-01-01" max="2026-12-31"></r4-datefield>
</r4-formrow>` },
    { title: 'Validação própria: fim depois do início', fn(el, out) {
      R4.form(el, { resetText: '', submitText: 'Conferir', fields: [{ type: 'row', items: [
        { type: 'date', name: 'inicio', label: 'Início', required: true },
        { type: 'date', name: 'fim', label: 'Fim', required: true, validator: (v, vals) => !vals.inicio || v >= vals.inicio || 'O fim deve ser depois do início.' }
      ] }], listeners: { submit: (f, v) => out(v) } });
    } }
  );
  add('passwordfield',
    { title: 'Mostrar/ocultar e medidor de força', html: `
<r4-passwordfield name="senha" label="Senha" show-strength min-length="8" help-text="Mínimo 8 caracteres"></r4-passwordfield>` },
    { title: 'Senha e confirmação (match)', html: `
<r4-form id="demo-pw" success-text="Senhas conferem!">
  <r4-passwordfield name="senha" label="Senha" required min-strength="3"></r4-passwordfield>
  <r4-passwordfield name="senha2" label="Repita a senha" required match="senha"></r4-passwordfield>
  <r4-button type="submit">Salvar</r4-button>
</r4-form>` }
  );

  /* ============================== maskfield ============================== */
  add('maskfield',
    { title: 'CPF, CNPJ, telefone, CEP, moeda e data', html: `
<r4-formrow>
  <r4-maskfield name="cpf" label="CPF" mask="cpf" placeholder="000.000.000-00"></r4-maskfield>
  <r4-maskfield name="cnpj" label="CNPJ (aceita alfanumérico)" mask="cnpj"></r4-maskfield>
  <r4-maskfield name="tel" label="Telefone" mask="telefone"></r4-maskfield>
</r4-formrow>
<r4-formrow class="r4-mt-3">
  <r4-maskfield name="cep" label="CEP" mask="cep"></r4-maskfield>
  <r4-maskfield name="valor" label="Valor" mask="moeda" value="1999.9"></r4-maskfield>
  <r4-maskfield name="venc" label="Vencimento" mask="data"></r4-maskfield>
</r4-formrow>` },
    { title: 'Valor sem máscara (raw) e com máscara (raw:false)', fn(el, out) {
      const a = R4.maskfield(el, 'cpf', { label: 'CPF (raw)', value: '52998224725' });
      const b = R4.maskfield(el, 'telefone', { label: 'Telefone (raw:false)', value: '11987654321', raw: false });
      const c = R4.maskfield(el, 'AAA-9S99', { label: 'Placa (padrão livre AAA-9S99)', value: 'abc1d23' });
      const show = () => out({ cpf: a.getValue(), cpfValido: a.isValid(), telefone: b.getValue(), placa: c.getValue() });
      [a, b, c].forEach(x => x.on('change', show)); show();
    } }
  );

  /* ============================== fieldset / formrow ============================== */
  add('fieldset',
    { title: 'Agrupando campos (recolhível)', html: `
<r4-fieldset title="Endereço" collapsible>
  <r4-formrow cols="1fr 2fr">
    <r4-maskfield name="cep" label="CEP" mask="cep"></r4-maskfield>
    <r4-textfield name="rua" label="Rua"></r4-textfield>
  </r4-formrow>
  <r4-formrow cols="1fr 2fr 1fr">
    <r4-textfield name="numero" label="Número"></r4-textfield>
    <r4-textfield name="cidade" label="Cidade"></r4-textfield>
    <r4-select name="uf" label="UF" src="${ESTADOS}" searchable></r4-select>
  </r4-formrow>
</r4-fieldset>` }
  );
  add('formrow',
    { title: 'Linha automática (empilha no celular)', html: `
<r4-formrow>
  <r4-textfield name="a" label="Primeiro"></r4-textfield>
  <r4-textfield name="b" label="Segundo"></r4-textfield>
  <r4-textfield name="c" label="Terceiro"></r4-textfield>
</r4-formrow>` },
    { title: 'JavaScript: R4.formrow(alvo, campos)', fn(el) {
      R4.formrow(el, [{ type: 'text', name: 'cidade', label: 'Cidade' }, { type: 'select', name: 'uf', label: 'UF', src: '/showcase/vitrineData/estados.json' }], { cols: '3fr 1fr' });
    } }
  );

  /* ============================== R4.validation ============================== */
  add('validation',
    { title: 'Conferindo CPF/CNPJ e formatando', fn(el, out) {
      const V = R4.validation;
      out({
        'cpf 529.982.247-25': V.cpf('529.982.247-25'),
        'cpf 529.982.247-24': V.cpf('529.982.247-24'),
        'cnpj 11.222.333/0001-81': V.cnpj('11.222.333/0001-81'),
        'cnpj alfanumérico 12.ABC.345/01DE-35': V.cnpj('12.ABC.345/01DE-35'),
        'mask telefone': V.mask('11987654321', 'telefone'),
        'unmask moeda': V.unmask('R$ 1.234,56', 'moeda'),
        'parseNumber 1.234,5': V.parseNumber('1.234,5'),
        'força "Abc123!@#xyz"': V.strength('Abc123!@#xyz')
      });
    } },
    { title: 'Validador nomeado próprio (register) usado no HTML', fn(el) {
      R4.validation.register('par', v => Number(v) % 2 === 0 || 'Informe um número par.');
      R4.render(el, '<r4-numberfield name="n" label="Número par" validator="par" validate-on="input" decimals="0"></r4-numberfield>');
    } }
  );
})(window.R4Demos = window.R4Demos || {});
