import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'bni-agent-import-test-'));
const originalDatabase = process.env.BNI_DATABASE_PATH;
process.env.BNI_DATABASE_PATH = path.join(temporary, 'test.sqlite');
let db, visits;
before(async () => {
  for (const name of ['database', 'visit-store']) {
    const source = fs.readFileSync(path.join(scriptDirectory, '../src/lib/server', `${name}.ts`), 'utf8');
    const output = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText.replace(/from ['"]\.\.\/store-identity['"]/g, 'from "./store-identity.mjs"').replace(/from ['"]\.\/database['"]/g, 'from "./database.mjs"');
    const requireShim = `import { createRequire } from 'node:module'; const require=createRequire(${JSON.stringify(path.join(scriptDirectory, '../package.json'))});\n`;
    fs.writeFileSync(path.join(temporary, `${name}.mjs`), requireShim + output);
  }
  const identity = ts.transpileModule(fs.readFileSync(path.join(scriptDirectory, '../src/lib/store-identity.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  fs.writeFileSync(path.join(temporary, 'store-identity.mjs'), identity);
  const database = await import(pathToFileURL(path.join(temporary, 'database.mjs')).href);
  db = database.database();
  // Legacy import compatibility is tested with explicit fixtures; these are not application accounts.
  for (const name of ['agen','merchant']) db.prepare('INSERT INTO accounts(username,name,workspace,salt,password_hash) VALUES(?,?,?,?,?)').run(name, name, name, 'fixture', 'fixture');
  visits = await import(pathToFileURL(path.join(temporary, 'visit-store.mjs')).href);
});
beforeEach(() => {
  db.exec('DELETE FROM visits; DELETE FROM visit_lists; DELETE FROM commands; DELETE FROM deleted_visits; UPDATE accounts SET revision=0;');
});
after(() => {
  db?.close();
  if (originalDatabase === undefined) delete process.env.BNI_DATABASE_PATH;
  else process.env.BNI_DATABASE_PATH = originalDatabase;
  const target = path.resolve(temporary);
  assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith('bni-agent-import-test-'));
  fs.rmSync(target, { recursive: true, force: true });
});
function store(name, patch = {}) {
  return { id: '', visitId: '', name, address: 'Alamat fixture pengujian', category: 'Toko Sembako',
    notes: 'Catatan dari Excel', lat: -7.7, lng: 110.4, rating: 0, reviewCount: 0,
    photoUrl: null, url: '', status: 'visited', visitPhotos: [], qrisStatus: 'yes',
    qrisProviders: ['BNI', 'Mandiri'], ...patch };
}
const group = (area, stores) => ({ name: area, area, sheets: ['Sheet uji'], stores });
const save = (groups, commandId = randomUUID(), username = 'agen') => visits.visitCommand(username, {
  action: 'import-agent-excel', groups, commandId,
});

test('creates one visited list per area and preserves payment details', () => {
  const result = save([group('Jenengan dan Krodan', [store('Fixture A')]), group('Pogung', [store('Fixture B')])]);
  assert.equal(result.added, 2);
  assert.equal(result.createdLists, 2);
  const lists = visits.readLists('agen');
  assert.deepEqual(lists.map(list => list.area).sort(), ['Jenengan dan Krodan', 'Pogung']);
  for (const list of lists) {
    assert.equal(list.source.selection, 'excel');
    assert.equal(list.stores[0].status, 'visited');
    assert.equal(list.stores[0].visitArea, list.area);
    assert.deepEqual(list.stores[0].qrisProviders, ['BNI', 'Mandiri']);
  }
});

test('reimport skips duplicate stores and preserves edited visit notes', () => {
  const groups = [group('Pogung', [store('Fixture A')])];
  save(groups);
  const list = visits.readLists('agen')[0], visit = list.stores[0];
  visits.visitCommand('agen', { action: 'update-visit', listId: list.id, visitId: visit.visitId,
    patch: { notes: 'Catatan yang sudah diperbarui petugas' }, expectedUpdatedAt: visit.updatedAt, commandId: randomUUID() });
  const repeated = save(groups);
  assert.equal(repeated.added, 0);
  assert.equal(repeated.skipped, 1);
  assert.equal(visits.readLists('agen').length, 1);
  assert.equal(visits.readLists('agen')[0].stores[0].notes, 'Catatan yang sudah diperbarui petugas');
});

test('additional imports append to the same area with consistent spelling', () => {
  save([group('Pogung', [store('Fixture A')])]);
  const originalId = visits.readLists('agen')[0].id;
  const result = save([group(' pogung ', [store('Fixture B')])]);
  const lists = visits.readLists('agen');
  assert.equal(result.createdLists, 0);
  assert.equal(result.updatedLists, 1);
  assert.equal(lists.length, 1);
  assert.equal(lists[0].id, originalId);
  assert.equal(lists[0].stores.length, 2);
  assert.ok(lists[0].stores.every(visit => visit.visitArea === 'Pogung'));
});

test('command retries return the receipt without repeating writes', () => {
  const commandId = randomUUID(), groups = [group('Pogung', [store('Fixture A')])];
  const first = save(groups, commandId), revision = visits.version('agen').revision;
  assert.deepEqual(save(groups, commandId), first);
  assert.equal(visits.version('agen').revision, revision);
  assert.equal(visits.readLists('agen')[0].stores.length, 1);
});

test('rejects agent-template imports from merchant accounts', () => {
  assert.throws(() => save([group('Pogung', [store('Fixture A')])], randomUUID(), 'merchant'), error => error.status === 403);
  assert.equal(visits.readLists('merchant').length, 0);
  assert.equal(visits.readLists('agen').length, 0);
});

test('invalid data rolls back the whole import without a receipt', () => {
  const commandId = randomUUID();
  assert.throws(() => save([group('Pogung', [store('Fixture A')]),
    group('Tambak Bayan', [store('Fixture B', { visitPhotos: ['invalid-image'] })])], commandId));
  assert.equal(visits.readLists('agen').length, 0);
  assert.equal(visits.version('agen').revision, 0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM commands WHERE id=?').get(commandId).n, 0);
});

test('merchant imports retain their existing behavior and stay isolated', () => {
  const groups = [group('Pogung', [store('Fixture A')])];
  const merchant = visits.visitCommand('merchant', { action: 'import-excel', groups, commandId: randomUUID() });
  assert.deepEqual(merchant, { added: 1, skipped: 0 });
  assert.equal(visits.readLists('merchant')[0].source.selection, 'manual');
  assert.equal(save(groups).added, 1);
  assert.equal(visits.readLists('merchant').length, 1);
  assert.equal(visits.readLists('agen').length, 1);
});

for (const username of ['agen', 'merchant']) {
  test(`${username} ignores phone fields on import and hides them in old records`, () => {
    visits.visitCommand(username, { action: username === 'agen' ? 'import-agent-excel' : 'import-excel',
      groups: [group('Pogung', [store('Fixture tanpa telepon', { phone: '08000000001', pic: 'PIC uji' })])],
      commandId: randomUUID() });
    const list = visits.readLists(username)[0], visit = list.stores[0];
    const persisted = () => JSON.parse(db.prepare('SELECT data_json FROM visits WHERE username=? AND visit_id=?').get(username, visit.visitId).data_json);
    assert.equal(Object.hasOwn(persisted(), 'phone'), false);

    db.prepare('UPDATE visits SET data_json=? WHERE username=? AND visit_id=?')
      .run(JSON.stringify({ ...visit, phone: '08000000002' }), username, visit.visitId);
    const snapshot = visits.visitSnapshot(username).lists[0].stores[0];
    assert.equal(Object.hasOwn(snapshot, 'phone'), false);
    assert.equal(snapshot.pic, 'PIC uji');
    assert.equal(snapshot.notes, visit.notes);
    assert.deepEqual(snapshot.qrisProviders, visit.qrisProviders);
    assert.equal(persisted().phone, '08000000002');

    visits.visitCommand(username, { action: 'update-visit', listId: list.id, visitId: visit.visitId,
      expectedUpdatedAt: visit.updatedAt, patch: { notes: 'Catatan diperbarui', phone: '08000000003' }, commandId: randomUUID() });
    assert.equal(Object.hasOwn(persisted(), 'phone'), false);
    assert.equal(persisted().notes, 'Catatan diperbarui');
    assert.equal(persisted().pic, 'PIC uji');
  });
}
