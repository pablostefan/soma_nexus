import { AppError } from "../core/errors.js";
import { ComponentMatcher } from "./component-matcher.js";
import { FlutterComponentGenerator, FlutterGenerationMode } from "./flutter-component-generator.js";

type NodeRecord = Record<string, unknown>;

type PageGeneratorOptions = {
  mode?: FlutterGenerationMode;
  maxNodes?: number;
};

type PageGenerationStats = {
  visitedNodes: number;
  mappedNodes: number;
  fallbackNodes: number;
  truncated: boolean;
};

export type FlutterPageGenerationResult = {
  dartCode: string;
  imports: string[];
  stats: PageGenerationStats;
  warnings: string[];
};

function asRecord(value: unknown): NodeRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as NodeRecord;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNodeArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function escapeDartText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, " ");
}

function indentLines(code: string, level: number): string {
  const indent = "  ".repeat(level);
  return code
    .split("\n")
    .map((line) => `${indent}${line}`)
    .join("\n");
}

export class FlutterPageGenerator {
  constructor(
    private readonly matcher: ComponentMatcher,
    private readonly componentGenerator: FlutterComponentGenerator
  ) {}

  async generate(node: unknown, options?: PageGeneratorOptions): Promise<FlutterPageGenerationResult> {
    const mode = options?.mode ?? "standard";
    const maxNodes = options?.maxNodes ?? 120;

    if (maxNodes < 1) {
      throw new AppError("INVALID_INPUT", "maxNodes must be greater than zero.");
    }

    const imports = new Set<string>();
    const warnings: string[] = [];
    const stats: PageGenerationStats = {
      visitedNodes: 0,
      mappedNodes: 0,
      fallbackNodes: 0,
      truncated: false
    };

    const rootWidget = await this.buildWidgetTree(node, imports, stats, warnings, maxNodes, 3);

    const pageName = asString(asRecord(node).name) ?? "GeneratedFigmaPage";
    const className = this.toValidClassName(pageName);
    imports.add("import 'package:flutter/material.dart';");

    const importBlock = Array.from(imports).sort().join("\n");

    const dartCode = [
      importBlock,
      "",
      `class ${className} extends StatelessWidget {`,
      `  const ${className}({super.key});`,
      "",
      "  @override",
      "  Widget build(BuildContext context) {",
      "    return Scaffold(",
      "      body: SafeArea(",
      "        child: SingleChildScrollView(",
      "          child: Padding(",
      "            padding: const EdgeInsets.all(16),",
      "            child:",
      indentLines(rootWidget, 6) + ",",
      "          ),",
      "        ),",
      "      ),",
      "    );",
      "  }",
      "}"
    ].join("\n");

    if (mode === "compact") {
      return {
        dartCode,
        imports: Array.from(imports).sort(),
        stats,
        warnings: warnings.slice(0, 5)
      };
    }

    return {
      dartCode,
      imports: Array.from(imports).sort(),
      stats,
      warnings
    };
  }

  private async buildWidgetTree(
    node: unknown,
    imports: Set<string>,
    stats: PageGenerationStats,
    warnings: string[],
    maxNodes: number,
    depthLeft: number
  ): Promise<string> {
    if (stats.visitedNodes >= maxNodes) {
      stats.truncated = true;
      warnings.push("Page generation truncated because maxNodes limit was reached.");
      return "const SizedBox.shrink()";
    }

    stats.visitedNodes += 1;

    const nodeRecord = asRecord(node);
    const nodeType = asString(nodeRecord.type) ?? "UNKNOWN";
    const nodeName = asString(nodeRecord.name) ?? "Unnamed";

    if (depthLeft < 0) {
      warnings.push(`Depth limit reached at node '${nodeName}'.`);
      return "const SizedBox.shrink()";
    }

    const resolution = await this.matcher.resolveFromNode(node, {
      maxCandidates: 3,
      includeMapping: true
    });

    if (resolution.matched) {
      try {
        const invocation = this.componentGenerator.generateInvocation(node, resolution);
        imports.add(invocation.importLine);
        stats.mappedNodes += 1;
        return invocation.widgetInvocation;
      } catch {
        // Fall through to generic rendering when DS invocation fails for this node.
      }
    }

    stats.fallbackNodes += 1;

    if (nodeType === "TEXT") {
      const text = asString(nodeRecord.characters);
      if (text) {
        return `Text('${escapeDartText(text)}')`;
      }
    }

    const children = asNodeArray(nodeRecord.children);
    if (children.length > 0) {
      const childWidgets: string[] = [];
      for (const child of children) {
        const childWidget = await this.buildWidgetTree(
          child,
          imports,
          stats,
          warnings,
          maxNodes,
          depthLeft - 1
        );
        childWidgets.push(childWidget);
      }

      const childrenBlock = childWidgets.map((widget) => indentLines(`${widget},`, 2)).join("\n");
      return [
        "Column(",
        "  crossAxisAlignment: CrossAxisAlignment.start,",
        "  children: [",
        childrenBlock,
        "  ],",
        ")"
      ].join("\n");
    }

    warnings.push(`Fallback used for node '${nodeName}' (${nodeType}).`);
    return "const SizedBox.shrink()";
  }

  private toValidClassName(rawName: string): string {
    const base = rawName
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("");

    if (!base) {
      return "GeneratedFigmaPage";
    }

    return /^[A-Z]/.test(base) ? base : `Generated${base}`;
  }
}
