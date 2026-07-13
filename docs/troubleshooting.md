# Troubleshooting

## Server does not start

1. Ensure Node.js 18+ is installed.
2. Confirm MCP config command/args are correct.
3. Check MCP output logs in client.

## Unauthorized errors

Error: `FIGMA_UNAUTHORIZED`

Fix:
1. Regenerate personal access token in Figma.
2. Ensure token is passed as `FIGMA_TOKEN`.
3. Restart MCP server.

## URL parsing errors

Error: `INVALID_URL` or `NODE_ID_MISSING`

Fix:
1. Use Figma URL like `https://www.figma.com/design/<fileKey>/...?node-id=85-2552`.
2. Copy link from frame/layer, not only file root.

## Large payloads / slow responses

1. Prefer `get_figma_node_from_url` over `get_figma_file`.
2. Lower `depth` in node queries.
3. Split requests by section/component.

## Rate limit

Error: `FIGMA_RATE_LIMIT`

Fix:
1. Wait and retry with backoff.
2. Reduce request volume.
3. Avoid full-file requests when node-level data is enough.
