import { NextRequest, NextResponse } from "next/server";
import { distance, nearestOnRoad, validPoint, type Point } from "@/lib/road-geometry";

interface Way { id: number; tags?: { name?: string; highway?: string }; geometry?: { lat: number; lon: number }[] }
export async function GET(request: NextRequest) {
  const rawLat = request.nextUrl.searchParams.get("lat"), rawLng = request.nextUrl.searchParams.get("lng");
  const point: Point = [Number(rawLat), Number(rawLng)];
  if (!rawLat?.trim() || !rawLng?.trim() || !validPoint(point)) return NextResponse.json({ error: "Titik tidak valid." }, { status: 400 });
  try {
    const query = `[out:json][timeout:20];way(around:1500,${point[0]},${point[1]})[highway~"^(primary|secondary|tertiary|residential|unclassified|living_street|service|pedestrian|primary_link|secondary_link|tertiary_link)$"];out geom;`;
    const url = new URL("https://overpass-api.de/api/interpreter");
    url.searchParams.set("data", query);
    const response = await fetch(url, { headers: { "User-Agent": "BNI-Canvas-Local/1.0", Accept: "application/json" }, signal: AbortSignal.timeout(25000) });
    if (!response.ok) throw new Error();
    const data = await response.json();
    if (!Array.isArray(data.elements) || data.remark) throw new Error();
    const ways = (data.elements as Way[]).filter(w => (w.geometry?.length || 0) > 1).map(w => ({ id: String(w.id), name: w.tags?.name || "Jalan tanpa nama", named: !!w.tags?.name, path: w.geometry!.map(p => [p.lat, p.lon] as Point) }));
    const candidates = ways.map(w => ({ ...w, distance: nearestOnRoad(point, w.path).distance })).filter(w => w.distance <= 80).sort((a, b) => a.distance - b.distance).slice(0, 5);
    const roads = candidates.map(candidate => {
      let path = [...candidate.path];
      const visited = new Set([candidate.id]);
      // Continue only an unambiguous connected way with the same road name.
      if (candidate.named) for (const end of ["start", "end"]) {
        for (let step = 0; step < 50; step++) {
          const anchor = end === "start" ? path[0] : path[path.length - 1];
          const next = ways.filter(w => !visited.has(w.id) && w.name === candidate.name && (distance(anchor, w.path[0]) < 1 || distance(anchor, w.path[w.path.length - 1]) < 1));
          if (next.length !== 1) break;
          const way = next[0]; visited.add(way.id);
          const extension = distance(anchor, way.path[0]) < 1 ? way.path.slice(1) : [...way.path].reverse().slice(1);
          path = end === "start" ? [...extension.reverse(), ...path] : [...path, ...extension];
        }
      }
      return { id: candidate.id, name: candidate.name, distance: Math.round(candidate.distance), path };
    });
    return NextResponse.json({ roads, source: "OpenStreetMap" });
  } catch { return NextResponse.json({ error: "Data jalan belum dapat diambil. Coba lagi beberapa saat." }, { status: 502 }); }
}
