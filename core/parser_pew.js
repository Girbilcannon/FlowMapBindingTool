function normalizePewNodes(parsed) {
  if (!parsed || !Array.isArray(parsed.Nodes)) {
    throw new Error("Invalid .pew file format: missing Nodes array.");
  }

  const rawNodes = parsed.Nodes;
  const rawConnections = Array.isArray(parsed.Connections) ? parsed.Connections : [];

  // --------------------------
  // PASS 1: build node list + maps
  // --------------------------
  const nodes = rawNodes.map((node, index) => {
    const id = String(node.Id || `legacy_node_${index}`);
    const title = String(node.Title || `Node ${index + 1}`);

    return {
      id,
      label: title,
      title,
      type: detectNodeType(title),

      x: Number(node.X ?? 0),
      y: Number(node.Y ?? 0),
      width: Number(node.Width ?? 170),
      height: Number(node.Height ?? 100),

      inputs: Array.isArray(node.Inputs)
        ? node.Inputs.map(input => ({
            index: Number(input.Index ?? 0),
            isConnected: !!input.IsConnected,
            connectedFromNodeId: String(input.ConnectedFromNodeId ?? ""),
            connectedFromSocketIndex: Number(input.ConnectedFromSocketIndex ?? -1)
          }))
        : [],

      outputs: Array.isArray(node.Outputs)
        ? node.Outputs.map(output => ({
            index: Number(output.Index ?? 0),
            isConnected: !!output.IsConnected
          }))
        : [],

      graphInputs: [],
      graphOutputs: []
    };
  });

  const nodeById = new Map();
  const nodeByTitle = new Map();

  nodes.forEach(node => {
    nodeById.set(node.id, node);

    if (!nodeByTitle.has(node.title)) {
      nodeByTitle.set(node.title, []);
    }
    nodeByTitle.get(node.title).push(node);
  });

  // --------------------------
  // PASS 2: build graph edges
  // Prefer new ID-based connections.
  // Fall back to old title-based connections.
  // --------------------------
  rawConnections.forEach(connection => {
    const fromNodeId = connection.FromNodeId ? String(connection.FromNodeId) : "";
    const toNodeId = connection.ToNodeId ? String(connection.ToNodeId) : "";

    const fromNodeTitle = connection.FromNodeTitle ? String(connection.FromNodeTitle) : "";
    const toNodeTitle = connection.ToNodeTitle ? String(connection.ToNodeTitle) : "";

    let fromNode = null;
    let toNode = null;

    if (fromNodeId && nodeById.has(fromNodeId)) {
      fromNode = nodeById.get(fromNodeId);
    } else if (fromNodeTitle && nodeByTitle.has(fromNodeTitle)) {
      fromNode = nodeByTitle.get(fromNodeTitle)[0];
    }

    if (toNodeId && nodeById.has(toNodeId)) {
      toNode = nodeById.get(toNodeId);
    } else if (toNodeTitle && nodeByTitle.has(toNodeTitle)) {
      toNode = nodeByTitle.get(toNodeTitle)[0];
    }

    if (!fromNode || !toNode) {
      return;
    }

    const fromSocketIndex = Number(connection.FromSocketIndex ?? 0);
    const toSocketIndex = Number(connection.ToSocketIndex ?? 0);

    fromNode.graphOutputs.push({
      toNodeId: toNode.id,
      toNodeTitle: toNode.title,
      fromSocketIndex,
      toSocketIndex
    });

    toNode.graphInputs.push({
      fromNodeId: fromNode.id,
      fromNodeTitle: fromNode.title,
      fromSocketIndex,
      toSocketIndex
    });
  });

  // Sort outputs by socket index for stable flow ordering.
  nodes.forEach(node => {
    node.graphOutputs.sort((a, b) => a.fromSocketIndex - b.fromSocketIndex);
    node.graphInputs.sort((a, b) => a.toSocketIndex - b.toSocketIndex);
  });

  return nodes;
}

function detectNodeType(value) {
  const name = String(value || "").toUpperCase();

  if (name.includes("START")) return "start";
  if (name.includes("END")) return "end";
  if (name.includes("BOSS")) return "boss";
  if (name.includes("SPLIT")) return "split";
  if (name.includes("CONVERGE")) return "converge";

  return "checkpoint";
}