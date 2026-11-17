# Painéis declarativos com a libr4

Guia da camada reativa (`public/libr4/reactive.js`), das peças de painel (`public/libr4/admin.js`) e do
protocolo da prévia (`public/libr4/preview.js`). Objetivo: montar painéis administrativos **só com tags
`<r4-*>` e atributos**, sem JavaScript escrito à mão. Tudo é JS puro, sem dependências, sem `eval`/`new Function`,
compatível com CSP sem `unsafe-inline` em scripts.

Exemplos editáveis: vitrine → grupo **HTML declarativo** ("Estado e bindings", "R4.preview"), **Formulários**
(`repeater`, `colorfield`, `choice`), **Interface** (`phonepreview`) e **Receitas → Painel administrativo declarativo**.

---

## 1. Estado do formulário

Todo `<r4-form>` tem um **estado**: os valores dos campos por `name` (inclusive `colorfield`, `choice`,
`repeater`, `filedrop` com `name`, campos desabilitados), relidos **a cada digitação** (`input`, `change`,
mudança de campo r4, `setValues`, `reset`, `load`).

- Atualização **em lote**: no máximo uma passada por quadro (`requestAnimationFrame`), e só nos elementos que
  dependem dos campos que mudaram (índice campo → elementos).
- Cada item de `<r4-repeater>` também tem o seu estado (os campos do próprio item).
- O estado é destruído junto com o form (ouvintes e índices liberados).

```js
const st = R4.state('#perfil');          // ou R4.state(formComponente) / R4.state(elemento)
st.get('nome');                           // valor atual (lê na hora se houver atualização pendente)
st.set('plano', 'pro');                   // setValue no campo + atualiza os dependentes
st.values();                              // cópia de todos os valores
st.on('change', (estado, campos, valores) => { /* campos = nomes que mudaram nesta passada */ });
st.refresh();                             // força reaplicar todos os bindings
```

## 2. Atributos

| Atributo | O que faz |
|---|---|
| `r4-bind="..."` | Liga texto/valor/atributo/variável CSS/classe a campos. Vários separados por `;` (máx. 20). |
| `r4-show-if="expressão"` | `hidden` quando a expressão é falsa. |
| `r4-enable-if="expressão"` | Habilita/desabilita: `setDisabled` do componente r4, `disabled` nativo (inclusive `<fieldset>`) ou `aria-disabled` + `.r4-disabled`. |
| `r4-scope="#idDoForm"` | Liga o elemento **e tudo dentro dele** a um form que não é ancestral. Sem ele vale o form (ou item de repeater) mais próximo. O form pode aparecer depois (o binding espera). |

Funcionam em qualquer elemento e nas tags `<r4-*>` (o atributo vai para o elemento do componente).
`R4.scan` (automático para conteúdo inserido depois) ativa os novos elementos. Dentro de `r4-ignore` nada é ativado.

### 2.1 Sintaxe do `r4-bind`

| Forma | Efeito |
|---|---|
| `texto:campo` / `texto:campo\|reserva` | `textContent`. Vazio usa a reserva. Lista simples vira `a, b`; lista de objetos (repeater) vira `a b; c d`; `true` vira "Sim". |
| `texto:#campo` | Quantidade: itens do repeater, letras do texto. |
| `valor:campo` | Copia para um `<input>` (`.value`) ou campo r4 (`setValue`). |
| `attr:nome:campo\|reserva` | Só `title`, `alt`, `aria-label`, `placeholder`, `href`, `src`. `href`/`src` passam por `R4.util.safeUrl` (`javascript:`, `vbscript:`, `data:text/html`... são recusados com aviso). Vazio remove o atributo. |
| `var:--nome:campo[:unidade]` | `style.setProperty('--nome', valor)` com valor **revalidado** (ver 6). A unidade opcional (`px`, `rem`, `%`...) é acrescentada a número puro: `var:--raio:raio:px`. |
| `classe:nome:expressão` | Liga/desliga a classe. O nome precisa ser `[A-Za-z_-][\w-]*`. |

Também valem os apelidos em inglês: `text`, `value`, `class`.

