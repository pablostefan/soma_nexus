# Figma-to-Code Workflow (Federated Docs)

## Goal

Handle mismatched naming/structure between Figma and code by using per-component docs as source of truth.

## Flow

1. `validate_figma_to_code_index`
2. `parse_figma_url`
3. `get_figma_node_normalized`
4. Resolve node -> component through index + `{component}/docs/figma-to-code.md`
5. Build props/variants/tokens from component doc mappings
6. Generate final Flutter code

## Authoring process

1. Add or update component local doc: `{component}/docs/figma-to-code.md`
2. Register component in global index `docs/figma-to-code-index.yaml`
3. Run MCP validation tool
4. Fix validation issues before generation

## Validation expectations

- No duplicate aliases across components
- No duplicate `figmaComponentIds` across components
- All `docPath` files exist
- `componentKey` in index == `componentKey` in local doc
