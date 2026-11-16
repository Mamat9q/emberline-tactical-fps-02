// Waypoint graph of Kestrel Yard and A* over it. Nodes sit on open ground; every edge
// is a straight walk the map leaves clear (band-wall gaps sit at x -14, 0 and 14).
// Bots ask for a path, then walk it node to node; the player never touches this.
const NODES = {
  attSpawn: [0, 18],
  attWest: [-22, 16],
  attEast: [22, 16],
  southWest: [-16, 9],
  southEast: [16, 9],
  midSouth: [0, 10],
  westMid: [-14, 0],
  midGate: [0, 0],
  eastMid: [14, 0],
  connWest: [-10, 2],
  connEast: [10, 2],
  westNorth: [-14, -10],
  midNorth: [0, -10],
  eastNorth: [14, -10],
  siteAEntry: [-17, -11],
  siteA: [-20, -14],
  siteABack: [-24, -18],
  siteBEntry: [17, -11],
  siteB: [20, -14],
  siteBBack: [24, -18],
  defSpawn: [0, -18],
  defWest: [-8, -13],
  defEast: [8, -13],
};

const LINKS = {
  attSpawn: ['attWest', 'midSouth', 'attEast'],
  attWest: ['attSpawn', 'southWest'],
  attEast: ['attSpawn', 'southEast'],
  southWest: ['attWest', 'westMid'],
  southEast: ['attEast', 'eastMid'],
  midSouth: ['attSpawn', 'midGate'],
  westMid: ['southWest', 'midGate', 'connWest', 'westNorth'],
  midGate: ['midSouth', 'westMid', 'eastMid', 'connWest', 'connEast', 'midNorth'],
  eastMid: ['southEast', 'midGate', 'connEast', 'eastNorth'],
  connWest: ['westMid', 'midGate'],
  connEast: ['eastMid', 'midGate'],
  westNorth: ['westMid', 'midNorth', 'siteAEntry'],
  midNorth: ['midGate', 'westNorth', 'eastNorth', 'defWest', 'defEast'],
  eastNorth: ['eastMid', 'midNorth', 'siteBEntry'],
  siteAEntry: ['westNorth', 'siteA', 'defWest'],
  siteA: ['siteAEntry', 'siteABack'],
  siteABack: ['siteA'],
  siteBEntry: ['eastNorth', 'siteB', 'defEast'],
  siteB: ['siteBEntry', 'siteBBack'],
  siteBBack: ['siteB'],
  defSpawn: ['defWest', 'defEast'],
  defWest: ['defSpawn', 'midNorth', 'siteAEntry'],
  defEast: ['defSpawn', 'midNorth', 'siteBEntry'],
};

function distance(a, b) {
  const dx = a[0] - b[0];
  const dz = a[1] - b[1];
  return Math.hypot(dx, dz);
}

export function nearestNode(x, z) {
  let best = null;
  let bestDistance = Infinity;
  for (const id of Object.keys(NODES)) {
    const d = distance(NODES[id], [x, z]);
    if (d < bestDistance) {
      bestDistance = d;
      best = id;
    }
  }
  return best;
}

export function nodePosition(id) {
  const p = NODES[id];
  return { x: p[0], z: p[1] };
}

// A* over the graph; returns an array of node ids from start to goal, inclusive.
export function findPath(fromX, fromZ, toX, toZ) {
  const start = nearestNode(fromX, fromZ);
  const goal = nearestNode(toX, toZ);
  if (start === goal) return [goal];
  const open = [{ id: start, f: distance(NODES[start], NODES[goal]) }];
  const cameFrom = new Map();
  const gScore = new Map([[start, 0]]);
  const closed = new Set();
  while (open.length > 0) {
    let bestIndex = 0;
    for (let i = 1; i < open.length; i += 1) if (open[i].f < open[bestIndex].f) bestIndex = i;
    const current = open.splice(bestIndex, 1)[0].id;
    if (current === goal) {
      const path = [current];
      let node = current;
      while (cameFrom.has(node)) {
        node = cameFrom.get(node);
        path.unshift(node);
      }
      return path;
    }
    closed.add(current);
    for (const next of LINKS[current]) {
      if (closed.has(next)) continue;
      const tentative = gScore.get(current) + distance(NODES[current], NODES[next]);
      if (tentative < (gScore.get(next) ?? Infinity)) {
        cameFrom.set(next, current);
        gScore.set(next, tentative);
        const f = tentative + distance(NODES[next], NODES[goal]);
        const existing = open.find((entry) => entry.id === next);
        if (existing) existing.f = f;
        else open.push({ id: next, f });
      }
    }
  }
  return [goal];
}
