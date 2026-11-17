/**
 * Exemplos da camada reativa (r4-bind, r4-show-if, r4-enable-if, R4.state), do R4.preview e dos
 * componentes de painel (repeater, colorfield, choice, phonepreview). Editáveis ao vivo na vitrine.
 * Lembrete: os exemplos fn(el, out) são reavaliados isoladamente — nada de variáveis deste arquivo dentro deles.
 */
(function () {
  if (!window.R4) return;
  const D = (window.R4Demos = window.R4Demos || {});

  D.reactive = [
    { title: 'HTML: textos e cores ao vivo (r4-bind)', html: `
<r4-form id="rx-cartao">
  <r4-formrow>
    <r4-textfield name="nome" label="Nome" value="Ana Souza"></r4-textfield>
    <r4-textfield name="cargo" label="Cargo" placeholder="(opcional)"></r4-textfield>
    <r4-colorfield name="cor" label="Cor" value="#3b5bdb" presets="#3b5bdb,#2f9e44,#e03131,#f08c00"></r4-colorfield>
  </r4-formrow>
</r4-form>
<div class="r4-card r4-mt-2" r4-scope="#rx-cartao" r4-bind="var:--rx-cor:cor">
  <b style="color:var(--rx-cor)" r4-bind="texto:nome|Seu nome"></b>
  <div class="r4-text-muted" r4-bind="texto:cargo|Sem cargo; attr:title:cargo"></div>
  <small>Letras no nome: <span r4-bind="texto:#nome"></span></small>
</div>` },
    { title: 'HTML: mostrar/ocultar e habilitar (r4-show-if / r4-enable-if)', html: `
<r4-form>
  <r4-radiogroup name="tipo" label="Tipo de cliente" inline value="pf">
    <r4-option value="pf">Pessoa física</r4-option>
    <r4-option value="pj">Pessoa jurídica</r4-option>
  </r4-radiogroup>
  <r4-maskfield name="cpf" label="CPF" mask="cpf" r4-show-if="tipo=pf"></r4-maskfield>
  <div r4-show-if="tipo=pj">
    <r4-maskfield name="cnpj" label="CNPJ" mask="cnpj"></r4-maskfield>
    <r4-textfield name="ie" label="Inscrição estadual"></r4-textfield>
  </div>
  <r4-numberfield name="qtd" label="Quantidade" value="1" min="0"></r4-numberfield>
  <p class="r4-alert r4-alert-ok" r4-show-if="qtd>=10 && tipo in pj,pf">Desconto de atacado aplicado!</p>
  <r4-checkbox name="aceite">Li e aceito os termos</r4-checkbox>
  <r4-button type="submit" r4-enable-if="aceite">Enviar</r4-button>
</r4-form>` },
    { title: 'JS: R4.state — ler, alterar e ouvir mudanças', fn(el, out) {
      el.innerHTML = '<r4-form id="rx-st"><r4-textfield name="cidade" label="Cidade" value="Recife"></r4-textfield><r4-select name="uf" label="UF" src="/showcase/vitrineData/estados.json"></r4-select></r4-form><p>Prévia: <b r4-scope="#rx-st" r4-bind="texto:cidade"></b> — <span r4-scope="#rx-st" r4-bind="texto:uf|?"></span></p>';
      R4.scan(el);
      const st = R4.state('#rx-st');
      st.on('change', (s, campos, valores) => out({ mudou: campos, valores }));
      out({ inicial: st.values(), avalia: R4.reactive.evaluate('cidade=Recife && !uf', st.values()) });
      setTimeout(() => st.set('uf', 'PE'), 300);
    } },
    { title: 'JS: o mini-parser de expressões (sem eval)', fn(el, out) {
      const v = { plano: 'pro', qtd: 12, itens: [1, 2, 3], nome: '' };
      const exprs = ['plano=pro', 'qtd>10 && plano in free,pro', '!nome', '#itens>=3', '(plano=free || qtd<5)', 'alert(1)', 'a and b'];
      out(exprs.map(e => e + '  →  ' + R4.reactive.evaluate(e, v)).join('\n'));
    } }
  ];

  D.preview = [
    { title: 'JS: o que a página de prévia aceita (R4.preview.check / cssValue)', fn(el, out) {
      out({
        aceito: R4.preview.check({ v: 1, t: 'estado', d: { titulo: 'Olá', cor: '#3b5bdb', lista: [{ dias: 'Seg', inicio: '08:00' }] } }),
        recusado_formato: R4.preview.check({ v: 2, t: 'estado', d: {} }),
        recusado_proto: R4.preview.check(JSON.parse('{"v":1,"t":"estado","d":{"__proto__":{"x":1},"ok":1}}')),
        css: ['#abc', '12px', 'bold', 'red;background:url(x)', 'expression(alert(1))', '10'].map(x => x + ' → "' + R4.preview.cssValue(x, 'px') + '"')
      });
    } },
    { title: 'HTML: página de prévia de exemplo dentro de um iframe', html: `
<p class="r4-text-muted">A página <code>/showcase/preview-demo.html</code> carrega só <code>/libr4/preview.js</code> e um arquivo que chama <code>R4.preview.listen({...})</code>. Veja ela recebendo dados no exemplo de <b>phonepreview</b>.</p>
<iframe src="/showcase/preview-demo.html" title="Página de prévia" sandbox="allow-same-origin allow-scripts" loading="lazy" style="width:320px;height:420px;border:1px solid var(--r4-line);border-radius:12px"></iframe>` }
  ];

  D.repeater = [
    { title: 'HTML: horários (min 1, max 4, título por item)', html: `
<r4-form id="rp-f">
  <r4-repeater name="horarios" label="Horários de atendimento" min="1" max="4" item-title="{dias} {inicio}–{fim}" add-text="Adicionar horário"
    value='[{"dias":"Seg a Sex","inicio":"08:00","fim":"18:00"}]'>
    <r4-item-template>
      <r4-formrow>
        <r4-textfield name="dias" label="Dias" required></r4-textfield>
        <r4-textfield name="inicio" label="Abre" input-type="time"></r4-textfield>
        <r4-textfield name="fim" label="Fecha" input-type="time"></r4-textfield>
      </r4-formrow>
    </r4-item-template>
  </r4-repeater>
  <p class="r4-text-muted"><span r4-bind="texto:#horarios"></span> de 4 horários</p>
  <r4-button type="submit">Validar</r4-button>
</r4-form>` },
    { title: 'HTML: bindings dentro do item (cada item enxerga os próprios campos)', html: `
<r4-form>
  <r4-repeater name="links" label="Links" max="5" item-title="{titulo}">
    <r4-item-template>
      <r4-textfield name="titulo" label="Título"></r4-textfield>
      <r4-textfield name="url" label="Endereço" input-type="url" placeholder="https://"></r4-textfield>
      <a class="r4-text-primary" target="_blank" rel="noopener" r4-bind="texto:titulo|(sem título); attr:href:url" r4-show-if="url"></a>
    </r4-item-template>
  </r4-repeater>
</r4-form>` },
    { title: 'JS: R4.repeater com fields e setValue', fn(el, out) {
      const r = R4.repeater(el, [{ type: 'text', name: 'nome', label: 'Nome' }, { type: 'telefone', name: 'fone', label: 'Telefone' }],
        { name: 'contatos', label: 'Contatos', max: 3, itemTitle: '{nome}', listeners: { change: c => out(c.getValue()) } });
      r.setValue([{ nome: 'Ana', fone: '81999990000' }, { nome: 'Bruno' }]);
      out(r.getValue());
    } }
  ];

  D.colorfield = [
    { title: 'HTML: cor com sugestões e contraste ao vivo', html: `
<r4-form>
  <r4-formrow>
    <r4-colorfield name="fundo" label="Fundo" value="#0b3d2e" presets="#0b3d2e,#1e88e5,#6a1b9a,#ffffff"></r4-colorfield>
    <r4-colorfield name="texto" label="Texto" value="#ffffff" presets="#ffffff,#000000,#ffe082" contrast-with="fundo" min-contrast="4.5" required-contrast="3"></r4-colorfield>
  </r4-formrow>
  <div class="r4-card" r4-bind="var:--cf-bg:fundo; var:--cf-fg:texto" style="background:var(--cf-bg);color:var(--cf-fg)">Texto de exemplo sobre o fundo</div>
</r4-form>` },
    { title: 'JS: R4.colorfield e R4.color.contrast', fn(el, out) {
      const c = R4.colorfield(el, 'Cor da marca', { name: 'marca', value: '#ABC', contrastWith: '#ffffff' });
      out({ valor: c.getValue(), contraste: Math.round(c.getContrast() * 100) / 100, preto_branco: R4.color.contrast('#000', '#fff') });
    } }
  ];

  D.choice = [
    { title: 'HTML: estilo do topo com SVG em cada opção', html: `
<r4-choice name="estilo" label="Estilo do topo" columns="3" value="solido">
  <r4-option value="solido" label="Sólido"><svg viewBox="0 0 60 40" width="60" height="40" aria-hidden="true"><rect width="60" height="14" fill="currentColor"/><rect y="18" width="60" height="22" fill="currentColor" opacity=".15"/></svg></r4-option>
  <r4-option value="gradiente" label="Degradê" description="Do tom principal ao escuro"><svg viewBox="0 0 60 40" width="60" height="40" aria-hidden="true"><rect width="60" height="14" fill="currentColor" opacity=".6"/><rect y="18" width="60" height="22" fill="currentColor" opacity=".15"/></svg></r4-option>
  <r4-option value="imagem" label="Imagem" icon="image" disabled></r4-option>
</r4-choice>` },
    { title: 'JS: opções de dados (texto é escapado; HTML só com R4.html)', fn(el, out) {
      const c = R4.choice(el, [
        { value: 'grade', label: 'Grade', icon: 'grid' },
        { value: 'lista', label: '<b>Lista</b> (vira texto)', icon: 'list' },
        { value: 'destaque', label: 'Destaque', html: R4.html`<strong>${'★'}</strong>` }
      ], { name: 'layout', label: 'Layout', value: 'grade', listeners: { change: (f, v) => out(v) } });
      out(c.getValue());
    } }
  ];

  D.phonepreview = [
    { title: 'HTML: form com prévia num celular (≥ 1024 px) ou botão "Visualizar pré-review"', html: `
<r4-phonepreview src="/showcase/preview-demo.html" map="titulo,bio,cor,estilo,mostrarBio" breakpoint="900" height="640">
  <r4-form>
    <r4-textfield name="titulo" label="Título" value="Minha página"></r4-textfield>
    <r4-switch name="mostrarBio" value="true">Mostrar bio</r4-switch>
    <r4-textarea name="bio" label="Bio" r4-show-if="mostrarBio">Olá! Esta é a minha página.</r4-textarea>
    <r4-colorfield name="cor" label="Cor" value="#3b5bdb" presets="#3b5bdb,#0b3d2e,#c62828"></r4-colorfield>
    <r4-choice name="estilo" label="Topo" columns="3" value="solido">
      <r4-option value="solido" label="Sólido" icon="square"></r4-option>
      <r4-option value="gradiente" label="Degradê" icon="contrast"></r4-option>
      <r4-option value="contorno" label="Contorno" icon="dot"></r4-option>
    </r4-choice>
  </r4-form>
</r4-phonepreview>` },
    { title: 'JS: o pacote que vai para a prévia (allowlist do map)', fn(el, out) {
      el.innerHTML = '<r4-form id="pp-js"><r4-textfield name="titulo" label="Título" value="Olá"></r4-textfield><r4-textfield name="segredo" label="Não vai para a prévia" value="123"></r4-textfield></r4-form>';
      R4.scan(el);
      const p = R4.phonepreview(el, { src: '/showcase/preview-demo.html', for: '#pp-js', map: 'titulo', breakpoint: 99999 });
      setTimeout(() => out(p.payload()), 50);
    } }
  ];
})();
