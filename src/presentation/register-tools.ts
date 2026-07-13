import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { collectNormalizedData, extractNodeSummary } from "../application/node-normalizer.js";
import { ComponentMatcher, MappingResolution } from "../application/component-matcher.js";
import { ContractValidator } from "../application/contract-validator.js";
import { FlutterComponentGenerator } from "../application/flutter-component-generator.js";
import { FlutterPageGenerator } from "../application/flutter-page-generator.js";
import { AppError } from "../core/errors.js";
import { ok, ResponseMode, runTool } from "../core/responses.js";
import { parseFigmaUrl, parseNodeIds } from "../domain/figma-url.js";
import {
  FigmaApiClient,
  FigmaFileResponse,
  FigmaNodesResponse
} from "../infrastructure/figma-api-client.js";

type RegisterToolsDependencies = {
  server: McpServer;
  figmaClient: FigmaApiClient;
  contractValidator: ContractValidator;
  componentMatcher: ComponentMatcher;
  flutterGenerator: FlutterComponentGenerator;
  flutterPageGenerator: FlutterPageGenerator;
};

const DEFAULT_NODE_DEPTH = 1;
const DEFAULT_PAGE_DEPTH = 4;
const DEFAULT_COMPACT_CANDIDATES = 3;
const DEFAULT_STANDARD_CANDIDATES = 10;
const DEFAULT_PAGE_MAX_NODES = 120;

function extractedCounts(extracted: ReturnType<typeof collectNormalizedData>) {
  return {
    colors: extracted.colors.length,
    styleRefs: extracted.styleRefs.length,
    textStyles: extracted.textStyles.length,
    imageRefs: extracted.imageRefs.length,
    componentIds: extracted.componentIds.length,
    instanceComponentIds: extracted.instanceComponentIds.length
  };
}

function toResponseOptions(
  mode: ResponseMode,
  debugTelemetry?: boolean,
  payload?: unknown,
  extra?: Record<string, unknown>
) {
  if (!debugTelemetry) {
    return { mode };
  }

  return {
    mode,
    debug: {
      payload,
      extra
    }
  };
}

function compactFilePayload(data: FigmaFileResponse) {
  return {
    meta: {
      name: data.name ?? null,
      lastModified: data.lastModified ?? null,
      version: data.version ?? null
    },
    documentSummary: extractNodeSummary(data.document),
    counts: {
      components: Object.keys(data.components ?? {}).length,
      componentSets: Object.keys(data.componentSets ?? {}).length,
      styles: Object.keys(data.styles ?? {}).length
    }
  };
}

function compactNodesPayload(data: FigmaNodesResponse) {
  const entries = Object.entries(data.nodes ?? {});
  return {
    meta: {
      name: data.name ?? null,
      lastModified: data.lastModified ?? null,
      version: data.version ?? null
    },
    nodeCount: entries.length,
    nodes: entries.map(([nodeId, value]) => ({
      nodeId,
      summary: extractNodeSummary(value.document)
    }))
  };
}

function compactResolutionPayload(resolution: MappingResolution, maxCandidates: number) {
  return {
    matched: resolution.matched,
    bestMatch: resolution.bestMatch
      ? {
          componentKey: resolution.bestMatch.componentKey,
          score: resolution.bestMatch.score,
          matchedBy: resolution.bestMatch.reasons[0]?.type ?? null,
          docPath: resolution.bestMatch.docPath
        }
      : null,
    nodeContext: resolution.nodeContext,
    candidates: resolution.candidates.slice(0, maxCandidates).map((candidate) => ({
      componentKey: candidate.componentKey,
      score: candidate.score,
      matchedBy: candidate.reasons[0]?.type ?? null,
      docPath: candidate.docPath
    }))
  };
}

function summarizeTopLevel(data: unknown) {
  if (Array.isArray(data)) {
    return {
      rootType: "array",
      itemCount: data.length
    };
  }

  if (data && typeof data === "object") {
    const keys = Object.keys(data as Record<string, unknown>);
    return {
      rootType: "object",
      keyCount: keys.length,
      sampleKeys: keys.slice(0, 8)
    };
  }

  return {
    rootType: typeof data
  };
}