```html
<r4-form id="cartao">
  <r4-textfield name="nome" label="Nome"></r4-textfield>
  <r4-colorfield name="cor" label="Cor"></r4-colorfield>
  <r4-select name="plano" label="Plano" options='["free","pro"]'></r4-select>
</r4-form>
<div r4-scope="#cartao" r4-bind="var:--cor:cor; classe:destaque:plano=pro">
  <b r4-bind="texto:nome|Seu nome; attr:title:nome"></b>
  <span r4-show-if="#nome>20">Nome longo!</span>
</div>
```

### 2.2 Gramática das expressões

Mini-parser próprio (descida recursiva), **sem `eval`**, sem chamadas de função e sem acesso a propriedades:

```
expressão  := ou
ou         := e ( '||' e )*
e          := unário ( '&&' unário )*
unário     := '!' unário | '(' expressão ')' | comparação
comparação := campo [ operador valor ]
campo      := ['#'] nome          nome = [A-Za-z_][A-Za-z0-9_.-]*   ('#' = quantidade)
operador   := '=' | '==' | '!=' | '>' | '<' | '>=' | '<=' | 'in'
valor      := 'texto entre aspas' | texto até && || ) ou o fim     (in: lista separada por vírgula)
```

| Expressão | Verdadeira quando |
|---|---|
| `campo` | preenchido: não é `null`, `''` (só espaços), `false`, `0`, `NaN` nem lista vazia |
| `!campo` | o contrário |
| `campo=valor` / `campo!=valor` | igual/diferente como texto (números comparam como número: `qtd=3` casa `3.0`); em lista, "contém" |
| `campo>n`, `<`, `>=`, `<=` | comparação numérica (aceita vírgula decimal); lista compara a quantidade |
| `campo in a,b,c` | valor é um dos itens (`'com espaço'` entre aspas) |
| `#campo>=3` | quantidade de itens/letras |

Limites: 300 caracteres, 8 níveis de parênteses, nomes `__proto__`/`constructor`/`prototype` recusados.
**Expressão inválida nunca lança**: vale falso e gera **um** aviso no console com a causa e a sintaxe
(ex.: `a and b` → "use && no lugar de "and""; `alert(1)` → "chamadas de função não são permitidas").
Teste no console: `R4.reactive.evaluate('qtd>10 && plano in free,pro', {qtd: 12, plano: 'pro'})`.

### 2.3 Avisos de digitação

- Campo inexistente no form: `campo "emial" não existe no form #perfil ... — quis dizer "email"?` (uma vez).
- Atributo parecido com os da camada: `atributo desconhecido "r4-show-iff" — quis dizer "r4-show-if"?`.
- Tipo de binding desconhecido (`txt:` → sugere `texto`), atributo fora da allowlist, nome de classe/variável inválido.
- Binding fora de form sem `r4-scope`.

## 3. Formulário carregado e salvo por atributos

```html
<r4-form id="perfil" src="/api/eu" root="retorno" action="/api/perfil" method="put" encrypt
         success-text="Perfil salvo!" autosave-ms="0">
  ...campos...
  <r4-button type="submit">Salvar</r4-button>
</r4-form>
<r4-button r4-click="recarregar:#perfil">Recarregar</r4-button>
<r4-button r4-click="salvar:#perfil">Salvar</r4-button>
```

| Atributo | Comportamento |
|---|---|
| `src` | GET JSON ao montar. Aceita `{retorno:{...}}`, `{data:{...}}` ou o objeto puro; `root="dados.perfil"` escolhe um caminho. Preenche com `setValues` (os valores viram o "original" de `reset`/`isDirty`) e dispara `load(form, valores, corpo)`. Durante a busca: `aria-busy` + "Carregando...". Erro (HTTP fora de 2xx, `{status ≥ 400}`, JSON inválido): mensagem com **Tentar de novo**, valores atuais mantidos, `loaderror(form, erro)`. Mesmo tratamento do grid. |
| `action` / `method` / `encrypt` | Envio JSON (já existia). Com `encrypt`, o corpo vai cifrado (`R4.crypto`) com AAD = **método + caminho**. Respostas 422 `{erros:{campo: msg}}` vão para os campos; o resto para a mensagem geral. Eventos `success` / `failure`. |
| `notify` | Padrão ligado: além da mensagem no form, avisa sucesso (`success-text` ou "Alterações salvas.") e erro com `R4.notify`. `notify="false"` desliga. |
| `autosave-ms` / `autosave-url` | Rascunho: N ms depois da última mudança, se o form mudou e está válido, envia em silêncio para `autosave-url` (ou `action`) e dispara `autosave(form, ok, resposta)`. Padrão `0` (desligado). |

