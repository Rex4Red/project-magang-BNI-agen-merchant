import { isGoogleMapsLink } from '../visit-template';

export interface MapCoordinates { lat: number; lng: number }
function point(latitude: string, longitude: string): MapCoordinates | null {
  const lat = Number(latitude), lng = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    && (lat !== 0 || lng !== 0) ? { lat, lng } : null;
}

export function coordinatesFromMapsUrl(value: string): MapCoordinates | null {
  if (!isGoogleMapsLink(value)) return null;
  const url = new URL(value);
  if (url.pathname.includes('/dir/')) return null;
  let decoded: string;
  try { decoded = decodeURIComponent(url.pathname + url.search); } catch { return null; }
  const places = [...decoded.matchAll(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g)]
    .map(match => point(match[1], match[2])).filter((value): value is MapCoordinates => value !== null);
  const unique = new Map(places.map(value => [`${value.lat},${value.lng}`, value]));
  if (unique.size === 1) return [...unique.values()][0];
  if (unique.size > 1) return null;
  for (const field of ['query', 'q']) {
    const match = url.searchParams.get(field)?.trim().match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
    if (match) return point(match[1], match[2]);
  }
  // @lat,lng describes the camera centre, which may differ from the business pin.
  return null;
}

export async function resolveGoogleMapsCoordinates(value: string, fetcher: typeof fetch = fetch): Promise<MapCoordinates | null> {
  let url = value;
  const signal = AbortSignal.timeout(15000);
  for (let redirects = 0; redirects < 6; redirects++) {
    if (!isGoogleMapsLink(url)) return null;
    const parsed = new URL(url);
    if (parsed.username || parsed.password || (parsed.port && parsed.port !== '443')) return null;
    const coordinates = coordinatesFromMapsUrl(url);
    if (coordinates) return coordinates;
    const response = await fetcher(url, { redirect: 'manual', signal });
    await response.body?.cancel();
    const location = response.headers.get('location');
    if (![301, 302, 303, 307, 308].includes(response.status) || !location) return null;
    url = new URL(location, url).href;
  }
  return null;
}
