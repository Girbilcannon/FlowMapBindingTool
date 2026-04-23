// ==========================
// STATE
// ==========================

const AppState = {
  layoutName: "",
  selectedSection: "left",
  sections: {
    left: createSection("left"),
    top: createSection("top"),
    right: createSection("right"),
    bottom: createSection("bottom")
  }
};

function createSection(side) {
  return {
    side,
    displayName: "",
    direction: getDefaultDirectionForSide(side),
    segments: [],
    selectedSegmentId: null
  };
}

function createSegment(index = 0) {
  return {
    id: `segment_${Date.now()}_${Math.floor(Math.random() * 100000)}_${index}`,
    label: "",
    pewData: [],
    checkpointData: [],
    bindings: {},
    selectedNodeId: null,
    pewFileName: "",
    checkpointFileName: ""
  };
}

function createBindingRecord(node, checkpoint) {
  return {
    nodeId: node.id,
    nodeLabel: node.label || "",
    nodeType: node.type || "checkpoint",
    checkpoint: {
      step: checkpoint.step ?? null,
      label: checkpoint.label || "",
      x: checkpoint.x ?? null,
      y: checkpoint.y ?? null,
      z: checkpoint.z ?? null,
      radius: checkpoint.radius ?? null,
      angle: checkpoint.angle ?? null,
      mapId: checkpoint.mapId ?? "",
      note: checkpoint.note ?? "",
      type: checkpoint.type ?? null
    },
    ignoreNode: false,
    isEndOfRace: false,
    endOfRaceMode: "checkpoint-reached",
    outputOverrideNodeIds: []
  };
}

function getDefaultDirectionForSide(side) {
  switch (side) {
    case "left":
      return "bottom-to-top";
    case "top":
      return "left-to-right";
    case "right":
      return "top-to-bottom";
    case "bottom":
      return "left-to-right";
    default:
      return "bottom-to-top";
  }
}

// ==========================
// DOM
// ==========================

const layoutNameInput = document.getElementById("layoutName");
const sectionNameInput = document.getElementById("sectionName");
const directionSelect = document.getElementById("direction");

const segmentList = document.getElementById("segmentList");
const segmentLabelInput = document.getElementById("segmentLabel");
const pewFileInput = document.getElementById("pewFile");
const checkpointFileInput = document.getElementById("checkpointFile");

const nodeList = document.getElementById("nodeList");
const checkpointList = document.getElementById("checkpointList");
const previewCanvas = document.getElementById("previewCanvas");

const projectStatus = document.getElementById("projectStatus");
const selectedSectionPill = document.getElementById("selectedSectionPill");
const sectionBadge = document.getElementById("sectionBadge");
const pewFileNameLabel = document.getElementById("pewFileName");
const checkpointFileNameLabel = document.getElementById("checkpointFileName");
const bindingSummary = document.getElementById("bindingSummary");

const selectedNodePill = document.getElementById("selectedNodePill");
const nodeOptionsEmpty = document.getElementById("nodeOptionsEmpty");
const nodeOptionsPanel = document.getElementById("nodeOptionsPanel");
const selectedNodeBindingInfo = document.getElementById("selectedNodeBindingInfo");
const selectedNodeMapIdInfo = document.getElementById("selectedNodeMapIdInfo");
const isEndOfRaceCheckbox = document.getElementById("isEndOfRace");
const endModeWrap = document.getElementById("endModeWrap");
const endOfRaceModeSelect = document.getElementById("endOfRaceMode");
const ignoreNodeCheckbox = document.getElementById("ignoreNode");
const outputOverrideList = document.getElementById("outputOverrideList");

// ==========================
// SECTION SWITCH
// ==========================

document.querySelectorAll(".section-card").forEach(btn => {
  btn.addEventListener("click", () => {
    AppState.selectedSection = btn.dataset.side;
    ensureSectionHasSelection(getSection());
    render();
  });
});

// ==========================
// PROJECT INPUTS
// ==========================

layoutNameInput.addEventListener("input", e => {
  AppState.layoutName = e.target.value;
});

sectionNameInput.addEventListener("input", e => {
  getSection().displayName = e.target.value;
  renderSectionMeta();
});

directionSelect.addEventListener("change", e => {
  getSection().direction = e.target.value;
  renderPreview();
});

// ==========================
// SEGMENT ACTIONS
// ==========================

document.getElementById("btnAddSegment").addEventListener("click", () => {
  const section = getSection();
  const segment = createSegment(section.segments.length);

  section.segments.push(segment);
  section.selectedSegmentId = segment.id;

  setStatus("Added a new flow segment.", "good");
  render();
});

document.getElementById("btnRemoveSegment").addEventListener("click", () => {
  const section = getSection();
  const segment = getSelectedSegment();

  if (!segment) {
    setStatus("There is no selected segment to remove.", "bad");
    return;
  }

  section.segments = section.segments.filter(s => s.id !== segment.id);
  section.selectedSegmentId = section.segments.length ? section.segments[0].id : null;

  setStatus("Removed selected segment.", "good");
  render();
});

segmentLabelInput.addEventListener("input", e => {
  const segment = getSelectedSegment();
  if (!segment) return;

  segment.label = e.target.value;
  renderSegmentList();
  renderSectionMeta();
  renderPreview();
});

// ==========================
// FILE LOADERS
// ==========================

pewFileInput.addEventListener("change", e => {
  const file = e.target.files && e.target.files[0];
  const segment = getSelectedSegment();

  if (!segment) {
    setStatus("Add and select a segment before loading files.", "bad");
    return;
  }

  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const nodes = callPewParser(parsed);

      segment.pewData = nodes;
      segment.bindings = {};
      segment.selectedNodeId = null;
      segment.pewFileName = file.name;

      setStatus(
        `Loaded planner file "${file.name}" with ${segment.pewData.length} nodes into segment "${segment.label || "Unnamed Segment"}".`,
        "good"
      );

      render();
    } catch (error) {
      setStatus(`Failed to read .pew file: ${error.message}`, "bad");
    }
  };

  reader.readAsText(file);
});

