import { NextRequest, NextResponse } from "next/server";
import { pathLength, validPoint } from "@/lib/road-geometry";
import { merchantSearchJob, startMerchantSearch } from "@/lib/merchant-search-jobs";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let input;
  try { input = await request.json(); } catch { return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 }); }
  const { path, width, roadName } = input || {};
  if (!Array.isArray(path) || path.length < 2 || path.length > 3000 || !path.every(validPoint) || typeof width !== "number" || !Number.isFinite(width) || width < 10 || width > 100 || typeof roadName !== "string" || roadName.length > 200 || pathLength(path) < 5 || pathLength(path) > 1050) {
    return NextResponse.json({ error: "Pilih ruas 5–1.000 meter dan jarak sisi jalan 10–100 meter." }, { status: 400 });
  }
  const job = startMerchantSearch(path, width, roadName);
  if (!job) return NextResponse.json({ error: 'Server sedang menangani beberapa pencarian. Coba lagi setelah pencarian lainnya selesai.' }, { status: 429 });
  return NextResponse.json({ jobId: job.id }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('job');
  const job = id && /^[a-f0-9-]{36}$/.test(id) ? merchantSearchJob(id) : undefined;
  if (!job) return NextResponse.json({ error: 'Pencarian sudah kedaluwarsa atau server dimulai ulang. Silakan cari lagi.' }, { status: 404 });
  return NextResponse.json({ status: job.status, completed: job.completed, total: job.total, result: job.result, error: job.error }, { headers: { 'Cache-Control': 'no-store' } });
}
