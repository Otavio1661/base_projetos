# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). A versão da lib está em `R4.version` (`public/libr4/core.js`).

## [Não lançado]
### Adicionado
- Autocompletar das tags `<r4-*>` no VS Code (`docs/vscode/r4.html-data.json`, gerado por `tools/gerar-vscode-data.js`).

## [2.0.0]
### Adicionado
- Camada reativa declarativa: `r4-bind`, `r4-show-if`, `r4-enable-if`, `r4-scope`, `R4.state`; formulário carregado por `src`/`root`.
- Componentes de painel: `repeater`, `colorfield` (contraste WCAG), `choice`, `phonepreview` e `R4.preview.listen`.
- Editor de imagem (`R4.imageeditor`, `filedrop edit="image"`): cortar, girar, espelhar e zoom; remove EXIF.
- Formulários (`form`, `select`, máscaras CPF/CNPJ/telefone/CEP...), grid com virtualização, seleção, edição, exportação e modo servidor; `R4.files` (CSV/XLSX/JSON).
- Componentes de interface, gráficos em SVG, `R4.theme`, `R4.i18n` (pt-BR/en), `R4.store` com lixeira, ícones SVG, `R4.support`.
- Tags `<r4-*>`, funções prontas `R4.nome(alvo, dados)`, `r4-click`, `r4-anim`.
- Build próprio em PHP (`php tools/build.php`) com `manifest.json` (SRI).
### Alterado (quebra de compatibilidade)
- Criptografia v2 por sessão (ECDH P-256 + AES-GCM): a `BASE_CRIPTOGRAFIA` e o formato `{x,y,z}` deixaram de existir; a chave privada fica só no servidor (`CRYPTO_PRIVATE_KEY`).
- `R4.http.request` lança erro com `err.status`/`err.data` em respostas 4xx/5xx.
- Em colunas do grid, `renderer` que devolve string é escapado (use `R4.html`/`R4.raw` para HTML).
- `R4.alert(titulo, texto)` é só o diálogo; o aviso embutido é `R4.callout(alvo, texto)`.
### Segurança
- Auditorias de XSS, injeção (SQL, arquivos, prompts), CSRF, CSP sem script inline; ver `docs/SEGURANCA.md`.
