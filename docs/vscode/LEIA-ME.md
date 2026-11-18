# Autocompletar das tags `<r4-*>` no VS Code

`r4.html-data.json` ensina o VS Code a sugerir as tags da libr4 (`<r4-grid>`, `<r4-form>`, `<r4-repeater>`...), seus atributos e os atributos globais (`r4-click`, `r4-bind`, `r4-show-if`, `r4-anim`...), com a descrição de cada um.

## Ativar

No projeto, crie (ou edite) `.vscode/settings.json`:

```json
{
  "html.customData": ["./docs/vscode/r4.html-data.json"]
}
```

Em um projeto de cliente, copie o arquivo para `docs/vscode/` e use o mesmo caminho. Ao digitar `<r4-` ou `r4-` num `.html` ou `.php`, as sugestões aparecem.

## Regerar (depois de mudar a lib)

```bash
JSDOM_PATH=/caminho/node_modules/jsdom node tools/gerar-vscode-data.js
```

Node e jsdom só para desenvolvimento: a lib não depende deles. O gerador lê o registro (`R4.registry` e o `meta` de cada componente), então documentar bem o `meta.props` melhora o autocompletar.
