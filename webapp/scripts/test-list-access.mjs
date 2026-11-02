import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';

const dir = path.dirname(fileURLToPath(import.meta.url));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'bni-access-test-'));
process.env.BNI_DATABASE_PATH = path.join(temporary, 'test.sqlite');
let auth, visits, access, excel, importer;
before(async () => {
  const modules = { database: 'server/database', 'visit-store': 'server/visit-store', 'list-access': 'server/list-access',
    'visit-excel': 'visit-excel', 'visit-template': 'visit-template', 'visit-excel-import': 'visit-excel-import' };
  for (const [name, sourcePath] of Object.entries(modules)) {
    const source = fs.readFileSync(path.join(dir, '../src/lib', `${sourcePath}.ts`), 'utf8');
    let output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    output = output.replace(/from ["']\.\/(database|visit-store|visit-template)["']/g, 'from "./$1.mjs"')
      .replace(/from ["']\.\/canvasing["']/g, 'from "./canvasing.mjs"');
    const shim = `import { createRequire } from 'node:module'; const require=createRequire(${JSON.stringify(path.join(dir, '../package.json'))});\n`;
    fs.writeFileSync(path.join(temporary, `${name}.mjs`), shim + output);
  }
  // Resolve packages from the installed app without installing another dependency tree.
  for (const name of ['visit-excel', 'visit-excel-import']) {
    const file = path.join(temporary, `${name}.mjs`);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace("import ExcelJS from 'exceljs';", "const ExcelJS = require('exceljs');"));
  }
  fs.writeFileSync(path.join(temporary, 'canvasing.mjs'), 'export const displayAddress = x => x; export const displayCategory = x => x.category;');
  auth = await import(pathToFileURL(path.join(temporary, 'database.mjs')).href);
  visits = await import(pathToFileURL(path.join(temporary, 'visit-store.mjs')).href);
  access = await import(pathToFileURL(path.join(temporary, 'list-access.mjs')).href);
  excel = await import(pathToFileURL(path.join(temporary, 'visit-excel.mjs')).href);
  importer = await import(pathToFileURL(path.join(temporary, 'visit-excel-import.mjs')).href);
});
after(() => {
  auth?.database().close();
  assert.ok(path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(temporary).startsWith('bni-access-test-'));
  fs.rmSync(temporary, { recursive: true, force: true });
});
function save(username, password) {
  return visits.visitCommand(username, { action: 'save-list', commandId: randomUUID(), input: {
    name: 'Daftar pribadi', area: 'Yogyakarta', password, source: { mode: 'area' }, stores: [{ id: randomUUID(), name: 'Usaha rahasia', lat: -7.7, lng: 110.4 }],
  } });
}
test('admin monitors shared accounts, bypasses list locks, and ordinary users cannot switch accounts', () => {
  const admin = auth.login('admin', 'admin123', 'admin-test');
  const agen = auth.login('agen', 'agen123', 'agent-test');
  assert.equal(admin.user.role, 'admin');
  assert.equal(auth.authenticatedUser(admin.token).dataAccount, 'agen');
  assert.throws(() => auth.selectAdminAccount(agen.token, 'merchant'), /Hanya admin/);
  const selected = auth.selectAdminAccount(admin.token, 'merchant');
  assert.equal(selected.workspace, 'merchant');
  assert.equal(access.accountFor(selected), 'merchant');
  const list = save('merchant', 'private123');
  assert.equal(access.protectedSnapshot(selected, admin.token).lists.find(x => x.id === list.id).stores.length, 1);
  assert.equal(access.protectedSnapshot(auth.authenticatedUser(agen.token), agen.token).lists.length, 0);
});
test('protected contents never appear in snapshots before unlock; grants are isolated and expire', () => {
  const a = auth.login('merchant', 'merchant123', 'merchant-a');
  const b = auth.login('merchant', 'merchant123', 'merchant-b');
  const list = save('merchant', 'secret123');
  const snapshot = () => access.protectedSnapshot(a.user, a.token).lists.find(x => x.id === list.id);
  assert.equal(snapshot().locked, true);
  assert.deepEqual(snapshot().stores, []);
  assert.throws(() => access.requireListAccess(a.user, a.token, list.id), /password/);
  assert.throws(() => access.unlockList(a.user, a.token, list.id, 'wrong'), /salah/);
  access.unlockList(a.user, a.token, list.id, 'secret123');
  assert.equal(snapshot().stores[0].name, 'Usaha rahasia');
  assert.equal(access.listAllowed(b.user, b.token, list.id), false);
  access.lockList(a.user, a.token, list.id);
  assert.equal(snapshot().locked, true);
  access.unlockList(a.user, a.token, list.id, 'secret123');
  auth.database().prepare('UPDATE list_grants SET expires_at=0 WHERE username=? AND list_id=?').run('merchant', list.id);
  assert.equal(snapshot().locked, true);
  access.unlockList(a.user, a.token, list.id, 'secret123');
  auth.logout(a.token);
  assert.equal(auth.authenticatedUser(a.token), null);
  assert.equal(auth.database().prepare('SELECT COUNT(*) AS n FROM list_grants WHERE list_id=?').get(list.id).n, 0);
});
test('bad passwords roll back list creation; repeated unlock failures are limited', () => {
  const count = visits.readLists('merchant').length;
  assert.throws(() => save('merchant', 'abc'), /6–200/);
  assert.equal(visits.readLists('merchant').length, count);
  const a = auth.login('merchant', 'merchant123', 'rate-limit');
  const list = save('merchant', 'secret123');
  for (let i = 0; i < 10; i++) assert.throws(() => access.unlockList(a.user, a.token, list.id, 'wrong'), /salah/);
  assert.throws(() => access.unlockList(a.user, a.token, list.id, 'secret123'), /10 menit/);
});
test('exports omit phone headers and values; coordinates, links, and import roundtrip survive', async () => {
  const list = visits.readLists('merchant')[0];
  list.stores[0].phone = '081234567899';
  list.stores[0].url = 'https://www.google.com/maps/search/?api=1&query=-7.7,110.4';
  const workbook = await excel.createVisitWorkbook([list]);
  const sheet = workbook.worksheets[0];
  assert.equal(sheet.columnCount, 18);
  assert.ok(!JSON.stringify(sheet.model).includes('081234567899'));
  assert.ok(!sheet.getRow(1).values.includes('No telp'));
  assert.equal(sheet.getCell('F2').value.hyperlink, list.stores[0].url);
  assert.equal(sheet.getCell('O2').value, -7.7);
  assert.equal(sheet.getCell('P2').value, 110.4);
  assert.equal(sheet.getCell('R2').value, list.stores[0].businessId);
  const bytes = await workbook.xlsx.writeBuffer();
  const parsed = await importer.readVisitExcel(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  assert.equal(parsed.groups[0].stores[0].phone, '');
  assert.equal(parsed.groups[0].stores[0].lat, -7.7);
  await assert.rejects(excel.createVisitWorkbook([{ ...list, locked: true }]), /terkunci/);
});
