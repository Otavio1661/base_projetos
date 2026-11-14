/**
 * Gera os arquivos de public/showcase/vitrineData/*.json (dados de teste da vitrine).
 * Determinístico (PRNG com semente): rodar de novo produz os mesmos arquivos.
 *   node tools/gerar-vitrine-data.js
 */
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'public', 'showcase', 'vitrineData');
fs.mkdirSync(OUT, { recursive: true });

let seed = 20261109;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = a => a[int(0, a.length - 1)];
const money = (a, b) => +(a + rnd() * (b - a)).toFixed(2);
const pad = n => String(n).padStart(2, '0');
const date = (y0, y1) => `${int(y0, y1)}-${pad(int(1, 12))}-${pad(int(1, 28))}`;
const save = (name, data) => fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify(data, null, name === 'grande' ? 0 : 1));

const nomes = ['Ana', 'Bruno', 'Carla', 'Diego', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João', 'Karina', 'Lucas', 'Mariana', 'Nicolas', 'Olívia', 'Pedro', 'Rafaela', 'Samuel', 'Tatiana', 'Vinícius'];
const sobrenomes = ['Silva', 'Souza', 'Oliveira', 'Santos', 'Lima', 'Pereira', 'Ferreira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento', 'Carvalho'];
const estados = [['AC', 'Acre'], ['AL', 'Alagoas'], ['AP', 'Amapá'], ['AM', 'Amazonas'], ['BA', 'Bahia'], ['CE', 'Ceará'], ['DF', 'Distrito Federal'], ['ES', 'Espírito Santo'], ['GO', 'Goiás'], ['MA', 'Maranhão'], ['MT', 'Mato Grosso'], ['MS', 'Mato Grosso do Sul'], ['MG', 'Minas Gerais'], ['PA', 'Pará'], ['PB', 'Paraíba'], ['PR', 'Paraná'], ['PE', 'Pernambuco'], ['PI', 'Piauí'], ['RJ', 'Rio de Janeiro'], ['RN', 'Rio Grande do Norte'], ['RS', 'Rio Grande do Sul'], ['RO', 'Rondônia'], ['RR', 'Roraima'], ['SC', 'Santa Catarina'], ['SP', 'São Paulo'], ['SE', 'Sergipe'], ['TO', 'Tocantins']];
const cidades = { SP: ['São Paulo', 'Campinas', 'Santos'], RJ: ['Rio de Janeiro', 'Niterói'], MG: ['Belo Horizonte', 'Uberlândia'], PR: ['Curitiba', 'Londrina'], RS: ['Porto Alegre', 'Caxias do Sul'], BA: ['Salvador', 'Feira de Santana'], SC: ['Florianópolis', 'Joinville'], PE: ['Recife', 'Olinda'], CE: ['Fortaleza'], GO: ['Goiânia'] };
const ufsComCidade = Object.keys(cidades);
const semAcento = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// clientes
const clientes = Array.from({ length: 60 }, (_, i) => {
  const n = pick(nomes), s = pick(sobrenomes), uf = pick(ufsComCidade);
  return { id: i + 1, nome: `${n} ${s}`, email: `${semAcento(n)}.${semAcento(s)}${i + 1}@exemplo.com`, cidade: pick(cidades[uf]), uf,
    status: pick(['ativo', 'ativo', 'ativo', 'inativo', 'pendente']), plano: pick(['Básico', 'Pro', 'Empresa']), criadoEm: date(2024, 2026), saldo: money(-300, 9000) };
});
save('clientes', clientes);

// produtos
const cats = ['Periféricos', 'Monitores', 'Notebooks', 'Áudio', 'Redes', 'Acessórios'];
const prods = ['Mouse', 'Teclado', 'Monitor', 'Notebook', 'Headset', 'Webcam', 'Roteador', 'Cabo HDMI', 'Hub USB', 'SSD', 'Pen drive', 'Caixa de som'];
const produtos = Array.from({ length: 80 }, (_, i) => ({
  id: i + 1, sku: 'SKU-' + String(1000 + i), nome: `${pick(prods)} ${pick(['Pro', 'Lite', 'Max', 'Plus', 'X'])} ${int(1, 9)}00`,
  categoria: pick(cats), preco: money(19, 6500), estoque: int(0, 300), ativo: rnd() > 0.15, atualizadoEm: date(2026, 2026) }));
save('produtos', produtos);

// pedidos
const pedidos = Array.from({ length: 120 }, (_, i) => {
  const c = pick(clientes);
  return { id: 5000 + i, clienteId: c.id, cliente: c.nome, itens: int(1, 8), total: money(35, 8200),
    status: pick(['pago', 'pago', 'pendente', 'enviado', 'cancelado']), pagamento: pick(['PIX', 'Cartão', 'Boleto']), data: date(2026, 2026) };
});
save('pedidos', pedidos);

// usuarios
save('usuarios', Array.from({ length: 20 }, (_, i) => {
  const n = pick(nomes), s = pick(sobrenomes);
  return { id: i + 1, nome: `${n} ${s}`, email: `${semAcento(n)}.${semAcento(s)}@empresa.com`, perfil: pick(['admin', 'editor', 'leitor']), ativo: rnd() > 0.2, ultimoAcesso: `${date(2026, 2026)}T${pad(int(0, 23))}:${pad(int(0, 59))}:00` };
}));

// árvore de menu
save('arvore', [
  { id: 'dash', text: 'Painel' },
  { text: 'Cadastros', children: [{ id: 'cli', text: 'Clientes', badge: '60' }, { id: 'prod', text: 'Produtos', badge: '80' }, { id: 'usr', text: 'Usuários' }] },
  { text: 'Vendas', children: [{ id: 'ped', text: 'Pedidos' }, { text: 'Relatórios', children: [{ id: 'rel-m', text: 'Mensal' }, { id: 'rel-c', text: 'Por categoria' }] }] },
  { text: 'Configurações', expanded: false, children: [{ id: 'cfg-g', text: 'Geral' }, { id: 'cfg-s', text: 'Segurança' }] }
]);

// séries para gráficos
const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
save('vendas-mensais', meses.map((m, i) => ({ mes: m, receita: money(18000, 52000) + i * 800, despesa: money(9000, 30000), pedidos: int(80, 320) })));
save('vendas-categoria', cats.map(c => ({ categoria: c, valor: money(8000, 60000) })));
const base = new Date(2026, 7, 11);
save('series-diarias', Array.from({ length: 90 }, (_, i) => {
  const d = new Date(base.getTime() + i * 86400000);
  return { data: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, visitas: int(300, 1800) + i * 6, conversoes: int(10, 120) };
}));
save('kpis', [
  { id: 'receita', titulo: 'Receita', valor: 384250.9, variacao: 12.4, formato: 'money' },
  { id: 'pedidos', titulo: 'Pedidos', valor: 2184, variacao: 5.1, formato: 'number' },
  { id: 'ticket', titulo: 'Ticket médio', valor: 175.9, variacao: -2.3, formato: 'money' },
  { id: 'conversao', titulo: 'Conversão', valor: 3.8, variacao: 0.6, formato: 'percent' }
]);

// opções para selects
save('estados', estados.map(([valor, texto]) => ({ valor, texto })));
save('opcoes', {
  planos: ['Básico', 'Pro', 'Empresa'].map(t => ({ valor: t.toLowerCase(), texto: t })),
  status: ['ativo', 'inativo', 'pendente'].map(t => ({ valor: t, texto: t[0].toUpperCase() + t.slice(1) })),
  perfis: ['admin', 'editor', 'leitor'].map(t => ({ valor: t, texto: t[0].toUpperCase() + t.slice(1) })),
  categorias: cats.map(t => ({ valor: semAcento(t), texto: t }))
});

// linha do tempo
save('eventos', Array.from({ length: 30 }, (_, i) => ({ id: i + 1, titulo: pick(['Pedido criado', 'Pagamento aprovado', 'Pedido enviado', 'Cliente cadastrado', 'Estoque baixo']), descricao: 'Evento de exemplo #' + (i + 1), data: date(2026, 2026) })));

// volume (teste de desempenho / virtualização)
save('grande', Array.from({ length: 5000 }, (_, i) => ({ id: i + 1, nome: `Registro ${i + 1}`, valor: money(1, 9999), data: date(2020, 2026), status: pick(['ok', 'erro', 'alerta']) })));

console.log('vitrineData gerado em', OUT);
