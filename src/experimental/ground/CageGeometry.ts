export interface CageLink {
  a: number;
  b: number;
  kind: 0 | 1 | 2;
  length: number;
}
type Face = [number, number, number];

/** One subdivision of an oriented icosahedron: 42 nodes, 80 faces. */
export function createCage(radius: number) {
  const t = (1 + Math.sqrt(5)) / 2;
  const unit = (v: number[]) => v.map((x) => x * radius / Math.hypot(...v));
  const points = [
    [-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],
    [0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1],
  ].map(unit);
  const base: Face[] = [
    [0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],
    [5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],
    [3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1],
  ];
  const key = (a: number, b: number) => `${Math.min(a,b)},${Math.max(a,b)}`;
  const midpoints = new Map<string, number>();
  const midpoint = (a: number, b: number) => {
    const k = key(a,b);
    const found = midpoints.get(k);
    if (found !== undefined) return found;
    const index = points.length;
    points.push(unit(points[a].map((x, c) => (x + points[b][c]) / 2)));
    midpoints.set(k, index);
    return index;
  };
  const faces: Face[] = [];
  for (const [a,b,c] of base) {
    const ab = midpoint(a,b), bc = midpoint(b,c), ca = midpoint(c,a);
    faces.push([a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]);
  }
  const edges = new Map<string, { a: number; b: number; opposite: number[] }>();
  for (const face of faces) for (let j = 0; j < 3; j++) {
    const a = face[j], b = face[(j+1)%3], k = key(a,b);
    if (!edges.has(k)) edges.set(k, { a: Math.min(a,b), b: Math.max(a,b), opposite: [] });
    edges.get(k)!.opposite.push(face[(j+2)%3]);
  }
  const links: CageLink[] = [];
  const seen = new Set<string>();
  const add = (a: number, b: number, kind: CageLink['kind']) => {
    const k = key(a,b);
    if (a === b || seen.has(k)) return;
    seen.add(k);
    links.push({ a, b, kind, length: Math.hypot(...points[a].map((x,c) => x-points[b][c])) });
  };
  for (const edge of edges.values()) add(edge.a, edge.b, 0);
  const surfaceEdges = links.length;
  for (const edge of edges.values()) add(edge.opposite[0], edge.opposite[1], 1);
  for (let a = 0; a < points.length; a++) {
    let best = 0, distance = Infinity;
    for (let b = 0; b < points.length; b++) {
      const d = points[a].reduce((sum,x,c) => sum + (x+points[b][c])**2, 0);
      if (d < distance) { best = b; distance = d; }
    }
    add(a, best, 2);
  }
  return { rest: Float64Array.from(points.flat()), faces, links, surfaceEdges };
}
