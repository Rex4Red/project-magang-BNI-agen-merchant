import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID, randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import type { Session } from "../session";

const accounts = [
  ["admin", "admin123", "Admin BNI", "agen"],
  ["canvaser", "canvaser123", "Canvaser Agen", "agen"],
  ["agen", "agen123", "Canvaser Agen", "agen"],
  ["merchant", "merchant123", "Canvaser Merchant", "merchant"],
] as const;
const globalDb = globalThis as typeof globalThis & { canvasDb?: DatabaseSync };

export function databasePath() {
  return path.resolve(/* turbopackIgnore: true */ process.env.BNI_DATABASE_PATH || path.join(process.cwd(), "data", "canvasing.sqlite"));
}
export function database() {
  if (globalDb.canvasDb) return globalDb.canvasDb;
  const filename = databasePath();
  mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename, { timeout: 5000 });
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS accounts (
      username TEXT PRIMARY KEY, name TEXT NOT NULL, workspace TEXT NOT NULL,
      salt TEXT NOT NULL, password_hash TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, username TEXT NOT NULL REFERENCES accounts(username),
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS visit_lists (
      username TEXT NOT NULL REFERENCES accounts(username), id TEXT NOT NULL,
      name TEXT NOT NULL, area TEXT NOT NULL, source_json TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY (username, id)
    );
    CREATE TABLE IF NOT EXISTS visits (
      username TEXT NOT NULL, list_id TEXT NOT NULL, visit_id TEXT NOT NULL,
      data_json TEXT NOT NULL, business_id TEXT NOT NULL,
      PRIMARY KEY (username, list_id, visit_id),
      FOREIGN KEY (username, list_id) REFERENCES visit_lists(username, id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS imports (
      username TEXT NOT NULL REFERENCES accounts(username), fingerprint TEXT NOT NULL,
      imported_at TEXT NOT NULL, PRIMARY KEY (username, fingerprint)
    );
    CREATE TABLE IF NOT EXISTS deleted_visits (
      username TEXT NOT NULL, list_id TEXT NOT NULL, visit_id TEXT NOT NULL,
      PRIMARY KEY (username, list_id, visit_id)
    );
    CREATE TABLE IF NOT EXISTS commands (
      username TEXT NOT NULL, id TEXT NOT NULL, result_json TEXT NOT NULL,
      PRIMARY KEY (username, id)
    );
    CREATE TABLE IF NOT EXISTS login_attempts (
      client_key TEXT PRIMARY KEY, failures INTEGER NOT NULL, reset_at INTEGER NOT NULL
    );
    PRAGMA user_version = 1;
  `);
  db.prepare("INSERT OR IGNORE INTO meta(key,value) VALUES('database_id',?)").run(randomUUID());
  for (const [username, password, name, workspace] of accounts) {
    if (db.prepare("SELECT username FROM accounts WHERE username=?").get(username)) continue;
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(password, salt, 64).toString("hex");
    db.prepare("INSERT OR IGNORE INTO accounts(username,name,workspace,salt,password_hash) VALUES(?,?,?,?,?)")
      .run(username, name, workspace, salt, hash);
  }
  globalDb.canvasDb = db;
  return db;
}
export function transaction<T>(action: (db: DatabaseSync) => T): T {
  const db = database();
  db.exec("BEGIN IMMEDIATE");
  try { const result = action(db); db.exec("COMMIT"); return result; }
  catch (error) { db.exec("ROLLBACK"); throw error; }
}
export class DataError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
function sessionUser(row: Record<string, unknown>): Session {
  return { username: String(row.username), name: String(row.name), role: String(row.workspace),
    workspace: row.workspace === "merchant" ? "merchant" : "agen" };
}
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export function login(username: string, password: string, client: string) {
  const db = database(), now = Date.now(), clientKey = digest(client);
  const attempt = db.prepare("SELECT * FROM login_attempts WHERE client_key=?").get(clientKey);
  if (attempt && Number(attempt.reset_at) > now && Number(attempt.failures) >= 10)
    throw new DataError("Terlalu banyak percobaan login. Coba lagi dalam 10 menit.", 429);
  const account = db.prepare("SELECT * FROM accounts WHERE username=?").get(username);
  const salt = account ? String(account.salt) : "unregistered-account";
  const candidate = scryptSync(password, salt, 64);
  const correct = account && timingSafeEqual(candidate, Buffer.from(String(account.password_hash), "hex"));
  if (!correct) {
    const failures = attempt && Number(attempt.reset_at) > now ? Number(attempt.failures) + 1 : 1;
    db.prepare("INSERT OR REPLACE INTO login_attempts VALUES(?,?,?)")
      .run(clientKey, failures, attempt && Number(attempt.reset_at) > now ? Number(attempt.reset_at) : now + 600000);
    throw new DataError("Username atau password salah", 401);
  }
  db.prepare("DELETE FROM login_attempts WHERE client_key=?").run(clientKey);
  db.prepare("DELETE FROM sessions WHERE expires_at<=?").run(now);
  const token = randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(digest(token), username, now + 30 * 86400000);
  return { token, user: sessionUser(account) };
}
export function authenticatedUser(token?: string): Session | null {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const row = database().prepare(`SELECT a.* FROM sessions s JOIN accounts a ON a.username=s.username
    WHERE s.token_hash=? AND s.expires_at>?`).get(digest(token), Date.now());
  return row ? sessionUser(row) : null;
}
export function logout(token?: string) {
  if (token) database().prepare("DELETE FROM sessions WHERE token_hash=?").run(digest(token));
}