checkpointFileInput.addEventListener("change", e => {
  const file = e.target.files && e.target.files[0];
  const segment = getSelectedSegment();

  if (!segment) {
    setStatus("Add and select a segment before loading files.", "bad");
    return;
  }

  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    try {
      const text = String(reader.result || "");
      const checkpoints = callXmlParser(text);

      segment.checkpointData = checkpoints;
      segment.checkpointFileName = file.name;

      setStatus(
        `Loaded checkpoint file "${file.name}" with ${segment.checkpointData.length} records into segment "${segment.label || "Unnamed Segment"}".`,
        "good"
      );

      render();
    } catch (error) {
      setStatus(`Failed to read checkpoint file: ${error.message}`, "bad");
    }
  };

  reader.readAsText(file);
});

// ==========================
// BINDING ACTIONS
// ==========================

document.getElementById("btnAutoMatch").addEventListener("click", () => {
  const segment = getSelectedSegment();

  if (!segment) {
    setStatus("Add and select a segment first.", "bad");
    return;
  }

  if (!segment.pewData.length) {
    setStatus("Load a .pew file before using Auto Match.", "bad");
    return;
  }

  if (!segment.checkpointData.length) {
    setStatus("Load an XML checkpoint file before using Auto Match.", "bad");
    return;
  }

  let matches = 0;

  segment.pewData.forEach(node => {
    const match = segment.checkpointData.find(cp => {
      return normalizeLabel(cp.label) === normalizeLabel(node.label);
    });

    if (!match) return;

    const existing = segment.bindings[node.id];
    const record = existing || createBindingRecord(node, match);

    record.nodeLabel = node.label || "";
    record.nodeType = node.type || "checkpoint";
    record.checkpoint = {
      step: match.step ?? null,
      label: match.label || "",
      x: match.x ?? null,
      y: match.y ?? null,
      z: match.z ?? null,
      radius: match.radius ?? null,
      angle: match.angle ?? null,
      mapId: match.mapId ?? "",
      note: match.note ?? "",
      type: match.type ?? null
    };

    segment.bindings[node.id] = record;
    matches++;
  });

  setStatus(`Auto Match complete. ${matches} node(s) matched in the selected segment.`, "good");
  render();
});

// ==========================
// NODE OPTION EVENTS
// ==========================

isEndOfRaceCheckbox.addEventListener("change", e => {
  const binding = getSelectedBinding();
  if (!binding) return;

  binding.isEndOfRace = e.target.checked;
  if (!binding.isEndOfRace) {
    binding.endOfRaceMode = "checkpoint-reached";
  }

  renderNodes();
  renderNodeOptions();
  renderPreview();
});

endOfRaceModeSelect.addEventListener("change", e => {
  const binding = getSelectedBinding();
  if (!binding) return;

  binding.endOfRaceMode = e.target.value;
  renderNodes();
});

ignoreNodeCheckbox.addEventListener("change", e => {
  const binding = getSelectedBinding();
  if (!binding) return;

  binding.ignoreNode = e.target.checked;
  renderNodes();
  renderPreview();
});

// ==========================
// OUTPUT OVERRIDE HELPERS
// ==========================

function toggleOutputOverride(binding, nodeId) {
  if (binding.outputOverrideNodeIds.includes(nodeId)) {
    binding.outputOverrideNodeIds = binding.outputOverrideNodeIds.filter(id => id !== nodeId);
  } else {
    binding.outputOverrideNodeIds.push(nodeId);
  }
  render();
}

// ==========================
// EXPORT
// ==========================

document.getElementById("btnExport").addEventListener("click", () => {
  try {
    AppState.layoutName = layoutNameInput.value.trim();

    const exported = downloadFlowmapExport(AppState, "flowmap.json");

    const sectionCount = Array.isArray(exported.sections) ? exported.sections.length : 0;
    const segmentCount = Array.isArray(exported.sections)
      ? exported.sections.reduce((sum, section) => sum + (section.segmentCount || 0), 0)
      : 0;

    setStatus(
      `Exported flowmap JSON with ${sectionCount} section(s) and ${segmentCount} segment(s).`,
      "good"
    );
  } catch (error) {
    setStatus(`Export failed: ${error.message}`, "bad");
  }
});

// ==========================
// NODE SORTING (VISUAL ONLY)
// ==========================

function moveNodeInSelectedSegment(nodeId, direction) {
  const segment = getSelectedSegment();
  if (!segment) return;

  const index = segment.pewData.findIndex(node => node.id === nodeId);
  if (index < 0) return;

  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= segment.pewData.length) return;

  const movedLabel = segment.pewData[index].label;

  const temp = segment.pewData[index];
  segment.pewData[index] = segment.pewData[targetIndex];
  segment.pewData[targetIndex] = temp;

  setStatus(`Moved node "${movedLabel}" ${direction}. Visual order only.`, "good");
  render();
}

// ==========================
// FLOW HELPERS
// ==========================

function getEffectiveOutputNodeIds(segment, nodeId, visited = new Set()) {
  const visitKey = `${segment.id}::${nodeId}`;
  if (visited.has(visitKey)) {
    return [];
  }

  visited.add(visitKey);

  const binding = segment.bindings[nodeId];
  const node = segment.pewData.find(n => n.id === nodeId);
  if (!node) return [];

  let outputs = [];

  if (binding && Array.isArray(binding.outputOverrideNodeIds) && binding.outputOverrideNodeIds.length > 0) {
    outputs = [...binding.outputOverrideNodeIds];
  } else {
    outputs = node.graphOutputs.map(output => output.toNodeId);
  }

  const resolved = [];

  outputs.forEach(targetId => {
    const targetBinding = segment.bindings[targetId];

    if (targetBinding?.ignoreNode) {
      const bridged = getEffectiveOutputNodeIds(segment, targetId, new Set(visited));
      resolved.push(...bridged);
    } else {
      resolved.push(targetId);
    }
  });

  return [...new Set(resolved)];
}

function getPreviewEntryMap(entries) {
  const map = new Map();

  entries.forEach(entry => {
    map.set(getCompositeNodeKey(entry.segment.id, entry.node.id), entry);
  });

  return map;
}

// --------------------------
// Structured label helpers
// Optional stabilizer for names like:
// S1_P1_CP1
// S1-P1-CP2
// S1 P2 CP3
// --------------------------

