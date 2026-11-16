/* Mini ERP — tela de login e cadastro (libr4: tabpanel, form, passwordfield, select, themeswitch, i18n, notify).
 * Envio cifrado (R4.http.post → criptografia v2). CSP estrita: nenhum JS inline. */
(function () {
  'use strict';
  const { el } = R4.util;

  /* ---- textos (pt-BR / en) da tela e do app: R4.i18n.add junta com o dicionário da lib ---- */
  R4.i18n.add('pt-BR', { erp: {
    brand: 'Mini ERP', tagline: 'Showcase da libr4 e do framework PHP',
    heroTxt: 'Um sistema de gestão inteiro, feito só com os componentes da libr4 no navegador e o framework PHP no servidor. Todos os dados são fictícios.',
    f1: 'Login e cadastro com envio cifrado', f2: 'Tabelas com busca, destaque e paginação no servidor', f3: 'Uma tabela com 2 milhões de linhas', f4: 'Gráficos, formulários, arquivos, tema e idiomas',
    entrar: 'Entrar', criar: 'Criar conta', email: 'E-mail', senha: 'Senha', nome: 'Nome completo', cargo: 'Cargo', confirma: 'Confirme a senha',
    demo: 'Ambiente de demonstração — dados fictícios.', demoConta: 'Conta de teste', preencher: 'Preencher conta de teste',
    c_vendas: 'Vendas', c_financeiro: 'Financeiro', c_estoque: 'Estoque', c_gestor: 'Gestor',
    ok: 'Pronto! Entrando...', falha: 'Não foi possível concluir.', cadastrado: 'Conta criada. Entrando...',
    menu: 'Menu', sair: 'Sair', dashboard: 'Painel', clientes: 'Clientes', produtos: 'Produtos', pedidos: 'Pedidos', transacoes: 'Transações (2 mi)', arquivos: 'Importar arquivos', perfil: 'Meu perfil', novo: 'Novo', editar: 'Editar', excluir: 'Excluir'
  } });
  R4.i18n.add('en', { erp: {
    brand: 'Mini ERP', tagline: 'libr4 and PHP framework showcase',
    heroTxt: 'A full management system built only with libr4 components in the browser and the PHP framework on the server. All data is fictitious.',
    f1: 'Login and sign-up with encrypted requests', f2: 'Tables with search, highlighting and server-side paging', f3: 'A table with 2 million rows', f4: 'Charts, forms, files, theme and languages',
    entrar: 'Sign in', criar: 'Create account', email: 'E-mail', senha: 'Password', nome: 'Full name', cargo: 'Role', confirma: 'Confirm password',
    demo: 'Demo environment — fictitious data.', demoConta: 'Test account', preencher: 'Fill test account',
    c_vendas: 'Sales', c_financeiro: 'Finance', c_estoque: 'Stock', c_gestor: 'Manager',
    ok: 'Done! Signing in...', falha: 'Could not complete.', cadastrado: 'Account created. Signing in...',
    menu: 'Menu', sair: 'Sign out', dashboard: 'Dashboard', clientes: 'Customers', produtos: 'Products', pedidos: 'Orders', transacoes: 'Transactions (2M)', arquivos: 'Import files', perfil: 'My profile', novo: 'New', editar: 'Edit', excluir: 'Delete'
  } });
  const t = k => R4.t('erp.' + k);

  const root = document.getElementById('erp-root');
  if (!root) return;
  // o servidor diz se o cadastro está aberto (ERP_CADASTRO_ABERTO) e se a conta de teste existe; quem decide é ele
  const cadastroAberto = root.getAttribute('data-cadastro') !== '0';
  const contaDemo = root.getAttribute('data-demo') !== '0';
  let tabs = null;

  function erroDoServidor(form, e) {
    const d = e && e.data;
    if (e && e.status === 422 && d && d.erros) { form.markErrors(d.erros); return; }
    R4.notify({ type: 'err', text: (e && e.message) || t('falha') });
  }

  function montar() {
    if (tabs) { tabs.destroy(); tabs = null; }
    root.textContent = '';
    const hero = el('div', { class: 'erp-login-hero' }, [
      el('div', { class: 'erp-brand' }, [R4.icon('chart-bar', { size: 24 }), el('span', { text: t('brand') })]),
      el('h1', { text: t('tagline') }),
      el('p', { text: t('heroTxt') }),
      el('ul', {}, ['f1', 'f2', 'f3', 'f4'].map(k => el('li', {}, [R4.icon('check', { size: 16 }), el('span', { text: t(k) })])))
    ]);
    const box = el('div', { class: 'erp-login-box' });
    const topo = el('div', { class: 'erp-login-top' });
    box.append(topo);
    const idioma = el('div', { class: 'r4-btn-group' });
    ['pt-BR', 'en'].forEach(l => {
      const b = el('button', { type: 'button', class: 'r4-btn' + (R4.i18n.locale === l ? ' r4-btn-primary' : ''), text: l === 'en' ? 'EN' : 'PT', 'aria-pressed': String(R4.i18n.locale === l) });
      b.addEventListener('click', () => { R4.i18n.set(l); });
      idioma.append(b);
    });
    R4.create({ xtype: 'themeswitch', presets: false, renderTo: topo });
    topo.append(idioma);

    const demo = el('div', { class: 'erp-demo' }, [
      el('div', {}, [el('b', { text: t('demo') }), el('br'), el('span', { text: t('demoConta') + ': demo@r4dev.com.br / Demo@1234' })])
    ]);
    const formLogin = { xtype: 'form', id: 'erp-form-login', submitText: t('entrar'), resetText: '',
      fields: [
        { type: 'email', name: 'email', label: t('email'), required: true, autocomplete: 'username' },
        { type: 'password', name: 'senha', label: t('senha'), required: true, autocomplete: 'current-password' }
      ],
      listeners: { submit: async (f, v) => {
        try { await R4.http.post('/erp/api/login', { email: v.email, senha: v.senha }); R4.notify({ type: 'ok', text: t('ok') }); location.href = '/erp'; }
        catch (e) { erroDoServidor(f, e); }
      } } };
    const formCad = { xtype: 'form', id: 'erp-form-cad', submitText: t('criar'), resetText: '',
      fields: [
        { type: 'text', name: 'nome', label: t('nome'), required: true, minLength: 3, maxLength: 120, autocomplete: 'name' },
        { type: 'row', items: [
          { type: 'email', name: 'email', label: t('email'), required: true, autocomplete: 'email' },
          // 'gestor' não se escolhe no cadastro (o servidor recusa): é atribuído por quem administra os dados
          { type: 'select', name: 'cargo', label: t('cargo'), value: 'vendas', required: true,
            options: ['vendas', 'financeiro', 'estoque'].map(c => ({ value: c, text: t('c_' + c) })) }
        ] },
        { type: 'password', name: 'senha', label: t('senha'), required: true, minLength: 8, showStrength: true, minStrength: 2, autocomplete: 'new-password' },
        { type: 'password', name: 'confirma', label: t('confirma'), required: true, match: 'senha', validateOn: 'input', autocomplete: 'new-password' }
      ],
      listeners: { submit: async (f, v) => {
        try { await R4.http.post('/erp/api/cadastro', { nome: v.nome, email: v.email, senha: v.senha, cargo: v.cargo }); R4.notify({ type: 'ok', text: t('cadastrado') }); location.href = '/erp'; }
        catch (e) { erroDoServidor(f, e); }
      } } };

    const painel = el('div');
    tabs = R4.create({ xtype: 'tabpanel', renderTo: painel, items: [{ title: t('entrar'), items: [formLogin] }].concat(cadastroAberto ? [{ title: t('criar'), items: [formCad] }] : []) });
    box.append(painel);
    if (!contaDemo) { root.append(el('div', { class: 'erp-login' }, [hero, box])); R4.scan && R4.scan(root); return null; }
    box.append(demo);
    const preencher = R4.create({ xtype: 'button', text: t('preencher'), icon: 'user', renderTo: demo, handler: () => {
      tabs.setActive(0);
      R4.get('erp-form-login').setValues({ email: 'demo@r4dev.com.br', senha: 'Demo@1234' });
    } });
    root.append(el('div', { class: 'erp-login' }, [hero, box]));
    R4.scan && R4.scan(root);
    return preencher;
  }

  montar();
  R4.i18n.onChange(() => montar());
})();
