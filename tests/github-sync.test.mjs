import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGitHubLedger, LEDGER_REPO, openConnection, sealConnection } from '../docs/github-sync.mjs';
import { cleanInvoice, nextNumber } from '../docs/model.mjs';

const password = 'kata sandi uji pembukuan';
const token = 'fixture-only-github-token';
const day = '2026-11-25';

function fixture() {
  let stored;
  let commits = 0;
  let loseResponse = false;
  return {
    get stored() {
      return stored;
    },
    get commits() {
      return commits;
    },
    loseNextResponse() {
      loseResponse = true;
    },
    async request(url, options) {
      assert.equal(new URL(url).origin, 'https://api.github.com');
      assert.equal(options.headers.Authorization, 'Bearer ' + token);
      assert.equal(options.redirect, 'error');
      const path = new URL(url).pathname;
      if (path === '/repos/' + LEDGER_REPO) return Response.json({ full_name: LEDGER_REPO, private: true });
      assert.equal(path, '/repos/' + LEDGER_REPO + '/contents/ledger.enc.json');
      if (options.method === 'GET') {
        return stored
          ? Response.json({
              encoding: 'base64',
              sha: stored.sha,
              content: stored.content,
              size: atob(stored.content).length,
            })
          : Response.json({}, { status: 404 });
      }
      const update = JSON.parse(options.body);
      if (update.sha !== stored?.sha) return Response.json({}, { status: stored ? 409 : 422 });
      stored = { sha: 'fixture-sha-' + ++commits, content: update.content };
      if (loseResponse) {
        loseResponse = false;
        throw new Error('Acknowledgement interrupted');
      }
      return Response.json({ content: { sha: stored.sha } });
    },
  };
}

function addInvoice(next, id, customer) {
  const serial = nextNumber(next, 'invoice', day);
  next.nextInvoice = serial.next;
  const item = cleanInvoice({ id, date: day, number: serial.number, customer, status: 'paid' });
  next.invoices.push({ ...item, accounts: [{ password: 'raw-account-secret' }], raw: 'raw-account-secret' });
  return serial.number;
}

test('two GitHub devices recover conflicting saves with encrypted private contents', async () => {
  const backend = fixture();
  const a = createGitHubLedger({ token, password, request: backend.request });
  const b = createGitHubLedger({ token, password, request: backend.request });
  await Promise.all([a.refresh(), b.refresh()]);
  const changes = await Promise.all([
    a.transact((state) => addInvoice(state, 'invoice-a', 'Customer fixture A')),
    b.transact((state) => addInvoice(state, 'invoice-b', 'Customer fixture B')),
  ]);
  assert.deepEqual(changes.map((item) => item.value).sort(), ['JUU-261125-053', 'JUU-261125-054']);
  const stored = atob(backend.stored.content);
  assert.equal(JSON.parse(stored).version, 1);
  assert.doesNotMatch(stored, /Customer fixture|raw-account-secret|fixture-only-github-token/);
  const current = await a.refresh();
  assert.equal(current.state.invoices.length, 2);
  assert.doesNotMatch(JSON.stringify(current.state), /raw-account-secret/);
  const wrong = createGitHubLedger({ token, password: 'different password', request: backend.request });
  await assert.rejects(wrong.refresh(), /Periksa kata sandi sinkronisasi/);
});

test('a lost response after syncing does not duplicate the invoice', async () => {
  const backend = fixture();
  const ledger = createGitHubLedger({ token, password, request: backend.request });
  await ledger.refresh();
  backend.loseNextResponse();
  const result = await ledger.transact((state) => addInvoice(state, 'first', 'Customer fixture'));
  assert.equal(backend.commits, 1);
  assert.equal(result.snapshot.state.invoices.length, 1);
});

test('remembered GitHub tokens require the device password and public repositories are rejected', async () => {
  const envelope = await sealConnection(token, password);
  assert.doesNotMatch(JSON.stringify(envelope), /fixture-only-github-token/);
  assert.equal(await openConnection(envelope, password), token);
  await assert.rejects(openConnection(envelope, 'different password'), /tidak cocok/);
  const blocked = createGitHubLedger({
    token,
    password,
    request: async () => Response.json({ full_name: LEDGER_REPO, private: false }),
  });
  await assert.rejects(blocked.refresh(), /Repo privat/);
});
