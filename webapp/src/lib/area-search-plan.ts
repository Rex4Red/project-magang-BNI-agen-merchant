import { insidePolygon, type AreaPoint } from './search-polygon';

// Divide the bounding box into cells, clipping each cell to the selected area.
// Large areas use a coarser grid rather than dropping cells at the end.
export function areaSearchPlan(polygon: AreaPoint[]) {
  const south = Math.min(...polygon.map(p => p[0])), north = Math.max(...polygon.map(p => p[0]));
  const west = Math.min(...polygon.map(p => p[1])), east = Math.max(...polygon.map(p => p[1]));
  const height = (north - south) * 111320;
  const width = (east - west) * 111320 * Math.cos((south + north) / 2 * Math.PI / 180);
  let spacing = 450;
  while (Math.ceil(height / spacing) * Math.ceil(width / spacing) > 12) spacing *= 1.2;
  const rows = Math.max(1, Math.ceil(height / spacing)), cols = Math.max(1, Math.ceil(width / spacing));
  const points: AreaPoint[] = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const bottom = south + (north - south) * row / rows, top = south + (north - south) * (row + 1) / rows;
    const left = west + (east - west) * col / cols, right = west + (east - west) * (col + 1) / cols;
    let clipped = polygon;
    for (const [axis, bound, sign] of [[0, bottom, 1], [0, top, -1], [1, left, 1], [1, right, -1]]) {
      const output: AreaPoint[] = [];
      for (let i = 0; i < clipped.length; i++) {
        const a = clipped[i], b = clipped[(i + 1) % clipped.length];
        const aIn = (a[axis] - bound) * sign >= 0, bIn = (b[axis] - bound) * sign >= 0;
        if (aIn) output.push(a);
        if (aIn !== bIn) {
          const t = (bound - a[axis]) / (b[axis] - a[axis]);
          output.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
        }
      }
      clipped = output;
    }
    if (clipped.length < 3) continue;
    const center: AreaPoint = [clipped.reduce((sum, p) => sum + p[0], 0) / clipped.length, clipped.reduce((sum, p) => sum + p[1], 0) / clipped.length];
    const point = insidePolygon(center, polygon) ? center : clipped.find(p => insidePolygon(p, polygon));
    if (point && !points.some(p => Math.abs(p[0] - point[0]) + Math.abs(p[1] - point[1]) < 1e-8)) points.push(point);
  }
  const cellMeters = Math.ceil(Math.max(height / rows, width / cols));
  return { points, cellMeters, coarse: cellMeters > 600,
    zoom: Math.max(12, Math.min(17, Math.round(17 - Math.log2(Math.max(450, cellMeters) / 450)))) };
}