export function registerTools({
  server,
  figmaClient,
  contractValidator,
  componentMatcher,
  flutterGenerator,
  flutterPageGenerator
}: RegisterToolsDependencies) {
  server.registerTool(
    "get_figma_file",
    {
      description: "Fetch a Figma file. Prefer compact mode to avoid large payloads.",
      inputSchema: {
        fileKey: z.string().min(1),
        version: z.string().optional(),
        responseMode: z.enum(["standard", "compact"]).optional(),
        debugTelemetry: z.boolean().optional()
      },
      annotations: {
        title: "Get Figma File",
        readOnlyHint: true,
        openWorldHint: false
      }
    },
    async ({ fileKey, version, responseMode, debugTelemetry }) => {
      const mode = responseMode ?? "standard";
      return runTool(async () => {
        const data = await figmaClient.getFile(fileKey, version);
        const output = mode === "compact" ? compactFilePayload(data) : data;
        return ok(output, toResponseOptions(mode, debugTelemetry, data));
      }, { mode });
    }
  );

  server.registerTool(
    "parse_figma_url",
    {
      description: "Parse a Figma URL and extract fileKey and nodeId.",
      inputSchema: {
        figmaUrl: z.string().url()
      },
      annotations: {
        title: "Parse Figma URL",
        readOnlyHint: true,
        openWorldHint: false
      }
    },
    async ({ figmaUrl }) => {
      return runTool(async () => ok(parseFigmaUrl(figmaUrl)));
    }
  );

  server.registerTool(
    "validate_figma_to_code_index",
    {
      description:
        "Validate the global figma-to-code index and all per-component docs before generation.",
      inputSchema: {
        responseMode: z.enum(["standard", "compact"]).optional(),
        debugTelemetry: z.boolean().optional()
      },
      annotations: {
        title: "Validate Figma-to-Code Index",
        readOnlyHint: true,
        openWorldHint: false
      }
    },
    async ({ responseMode, debugTelemetry }) => {
      const mode = responseMode ?? "standard";
      return runTool(async () => {
        const report = await contractValidator.validateIndexAndDocs();
        const output =
          mode === "compact"
            ? {
                isValid: report.isValid,
                stats: report.stats,
                issueCount: report.issues.length,
                issueCodes: Array.from(new Set(report.issues.map((issue) => issue.code))).slice(0, 10)
              }
            : report;
        return ok(output, toResponseOptions(mode, debugTelemetry, report));
      }, { mode });
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
        geometry: z.enum(["paths"]).optional(),
        responseMode: z.enum(["standard", "compact"]).optional(),
        debugTelemetry: z.boolean().optional()
      },
      annotations: {
        title: "Get Figma Nodes",
        readOnlyHint: true,
        openWorldHint: false
      }
    },
    async ({ fileKey, nodeIds, version, depth, geometry, responseMode, debugTelemetry }) => {
      const mode = responseMode ?? "standard";
      const effectiveDepth = depth ?? DEFAULT_NODE_DEPTH;
      return runTool(async () => {
        const normalizedNodeIds = parseNodeIds(nodeIds).join(",");
        const data = await figmaClient.getNodes(fileKey, normalizedNodeIds, {
          version,
          depth: effectiveDepth,
          geometry
        });
        const output = mode === "compact" ? compactNodesPayload(data) : data;
        return ok(
          output,
          toResponseOptions(mode, debugTelemetry, data, {
            effectiveDepth
          })
        );
      }, { mode });
    }
  );

  server.registerTool(
    "preview_figma_component_mapping",
    {
      description: "Preview how a Figma node matches a Design System component via federated docs.",
      inputSchema: {
        figmaUrl: z.string().url(),
        version: z.string().optional(),
        depth: z.number().int().min(1).optional(),
        maxCandidates: z.number().int().min(1).max(20).optional(),
        responseMode: z.enum(["standard", "compact"]).optional(),
        debugTelemetry: z.boolean().optional()
      },
      annotations: {
        title: "Preview Figma Component Mapping",
        readOnlyHint: true,
        openWorldHint: false
      }
    },
    async ({ figmaUrl, version, depth, maxCandidates, responseMode, debugTelemetry }) => {
      const mode = responseMode ?? "standard";
      const effectiveDepth = depth ?? DEFAULT_NODE_DEPTH;
      const effectiveMaxCandidates =
        maxCandidates ??
        (mode === "compact" ? DEFAULT_COMPACT_CANDIDATES : DEFAULT_STANDARD_CANDIDATES);

      return runTool(async () => {
        const parsed = parseFigmaUrl(figmaUrl);

        if (!parsed.nodeId) {
          throw new AppError("NODE_ID_MISSING", "Figma URL must include node-id.", { figmaUrl });
        }

        const data = await figmaClient.getNodes(parsed.fileKey, parsed.nodeId, {
          version,
          depth: effectiveDepth
        });

        const node = data.nodes?.[parsed.nodeId]?.document;
        if (!node) {
          throw new AppError("FIGMA_NOT_FOUND", "Node not found in Figma response.", {
            fileKey: parsed.fileKey,
            nodeId: parsed.nodeId
          });
        }

        const resolution = await componentMatcher.resolveFromNode(node, {
          maxCandidates: effectiveMaxCandidates,
          includeMapping: mode !== "compact"
        });

        const outputResolution =
          mode === "compact"
            ? compactResolutionPayload(resolution, effectiveMaxCandidates)
            : resolution;

        return ok({
          fileKey: parsed.fileKey,
          nodeId: parsed.nodeId,
          resolution: outputResolution
        }, toResponseOptions(mode, debugTelemetry, data, {
          effectiveDepth,
          effectiveMaxCandidates
        }));
      }, { mode });
    }
  );

  server.registerTool(
    "generate_flutter_component_from_figma",
    {
      description:
        "Generate a minimal Flutter widget snippet from a Figma node using federated docs mapping.",
      inputSchema: {
        figmaUrl: z.string().url(),
        version: z.string().optional(),
        depth: z.number().int().min(1).optional(),
        responseMode: z.enum(["standard", "compact"]).optional(),
        debugTelemetry: z.boolean().optional()
      },
      annotations: {
        title: "Generate Flutter Component From Figma",
        readOnlyHint: true,
        openWorldHint: false
      }
    },
    async ({ figmaUrl, version, depth, responseMode, debugTelemetry }) => {
      const mode = responseMode ?? "standard";
      const effectiveDepth = depth ?? DEFAULT_NODE_DEPTH;

      return runTool(async () => {
        const parsed = parseFigmaUrl(figmaUrl);

        if (!parsed.nodeId) {
          throw new AppError("NODE_ID_MISSING", "Figma URL must include node-id.", { figmaUrl });
        }

        const data = await figmaClient.getNodes(parsed.fileKey, parsed.nodeId, {
          version,
          depth: effectiveDepth
        });

        const node = data.nodes?.[parsed.nodeId]?.document;
        if (!node) {
          throw new AppError("FIGMA_NOT_FOUND", "Node not found in Figma response.", {
            fileKey: parsed.fileKey,
            nodeId: parsed.nodeId
          });
        }

        const resolution = await componentMatcher.resolveFromNode(node, {
          maxCandidates: mode === "compact" ? DEFAULT_COMPACT_CANDIDATES : DEFAULT_STANDARD_CANDIDATES,
          includeMapping: true
        });

        if (!resolution.matched) {
          throw new AppError("INVALID_INPUT", "No Design System mapping found for this Figma node.", {
            fileKey: parsed.fileKey,
            nodeId: parsed.nodeId,
            nodeName: resolution.nodeContext.name
          });
        }

        const generated = flutterGenerator.generate(node, resolution, mode);

        const output =
          mode === "compact"
            ? {
                fileKey: parsed.fileKey,
                nodeId: parsed.nodeId,
                componentKey: resolution.bestMatch?.componentKey ?? null,
                score: resolution.bestMatch?.score ?? null,
                dartCode: generated.dartCode
              }
            : {
                fileKey: parsed.fileKey,
                nodeId: parsed.nodeId,
                componentKey: resolution.bestMatch?.componentKey ?? null,
                score: resolution.bestMatch?.score ?? null,
                generated
              };

        return ok(output, toResponseOptions(mode, debugTelemetry, data, { effectiveDepth }));
      }, { mode });
    }
  );

  server.registerTool(
    "generate_flutter_page_from_figma",
    {
      description:
        "Generate Flutter page scaffold from a Figma page/frame URL, using DS components when matched.",
      inputSchema: {
        figmaUrl: z.string().url(),
        version: z.string().optional(),
        depth: z.number().int().min(1).max(8).optional(),
        maxNodes: z.number().int().min(10).max(500).optional(),
        responseMode: z.enum(["standard", "compact"]).optional(),
        debugTelemetry: z.boolean().optional()
      },
      annotations: {
        title: "Generate Flutter Page From Figma",
        readOnlyHint: true,
        openWorldHint: false
      }
    },
    async ({ figmaUrl, version, depth, maxNodes, responseMode, debugTelemetry }) => {
      const mode = responseMode ?? "standard";
      const effectiveDepth = depth ?? DEFAULT_PAGE_DEPTH;
      const effectiveMaxNodes = maxNodes ?? DEFAULT_PAGE_MAX_NODES;

      return runTool(async () => {
        const parsed = parseFigmaUrl(figmaUrl);

        if (!parsed.nodeId) {
          throw new AppError("NODE_ID_MISSING", "Figma URL must include node-id.", { figmaUrl });
        }

        const data = await figmaClient.getNodes(parsed.fileKey, parsed.nodeId, {
          version,
          depth: effectiveDepth
        });

        const node = data.nodes?.[parsed.nodeId]?.document;
        if (!node) {
          throw new AppError("FIGMA_NOT_FOUND", "Node not found in Figma response.", {
            fileKey: parsed.fileKey,
            nodeId: parsed.nodeId
          });
        }

        const page = await flutterPageGenerator.generate(node, {
          mode,
          maxNodes: effectiveMaxNodes
        });

        const output =
          mode === "compact"
            ? {
                fileKey: parsed.fileKey,
                nodeId: parsed.nodeId,
                dartCode: page.dartCode,
                stats: page.stats,
                warningCount: page.warnings.length
              }
            : {
                fileKey: parsed.fileKey,
                nodeId: parsed.nodeId,
                generated: page
              };

        return ok(
          output,
          toResponseOptions(mode, debugTelemetry, data, {
            effectiveDepth,
            effectiveMaxNodes
          })
        );
      }, { mode });
    }
  );

  server.registerTool(
    "get_figma_node_from_url",
    {
      description: "Fetch a specific Figma node directly from a full Figma URL.",
      inputSchema: {
        figmaUrl: z.string().url(),
        version: z.string().optional(),
        depth: z.number().int().min(1).optional(),
        geometry: z.enum(["paths"]).optional(),
        responseMode: z.enum(["standard", "compact"]).optional(),
        debugTelemetry: z.boolean().optional()
      },
      annotations: {
        title: "Get Figma Node From URL",
        readOnlyHint: true,
        openWorldHint: false
      }
    },
    async ({ figmaUrl, version, depth, geometry, responseMode, debugTelemetry }) => {
      const mode = responseMode ?? "standard";
      const effectiveDepth = depth ?? DEFAULT_NODE_DEPTH;

      return runTool(async () => {
        const parsed = parseFigmaUrl(figmaUrl);

        if (!parsed.nodeId) {
          throw new AppError("NODE_ID_MISSING", "Figma URL must include node-id.", { figmaUrl });
        }

        const data = await figmaClient.getNodes(parsed.fileKey, parsed.nodeId, {
          version,
          depth: effectiveDepth,
          geometry
        });

        if (mode === "compact") {
          const node = data.nodes?.[parsed.nodeId]?.document;
          const extracted = collectNormalizedData(node);

          return ok(
            {
              fileKey: parsed.fileKey,
              nodeId: parsed.nodeId,
              nodeSummary: extractNodeSummary(node),
              extractedCounts: extractedCounts(extracted)
            },
            toResponseOptions(mode, debugTelemetry, data, { effectiveDepth })
          );
        }

        return ok(
          {
            fileKey: parsed.fileKey,
            nodeId: parsed.nodeId,
            data
          },
          toResponseOptions(mode, debugTelemetry, data, { effectiveDepth })
        );
      }, { mode });
    }
  );

  server.registerTool(
    "get_figma_node_normalized",
    {
      description:
        "Fetch a Figma node from URL and return normalized metadata, tokens, styles, and asset refs.",
      inputSchema: {
        figmaUrl: z.string().url(),
        version: z.string().optional(),
        depth: z.number().int().min(1).optional(),
        includeRawNode: z.boolean().optional(),
        responseMode: z.enum(["standard", "compact"]).optional(),
        debugTelemetry: z.boolean().optional()
      },
      annotations: {
        title: "Get Figma Node Normalized",
        readOnlyHint: true,
        openWorldHint: false
      }
    },
    async ({ figmaUrl, version, depth, includeRawNode, responseMode, debugTelemetry }) => {
      const mode = responseMode ?? "standard";
      const effectiveDepth = depth ?? DEFAULT_NODE_DEPTH;

      return runTool(async () => {
        const parsed = parseFigmaUrl(figmaUrl);

        if (!parsed.nodeId) {
          throw new AppError("NODE_ID_MISSING", "Figma URL must include node-id.", { figmaUrl });
        }

        const data = await figmaClient.getNodes(parsed.fileKey, parsed.nodeId, {
          version,
          depth: effectiveDepth
        });

        const node = data.nodes?.[parsed.nodeId]?.document;

        if (!node) {
          throw new AppError("FIGMA_NOT_FOUND", "Node not found in Figma response.", {
            fileKey: parsed.fileKey,
            nodeId: parsed.nodeId
          });
        }

        const extracted = collectNormalizedData(node);

        if (mode === "compact") {
          return ok(
            {
              meta: {
                fileKey: parsed.fileKey,
                nodeId: parsed.nodeId,
                fileName: data.name ?? null,
                lastModified: data.lastModified ?? null,
                version: data.version ?? null
              },
              nodeSummary: extractNodeSummary(node),
              extractedCounts: extractedCounts(extracted)
            },
            toResponseOptions(mode, debugTelemetry, data, { effectiveDepth })
          );
        }

        return ok({
          meta: {
            fileKey: parsed.fileKey,
            nodeId: parsed.nodeId,
            fileName: data.name ?? null,
            lastModified: data.lastModified ?? null,
            version: data.version ?? null
          },
          nodeSummary: extractNodeSummary(node),
          extracted,
          rawNode: includeRawNode ? node : undefined
        }, toResponseOptions(mode, debugTelemetry, data, { effectiveDepth }));
      }, { mode });
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
        format: z.enum(["jpg", "png", "svg", "pdf"]).optional(),
        responseMode: z.enum(["standard", "compact"]).optional(),
        debugTelemetry: z.boolean().optional()
      },
      annotations: {
        title: "Get Figma Images",
        readOnlyHint: true,
        openWorldHint: false
      }
    },
    async ({ fileKey, nodeIds, version, scale, format, responseMode, debugTelemetry }) => {
      const mode = responseMode ?? "standard";
      return runTool(async () => {
        const normalizedNodeIds = parseNodeIds(nodeIds).join(",");
        const data = await figmaClient.getImages(fileKey, normalizedNodeIds, {
          version,
          scale,
          format
        });

        if (mode === "compact") {
          const root = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
          const images =
            root.images && typeof root.images === "object"
              ? (root.images as Record<string, unknown>)
              : {};
          const errors =
            root.err && typeof root.err === "object" ? (root.err as Record<string, unknown>) : {};

          return ok(
            {
              imageCount: Object.values(images).filter((value) => typeof value === "string" && value).length,
              errorCount: Object.keys(errors).length,
              failedNodeIds: Object.keys(errors)
            },
            toResponseOptions(mode, debugTelemetry, data)
          );
        }

        return ok(data, toResponseOptions(mode, debugTelemetry, data));
      }, { mode });
    }
  );

  server.registerTool(
    "get_figma_components",
    {
      description: "Fetch published components found in a Figma file.",
      inputSchema: {
        fileKey: z.string().min(1),
        responseMode: z.enum(["standard", "compact"]).optional(),
        debugTelemetry: z.boolean().optional()
      },
      annotations: {
        title: "Get Figma Components",
        readOnlyHint: true,
        openWorldHint: false
      }
    },
    async ({ fileKey, responseMode, debugTelemetry }) => {
      const mode = responseMode ?? "standard";
      return runTool(async () => {
        const data = await figmaClient.getComponents(fileKey);
        const output = mode === "compact" ? summarizeTopLevel(data) : data;
        return ok(output, toResponseOptions(mode, debugTelemetry, data));
      }, { mode });
    }
  );

  server.registerTool(
    "get_figma_styles",
    {
      description: "Fetch published styles found in a Figma file.",
      inputSchema: {
        fileKey: z.string().min(1),
        responseMode: z.enum(["standard", "compact"]).optional(),
        debugTelemetry: z.boolean().optional()
      },
      annotations: {
        title: "Get Figma Styles",
        readOnlyHint: true,
        openWorldHint: false
      }
    },
    async ({ fileKey, responseMode, debugTelemetry }) => {
      const mode = responseMode ?? "standard";
      return runTool(async () => {
        const data = await figmaClient.getStyles(fileKey);
        const output = mode === "compact" ? summarizeTopLevel(data) : data;
        return ok(output, toResponseOptions(mode, debugTelemetry, data));
      }, { mode });
    }
  );

  server.registerTool(
    "get_figma_variables",
    {
      description: "Fetch local variables and collections from a Figma file.",
      inputSchema: {
        fileKey: z.string().min(1),
        responseMode: z.enum(["standard", "compact"]).optional(),
        debugTelemetry: z.boolean().optional()
      },
      annotations: {
        title: "Get Figma Variables",
        readOnlyHint: true,
        openWorldHint: false
      }
    },
    async ({ fileKey, responseMode, debugTelemetry }) => {
      const mode = responseMode ?? "standard";
      return runTool(async () => {
        const data = await figmaClient.getVariables(fileKey);
        const output = mode === "compact" ? summarizeTopLevel(data) : data;
        return ok(output, toResponseOptions(mode, debugTelemetry, data));
      }, { mode });
    }
  );
}
