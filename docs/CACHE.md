# Cache e armazenamento no navegador (`R4.store`)

Tudo o que a libr4 guarda no navegador passa por **um único módulo**, o `R4.store`
(`public/libr4/store.js`). Ele existe para garantir três coisas:

1. **Nada fica para sempre.** Todo item tem validade (TTL).
2. **Nada cresce sem limite.** Uma "lixeira" (coleta de lixo) apaga sozinha o que expirou, o que
   está corrompido, o que sobrou de versões antigas e, se passar do limite, o que foi menos usado.
3. **Nada de fora entra sem ser conferido.** Todo valor lido do `localStorage` é revalidado (ele pode
   ter sido adulterado por outra aba, extensão ou por um XSS antigo).

> **Regra de privacidade (inegociável):** NUNCA guarde **token, senha, CPF, cartão, JWT, chave de API
> ou qualquer dado pessoal** no navegador. O `localStorage` é legível por qualquer script da página,
> por extensões e por quem usa o computador. Use cookie `HttpOnly` + sessão no servidor.
> O `R4.store` recusa chaves cujo nome contenha `token`, `senha`, `password`, `secret`, `cpf`,
> `cartao`, `card`, `jwt` ou `auth` (com aviso no console). `{ permitirSensivel: true }` existe para
> falsos positivos (ex.: uma chave `author.filtro`), não para burlar a regra.

---

## 1. O que a lib guarda, onde e por quanto tempo

| O quê | Onde | Chave | Validade | Observações |
|---|---|---|---|---|
| Tema (modo, cor, raio, densidade, fonte) | `localStorage` | `r4:theme` | 180 dias, **renovada a cada uso** | Cada campo é revalidado ao ler (`R4.theme` só aceita cor hex/rgb, modo em lista etc.). Valor adulterado é descartado e a chave apagada. |
| Idioma | `localStorage` | `r4:locale` | 180 dias, renovada a cada uso | Só um código de idioma válido (`pt-BR`, `en`...). |
| Abas abertas da vitrine | `localStorage` | `vitrine.abas` → `r4:vitrine.abas` | 7 dias, renovada a cada uso | Só `{ key, título curto }` de cada aba e a aba ativa. Nunca conteúdo ou HTML. |
| Controle da lixeira | `localStorage` | `r4:__meta` | — | Hora da última varredura. |
| Dados de teste da vitrine (`VitrineData.load`) | **memória** (não vai ao storage) | — | 10 min, máx. 6 conjuntos | `VitrineData.limpar()` esvazia. Promessa que falhou não fica guardada. |
| Exemplos da vitrine (`demo.*`) | `localStorage` | `r4:demo.visitas`, `r4:demo.abas` | 1 hora | Só nos exemplos do item **R4.store**; "Apagar as chaves demo.*" limpa. |

Chaves **antigas** (sem prefixo): `r4-theme`, `r4-locale`, `r4-dark`. Na primeira carga elas são lidas
**uma vez**, validadas, copiadas para o formato novo (`r4:theme`, `r4:locale`) e **apagadas**. Lixo ou
valor inválido nelas é descartado.

Tudo da libr4 no `localStorage` começa com `r4:`. O que não começa com `r4:` (chaves do seu app,
de terceiros) **nunca é lido nem apagado** pela lixeira.

---

## 2. Formato guardado (envelope)

Cada chave `r4:<nome>` guarda um JSON:

```json
{ "v": 1, "d": { "...": "seus dados" }, "e": 1795437152828, "a": 1794832352828, "b": 161, "s": 604800000 }
```

| Campo | Significado |
|---|---|
| `v` | Versão do formato (hoje `1`). Outra versão = "órfã": apagada pela lixeira. |
| `d` | O dado (JSON puro). |
| `e` | Quando expira (ms desde 1970). Obrigatório e `> 0`: **não existe item eterno** (máximo 365 dias). `e: 0` é tratado como adulteração. |
| `a` | Último acesso (ms). Base do LRU. |
| `b` | Tamanho do dado em bytes. |
| `s` | Só se `sliding`: janela (ms) que a leitura renova. |

