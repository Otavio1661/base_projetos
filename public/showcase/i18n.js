/**
 * Vitrine — textos da interface (chaves vt.*) e seletor de idioma.
 * A documentação dos componentes (meta.props, descrições, exemplos) continua em português;
 * só a "casca" da vitrine (títulos fixos, botões, página Início) acompanha o idioma.
 *
 * Como adicionar um idioma à vitrine: copie o bloco 'en' abaixo, troque o código ('es', 'fr'...)
 * e traduza os valores. Depois:  R4.i18n.add('es', { r4: {...}, vt: {...} });  e  R4.i18n.set('es').
 * O seletor da barra superior lista os idiomas que tiverem dicionário vt.* (veja LANGS).
 */
(function () {
  const dict = {
    'pt-BR': {
      sub: 'vitrine · {brand}', lang: 'Idioma', home: 'Início', noDemo: 'sem demo', module: 'módulo',
      cfgApi: 'Configuração e API', events: 'Eventos', colName: 'Nome', colType: 'Tipo', colDefault: 'Padrão', colDesc: 'Descrição',
      pgTitle: 'Experimente as propriedades', pgHint: 'Mude os controles: o componente, o HTML e o JavaScript atualizam na hora.',
      liveExamples: 'Exemplos ao vivo', examples: 'Exemplos', noDemoText: 'Sem demo cadastrada. Adicione em',
      jsEquiv: 'JavaScript equivalente', none: '(nenhum)',
      result: '1 · Resultado', resultHint: ' — é isto que a página mostra', code: '2 · Código',
      codeHintHtml: ' — edite e o resultado muda sozinho', codeHintJs: ' — edite e clique em Executar (Ctrl+Enter)',
      run: 'Executar', copy: 'Copiar', restore: 'Restaurar', ran: 'executado', failed: 'erro',
      homeP1: 'Biblioteca de componentes dinâmicos em JavaScript puro, sem dependências, no estilo ExtJS:', homeP2: 'ou direto em HTML:',
      homeP3: 'Escolha um item no menu à esquerda.', testTag: 'Testar tag', toastActive: 'A camada HTML está ativa!',
      found: 'Itens encontrados', howAdd: 'Como adicionar um componente'
    },
    en: {
      sub: 'showcase · {brand}', lang: 'Language', home: 'Home', noDemo: 'no demo', module: 'module',
      cfgApi: 'Configuration and API', events: 'Events', colName: 'Name', colType: 'Type', colDefault: 'Default', colDesc: 'Description',
      pgTitle: 'Try the properties', pgHint: 'Change the controls: the component, the HTML and the JavaScript update instantly.',
      liveExamples: 'Live examples', examples: 'Examples', noDemoText: 'No demo registered. Add one in',
      jsEquiv: 'Equivalent JavaScript', none: '(none)',
      result: '1 · Result', resultHint: ' — this is what the page renders', code: '2 · Code',
      codeHintHtml: ' — edit it and the result updates by itself', codeHintJs: ' — edit it and click Run (Ctrl+Enter)',
      run: 'Run', copy: 'Copy', restore: 'Restore', ran: 'ran', failed: 'error',
      homeP1: 'Library of dynamic components in plain JavaScript, with no dependencies, ExtJS-style:', homeP2: 'or straight in HTML:',
      homeP3: 'Pick an item in the menu on the left.', testTag: 'Try the tag', toastActive: 'The HTML layer is active!',
      found: 'Items found', howAdd: 'How to add a component'
    }
  };
  Object.keys(dict).forEach(l => R4.i18n.add(l, { vt: dict[l] }));

  /** Idiomas oferecidos no seletor: código → rótulo curto. */
  const LANGS = { 'pt-BR': 'PT', en: 'EN' };

  /* Seletor de idioma da barra superior: botões "PT | EN" (aria-pressed), acompanha R4.i18n. */
  R4.define('vtlang', {
    build() {
      const el = R4.util.el;
      const root = el('div', { class: 'r4-ts-modes vt-lang', role: 'group' });
      this._btns = {};
      Object.keys(LANGS).forEach(l => {
        const b = el('button', { type: 'button', class: 'r4-btn r4-ts-btn', lang: l, 'aria-pressed': 'false', onclick: () => R4.i18n.set(l) },
          [LANGS[l]]);
        this._btns[l] = b; root.append(b);
      });
      return root;
    },
    afterRender() { this._off = R4.i18n.onChange(() => this.sync()); this.sync(); },
    sync() {
      const cur = R4.i18n.locale, base = cur.split('-')[0];
      this.el.setAttribute('aria-label', R4.t('vt.lang'));
      Object.keys(this._btns).forEach(l => {
        const on = l === cur || (!this._btns[cur] && l.split('-')[0] === base);
        this._btns[l].setAttribute('aria-pressed', on ? 'true' : 'false');
        this._btns[l].title = R4.t('vt.lang') + ': ' + l;
      });
    },
    destroy() { this._off && this._off(); this._off = null; R4.Component.prototype.destroy.call(this); }
  }, { hidden: true, title: 'vtlang', group: 'Interface', description: 'Seletor de idioma da vitrine.' });
})();
