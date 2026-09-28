import { scrapeGoogleMaps } from "@/lib/google-maps-scraper";
import { areaSearchPlan } from "@/lib/area-search-plan";
import { insidePolygon, polygonError, type AreaPoint } from "@/lib/search-polygon";
import { NextRequest, NextResponse } from "next/server";
import { classifyBusinessType } from "@/lib/store-business-type";
import { isStoreInArea, resolveSearchArea, type SearchArea } from "@/lib/search-area";

interface ScrapedStore {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating: number;
  reviewCount: number;
  category: string;
  photoUrl: string | null;
  url: string;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
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

  try {
    const location = mapLocation || await resolveSearchArea(area!);
    if (!location) {
      return NextResponse.json({ error: `Daerah "${area}" tidak ditemukan. Coba nama daerah yang lebih lengkap.` }, { status: 422 });
    }
    const queries = mode === "map" ? ["toko kelontong", "toko sembako", "minimarket", "swalayan"]
      : [`toko kelontong di ${area}`, `warung sembako di ${area}`];
    const plan = mode === 'map' ? areaSearchPlan(polygon || [
      [location.bounds![0], location.bounds![2]], [location.bounds![0], location.bounds![3]],
      [location.bounds![1], location.bounds![3]], [location.bounds![1], location.bounds![2]],
    ]) : { points: [[location.lat, location.lng]] as AreaPoint[], cellMeters: 0, coarse: false, zoom };
    const tasks = plan.points.flatMap((point, pointIndex) => queries.map(query => ({ point, pointIndex, query })));
    const searches: PromiseSettledResult<ScrapedStore[]>[] = new Array(tasks.length);
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(2, tasks.length) }, async () => {
      while (cursor < tasks.length) {
        const index = cursor++, task = tasks[index];
        try { searches[index] = { status: 'fulfilled', value: await scrapeGoogleMaps(task.query, task.point[0], task.point[1], plan.zoom) }; }
        catch (reason) { searches[index] = { status: 'rejected', reason }; }
      }
    }));
    const successful = searches.filter((result) => result.status === "fulfilled");
    if (successful.length === 0) {
      throw new Error("Semua pencarian Google Maps gagal");
    }

    const seen = new Set<string>();
    const results: ScrapedStore[] = [];
    for (const search of successful) {
      for (const store of search.value) {
        if (classifyBusinessType(store.name, store.category).decision === "non_potensial") continue;
        if (!isStoreInArea(store, location)) continue;
        if (polygon && !insidePolygon([store.lat, store.lng], polygon)) continue;
        const identity = store.url.match(/!1s([^!/?]+)/)?.[1] || `${store.name.toLocaleLowerCase("id-ID").trim()}|${store.lat.toFixed(5)}|${store.lng.toFixed(5)}`;
        if (seen.has(identity)) continue;
        seen.add(identity);
        results.push({ ...store, id: `store-${results.length}` });
      }
    }

    return NextResponse.json({
      results,
      total: results.length,
      mode,
      area: { lat: location.lat, lng: location.lng, radiusKm: location.radiusKm },
      source: "google-maps-scrape",
      coverage: { points: plan.points.length, successfulQueries: successful.length, totalQueries: tasks.length, cellMeters: plan.cellMeters },
      warning: [successful.length < tasks.length ? `${tasks.length - successful.length} pencarian gagal; cakupan hasil belum lengkap. Coba cari ulang.` : '',
        plan.coarse ? 'Area luas menggunakan pencarian lebih renggang. Gambar area lebih kecil untuk penelusuran lebih rinci.' : ''].filter(Boolean).join(' ') || null,
    });
  } catch (error) {
    console.error("Scrape error:", error);
    return NextResponse.json(
      {
        error: "Gagal mengambil data dari Google Maps. Coba lagi.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}


