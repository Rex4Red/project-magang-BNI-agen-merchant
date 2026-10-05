import { createGoogleMapsScraper, scrapeGoogleMaps } from "@/lib/google-maps-scraper";
import { nearestOnRoad, pathLength, samplePath, validPoint, type Point } from "@/lib/road-geometry";

export async function searchMerchants(path: Point[], width: number, roadName: string, onProgress: (completed: number, total: number) => void) {
    const centers = samplePath(path);
    const suffix = ["Jalan tanpa nama", "Jalur manual"].includes(roadName) ? "" : ` di ${roadName}`;
    const queries = [`toko${suffix}`, `warung${suffix}`, `restoran kafe${suffix}`];
    const jobs = centers.flatMap((center, pointIndex) => queries.map(query => ({ center, pointIndex, query })));
    onProgress(0, jobs.length);
    const searches: PromiseSettledResult<Awaited<ReturnType<typeof scrapeGoogleMaps>>>[] = new Array(jobs.length);
    let nextJob = 0;
    const scraper = await createGoogleMapsScraper();
    try {
    // Keep browser use bounded while covering the full drawn line.
    await Promise.all(Array.from({ length: Math.min(3, jobs.length) }, async () => {
      while (nextJob < jobs.length) {
        const index = nextJob++;
        const { center, query } = jobs[index];
        try { searches[index] = { status: "fulfilled", value: await scraper.search(query, center[0], center[1], 18) }; }
        catch (reason) { searches[index] = { status: "rejected", reason }; }
        onProgress(searches.filter(Boolean).length, jobs.length);
      }
    }));
    } finally { await scraper.close(); }
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
    return { results, coverage, warning: failed ? `${failed} dari ${jobs.length} pencarian gagal. Sebagian jalur mungkin belum tercakup; coba cari ulang.` : "", source: "Google Maps", length: Math.round(pathLength(path)) };
}
