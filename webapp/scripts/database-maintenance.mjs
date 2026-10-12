import { DatabaseSync, backup } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const filename = path.resolve(process.env.BNI_DATABASE_PATH || "data/canvasing.sqlite");
if (!existsSync(filename)) throw new Error("Database belum dibuat. Jalankan web lalu buka halaman login terlebih dahulu.");
const db = new DatabaseSync(filename, { readOnly: true, timeout: 5000 });
try {
  if (process.argv[2] === "backup") {
    const directory = path.join(path.dirname(filename), "backups");
    mkdirSync(directory, { recursive: true });
    const target = path.join(directory, `canvasing-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`);
    await backup(db, target);
    console.log("Backup database tersimpan:", target);
  } else {
    console.log("Database:", filename);
    console.log("Pemeriksaan:", db.prepare("PRAGMA integrity_check").get());
    console.table(db.prepare(`SELECT a.username, a.workspace,
      (SELECT count(*) FROM visit_lists l WHERE l.username=a.username) AS daftar,
      (SELECT count(*) FROM visits v WHERE v.username=a.username) AS toko
      FROM accounts a ORDER BY a.username`).all());
  }
} finally { db.close(); }