function parseStructuredNodeSequence(label) {
  const text = String(label || "").trim();
  if (!text) return null;

  const match = text.match(/S\s*(\d+)\s*[_\-\s]*P\s*(\d+)\s*[_\-\s]*CP\s*(\d+)/i);
  if (!match) return null;

  return {
    split: Number(match[1]),
    path: Number(match[2]),
    checkpoint: Number(match[3])
  };
}

function getNodeStructuredSequence(node) {
  if (!node) return null;
  return parseStructuredNodeSequence(node.label || node.title || "");
}

function compareStructuredSequences(aSeq, bSeq) {
  if (!aSeq && !bSeq) return 0;
  if (aSeq && !bSeq) return -1;
  if (!aSeq && bSeq) return 1;

  if (aSeq.split !== bSeq.split) return aSeq.split - bSeq.split;
  if (aSeq.path !== bSeq.path) return aSeq.path - bSeq.path;
  if (aSeq.checkpoint !== bSeq.checkpoint) return aSeq.checkpoint - bSeq.checkpoint;
  return 0;
}

function compareNodesForStablePreview(a, b) {
  const aSeq = getNodeStructuredSequence(a);
  const bSeq = getNodeStructuredSequence(b);

  const structuredCompare = compareStructuredSequences(aSeq, bSeq);
  if (structuredCompare !== 0) {
    return structuredCompare;
  }

  const aLabel = String(a?.label || "");
  const bLabel = String(b?.label || "");

  if (aLabel !== bLabel) {
    return aLabel.localeCompare(bLabel);
  }

  return String(a?.id || "").localeCompare(String(b?.id || ""));
}

function compareBranchNodesForFlow(a, b) {
  const aSeq = getNodeStructuredSequence(a);
  const bSeq = getNodeStructuredSequence(b);

  if (aSeq && bSeq && aSeq.split === bSeq.split && aSeq.path === bSeq.path) {
    if (aSeq.checkpoint !== bSeq.checkpoint) {
      return aSeq.checkpoint - bSeq.checkpoint;
    }
  }

  return compareNodesForStablePreview(a, b);
}

function averageNumbers(values) {
  if (!Array.isArray(values) || !values.length) {
    return 0;
  }

  const total = values.reduce((sum, value) => sum + Number(value || 0), 0);
  return total / values.length;
}

// First child stays on trunk.
// Additional children peel outward in stable order.
function getDirectionalChildLaneOffsets(count) {
  if (count <= 0) return [];
  if (count === 1) return [0];

  // For a 2-way split, make a real V around the split lane.
  if (count === 2) return [-0.5, 0.5];

  // For 3-way splits, keep one centered and branch around it.
  if (count === 3) return [-1, 0, 1];

  // For 4+ outputs, spread symmetrically around center.
  const offsets = [];
  const center = (count - 1) / 2;

  for (let i = 0; i < count; i++) {
    offsets.push(i - center);
  }

  return offsets;
}

function projectLanePosition(section, depth, lane, maxDepth, laneCenter, width, height, margin, laneSpacing) {
  const depthDenom = maxDepth > 0 ? maxDepth : 1;
  const trunkInset = 42;

  if (section.side === "top" || section.side === "bottom") {
    const usableWidth = width - margin * 2;
    const forwardX = margin + (usableWidth * depth / depthDenom);
    const reverseX = width - margin - (usableWidth * depth / depthDenom);
    const x = section.direction === "right-to-left" ? reverseX : forwardX;

    const baseY = section.side === "top"
      ? margin + trunkInset
      : height - margin - trunkInset;

    const y = baseY + (lane * laneSpacing);

    return { x, y };
  }

  const usableHeight = height - margin * 2;
  const forwardY = margin + (usableHeight * depth / depthDenom);
  const reverseY = height - margin - (usableHeight * depth / depthDenom);
  const y = section.direction === "bottom-to-top" ? reverseY : forwardY;

  const baseX = section.side === "left"
    ? margin + trunkInset
    : width - margin - trunkInset;

  const x = baseX + (lane * laneSpacing);

  return { x, y };
}

function computeReachableDistances(segment, startNodeId) {
  const distances = new Map();
  const queue = [{ nodeId: startNodeId, distance: 0 }];

  while (queue.length) {
    const current = queue.shift();
    if (distances.has(current.nodeId)) {
      continue;
    }

    distances.set(current.nodeId, current.distance);

    const outputs = getEffectiveOutputNodeIds(segment, current.nodeId);
    outputs.forEach(nextId => {
      if (!distances.has(nextId)) {
        queue.push({
          nodeId: nextId,
          distance: current.distance + 1
        });
      }
    });
  }

  return distances;
}

function findMatchingConvergeNodeId(segment, splitNodeId, entryByNodeId) {
  const splitNode = segment.pewData.find(node => node.id === splitNodeId);
  if (!splitNode) return null;

  const outputs = getEffectiveOutputNodeIds(segment, splitNodeId);
  if (outputs.length < 2) return null;

  const distanceMaps = outputs.map(nodeId => computeReachableDistances(segment, nodeId));
  if (!distanceMaps.length) return null;

  const firstMapKeys = [...distanceMaps[0].keys()];

  const candidates = firstMapKeys.filter(candidateId => {
    if (candidateId === splitNodeId) return false;

    const candidateNode = segment.pewData.find(node => node.id === candidateId);
    if (!candidateNode) return false;

    const isMerge = (candidateNode.graphInputs?.length || 0) > 1 || candidateNode.type === "converge";
    if (!isMerge) return false;

    return distanceMaps.every(map => map.has(candidateId));
  });

  if (!candidates.length) {
    return null;
  }

  candidates.sort((a, b) => {
    const entryA = entryByNodeId.get(a);
    const entryB = entryByNodeId.get(b);

    const depthA = entryA ? entryA.depth : Number.MAX_SAFE_INTEGER;
    const depthB = entryB ? entryB.depth : Number.MAX_SAFE_INTEGER;

    if (depthA !== depthB) {
      return depthA - depthB;
    }

    const maxDistA = Math.max(...distanceMaps.map(map => map.get(a) ?? 999999));
    const maxDistB = Math.max(...distanceMaps.map(map => map.get(b) ?? 999999));

    if (maxDistA !== maxDistB) {
      return maxDistA - maxDistB;
    }

    const nodeA = segment.pewData.find(node => node.id === a);
    const nodeB = segment.pewData.find(node => node.id === b);

    return compareNodesForStablePreview(nodeA, nodeB);
  });

  return candidates[0];
}

