import { existsSync, mkdirSync, readFileSync, copyFileSync } from "node:fs";
import path from "node:path";

let DatabaseSync = null;
let backup = null;
try {
  const nodeSqlite = await import("node:sqlite");
  DatabaseSync = nodeSqlite.DatabaseSync;
  backup = nodeSqlite.backup;
} catch {
  DatabaseSync = null;
}

const filename = path.resolve(process.env.BNI_DATABASE_PATH || "data/canvasing.sqlite");
if (!existsSync(filename)) {
  throw new Error("Database belum dibuat. Jalankan web lalu buka halaman login terlebih dahulu.");
}

if (process.argv[2] === "backup") {
  const directory = path.join(path.dirname(filename), "backups");
  mkdirSync(directory, { recursive: true });
  const target = path.join(directory, `canvasing-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`);
  if (backup && DatabaseSync) {
    const db = new DatabaseSync(filename, { readOnly: true, timeout: 5000 });
    try {
      await backup(db, target);
    } finally {
      db.close();
    }
  } else {
    copyFileSync(filename, target);
  }
  console.log("Backup database tersimpan:", target);
} else {
  console.log("Database:", filename);
  if (DatabaseSync) {
    const db = new DatabaseSync(filename, { readOnly: true, timeout: 5000 });
    try {
      console.log("Pemeriksaan:", db.prepare("PRAGMA integrity_check").get());
      console.table(
        db.prepare(`SELECT a.username, a.workspace,
          (SELECT count(*) FROM visit_lists l WHERE l.username=a.username) AS daftar,
          (SELECT count(*) FROM visits v WHERE v.username=a.username) AS toko
          FROM accounts a ORDER BY a.username`).all()
      );
    } finally {
      db.close();
    }
  } else {
    const initSqlJs = (await import("sql.js")).default;
    const SQL = await initSqlJs();
    const db = new SQL.Database(readFileSync(filename));
    try {
      const checkStmt = db.prepare("PRAGMA integrity_check");
      const checkRes = checkStmt.step() ? checkStmt.getAsObject() : {};
      checkStmt.free();
      console.log("Pemeriksaan:", checkRes);

      const accountsStmt = db.prepare(`SELECT a.username, a.workspace,
        (SELECT count(*) FROM visit_lists l WHERE l.username=a.username) AS daftar,
        (SELECT count(*) FROM visits v WHERE v.username=a.username) AS toko
        FROM accounts a ORDER BY a.username`);
      const accounts = [];
      while (accountsStmt.step()) {
        accounts.push(accountsStmt.getAsObject());
      }
      accountsStmt.free();
      console.table(accounts);
    } finally {
      db.close();
    }
  }
}
