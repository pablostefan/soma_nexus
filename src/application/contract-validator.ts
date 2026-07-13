import { ValidationIssue, ValidationReport } from "../core/types.js";
import { ComponentDocLoader } from "../infrastructure/component-doc-loader.js";
import { MappingIndexLoader } from "../infrastructure/mapping-index-loader.js";

export class ContractValidator {
  constructor(
    private readonly indexLoader: MappingIndexLoader,
    private readonly docLoader: ComponentDocLoader
  ) {}

  async validateIndexAndDocs(): Promise<ValidationReport> {
    const index = await this.indexLoader.load();
    const issues: ValidationIssue[] = [];

    const aliasOwner = new Map<string, string>();
    const componentIdOwner = new Map<string, string>();

    for (const entry of index.entries) {
      for (const alias of entry.figmaAliases) {
        const normalized = alias.toLowerCase();
        const owner = aliasOwner.get(normalized);

        if (owner && owner !== entry.componentKey) {
          issues.push({
            level: "error",
            code: "DUPLICATE_ALIAS",
            message: `Alias '${alias}' is used by multiple components (${owner}, ${entry.componentKey}).`,
            componentKey: entry.componentKey,
            docPath: entry.docPath
          });
        } else {
          aliasOwner.set(normalized, entry.componentKey);
        }
      }

      for (const componentId of entry.figmaComponentIds) {
        const owner = componentIdOwner.get(componentId);

        if (owner && owner !== entry.componentKey) {
          issues.push({
            level: "error",
            code: "DUPLICATE_COMPONENT_ID",
            message: `Figma component id '${componentId}' is mapped to multiple components (${owner}, ${entry.componentKey}).`,
            componentKey: entry.componentKey,
            docPath: entry.docPath
          });
        } else {
          componentIdOwner.set(componentId, entry.componentKey);
        }
      }

      const resolvedDocPath = this.indexLoader.resolveDocPath(entry.docPath);

      try {
        const doc = await this.docLoader.load(resolvedDocPath);

        if (doc.componentKey !== entry.componentKey) {
          issues.push({
            level: "error",
            code: "COMPONENT_KEY_MISMATCH",
            message: `componentKey mismatch between index (${entry.componentKey}) and doc (${doc.componentKey}).`,
            componentKey: entry.componentKey,
            docPath: entry.docPath
          });
        }

        if (doc.figma.aliases.length === 0 && doc.figma.componentIds.length === 0) {
          issues.push({
            level: "warning",
            code: "EMPTY_MATCH_KEYS",
            message: "Component doc has no aliases and no figma component ids.",
            componentKey: entry.componentKey,
            docPath: entry.docPath
          });
        }
      } catch (error) {
        issues.push({
          level: "error",
          code: "DOC_LOAD_ERROR",
          message: error instanceof Error ? error.message : String(error),
          componentKey: entry.componentKey,
          docPath: entry.docPath
        });
      }
    }

    const readyEntries = index.entries.filter((entry) => entry.status === "ready").length;
    const report: ValidationReport = {
      isValid: !issues.some((issue) => issue.level === "error"),
      stats: {
        totalEntries: index.entries.length,
        readyEntries,
        draftEntries: index.entries.length - readyEntries
      },
      issues
    };

    return report;
  }
}
