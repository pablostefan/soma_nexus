import { AppError } from "../core/errors.js";

export type ParsedFigmaUrl = {
  fileKey: string;
  nodeId?: string;
};

export function toNodeId(value: string): string {
  return value.trim().replace(/-/g, ":");
}

export function parseNodeIds(nodeIds: string): string[] {
  const ids = nodeIds
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .map(toNodeId);

  if (ids.length === 0) {
    throw new AppError("INVALID_INPUT", "nodeIds must include at least one node id.");
  }

  return ids;
}

export function parseFigmaUrl(figmaUrl: string): ParsedFigmaUrl {
  let url: URL;

  try {
    url = new URL(figmaUrl);
  } catch {
    throw new AppError("INVALID_URL", "Invalid Figma URL.", { figmaUrl });
  }

  if (!/(^|\.)figma\.com$/.test(url.hostname)) {
    throw new AppError("INVALID_URL", "URL host must be figma.com.", { figmaUrl });
  }

  const pathSegments = url.pathname.split("/").filter(Boolean);
  const route = pathSegments[0];
  const fileKey = pathSegments[1];

  if (!["design", "file", "proto"].includes(route) || !fileKey) {
    throw new AppError("INVALID_URL", "Could not extract fileKey from Figma URL.", { figmaUrl });
  }

  const nodeIdRaw = url.searchParams.get("node-id") ?? undefined;

  return {
    fileKey,
    nodeId: nodeIdRaw ? toNodeId(nodeIdRaw) : undefined
  };
}
