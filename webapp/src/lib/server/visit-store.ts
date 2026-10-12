import { createHash, randomUUID } from "node:crypto";
import type { Prospect, Visit, VisitList } from "../visit-types";
import { database, DataError, transaction, type DatabaseSync } from "./database";

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DataError("Format data toko tidak sesuai.");
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 65536, fallback?: string): string {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string" || value.length > max) throw new DataError("Isian teks tidak sesuai atau terlalu panjang.");
  return value;
}
function id(value: unknown) {
  const result = text(value, 200);
  if (!result) throw new DataError("ID daftar atau toko belum tersedia.");
  return result;
}
function numeric(value: unknown, fallback = 0) {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new DataError("Isian angka tidak sesuai.");
  return value;
}
function strings(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value) || value.length > maxItems) throw new DataError("Jumlah isian atau foto terlalu banyak.");
  return value.map(item => text(item, maxLength));
}
export function normalizeVisit(value: unknown): Visit {
  const raw = object(value);
  const store: Visit = {
    id: text(raw.id, 200, ""), visitId: text(raw.visitId, 200, ""),
    name: text(raw.name, 1000, ""), address: text(raw.address, 10000, ""),
    category: text(raw.category, 1000, ""), notes: text(raw.notes, 65536, ""),
    lat: numeric(raw.lat), lng: numeric(raw.lng),
    rating: numeric(raw.rating), reviewCount: numeric(raw.reviewCount),
    photoUrl: raw.photoUrl == null ? null : text(raw.photoUrl, 10000),
    url: text(raw.url, 10000, ""),
    status: raw.status === "visited" ? "visited" : "planned",
  };
  if (Math.abs(store.lat) > 90 || Math.abs(store.lng) > 180) throw new DataError("Koordinat toko tidak valid.");
  if (raw.status !== undefined && !["planned", "visited"].includes(String(raw.status))) throw new DataError("Status kunjungan tidak sesuai.");
  for (const field of ["phone", "pic", "businessId", "product", "financialInstitutions", "potential", "followUpNotes",
    "agentProvider", "qrisProvider", "followUp", "prospectResult", "visitArea", "visitedAt", "updatedAt", "locationCapturedAt"] as const)
    if (raw[field] !== undefined) store[field] = text(raw[field]);
  for (const field of ["agentStatus", "qrisStatus", "edcStatus"] as const) {
    if (raw[field] === undefined) continue;
    if (!["unknown", "yes", "no"].includes(String(raw[field]))) throw new DataError("Status produk tidak sesuai.");
    store[field] = raw[field] as "unknown" | "yes" | "no";
  }
  for (const field of ["qrisProviders", "edcProviders"] as const)
    if (raw[field] !== undefined) store[field] = strings(raw[field], 100, 1000);
  if (raw.visitPhotos !== undefined) {
    store.visitPhotos = strings(raw.visitPhotos, 3, 650000);
    if (store.visitPhotos.some(photo => !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(photo)))
      throw new DataError("Format foto kunjungan tidak dapat dibaca.");
  }
  if (raw.locationAccuracy !== undefined) store.locationAccuracy = numeric(raw.locationAccuracy);
  if (raw.classification !== undefined) {
    const classification = object(raw.classification);
    if (!["potensial", "non_potensial", "unavailable"].includes(String(classification.label))) throw new DataError("Hasil klasifikasi tidak sesuai.");
    store.classification = {
      label: classification.label as NonNullable<Visit["classification"]>["label"],
      confidence: classification.confidence == null ? null : numeric(classification.confidence),
    };
    if (["image_model", "business_type"].includes(String(classification.source)))
      store.classification.source = classification.source as "image_model" | "business_type";
    if (classification.businessReason != null) store.classification.businessReason = text(classification.businessReason, 1000);
    if (["no_photo", "image_error", "business_unknown", "low_confidence", "request_failed"].includes(String(classification.reason)))
      store.classification.reason = classification.reason as NonNullable<Visit["classification"]>["reason"];
  }
  return store;
}
function source(value: unknown): VisitList["source"] {
  const raw = object(value);
  if (!["area", "map", "road"].includes(String(raw.mode))) throw new DataError("Sumber daftar tidak sesuai.");
  const result: VisitList["source"] = { mode: raw.mode as VisitList["source"]["mode"] };
  if (raw.selection === "manual") result.selection = "manual";
  if (raw.bounds !== undefined) result.bounds = text(raw.bounds);
  if (raw.road !== undefined) result.road = text(raw.road, 1000);
  if (raw.lengthMeters !== undefined) result.lengthMeters = numeric(raw.lengthMeters);
  if (raw.corridorMeters !== undefined) result.corridorMeters = numeric(raw.corridorMeters);
  if (raw.polygon !== undefined) {
    if (!Array.isArray(raw.polygon) || raw.polygon.length > 1000) throw new DataError("Batas peta tidak sesuai.");
    result.polygon = raw.polygon.map(point => {
      if (!Array.isArray(point) || point.length !== 2) throw new DataError("Titik peta tidak sesuai.");
      const lat = numeric(point[0]), lng = numeric(point[1]);
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new DataError("Titik peta tidak sesuai.");
      return [lat, lng];
    });
  }
  return result;
}
export function readLists(username: string): VisitList[] {
  const db = database();
  const rows = db.prepare("SELECT * FROM visit_lists WHERE username=? ORDER BY created_at DESC,rowid DESC").all(username);
  const visits = db.prepare("SELECT list_id,data_json FROM visits WHERE username=? ORDER BY rowid").all(username);
  const grouped = new Map<string, Visit[]>();
  for (const row of visits) {
    const key = String(row.list_id); const list = grouped.get(key) || [];
    list.push(JSON.parse(String(row.data_json))); grouped.set(key, list);
  }
  return rows.map(row => ({ id: String(row.id), name: String(row.name), area: String(row.area),
    source: JSON.parse(String(row.source_json)), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    stores: grouped.get(String(row.id)) || [] }));
}
export function version(username: string) {
  const db = database();
  return {
    databaseId: String(db.prepare("SELECT value FROM meta WHERE key='database_id'").get()!.value),
    revision: Number(db.prepare("SELECT revision FROM accounts WHERE username=?").get(username)!.revision),
    username,
  };
}
export function visitSnapshot(username: string) { return { ...version(username), lists: readLists(username) }; }
const identity = (store: Prospect) => `${store.name.trim().toLowerCase()}|${store.lat.toFixed(6)}|${store.lng.toFixed(6)}|${store.lat || store.lng ? "" : store.address.trim().toLowerCase()}`;
function allocateBusinessId(db: DatabaseSync, username: string, store: Visit) {
  const ids = db.prepare("SELECT business_id FROM visits WHERE username=?").all(username).map(row => String(row.business_id || ""));
  if (store.businessId && !ids.includes(store.businessId)) return;
  const next = ids.reduce((max, key) => Math.max(max, Number(key.match(/^USH-(\d+)$/)?.[1]) || 0), 0) + 1;
  store.businessId = `USH-${String(next).padStart(3, "0")}`;
}
function insertVisit(db: DatabaseSync, username: string, listId: string, store: Visit) {
  allocateBusinessId(db, username, store);
  db.prepare("INSERT INTO visits VALUES(?,?,?,?,?)").run(username, listId, store.visitId, JSON.stringify(store), store.businessId!);
}
function existingVisit(db: DatabaseSync, username: string, listId: string, visitId: string): Visit {
  const row = db.prepare("SELECT data_json FROM visits WHERE username=? AND list_id=? AND visit_id=?").get(username, listId, visitId);
  if (!row) throw new DataError("Toko tersimpan tidak ditemukan. Muat ulang daftar kunjungan.", 404);
  return JSON.parse(String(row.data_json));
}
function ensureList(db: DatabaseSync, username: string, listId: string) {
  if (!db.prepare("SELECT id FROM visit_lists WHERE username=? AND id=?").get(username, listId))
    throw new DataError("Daftar tujuan sudah tidak tersedia.", 404);
}
function checkRevision(store: Visit, expected: unknown) {
  if (expected !== (store.updatedAt || null)) throw new DataError("Catatan ini sudah berubah di perangkat lain. Tutup lalu buka kembali catatan untuk memakai data terbaru.", 409);
}
function importLegacy(db: DatabaseSync, username: string, legacyRaw: unknown) {
  const raw = text(legacyRaw, 12 * 1024 * 1024);
  const fingerprint = createHash("sha256").update(raw).digest("hex");
  if (db.prepare("SELECT fingerprint FROM imports WHERE username=? AND fingerprint=?").get(username, fingerprint))
    return { importedLists: 0, importedStores: 0, alreadyImported: true, fingerprint };
  let data;
  try { data = JSON.parse(raw); } catch { throw new DataError("Data browser lama tidak dapat dibaca. Cadangan lama tetap disimpan."); }
  if (data?.version !== 1 || !Array.isArray(data.lists) || data.lists.length > 1000) throw new DataError("Format daftar lama tidak sesuai.");
  let importedLists = 0, importedStores = 0;
  const now = new Date().toISOString();
  for (const value of data.lists) {
    const list = object(value), listId = id(list.id);
    if (!Array.isArray(list.stores) || list.stores.length > 10000) throw new DataError("Format toko pada daftar lama tidak sesuai.");
    const existing = db.prepare("SELECT id FROM visit_lists WHERE username=? AND id=?").get(username, listId);
    if (!existing) {
      const createdAt = text(list.createdAt, 100), updatedAt = text(list.updatedAt, 100);
      if (!Number.isFinite(Date.parse(createdAt)) || !Number.isFinite(Date.parse(updatedAt))) throw new DataError("Waktu penyimpanan daftar lama tidak sesuai.");
      db.prepare("INSERT INTO visit_lists VALUES(?,?,?,?,?,?,?)")
        .run(username, listId, text(list.name, 1000), text(list.area, 1000, ""), JSON.stringify(source(list.source)), createdAt, updatedAt);
      importedLists++;
    }
    for (const rawStore of list.stores) {
      const store = normalizeVisit(rawStore), visitId = id(store.visitId);
      if (db.prepare("SELECT visit_id FROM visits WHERE username=? AND list_id=? AND visit_id=?").get(username, listId, visitId)
        || db.prepare("SELECT visit_id FROM deleted_visits WHERE username=? AND list_id=? AND visit_id=?").get(username, listId, visitId)) continue;
      insertVisit(db, username, listId, store); importedStores++;
    }
  }
  db.prepare("INSERT INTO imports VALUES(?,?,?)").run(username, fingerprint, now);
  return { importedLists, importedStores, alreadyImported: false, fingerprint };
}
export function visitCommand(username: string, body: Record<string, unknown>) {
  const commandId = id(body.commandId);
  return transaction(db => {
    const previous = db.prepare("SELECT result_json FROM commands WHERE username=? AND id=?").get(username, commandId);
    if (previous) return JSON.parse(String(previous.result_json));
    const now = new Date().toISOString(); let result: Record<string, unknown> = {};
    if (body.action === "import") result = importLegacy(db, username, body.legacyRaw);
    else if (body.action === "save-list") {
      const input = object(body.input);
      if (!Array.isArray(input.stores) || !input.stores.length || input.stores.length > 10000) throw new DataError("Pilih minimal satu toko.");
      const name = text(input.name, 1000, "").trim(), area = text(input.area, 1000, "").trim();
      const listId = input.listId ? id(input.listId) : randomUUID();
      if (input.listId) ensureList(db, username, listId);
      else {
        if (!name || !area) throw new DataError("Isi nama daftar dan area kunjungan.");
        db.prepare("INSERT INTO visit_lists VALUES(?,?,?,?,?,?,?)").run(username, listId, name, area, JSON.stringify(source(input.source)), now, now);
      }
      const seen = new Set(db.prepare("SELECT data_json FROM visits WHERE username=? AND list_id=?").all(username, listId).map(row => identity(JSON.parse(String(row.data_json)))));
      let added = 0;
      for (const rawStore of input.stores) {
        const store = normalizeVisit(rawStore);
        if (seen.has(identity(store))) continue;
        seen.add(identity(store)); store.visitId = randomUUID(); store.status = "planned"; store.notes = ""; store.updatedAt = now;
        insertVisit(db, username, listId, store); added++;
      }
      db.prepare("UPDATE visit_lists SET updated_at=? WHERE username=? AND id=?").run(now, username, listId);
      const list = db.prepare("SELECT name FROM visit_lists WHERE username=? AND id=?").get(username, listId)!;
      result = { id: listId, name: String(list.name), added, skipped: input.stores.length - added };
    } else if (body.action === "update-visit") {
      const listId = id(body.listId), visitId = id(body.visitId);
      const old = existingVisit(db, username, listId, visitId); checkRevision(old, body.expectedUpdatedAt);
      const store = normalizeVisit({ ...old, ...object(body.patch), id: old.id, visitId: old.visitId, businessId: old.businessId, updatedAt: now });
      db.prepare("UPDATE visits SET data_json=? WHERE username=? AND list_id=? AND visit_id=?").run(JSON.stringify(store), username, listId, visitId);
      db.prepare("UPDATE visit_lists SET updated_at=? WHERE username=? AND id=?").run(now, username, listId);
    } else if (body.action === "add-manual") {
      const listId = id(body.listId); ensureList(db, username, listId);
      const store = normalizeVisit(body.visit); store.id = randomUUID(); store.visitId = randomUUID(); store.updatedAt = now;
      insertVisit(db, username, listId, store);
      db.prepare("UPDATE visit_lists SET updated_at=? WHERE username=? AND id=?").run(now, username, listId);
    } else if (body.action === "delete-visit") {
      const listId = id(body.listId), visitId = id(body.visitId);
      const old = existingVisit(db, username, listId, visitId); checkRevision(old, body.expectedUpdatedAt);
      db.prepare("DELETE FROM visits WHERE username=? AND list_id=? AND visit_id=?").run(username, listId, visitId);
      db.prepare("INSERT OR IGNORE INTO deleted_visits VALUES(?,?,?)").run(username, listId, visitId);
      db.prepare("UPDATE visit_lists SET updated_at=? WHERE username=? AND id=?").run(now, username, listId);
    } else throw new DataError("Tindakan penyimpanan tidak dikenal.");
    db.prepare("UPDATE accounts SET revision=revision+1 WHERE username=?").run(username);
    db.prepare("INSERT INTO commands VALUES(?,?,?)").run(username, commandId, JSON.stringify(result));
    return result;
  });
}
