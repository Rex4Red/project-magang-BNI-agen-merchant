export type Point = [number, number];
const SCALE = 111195;
export function distance(a: Point, b: Point) {
  return Math.hypot((a[0] - b[0]) * SCALE, (a[1] - b[1]) * SCALE * Math.cos((a[0] + b[0]) * Math.PI / 360));
}
export function nearestOnRoad(point: Point, path: Point[]) {
  let best = { point: path[0], index: 0, distance: Infinity, along: 0 };
  let walked = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1], cos = Math.cos(point[0] * Math.PI / 180);
    const x = (b[1] - a[1]) * cos, y = b[0] - a[0];
    const t = Math.max(0, Math.min(1, (((point[1] - a[1]) * cos * x) + (point[0] - a[0]) * y) / (x * x + y * y || 1)));
    const projected: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const d = distance(point, projected);
    if (d < best.distance) best = { point: projected, index: i, distance: d, along: walked + distance(a, projected) };
    walked += distance(a, b);
  }
  return best;
}
export function pathLength(path: Point[]) { return path.slice(1).reduce((sum, p, i) => sum + distance(path[i], p), 0); }
// Space search centers by distance along the line, including both ends.
// Do not use vertex count: hand-drawn lines may have unevenly spaced points.
export function samplePath(path: Point[], spacing = 250): Point[] {
  if (!path.length) return [];
  const total = pathLength(path);
  if (total === 0) return [path[0]];
  const intervals = Math.max(1, Math.ceil(total / spacing));
  const samples: Point[] = [path[0]];
  for (let sample = 1; sample < intervals; sample++) {
    let remaining = total * sample / intervals;
    for (let i = 1; i < path.length; i++) {
      const length = distance(path[i - 1], path[i]);
      if (length === 0) continue;
      if (remaining <= length) {
        const t = remaining / length;
        samples.push([path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t,
          path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t]);
        break;
      }
      remaining -= length;
    }
  }
  samples.push(path[path.length - 1]);
  return samples;
}
export function selectSegment(path: Point[], start: Point, length: number, reverse: boolean): Point[] {
  const road = reverse ? [...path].reverse() : path;
  const nearest = nearestOnRoad(start, road);
  const result: Point[] = [nearest.point];
  let remaining = length;
  for (let i = nearest.index + 1; i < road.length && remaining > 0; i++) {
    const previous = result[result.length - 1], next = road[i];
    const d = distance(previous, next);
    if (d < .01) continue;
    const fraction = Math.min(1, remaining / d);
    result.push([previous[0] + (next[0] - previous[0]) * fraction, previous[1] + (next[1] - previous[1]) * fraction]);
    remaining -= d;
  }
  return result;
}
export function validPoint(point: unknown): point is Point {
  return Array.isArray(point) && point.length === 2 && point.every(v => typeof v === "number" && Number.isFinite(v)) && Math.abs(point[0]) <= 85 && Math.abs(point[1]) <= 180;
}
