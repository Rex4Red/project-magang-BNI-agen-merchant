import { NextRequest } from "next/server";
import { authenticatedUser, DataError } from "@/lib/server/database";
import { readLists, visitCommand } from "@/lib/server/visit-store";
import { accountFor, protectedSnapshot, requireListAccess, unlockList, lockList, listAllowed } from "@/lib/server/list-access";
import { resolveGoogleMapsCoordinates } from "@/lib/server/maps-coordinates";
import { SESSION_COOKIE, NO_STORE, apiError, bodyJson, checkWriteRequest } from "@/lib/server/request";

export const runtime = "nodejs";
function userFor(request: NextRequest) {
  const user = authenticatedUser(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) throw new DataError("Sesi berakhir. Masuk kembali untuk mengakses database.", 401);
  if (request.headers.get("x-canvas-account") !== accountFor(user))
    throw new DataError("Akun yang sedang masuk berubah. Muat ulang halaman.", 409);
  return user;
}
export async function GET(request: NextRequest) {
  try {
    const user = userFor(request), token = request.cookies.get(SESSION_COOKIE)!.value;
    return Response.json(protectedSnapshot(user, token), { headers: NO_STORE });
  } catch (error) { return apiError(error); }
}
export async function POST(request: NextRequest) {
  try {
    checkWriteRequest(request); const user = userFor(request);
    const body = await bodyJson(request);
    const token = request.cookies.get(SESSION_COOKIE)!.value, account = accountFor(user);
    const input = body.input && typeof body.input === "object" ? body.input as Record<string, unknown> : {};
    if (body.listId !== undefined) {
      if (!["unlock-list", "lock-list"].includes(String(body.action))) requireListAccess(user, token, body.listId);
    }
    if (input.listId !== undefined) requireListAccess(user, token, input.listId);
    if (["import", "import-excel", "import-agent-excel"].includes(String(body.action)) &&
        readLists(account).some(list => !listAllowed(user, token, list.id)))
      throw new DataError("Buka semua daftar terkunci sebelum mengimpor agar data terlindungi tidak berubah.", 403);
    let result;
    if (body.action === "unlock-list") { unlockList(user, token, body.listId, body.password); result = {}; }
    else if (body.action === "lock-list") { lockList(user, token, body.listId); result = {}; }
    else if (body.action === 'resolve-location') {
      const store = readLists(account).find(list => list.id === body.listId)?.stores.find(store => store.visitId === body.visitId);
      if (!store) throw new DataError('Toko tersimpan tidak ditemukan. Muat ulang daftar.', 404);
      if (Number.isFinite(store.lat) && Number.isFinite(store.lng) && (store.lat !== 0 || store.lng !== 0)) {
        result = { resolved: true };
      } else {
        if (body.expectedUpdatedAt !== (store.updatedAt || null)) throw new DataError('Catatan berubah. Muat ulang lalu coba lagi.', 409);
        let coordinates;
        try { coordinates = await resolveGoogleMapsCoordinates(store.url); }
        catch { coordinates = null; }
        if (coordinates) {
          visitCommand(account, { ...body, action: 'update-visit', patch: coordinates });
          result = { resolved: true };
        } else result = { resolved: false, reason: 'Koordinat pin tidak ditemukan di tautan Google Maps atau layanan belum dapat dihubungi. Isi Latitude dan Longitude di Excel, atau ambil lokasi saat berada di toko.' };
      }
    } else result = visitCommand(account, body);
    return Response.json({ ...protectedSnapshot(user, token), result }, { headers: NO_STORE });
  } catch (error) { return apiError(error); }
}
