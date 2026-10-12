"use client";
import { useEffect, useSyncExternalStore } from "react";
import { useSession, type Session } from "./session";
import type { Prospect, Visit, VisitList } from "./visit-types";
export type { Prospect, Visit, VisitList } from "./visit-types";

type DataState = { lists: VisitList[]; error: string; loading: boolean; migrationError: string; notice: string };
type ServerData = { lists: VisitList[]; databaseId: string; revision: number; username: string; result?: Record<string, unknown> };
type Cache = { state: DataState; databaseId?: string; revision?: number; initialized?: boolean; migratedDatabaseId?: string; pending?: Promise<void> };
const initial: DataState = { lists: [], error: "", loading: true, migrationError: "", notice: "" };
const caches = new Map<string, Cache>();
const listeners = new Set<() => void>();
let activeUser: Session | null = null;
function keyFor(user: Session) { return user.username; }
function cacheFor(user: Session) {
  const key = keyFor(user); let cache = caches.get(key);
  if (!cache) { cache = { state: initial }; caches.set(key, cache); }
  return cache;
}
function publish(cache: Cache, patch: Partial<DataState>) {
  cache.state = { ...cache.state, ...patch }; listeners.forEach(listener => listener());
}
function apply(cache: Cache, user: Session, data: ServerData, loading = false) {
  if (data.username !== user.username) throw new Error("Akun yang sedang masuk berubah. Muat ulang halaman.");
  if (cache.databaseId === data.databaseId && cache.revision !== undefined && data.revision < cache.revision) return;
  cache.databaseId = data.databaseId; cache.revision = data.revision; cache.initialized = true;
  publish(cache, { lists: data.lists, error: "", loading });
}
async function responseData(response: Response): Promise<ServerData> {
  let data;
  try { data = await response.json(); } catch { throw new Error("Respons database belum dapat dibaca. Coba lagi."); }
  if (!response.ok) throw new Error(data.error || "Gagal mengakses database laptop.");
  return data;
}
function headers(user: Session) { return { "Content-Type": "application/json", "x-canvas-client": "1", "x-canvas-account": user.username }; }
async function post(user: Session, body: Record<string, unknown>, commandId = crypto.randomUUID()) {
  const response = await fetch("/api/v1/visits", { method: "POST", headers: headers(user), body: JSON.stringify({ ...body, commandId }),
    signal: AbortSignal.timeout(45000) });
  return responseData(response);
}
async function migrate(user: Session, cache: Cache) {
  if (cache.migratedDatabaseId === cache.databaseId) return;
  const key = user.workspace === "merchant" ? `bni-canvas:merchant-visits:v1:${user.username}` : `bni-canvas:visits:v1:${user.username}`;
  let raw: string | null = null;
  try { raw = localStorage.getItem(key); } catch { /* The database works even if legacy browser storage is unavailable. */ }
  if (!raw) { cache.migratedDatabaseId = cache.databaseId; return; }
  const markerKey = `bni-canvas:database-import:v1:${user.username}`;
  const fingerprint = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)))].map(b => b.toString(16).padStart(2, "0")).join("");
  try {
    const marker = JSON.parse(localStorage.getItem(markerKey) || "null");
    if (marker?.databaseId === cache.databaseId && marker.fingerprint === fingerprint) {
      cache.migratedDatabaseId = cache.databaseId; return;
    }
  } catch { /* An unreadable marker is retried; the server import is idempotent. */ }
  publish(cache, { loading: true });
  const data = await post(user, { action: "import", legacyRaw: raw });
  apply(cache, user, data);
  cache.migratedDatabaseId = data.databaseId;
  try { localStorage.setItem(markerKey, JSON.stringify({ databaseId: data.databaseId, fingerprint })); }
  catch { /* The server receipt prevents duplicates if this marker cannot be stored. */ }
  publish(cache, { migrationError: "", notice: data.result?.alreadyImported ? "" :
    `${data.result?.importedLists || 0} daftar dan ${data.result?.importedStores || 0} toko dari browser sudah dipindahkan ke database.` });
}
export async function refreshVisits(force = false) {
  const user = activeUser; if (!user) return;
  const cache = cacheFor(user); if (cache.pending) return cache.pending;
  cache.pending = (async () => {
    try {
      const etag = cache.databaseId && !force ? `"${cache.databaseId}:${user.username}:${cache.revision}"` : "";
      const response = await fetch("/api/v1/visits", { cache: "no-store", headers: { ...headers(user), ...(etag ? { "If-None-Match": etag } : {}) },
        signal: AbortSignal.timeout(45000) });
      if (response.status !== 304) apply(cache, user, await responseData(response), !cache.initialized);
      else publish(cache, { error: "", loading: false });
      try { await migrate(user, cache); publish(cache, { loading: false }); }
      catch (error) { publish(cache, { loading: false, migrationError: error instanceof Error ? error.message : "Data lama belum dapat dipindahkan." }); }
    } catch (error) {
      publish(cache, { loading: false, error: error instanceof Error ? error.message : "Database laptop belum dapat dihubungi. Coba lagi." });
    } finally { cache.pending = undefined; }
  })();
  return cache.pending;
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    timer = setInterval(() => { if (!document.hidden) void refreshVisits(); }, 10000);
    window.addEventListener("focus", focusRefresh);
    window.addEventListener("canvas-session", changedAccount);
    document.addEventListener("visibilitychange", focusRefresh);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      clearInterval(timer); window.removeEventListener("focus", focusRefresh);
      window.removeEventListener("canvas-session", changedAccount);
      document.removeEventListener("visibilitychange", focusRefresh);
    }
  };
}
let timer: ReturnType<typeof setInterval>;
function focusRefresh() { if (!document.hidden) void refreshVisits(); }
function changedAccount() { caches.clear(); activeUser = null; listeners.forEach(listener => listener()); }
export function useVisitLists() {
  const { user } = useSession();
  const state = useSyncExternalStore(subscribe, () => user ? cacheFor(user).state : initial, () => initial);
  useEffect(() => {
    activeUser = user;
    if (user) void refreshVisits();
  }, [user?.username]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}
export function dismissDatabaseNotice() {
  if (activeUser) publish(cacheFor(activeUser), { notice: "" });
}
export async function retryLegacyImport() {
  if (activeUser) cacheFor(activeUser).migratedDatabaseId = undefined;
  await refreshVisits(true);
}
async function command(body: Record<string, unknown>) {
  const user = activeUser;
  if (!user) throw new Error("Masuk kembali untuk menyimpan kunjungan.");
  const cache = cacheFor(user);
  if (!cache.initialized || cache.state.loading || cache.state.error)
    throw new Error("Tunggu data database selesai dimuat atau coba hubungkan kembali.");
  try {
    const data = await post(user, body); apply(cache, user, data); return data.result || {};
  } catch (error) {
    void refreshVisits(true);
    throw error instanceof Error ? error : new Error("Penyimpanan belum dapat dipastikan. Periksa daftar lalu coba lagi.");
  }
}
function expectedTime(listId: string, visitId: string) {
  const store = activeUser && cacheFor(activeUser).state.lists.find(l => l.id === listId)?.stores.find(s => s.visitId === visitId);
  if (!store) throw new Error("Toko tersimpan tidak ditemukan. Muat ulang daftar.");
  return store.updatedAt || null;
}
export async function saveVisitList(input: { listId?: string; name: string; area: string; source: VisitList["source"]; stores: Prospect[] }) {
  const result = await command({ action: "save-list", input });
  return result as { id: string; name: string; added: number; skipped: number };
}
export async function updateVisit(listId: string, visitId: string, patch: Partial<Omit<Visit, "id" | "visitId">>, expectedUpdatedAt = expectedTime(listId, visitId)) {
  await command({ action: "update-visit", listId, visitId, patch, expectedUpdatedAt });
  return activeUser ? cacheFor(activeUser).state.lists.find(l => l.id === listId)?.stores.find(s => s.visitId === visitId) : undefined;
}
export async function deleteVisit(listId: string, visitId: string, expectedUpdatedAt = expectedTime(listId, visitId)) {
  await command({ action: "delete-visit", listId, visitId, expectedUpdatedAt });
}
export async function addManualVisit(listId: string, visit: Visit) {
  await command({ action: "add-manual", listId, visit });
}
export const displayCategory = (store: Prospect): string => {
  let category = store.category.trim();
  if (category.toLowerCase().startsWith(store.name.toLowerCase())) category = category.slice(store.name.length);
  category = category.replace(/^\d[,.]\d(?:\([\d.,]+\))?/, "").replace(/^Tidak ada ulasan/i, "")
    .replace(/(Segera tutup|Buka 24 jam|Buka|Tutup).*$/i, "").trim();
  return category || "Jenis usaha belum tersedia";
};
export const displayAddress = (address: string): string =>
  address.replace(/(Buka 24 jam|Segera tutup|Buka|Tutup)$/i, "").trim();