function collectBranchBandNodes(segment, startNodeId, stopNodeId) {
  const path = [];
  const visited = new Set();

  function walk(currentNodeId) {
    if (!currentNodeId || currentNodeId === stopNodeId || visited.has(currentNodeId)) {
      return currentNodeId === stopNodeId;
    }

    visited.add(currentNodeId);

    const node = segment.pewData.find(n => n.id === currentNodeId);
    if (!node) {
      return false;
    }

    path.push(node);

    const outputs = getEffectiveOutputNodeIds(segment, currentNodeId);
    if (!outputs.length) {
      return false;
    }

    const reachableOutputs = outputs
      .map(outputNodeId => {
        const distances = computeReachableDistances(segment, outputNodeId);
        const targetNode = segment.pewData.find(n => n.id === outputNodeId);
        return {
          outputNodeId,
          targetNode,
          reachesStop: distances.has(stopNodeId)
        };
      })
      .filter(item => item.reachesStop);

    if (!reachableOutputs.length) {
      return false;
    }

    reachableOutputs.sort((a, b) => compareBranchNodesForFlow(a.targetNode, b.targetNode));

    for (const item of reachableOutputs) {
      const beforeCount = path.length;
      const found = walk(item.outputNodeId);
      if (found) {
        return true;
      }

      path.length = beforeCount;
    }

    return false;
  }

  walk(startNodeId);
  return path;
}

function getOrderedSplitOutputs(segment, splitNodeId) {
  const outputs = getEffectiveOutputNodeIds(segment, splitNodeId);

  return outputs
    .map(outputNodeId => {
      const node = segment.pewData.find(n => n.id === outputNodeId);
      return {
        outputNodeId,
        node
      };
    })
    .filter(item => item.node)
    .sort((a, b) => compareBranchNodesForFlow(a.node, b.node))
    .map(item => item.outputNodeId);
}

function ensureConvergeDepthForBranches(splitEntry, convergeEntry, branchPaths) {
  const longestBranchLength = branchPaths.reduce((max, branchPath) => {
    return Math.max(max, branchPath.length);
  }, 0);

  const requiredDepth = splitEntry.depth + longestBranchLength + 1;

  if (convergeEntry.depth < requiredDepth) {
    convergeEntry.depth = requiredDepth;
  }
}

function normalizeSplitBands(segment, entryByNodeId) {
  const splitNodes = segment.pewData.filter(node => {
    return getEffectiveOutputNodeIds(segment, node.id).length > 1;
  });

  splitNodes.sort((a, b) => {
    const entryA = entryByNodeId.get(a.id);
    const entryB = entryByNodeId.get(b.id);
    return (entryA?.depth || 0) - (entryB?.depth || 0);
  });

  splitNodes.forEach(splitNode => {
    const splitEntry = entryByNodeId.get(splitNode.id);
    if (!splitEntry) return;

    const trunkLane = splitEntry.lane;
    const outputs = getOrderedSplitOutputs(segment, splitNode.id);
    if (outputs.length < 2) return;

    const convergeNodeId = findMatchingConvergeNodeId(segment, splitNode.id, entryByNodeId);
    if (!convergeNodeId) return;

    const convergeEntry = entryByNodeId.get(convergeNodeId);
    if (!convergeEntry) return;

    const childOffsets = getDirectionalChildLaneOffsets(outputs.length);
    const branchLanes = [];
    const branchPaths = [];

    outputs.forEach((outputNodeId, outputIndex) => {
      const branchPath = collectBranchBandNodes(segment, outputNodeId, convergeNodeId)
        .filter(node => {
          const outputCount = getEffectiveOutputNodeIds(segment, node.id).length;
          const inputCount = node.graphInputs?.length || 0;

          return (
            node.type !== "split" &&
            node.type !== "converge" &&
            node.id !== convergeNodeId &&
            !(inputCount > 1 && node.id !== outputNodeId)
          );
        });

      branchPaths.push(branchPath);
      branchLanes.push(trunkLane + childOffsets[outputIndex]);
    });

    ensureConvergeDepthForBranches(splitEntry, convergeEntry, branchPaths);

    const span = convergeEntry.depth - splitEntry.depth;
    if (span <= 1) return;

    branchPaths.forEach((branchPath, branchIndex) => {
      const branchLane = branchLanes[branchIndex];
      const count = branchPath.length;

      branchPath.forEach((node, nodeIndex) => {
        const nodeEntry = entryByNodeId.get(node.id);
        if (!nodeEntry) return;

        nodeEntry.lane = branchLane;

        // Stretch each branch across the whole split→converge span.
        // Long path gets many steps, short path gets fewer, but still fills the band.
        nodeEntry.depth = splitEntry.depth + ((nodeIndex + 1) / (count + 1)) * span;
      });
    });

    const uniqueBranchLanes = [...new Set(branchLanes)];
    if (uniqueBranchLanes.length) {
      convergeEntry.lane = resolveConvergeLane(uniqueBranchLanes);
    }
  });
}

function resolveConvergeLane(incomingLanes) {
  if (!Array.isArray(incomingLanes) || !incomingLanes.length) {
    return 0;
  }

  const unique = [...new Set(incomingLanes)].sort((a, b) => a - b);

  if (unique.length === 1) {
    return unique[0];
  }

  if (unique.length === 2) {
    return averageNumbers(unique);
  }

  if (unique.length === 3) {
    // For a 3-way converge, keep the middle lane centered.
    return unique[1];
  }

  return averageNumbers(unique);
}

