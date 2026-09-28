export type AreaPoint = [number, number];

const cross = (a: AreaPoint, b: AreaPoint, p: AreaPoint) =>
  (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
const onEdge = (p: AreaPoint, a: AreaPoint, b: AreaPoint) =>
  Math.abs(cross(a, b, p)) < 1e-12 && p[0] >= Math.min(a[0], b[0]) - 1e-10 &&
  p[0] <= Math.max(a[0], b[0]) + 1e-10 && p[1] >= Math.min(a[1], b[1]) - 1e-10 && p[1] <= Math.max(a[1], b[1]) + 1e-10;

export function insidePolygon(point: AreaPoint, polygon: AreaPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i];
    if (onEdge(point, a, b)) return true;
    if ((a[1] > point[1]) !== (b[1] > point[1]) &&
      point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

export function polygonError(value: unknown): string | null {
  if (!Array.isArray(value) || value.length < 3 || value.length > 100) return 'Gambar area dengan 3 sampai 100 titik.';
  if (value.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite) || Math.abs(p[0]) > 85 || Math.abs(p[1]) > 180)) return 'Koordinat area tidak valid.';
  const points = value as AreaPoint[];
  if (new Set(points.map(p => p.join(','))).size !== points.length) return 'Titik area tidak boleh bertumpuk.';
  const lat = points.map(p => p[0]), lng = points.map(p => p[1]);
  if (Math.max(...lat) - Math.min(...lat) > .5 || Math.max(...lng) - Math.min(...lng) > .5) return 'Area terlalu luas. Gambar area yang lebih kecil.';
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    area += cross(points[0], a, b);
    for (let j = i + 2; j < points.length; j++) {
      if (i === 0 && j === points.length - 1) continue;
      const c = points[j], d = points[(j + 1) % points.length];
      if ((cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) ||
        onEdge(c, a, b) || onEdge(d, a, b) || onEdge(a, c, d) || onEdge(b, c, d)) return 'Garis batas saling berpotongan. Geser titik atau gambar ulang.';
    }
  }
  return Math.abs(area) < 1e-9 ? 'Area terlalu kecil. Buat batas yang lebih lebar.' : null;
}
