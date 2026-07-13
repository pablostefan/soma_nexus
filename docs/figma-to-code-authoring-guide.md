# Figma-to-Code Authoring Guide

## Where to document each component

For each Design System component, create:

`{component}/docs/figma-to-code.md`

Use `docs/templates/component-figma-to-code.template.md` as starter.

## Register component globally

Add one entry in `docs/figma-to-code-index.yaml`.

Required entry fields:

- `componentKey`
- `dsPath`
- `docPath`
- `figmaAliases`
- `figmaComponentIds`
- `status`

Optional but recommended in Flutter monorepos:

- `componentDocPath` (usually `{component}/docs/{component}.md`)
- `accessibilityDocPath` (usually `{component}/docs/acessibilidade.md`)

## Recommended practice

- Prefer explicit `figmaComponentIds` whenever possible.
- Keep aliases short and stable.
- Add at least one realistic `examples` snippet.
- Keep `status: draft` until mapping is validated in real URL tests.
- Keep companion docs paths updated to improve generation quality and accessibility hints.
