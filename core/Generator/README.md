/**
 * ============================================
 * Generator (core/Generator) - Documentação
 * ============================================
 *
 * @author Otavio
 * @github https://github.com/Otavio1661
 * @version 1.0.0
 * @created 2025-12-23
 *
 * Conjunto de scripts CLI para gerar e remover scaffolding MVC
 * (controllers, models, views) e para registrar/remover rotas no projeto.
 *
 * Os scripts atendem aos seguintes arquivos:
 * - MakeMVC.php
 * - MakeController.php
 * - MakeModel.php
 * - MakeMiddleware.php
 * - DeleteMVC.php
 *
 * Notes:
 * - Os scripts são arquivos PHP executáveis via CLI e escrevem arquivos
 *   diretamente em `src/` e alteram `src/routes.php` quando aplicável.
 * - As rotas já podem ser expostas como scripts do Composer (veja seção).
 *
 * ============================================
 */

# Generator - Visão geral

Este diretório contém utilitários CLI simples para acelerar a criação
de scaffolding básico (Controller, Model, View) e a gestão de rotas
no projeto.

Cada script está documentado abaixo com seu propósito, uso, saída e
observações de segurança.

---

## MakeMVC.php

Descrição:
- Cria `Controller`, `Model` e `View` para um recurso, e adiciona uma rota
	em `src/routes.php` apontando para `Controller@method`.

Uso:
- `php core/Generator/MakeMVC.php Nome [get|post|put|delete] [/rota]`

Comportamento:
- Gera arquivos em `src/controllers`, `src/model` e `src/view`.
- Se `src/routes.php` contiver marcadores especiais, a rota é inserida
	entre eles; caso contrário é inserida antes do `return $router;`.
- Não sobrescreve arquivos existentes; apenas relata se já existem.

Observações:
- O método criado no controller chama `ctrl::render()` que faz `extract()`
	das variáveis passadas — evite expor dados sensíveis.

---

## MakeController.php

Descrição:
- Gera um controller básico estendendo `core\Controller`.

Uso:
- `php core/Generator/MakeController.php Nome`

Observações:
- Cria `src/controllers` quando necessário e não sobrescreve arquivos existentes.

---

## MakeModel.php

Descrição:
- Gera um model básico com boilerplate para trabalhar com `core\Database`.

Uso:
- `php core/Generator/MakeModel.php Nome`

Observações:
- Inclui um exemplo de método `Logout()` que demonstra o padrão de retorno.

---

## MakeMiddleware.php

Descrição:
- Gera um middleware simples (classe em `src/middleware`) que pode ser
	invocado pelo router no formato `Middleware@method`.

Uso:
- `php core/Generator/MakeMiddleware.php Nome`

Observações:
- Middleware aqui é apenas um helper; implemente autenticação/autorização
	conforme necessário.

---

## DeleteMVC.php

Descrição:
- Remove os arquivos gerados para um recurso e tenta limpar a rota
	correspondente em `src/routes.php`.

Uso:
- `php core/Generator/DeleteMVC.php Nome`

Comportamento de remoção:
- Remove arquivos: `src/controllers/{nome}Controller.php`,
	`src/model/{nome}Model.php`, `src/view/{nome}.php`.
- Tenta remover a linha exata da rota; se não encontrar, faz fallback
	removendo qualquer rota que aponte para `Controller@metodo`.

Riscos:
- Remoções são definitivas (unlink) — verifique os caminhos antes de usar
	em ambientes sensíveis.

---

## Composer scripts

Os scripts do gerador já estão expostos no `composer.json` do projeto.
Exemplo de configuração presente no `composer.json`:

```json
"scripts": {
		"migration": "php core/Migration/Migration.php",
		"controller": "php core/Generator/MakeController.php",
		"model": "php core/Generator/MakeModel.php",
		"middleware": "php core/Generator/MakeMiddleware.php",
		"mvc": "php core/Generator/MakeMVC.php",
		"excluir mvc": "php core/Generator/DeleteMVC.php"
}
```

Como usar via Composer:
- `composer mvc Nome` — cria MVC (alias para `MakeMVC.php`).
- `composer controller Nome` — cria controller.
- Para scripts com espaços (ex: `excluir mvc`) use:
	`composer run-script "excluir mvc" Nome`.

Os parâmetros passados após o nome do script são repassados para o PHP
script gerador, por exemplo: `composer mvc Produto get /produto`.

---

## Recomendações gerais

- Faça backup de `src/routes.php` antes de rodar scripts de geração/remoção.
- Os templates criados são simples; revise e adapte antes de usar em produção.
- Para projetos maiores, considere migrar para uma CLI mais robusta
	(ex: Symfony Console, Phinx, ou Artisan-like).

---

Se quiser, eu posso também inserir cabeçalhos/documentação no topo de cada
script do gerador seguindo o estilo do `Decryption.php` (docblocks no início).

