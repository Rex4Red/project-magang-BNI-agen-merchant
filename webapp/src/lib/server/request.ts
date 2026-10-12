import { DataError } from "./database";

export const SESSION_COOKIE = "bni-canvas-session";
export const NO_STORE = { "Cache-Control": "private, no-store" };
export function checkWriteRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (request.headers.get("x-canvas-client") !== "1"
    || (origin && new URL(origin).host !== request.headers.get("host")))
    throw new DataError("Permintaan tidak berasal dari aplikasi ini.", 403);
}
export async function bodyJson(request: Request, limit = 24 * 1024 * 1024): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new DataError("Gunakan data JSON.", 415);
  if (Number(request.headers.get("content-length")) > limit) throw new DataError("Data terlalu besar untuk satu penyimpanan.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new DataError("Data belum diisi.");
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); throw new DataError("Data terlalu besar untuk satu penyimpanan.", 413); }
    chunks.push(value);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new DataError("Format data tidak dapat dibaca."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new DataError("Format data tidak sesuai.");
  return body;
}
export function apiError(error: unknown) {
  if (!(error instanceof DataError)) console.error("Database request failed", error);
  return Response.json({ error: error instanceof DataError ? error.message : "Database laptop belum dapat diakses. Data tidak diubah; coba lagi." },
    { status: error instanceof DataError ? error.status : 503, headers: NO_STORE });
}
