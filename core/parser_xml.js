function parseCheckpointXml(text) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, "application/xml");

  if (xml.querySelector("parsererror")) {
    throw new Error("Invalid XML file.");
  }

  const root = xml.querySelector("Checkpoints");
  if (!root) {
    throw new Error("Missing <Checkpoints> root.");
  }

  const rootMapId = root.getAttribute("mapId") || "";
  const nodes = Array.from(root.querySelectorAll("checkpoint"));

  return nodes.map((node, index) => {
    const label = node.getAttribute("label") || `CP ${index}`;

    return {
      step: Number(node.getAttribute("index")) - 1,
      label: label,
      x: Number(node.getAttribute("x")),
      y: Number(node.getAttribute("y")),
      z: Number(node.getAttribute("z")),
      radius: Number(node.getAttribute("radius") ?? 10),
      angle: Number(node.getAttribute("angle") ?? -1),
      mapId: node.getAttribute("mapId") || rootMapId,
      note: node.getAttribute("note") || "",
      type: detectCheckpointType(label)
    };
  });
}