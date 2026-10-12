import { createGoogleMapsScraper, scrapeGoogleMaps, type ScrapedStore } from "@/lib/google-maps-scraper";
import { nearestOnRoad, pathLength, samplePath, validPoint, type Point } from "@/lib/road-geometry";
import { areaSearchPlan } from "@/lib/area-search-plan";
import { insidePolygon, type AreaPoint } from "@/lib/search-polygon";
import { isStoreInArea, resolveSearchArea } from "@/lib/search-area";

export interface MerchantStore extends ScrapedStore {
  distanceFromRoad?: number;
  distanceFromStart?: number;
}

export type MerchantSearchInput =
  | { mode: 'road'; path: Point[]; width: number; roadName: string; query?: string }
  | { mode: 'area'; area: string; query?: string }
  | { mode: 'map'; polygon: AreaPoint[]; zoom?: number; query?: string };

export interface MerchantSearchResult {
  results: MerchantStore[];
  total: number;
  mode: 'road' | 'area' | 'map';
  coverage?: { point?: Point; successfulQueries: number; totalQueries: number }[] | { points: number; successfulQueries: number; totalQueries: number; cellMeters?: number };
  warning?: string;
  source: string;
  length?: number;
  area?: { lat: number; lng: number; radiusKm: number | null };
}

/**
 * Search merchants for canvasing.
 * Unlike agent search (which focuses exclusively on grocery/kelontong stores),
 * merchant search targets ALL businesses (stores, cafes, restaurants, fashion,
 * workshops, pharmacies, retail, etc.) without filtering out non-grocery types.
 */
export async function searchMerchants(
  inputOrPath: MerchantSearchInput | Point[],
  widthOrOnProgress?: number | ((completed: number, total: number) => void),
  roadNameOrUndefined?: string,
  onProgressOrUndefined?: (completed: number, total: number) => void
): Promise<MerchantSearchResult> {
  let input: MerchantSearchInput;
  let onProgress: (completed: number, total: number) => void;

  if (Array.isArray(inputOrPath)) {
    input = {
      mode: 'road',
      path: inputOrPath,
      width: typeof widthOrOnProgress === 'number' ? widthOrOnProgress : 50,
      roadName: roadNameOrUndefined || 'Jalur manual',
    };
    onProgress = typeof onProgressOrUndefined === 'function' ? onProgressOrUndefined : () => {};
  } else {
    input = inputOrPath;
    onProgress = typeof widthOrOnProgress === 'function' ? widthOrOnProgress : () => {};
  }

  if (input.mode === 'road') {
    return searchMerchantsByRoad(input, onProgress);
  } else if (input.mode === 'area') {
    return searchMerchantsByArea(input, onProgress);
  } else {
    return searchMerchantsByMap(input, onProgress);
  }
}

