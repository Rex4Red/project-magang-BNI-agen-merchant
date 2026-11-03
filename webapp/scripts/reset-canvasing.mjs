import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

if (!process.argv.includes('--confirm')) throw new Error('Hentikan server dahulu, lalu jalankan npm run db:reset -- --confirm. Cadangan otomatis dibuat sebelum pengosongan.');
const filename = path.resolve(process.env.BNI_DATABASE_PATH || 'data/canvasing.sqlite');
if (!existsSync(filename)) throw new Error('Database tidak ditemukan.');
const directory = path.join(path.dirname(filename), 'backups');
mkdirSync(directory, { recursive: true });
const target = path.join(directory, `before-bni-reset-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
let native;
try { native = await import('node:sqlite'); } catch { /* Node 20 compatibility */ }
let db;
if (native?.DatabaseSync) {
  db = new native.DatabaseSync(filename, { timeout: 5000 });
  await native.backup(db, target);
} else {
  const SQL = await (await import('sql.js')).default();
  db = new SQL.Database(readFileSync(filename));
  writeFileSync(target, Buffer.from(db.export()));
}
console.log('Cadangan sebelum pengosongan:', target);
try {
  db.exec(`PRAGMA foreign_keys=ON; BEGIN IMMEDIATE;
    DELETE FROM list_grants; DELETE FROM list_passwords; DELETE FROM admin_workspaces;
    DELETE FROM sessions; DELETE FROM visits; DELETE FROM visit_lists; DELETE FROM imports;
    DELETE FROM deleted_visits; DELETE FROM commands; DELETE FROM login_attempts;
    DELETE FROM accounts WHERE username NOT IN ('admin','canvaser');
    UPDATE accounts SET workspace='merchant',revision=revision+1;
    UPDATE accounts SET name='Admin BNI' WHERE username='admin';
    UPDATE accounts SET name='Canvaser BNI' WHERE username='canvaser';
  `);
  if (native?.DatabaseSync) db.prepare("UPDATE meta SET value=? WHERE key='database_id'").run(randomUUID());
  else db.run("UPDATE meta SET value=? WHERE key='database_id'", [randomUUID()]);
  db.exec('COMMIT; VACUUM;');
  if (!native?.DatabaseSync) writeFileSync(filename, Buffer.from(db.export()));
  console.log('Database kosong. Akun admin dan canvaser dipertahankan; sesi login lama dibatalkan.');
} catch (error) {
  try { db.exec('ROLLBACK;'); } catch { /* transaction may have completed */ }
  throw error;
} finally { db.close(); }
