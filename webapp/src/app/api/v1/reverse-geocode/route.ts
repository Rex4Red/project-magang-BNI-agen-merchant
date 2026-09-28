import { NextRequest, NextResponse } from "next/server";

let queue: Promise<unknown> = Promise.resolve();
let lastRequest = 0;
const cache = new Map<string, string>();

export async function GET(request: NextRequest) {
  const rawLat = request.nextUrl.searchParams.get("lat");
  const rawLng = request.nextUrl.searchParams.get("lng");
  const lat = Number(rawLat), lng = Number(rawLng);
  if (!rawLat?.trim() || !rawLng?.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "Koordinat tidak valid." }, { status: 400 });
  }
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  try {
    const task = queue.then(async () => {
      if (cache.has(key)) return cache.get(key)!;
      const wait = Math.max(0, 1100 - (Date.now() - lastRequest));
      if (wait) await new Promise(resolve => setTimeout(resolve, wait));
      lastRequest = Date.now();
      const url = new URL("https://nominatim.openstreetmap.org/reverse");
      url.search = new URLSearchParams({ lat: String(lat), lon: String(lng), format: "jsonv2", "accept-language": "id" }).toString();
      const response = await fetch(url, { headers: { "User-Agent": "BNI-Canvas-Local/1.0" }, signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error("Geocoder unavailable");
      const data = await response.json();
      if (typeof data.display_name !== "string") throw new Error("Address unavailable");
      if (cache.size >= 200) cache.clear();
      cache.set(key, data.display_name);
      return data.display_name;
    });
    queue = task.catch(() => undefined);
    return NextResponse.json({ address: await task });
  } catch {
    return NextResponse.json({ error: "Alamat tidak ditemukan. Silakan isi manual." }, { status: 502 });
  }
}
