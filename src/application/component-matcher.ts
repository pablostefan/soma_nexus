import { collectNormalizedData } from "./node-normalizer.js";
import { ComponentDocContract } from "../core/types.js";
import { ComponentDocLoader } from "../infrastructure/component-doc-loader.js";
import { MappingIndexLoader } from "../infrastructure/mapping-index-loader.js";

type MatchReasonType = "componentId" | "aliasExact" | "aliasContains";

export type MatchReason = {
  type: MatchReasonType;
  value: string;
};

export type MatchCandidate = {
  componentKey: string;
  score: number;
  reasons: MatchReason[];
  docPath: string;
};

export type MappingResolution = {
  matched: boolean;
  bestMatch: MatchCandidate | null;
  nodeContext: {
    id: string | null;
    name: string | null;
    type: string | null;
    componentId: string | null;
    detectedComponentIds: string[];
  };
  code: {
    widget: string;
    import: string;
  } | null;
  mapping: ComponentDocContract | null;
  candidates: MatchCandidate[];
};

type ResolveOptions = {
  maxCandidates?: number;
  includeMapping?: boolean;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export class ComponentMatcher {
  constructor(
    private readonly indexLoader: MappingIndexLoader,
    private readonly docLoader: ComponentDocLoader
  ) {}

  private async loadDoc(entryDocPath: string): Promise<ComponentDocContract> {
    const resolvedDocPath = this.indexLoader.resolveDocPath(entryDocPath);
    return this.docLoader.load(resolvedDocPath);
  }

  async resolveFromNode(node: unknown, options?: ResolveOptions): Promise<MappingResolution> {
    const nodeRecord = asRecord(node);
    const nodeId = asString(nodeRecord.id);
    const nodeName = asString(nodeRecord.name);
    const nodeType = asString(nodeRecord.type);
    const nodeComponentId = asString(nodeRecord.componentId);

    const extracted = collectNormalizedData(node);
    const detectedIds = new Set<string>([
      ...extracted.componentIds,
      ...extracted.instanceComponentIds,
      ...(nodeId ? [nodeId] : []),
      ...(nodeComponentId ? [nodeComponentId] : [])
    ]);

    const normalizedName = (nodeName ?? "").toLowerCase();
    const index = await this.indexLoader.load();
    const maxCandidates = options?.maxCandidates ?? Number.POSITIVE_INFINITY;
    const includeMapping = options?.includeMapping ?? true;
    const candidates: Array<MatchCandidate & { priority: number }> = [];

    for (const entry of index.entries) {
      const doc = await this.loadDoc(entry.docPath);
      const reasons: MatchReason[] = [];
      let score = 0;

      const allComponentIds = new Set<string>([...entry.figmaComponentIds, ...doc.figma.componentIds]);
      for (const componentId of allComponentIds) {
        if (detectedIds.has(componentId)) {
          reasons.push({ type: "componentId", value: componentId });
          score = Math.max(score, 100);
          break;
        }
      }

      const allAliases = [...entry.figmaAliases, ...doc.figma.aliases]
        .map((alias) => alias.trim())
        .filter(Boolean);

      for (const alias of allAliases) {
        const normalizedAlias = alias.toLowerCase();
        if (!normalizedAlias || !normalizedName) {
          continue;
        }

        if (normalizedAlias === normalizedName) {
          reasons.push({ type: "aliasExact", value: alias });
          score = Math.max(score, 80);
          continue;
        }

        if (normalizedName.includes(normalizedAlias) || normalizedAlias.includes(normalizedName)) {
          reasons.push({ type: "aliasContains", value: alias });
          score = Math.max(score, 60);
        }
      }

      if (score > 0) {
        candidates.push({
          componentKey: entry.componentKey,
          docPath: entry.docPath,
          reasons,
          score,
          priority: doc.priority ?? 0
        });
      }
    }

    candidates.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return b.priority - a.priority;
    });

    const bestCandidate = candidates[0];

    if (!bestCandidate) {
      return {
        matched: false,
        bestMatch: null,
        nodeContext: {
          id: nodeId,
          name: nodeName,
          type: nodeType,
          componentId: nodeComponentId,
          detectedComponentIds: Array.from(detectedIds)
        },
        code: null,
        mapping: null,
        candidates: []
      };
    }

    const bestDoc = await this.loadDoc(bestCandidate.docPath);

    return {
      matched: true,
      bestMatch: {
        componentKey: bestCandidate.componentKey,
        score: bestCandidate.score,
        reasons: bestCandidate.reasons,
        docPath: bestCandidate.docPath
      },
      nodeContext: {
        id: nodeId,
        name: nodeName,
        type: nodeType,
        componentId: nodeComponentId,
        detectedComponentIds: Array.from(detectedIds)
      },
      code: {
        widget: bestDoc.code.widget,
        import: bestDoc.code.import
      },
      mapping: includeMapping ? bestDoc : null,
      candidates: candidates.slice(0, maxCandidates).map((candidate) => ({
        componentKey: candidate.componentKey,
        score: candidate.score,
        reasons: candidate.reasons,
        docPath: candidate.docPath
      }))
    };
  }
}
