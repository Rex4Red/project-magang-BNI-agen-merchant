interface GeocodingResult {
  name: string;
  display_name: string;
  lat: string;
  lon: string;
  category: string;
  type: string;
  boundingbox: [string, string, string, string];
}

export interface SearchArea {
  name: string;
  lat: number;
  lng: number;
  radiusKm: number | null;
  bounds: [number, number, number, number] | null;
}

const cache = new Map<string, { value: SearchArea; expires: number }>();
let lastRequestAt = 0;
let requestQueue: Promise<unknown> = Promise.resolve();

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRadians = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRadians;
  const dLng = (lng2 - lng1) * toRadians;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRadians) * Math.cos(lat2 * toRadians) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isStoreInArea(
  store: { name: string; address: string; lat: number; lng: number },
  area: SearchArea
): boolean {
  const areaName = area.name.toLocaleLowerCase("id-ID");
  const mentionsArea = Boolean(areaName) && `${store.name} ${store.address}`
    .toLocaleLowerCase("id-ID").includes(areaName);
  if (Number.isFinite(store.lat) && Number.isFinite(store.lng) &&
      Math.abs(store.lat) <= 90 && Math.abs(store.lng) <= 180 &&
      (store.lat !== 0 || store.lng !== 0)) {
    if (area.bounds) {
      const [south, north, west, east] = area.bounds;
      return store.lat >= south && store.lat <= north && store.lng >= west && store.lng <= east;
    }
    const distance = distanceKm(area.lat, area.lng, store.lat, store.lng);
    const radius = area.radiusKm ?? 1.5;
    return distance <= (mentionsArea ? radius : radius * 0.4);
  }
  return mentionsArea;
}

export async function resolveSearchArea(name: string): Promise<SearchArea | null> {
  const key = name.toLocaleLowerCase("id-ID").trim();
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;

  const task = requestQueue.then(async () => {
    const existing = cache.get(key);
    if (existing && existing.expires > Date.now()) return existing.value;
    const delay = Math.max(0, 1100 - (Date.now() - lastRequestAt));
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    lastRequestAt = Date.now();

    const endpoint = process.env.BNI_GEOCODER_URL || "https://nominatim.openstreetmap.org/search";
    const url = new URL(endpoint);
    url.searchParams.set("q", name);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("countrycodes", "id");
    url.searchParams.set("limit", "5");
    const response = await fetch(url, {
      headers: { "User-Agent": "BNI-Canvas/0.1 (area search; local webapp)" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("Layanan pencarian daerah tidak tersedia");
    const locations = await response.json() as GeocodingResult[];
    const normalized = key.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const matching = locations.filter((location) => {
      const placeName = location.name?.toLocaleLowerCase("id-ID")
        .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      return placeName === normalized || placeName?.endsWith(` ${normalized}`);
    });
    const candidates = matching.length ? matching : locations;
    const location = candidates.sort((a, b) => {
      const rank = (place: GeocodingResult) =>
        place.category === "boundary" ? 3 :
          place.category === "place" ? 2 : place.type === "residential" ? 1 : 0;
      return rank(b) - rank(a);
    })[0];
    if (!location) return null;

    const lat = Number(location.lat);
    const lng = Number(location.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const administrative = location.category === "boundary";
    const bounds = administrative
      ? location.boundingbox.map(Number) as [number, number, number, number]
      : null;
    const area: SearchArea = {
      name,
      lat,
      lng,
      bounds: bounds?.every(Number.isFinite) ? bounds : null,
      radiusKm: administrative ? null : location.type === "town" ? 3 : 1.5,
    };
    cache.set(key, { value: area, expires: Date.now() + 24 * 60 * 60 * 1000 });
    return area;
  });
  requestQueue = task.catch(() => undefined);
  return task;
}
