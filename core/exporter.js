function buildFlowmapExport(appState) {
  if (!appState || !appState.sections) {
    throw new Error("Invalid app state. Cannot export flowmap.");
  }

  const exportedSections = ["left", "top", "right", "bottom"].map(side => {
    const section = appState.sections[side] || {
      side,
      displayName: "",
      direction: getDefaultDirectionForSide(side),
      segments: []
    };

    return buildExportSection(section);
  });

  return {
    format: "flowmap",
    version: "1.0.0",
    layoutName: String(appState.layoutName || "").trim(),
    exportedAtUtc: new Date().toISOString(),
    sections: exportedSections
  };
}

function buildExportSection(section) {
  const segments = Array.isArray(section.segments)
    ? section.segments.map((segment, index) => buildExportSegment(section, segment, index))
    : [];

  return {
    side: section.side || "",
    displayName: section.displayName || "",
    direction: section.direction || getDefaultDirectionForSide(section.side || "left"),
    segmentCount: segments.length,
    segments
  };
}

function buildExportSegment(section, segment, segmentIndex) {
  const nodes = Array.isArray(segment.pewData) ? segment.pewData : [];
  const bindings = segment.bindings || {};
  const checkpointRecords = Array.isArray(segment.checkpointData) ? segment.checkpointData : [];

  const exportedNodes = nodes.map((node, nodeIndex) => {
    const binding = bindings[node.id] || null;
    return buildExportNode(section, segment, node, binding, nodeIndex);
  });

  return {
    id: segment.id || "",
    index: segmentIndex,
    label: segment.label || `Segment ${segmentIndex + 1}`,
    side: section.side || "",
    direction: section.direction || getDefaultDirectionForSide(section.side || "left"),
    pewFileName: segment.pewFileName || "",
    checkpointFileName: segment.checkpointFileName || "",
    nodeCount: exportedNodes.length,
    checkpointRecordCount: checkpointRecords.length,
    nodes: exportedNodes
  };
}

function buildExportNode(section, segment, node, binding, nodeIndex) {
  const checkpoint = binding?.checkpoint || null;

  const graphInputs = Array.isArray(node.graphInputs)
    ? node.graphInputs.map(input => ({
        fromNodeId: input.fromNodeId || "",
        fromNodeTitle: input.fromNodeTitle || "",
        fromSocketIndex: toSafeNumber(input.fromSocketIndex),
        toSocketIndex: toSafeNumber(input.toSocketIndex)
      }))
    : [];

  const graphOutputs = Array.isArray(node.graphOutputs)
    ? node.graphOutputs.map(output => ({
        toNodeId: output.toNodeId || "",
        toNodeTitle: output.toNodeTitle || "",
        fromSocketIndex: toSafeNumber(output.fromSocketIndex),
        toSocketIndex: toSafeNumber(output.toSocketIndex)
      }))
    : [];

  const outputNodeIds = buildRuntimeOutputNodeIds(node, binding);
  const telemetry = buildNodeTelemetry(node, checkpoint);
  const runtimeLabel = buildRuntimeNodeLabel(segment, node, checkpoint);

  return {
    id: node.id || "",
    index: nodeIndex,
    label: node.label || "",
    runtimeLabel,
    type: node.type || "checkpoint",

    planner: {
      title: node.title || node.label || "",
      x: toSafeNumber(node.x),
      y: toSafeNumber(node.y),
      width: toSafeNumber(node.width),
      height: toSafeNumber(node.height)
    },

    binding: {
      isBound: !!binding,
      ignoreNode: !!binding?.ignoreNode,
      isEndOfRace: !!binding?.isEndOfRace,
      endOfRaceMode: binding?.isEndOfRace
        ? (binding.endOfRaceMode || "checkpoint-reached")
        : null,
      outputOverrideNodeIds: Array.isArray(binding?.outputOverrideNodeIds)
        ? [...binding.outputOverrideNodeIds]
        : []
    },

    telemetry,

    graph: {
      inputCount: graphInputs.length,
      outputCount: graphOutputs.length,
      graphInputs,
      graphOutputs,
      runtimeOutputNodeIds: outputNodeIds
    }
  };
}

function buildRuntimeOutputNodeIds(node, binding) {
  if (
    binding &&
    Array.isArray(binding.outputOverrideNodeIds) &&
    binding.outputOverrideNodeIds.length > 0
  ) {
    return [...binding.outputOverrideNodeIds];
  }

  if (!Array.isArray(node.graphOutputs)) {
    return [];
  }

  return node.graphOutputs.map(output => output.toNodeId || "").filter(Boolean);
}

function buildNodeTelemetry(node, checkpoint) {
  if (!checkpoint) {
    return {
      hasCheckpoint: false,
      step: null,
      checkpointLabel: "",
      mapId: "",
      position: {
        x: null,
        y: null,
        z: null
      },
      trigger: {
        radius: null,
        angle: null
      },
      note: "",
      checkpointType: null
    };
  }

  return {
    hasCheckpoint: true,
    step: checkpoint.step ?? null,
    checkpointLabel: checkpoint.label || "",
    mapId: checkpoint.mapId || "",
    position: {
      x: toSafeNumberOrNull(checkpoint.x),
      y: toSafeNumberOrNull(checkpoint.y),
      z: toSafeNumberOrNull(checkpoint.z)
    },
    trigger: {
      radius: toSafeNumberOrNull(checkpoint.radius),
      angle: toSafeNumberOrNull(checkpoint.angle)
    },
    note: checkpoint.note || "",
    checkpointType: checkpoint.type ?? null
  };
}

function buildRuntimeNodeLabel(segment, node, checkpoint) {
  const segmentLabel = String(segment?.label || "Segment").trim();
  const nodeLabel = String(node?.label || "Node").trim();
  const checkpointLabel = String(checkpoint?.label || "").trim();

  if (checkpointLabel) {
    return `${segmentLabel} | ${nodeLabel} | ${checkpointLabel}`;
  }

  return `${segmentLabel} | ${nodeLabel}`;
}

function toSafeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toSafeNumberOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function downloadFlowmapExport(appState, fileName = "flowmap.json") {
  const data = buildFlowmapExport(appState);

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8"
  });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);

  return data;
}