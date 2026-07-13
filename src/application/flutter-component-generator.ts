import { AppError } from "../core/errors.js";
import { MappingResolution } from "./component-matcher.js";

type NodeRecord = Record<string, unknown>;

function asRecord(value: unknown): NodeRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as NodeRecord;
}

function toDartLiteral(value: unknown): string {
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }

  if (typeof value === "string") {
    const lowered = value.toLowerCase();
    if (lowered === "true" || lowered === "false") {
      return lowered;
    }

    if (!Number.isNaN(Number(value))) {
      return value;
    }

    const escaped = value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    return `'${escaped}'`;
  }

  return "null";
}

function normalizeFigmaPropEntries(node: unknown): Record<string, unknown> {
  const props = asRecord(asRecord(node).componentProperties);
  const normalized: Record<string, unknown> = {};

  for (const [key, rawValue] of Object.entries(props)) {
    const normalizedKey = key.split("#")[0].trim();
    const valueRecord = asRecord(rawValue);

    if (typeof valueRecord.value === "string" || typeof valueRecord.value === "number") {
      normalized[normalizedKey] = valueRecord.value;
      continue;
    }

    if (typeof valueRecord.type === "string" && typeof valueRecord.defaultValue === "string") {
      normalized[normalizedKey] = valueRecord.defaultValue;
      continue;
    }

    if (typeof rawValue === "string" || typeof rawValue === "number" || typeof rawValue === "boolean") {
      normalized[normalizedKey] = rawValue;
    }
  }

  return normalized;
}

export type FlutterGenerationResult = {
  dartCode: string;
  importLine: string;
  widgetLine: string;
  mappedProps: Array<{ figmaProp: string; codeProp: string; value: string }>;
  unmappedFigmaProps: string[];
};

export type FlutterGenerationMode = "standard" | "compact";

export type FlutterGenerationCompactResult = {
  dartCode: string;
  widgetLine: string;
};

export class FlutterComponentGenerator {
  generate(
    node: unknown,
    resolution: MappingResolution,
    mode: FlutterGenerationMode = "standard"
  ): FlutterGenerationResult | FlutterGenerationCompactResult {
    if (!resolution.matched || !resolution.mapping || !resolution.code) {
      throw new AppError("INVALID_INPUT", "Cannot generate component code without a resolved mapping.");
    }

    const figmaProps = normalizeFigmaPropEntries(node);
    const mappedProps: Array<{ figmaProp: string; codeProp: string; value: string }> = [];

    for (const [figmaProp, codeProp] of Object.entries(resolution.mapping.props.map)) {
      const rawValue = figmaProps[figmaProp];

      if (rawValue === undefined) {
        continue;
      }

      mappedProps.push({
        figmaProp,
        codeProp,
        value: toDartLiteral(rawValue)
      });
    }

    const mappedFigmaPropSet = new Set(mappedProps.map((item) => item.figmaProp));
    const unmappedFigmaProps = Object.keys(figmaProps).filter((prop) => !mappedFigmaPropSet.has(prop));

    const propLines = mappedProps.map((item) => `  ${item.codeProp}: ${item.value},`);

    const widgetLine = `${resolution.code.widget}(`;
    const importLine = `import '${resolution.code.import}';`;

    const dartCode = [
      importLine,
      "",
      widgetLine,
      ...propLines,
      ");"
    ].join("\n");

    if (mode === "compact") {
      return {
        dartCode,
        widgetLine
      };
    }

    return {
      dartCode,
      importLine,
      widgetLine,
      mappedProps,
      unmappedFigmaProps
    };
  }
}