function recenterConvergeEntries(segment, entryByNodeId) {
  segment.pewData.forEach(node => {
    const inputCount = node.graphInputs?.length || 0;
    const outputCount = getEffectiveOutputNodeIds(segment, node.id).length;
    const isConvergeLike = inputCount > 1 && outputCount <= 1;

    if (!isConvergeLike) {
      return;
    }

    const incomingEntries = (node.graphInputs || [])
      .map(input => entryByNodeId.get(input.fromNodeId))
      .filter(Boolean);

    if (incomingEntries.length < 2) {
      return;
    }

    const incomingLanes = incomingEntries
      .map(entry => entry.lane)
      .filter(lane => Number.isFinite(lane));

    if (incomingLanes.length < 2) {
      return;
    }

    const nodeEntry = entryByNodeId.get(node.id);
    if (!nodeEntry) {
      return;
    }

    nodeEntry.lane = resolveConvergeLane(incomingLanes);
  });
}

function computeSegmentPreviewLayout(segment) {
  if (!segment || !segment.pewData.length) {
    return {
      entries: [],
      minLane: 0,
      maxLane: 0,
      laneCenter: 0,
      maxDepth: 0,
      widthUnits: 0
    };
  }

  const nodeById = new Map(segment.pewData.map(node => [node.id, node]));
  const incomingRemaining = new Map();
  const bestDepth = new Map();
  const laneVotes = new Map();
  const placedEntries = new Map();
  const queue = [];

  segment.pewData.forEach(node => {
    incomingRemaining.set(node.id, Array.isArray(node.graphInputs) ? node.graphInputs.length : 0);
    bestDepth.set(node.id, 0);
    laneVotes.set(node.id, []);
  });

  const startNodes = segment.pewData
    .filter(node => !node.graphInputs || node.graphInputs.length === 0)
    .sort(compareNodesForStablePreview);

  if (!startNodes.length) {
    queue.push(segment.pewData[0]);
    laneVotes.set(segment.pewData[0].id, [0]);
  } else {
    const rootOffsets = getDirectionalChildLaneOffsets(startNodes.length);
    startNodes.forEach((node, index) => {
      queue.push(node);
      laneVotes.set(node.id, [rootOffsets[index]]);
      bestDepth.set(node.id, 0);
    });
  }

  while (queue.length) {
    const node = queue.shift();
    if (!node || placedEntries.has(node.id)) {
      continue;
    }

    const nodeVotes = laneVotes.get(node.id) || [];
    let finalLane = 0;

    const inputCount = node.graphInputs?.length || 0;

    if (inputCount <= 1) {
      finalLane = nodeVotes.length ? nodeVotes[0] : 0;
    } else {
      const sortedInputs = [...(node.graphInputs || [])].sort((a, b) => a.toSocketIndex - b.toSocketIndex);
      const incomingLanes = sortedInputs
        .map(input => placedEntries.get(input.fromNodeId))
        .filter(Boolean)
        .map(entry => entry.lane);

      const outputCount = getEffectiveOutputNodeIds(segment, node.id).length;
      const isConvergeLike = inputCount > 1 && outputCount <= 1;

      if (isConvergeLike && incomingLanes.length) {
        finalLane = resolveConvergeLane(incomingLanes);
      } else if (incomingLanes.length) {
        finalLane = incomingLanes[0];
      } else {
        finalLane = nodeVotes.length ? averageNumbers(nodeVotes) : 0;
      }
    }

    const finalDepth = bestDepth.get(node.id) ?? 0;

    placedEntries.set(node.id, {
      segment,
      node,
      depth: finalDepth,
      lane: finalLane
    });

    const outputs = getEffectiveOutputNodeIds(segment, node.id);
    if (!outputs.length) {
      continue;
    }

    const laneOffsets = getDirectionalChildLaneOffsets(outputs.length);

    outputs.forEach((targetNodeId, outputIndex) => {
      const targetNode = nodeById.get(targetNodeId);
      if (!targetNode || placedEntries.has(targetNodeId)) return;

      const proposedDepth = finalDepth + 1;
      const currentBestDepth = bestDepth.get(targetNodeId) ?? 0;
      if (proposedDepth > currentBestDepth) {
        bestDepth.set(targetNodeId, proposedDepth);
      }

      const proposedLane = finalLane + laneOffsets[outputIndex];
      laneVotes.get(targetNodeId).push(proposedLane);

      const remaining = (incomingRemaining.get(targetNodeId) ?? 1) - 1;
      incomingRemaining.set(targetNodeId, remaining);

      if (remaining <= 0) {
        queue.push(targetNode);
      }
    });
  }

  segment.pewData.forEach((node, index) => {
    if (placedEntries.has(node.id)) return;

    placedEntries.set(node.id, {
      segment,
      node,
      depth: bestDepth.get(node.id) ?? index,
      lane: 0
    });
  });

  normalizeSplitBands(segment, placedEntries);
  recenterConvergeEntries(segment, placedEntries);

  const entries = [...placedEntries.values()].sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth;
    if (a.lane !== b.lane) return a.lane - b.lane;
    return compareNodesForStablePreview(a.node, b.node);
  });

  const minLane = entries.reduce((min, entry) => Math.min(min, entry.lane), entries[0].lane);
  const maxLane = entries.reduce((max, entry) => Math.max(max, entry.lane), entries[0].lane);
  const laneCenter = (minLane + maxLane) / 2;
  const maxDepth = entries.reduce((max, entry) => Math.max(max, entry.depth), 0);
  const widthUnits = Math.max(2, Math.ceil(maxDepth) + 1);

  return {
    entries,
    minLane,
    maxLane,
    laneCenter,
    maxDepth,
    widthUnits
  };
}

// ==========================
// RENDER
// ==========================

function render() {
  ensureSectionHasSelection(getSection());

  updateSectionButtons();
  renderSectionForm();
  renderSectionMeta();
  renderSegmentList();
  renderSelectedSegmentForm();
  renderNodes();
  renderCheckpoints();
  renderBindingSummary();
  renderNodeOptions();
  renderPreview();
}

function updateSectionButtons() {
  document.querySelectorAll(".section-card").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.side === AppState.selectedSection);
  });

  const label = capitalize(AppState.selectedSection);
  selectedSectionPill.textContent = label;
  sectionBadge.textContent = label;
}

function renderSectionForm() {
  const section = getSection();
  sectionNameInput.value = section.displayName || "";
  directionSelect.value = section.direction || getDefaultDirectionForSide(section.side);
}

