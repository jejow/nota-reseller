import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleLedger } from '../cloud/ledger.mjs';
import { createSyncedLedger } from '../docs/sync.mjs';
import { cleanInvoice, createState, nextNumber } from '../docs/model.mjs';

const origin = 'https://nota-reseller.example';
const endpoint = origin + '/api/ledger';
const day = '2026-11-25';
const schema = readFileSync(new URL('../drizzle/0000_ledgers.sql', import.meta.url), 'utf8');

function testDatabase(t) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(schema);
  t.after(() => sqlite.close());
  return {
    prepare(sql) {
      return { bind: (...values) => ({ first: async () => sqlite.prepare(sql).get(...values) ?? null }) };
    },
  };
}

const asUser = (db, owner) => (url, init) => {
  const request = new Request(url, init);
  if (owner) request.headers.set('oai-authenticated-user-id', owner);
  return handleLedger(request, db);
};

function recordInvoice(next, id) {
  const number = nextNumber(next, 'invoice', day);
  next.nextInvoice = number.next;
  next.invoices.push(cleanInvoice({ id, date: day, number: number.number, qty: 1, status: 'paid' }));
  return number.number;
}

test('database enforces identity, rejects cross-origin edits, and excludes session-only account imports', async (t) => {
  const db = testDatabase(t);
  assert.equal((await asUser(db)(endpoint)).status, 401);
  const owner = asUser(db, 'owner-a');
  const body = () => JSON.stringify({ revision: 0, commitId: 'commit-test-id-one', state: createState() });
  const post = (from) =>
    owner(endpoint, {
      method: 'PUT',
      headers: { Origin: from, 'Content-Type': 'application/json', 'X-Nota-Client': '1' },
      body: body(),
    });
  assert.equal((await post('https://other.example')).status, 403);
  assert.equal((await post(origin)).status, 200);

  const ledger = createSyncedLedger(endpoint, owner);
  await ledger.transact((current) => {
    recordInvoice(current, 'invoice-a');
    current.invoices[0].raw = 'session-only';
    current.invoices[0].accounts = [{ password: 'session-only', key: 'session-only' }];
  });
  const readBack = await (await owner(endpoint)).json();
  assert.equal(readBack.revision, 2);
  assert.equal(readBack.state.invoices.length, 1);
  assert.doesNotMatch(JSON.stringify(readBack.state), /session-only/);
  assert.deepEqual(await (await asUser(db, 'owner-b')(endpoint)).json(), { revision: 0, state: null });
});

test('two devices can save at the same time and retain both unique order numbers', async (t) => {
  const db = testDatabase(t);
  const first = createSyncedLedger(endpoint, asUser(db, 'owner'));
  const second = createSyncedLedger(endpoint, asUser(db, 'owner'));
  assert.deepEqual(
    (await Promise.all([first.refresh(), second.refresh()])).map((x) => x.revision),
    [0, 0],
  );
  const saves = await Promise.all([
    first.transact((next) => recordInvoice(next, 'invoice-a')),
    second.transact((next) => recordInvoice(next, 'invoice-b')),
  ]);
  assert.deepEqual(saves.map(({ value }) => value).sort(), ['JUU-261125-053', 'JUU-261125-054']);
  const result = await first.refresh();
  assert.equal(result.revision, 2);
  assert.equal(result.state.invoices.length, 2);
  assert.equal(result.state.nextInvoice, 55);
});

test('a retried save is acknowledged once when the response was lost', async (t) => {
  const db = testDatabase(t);
  const send = asUser(db, 'owner');
  let unsuccessful = true;
  const ledger = createSyncedLedger(endpoint, async (url, init) => {
    const response = await send(url, init);
    if (init.method === 'PUT' && unsuccessful) {
      unsuccessful = false;
      throw new Error('Connection closed before acknowledgement');
    }
    return response;
  });
  const result = await ledger.transact((next) => recordInvoice(next, 'invoice-a'));
  assert.equal(result.value, 'JUU-261125-053');
  assert.equal(result.snapshot.revision, 1);
  assert.equal(result.snapshot.state.invoices.length, 1);
});
