import { AppError } from "../core/errors.js";

export type FigmaFileResponse = {
  name?: string;
  lastModified?: string;
  version?: string;
  document?: unknown;
  components?: Record<string, unknown>;
  componentSets?: Record<string, unknown>;
  styles?: Record<string, unknown>;
};

export type FigmaNodesResponse = {
  name?: string;
  lastModified?: string;
  version?: string;
  nodes?: Record<string, { document?: unknown }>;
};

type NodeRequestOptions = {
  version?: string;
  depth?: number;
  geometry?: "paths";
};

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

export class FigmaApiClient {
  private readonly nodesCache = new Map<string, CacheEntry<FigmaNodesResponse>>();
  private readonly nodesCacheTtlMs: number;

  constructor(private readonly token: string) {
    const envTtl = Number(process.env.FIGMA_NODES_CACHE_TTL_MS);
    this.nodesCacheTtlMs = Number.isFinite(envTtl) && envTtl >= 0 ? envTtl : 90_000;
  }

  async getFile(fileKey: string, version?: string) {
    const query = version ? `?version=${encodeURIComponent(version)}` : "";
    return this.fetchJson<FigmaFileResponse>(`/v1/files/${fileKey}${query}`);
  }

  async getNodes(fileKey: string, nodeIdsCsv: string, options?: NodeRequestOptions) {
    const cacheKey = [
      fileKey,
      nodeIdsCsv,
      options?.version ?? "",
      options?.depth === undefined ? "" : String(options.depth),
      options?.geometry ?? ""
    ].join("|");

    const cached = this.getCachedNodes(cacheKey);
    if (cached) {
      return cached;
    }

    const params = new URLSearchParams({ ids: nodeIdsCsv });

    if (options?.version) params.set("version", options.version);
    if (options?.depth) params.set("depth", String(options.depth));
    if (options?.geometry) params.set("geometry", options.geometry);

    const response = await this.fetchJson<FigmaNodesResponse>(
      `/v1/files/${fileKey}/nodes?${params.toString()}`
    );
    this.setCachedNodes(cacheKey, response);
    return response;
  }

  async getImages(
    fileKey: string,
    nodeIdsCsv: string,
    options?: { version?: string; scale?: number; format?: "jpg" | "png" | "svg" | "pdf" }
  ) {
    const params = new URLSearchParams({ ids: nodeIdsCsv });

    if (options?.version) params.set("version", options.version);
    if (options?.scale) params.set("scale", String(options.scale));
    if (options?.format) params.set("format", options.format);

    return this.fetchJson<unknown>(`/v1/images/${fileKey}?${params.toString()}`);
  }

  async getComponents(fileKey: string) {
    return this.fetchJson<unknown>(`/v1/files/${fileKey}/components`);
  }

  async getStyles(fileKey: string) {
    return this.fetchJson<unknown>(`/v1/files/${fileKey}/styles`);
  }

  async getVariables(fileKey: string) {
    return this.fetchJson<unknown>(`/v1/files/${fileKey}/variables/local`);
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const response = await fetch(`https://api.figma.com${path}`, {
      headers: {
        "X-Figma-Token": this.token,
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      const message = await response.text();

      if (response.status === 401 || response.status === 403) {
        throw new AppError("FIGMA_UNAUTHORIZED", "Figma token unauthorized.", {
          status: response.status,
          response: message
        });
      }

      if (response.status === 404) {
        throw new AppError("FIGMA_NOT_FOUND", "Requested Figma resource not found.", {
          status: response.status,
          response: message
        });
      }

      if (response.status === 429) {
        throw new AppError("FIGMA_RATE_LIMIT", "Figma API rate limit exceeded.", {
          status: response.status,
          response: message
        });
      }

      throw new AppError("FIGMA_API_ERROR", "Figma API request failed.", {
        status: response.status,
        response: message
      });
    }

    return response.json() as Promise<T>;
  }

  private getCachedNodes(key: string): FigmaNodesResponse | null {
    if (this.nodesCacheTtlMs <= 0) {
      return null;
    }

    const entry = this.nodesCache.get(key);
    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.nodesCache.delete(key);
      return null;
    }

    return entry.value;
  }

  private setCachedNodes(key: string, value: FigmaNodesResponse): void {
    if (this.nodesCacheTtlMs <= 0) {
      return;
    }

    this.nodesCache.set(key, {
      value,
      expiresAt: Date.now() + this.nodesCacheTtlMs
    });
  }
}