---

## 3. API

```js
R4.store.set('prefs', { cor: 'azul' }, { ttl: '30d', sliding: true });   // → true | false (recusado, com aviso)
R4.store.get('prefs', { schema: { cor: 'string' }, fallback: {} });      // → cópia validada | fallback
R4.store.has('prefs');  R4.store.del('prefs');
R4.store.keys('abas.'); R4.store.clear('abas.');     // sem prefixo: todo o namespace r4:
R4.store.sweep();       R4.store.stats();            // varrer agora / inspecionar
R4.store.configure({ maxBytes: 524288 });            // limites (devolve a configuração)
R4.store.onEvict((chave, motivo) => ...);            // ouvir a lixeira
R4.store.flush();                                    // gravar já o pendente
R4.store.session.set(...)                            // mesma API no sessionStorage
R4.store.create({ maxKeys: 20 })                     // armazenamento independente (memória)
```

### `set(chave, valor, { ttl, sliding, permitirSensivel })`

* **Chave:** `[A-Za-z0-9._:-]`, de 1 a 64 caracteres, sem começar com `__`.
* **Valor:** JSON puro. São recusados: função, símbolo, `undefined`/`NaN`/`Infinity` em arrays e valores,
  `Date`/`Map`/`Set`/classes, referência circular, profundidade acima de 8 níveis, estrutura gigante
  (mais de 20 mil valores). Chaves `__proto__`, `constructor` e `prototype` são **ignoradas** em qualquer
  nível (nunca poluem protótipos).
* **Tamanho:** acima de `maxItemBytes` (32 KB de JSON) é recusado com aviso.
* **ttl:** milissegundos ou texto: `'500ms'`, `'30s'`, `'30m'`, `'12h'`, `'7d'`, `'2w'`. Omitido ou inválido
  usa `defaultTtl` (7 dias); nunca passa de 365 dias.
* **sliding:** `true` renova a validade a cada leitura. A escrita é limitada a **uma por minuto** por chave
  (a renovação em memória é imediata).
* **Gravação em lote:** `set` responde na hora e agrupa gravações em rajada (200 ms) e grava ao sair da
  página (`pagehide`). `{ now: true }` grava na hora.

### `get(chave, { schema, fallback })`

* Chave inexistente, **expirada** (apagada na hora), JSON inválido, envelope inválido ou fora do esquema
  → devolve `fallback` e **apaga a chave**.
* Devolve sempre uma **cópia** (alterar o resultado não altera o que está guardado).
* `schema` pode ser uma função (`valor => valorSanitizado | undefined`) ou um objeto simples:

```js
R4.store.get('perfil', { schema: {
  nome:   { t: 'string', max: 40 },                 // limite de tamanho
  idade:  { t: 'number', min: 0, max: 130 },
  papel:  { t: 'string', in: ['user', 'admin'] },   // lista permitida
  cidade: 'string?',                                // opcional
  tags:   'array'                                   // 'string' | 'number' | 'boolean' | 'array' | 'object'
} });                                               // campos fora do esquema são descartados
```

---

## 4. A lixeira (coleta de lixo)

`sweep()` remove, nesta ordem:

1. **expirados** (`e` no passado);
2. **corrompidos** (JSON inválido, campos faltando ou com tipo errado, `e: 0`, valor grande demais);
3. **órfãos** (`r4:*` sem envelope, de versão antiga — `v` diferente de 1 — ou com nome inválido);
4. se o total passar de `maxBytes` **ou** `maxKeys`: expulsa os **menos recentemente usados** (LRU pelo
   campo `a`) até ficar em **80%** do limite. A chave que acabou de ser gravada nunca é a expulsa.

**Quando roda:**

