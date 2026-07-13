import test from "node:test";
import assert from "node:assert/strict";

import { ContractValidator } from "./contract-validator.js";
import { ComponentDocContract, FigmaToCodeIndex } from "../core/types.js";

type IndexLoaderLike = {
  load: () => Promise<FigmaToCodeIndex>;
  resolveDocPath: (docPath: string) => string;
};

type DocLoaderLike = {
  load: (docPath: string) => Promise<ComponentDocContract>;
};

function createValidator(indexLoader: IndexLoaderLike, docLoader: DocLoaderLike) {
  return new ContractValidator(indexLoader as never, docLoader as never);
}

test("validateIndexAndDocs returns valid report when index/docs are consistent", async () => {
  const indexLoader: IndexLoaderLike = {
    async load() {
      return {
        version: "1",
        entries: [
          {
            componentKey: "ds.button.primary",
            dsPath: "lib/widgets/ds_button.dart",
            docPath: "lib/widgets/docs/figma-to-code.md",
            figmaAliases: ["Button"],
            figmaComponentIds: ["123:456"],
            status: "ready"
          }
        ]
      };
    },
    resolveDocPath(docPath) {
      return docPath;
    }
  };

  const docLoader: DocLoaderLike = {
    async load() {
      return {
        componentKey: "ds.button.primary",
        figma: {
          componentIds: ["123:456"],
          aliases: ["Button"]
        },
        code: {
          widget: "DsButton",
          import: "package:my_ds/widgets/ds_button.dart"
        },
        props: { map: { label: "text" } },
        variants: { map: {} },
        tokens: { map: {} }
      };
    }
  };

  const validator = createValidator(indexLoader, docLoader);
  const report = await validator.validateIndexAndDocs();

  assert.equal(report.isValid, true);
  assert.equal(report.issues.length, 0);
  assert.equal(report.stats.totalEntries, 1);
  assert.equal(report.stats.readyEntries, 1);
  assert.equal(report.stats.draftEntries, 0);
});

test("validateIndexAndDocs reports duplicate alias and component key mismatch", async () => {
  const indexLoader: IndexLoaderLike = {
    async load() {
      return {
        version: "1",
        entries: [
          {
            componentKey: "ds.button.primary",
            dsPath: "lib/widgets/ds_button.dart",
            docPath: "doc-a.md",
            figmaAliases: ["Button"],
            figmaComponentIds: ["123:456"],
            status: "ready"
          },
          {
            componentKey: "ds.button.secondary",
            dsPath: "lib/widgets/ds_button_secondary.dart",
            docPath: "doc-b.md",
            figmaAliases: ["Button"],
            figmaComponentIds: ["999:111"],
            status: "draft"
          }
        ]
      };
    },
    resolveDocPath(docPath) {
      return docPath;
    }
  };

  const docsByPath: Record<string, ComponentDocContract> = {
    "doc-a.md": {
      componentKey: "ds.button.primary",
      figma: { componentIds: ["123:456"], aliases: ["Button"] },
      code: { widget: "DsButton", import: "package:my_ds/widgets/ds_button.dart" },
      props: { map: { label: "text" } },
      variants: { map: {} },
      tokens: { map: {} }
    },
    "doc-b.md": {
      componentKey: "ds.button.other",
      figma: { componentIds: ["999:111"], aliases: ["Button Secondary"] },
      code: { widget: "DsButtonSecondary", import: "package:my_ds/widgets/ds_button_secondary.dart" },
      props: { map: {} },
      variants: { map: {} },
      tokens: { map: {} }
    }
  };

  const docLoader: DocLoaderLike = {
    async load(docPath) {
      const doc = docsByPath[docPath];
      if (!doc) {
        throw new Error(`Doc not found: ${docPath}`);
      }
      return doc;
    }
  };

  const validator = createValidator(indexLoader, docLoader);
  const report = await validator.validateIndexAndDocs();

  assert.equal(report.isValid, false);
  assert.equal(report.stats.totalEntries, 2);

  const codes = report.issues.map((issue) => issue.code);
  assert.ok(codes.includes("DUPLICATE_ALIAS"));
  assert.ok(codes.includes("COMPONENT_KEY_MISMATCH"));
});