async function searchMerchantsByRoad(
  input: { mode: 'road'; path: Point[]; width: number; roadName: string; query?: string },
  onProgress: (completed: number, total: number) => void
): Promise<MerchantSearchResult> {
  const { path, width, roadName, query: customQuery } = input;
  const centers = samplePath(path);
  const suffix = ["Jalan tanpa nama", "Jalur manual"].includes(roadName) ? "" : ` di ${roadName}`;

  // Broad queries to capture ALL types of merchants along the route
  const queries = customQuery && customQuery.trim()
    ? [`${customQuery.trim()}${suffix}`]
    : [`toko${suffix}`, `restoran kafe${suffix}`, `warung${suffix}`, `pertokoan${suffix}`];

  const jobs = centers.flatMap((center, pointIndex) => queries.map(query => ({ center, pointIndex, query })));
  onProgress(0, jobs.length);

  const searches: PromiseSettledResult<Awaited<ReturnType<typeof scrapeGoogleMaps>>>[] = new Array(jobs.length);
  let nextJob = 0;
  const scraper = await createGoogleMapsScraper();

  try {
    await Promise.all(Array.from({ length: Math.min(3, jobs.length) }, async () => {
      while (nextJob < jobs.length) {
        const index = nextJob++;
        const { center, query } = jobs[index];
        try {
          searches[index] = { status: "fulfilled", value: await scraper.search(query, center[0], center[1], 18) };
        } catch (reason) {
          searches[index] = { status: "rejected", reason };
        }
        onProgress(searches.filter(Boolean).length, jobs.length);
      }
    }));
  } finally {
    await scraper.close();
  }

  if (searches.every(r => r.status === "rejected")) {
    throw new Error("Pencarian Google Maps gagal. Coba lagi.");
  }

  const seen = new Set<string>();
  const results: MerchantStore[] = searches.flatMap(result => result.status === "fulfilled" ? result.value : []).flatMap(store => {
    if (!validPoint([store.lat, store.lng]) || (!store.lat && !store.lng)) return [];
    const nearest = nearestOnRoad([store.lat, store.lng], path);
    if (nearest.distance > width) return [];
    const placeId = store.url.match(/!1s([^!/?]+)/)?.[1];
    const key = placeId || `${store.name.trim().toLowerCase()}|${store.lat.toFixed(5)}|${store.lng.toFixed(5)}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      ...store,
      id: `merchant-${seen.size}`,
      distanceFromRoad: Math.round(nearest.distance),
      distanceFromStart: Math.round(nearest.along)
    }];
  }).sort((a, b) => (a.distanceFromStart ?? 0) - (b.distanceFromStart ?? 0));

  const failed = searches.filter(r => r.status === "rejected").length;
  const coverage = centers.map((point, index) => ({
    point,
    successfulQueries: searches.filter((r, i) => jobs[i].pointIndex === index && r.status === "fulfilled").length,
    totalQueries: queries.length
  }));

  return {
    results,
    total: results.length,
    mode: 'road',
    coverage,
    warning: failed ? `${failed} dari ${jobs.length} pencarian gagal. Sebagian jalur mungkin belum tercakup; coba cari ulang.` : "",
    source: "Google Maps",
    length: Math.round(pathLength(path))
  };
}

async function searchMerchantsByArea(
  input: { mode: 'area'; area: string; query?: string },
  onProgress: (completed: number, total: number) => void
): Promise<MerchantSearchResult> {
  const location = await resolveSearchArea(input.area);
  if (!location) {
    throw new Error(`Daerah "${input.area}" tidak ditemukan. Coba nama daerah yang lebih lengkap.`);
  }

  // Broad queries covering all merchant types in the given area
  const queries = input.query && input.query.trim()
    ? [`${input.query.trim()} di ${input.area}`]
    : [`toko di ${input.area}`, `restoran kafe di ${input.area}`, `warung di ${input.area}`, `pertokoan di ${input.area}`];

  const plan = location.bounds ? areaSearchPlan([
    [location.bounds[0], location.bounds[2]],
    [location.bounds[0], location.bounds[3]],
    [location.bounds[1], location.bounds[3]],
    [location.bounds[1], location.bounds[2]],
  ]) : { points: [[location.lat, location.lng]] as AreaPoint[], cellMeters: 0, coarse: false, zoom: 15 };

  const tasks = plan.points.flatMap((point, pointIndex) => queries.map(query => ({ point, pointIndex, query })));
  onProgress(0, tasks.length);

  const searches: PromiseSettledResult<ScrapedStore[]>[] = new Array(tasks.length);
  let cursor = 0;
  const scraper = await createGoogleMapsScraper();

  try {
    await Promise.all(Array.from({ length: Math.min(3, tasks.length) }, async () => {
      while (cursor < tasks.length) {
        const index = cursor++;
        const task = tasks[index];
        try {
          searches[index] = { status: 'fulfilled', value: await scraper.search(task.query, task.point[0], task.point[1], plan.zoom) };
        } catch (reason) {
          searches[index] = { status: 'rejected', reason };
        }
        onProgress(searches.filter(Boolean).length, tasks.length);
      }
    }));
  } finally {
    await scraper.close();
  }

  if (searches.every(r => r.status === "rejected")) {
    throw new Error("Pencarian Google Maps gagal. Coba lagi.");
  }

  const seen = new Set<string>();
  const results: MerchantStore[] = searches.flatMap(result => result.status === 'fulfilled' ? result.value : []).flatMap(store => {
    if (!validPoint([store.lat, store.lng]) || (!store.lat && !store.lng)) return [];
    if (!isStoreInArea(store, location)) return [];
    const placeId = store.url.match(/!1s([^!/?]+)/)?.[1];
    const key = placeId || `${store.name.trim().toLowerCase()}|${store.lat.toFixed(5)}|${store.lng.toFixed(5)}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ ...store, id: `merchant-${seen.size}` }];
  });

  const failed = searches.filter(r => r.status === 'rejected').length;
  const coverage = {
    points: plan.points.length,
    successfulQueries: searches.filter(r => r.status === 'fulfilled').length,
    totalQueries: tasks.length,
    cellMeters: plan.cellMeters,
  };

  return {
    results,
    total: results.length,
    mode: 'area',
    area: { lat: location.lat, lng: location.lng, radiusKm: location.radiusKm },
    coverage,
    warning: failed ? `${failed} dari ${tasks.length} pencarian gagal; hasil belum lengkap. Coba cari ulang.` : "",
    source: "Google Maps"
  };
}

