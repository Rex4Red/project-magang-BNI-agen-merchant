import { NextRequest } from "next/server";
import { authenticatedUser, DataError } from "@/lib/server/database";
import { readLists, version, visitCommand, visitSnapshot } from "@/lib/server/visit-store";
import { resolveGoogleMapsCoordinates } from "@/lib/server/maps-coordinates";
import { SESSION_COOKIE, NO_STORE, apiError, bodyJson, checkWriteRequest } from "@/lib/server/request";

export const runtime = "nodejs";
function userFor(request: NextRequest) {
  const user = authenticatedUser(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) throw new DataError("Sesi berakhir. Masuk kembali untuk mengakses database.", 401);
  if (request.headers.get("x-canvas-account") !== user.username)
    throw new DataError("Akun yang sedang masuk berubah. Muat ulang halaman.", 409);
  return user;
}
export async function GET(request: NextRequest) {
  try {
    const user = userFor(request), current = version(user.username);
    const etag = `"${current.databaseId}:${user.username}:${current.revision}"`;
    if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ...NO_STORE, ETag: etag } });
    return Response.json(visitSnapshot(user.username), { headers: { ...NO_STORE, ETag: etag } });
  } catch (error) { return apiError(error); }
}
export async function POST(request: NextRequest) {
  try {
    checkWriteRequest(request); const user = userFor(request);
    const body = await bodyJson(request);
    let result;
    if (body.action === 'resolve-location') {
      const store = readLists(user.username).find(list => list.id === body.listId)?.stores.find(store => store.visitId === body.visitId);
      if (!store) throw new DataError('Toko tersimpan tidak ditemukan. Muat ulang daftar.', 404);
      if (Number.isFinite(store.lat) && Number.isFinite(store.lng) && (store.lat !== 0 || store.lng !== 0)) {
        result = { resolved: true };
      } else {
        if (body.expectedUpdatedAt !== (store.updatedAt || null)) throw new DataError('Catatan berubah. Muat ulang lalu coba lagi.', 409);
        let coordinates;
        try { coordinates = await resolveGoogleMapsCoordinates(store.url); }
        catch { coordinates = null; }
        if (coordinates) {
          visitCommand(user.username, { ...body, action: 'update-visit', patch: coordinates });
          result = { resolved: true };
        } else result = { resolved: false, reason: 'Koordinat pin tidak ditemukan di tautan Google Maps atau layanan belum dapat dihubungi. Isi Latitude dan Longitude di Excel, atau ambil lokasi saat berada di toko.' };
      }
    } else result = visitCommand(user.username, body);
    return Response.json({ ...visitSnapshot(user.username), result }, { headers: NO_STORE });
  } catch (error) { return apiError(error); }
}
