import { createHash, scryptSync, timingSafeEqual } from "node:crypto";
import { database, DataError } from "./database";
import { readLists, version } from "./visit-store";
import type { Session } from "../session";

const digest = (token: string) => createHash("sha256").update(token).digest("hex");
export const accountFor = (user: Session) => user.role === "admin" ? "canvaser" : user.username;
export function listAllowed(user: Session, token: string, listId: string) {
  if (user.role === "admin") return true;
  const db = database(), account = accountFor(user);
  if (!db.prepare("SELECT list_id FROM list_passwords WHERE username=? AND list_id=?").get(account, listId)) return true;
  return !!db.prepare("SELECT list_id FROM list_grants WHERE token_hash=? AND username=? AND list_id=? AND expires_at>?")
    .get(digest(token), account, listId, Date.now());
}
export function requireListAccess(user: Session, token: string, listId: unknown) {
  if (typeof listId !== "string" || !listAllowed(user, token, listId)) throw new DataError("Buka daftar dengan password terlebih dahulu.", 403);
}
export function protectedSnapshot(user: Session, token: string) {
  const account = accountFor(user), db = database();
  const lists = readLists(account).map(list => {
    const protectedList = !!db.prepare("SELECT list_id FROM list_passwords WHERE username=? AND list_id=?").get(account, list.id);
    const locked = !listAllowed(user, token, list.id);
    return { ...list, protected: protectedList, locked, stores: locked ? [] : list.stores };
  });
  return { ...version(account), lists };
}
export function unlockList(user: Session, token: string, listId: unknown, password: unknown) {
  if (typeof listId !== "string") throw new DataError("Pilih daftar kunjungan.");
  const account = accountFor(user), db = database();
  const row = db.prepare("SELECT * FROM list_passwords WHERE username=? AND list_id=?").get(account, listId);
  if (!row) throw new DataError("Daftar berpassword tidak ditemukan.", 404);
  const key = `list:${digest(token)}:${account}:${listId}`, now = Date.now();
  const attempt = db.prepare("SELECT * FROM login_attempts WHERE client_key=?").get(key);
  if (attempt && Number(attempt.reset_at) > now && Number(attempt.failures) >= 10)
    throw new DataError("Terlalu banyak percobaan. Coba lagi dalam 10 menit.", 429);
  if (typeof password !== "string" || password.length > 200 ||
      !timingSafeEqual(scryptSync(password, String(row.salt), 64), Buffer.from(String(row.password_hash), "hex"))) {
    db.prepare("INSERT OR REPLACE INTO login_attempts VALUES(?,?,?)").run(key,
      attempt && Number(attempt.reset_at) > now ? Number(attempt.failures) + 1 : 1,
      attempt && Number(attempt.reset_at) > now ? Number(attempt.reset_at) : now + 600000);
    throw new DataError("Password daftar salah.", 403);
  }
  db.prepare("DELETE FROM login_attempts WHERE client_key=?").run(key);
  db.prepare("INSERT OR REPLACE INTO list_grants VALUES(?,?,?,?)").run(digest(token), account, listId, now + 15 * 60000);
}
export function lockList(user: Session, token: string, listId: unknown) {
  if (typeof listId !== "string") throw new DataError("Pilih daftar kunjungan.");
  database().prepare("DELETE FROM list_grants WHERE token_hash=? AND username=? AND list_id=?").run(digest(token), accountFor(user), listId);
}