Ações: `salvar[:#id]` (= `submit`), `reset[:#id]`, `recarregar:#id` (qualquer componente com `reload()`: form com `src`, grid...).
Campo inválido dentro de uma aba inativa ou de um fieldset recolhido: a aba/fieldset é aberta antes do foco.

## 4. Componentes

### `<r4-repeater>` — lista editável

```html
<r4-repeater name="horarios" label="Horários" min="0" max="4" item-title="{dias} {inicio}–{fim}" add-text="Adicionar horário">
  <r4-item-template>
    <r4-formrow>
      <r4-textfield name="dias" label="Dias" required></r4-textfield>
      <r4-textfield name="inicio" label="Abre" input-type="time"></r4-textfield>
      <r4-textfield name="fim" label="Fecha" input-type="time"></r4-textfield>
    </r4-formrow>
    <small r4-bind="texto:dias"></small>   <!-- enxerga o PRÓPRIO item -->
  </r4-item-template>
</r4-repeater>
```

- Valor: array de objetos (`[{dias, inicio, fim}]`), só com os `name` do template (chaves `__proto__`/`constructor` ignoradas).
  Itens iniciais por `value='[...]'`, `setValue` ou `form.setValues`/`src`.
- `min`/`max` (0 = até **100**, limite absoluto; arrays maiores são cortados com aviso). `min` já cria os itens.
- Adicionar, remover, subir/descer (botões com `aria-label` "Subir Seg 08:00"), **Alt+↑/↓** em qualquer campo do
  item, arrastar pela alça. Anúncios para leitor de tela (região `aria-live`).
- Validação por item (erros nos campos do item) + `required` (pelo menos 1) + `min`/`max`.
- Eventos `add`, `remove`, `move`, `change`. Por JS: `template` (string) ou `fields: [{type, name, label}]`;
  `add(valores)`, `remove(i)`, `move(de, para)`, `getItems()`, `count()`.
- `id` dentro do template é removido (cada item ganha ids próprios). `r4-enable-if` no repeater desabilita os itens.

### `<r4-colorfield>` — cor com contraste

```html
<r4-colorfield name="corTexto" label="Texto" presets="#ffffff,#000000" contrast-with="cor" min-contrast="4.5" required-contrast="3"></r4-colorfield>
```

Seletor nativo + código digitável + amostra; `presets` (até 24) viram botões com `aria-pressed`. `getValue()` é
sempre `#rrggbb` minúsculo (`#ABC` → `#aabbcc`); texto inválido reprova. `contrast-with` = name de outra cor do
mesmo form (ou cor fixa `#ffffff`): mostra a razão WCAG ao vivo ("Contraste 4,47:1 · AA só para texto grande",
arredondada para baixo); abaixo de `min-contrast` o aviso fica destacado; abaixo de `required-contrast` o campo
não valida. `R4.color.contrast(a, b)`, `R4.color.hex(v)`.

### `<r4-choice>` — opções em cartões

```html
<r4-choice name="estilo" label="Estilo do topo" columns="3">
  <r4-option value="solido" label="Sólido"><svg viewBox="0 0 60 40">...</svg></r4-option>
  <r4-option value="grade" label="Grade" icon="grid" description="Três por linha"></r4-option>
  <r4-option value="foto" label="Foto" thumb="/img/foto.png"></r4-option>
</r4-choice>
```

