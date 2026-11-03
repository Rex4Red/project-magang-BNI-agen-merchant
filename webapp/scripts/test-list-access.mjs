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
    'visit-excel': 'visit-excel', 'visit-template': 'visit-template', 'visit-excel-import': 'visit-excel-import', 'store-identity': 'store-identity' };
  for (const [name, sourcePath] of Object.entries(modules)) {
    const source = fs.readFileSync(path.join(dir, '../src/lib', `${sourcePath}.ts`), 'utf8');
    let output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    output = output.replace(/from ["']\.\/(database|visit-store|visit-template)["']/g, 'from "./$1.mjs"')
      .replace(/from ["']\.\.\/store-identity["']/g, 'from "./store-identity.mjs"')
      .replace(/from ["']\.\/canvasing["']/g, 'from "./canvasing.mjs"');
    const shim = `import { createRequire } from 'node:module'; const require=createRequire(${JSON.stringify(path.join(dir, '../package.json'))});\n`;
    fs.writeFileSync(path.join(temporary, `${name}.mjs`), shim + output);
  }
  // Resolve packages from the installed app without installing another dependency tree.
  for (const name of ['visit-excel', 'visit-excel-import']) {
    const file = path.join(temporary, `${name}.mjs`);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace("import ExcelJS from 'exceljs';", "const ExcelJS = require('exceljs');").replace("await import('xlsx')", "await Promise.resolve(require('xlsx'))"));
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
let sequence = 0;
function save(username, password) {
  sequence++;
  return visits.visitCommand(username, { action: 'save-list', commandId: randomUUID(), input: {
    name: 'Daftar pribadi', area: 'Yogyakarta', password, source: { mode: 'area' }, stores: [{ id: randomUUID(), name: 'Usaha rahasia', lat: -7.7 - sequence * .001, lng: 110.4 }],
  } });
}
test('admin and canvaser share the BNI workspace; old account logins are removed', () => {
  const admin = auth.login('admin', 'admin123', 'admin-test');
  const canvaser = auth.login('canvaser', 'canvaser123', 'canvaser-test');
  assert.equal(admin.user.role, 'admin');
  assert.equal(auth.authenticatedUser(admin.token).dataAccount, 'canvaser');
  assert.equal(canvaser.user.workspace, 'merchant');
  for (const name of ['agen','merchant']) assert.throws(() => auth.login(name, `${name}123`, name), /salah/);
  assert.throws(() => auth.selectAdminAccount(canvaser.token, 'canvaser'), /Hanya admin/);
  const selected = auth.selectAdminAccount(admin.token, 'canvaser');
  assert.equal(access.accountFor(selected), 'canvaser');
  const list = save('canvaser', 'private123');
  assert.equal(access.protectedSnapshot(selected, admin.token).lists.find(x => x.id === list.id).stores.length, 1);
  assert.equal(access.protectedSnapshot(canvaser.user, canvaser.token).lists.find(x => x.id === list.id).locked, true);
});

test('protected contents never appear in snapshots before unlock; grants are isolated and expire', () => {
  const a = auth.login('canvaser', 'canvaser123', 'merchant-a');
  const b = auth.login('canvaser', 'canvaser123', 'merchant-b');
  const list = save('canvaser', 'secret123');
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
  auth.database().prepare('UPDATE list_grants SET expires_at=0 WHERE username=? AND list_id=?').run('canvaser', list.id);
  assert.equal(snapshot().locked, true);
  access.unlockList(a.user, a.token, list.id, 'secret123');
  auth.logout(a.token);
  assert.equal(auth.authenticatedUser(a.token), null);
  assert.equal(auth.database().prepare('SELECT COUNT(*) AS n FROM list_grants WHERE list_id=?').get(list.id).n, 0);
});
test('bad passwords roll back list creation; repeated unlock failures are limited', () => {
  const count = visits.readLists('canvaser').length;
  assert.throws(() => save('canvaser', 'abc'), /6–200/);
  assert.equal(visits.readLists('canvaser').length, count);
  const a = auth.login('canvaser', 'canvaser123', 'rate-limit');
  const list = save('canvaser', 'secret123');
  for (let i = 0; i < 10; i++) assert.throws(() => access.unlockList(a.user, a.token, list.id, 'wrong'), /salah/);
  assert.throws(() => access.unlockList(a.user, a.token, list.id, 'secret123'), /10 menit/);
});
test('exports omit phone headers and values; coordinates, links, and import roundtrip survive', async () => {
  const list = visits.readLists('canvaser')[0];
  list.stores[0].phone = '081234567899';
  list.stores[0].url = 'https://www.google.com/maps/search/?api=1&query=-7.7,110.4';
  const workbook = await excel.createVisitWorkbook([list]);
  const sheet = workbook.worksheets[0];
  assert.equal(sheet.columnCount, 22);
  assert.ok(!JSON.stringify(sheet.model).includes('081234567899'));
  assert.ok(!sheet.getRow(1).values.includes('No telp'));
  assert.equal(sheet.getCell('F2').value.hyperlink, list.stores[0].url);
  assert.equal(sheet.getCell('O2').value, list.stores[0].lat);
  assert.equal(sheet.getCell('P2').value, 110.4);
  assert.equal(sheet.getCell('R2').value, list.stores[0].businessId);
  const bytes = await workbook.xlsx.writeBuffer();
  const parsed = await importer.readVisitExcel(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  assert.equal(parsed.groups[0].stores[0].phone, undefined);
  assert.equal(parsed.groups[0].stores[0].lat, list.stores[0].lat);
  await assert.rejects(excel.createVisitWorkbook([{ ...list, locked: true }]), /terkunci/);
});

test('saving a visit stamps server time once and preserves KUR/BWU through export', async () => {
  const saved = save('canvaser');
  const list = visits.readLists('canvaser').find(item => item.id === saved.id), store = list.stores[0];
  const before = Date.now();
  visits.visitCommand('canvaser', { action: 'update-visit', commandId: randomUUID(), listId: list.id, visitId: store.visitId,
    recordVisit: true, expectedUpdatedAt: store.updatedAt, patch: { status: 'visited', potential: 'KUR', kurStatus: 'yes', bwuStatus: 'no', visitedAt: '2000-01-01T00:00:00Z' } });
  let updated = visits.readLists('canvaser').find(item => item.id === list.id).stores[0];
  assert.ok(Date.parse(updated.visitedAt) >= before);
  const firstTime = updated.visitedAt;
  visits.visitCommand('canvaser', { action: 'update-visit', commandId: randomUUID(), listId: list.id, visitId: store.visitId,
    recordVisit: true, expectedUpdatedAt: updated.updatedAt, patch: { notes: 'follow-up' } });
  updated = visits.readLists('canvaser').find(item => item.id === list.id).stores[0];
  assert.equal(updated.visitedAt, firstTime);
  const workbook = await excel.createVisitWorkbook([{ ...list, stores: [updated] }]);
  const bytes = await workbook.xlsx.writeBuffer();
  const parsed = await importer.readVisitExcel(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  assert.equal(parsed.groups[0].stores[0].visitedAt, firstTime);
  assert.equal(parsed.groups[0].stores[0].kurStatus, 'yes');
  assert.equal(parsed.groups[0].stores[0].bwuStatus, 'no');
});

test('global duplicate checks include protected lists, tolerate coordinate drift, and allow distinct branches', () => {
  const saved = save('canvaser', 'secret123');
  const list = visits.readLists('canvaser').find(item => item.id === saved.id), store = list.stores[0];
  const saveStore = item => visits.visitCommand('canvaser', { action: 'save-list', commandId: randomUUID(), input: {
    name: 'Daftar kedua', area: 'Yogyakarta', source: { mode: 'area' }, stores: [item] } });
  assert.throws(() => saveStore({ ...store, id: 'other-result', lat: store.lat + .00001 }), /Semua toko sudah tersimpan/);
  assert.equal(saveStore({ ...store, id: 'branch-result', lat: store.lat + .01 }).added, 1);
});

test('rename and password changes revoke grants; stale changes fail; deleting a list cascades', () => {
  const saved = save('canvaser');
  let list = visits.readLists('canvaser').find(item => item.id === saved.id);
  visits.visitCommand('canvaser', { action: 'manage-list', commandId: randomUUID(), listId: list.id, name: 'Siap dibagikan', password: 'newsecret123', expectedUpdatedAt: list.updatedAt });
  const member = auth.login('canvaser', 'canvaser123', 'manage-test');
  assert.equal(access.listAllowed(member.user, member.token, list.id), false);
  access.unlockList(member.user, member.token, list.id, 'newsecret123');
  list = visits.readLists('canvaser').find(item => item.id === list.id);
  assert.equal(list.name, 'Siap dibagikan');
  visits.visitCommand('canvaser', { action: 'manage-list', commandId: randomUUID(), listId: list.id, name: 'Distribusi', password: 'changed123', expectedUpdatedAt: list.updatedAt });
  assert.equal(access.listAllowed(member.user, member.token, list.id), false);
  assert.throws(() => visits.visitCommand('canvaser', { action: 'manage-list', commandId: randomUUID(), listId: list.id, name: 'stale', expectedUpdatedAt: '2000-01-01T00:00:00Z' }), /berubah/);
  list = visits.readLists('canvaser').find(item => item.id === list.id);
  visits.visitCommand('canvaser', { action: 'delete-list', commandId: randomUUID(), listId: list.id, expectedUpdatedAt: list.updatedAt });
  assert.ok(!visits.readLists('canvaser').some(item => item.id === list.id));
  for (const table of ['visits', 'list_passwords', 'list_grants']) assert.equal(auth.database().prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE list_id=?`).get(list.id).n, 0);
});

test('flexible XLSX import recognizes shifted headers, supports manual mapping and missing optional columns', async () => {
  const workbook = await excel.createVisitWorkbook([{ id: 'fixture', name: 'fixture', area: 'fixture', source: { mode: 'area' }, stores: [] }]);
  const sheet = workbook.worksheets[0];
  sheet.spliceRows(1, 1, ['Laporan bebas'], [], ['Nama Toko', 'Address', 'Daerah', 'Potensi'], ['Toko Bebas', 'Jl. Uji 1', 'Sleman', 'BWU']);
  const bytes = await workbook.xlsx.writeBuffer();
  const array = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const descriptions = await importer.inspectVisitFile(array);
  assert.equal(descriptions[0].headerRow, 3);
  const parsed = await importer.readVisitExcel(array);
  assert.equal(parsed.groups[0].stores[0].name, 'Toko Bebas');
  assert.equal(parsed.groups[0].stores[0].potential, 'BWU');
  assert.equal(parsed.groups[0].stores[0].status, 'planned');
  assert.equal(parsed.groups[0].stores[0].visitedAt, undefined);
  sheet.getCell('A3').value = 'Outlet X';
  const manualBytes = await workbook.xlsx.writeBuffer();
  const manual = await importer.readVisitExcel(manualBytes.buffer.slice(manualBytes.byteOffset, manualBytes.byteOffset + manualBytes.byteLength), {
    sheetId: sheet.id, headerRow: 3, columns: { 'Nama Usaha': 1, 'Alamat': 2 }, defaultArea: 'Area manual', defaultStatus: 'visited',
  });
  assert.equal(manual.groups[0].area, 'Area manual');
  assert.equal(manual.groups[0].stores[0].status, 'visited');
  assert.ok(manual.warnings.length);
});

test('CSV import supports ordinary headers without the report template', async () => {
  const bytes = new TextEncoder().encode('Nama Toko,Alamat,Daerah\nWarung CSV,Jl. Test,Yogyakarta\n');
  const preview = await importer.readVisitExcel(bytes.buffer);
  assert.equal(preview.groups[0].stores[0].name, 'Warung CSV');
  assert.equal(preview.groups[0].area, 'Yogyakarta');
});
