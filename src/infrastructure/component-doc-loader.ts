import { readFile } from "node:fs/promises";
import YAML from "yaml";

import { AppError } from "../core/errors.js";
import { ComponentDocContract } from "../core/types.js";

const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)\n---\s*\n?/;

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim());
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

export class ComponentDocLoader {
  async load(docPath: string): Promise<ComponentDocContract> {
    let markdown: string;
    try {
      markdown = await readFile(docPath, "utf8");
    } catch (error) {
      throw new AppError("CONTRACT_NOT_FOUND", "Component figma-to-code doc not found.", {
        docPath,
        cause: error instanceof Error ? error.message : String(error)
      });
    }

    const frontmatterMatch = markdown.match(FRONTMATTER_REGEX);
    if (!frontmatterMatch) {
      throw new AppError("CONTRACT_INVALID", "Component doc must include YAML frontmatter.", {
        docPath
      });
    }

    let parsed: unknown;
    try {
      parsed = YAML.parse(frontmatterMatch[1]);
    } catch (error) {
      throw new AppError("CONTRACT_INVALID", "Component doc frontmatter YAML is invalid.", {
        docPath,
        cause: error instanceof Error ? error.message : String(error)
      });
    }

    const root = asRecord(parsed);
    const figma = asRecord(root.figma);
    const code = asRecord(root.code);
    const props = asRecord(root.props);
    const variants = asRecord(root.variants);
    const tokens = asRecord(root.tokens);

    const componentKey = typeof root.componentKey === "string" ? root.componentKey.trim() : "";
    const widget = typeof code.widget === "string" ? code.widget.trim() : "";
    const importPath = typeof code.import === "string" ? code.import.trim() : "";

    if (!componentKey || !widget || !importPath) {
      throw new AppError("CONTRACT_INVALID", "componentKey, code.widget and code.import are required.", {
        docPath
      });
    }

    return {
      componentKey,
      figma: {
        componentIds: asStringArray(figma.componentIds),
        aliases: asStringArray(figma.aliases)
      },
      code: {
        widget,
        import: importPath
      },
      props: {
        map: asRecord(props.map) as Record<string, string>
      },
      variants: {
        map: asRecord(variants.map) as Record<string, Record<string, string>>
      },
      tokens: {
        map: asRecord(tokens.map) as Record<string, string>
      },
      examples: asStringArray(root.examples),
      priority: typeof root.priority === "number" ? root.priority : undefined
    };
  }
}
