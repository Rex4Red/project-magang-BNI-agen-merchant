import { createHash } from "node:crypto";
import { createGoogleMapsScraper, type ScrapedStore } from "@/lib/google-maps-scraper";
import { areaSearchPlan } from "@/lib/area-search-plan";
import { insidePolygon, type AreaPoint } from "@/lib/search-polygon";
import { classifyBusinessType } from "@/lib/store-business-type";
import { isStoreInArea, resolveSearchArea, type SearchArea } from "@/lib/search-area";

export class AgentSearchError extends Error {}
export interface AgentSearchInput { mode: 'area' | 'map'; area?: string; mapLocation: SearchArea | null; zoom: number; polygon: AreaPoint[] | null }
export interface AgentSearchData {
  results: ScrapedStore[]; total: number; mode: 'area' | 'map';
  area: { lat: number; lng: number; radiusKm: number | null }; source: string;
  coverage: { points: number; successfulQueries: number; totalQueries: number; cellMeters: number };
  warning: string | null;
}
export async function searchAgents({ mode, area, mapLocation, zoom, polygon }: AgentSearchInput, onProgress: (completed: number, total: number) => void, onResults?: (data: AgentSearchData) => void): Promise<AgentSearchData> {
    const location = mapLocation || await resolveSearchArea(area || "");
    if (!location) {
      throw new AgentSearchError(`Daerah "${area}" tidak ditemukan. Coba nama daerah yang lebih lengkap.`);
    }
    const queries = mode === "map" ? ["toko kelontong", "toko sembako", "minimarket", "swalayan"]
      : [`toko kelontong di ${area}`, `warung sembako di ${area}`];
    const plan = mode === 'map' ? areaSearchPlan(polygon || [
      [location.bounds![0], location.bounds![2]], [location.bounds![0], location.bounds![3]],
      [location.bounds![1], location.bounds![3]], [location.bounds![1], location.bounds![2]],
    ]) : { points: [[location.lat, location.lng]] as AreaPoint[], cellMeters: 0, coarse: false, zoom };
    const tasks = plan.points.flatMap((point, pointIndex) => queries.map(query => ({ point, pointIndex, query })));
    onProgress(0, tasks.length);
    const searches: PromiseSettledResult<ScrapedStore[]>[] = new Array(tasks.length);
    const collected = new Map<string, ScrapedStore>();
    const relevant = (store: ScrapedStore) => classifyBusinessType(store.name, store.category).decision !== 'non_potensial'
      && isStoreInArea(store, location) && (!polygon || insidePolygon([store.lat, store.lng], polygon));
    const snapshot = (): AgentSearchData => {
      const successful = searches.filter(result => result?.status === 'fulfilled').length;
      return {
        results: [...collected.values()], total: collected.size, mode,
        area: { lat: location.lat, lng: location.lng, radiusKm: location.radiusKm }, source: 'google-maps-scrape',
        coverage: { points: plan.points.length, successfulQueries: successful, totalQueries: tasks.length, cellMeters: plan.cellMeters },
        warning: [searches.filter(result => result?.status === 'rejected').length ? `${searches.filter(result => result?.status === 'rejected').length} pencarian gagal; cakupan hasil belum lengkap. Coba cari ulang.` : '',
          plan.coarse ? 'Area luas menggunakan pencarian lebih renggang. Gambar area lebih kecil untuk penelusuran lebih rinci.' : ''].filter(Boolean).join(' ') || null,
      };
    };
    let cursor = 0;
    const scraper = await createGoogleMapsScraper({ loadPhotoFor: relevant });
    try {
    await Promise.all(Array.from({ length: Math.min(3, tasks.length) }, async () => {
      while (cursor < tasks.length) {
        const index = cursor++, task = tasks[index];
        try {
          const stores = await scraper.search(task.query, task.point[0], task.point[1], plan.zoom);
          searches[index] = { status: 'fulfilled', value: stores };
          for (const store of stores) {
            if (!relevant(store)) continue;
            const identity = store.url.match(/!1s([^!/?]+)/)?.[1] || `${store.name.toLocaleLowerCase('id-ID').trim()}|${store.lat.toFixed(5)}|${store.lng.toFixed(5)}`;
            const existing = collected.get(identity);
            const preferred = !existing || (classifyBusinessType(existing.name, existing.category).decision === 'unknown'
              && classifyBusinessType(store.name, store.category).decision === 'potensial') ? store : existing;
            collected.set(identity, {
              ...preferred, id: existing?.id || `store-${createHash('sha256').update(identity).digest('hex').slice(0, 16)}`,
              photoUrl: existing?.photoUrl || store.photoUrl,
            });
          }
        }
        catch (reason) { searches[index] = { status: 'rejected', reason }; }
        onProgress(searches.filter(Boolean).length, tasks.length);
        onResults?.(snapshot());
      }
    }));
    } finally { await scraper.close(); }
    const successful = searches.filter((result) => result.status === "fulfilled");
    if (successful.length === 0) {
      throw new Error("Semua pencarian Google Maps gagal");
    }

    return snapshot();
}
