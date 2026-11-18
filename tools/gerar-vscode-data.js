/**
 * Gera o arquivo de AUTOCOMPLETAR das tags <r4-*> para o VS Code (HTML custom data):
 *
 *     JSDOM_PATH=/caminho/node_modules/jsdom node tools/gerar-vscode-data.js
 *
 * Carrega a libr4 (na ordem do carregador libr4.js) dentro de um DOM simulado, lê o registro
 * (R4.registry + meta.props) e escreve docs/vscode/r4.html-data.json.
 * Node e jsdom só para DESENVOLVIMENTO (a lib não depende deles). O arquivo gerado vai no Git.
 * Uso no VS Code: veja docs/vscode/LEIA-ME.md.
 */
const fs = require('fs');
const path = require('path');

let jsdom;
try { jsdom = require(process.env.JSDOM_PATH || 'jsdom'); }
catch (e) { console.error('jsdom não encontrado. Rode com JSDOM_PATH=/caminho/para/jsdom (só dev).'); process.exit(2); }

const raiz = path.join(__dirname, '..');
const lib = path.join(raiz, 'public', 'libr4');
const loader = fs.readFileSync(path.join(lib, 'libr4.js'), 'utf8');
const modulos = (loader.match(/\[\s*('[a-z0-9-]+'\s*,?\s*)+\]/) || [''])[0].match(/[a-z0-9-]+/g) || [];
if (!modulos.length) { console.error('Lista de módulos não encontrada em libr4.js'); process.exit(1); }

const dom = new jsdom.JSDOM('<!doctype html><html><head></head><body></body></html>', { runScripts: 'outside-only', url: 'http://localhost/' });
const w = dom.window;
w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
w.fetch = () => Promise.reject(new Error('sem rede'));
try { Object.defineProperty(w, 'crypto', { value: require('crypto').webcrypto, configurable: true }); } catch (e) { /* ignora */ }
w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder; w.structuredClone = w.structuredClone || structuredClone;
const log = console.warn; console.warn = () => {};
for (const m of ['core', ...modulos.filter(x => x !== 'core')]) {
  const f = path.join(lib, m + '.js');
  if (!fs.existsSync(f)) continue;
  try { w.eval(fs.readFileSync(f, 'utf8')); } catch (e) { log('aviso: módulo ' + m + ' falhou ao carregar: ' + e.message); }
}
console.warn = log;
const R4 = w.R4;
if (!R4 || !R4.registry) { console.error('R4 não carregou'); process.exit(1); }

const kebab = s => s.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
const limpa = s => String(s || '').replace(/\s+/g, ' ').trim();

