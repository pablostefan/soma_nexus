import { readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

import { AppError } from "../core/errors.js";
import { FigmaToCodeIndex, FigmaToCodeIndexEntry } from "../core/types.js";

const DEFAULT_INDEX_PATH = "docs/figma-to-code-index.yaml";

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim());
}

function validateIndexEntry(raw: unknown, index: number): FigmaToCodeIndexEntry {
  if (!raw || typeof raw !== "object") {
    throw new AppError("CONTRACT_INVALID", "Index entry must be an object.", { index });
  }

  const entry = raw as Record<string, unknown>;
  const statusRaw = entry.status;
  const status = statusRaw === "ready" ? "ready" : "draft";

  if (typeof entry.componentKey !== "string" || !entry.componentKey.trim()) {
    throw new AppError("CONTRACT_INVALID", "componentKey is required in index entry.", { index });
  }

  if (typeof entry.dsPath !== "string" || !entry.dsPath.trim()) {
    throw new AppError("CONTRACT_INVALID", "dsPath is required in index entry.", { index });
  }

  if (typeof entry.docPath !== "string" || !entry.docPath.trim()) {
    throw new AppError("CONTRACT_INVALID", "docPath is required in index entry.", { index });
  }

  const componentDocPath =
    typeof entry.componentDocPath === "string" && entry.componentDocPath.trim()
      ? entry.componentDocPath.trim()
      : undefined;

  const accessibilityDocPath =
    typeof entry.accessibilityDocPath === "string" && entry.accessibilityDocPath.trim()
      ? entry.accessibilityDocPath.trim()
      : undefined;

  return {
    componentKey: entry.componentKey.trim(),
    dsPath: entry.dsPath.trim(),
    docPath: entry.docPath.trim(),
    componentDocPath,
    accessibilityDocPath,
    figmaAliases: normalizeStringArray(entry.figmaAliases),
    figmaComponentIds: normalizeStringArray(entry.figmaComponentIds),
    status
  };
}

export class MappingIndexLoader {
  constructor(private readonly projectRoot: string = process.cwd()) {}

  private resolveIndexPath(): string {
    const customPath = process.env.FIGMA_TO_CODE_INDEX_PATH;
    return path.resolve(this.projectRoot, customPath ?? DEFAULT_INDEX_PATH);
  }

  resolveDocPath(docPath: string): string {
    return path.resolve(this.projectRoot, docPath);
  }

  async load(): Promise<FigmaToCodeIndex> {
    const indexPath = this.resolveIndexPath();

    let fileContent: string;
    try {
      fileContent = await readFile(indexPath, "utf8");
    } catch (error) {
      throw new AppError("CONTRACT_NOT_FOUND", "Could not read figma-to-code index file.", {
        indexPath,
        cause: error instanceof Error ? error.message : String(error)
      });
    }

    let parsed: unknown;
    try {
      parsed = YAML.parse(fileContent);
    } catch (error) {
      throw new AppError("CONTRACT_INVALID", "Index YAML is invalid.", {
        indexPath,
        cause: error instanceof Error ? error.message : String(error)
      });
    }

    if (!parsed || typeof parsed !== "object") {
      throw new AppError("CONTRACT_INVALID", "Index root must be an object.", { indexPath });
    }

    const root = parsed as Record<string, unknown>;
    const version = typeof root.version === "string" && root.version.trim() ? root.version.trim() : "1";

    if (!Array.isArray(root.entries)) {
      throw new AppError("CONTRACT_INVALID", "Index must contain entries array.", { indexPath });
    }

    return {
      version,
      entries: root.entries.map((entry, index) => validateIndexEntry(entry, index))
    };
  }
}