function renderSectionMeta() {
  ["left", "top", "right", "bottom"].forEach(side => {
    const section = AppState.sections[side];
    const parts = [];

    if (section.displayName) {
      parts.push(section.displayName);
    }

    parts.push(`${section.segments.length} segment${section.segments.length === 1 ? "" : "s"}`);
    document.getElementById(`meta-${side}`).textContent = parts.join(" • ");
  });
}

function renderSegmentList() {
  segmentList.innerHTML = "";

  const section = getSection();

  if (!section.segments.length) {
    segmentList.innerHTML = `<div class="item">No segments on this side yet.</div>`;
    return;
  }

  section.segments.forEach((segment, index) => {
    const div = document.createElement("div");
    div.className = "item";

    if (section.selectedSegmentId === segment.id) {
      div.classList.add("selected");
    }

    const boundCount = Object.keys(segment.bindings).length;
    const nodeCount = segment.pewData.length;
    const label = segment.label || `Segment ${index + 1}`;

    div.innerHTML = `
      <div><strong>${escapeHtml(label)}</strong></div>
      <div class="muted">${nodeCount} nodes • ${boundCount} bound</div>
    `;

    div.addEventListener("click", () => {
      section.selectedSegmentId = segment.id;
      render();
    });

    segmentList.appendChild(div);
  });
}

function renderSelectedSegmentForm() {
  const segment = getSelectedSegment();

  if (!segment) {
    segmentLabelInput.value = "";
    segmentLabelInput.disabled = true;
    pewFileInput.disabled = true;
    checkpointFileInput.disabled = true;
    pewFileNameLabel.textContent = "No segment selected.";
    checkpointFileNameLabel.textContent = "No segment selected.";
    return;
  }

  segmentLabelInput.disabled = false;
  pewFileInput.disabled = false;
  checkpointFileInput.disabled = false;

  segmentLabelInput.value = segment.label || "";
  pewFileNameLabel.textContent = segment.pewFileName || "No .pew file loaded.";
  checkpointFileNameLabel.textContent = segment.checkpointFileName || "No checkpoint file loaded.";
}

function renderNodes() {
  nodeList.innerHTML = "";

  const segment = getSelectedSegment();

  if (!segment) {
    nodeList.innerHTML = `<div class="item">No segment selected.</div>`;
    return;
  }

  if (!segment.pewData.length) {
    nodeList.innerHTML = `<div class="item">No planner nodes loaded.</div>`;
    return;
  }

  segment.pewData.forEach((node, index) => {
    const row = document.createElement("div");
    row.className = "item";

    const binding = segment.bindings[node.id];

    if (binding) {
      row.classList.add("bound");
    }

    if (binding?.ignoreNode) {
      row.classList.add("disabled-node");
    }

    if (segment.selectedNodeId === node.id) {
      row.classList.add("selected");
    }

    const tags = [];

    if (binding?.ignoreNode) {
      tags.push("DISABLED");
    }

    if (binding?.isEndOfRace) {
      tags.push(binding.endOfRaceMode === "map-swap" ? "END: map swap" : "END");
    }

    if (binding?.outputOverrideNodeIds?.length) {
      tags.push(`OVERRIDE: ${binding.outputOverrideNodeIds.length}`);
    }

    if (node.graphOutputs.length > 1) {
      tags.push(`SPLIT: ${node.graphOutputs.length}`);
    } else if (node.graphOutputs.length === 1) {
      tags.push("FLOW");
    }

    if (node.graphInputs.length > 1) {
      tags.push(`MERGE: ${node.graphInputs.length}`);
    }

    const suffix = tags.length ? ` • ${tags.join(" • ")}` : "";

    const info = document.createElement("div");
    info.style.display = "flex";
    info.style.justifyContent = "space-between";
    info.style.alignItems = "center";
    info.style.gap = "10px";

    const textWrap = document.createElement("div");
    textWrap.style.flex = "1";
    textWrap.style.minWidth = "0";
    textWrap.textContent = binding
      ? `[${(node.type || "checkpoint").toUpperCase()}] ${node.label} → ${binding.checkpoint.label}${suffix}`
      : `[${(node.type || "checkpoint").toUpperCase()}] ${node.label}${suffix}`;

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.gap = "6px";
    controls.style.flexShrink = "0";

    const upBtn = document.createElement("button");
    upBtn.textContent = "↑";
    upBtn.type = "button";
    upBtn.disabled = index === 0;
    upBtn.className = "tiny-btn";
    upBtn.addEventListener("click", e => {
      e.stopPropagation();
      moveNodeInSelectedSegment(node.id, "up");
    });

    const downBtn = document.createElement("button");
    downBtn.textContent = "↓";
    downBtn.type = "button";
    downBtn.disabled = index === segment.pewData.length - 1;
    downBtn.className = "tiny-btn";
    downBtn.addEventListener("click", e => {
      e.stopPropagation();
      moveNodeInSelectedSegment(node.id, "down");
    });

    controls.appendChild(upBtn);
    controls.appendChild(downBtn);

    info.appendChild(textWrap);
    info.appendChild(controls);
    row.appendChild(info);

    row.addEventListener("click", () => {
      segment.selectedNodeId = node.id;
      render();
    });

    row.addEventListener("dblclick", () => {
      delete segment.bindings[node.id];
      setStatus(`Cleared binding for node "${node.label}".`, "good");
      render();
    });

    nodeList.appendChild(row);
  });
}

