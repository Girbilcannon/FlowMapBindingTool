function parseCheckpointCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const header = lines[0].split(",").map(h => h.trim().toUpperCase());
  const rows = lines.slice(1);

  const idx = name => header.indexOf(name);

  const iStep = idx("STEP");
  const iName = idx("STEPNAME");
  const iX = idx("X");
  const iY = idx("Y");
  const iZ = idx("Z");
  const iRadius = idx("RADIUS");
  const iAngle = idx("ANGLE");

  return rows.map((row, index) => {
    const parts = row.split(",").map(p => p.trim());

    const label = parts[iName] || `CP ${index}`;

    return {
      step: Number(parts[iStep]),
      label: label,
      x: Number(parts[iX]),
      y: Number(parts[iY]),
      z: Number(parts[iZ]),
      radius: Number(parts[iRadius] ?? 10),
      angle: Number(parts[iAngle] ?? -1),
      mapId: null,
      type: detectCheckpointType(label)
    };
  });
}

function detectCheckpointType(label) {
  const name = String(label).toUpperCase();

  if (name === "START") return "start";
  if (name === "END") return "end";
  if (name === "SPLIT") return "split";
  if (name === "CONVERGE") return "converge";

  return "checkpoint";
}