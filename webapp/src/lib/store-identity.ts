import type { Prospect } from "./visit-types";
const clean = (value: string) => value.normalize("NFKC").toLocaleLowerCase("id-ID").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
function placeKey(url: string) {
  try {
    const parsed = new URL(url);
    const key = parsed.searchParams.get("query_place_id") || parsed.searchParams.get("cid") || parsed.searchParams.get("ftid");
    return key || decodeURIComponent(url).match(/!1s([^!/?#]+)/)?.[1] || "";
  } catch { return ""; }
}
export function sameStore(a: Prospect, b: Prospect) {
  // Search IDs such as merchant-1 restart each run; they are not place identifiers.
  const ak = placeKey(a.url), bk = placeKey(b.url);
  if (ak && bk && ak === bk) return true;
  if (!clean(a.name) || clean(a.name) !== clean(b.name)) return false;
  const located = (p: Prospect) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && !!(p.lat || p.lng);
  if (located(a) && located(b)) {
    const dy = (a.lat - b.lat) * 111320, dx = (a.lng - b.lng) * 111320 * Math.cos(a.lat * Math.PI / 180);
    return Math.hypot(dx, dy) <= 40;
  }
  const address = clean(a.address);
  return !!address && address === clean(b.address);
}
