/* Demos da vitrine: ui (grupo Interface). window.R4Demos[nome] = [{ title, html | fn(el, out) }] */
(function () {
  const D = window.R4Demos = window.R4Demos || {};
  const K = '/showcase/vitrineData/';
  const add = (k, ...items) => (D[k] ||= []).push(...items);

  /* ===== accordion ===== */
  add('accordion',
    { title: 'HTML: um aberto por vez', html: `
<r4-accordion>
  <r4-item title="O que é a libr4?" open>Biblioteca de componentes em JavaScript puro, sem dependências.</r4-item>
  <r4-item title="Funciona só com HTML?">Sim. Use as tags <code>&lt;r4-*&gt;</code> e os atributos <code>r4-click</code>.</r4-item>
  <r4-item title="Item desabilitado" disabled>Este conteúdo não abre.</r4-item>
</r4-accordion>` },
    { title: 'HTML: vários abertos, com componentes dentro', html: `
<r4-accordion multiple>
  <r4-item title="Ações rápidas" open>
    <r4-button variant="primary" r4-click="notify:ok|Pedido criado">Novo pedido</r4-button>
    <r4-button r4-click="notify:Relatório em preparo">Relatório</r4-button>
  </r4-item>
  <r4-item title="Progresso do mês" open><r4-progress value="72" label="Meta de vendas" variant="ok"></r4-progress></r4-item>
  <r4-item title="Avisos"><r4-alert variant="warn" title="Estoque baixo">3 produtos abaixo do mínimo.</r4-alert></r4-item>
</r4-accordion>` },
    { title: 'JS: clientes agrupados por status (clientes.json)', async fn(el, out) {
      const clientes = await VitrineData.load('clientes');
      const grupos = {};
      clientes.forEach(c => (grupos[c.status] ||= []).push(c));
      const items = Object.entries(grupos).map(([status, lista], i) => ({
        title: status + ' (' + lista.length + ')',
        open: i === 0,
        html: '<ul style="margin:0;padding-left:18px">' + lista.slice(0, 6).map(c => '<li>' + R4.util.esc(c.nome) + ' · ' + R4.util.esc(c.cidade) + '</li>').join('') + '</ul>'
      }));
      const acc = R4.accordion(el, items, { multiple: true });
      acc.on('toggle', (a, i, aberto) => out({ secao: items[i].title, aberto, abertas: a.getOpen() }));
    } }
  );

  /* ===== dropdown ===== */
  add('dropdown',
    { title: 'HTML: menu de ações com r4-click', html: `
<r4-dropdown text="Ações" icon="⚙">
  <r4-item text="Editar" icon="✎" r4-click="notify:Editar clicado"></r4-item>
  <r4-item text="Duplicar" icon="⧉" r4-click="toast:Duplicado!"></r4-item>
  <r4-item divider></r4-item>
  <r4-item text="Arquivar" icon="🗄" disabled></r4-item>
  <r4-item text="Excluir" icon="🗑" danger r4-click="notify:err|Registro excluído" r4-confirm="Excluir este registro?"></r4-item>
</r4-dropdown>` },
    { title: 'HTML: alinhado à direita, colado na borda', html: `
<div style="display:flex;justify-content:flex-end">
  <r4-dropdown text="Mais" align="right" variant="primary">
    <r4-item text="Perfil" icon="👤" r4-click="toast:Perfil"></r4-item>
    <r4-item text="Configurações" icon="⚙" r4-click="toast:Configurações"></r4-item>
    <r4-item text="Sair" icon="⎋" r4-click="toast:Até logo!"></r4-item>
  </r4-dropdown>
</div>` },
    { title: 'JS: handlers e evento select', fn(el, out) {
      const dd = R4.dropdown(el, 'Exportar', [
        { text: 'CSV', icon: '📄', handler: () => R4.notify.ok('Exportando CSV...') },
        { text: 'Excel', icon: '📊', handler: () => R4.notify.ok('Exportando Excel...') },
        '-',
        { text: 'PDF (indisponível)', icon: '📕', disabled: true },
        { text: 'Ajuda', icon: '❓', href: '#ajuda' }
      ]);
      dd.on('open', () => out('menu aberto'));
      dd.on('select', (d, item) => out({ escolhido: item.text }));
    } }
  );

  /* ===== progress ===== */
  add('progress',
    { title: 'HTML: variantes e tamanhos', html: `
<r4-div column gap="3">
  <r4-progress value="35" label="Upload" ></r4-progress>
  <r4-progress value="70" label="Disco" variant="warn" size="lg"></r4-progress>
  <r4-progress value="92" label="CPU" variant="err" size="sm" striped></r4-progress>
  <r4-progress indeterminate label="Processando..." variant="info"></r4-progress>
</r4-div>` },
    { title: 'HTML: círculos', html: `
<r4-div flex gap="4" wrap align="center">
  <r4-progress type="circle" value="25" label="Meta"></r4-progress>
  <r4-progress type="circle" value="80" variant="ok" diameter="120" label="Concluído"></r4-progress>
  <r4-progress type="circle" indeterminate variant="info" diameter="72"></r4-progress>
</r4-div>` },
    { title: 'JS: progresso animado e eventos', fn(el, out) {
      const barra = R4.progress(el, 0, 'Importando clientes');
      barra.on('complete', () => { out('Concluído!'); R4.notify.ok('Importação concluída'); });
      const t = setInterval(() => {
        if (!barra.el.isConnected) return clearInterval(t);   // o exemplo foi refeito
        barra.increment(8);
        if (barra.getPercent() >= 100) clearInterval(t);
      }, 250);
    } }
  );

  /* ===== spinner ===== */
  add('spinner',
    { title: 'HTML: tamanhos e cores', html: `
<r4-div flex gap="4" align="center" wrap>
  <r4-spinner size="sm"></r4-spinner>
  <r4-spinner></r4-spinner>
  <r4-spinner size="lg" variant="ok"></r4-spinner>
  <r4-spinner text="Carregando clientes..." variant="info"></r4-spinner>
</r4-div>` },
    { title: 'JS: dentro de um botão', fn(el, out) {
      const b = R4.create({ xtype: 'button', text: 'Salvar', variant: 'primary', renderTo: el, handler: () => {
        b.setDisabled(true).setText('Salvando...');
        R4.spinner(b.el, '', { size: 'sm', variant: 'default' });
        setTimeout(() => { b.destroy(); out('Salvo!'); R4.notify.ok('Alterações salvas'); }, 1200);
      } });
    } }
  );
  add('mask',
    { title: 'Cobrir um painel enquanto carrega (clientes.json)', fn(el, out) {
      const caixa = R4.panel(el, 'Clientes', '<div id="demo-mask-grid" style="min-height:140px"></div>');
      const alvo = caixa.el.querySelector('#demo-mask-grid');
      R4.button(el, 'Recarregar', async () => {
        R4.mask(caixa, 'Buscando clientes...');
        try {
          const lista = await VitrineData.load('clientes');
          await new Promise(r => setTimeout(r, 900));
          alvo.innerHTML = '';
          R4.grid(alvo, lista.slice(0, 5), { filter: false });
          out({ carregados: 5 });
        } finally { R4.unmask(caixa); }
      }).el.style.marginTop = '8px';
    } },
    { title: 'Trocar o texto e prender o foco', fn(el, out) {
      const campo = R4.textfield(el, 'Experimente focar aqui e clicar em Mascarar');
      R4.button(el, 'Mascarar por 2 s', () => {
        const m = R4.mask(el, 'Aguarde...');
        setTimeout(() => m.update('Quase pronto...'), 800);
        setTimeout(() => { R4.unmask(el); out('máscara removida; o foco volta ao campo'); }, 2000);
      });
    } }
  );

  /* ===== skeleton ===== */
  add('skeleton',
    { title: 'HTML: formatos', html: `
<r4-div cols="3" gap="3">
  <r4-skeleton lines="4"></r4-skeleton>
  <r4-skeleton type="avatar"></r4-skeleton>
  <r4-skeleton type="card" lines="2"></r4-skeleton>
</r4-div>
<div class="r4-mt-3"></div>
<r4-skeleton type="list" rows="3"></r4-skeleton>` },
    { title: 'JS: troca o esqueleto pelo conteúdo real', async fn(el, out) {
      const sk = R4.skeleton(el, 'list', { rows: 4 });
      const clientes = await VitrineData.load('clientes');
      setTimeout(() => {
        sk.destroy();
        clientes.slice(0, 4).forEach(c => {
          const linha = R4.util.el('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' } });
          el.append(linha);
          R4.avatar(linha, c.nome);
          linha.append(R4.util.el('div', { html: '<b>' + R4.util.esc(c.nome) + '</b><br><small style="color:var(--r4-mut)">' + R4.util.esc(c.email) + '</small>' }));
        });
        out('conteúdo carregado');
      }, 1200);
    } }
  );

  /* ===== stat / stats ===== */
  add('stat',
    { title: 'HTML: formatos e variações', html: `
<r4-div cols="4" gap="3">
  <r4-stat title="Receita" value="384250.9" format="money" change="12.4" change-text="vs. mês anterior" icon="💰"></r4-stat>
  <r4-stat title="Pedidos" value="2184" format="number" change="5.1" icon="🛒" variant="primary"></r4-stat>
  <r4-stat title="Ticket médio" value="175.9" format="money" change="-2.3" icon="🎫"></r4-stat>
  <r4-stat title="Cancelamentos" value="2.1" format="percent" change="-0.8" invert change-text="queda é bom"></r4-stat>
</r4-div>` },
    { title: 'HTML: um indicador direto de kpis.json (src + key)', html: `
<r4-div cols="2" gap="3">
  <r4-stat src="${K}kpis.json" key="receita" icon="💰" variant="ok"></r4-stat>
  <r4-stat src="${K}kpis.json" key="conversao" icon="🎯" variant="info"></r4-stat>
</r4-div>` },
    { title: 'JS: atualização em tempo real', fn(el, out) {
      const s = R4.stat(el, { title: 'Visitantes agora', value: 120, format: 'number', icon: '👥', change: 0 });
      const t = setInterval(() => {
        if (!s.el.isConnected) return clearInterval(t);
        const novo = Math.round(s.value + (Math.random() - 0.4) * 30);
        s.setData({ value: novo, change: +(((novo - s.value) / s.value) * 100).toFixed(1) });
      }, 1200);
      out('muda a cada 1,2 s');
    } }
  );
  add('stats',
    { title: 'HTML: grade a partir de kpis.json', html: `<r4-stats src="${K}kpis.json"></r4-stats>` },
    { title: 'HTML: filhos <r4-stat>', html: `
<r4-stats min-width="160">
  <r4-stat title="Usuários" value="1280" format="number" change="3.2"></r4-stat>
  <r4-stat title="Armazenamento" value="734003200" format="bytes" variant="warn"></r4-stat>
  <r4-stat title="Satisfação" value="94.5" format="percent" change="1.1" variant="ok"></r4-stat>
</r4-stats>` },
    { title: 'JS: R4.stats(alvo, kpis) + ícones e variantes', async fn(el, out) {
      const kpis = await VitrineData.load('kpis');
      const icones = { receita: '💰', pedidos: '🛒', ticket: '🎫', conversao: '🎯' };
      const grade = R4.stats(el, kpis.map(k => ({ ...k, icon: icones[k.id], variant: k.variacao >= 0 ? 'ok' : 'err' })));
      out({ cartoes: grade._children.length });
    } }
  );

  /* ===== pagination ===== */
  add('pagination',
    { title: 'HTML: janela com reticências', html: `<r4-pagination total="500" page-size="10" page="12" info></r4-pagination>` },
    { title: 'JS: listando clientes (clientes.json) com pagechange', async fn(el, out) {
      const clientes = await VitrineData.load('clientes');
      const lista = R4.util.el('ul', { style: { minHeight: '120px', margin: '0 0 12px', paddingLeft: '18px' } });
      el.append(lista);
      const mostrar = (pagina, info) => {
        lista.innerHTML = clientes.slice(info.offset, info.offset + info.pageSize)
          .map(c => '<li>' + R4.util.esc(c.nome) + ' — ' + R4.util.esc(c.cidade) + '/' + R4.util.esc(c.uf) + '</li>').join('');
        out({ pagina, de: info.from, ate: info.to, total: info.total });
      };
      const pg = R4.pagination(el, clientes.length, { pageSize: 5, info: true, listeners: { pagechange: (c, p, info) => mostrar(p, info) } });
      mostrar(1, pg.getInfo());
    } },
    { title: 'JS: cancelar a troca de página (beforepagechange)', fn(el, out) {
      const pg = R4.pagination(el, 100, { pageSize: 10 });
      pg.on('beforepagechange', (c, nova) => { if (nova > 3) { R4.notify.warn('Só as 3 primeiras páginas neste exemplo'); return false; } });
      pg.on('pagechange', (c, p) => out('página ' + p));
    } }
  );

  /* ===== breadcrumb ===== */
  add('breadcrumb',
    { title: 'HTML: com href e r4-click', html: `
<r4-breadcrumb separator="›">
  <r4-crumb icon="🏠" r4-click="toast:Início">Início</r4-crumb>
  <r4-crumb href="#cadastros" r4-click="toast:Cadastros">Cadastros</r4-crumb>
  <r4-crumb href="#clientes" r4-click="toast:Clientes">Clientes</r4-crumb>
  <r4-crumb>João Souza</r4-crumb>
</r4-breadcrumb>` },
    { title: 'JS: trilha montada a partir de arvore.json', async fn(el, out) {
      const arvore = await VitrineData.load('arvore');
      const achar = (nos, id, trilha = []) => {
        for (const n of nos) {
          const t = [...trilha, n];
          if (n.id === id) return t;
          const r = n.children && achar(n.children, id, t);
          if (r) return r;
        }
      };
      const caminho = achar(arvore, 'rel-m') || [];
      const bc = R4.breadcrumb(el, [{ text: 'Painel', handler: () => out('voltou ao painel') }, ...caminho.map(n => ({ text: n.text, handler: () => out('clicou em ' + n.text) }))], { separator: '/' });
      bc.on('itemclick', (c, item) => out({ item: item.text }));
    } }
  );

  /* ===== steps ===== */
  add('steps',
    { title: 'HTML: etapas com conteúdo', html: `
<r4-steps active="1" clickable>
  <r4-step title="Conta" text="Dados de acesso"><p>Informe e-mail e senha.</p></r4-step>
  <r4-step title="Endereço" text="Onde entregar"><p>Informe o CEP.</p></r4-step>
  <r4-step title="Pagamento" text="Forma de pagar"><p>Escolha cartão ou boleto.</p></r4-step>
  <r4-step title="Revisão"><p>Confira tudo antes de confirmar.</p></r4-step>
</r4-steps>` },
    { title: 'JS: assistente com Voltar/Avançar, erro e conclusão', fn(el, out) {
      const st = R4.steps(el, ['Dados', 'Plano', 'Confirmação'].map((t, i) => ({ title: t, html: '<p>Conteúdo da etapa ' + (i + 1) + '.</p>' })));
      const barra = R4.util.el('div', { style: { display: 'flex', gap: '8px', marginTop: '10px' } });
      el.append(barra);
      R4.button(barra, 'Voltar', () => st.prev());
      R4.button(barra, 'Avançar', () => st.next()).el.classList.add('r4-btn-primary');
      R4.button(barra, 'Marcar erro na etapa atual', () => st.setError(st.getActive(), true));
      st.on('stepchange', (s, para, de) => out({ de, para }));
      st.on('finish', () => { out('concluído'); R4.notify.ok('Cadastro concluído!'); });
    } },
    { title: 'HTML: vertical', html: `
<r4-steps orientation="vertical" active="2">
  <r4-step title="Pedido recebido" text="12/11 às 09:10"></r4-step>
  <r4-step title="Separação" text="12/11 às 11:40"></r4-step>
  <r4-step title="Em transporte" text="Previsão: 15/11"></r4-step>
  <r4-step title="Entregue"></r4-step>
</r4-steps>` }
  );

  /* ===== timeline ===== */
  add('timeline',
    { title: 'HTML: itens manuais', html: `
<r4-timeline>
  <r4-item title="Pedido criado" date="2026-11-01" icon="🛒">Cliente fez o pedido #1021.</r4-item>
  <r4-item title="Pagamento aprovado" date="2026-11-02" icon="✔" variant="ok">Cartão final 4242.</r4-item>
  <r4-item title="Atraso na entrega" date="2026-11-05" icon="⚠" variant="warn">Transportadora informou 2 dias.</r4-item>
  <r4-item title="Entrega cancelada" date="2026-11-07" icon="✖" variant="err">Endereço não encontrado.</r4-item>
</r4-timeline>` },
    { title: 'HTML: direto de eventos.json (mais recentes primeiro)', html: `<r4-timeline src="${K}eventos.json" order="desc" limit="6"></r4-timeline>` },
    { title: 'JS: eventos com cor por tipo', async fn(el, out) {
      const eventos = await VitrineData.load('eventos');
      const cor = { 'Estoque baixo': 'warn', 'Pagamento aprovado': 'ok', 'Pedido enviado': 'info' };
      const tl = R4.timeline(el, eventos.slice(0, 8).map(e => ({ ...e, variant: cor[e.titulo] || 'default' })), { order: 'asc' });
      R4.button(el, 'Adicionar evento', () => tl.add({ title: 'Evento novo', text: 'Criado agora', date: new Date().toISOString().slice(0, 10), variant: 'primary' })).el.style.marginTop = '8px';
    } }
  );

  /* ===== alert ===== */
  add('alert',
    { title: 'HTML: variantes', html: `
<r4-div column gap="2">
  <r4-alert variant="info" title="Informação">Sua sessão expira em 10 minutos.</r4-alert>
  <r4-alert variant="ok" closable>Cadastro salvo com sucesso.</r4-alert>
  <r4-alert variant="warn" title="Atenção" closable>Existem 3 pedidos sem pagamento.</r4-alert>
  <r4-alert variant="err" title="Erro" closable>Não foi possível conectar ao servidor.</r4-alert>
</r4-div>` },
    { title: 'JS: R4.callout(alvo, texto, opções) e evento close', fn(el, out) {
      const a = R4.callout(el, 'Esta é uma mensagem fechável.', { variant: 'warn', title: 'Aviso', closable: true });
      a.on('close', () => out('alerta fechado'));
      R4.callout(el, 'Operação concluída.', 'ok');
    } }
  );

  /* ===== badge / tag ===== */
  add('badge',
    { title: 'HTML: variantes, pill e dot', html: `
<r4-div flex gap="2" wrap align="center">
  <r4-badge>Padrão</r4-badge>
  <r4-badge variant="primary">Novo</r4-badge>
  <r4-badge variant="ok" pill>Ativo</r4-badge>
  <r4-badge variant="warn" dot>Pendente</r4-badge>
  <r4-badge variant="err" pill dot>Inativo</r4-badge>
  <r4-badge variant="info" outline>Beta</r4-badge>
  <r4-badge variant="err" pill count="128" max="99"></r4-badge>
  <r4-badge variant="ok" dot label="Online"></r4-badge>
</r4-div>` },
    { title: 'JS: status dos clientes (clientes.json)', async fn(el, out) {
      const clientes = await VitrineData.load('clientes');
      const cor = { ativo: 'ok', pendente: 'warn', inativo: 'err' };
      const contagem = {};
      clientes.forEach(c => contagem[c.status] = (contagem[c.status] || 0) + 1);
      Object.entries(contagem).forEach(([status, n]) => {
        R4.badge(el, status, { variant: cor[status] || 'default', dot: true, pill: true });
        R4.badge(el, '', { count: n, variant: cor[status] || 'default' });
        el.append(' ');
      });
      out(contagem);
    } }
  );
  add('tag',
    { title: 'HTML: tags', html: `
<r4-div flex gap="2" wrap>
  <r4-tag>Design</r4-tag><r4-tag variant="primary" icon="#">frontend</r4-tag><r4-tag variant="ok" closable>Aprovado</r4-tag><r4-tag variant="warn" outline>Rascunho</r4-tag>
</r4-div>` },
    { title: 'JS: tags removíveis com evento close', fn(el, out) {
      ['Maçã', 'Banana', 'Cenoura', 'Laranja'].forEach(nome => {
        const t = R4.tag(el, nome, { closable: true, variant: 'primary' });
        t.on('close', () => out('removida: ' + nome));
        el.append(' ');
      });
    } }
  );

  /* ===== avatar ===== */
  add('avatar',
    { title: 'HTML: iniciais, tamanhos e presença', html: `
<r4-div flex gap="3" align="center" wrap>
  <r4-avatar name="Maria Souza" size="sm"></r4-avatar>
  <r4-avatar name="João Pedro da Silva"></r4-avatar>
  <r4-avatar name="Ana" size="lg" status="online"></r4-avatar>
  <r4-avatar name="Carlos Eduardo" size="lg" shape="rounded" status="busy"></r4-avatar>
  <r4-avatar name="Fernanda Lima" size="xl" shape="square" status="away"></r4-avatar>
  <r4-avatar size="lg"></r4-avatar>
</r4-div>` },
    { title: 'JS: lista de usuários (usuarios.json) e imagem com fallback', async fn(el, out) {
      const usuarios = await VitrineData.load('usuarios');
      usuarios.slice(0, 8).forEach(u => { R4.avatar(el, u.nome); el.append(' '); });
      const quebrada = R4.avatar(el, 'Imagem inválida', 'data:image/png;base64,invalido');
      quebrada.on('imgerror', () => out('imagem falhou: usando as iniciais'));
    } }
  );

  /* ===== emptystate ===== */
  add('emptystate',
    { title: 'HTML: com botão de ação', html: `
<r4-emptystate icon="🔍" title="Nenhum cliente encontrado" text="Tente outro termo de busca ou cadastre um novo cliente." action-text="Novo cliente" action-click="notify:ok|Abrindo cadastro..."></r4-emptystate>` },
    { title: 'JS: lista vazia depois de filtrar (clientes.json)', async fn(el, out) {
      const clientes = await VitrineData.load('clientes');
      const campo = R4.textfield(el, 'Buscar cliente (tente "zzz")');
      const area = R4.util.el('div', { style: { marginTop: '8px' } });
      el.append(area);
      let atual;
      const desenhar = q => {
        atual && atual.destroy(); area.replaceChildren();
        const achados = clientes.filter(c => c.nome.toLowerCase().includes(q.toLowerCase()));
        if (!achados.length) {
          atual = R4.emptystate(area, 'Nada para "' + q + '"', { text: 'Nenhum cliente corresponde à busca.', icon: '🔍', actionText: 'Limpar busca', handler: () => { campo.setValue(''); desenhar(''); }, compact: true });
        } else { area.textContent = achados.length + ' cliente(s) encontrados'; }
        out({ achados: achados.length });
      };
      campo.on('change', (f, v) => desenhar(v));
      desenhar('');
    } }
  );

  /* ===== tooltip ===== */
  add('tooltip',
    { title: 'HTML: atributo r4-tip em qualquer elemento', html: `
<r4-div flex gap="3" wrap>
  <button class="r4-btn" r4-tip="Dica em cima (padrão)">Em cima</button>
  <button class="r4-btn" r4-tip="Dica embaixo" r4-tip-pos="bottom">Embaixo</button>
  <button class="r4-btn" r4-tip="Dica à esquerda" r4-tip-pos="left">Esquerda</button>
  <button class="r4-btn" r4-tip="Dica à direita" r4-tip-pos="right">Direita</button>
  <a href="#" r4-tip="Também funciona com o teclado (Tab)">Link com dica</a>
</r4-div>` },
    { title: 'HTML: componente <r4-tooltip>', html: `
<p>Passe o mouse sobre <r4-tooltip text="Application Programming Interface" pos="bottom"><b>API</b></r4-tooltip>
ou sobre <r4-tooltip text="Linguagem de marcação"><b>HTML</b></r4-tooltip>.</p>` },
    { title: 'JS: R4.tip.attach em elementos criados depois', fn(el, out) {
      const b = R4.button(el, 'Passe o mouse aqui', () => out('clicou'));
      R4.tip.attach(b.el, 'Dica criada por JavaScript', 'bottom');
    } }
  );

  /* ===== notify (módulo) ===== */
  add('notify',
    { title: 'HTML: r4-click="notify:..."', html: `
<r4-div flex gap="2" wrap>
  <r4-button r4-click="notify:Mensagem simples">Info</r4-button>
  <r4-button variant="primary" r4-click="notify:ok|Salvo com sucesso!">Sucesso</r4-button>
  <r4-button r4-click="notify:warn|Atenção: verifique os dados">Aviso</r4-button>
  <r4-button variant="danger" r4-click="notify:err|Falha ao salvar">Erro</r4-button>
</r4-div>` },
    { title: 'JS: tipos, ações e cantos', fn(el, out) {
      const b = (t, f) => { R4.button(el, t, f).el.style.margin = '0 8px 8px 0'; };
      b('Com título', () => R4.notify({ title: 'Novo pedido', text: 'Pedido #1022 recebido de Ana Souza.', type: 'ok' }));
      b('Com ações', () => R4.notify({ title: 'Arquivo removido', text: 'Deseja desfazer?', type: 'warn', duration: 8000,
        actions: [{ text: 'Desfazer', handler: () => R4.notify.ok('Restaurado!') }, { text: 'Ignorar' }] }));
      b('Fixa (duration 0)', () => R4.notify({ text: 'Esta fica até você fechar.', duration: 0, type: 'info' }));
      b('Canto inferior esquerdo', () => R4.notify({ text: 'Canto inferior esquerdo', position: 'bottom-left' }));
      b('Rajada de 8 (limite 5)', () => { for (let i = 1; i <= 8; i++) R4.notify('Notificação ' + i); });
      b('Fechar todas', () => R4.notify.closeAll());
      R4.notify.config({ max: 5 });
      out(R4.notify.config());
    } }
  );
})();
