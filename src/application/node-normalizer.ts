type NodeRecord = Record<string, unknown>;

export function extractNodeSummary(node: unknown) {
  if (!node || typeof node !== "object") {
    return null;
  }

  const typedNode = node as NodeRecord;
  const children = Array.isArray(typedNode.children) ? typedNode.children : [];

  return {
    id: typedNode.id ?? null,
    name: typedNode.name ?? null,
    type: typedNode.type ?? null,
    childCount: children.length,
    absoluteBoundingBox: typedNode.absoluteBoundingBox ?? null
  };
}

export function collectNormalizedData(node: unknown) {
  const colors = new Set<string>();
  const imageRefs = new Set<string>();
  const styleRefs = new Set<string>();
  const componentIds = new Set<string>();
  const instanceComponentIds = new Set<string>();
  const textStyles = new Set<string>();

  function walk(current: unknown) {
    if (!current || typeof current !== "object") {
      return;
    }

    const typedNode = current as NodeRecord;

    if (typedNode.componentId && typeof typedNode.componentId === "string") {
      instanceComponentIds.add(typedNode.componentId);
    }

    if (typedNode.id && typedNode.type === "COMPONENT" && typeof typedNode.id === "string") {
      componentIds.add(typedNode.id);
    }

    const styles = typedNode.styles;
    if (styles && typeof styles === "object") {
      for (const value of Object.values(styles as NodeRecord)) {
        if (typeof value === "string") {
          styleRefs.add(value);
        }
      }
    }

    const style = typedNode.style;
    if (style && typeof style === "object") {
      const fontFamily = (style as NodeRecord).fontFamily;
      const fontStyle = (style as NodeRecord).fontStyle;

      if (typeof fontFamily === "string") {
        textStyles.add(typeof fontStyle === "string" ? `${fontFamily}:${fontStyle}` : fontFamily);
      }
    }

    const fills = typedNode.fills;
    if (Array.isArray(fills)) {
      for (const fill of fills) {
        if (!fill || typeof fill !== "object") {
          continue;
        }

        const typedFill = fill as NodeRecord;

        if (typedFill.type === "IMAGE" && typeof typedFill.imageRef === "string") {
          imageRefs.add(typedFill.imageRef);
        }

        const color = typedFill.color;
        if (color && typeof color === "object") {
          const typedColor = color as NodeRecord;
          const r = Number(typedColor.r);
          const g = Number(typedColor.g);
          const b = Number(typedColor.b);
          const a = typedColor.a === undefined ? 1 : Number(typedColor.a);

          if ([r, g, b, a].every((value) => Number.isFinite(value))) {
            colors.add(`${r.toFixed(3)},${g.toFixed(3)},${b.toFixed(3)},${a.toFixed(3)}`);
          }
        }
      }
    }

    const children = typedNode.children;
    if (Array.isArray(children)) {
      for (const child of children) {
        walk(child);
      }
    }
  }

  walk(node);

  return {
    colors: Array.from(colors),
    styleRefs: Array.from(styleRefs),
    textStyles: Array.from(textStyles),
    imageRefs: Array.from(imageRefs),
    componentIds: Array.from(componentIds),
    instanceComponentIds: Array.from(instanceComponentIds)
  };
}