const tags = [];
for (const [x, e] of Object.entries(R4.registry)) {
  if (!e.meta || e.meta.hidden) continue;
  const defs = R4.configDefaults ? R4.configDefaults(x) : {};
  const props = {};
  (e.meta.props || []).forEach(p => String(p.name || '').split(/[\s/,|]+/).forEach(n => { if (n && !props[n.replace(/\(.*$/, '')]) props[n.replace(/\(.*$/, '')] = p; }));
  const attributes = Object.keys(defs).filter(k => !['items', 'listeners'].includes(k)).map(k => {
    const p = props[k] || {};
    const a = { name: kebab(k), description: limpa([p.desc, p.type && '(' + p.type + ')', p.default !== undefined && p.default !== '' ? 'padrão: ' + p.default : ''].filter(Boolean).join(' ')) };
    if (typeof defs[k] === 'boolean') a.values = [{ name: 'true' }, { name: 'false' }];
    return a;
  });
  tags.push({ name: 'r4-' + x, description: limpa(e.meta.description || e.meta.title), attributes });
}
// filhos estruturais (não são componentes, mas aparecem dentro de outras tags)
[['r4-col', 'Coluna do r4-grid. Atributos: field, header, width, align, sortable, format (money|number|date|bytes|bool|upper).', ['field', 'header', 'width', 'align', 'sortable', 'format', 'editable', 'summary']],
 ['r4-node', 'Nó do r4-treepanel (aninhável).', ['id', 'text', 'badge', 'expanded']],
 ['r4-tab', 'Aba do r4-tabpanel.', ['title', 'closable', 'key']],
 ['r4-tbar', 'Barra superior do r4-panel.', []], ['r4-fill', 'Empurra os itens seguintes da toolbar para a direita.', []], ['r4-sep', 'Separador da toolbar.', []],
 ['r4-option', 'Opção de r4-select / r4-choice.', ['value', 'label', 'selected', 'disabled']],
 ['r4-item', 'Item de r4-accordion, r4-dropdown ou r4-timeline.', ['title', 'text', 'icon', 'open', 'disabled', 'divider']],
 ['r4-step', 'Etapa do r4-steps.', ['title']], ['r4-crumb', 'Item do r4-breadcrumb.', ['text', 'href']],
 ['r4-series', 'Série do r4-chart.', ['key', 'label', 'color', 'type']],
 ['r4-item-template', 'Modelo de item do r4-repeater (contém os campos).', []]
].forEach(([name, description, attrs]) => { if (!tags.some(t => t.name === name)) tags.push({ name, description, attributes: attrs.map(a => ({ name: a })) }); });

const globalAttributes = [
  { name: 'r4-click', description: 'Ação sem JavaScript: acao:alvo (modal, close, reload, toggle, copy, alert, toast, notify, goto, anim, salvar, reset, ...). Combine com ";".', values: Object.keys(R4.actions || {}).map(a => ({ name: a + ':' })) },
  { name: 'r4-confirm', description: 'Pede confirmação antes de executar o r4-click.' },
  { name: 'r4-anim', description: 'Animação de entrada ao aparecer na tela.', values: ['fade', 'fade-up', 'fade-down', 'fade-left', 'fade-right', 'zoom-in', 'zoom-out'].map(name => ({ name })) },
  { name: 'r4-delay', description: 'Atraso da animação (ms).' }, { name: 'r4-duration', description: 'Duração da animação (ms).' },
  { name: 'r4-once', description: 'false = repete a animação cada vez que reaparece.' },
  { name: 'r4-hover', description: 'Efeito ao passar o mouse.', values: ['lift', 'grow', 'glow'].map(name => ({ name })) },
  { name: 'r4-bind', description: 'Liga um campo do form a um alvo: texto:campo; valor:campo; attr:atributo:campo; var:--css:campo; classe:nome:expressão.' },
  { name: 'r4-show-if', description: 'Mostra o elemento conforme o estado do form. Ex.: estilo=gradiente && !oculto.' },
  { name: 'r4-enable-if', description: 'Habilita o elemento conforme o estado do form.' },
  { name: 'r4-scope', description: 'Seletor (#id) do r4-form usado por r4-bind/r4-show-if fora do formulário.' },
  { name: 'r4-ignore', description: 'Não ativa tags r4-* dentro deste elemento (conteúdo de terceiros).' },
  { name: 'r4-tip', description: 'Tooltip com este texto.' }, { name: 'r4-tip-pos', description: 'Posição da tooltip.', values: ['top', 'bottom', 'left', 'right'].map(name => ({ name })) },
  { name: 'r4-i18n', description: 'Chave de tradução (R4.t) aplicada ao elemento; "placeholder:chave" traduz um atributo.' }
];

const saida = path.join(raiz, 'docs', 'vscode');
fs.mkdirSync(saida, { recursive: true });
fs.writeFileSync(path.join(saida, 'r4.html-data.json'), JSON.stringify({ version: 1.1, tags, globalAttributes }, null, 1));
console.log(`docs/vscode/r4.html-data.json: ${tags.length} tags, ${globalAttributes.length} atributos globais, módulos carregados: ${modulos.length}`);
w.close();
