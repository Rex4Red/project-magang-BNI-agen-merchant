import { NextRequest, NextResponse } from "next/server";
import { pathLength, validPoint, type Point } from "@/lib/road-geometry";
import { polygonError, type AreaPoint } from "@/lib/search-polygon";
import { merchantSearchJob, startMerchantSearch } from "@/lib/merchant-search-jobs";
import type { MerchantSearchInput } from "@/lib/merchant-search";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }

  const mode = (typeof input?.mode === 'string' ? input.mode : (Array.isArray(input?.path) ? 'road' : 'area')) as 'road' | 'area' | 'map';

  let searchInput: MerchantSearchInput;

  if (mode === 'area') {
    const area = typeof input?.area === 'string' ? input.area.trim() : '';
    if (!area || area.length > 100) {
      return NextResponse.json({ error: "Masukkan nama daerah (maksimal 100 karakter)." }, { status: 400 });
    }
    const query = typeof input?.query === 'string' ? input.query.trim() : undefined;
    searchInput = { mode: 'area', area, query };
  } else if (mode === 'map') {
    const polygon = input?.polygon as AreaPoint[];
    if (!Array.isArray(polygon)) {
      return NextResponse.json({ error: "Area polygon tidak valid." }, { status: 400 });
    }
    const err = polygonError(polygon);
    if (err) {
      return NextResponse.json({ error: err }, { status: 400 });
    }
    const query = typeof input?.query === 'string' ? input.query.trim() : undefined;
    const zoom = typeof input?.zoom === 'number' ? input.zoom : undefined;
    searchInput = { mode: 'map', polygon, query, zoom };
  } else if (mode === 'road') {
    const path = input?.path as Point[];
    const width = typeof input?.width === 'number' ? input.width : 50;
    const roadName = typeof input?.roadName === 'string' ? input.roadName.trim() : 'Jalur manual';
    const query = typeof input?.query === 'string' ? input.query.trim() : undefined;

    if (!Array.isArray(path) || path.length < 2 || path.length > 3000 || !path.every(validPoint) ||
        typeof width !== "number" || !Number.isFinite(width) || width < 10 || width > 100 ||
        roadName.length > 200 || pathLength(path) < 5 || pathLength(path) > 1050) {
      return NextResponse.json({ error: "Pilih ruas 5–1.000 meter dan jarak sisi jalan 10–100 meter." }, { status: 400 });
    }

    searchInput = { mode: 'road', path, width, roadName, query };
  } else {
    return NextResponse.json({ error: "Mode pencarian merchant tidak valid." }, { status: 400 });
  }

  const job = startMerchantSearch(searchInput);
  if (!job) {
    return NextResponse.json({ error: 'Server sedang menangani beberapa pencarian. Coba lagi setelah pencarian lainnya selesai.' }, { status: 429 });
  }

  return NextResponse.json({ jobId: job.id }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const id = searchParams.get('job');
  if (id) {
    const job = /^[a-f0-9-]{36}$/.test(id) ? merchantSearchJob(id) : undefined;
    if (!job) {
      return NextResponse.json({ error: 'Pencarian sudah kedaluwarsa atau server dimulai ulang. Silakan cari lagi.' }, { status: 404 });
    }
    return NextResponse.json({
      status: job.status,
      completed: job.completed,
      total: job.total,
      result: job.result,
      error: job.error
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  // Also support GET initiating for area search (matching agent search)
  const mode = searchParams.get('mode') || 'area';
  if (mode === 'area') {
    const area = searchParams.get('area')?.trim();
    if (!area || area.length > 100) {
      return NextResponse.json({ error: "Masukkan nama daerah (maksimal 100 karakter)." }, { status: 400 });
    }
    const query = searchParams.get('query')?.trim() || undefined;
    const job = startMerchantSearch({ mode: 'area', area, query });
    if (!job) {
      return NextResponse.json({ error: 'Server sedang menangani beberapa pencarian. Coba lagi nanti.' }, { status: 429 });
    }
    return NextResponse.json({ jobId: job.id }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
  }

  return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
}