function renderCheckpoints() {
  checkpointList.innerHTML = "";

  const segment = getSelectedSegment();

  if (!segment) {
    checkpointList.innerHTML = `<div class="item">No segment selected.</div>`;
    return;
  }

  if (!segment.checkpointData.length) {
    checkpointList.innerHTML = `<div class="item">No checkpoint records loaded.</div>`;
    return;
  }

  const usedLabels = new Set(
    Object.values(segment.bindings)
      .map(binding => binding?.checkpoint?.label)
      .filter(Boolean)
  );

  segment.checkpointData.forEach(cp => {
    const div = document.createElement("div");
    div.className = "item";

    if (usedLabels.has(cp.label)) {
      div.classList.add("bound");
    }

    const mapIdText = cp.mapId ? ` • map ${cp.mapId}` : "";
    div.textContent = `${cp.label || "(unlabeled checkpoint)"}${mapIdText}`;

    div.addEventListener("click", () => {
      if (!segment.selectedNodeId) {
        setStatus("Select a planner node first, then click a checkpoint.", "bad");
        return;
      }

      const node = segment.pewData.find(n => n.id === segment.selectedNodeId);
      if (!node) {
        setStatus("Selected node could not be found.", "bad");
        return;
      }

      const existing = segment.bindings[node.id];
      const binding = existing || createBindingRecord(node, cp);

      binding.nodeId = node.id;
      binding.nodeLabel = node.label || "";
      binding.nodeType = node.type || "checkpoint";
      binding.checkpoint = {
        step: cp.step ?? null,
        label: cp.label || "",
        x: cp.x ?? null,
        y: cp.y ?? null,
        z: cp.z ?? null,
        radius: cp.radius ?? null,
        angle: cp.angle ?? null,
        mapId: cp.mapId ?? "",
        note: cp.note ?? "",
        type: cp.type ?? null
      };

      segment.bindings[node.id] = binding;

      setStatus(`Bound node "${node.label}" to checkpoint "${cp.label}".`, "good");
      render();
    });

    checkpointList.appendChild(div);
  });
}

function renderBindingSummary() {
  const segment = getSelectedSegment();
  bindingSummary.textContent = segment ? Object.keys(segment.bindings).length : 0;
}

function renderNodeOptions() {
  const segment = getSelectedSegment();
  const node = getSelectedNode();
  const binding = getSelectedBinding();

  if (!segment || !node) {
    selectedNodePill.textContent = "No node selected";
    nodeOptionsEmpty.style.display = "";
    nodeOptionsPanel.style.display = "none";
    return;
  }

  selectedNodePill.textContent = node.label || "Selected node";

  if (!binding) {
    nodeOptionsEmpty.style.display = "";
    nodeOptionsPanel.style.display = "none";
    return;
  }

  nodeOptionsEmpty.style.display = "none";
  nodeOptionsPanel.style.display = "";

  selectedNodeBindingInfo.value = binding.checkpoint?.label || "";
  selectedNodeMapIdInfo.value = binding.checkpoint?.mapId || "";

  isEndOfRaceCheckbox.checked = !!binding.isEndOfRace;
  endModeWrap.style.display = binding.isEndOfRace ? "" : "none";
  endOfRaceModeSelect.value = binding.endOfRaceMode || "checkpoint-reached";

  ignoreNodeCheckbox.checked = !!binding.ignoreNode;

  renderOutputOverrideList(binding, segment, node);
}

function renderOutputOverrideList(binding, segment, selectedNode) {
  outputOverrideList.innerHTML = "";

  const candidates = segment.pewData.filter(node => node.id !== selectedNode.id);

  if (!candidates.length) {
    outputOverrideList.innerHTML = `<div class="item">No other nodes available.</div>`;
    return;
  }

  candidates.forEach(node => {
    const row = document.createElement("label");
    row.className = "checkbox-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = binding.outputOverrideNodeIds.includes(node.id);

    checkbox.addEventListener("change", () => {
      toggleOutputOverride(binding, node.id);
    });

    const text = document.createElement("span");
    text.textContent = node.label;

    row.appendChild(checkbox);
    row.appendChild(text);
    outputOverrideList.appendChild(row);
  });
}

// ==========================
// PREVIEW
// ==========================

