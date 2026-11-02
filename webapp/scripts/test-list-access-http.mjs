import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'bni-access-http-'));
const socket = net.createServer();
socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
const base = `http://127.0.0.1:${port}`;
let logs = '';
const server = spawn(process.execPath, [path.join(cwd, 'node_modules/next/dist/bin/next'), 'start', '-p', String(port), '--hostname', '127.0.0.1'], {
  cwd, windowsHide: true, env: { ...process.env, BNI_DATABASE_PATH: path.join(temporary, 'test.sqlite'), BNI_APP_ORIGIN: base }, stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', x => { logs += x; }); server.stderr.on('data', x => { logs += x; });
const exited = once(server, 'exit');
async function request(url, { cookie = '', account = 'merchant', body, method = body ? 'POST' : 'GET' } = {}) {
  const response = await fetch(base + url, { method, headers: {
    'Content-Type': 'application/json', 'x-canvas-client': '1', 'x-canvas-account': account, cookie, origin: base,
  }, body: body ? JSON.stringify({ commandId: randomUUID(), ...body }) : undefined });
  const data = await response.json();
  return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(logs);
    try { if ((await fetch(base)).ok) { ready = true; break; } } catch { /* starting */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(ready, logs);
  const login = username => request('/api/v1/session', { body: { username, password: `${username}123` } });
  const a = await login('merchant'), b = await login('merchant'), admin = await login('admin');
  assert.equal(a.status, 200); assert.equal(admin.data.user.role, 'admin');
  assert.equal((await request('/api/v1/visits')).status, 401);
  assert.equal((await request('/api/v1/visits', { cookie: a.cookie, account: 'agen' })).status, 409);
  assert.equal((await request('/api/v1/session', { cookie: a.cookie, method: 'PATCH', body: { account: 'agen' } })).status, 403);
  const saved = await request('/api/v1/visits', { cookie: a.cookie, body: { action: 'save-list', input: {
    name: 'Daftar uji API', area: 'Yogyakarta', source: { mode: 'area' }, password: 'private123', stores: [{ id: 'fixture', name: 'Usaha privat', lat: -7.7, lng: 110.4 }],
  } } });
  assert.equal(saved.status, 200);
  const listId = saved.data.result.id;
  assert.equal(saved.data.lists[0].locked, true);
  assert.ok(!JSON.stringify(saved.data).includes('Usaha privat'));
  for (const body of [
    { action: 'update-visit', listId, visitId: 'fake', patch: { notes: 'bypass' } },
    { action: 'delete-visit', listId, visitId: 'fake' },
    { action: 'add-manual', listId, visit: {} },
    { action: 'resolve-location', listId, visitId: 'fake' },
    { action: 'save-list', input: { listId, stores: [{ name: 'bypass' }] } },
    { action: 'import-agent-excel', groups: [] },
    { action: 'import-excel', groups: [] },
    { action: 'import', legacyRaw: '{}' },
  ]) assert.equal((await request('/api/v1/visits', { cookie: a.cookie, body })).status, 403, JSON.stringify(body));
  assert.equal((await request('/api/v1/visits', { cookie: a.cookie, body: { action: 'unlock-list', listId, password: 'wrong' } })).status, 403);
  const opened = await request('/api/v1/visits', { cookie: a.cookie, body: { action: 'unlock-list', listId, password: 'private123' } });
  assert.equal(opened.status, 200);
  const store = opened.data.lists[0].stores[0];
  assert.equal(store.name, 'Usaha privat');
  assert.equal((await request('/api/v1/visits', { cookie: b.cookie })).data.lists[0].locked, true);
  const updated = await request('/api/v1/visits', { cookie: a.cookie, body: { action: 'update-visit', listId, visitId: store.visitId,
    expectedUpdatedAt: store.updatedAt, patch: { notes: 'Tercatat', status: 'visited' } } });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.lists[0].stores[0].notes, 'Tercatat');
  assert.equal((await request('/api/v1/visits', { cookie: a.cookie, body: { action: 'lock-list', listId } })).data.lists[0].locked, true);
  const switched = await request('/api/v1/session', { cookie: admin.cookie, method: 'PATCH', body: { account: 'merchant' } });
  assert.equal(switched.data.user.workspace, 'merchant');
  const monitored = await request('/api/v1/visits', { cookie: admin.cookie });
  assert.equal(monitored.data.lists[0].stores[0].notes, 'Tercatat');
  assert.equal(monitored.data.lists[0].locked, false);
  assert.ok(!JSON.stringify(monitored.data).includes('private123'));
  await request('/api/v1/session', { cookie: a.cookie, method: 'DELETE' });
  assert.equal((await request('/api/v1/visits', { cookie: a.cookie })).status, 401);
  console.log('PASS: HTTP login, admin switching, locked read/write/import rejection, unlock, per-device grants, editing, lock, logout.');
} finally {
  server.kill(); await exited;
  assert.ok(path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(temporary).startsWith('bni-access-http-'));
  fs.rmSync(temporary, { recursive: true, force: true });
}
