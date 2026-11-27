import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import worker from '../cloud/owner-worker.mjs';
import { passwordProof } from '../docs/owner-access.mjs';
import { cleanInvoice, createState } from '../docs/model.mjs';
import { createSyncedLedger } from '../docs/sync.mjs';

const origin = 'https://jejow.github.io';
const api = 'https://worker.example/api/';
const username = 'owner-fixture';
const proof = await passwordProof(username, 'Synthetic password for a test only');
const verifier = createHash('sha256').update(proof).digest('base64url');

function database(t) {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ['0000_ledgers.sql', '0001_owner_access.sql']) {
    sqlite.exec(readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8'));
  }
  t.after(() => sqlite.close());
  function statement(sql, values = []) {
    return {
      bind: (...next) =>
        statement(
          sql,
          next.map((value) => (value instanceof ArrayBuffer ? new Uint8Array(value) : value)),
        ),
      first: async () => sqlite.prepare(sql).get(...values) ?? null,
      execute: () => sqlite.prepare(sql).run(...values),
      run: async () => sqlite.prepare(sql).run(...values),
    };
  }
  return {
    prepare: statement,
    async batch(commands) {
      sqlite.exec('BEGIN');
      try {
        const result = commands.map((command) => command.execute());
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

function fixture(t) {
  const env = {
    PAGES_ORIGIN: origin,
    OWNER_USERNAME: username,
    OWNER_PASSWORD_VERIFIER: verifier,
    OWNER_LEDGER_KEY: randomBytes(32).toString('base64url'),
    DB: database(t),
  };
  const request = (path, options = {}) => {
    const input = new Request(new URL(path, api), options);
    if (!input.headers.has('Origin')) input.headers.set('Origin', origin);
    return worker.fetch(input, env);
  };
  const login = (data = {}, ip = '192.0.2.1') =>
    request('login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
      body: JSON.stringify({ username, proof, ...data }),
    });
  const asSession =
    (token) =>
    (url, options = {}) =>
      request(url, { ...options, headers: { ...options.headers, Authorization: 'Bearer ' + token } });
  return { request, login, asSession, env };
}

test('public browser can load its login but an unauthenticated caller cannot use the ledger', async (t) => {
  const { request, login } = fixture(t);
  const preflight = await request('ledger', { method: 'OPTIONS' });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal((await request('ledger', { headers: { Origin: 'https://other.example' } })).status, 403);
  assert.equal((await request('ledger')).status, 401);
  assert.equal((await request('ledger', { headers: { 'oai-authenticated-user-id': username } })).status, 401);
  assert.equal(
    (
      await request('ledger', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + 'X'.repeat(43) },
        body: JSON.stringify({ state: createState() }),
      })
    ).status,
    401,
  );
  assert.equal((await login({ username: 'wrong-username' })).status, 401);
  assert.equal((await login({ proof: 'A'.repeat(43) })).status, 401);
});

test('owner sessions share a ledger, and logout revokes only that session', async (t) => {
  const { login, asSession, env } = fixture(t);
  const now = Date.now();
  const firstReply = await login({ remember: true });
  assert.equal(firstReply.status, 200);
  assert.equal(firstReply.headers.get('Cache-Control'), 'no-store');
  const first = await firstReply.json();
  const second = await (await login()).json();
  assert.ok(first.expiresAt - now >= 29 * 24 * 60 * 60 * 1000);
  assert.ok(second.expiresAt - now < 13 * 60 * 60 * 1000);
  assert.notEqual(first.token, second.token);

  const a = createSyncedLedger(api + 'ledger', asSession(first.token), { documents: true });
  const b = createSyncedLedger(api + 'ledger', asSession(second.token), { documents: true });
  await a.transact((state) => {
    state.settings.business = 'Fixture store';
    state.accounts = [{ password: 'session-only-password' }];
  });
  const snapshot = await b.refresh();
  assert.equal(snapshot.state.settings.business, 'Fixture store');
  assert.doesNotMatch(JSON.stringify(snapshot), /session-only-password/);
  assert.equal((await asSession(first.token)('logout', { method: 'POST' })).status, 204);
  await assert.rejects(a.refresh(), (error) => error.status === 401);
  assert.equal((await b.refresh()).revision, 1);
  env.OWNER_PASSWORD_VERIFIER = 'Z'.repeat(43);
  await assert.rejects(b.refresh(), (error) => error.status === 401);
});

test('saved account details migrate from a previous ledger and are encrypted before reaching D1', async (t) => {
  const { login, asSession, env } = fixture(t);
  const account = {
    email: 'persist-fixture@example.test',
    password: 'Fake-password-for-persistence',
    key: 'JBSWY3DPEHPK3PXP',
    verification: 'https://otp.example.test/verification',
  };
  const initial = createState();
  initial.invoices.push(
    cleanInvoice({
      id: 'existing-invoice',
      number: 'JUU-DEMO',
      date: '2026-11-25',
      qty: 1,
      price: 80000,
      status: 'paid',
    }),
  );
  await env.DB.prepare('INSERT INTO ledgers (owner_id, revision, payload, commits) VALUES (?, 1, ?, ?)')
    .bind('nota-reseller-owner', JSON.stringify(initial), '[]')
    .run();
  const token = (await (await login()).json()).token;
  const request = asSession(token);
  const ledger = createSyncedLedger(api + 'ledger', request, { documents: true });
  assert.equal((await ledger.refresh()).state.invoices[0].number, 'JUU-DEMO');
  await ledger.transact((next) => {
    next.invoices[0].document = {
      accounts: [account],
      includeAccounts: false,
      editMessage: true,
      customMessage: 'Saved customer message',
      messageNote: 'Saved note',
    };
    next.invoices[0].raw = 'Raw text stays out of the database';
  });
  const row = await env.DB.prepare('SELECT revision, typeof(payload) AS kind, payload FROM ledgers').first();
  assert.equal(row.revision, 2);
  assert.equal(row.kind, 'blob');
  for (const field of Object.values(account)) {
    assert.ok(!Buffer.from(row.payload).includes(field));
  }

  const refreshed = createSyncedLedger(api + 'ledger', request, { documents: true });
  const invoice = (await refreshed.refresh()).state.invoices[0];
  assert.deepEqual(invoice.document.accounts, [account]);
  assert.equal(invoice.document.includeAccounts, false);
  assert.equal(invoice.document.customMessage, 'Saved customer message');
  assert.equal(invoice.raw, undefined);
  const legacy = await (await request('ledger')).json();
  assert.equal(legacy.state.invoices[0].document, undefined);
  assert.equal((await request('ledger', { method: 'PUT' })).status, 426);

  env.OWNER_LEDGER_KEY = randomBytes(32).toString('base64url');
  await assert.rejects(refreshed.refresh(), /Database sedang tidak bisa diakses/);
  await assert.rejects(
    refreshed.transact((next) => {
      next.settings.business = 'Try a write with a different key';
    }),
    /Database sedang tidak bisa diakses/,
  );
  assert.equal((await env.DB.prepare('SELECT revision FROM ledgers').first()).revision, 2);
});

test('repeated invalid owner logins are limited without locking out a different device', async (t) => {
  const { login } = fixture(t);
  for (let i = 0; i < 10; i++) {
    const rejected = await login({ proof: 'B'.repeat(43) });
    assert.equal(rejected.status, 401);
  }
  const limited = await login();
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('Retry-After'), '300');
  assert.equal((await login({}, '192.0.2.2')).status, 200);
});
