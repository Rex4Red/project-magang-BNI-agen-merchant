import { NextRequest } from "next/server";
import { authenticatedUser, DataError } from "@/lib/server/database";
import { version, visitCommand, visitSnapshot } from "@/lib/server/visit-store";
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
    const result = visitCommand(user.username, await bodyJson(request));
    return Response.json({ ...visitSnapshot(user.username), result }, { headers: NO_STORE });
  } catch (error) { return apiError(error); }
}
