export type MappingStatus = "draft" | "ready";

export type FigmaToCodeIndexEntry = {
  componentKey: string;
  dsPath: string;
  docPath: string;
  figmaAliases: string[];
  figmaComponentIds: string[];
  status: MappingStatus;
};

export type FigmaToCodeIndex = {
  version: string;
  entries: FigmaToCodeIndexEntry[];
};

export type ComponentDocPropMap = Record<string, string>;
export type ComponentDocVariantMap = Record<string, Record<string, string>>;
export type ComponentDocTokenMap = Record<string, string>;

export type ComponentDocContract = {
  componentKey: string;
  figma: {
    componentIds: string[];
    aliases: string[];
  };
  code: {
    widget: string;
    import: string;
  };
  props: {
    map: ComponentDocPropMap;
  };
  variants: {
    map: ComponentDocVariantMap;
  };
  tokens: {
    map: ComponentDocTokenMap;
  };
  examples?: string[];
  priority?: number;
};

export type ValidationLevel = "error" | "warning";

export type ValidationIssue = {
  level: ValidationLevel;
  code: string;
  message: string;
  componentKey?: string;
  docPath?: string;
};

export type ValidationReport = {
  isValid: boolean;
  stats: {
    totalEntries: number;
    readyEntries: number;
    draftEntries: number;
  };
  issues: ValidationIssue[];
};
