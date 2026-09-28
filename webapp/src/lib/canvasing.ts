"use client";

import { useSyncExternalStore } from "react";
import { readSession } from "./session";

export interface Prospect {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating: number;
  reviewCount: number;
  category: string;
  photoUrl: string | null;
  url: string;
  classification?: {
    label: "potensial" | "non_potensial" | "unavailable";
    confidence: number | null;
    reason?: "no_photo" | "image_error" | "business_unknown" | "request_failed" | null;
    source?: "image_model" | "business_type";
    businessReason?: string | null;
  };
}

export interface Visit extends Prospect {
  visitId: string;
  status: "planned" | "visited";
  notes: string;
  phone?: string;
  pic?: string;
  agentStatus?: "unknown" | "yes" | "no";
  agentProvider?: string;
  qrisStatus?: "unknown" | "yes" | "no";
  qrisProvider?: string;
  qrisProviders?: string[];
  edcStatus?: "unknown" | "yes" | "no";
  edcProviders?: string[];
  followUp?: string;
  prospectResult?: string;
  visitArea?: string;
  visitedAt?: string;
  visitPhotos?: string[];
  locationAccuracy?: number;
  locationCapturedAt?: string;
}

export interface VisitList {
  id: string;
  name: string;
  area: string;
  source: { mode: "area" | "map" | "road"; selection?: "manual"; bounds?: string; polygon?: [number, number][]; road?: string; lengthMeters?: number; corridorMeters?: number };
  createdAt: string;
  updatedAt: string;
  stores: Visit[];
}

const EMPTY = '{"version":1,"lists":[]}';
const EVENT = "canvas-visits-changed";

function storageKey() {
  const user = readSession(localStorage.getItem("user"));
  if (!user?.username) throw new Error("Masuk kembali untuk menyimpan daftar kunjungan.");
  return user.workspace === "merchant" ? `bni-canvas:merchant-visits:v1:${user.username}` : `bni-canvas:visits:v1:${user.username}`;
}

function snapshot() {
  try { return localStorage.getItem(storageKey()) || EMPTY; }
  catch { return "unavailable"; }
}

function parse(raw: string): VisitList[] {
  const data = JSON.parse(raw);
  if (data.version !== 1 || !Array.isArray(data.lists) || data.lists.some((list: VisitList) =>
    !list.id || !list.name || !Array.isArray(list.stores))) {
    throw new Error("Format daftar kunjungan tidak dapat dibaca.");
  }
  return data.lists;
}

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(EVENT, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(EVENT, listener);
  };
}

export function useVisitLists() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  try { return { lists: parse(raw), error: "" }; }
  catch { return { lists: [] as VisitList[], error: "Daftar tersimpan tidak dapat dibaca. Periksa akses penyimpanan browser; data lama tidak ditimpa." }; }
}

function persist(lists: VisitList[]) {
  try { localStorage.setItem(storageKey(), JSON.stringify({ version: 1, lists })); }
  catch { throw new Error("Gagal menyimpan. Penyimpanan browser mungkin penuh atau tidak diizinkan."); }
  window.dispatchEvent(new Event(EVENT));
}

// Search IDs are only unique within one response, so do not use them for deduplication.
function identity(store: Prospect) {
  return `${store.name.trim().toLowerCase()}|${store.lat.toFixed(6)}|${store.lng.toFixed(6)}|${store.lat || store.lng ? "" : store.address.trim().toLowerCase()}`;
}

export function saveVisitList(input: {
  listId?: string; name: string; area: string; source: VisitList["source"]; stores: Prospect[];
}) {
  if (!input.stores.length) throw new Error("Pilih minimal satu toko.");
  if (!input.listId && (!input.name.trim() || !input.area.trim())) throw new Error("Isi nama daftar dan area kunjungan.");
  const lists = parse(snapshot());
  const existing = input.listId ? lists.find((list) => list.id === input.listId) : undefined;
  if (input.listId && !existing) throw new Error("Daftar tujuan sudah tidak tersedia.");
  const now = new Date().toISOString();
  const list: VisitList = existing || {
    id: crypto.randomUUID(), name: input.name.trim(), area: input.area.trim(), source: input.source,
    createdAt: now, updatedAt: now, stores: [],
  };
  const seen = new Set(list.stores.map(identity));
  let added = 0;
  for (const store of input.stores) {
    const key = identity(store);
    if (seen.has(key)) continue;
    seen.add(key);
    list.stores.push({ ...store, visitId: crypto.randomUUID(), status: "planned", notes: "" });
    added++;
  }
  list.updatedAt = now;
  if (!existing) lists.unshift(list);
  persist(lists);
  return { id: list.id, name: list.name, added, skipped: input.stores.length - added };
}

export function updateVisit(listId: string, visitId: string, patch: Partial<Omit<Visit, "id" | "visitId">>) {
  const lists = parse(snapshot());
  const list = lists.find((item) => item.id === listId);
  const store = list?.stores.find((item) => item.visitId === visitId);
  if (!list || !store) throw new Error("Toko tersimpan tidak ditemukan.");
  Object.assign(store, patch);
  list.updatedAt = new Date().toISOString();
  persist(lists);
}

export function addManualVisit(listId: string, visit: Visit) {
  const lists = parse(snapshot());
  const list = lists.find((item) => item.id === listId);
  if (!list) throw new Error("Daftar kunjungan tidak ditemukan.");
  list.stores.push({ ...visit, id: crypto.randomUUID(), visitId: crypto.randomUUID() });
  list.updatedAt = new Date().toISOString();
  persist(lists);
}
export const displayCategory = (store: Prospect): string => {
  let category = store.category.trim();
  if (category.toLowerCase().startsWith(store.name.toLowerCase())) {
    category = category.slice(store.name.length);
  }
  category = category
    .replace(/^\d[,.]\d(?:\([\d.,]+\))?/, "")
    .replace(/^Tidak ada ulasan/i, "")
    .replace(/(Segera tutup|Buka 24 jam|Buka|Tutup).*$/i, "")
    .trim();
  return category || "Jenis usaha belum tersedia";
};

export const displayAddress = (address: string): string =>
  address.replace(/(Buka 24 jam|Segera tutup|Buka|Tutup)$/i, "").trim();