async function searchMerchantsByMap(
  input: { mode: 'map'; polygon: AreaPoint[]; zoom?: number; query?: string },
  onProgress: (completed: number, total: number) => void
): Promise<MerchantSearchResult> {
  const plan = areaSearchPlan(input.polygon);
  const queries = input.query && input.query.trim()
    ? [input.query.trim()]
    : ["toko", "restoran kafe", "warung", "pertokoan"];

  const tasks = plan.points.flatMap((point, pointIndex) => queries.map(query => ({ point, pointIndex, query })));
  onProgress(0, tasks.length);

  const searches: PromiseSettledResult<ScrapedStore[]>[] = new Array(tasks.length);
  let cursor = 0;
  const scraper = await createGoogleMapsScraper();

  try {
    await Promise.all(Array.from({ length: Math.min(3, tasks.length) }, async () => {
      while (cursor < tasks.length) {
        const index = cursor++;
        const task = tasks[index];
        try {
          searches[index] = { status: 'fulfilled', value: await scraper.search(task.query, task.point[0], task.point[1], plan.zoom) };
        } catch (reason) {
          searches[index] = { status: 'rejected', reason };
        }
        onProgress(searches.filter(Boolean).length, tasks.length);
      }
    }));
  } finally {
    await scraper.close();
  }

  if (searches.every(r => r.status === "rejected")) {
    throw new Error("Pencarian Google Maps gagal. Coba lagi.");
  }

  const seen = new Set<string>();
  const results: MerchantStore[] = searches.flatMap(result => result.status === 'fulfilled' ? result.value : []).flatMap(store => {
    if (!validPoint([store.lat, store.lng]) || (!store.lat && !store.lng)) return [];
    if (!insidePolygon([store.lat, store.lng], input.polygon)) return [];
    const placeId = store.url.match(/!1s([^!/?]+)/)?.[1];
    const key = placeId || `${store.name.trim().toLowerCase()}|${store.lat.toFixed(5)}|${store.lng.toFixed(5)}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ ...store, id: `merchant-${seen.size}` }];
  });

  const failed = searches.filter(r => r.status === 'rejected').length;
  const coverage = {
    points: plan.points.length,
    successfulQueries: searches.filter(r => r.status === 'fulfilled').length,
    totalQueries: tasks.length,
    cellMeters: plan.cellMeters,
  };

  return {
    results,
    total: results.length,
    mode: 'map',
    coverage,
    warning: failed ? `${failed} dari ${tasks.length} pencarian gagal; hasil belum lengkap. Coba cari ulang.` : "",
    source: "Google Maps"
  };
}