| Gatilho | Como |
|---|---|
| Ao carregar a página | Em `requestIdleCallback` (com reserva em `setTimeout`), **em fatias de 25 chaves** para não travar a tela, e no máximo **1 vez por `sweepEvery`** (padrão 1 h; a hora fica em `r4:__meta`). |
| Depois de gravar | Se o armazenamento passou de `maxKeys`/`maxBytes`, varre na hora; senão, se já passou `sweepEvery`, agenda a varredura ociosa. |
| Cota do navegador estourada (`QuotaExceededError`) | Varre, expulsa os 25% menos usados e **tenta de novo uma única vez**. Se ainda assim falhar, o valor continua só em memória (nada lança erro). |
| Leitura de item expirado | Apaga na hora e devolve o `fallback`. |
| `R4.store.sweep()` | Manual. `sweep({ auto: true })` só roda se já passou `sweepEvery`. |

`sweep()` devolve `{ expired, corrupt, orphan, rejected, evicted, items, bytes }`.
`onEvict((chave, motivo) => ...)` recebe os motivos `expired`, `corrupt`, `orphan`, `schema`, `lru`, `quota`.

---

## 5. Limites (e como mudar)

| Opção | Padrão | Faixa aceita | Para que serve |
|---|---|---|---|
| `maxBytes` | 262144 (256 KB) | 1 KB a 4 MB | Total do namespace. Acima disso: LRU até 80%. |
| `maxItemBytes` | 32768 (32 KB) | 16 B a 1 MB (e ≤ `maxBytes`) | Maior valor aceito por chave. |
| `maxKeys` | 200 | 1 a 2000 | Máximo de chaves. |
| `defaultTtl` | 7 dias | até 365 dias | TTL de quem não informa `ttl`. |
| `sweepEvery` | 1 hora | 1 s a 7 dias | Intervalo mínimo da varredura automática. |

```js
R4.store.configure({ maxBytes: 524288, maxKeys: 400, defaultTtl: '3d' });
```

Valores fora da faixa são ajustados; opções desconhecidas são ignoradas. O `R4.store.session`
(sessionStorage) tem a própria configuração.

---

## 6. Falha segura

Se o `localStorage` estiver bloqueado (modo privado, política), cheio ou lançar qualquer erro, o
`R4.store` **cai para um `Map` em memória** com a mesma semântica (TTL, limites, LRU, esquema). Nenhuma
função lança exceção: `set` devolve `true`/`false`, `get` devolve o `fallback`. `R4.store.stats().memory`
fica `true` quando algo só existe em memória (e um aviso é registrado uma vez).

Outra aba alterou ou limpou o storage? O evento `storage` invalida o cache em memória e a próxima leitura
vê o valor novo.

---

## 7. Inspecionar

```js
R4.store.stats()
// { items: 4, bytes: 1220, maxBytes: 262144, maxKeys: 200,
//   expired: 2, corrupt: 0, orphan: 0, rejected: 0, evictions: 0,
//   sweeps: 1, lastSweep: 1794831486128, pending: 0, memory: false }
R4.store.keys()            // ['locale', 'theme', 'vitrine.abas', ...]
```

Os contadores (`expired`, `evictions`...) valem desde que a página abriu. `pending` = gravações ainda no
lote. No navegador: DevTools → Application → Local Storage → procure `r4:`.

---

## 8. Abas persistentes (`tabpanel`)

```js
R4.create({ xtype: 'tabpanel', renderTo: '#abas', persist: 'meuapp.abas', persistTtl: '7d', maxTabs: 30,
            items: [{ title: 'Início', key: 'inicio', html: '...' }] });
```

* `persist` (vazio = desligado), `persistTtl` (padrão `'7d'`, sliding), `maxTabs` (padrão 30; `0` = sem
  limite; só vale para abas abertas **depois** de montado o painel: ao passar, fecha a mais **antiga** que
  não seja a ativa).
