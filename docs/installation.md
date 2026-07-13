# Installation Guide

This project is focused on VS Code local usage.

## VS Code

Open your MCP config and use:

```jsonc
{
  "inputs": [
    {
      "id": "figma-token",
      "type": "promptString",
      "description": "FIGMA_TOKEN for Soma Nexus MCP",
      "password": true
    }
  ],
  "servers": {
    "soma-nexus-figma-mcp": {
      "type": "stdio",
      "command": "npm",
      "args": ["run", "dev"],
      "env": {
        "FIGMA_TOKEN": "${input:figma-token}"
      }
    }
  }
}
```

## Verify startup

1. Run `npm install` in project root.
2. Start MCP server in VS Code.
2. Run `parse_figma_url` with a valid Figma URL.
3. Run `get_figma_node_from_url` with a URL containing `node-id`.
4. Confirm `ok: true` in response.
