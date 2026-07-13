# Design to Code Workflow

This workflow is optimized for minimal payload and stable output.

## Required flow

1. Parse link using `parse_figma_url`.
2. Validate contracts using `validate_figma_to_code_index`.
3. Preview mapping with `preview_figma_component_mapping` using `responseMode=compact`.
4. Generate component code with `generate_flutter_component_from_figma` when node is a DS component.
5. Generate page code with `generate_flutter_page_from_figma` when node is frame/page.
6. Use `get_figma_node_normalized` only for inspection/debug.
7. Use `get_figma_file` only in exceptional debug scenarios.

## Why this flow

- Avoids huge file payloads when only one frame/component is needed.
- Produces stable metadata and token references.
- Reduces retries and token cost.
- Limits noisy candidate lists and keeps only essential output in compact mode.

## Recommended prompting pattern

- Input: full Figma URL with `node-id`.
- Ask model to call tools with `responseMode=compact`.
- Enable `debugTelemetry=true` only when measuring payload savings.

## Minimal example

1. `parse_figma_url(figmaUrl)`
2. `preview_figma_component_mapping(figmaUrl, responseMode="compact")`
3. `generate_flutter_component_from_figma(figmaUrl, responseMode="compact")`
4. `generate_flutter_page_from_figma(figmaUrl, responseMode="compact", depth=4, maxNodes=120)`

## Fallbacks

- Missing `node-id`: ask for frame/layer URL, not file root URL.
- Large node timeout: lower `depth` or target child node.
- Missing images: call `get_figma_images` with exact node id.
