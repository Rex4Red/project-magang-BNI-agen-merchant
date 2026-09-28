import { NextRequest, NextResponse } from "next/server";
import { scrapeGoogleMaps } from "@/lib/google-maps-scraper";
import { nearestOnRoad, pathLength, samplePath, validPoint } from "@/lib/road-geometry";

export async function POST(request: NextRequest) {
  let input;
  try { input = await request.json(); } catch { return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 }); }
  const { path, width, roadName } = input || {};
  if (!Array.isArray(path) || path.length < 2 || path.length > 3000 || !path.every(validPoint) || typeof width !== "number" || width < 10 || width > 100 || typeof roadName !== "string" || roadName.length > 200 || pathLength(path) < 5 || pathLength(path) > 1050) {
    return NextResponse.json({ error: "Pilih ruas 5–1.000 meter dan jarak sisi jalan 10–100 meter." }, { status: 400 });
  }
  try {
    const centers = samplePath(path);
    const suffix = ["Jalan tanpa nama", "Jalur manual"].includes(roadName) ? "" : ` di ${roadName}`;
    const queries = [`toko${suffix}`, `warung${suffix}`, `restoran kafe${suffix}`];
    const jobs = centers.flatMap((center, pointIndex) => queries.map(query => ({ center, pointIndex, query })));
    const searches: PromiseSettledResult<Awaited<ReturnType<typeof scrapeGoogleMaps>>>[] = new Array(jobs.length);
    let nextJob = 0;
    // Keep browser use bounded while covering the full drawn line.
    await Promise.all(Array.from({ length: 2 }, async () => {
      while (nextJob < jobs.length) {
        const index = nextJob++;
        const { center, query } = jobs[index];
        try { searches[index] = { status: "fulfilled", value: await scrapeGoogleMaps(query, center[0], center[1], 18) }; }
        catch (reason) { searches[index] = { status: "rejected", reason }; }
      }
    }));
    if (searches.every(r => r.status === "rejected")) throw new Error();
    const seen = new Set<string>();
    const results = searches.flatMap(result => result.status === "fulfilled" ? result.value : []).flatMap(store => {
      if (!validPoint([store.lat, store.lng]) || (!store.lat && !store.lng)) return [];
      const nearest = nearestOnRoad([store.lat, store.lng], path);
      if (nearest.distance > width) return [];
      const placeId = store.url.match(/!1s([^!/?]+)/)?.[1];
      const key = placeId || `${store.name.trim().toLowerCase()}|${store.lat.toFixed(5)}|${store.lng.toFixed(5)}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ ...store, id: `merchant-${seen.size}`, distanceFromRoad: Math.round(nearest.distance), distanceFromStart: Math.round(nearest.along) }];
    }).sort((a, b) => a.distanceFromStart - b.distanceFromStart);
    const failed = searches.filter(r => r.status === "rejected").length;
    const coverage = centers.map((point, index) => ({ point, successfulQueries: searches.filter((r, i) => jobs[i].pointIndex === index && r.status === "fulfilled").length, totalQueries: queries.length }));
    return NextResponse.json({ results, coverage, warning: failed ? `${failed} dari ${jobs.length} pencarian gagal. Sebagian jalur mungkin belum tercakup; coba cari ulang.` : "", source: "Google Maps", length: Math.round(pathLength(path)) });
  } catch { return NextResponse.json({ error: "Pencarian merchant gagal. Silakan coba lagi." }, { status: 502 }); }
}