Radios nativos (setas trocam, Espaço marca; `role="radiogroup"` com rótulo). O **conteúdo** de `<r4-option>` é
markup confiável da página; por JS, `html` só vira HTML com `R4.html`/`R4.raw` — label, descrição e `html` em
texto comum são escapados; `thumb` passa por `safeUrl`.

### `<r4-filedrop>` como campo

```html
<r4-filedrop name="foto" label="Foto" src="/img/atual.jpg" accept="image/png,image/jpeg" edit="image" aspect="1"
             upload-url="/api/upload" value-field="retorno.url" required></r4-filedrop>
```

Com `name`, o filedrop entra no form: valor = URL (ou nome) da imagem atual; miniatura com **Remover imagem**.
Ao escolher (e editar, com `edit="image"`) o arquivo, envia em multipart para `upload-url` e o valor passa a ser
o que a resposta trouxer (`url`, `retorno.url`, `data.url`, `retorno.nome`... ou `value-field`). Enquanto envia,
o form não valida ("Aguarde o envio do arquivo"). Sem `upload-url`, o arquivo fica em `getFiles()`.

### `<r4-phonepreview>` — prévia num celular

```html
<r4-phonepreview src="/minha-pagina/previa" for="#perfil" map="titulo,bio,cor,estilo,horarios" breakpoint="1024">
  <r4-form id="perfil" ...>...</r4-form>     <!-- opcional: com conteúdo, o componente faz o layout lado a lado -->
</r4-phonepreview>
```

- Tela ≥ `breakpoint` (padrão 1024 px): celular desenhado em CSS ao lado do form, fixo ao rolar (`top`) e
  escalado para caber na altura da janela; botão "Atualizar prévia".
- Abaixo: botão **"Visualizar pré-review"**; abre a prévia em tela cheia (diálogo `aria-modal`, foco preso por
  sentinelas — funciona até saindo de dentro do iframe —, Esc/Fechar devolvem o foco). O iframe **só carrega no clique**.
- iframe: `src` **só da mesma origem** (outra origem, `javascript:`, `data:`... são recusados), `sandbox="allow-same-origin allow-scripts"`,
  `loading="lazy"`. (Os dois tokens juntos só são aceitáveis porque a página é SUA, da mesma origem.)
- `map` é a **allowlist**: `campo:chave` (ou só `campo`). Nada fora dele sai da página.
- API: `send()`, `reload()`, `open()`, `close()`, `payload()`; eventos `send`, `open`, `close`, `reload`.

## 5. Protocolo da prévia (v1)

```
mãe  → prévia   { v: 1, t: 'estado', d: { chave: valor, ... } }     postMessage(msg, location.origin)
prévia → mãe    { v: 1, t: 'pronto' }                                 pede o estado completo ao carregar
```

- Enviado ao carregar o iframe, ao receber `pronto` e a cada mudança do estado (uma vez por quadro).
- Valores: texto (até 5.000 caracteres), número finito, booleano, `null` ou lista (até 100 itens) de primitivos
  ou objetos rasos de primitivos (itens do repeater). Mensagem até **64 KB** e **100 chaves**.
- A página de prévia carrega só `/libr4/preview.js` (não precisa do resto da lib) e diz o que cada chave pode mudar:

```html
<script src="/libr4/preview.js"></script>
<script src="/js/minha-previa.js"></script>   <!-- arquivo próprio: nada de script inline -->
```
```js
R4.preview.listen({
  text:  { titulo: '#titulo', bio: ['.bio', '#rodape'] },              // textContent (lista vira linhas)
  var:   { cor: '--cor', raio: { name: '--raio', unit: 'px', target: '.card' } },
  class: { estilo: { target: 'body', values: { solido: 'topo-solido', gradiente: 'topo-gradiente' } } },
  show:  { mostrarBio: '#bio' },                                       // hidden quando falso/vazio
  onUpdate(d, chavesAplicadas) { /* opcional: por sua conta */ }
});
```

