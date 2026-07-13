#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

type FigmaFileResponse = {
  name?: string;
  lastModified?: string;
  version?: string;
  document?: unknown;
  components?: Record<string, unknown>;
  componentSets?: Record<string, unknown>;
  styles?: Record<string, unknown>;
};

const figmaToken = process.env.FIGMA_TOKEN;

if (!figmaToken) {
  console.error("Missing FIGMA_TOKEN environment variable. Set it in MCP client config.");
  process.exit(1);
}

const server = new McpServer({
  name: "soma-nexus-figma-mcp",
  version: "0.1.0"
});

async function figmaFetch<T>(path: string): Promise<T> {
  const token = figmaToken!;

  const response = await fetch(`https://api.figma.com${path}`, {
    headers: {
      "X-Figma-Token": token,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Figma API error ${response.status}: ${message}`);
  }

  return response.json() as Promise<T>;
}

server.registerTool(
  "get_figma_file",
  {
    description: "Fetch a Figma file and return the raw file payload.",
    inputSchema: {
      fileKey: z.string().min(1),
      version: z.string().optional()
    },
    annotations: {
      title: "Get Figma File",
      readOnlyHint: true,
      openWorldHint: false
    }
  },
  async ({ fileKey, version }) => {
    const query = version ? `?version=${encodeURIComponent(version)}` : "";
    const data = await figmaFetch<FigmaFileResponse>(`/v1/files/${fileKey}${query}`);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }
);

server.registerTool(
  "get_figma_nodes",
  {
    description: "Fetch specific Figma nodes, their subtrees, and optional geometry.",
    inputSchema: {
      fileKey: z.string().min(1),
      nodeIds: z.string().min(1),
      version: z.string().optional(),
      depth: z.number().int().min(1).optional(),
      geometry: z.enum(["paths"]).optional()
    },
    annotations: {
      title: "Get Figma Nodes",
      readOnlyHint: true,
      openWorldHint: false
    }
  },
  async ({ fileKey, nodeIds, version, depth, geometry }) => {
    const params = new URLSearchParams({ ids: nodeIds });

    if (version) params.set("version", version);
    if (depth) params.set("depth", String(depth));
    if (geometry) params.set("geometry", geometry);

    const data = await figmaFetch<unknown>(`/v1/files/${fileKey}/nodes?${params.toString()}`);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }
);

server.registerTool(
  "get_figma_images",
  {
    description: "Render Figma nodes to image URLs for assets and previews.",
    inputSchema: {
      fileKey: z.string().min(1),
      nodeIds: z.string().min(1),
      version: z.string().optional(),
      scale: z.number().min(0.01).max(4).optional(),
      format: z.enum(["jpg", "png", "svg", "pdf"]).optional()
    },
    annotations: {
      title: "Get Figma Images",
      readOnlyHint: true,
      openWorldHint: false
    }
  },
  async ({ fileKey, nodeIds, version, scale, format }) => {
    const params = new URLSearchParams({ ids: nodeIds });

    if (version) params.set("version", version);
    if (scale) params.set("scale", String(scale));
    if (format) params.set("format", format);

    const data = await figmaFetch<unknown>(`/v1/images/${fileKey}?${params.toString()}`);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }
);

server.registerTool(
  "get_figma_components",
  {
    description: "Fetch published components found in a Figma file.",
    inputSchema: {
      fileKey: z.string().min(1)
    },
    annotations: {
      title: "Get Figma Components",
      readOnlyHint: true,
      openWorldHint: false
    }
  },
  async ({ fileKey }) => {
    const data = await figmaFetch<unknown>(`/v1/files/${fileKey}/components`);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }
);

server.registerTool(
  "get_figma_styles",
  {
    description: "Fetch published styles found in a Figma file.",
    inputSchema: {
      fileKey: z.string().min(1)
    },
    annotations: {
      title: "Get Figma Styles",
      readOnlyHint: true,
      openWorldHint: false
    }
  },
  async ({ fileKey }) => {
    const data = await figmaFetch<unknown>(`/v1/files/${fileKey}/styles`);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }
);

server.registerTool(
  "get_figma_variables",
  {
    description: "Fetch local variables and collections from a Figma file.",
    inputSchema: {
      fileKey: z.string().min(1)
    },
    annotations: {
      title: "Get Figma Variables",
      readOnlyHint: true,
      openWorldHint: false
    }
  },
  async ({ fileKey }) => {
    const data = await figmaFetch<unknown>(`/v1/files/${fileKey}/variables/local`);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