* Salva `{ tabs: [{ key, title }], active }` ~300 ms depois de abrir/fechar/mover/trocar de aba e ao sair da
  página. Só abas com `key` `[A-Za-z0-9_.-]{1,64}`; título de texto puro, sem `< >`, sem caracteres de
  controle/bidi, até 60 caracteres. **Nunca** conteúdo.
* `getSavedState()` **sempre valida** (tipos, tamanhos, chaves inválidas ou perigosas, duplicadas, limite de
  `maxTabs`, ativa inexistente). Estado de tipo errado é apagado.
* `restoreSaved(fábrica)` recria as abas salvas, na ordem. A `fábrica({ key, title })` devolve a
  configuração da aba **ou `null`** — ela é a **lista permitida**: o que ela não reconhece é descartado e o
  estado é regravado limpo. Não repete chave já aberta. Dispara `tabsrestore(painel, estado, quantas)`.
* `clearSaved()` apaga o estado salvo (não fecha as abas); `saveState()` grava agora.
* Fechar uma aba também **destrói os componentes que estavam dentro dela** (nada fica em `R4.instances`).

Na **vitrine**: ao abrir, as abas voltam (só ids que existem em `R4.registry`/`R4.modules`); a aba ativa
salva é reativada, mas o `#hash` da URL tem prioridade; o conteúdo de cada aba só é montado quando ela é
ativada pela primeira vez. O botão **Limpar abas** (lixeira, na barra superior) fecha tudo menos o Início e
apaga o estado salvo.

---

## 9. Como guardar algo seu com segurança

```js
// bom: preferência de interface, pequena, com validade e esquema
R4.store.set('app.filtro', { status: 'ativo', pagina: 2 }, { ttl: '14d', sliding: true });
const f = R4.store.get('app.filtro', { schema: { status: { t: 'string', in: ['ativo', 'inativo'] }, pagina: { t: 'number', min: 1, max: 9999 } }, fallback: { status: 'ativo', pagina: 1 } });

// errado: dado sensível ou pessoal (será recusado pelo nome da chave, mas o nome não é a única proteção)
R4.store.set('usuario.cpf', '123.456.789-09');     // recusado
R4.store.set('sessao.token', jwt);                 // recusado
```

* Trate o que volta do storage como **entrada não confiável** (o `schema` é a defesa): nunca coloque o valor
  em `innerHTML` sem `R4.util.esc` e nunca use-o para decidir permissão — quem manda é o servidor.
* Não guarde listas que crescem com o uso (histórico, logs, caches de API): se precisar, use TTL curto,
  limite o tamanho (`maxItemBytes`) e agrupe numa chave só.
* Cache de **respostas de API** é outro assunto: use cabeçalhos HTTP (`Cache-Control`) e nunca guarde
  respostas com dado pessoal no navegador.

---

## 10. Testes

Suíte `store` (e `tabs`, `theme`, `i18n`) em `/vitrine/testes`, ou no terminal:

```bash
JSDOM_PATH=/caminho/node_modules/jsdom node tools/rodar-testes.js store,tabs,theme,i18n
```

Cobrem: TTL e apagar na leitura, sliding com limite de escrita, varredura (expirados, corrompidos, órfãos,
chaves de fora do namespace intocadas), LRU a 80%, `QuotaExceededError` com nova tentativa, esquemas,
`__proto__`, chaves e valores recusados, falha segura em memória, `sweepEvery`, migração das chaves antigas,
`stats()` e **"nenhum acúmulo"** (criar e expirar 1.000 itens mantém tamanho e quantidade nos limites),
além de salvar/restaurar/validar abas (estado adulterado, 500 abas), TTL das abas, `maxTabs` e limpeza.

Para simular o armazenamento nos seus testes: `R4.store.use(objetoComGetItemSetItemRemoveItem)` e
`R4.store._agora = () => milissegundos`; ou `R4.store.create({ area, _agora })` para uma instância isolada.