O receptor só aceita `event.origin === location.origin` **e** `event.source === window.parent` (fora de iframe,
nada é aceito), confere versão/tipo/formato/tamanho, ignora chaves `__proto__`/`constructor`/`prototype` e
aplica **só** o configurado: texto por `textContent`, variável CSS com valor revalidado, classe de uma lista fixa
(as outras da lista são desligadas), `hidden`. **Nunca HTML, nunca URL.** `listen()` devolve `{ stop(), apply(d) }`.

## 6. Segurança e limites

| Ponto | Garantia |
|---|---|
| Texto | `r4-bind texto`/`attr` e a prévia usam `textContent`/`setAttribute` — `<img onerror>` vira texto. |
| Atributos | Allowlist: `title`, `alt`, `aria-label`, `placeholder`, `href`, `src`. `on*`, `style`, `srcdoc` são recusados. |
| URLs | `href`/`src` por `R4.util.safeUrl` (src: só http(s)/relativa/blob/`data:image`); `phonepreview src` só mesma origem. |
| CSS | `var:` e a prévia aceitam só `#rgb`/`#rrggbb`, número com unidade da lista (`px rem em % vh vw vmin vmax deg ms s fr ch`) ou palavra de uma lista curta (`none auto normal bold center left right block flex grid hidden visible solid cover contain uppercase transparent...`), até 32 caracteres. `red;background:url(...)`, `expression()`, `var()`, `url()` são recusados. |
| Expressões | Parser próprio; sem funções/propriedades; 300 caracteres; 8 níveis. |
| Limites | 5.000 bindings por página, 20 por atributo, 500 bindings esperando form; repeater até 100 itens (setValue corta), template até 20.000 caracteres; mensagem da prévia 64 KB/100 chaves. |
| Protótipos | Nomes/chaves `__proto__`, `constructor`, `prototype` ignorados no estado, no repeater, no `map` e na prévia. |
| postMessage | `targetOrigin = location.origin` no envio; origem **e** fonte conferidas no recebimento. |
| HTML confiável | `<r4-item-template>`/`template`, o conteúdo de `<r4-option>` e o conteúdo de `<r4-phonepreview>` são markup da página (como o conteúdo de qualquer tag `<r4-*>`): nunca monte com dado do usuário sem `R4.html`/`R4.util.esc`. |

## 7. Padrões para painéis

1. **Um form por tela**, carregado por `src` e salvo por `action` (+ `encrypt` se precisar). Botões fora do form: `r4-click="salvar:#id"`.
2. **Abas** (`<r4-tabpanel>` com `<r4-tab>`) dentro do form: todos os campos entram no form; erro numa aba fechada abre a aba.
3. **Condicionais** com `r4-show-if` (campos que só valem para PJ, por exemplo) e `r4-enable-if` (botão só com aceite).
   Campo desabilitado sai do `getValues()`; escondido continua — esconda o bloco e desabilite com `r4-enable-if` se não deve ir.
4. **Resumos ao vivo** com `r4-bind="texto:..."` (título da página "Editando: {nome}", contadores `#campo`).
5. **Listas** (horários, links, telefones) com `<r4-repeater>`; o servidor recebe um array de objetos.
6. **Aparência** com `<r4-colorfield contrast-with>` + `<r4-choice>`; mostre o resultado com `r4-bind="var:..."`.
7. **Prévia** com `<r4-phonepreview>` em volta do form e uma página de prévia que só chama `R4.preview.listen`.
8. Valide tudo de novo no servidor: o navegador é conforto, não segurança.

## 8. Tamanho

Módulos novos (fonte, sem minificar; gzip nível 9):

| Arquivo | Bytes | gzip |
|---|---|---|
| `reactive.js` (estado, bindings, expressões) | 27.508 | 9.008 |
| `admin.js` (repeater, colorfield, choice, phonepreview, filedrop-campo) | 61.879 | 18.361 |
| `preview.js` (página de prévia; carregável sozinho) | 11.538 | 4.627 |
| `parts/admin.css` | 7.679 | 2.188 |

Boa parte é documentação embutida (meta da vitrine) e comentários; `php tools/build.php` gera o pacote minificado.
Na página de prévia só vai o `preview.js` (~4,6 KB gzip).
