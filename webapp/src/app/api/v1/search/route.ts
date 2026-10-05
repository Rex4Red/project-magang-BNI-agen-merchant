import { polygonError, type AreaPoint } from "@/lib/search-polygon";
import { NextRequest, NextResponse } from "next/server";
import { type SearchArea } from "@/lib/search-area";

import { agentSearchJob, startAgentSearch } from "@/lib/agent-search-jobs";
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  if (searchParams.has('job')) {
    const id = searchParams.get('job')!;
    const job = /^[a-f0-9-]{36}$/.test(id) ? agentSearchJob(id) : undefined;
    if (!job) return NextResponse.json({ error: 'Pencarian kedaluwarsa atau server dimulai ulang. Silakan cari lagi.' }, { status: 404 });
    return NextResponse.json({ status: job.status, phase: job.phase, completed: job.completed, total: job.total, result: job.result, error: job.error }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const area = searchParams.get("area")?.trim();
  const mode = searchParams.get("mode") || "area";
  if (mode !== "area" && mode !== "map") {
    return NextResponse.json({ error: "Mode pencarian tidak valid" }, { status: 400 });
  }
  let mapLocation: SearchArea | null = null;
  let zoom = 15;
  let polygon: AreaPoint[] | null = null;
  if (mode === "map") {
    if (searchParams.has('polygon')) {
      try { polygon = JSON.parse(searchParams.get('polygon')!); } catch { return NextResponse.json({ error: 'Area tidak valid.' }, { status: 400 }); }
      const error = polygonError(polygon);
      if (error) return NextResponse.json({ error }, { status: 400 });
    }
    const raw = ["south", "north", "west", "east"].map((key) => searchParams.get(key));
    const [south, north, west, east] = polygon ? [Math.min(...polygon.map(p => p[0])), Math.max(...polygon.map(p => p[0])), Math.min(...polygon.map(p => p[1])), Math.max(...polygon.map(p => p[1]))] : raw.map(Number);
    zoom = Number(searchParams.get("zoom"));
    if (raw.some((value) => value === null || !value.trim()) ||
      ![south, north, west, east, zoom].every(Number.isFinite) ||
      south < -90 || north > 90 || west < -180 || east > 180 ||
      south >= north || west >= east || zoom < 1 || zoom > 19) {
      return NextResponse.json({ error: "Batas peta tidak valid. Atur ulang posisi peta." }, { status: 400 });
    }
    if (north - south > 0.5 || east - west > 0.5) {
      return NextResponse.json({ error: "Area peta terlalu luas. Perbesar peta untuk mempersempit pencarian." }, { status: 400 });
    }
    mapLocation = { name: "", lat: (south + north) / 2, lng: (west + east) / 2,
      radiusKm: null, bounds: [south, north, west, east] };
  }

  if (mode === "area" && (!area || area.length > 100)) {
    return NextResponse.json(
      { error: "Masukkan nama daerah (maksimal 100 karakter)" },
      { status: 400 }
    );
  }

  const job = startAgentSearch({ mode, area, mapLocation, zoom, polygon });
  if (!job) return NextResponse.json({ error: 'Server sedang menangani beberapa pencarian. Coba lagi setelah pencarian lainnya selesai.' }, { status: 429 });
  return NextResponse.json({ jobId: job.id }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
}
