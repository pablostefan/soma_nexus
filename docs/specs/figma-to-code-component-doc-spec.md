# Figma-to-Code Component Doc Spec

Every Design System component that should be auto-mapped from Figma must provide:

`{component}/docs/figma-to-code.md`

## Required format

The file must start with YAML frontmatter.

```md
---
componentKey: ds.button.primary
figma:
  componentIds:
    - "123:456"
  aliases:
    - "Button"
    - "Primary Button"
code:
  widget: DsButton
  import: package:my_ds/widgets/ds_button.dart
props:
  map:
    label: text
    isDisabled: disabled
variants:
  map:
    size:
      sm: DsButtonSize.small
      md: DsButtonSize.medium
tokens:
  map:
    color.primary: AppColors.primary
examples:
  - DsButton(label: "Comprar", isDisabled: false)
priority: 10
---

Component-level notes...
```

## Required fields

- `componentKey`: unique key for DS component.
- `figma.componentIds`: explicit Figma component ids.
- `figma.aliases`: names/aliases used in Figma.
- `code.widget`: Flutter widget name.
- `code.import`: Dart import for widget.
- `props.map`: Figma prop -> code prop.
- `variants.map`: Figma variant values -> Dart enum/value.
- `tokens.map`: Figma token/value -> code token/value.

## Matching precedence

1. `figma.componentIds`
2. `figma.aliases` exact
3. `figma.aliases` fuzzy (optional, lower confidence)
4. fallback `unmapped`

## Quality rules

- If component has no local doc, it should not be matched automatically.
- `componentKey` in local doc must match entry in global index.
- Prefer explicit ids over alias-only mapping.