function renderPreview() {
  const canvas = previewCanvas;
  const ctx = canvas.getContext("2d");

  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientWidth * 9 / 16;

  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#090b0e";
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "#343d47";
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, w - 40, h - 40);

  ctx.fillStyle = "#9fb0c2";
  ctx.font = "12px Arial";
  ctx.fillText("LEFT", 28, h / 2);
  ctx.fillText("TOP", w / 2 - 14, 16);
  ctx.fillText("RIGHT", w - 58, h / 2);
  ctx.fillText("BOTTOM", w / 2 - 24, h - 8);

  const section = getSection();

  ctx.strokeStyle = "#e0b84d";
  ctx.lineWidth = 3;

  switch (section.side) {
    case "left":
      ctx.beginPath();
      ctx.moveTo(20, 20);
      ctx.lineTo(20, h - 20);
      ctx.stroke();
      break;
    case "top":
      ctx.beginPath();
      ctx.moveTo(20, 20);
      ctx.lineTo(w - 20, 20);
      ctx.stroke();
      break;
    case "right":
      ctx.beginPath();
      ctx.moveTo(w - 20, 20);
      ctx.lineTo(w - 20, h - 20);
      ctx.stroke();
      break;
    case "bottom":
      ctx.beginPath();
      ctx.moveTo(20, h - 20);
      ctx.lineTo(w - 20, h - 20);
      ctx.stroke();
      break;
  }

  if (!section.segments.length) {
    ctx.fillStyle = "#9fb0c2";
    ctx.font = "14px Arial";
    ctx.fillText("No segments loaded for this screen section.", 32, 44);
    return;
  }

  const entries = buildSectionPreviewLane(section, w, h);
  const entryMap = getPreviewEntryMap(entries);

  entries.forEach(entry => {
    const binding = entry.segment.bindings[entry.node.id];
    if (binding?.ignoreNode) return;

    const outputs = getEffectiveOutputNodeIds(entry.segment, entry.node.id);
    if (!outputs.length) return;

    outputs.forEach(targetNodeId => {
      const target = entryMap.get(getCompositeNodeKey(entry.segment.id, targetNodeId));
      if (!target) return;

      const targetBinding = entry.segment.bindings[target.node.id];
      if (targetBinding?.ignoreNode) return;

      let color = "#8fb7ff";
      let width = 2.5;

      if (entry.node.graphOutputs.length > 1) {
        color = "#b86fe3";
      } else if (target.node.graphInputs.length > 1) {
        color = "#6fe3c7";
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(entry.x, entry.y);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();
    });
  });

  entries.forEach(entry => {
    const { segment, node, x, y } = entry;
    const binding = segment.bindings[node.id];
    if (binding?.ignoreNode) return;

    const isSelectedSegment = section.selectedSegmentId === segment.id;
    const isSelectedNode = segment.selectedNodeId === node.id;

    ctx.beginPath();
    ctx.arc(x, y, isSelectedNode ? 8 : (isSelectedSegment ? 7 : 6), 0, Math.PI * 2);
    ctx.fillStyle = binding ? "#7fc68d" : "#d96a6a";
    ctx.fill();

    if (binding?.isEndOfRace) {
      ctx.strokeStyle = "#f3d98d";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    const labelOffset = getLabelOffsetForSide(section.side);
    const segmentName = segment.label || "Segment";
    const nodeLabel = node.label || "Node";

    ctx.fillStyle = "#e8edf2";
    ctx.font = "12px Arial";
    ctx.fillText(`${segmentName}: ${nodeLabel}`, x + labelOffset.x, y + labelOffset.y);
  });
}

function buildSectionPreviewLane(section, width, height) {
  const entries = [];
  const margin = 44;

  // Smaller gap so segments almost touch.
  const segmentGapUnits = 0.2;

  const segmentLayouts = section.segments
    .map(segment => ({
      segment,
      layout: computeSegmentPreviewLayout(segment)
    }))
    .filter(item => item.layout.entries.length > 0);

  if (!segmentLayouts.length) {
    return entries;
  }

  const globalEntries = [];
  let runningDepthOffset = 0;

  segmentLayouts.forEach((item, index) => {
    const { segment, layout } = item;

    layout.entries.forEach(localEntry => {
      globalEntries.push({
        segment,
        node: localEntry.node,

        // Chain each segment directly after the previous one.
        depth: runningDepthOffset + localEntry.depth,

        // Keep local lane shape across the whole side.
        lane: localEntry.lane
      });
    });

    runningDepthOffset += layout.maxDepth;

    if (index < segmentLayouts.length - 1) {
      runningDepthOffset += segmentGapUnits;
    }
  });

  const maxDepth = globalEntries.reduce((max, entry) => Math.max(max, entry.depth), 0);
  const minLane = globalEntries.reduce((min, entry) => Math.min(min, entry.lane), globalEntries[0].lane);
  const maxLane = globalEntries.reduce((max, entry) => Math.max(max, entry.lane), globalEntries[0].lane);
  const laneCenter = (minLane + maxLane) / 2;

  globalEntries.forEach(entry => {
    const point = projectLanePosition(
      section,
      entry.depth,
      entry.lane,
      maxDepth,
      laneCenter,
      width,
      height,
      margin,
      34
    );

    entries.push({
      segment: entry.segment,
      node: entry.node,
      x: point.x,
      y: point.y,
      baseX: point.x,
      baseY: point.y
    });
  });

  return entries;
}

function getLabelOffsetForSide(side) {
  switch (side) {
    case "left":
      return { x: 12, y: 4 };
    case "top":
      return { x: 8, y: 18 };
    case "right":
      return { x: -120, y: 4 };
    case "bottom":
      return { x: 8, y: -10 };
    default:
      return { x: 10, y: 4 };
  }
}

// ==========================
// HELPERS
// ==========================

function getSection() {
  return AppState.sections[AppState.selectedSection];
}

function getSelectedSegment() {
  const section = getSection();
  return section.segments.find(segment => segment.id === section.selectedSegmentId) || null;
}

function getSelectedNode() {
  const segment = getSelectedSegment();
  if (!segment || !segment.selectedNodeId) return null;
  return segment.pewData.find(node => node.id === segment.selectedNodeId) || null;
}

function getSelectedBinding() {
  const segment = getSelectedSegment();
  const node = getSelectedNode();
  if (!segment || !node) return null;
  return segment.bindings[node.id] || null;
}

function getCompositeNodeKey(segmentId, nodeId) {
  return `${segmentId}::${nodeId}`;
}

function ensureSectionHasSelection(section) {
  if (!section) return;

  if (!section.segments.length) {
    section.selectedSegmentId = null;
    return;
  }

  const exists = section.segments.some(segment => segment.id === section.selectedSegmentId);
  if (!exists) {
    section.selectedSegmentId = section.segments[0].id;
  }
}

function buildExportBindings(segment) {
  return Object.values(segment.bindings).map(binding => ({
    nodeId: binding.nodeId,
    nodeLabel: binding.nodeLabel,
    nodeType: binding.nodeType,
    checkpoint: {
      step: binding.checkpoint?.step ?? null,
      label: binding.checkpoint?.label ?? "",
      x: binding.checkpoint?.x ?? null,
      y: binding.checkpoint?.y ?? null,
      z: binding.checkpoint?.z ?? null,
      radius: binding.checkpoint?.radius ?? null,
      angle: binding.checkpoint?.angle ?? null,
      mapId: binding.checkpoint?.mapId ?? "",
      note: binding.checkpoint?.note ?? "",
      type: binding.checkpoint?.type ?? null
    },
    ignoreNode: !!binding.ignoreNode,
    isEndOfRace: !!binding.isEndOfRace,
    endOfRaceMode: binding.isEndOfRace ? (binding.endOfRaceMode || "checkpoint-reached") : null,
    outputOverrideNodeIds: Array.isArray(binding.outputOverrideNodeIds) ? [...binding.outputOverrideNodeIds] : []
  }));
}

function normalizeLabel(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function setStatus(message, type = "") {
  projectStatus.textContent = message;
  projectStatus.className = "status" + (type ? " " + type : "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// ==========================
// PARSER BRIDGES
// ==========================

function callPewParser(parsed) {
  if (typeof normalizePewNodes === "function") {
    return normalizePewNodes(parsed);
  }

  throw new Error("normalizePewNodes() was not found. Make sure parser_pew.js is loaded.");
}

function callCsvParser(text) {
  if (typeof parseCheckpointCsv === "function") {
    return parseCheckpointCsv(text);
  }

  throw new Error("parseCheckpointCsv() was not found. Make sure parser_csv.js is loaded.");
}

function callXmlParser(text) {
  if (typeof parseCheckpointXml === "function") {
    return parseCheckpointXml(text);
  }

  throw new Error("parseCheckpointXml() was not found. Make sure parser_xml.js is loaded.");
}

// ==========================
// INIT
// ==========================

layoutNameInput.value = AppState.layoutName;
ensureSectionHasSelection(getSection());
render();