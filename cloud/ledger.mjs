import { readBackup } from '../docs/model.mjs';

const MAX_BYTES = 1_850_000;
const RECENT_COMMITS = 32;
const TOO_LARGE = Symbol('oversized ledger');
const selectLedger = 'SELECT revision, payload, commits FROM ledgers WHERE owner_id = ?';

const reply = (value, status = 200) =>
  Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });

function snapshot(row) {
  return row ? { revision: row.revision, state: JSON.parse(row.payload) } : { revision: 0, state: null };
}

async function readBody(request) {
  if (Number(request.headers.get('Content-Length')) > MAX_BYTES) return TOO_LARGE;
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Empty body');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let text = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return JSON.parse(text + decoder.decode());
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) {
        await reader.cancel();
        return TOO_LARGE;
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

export async function handleLedger(request, db) {
  // Sites dispatch supplies this header after authenticating the visitor.
  const owner = request.headers.get('oai-authenticated-user-id');
  if (!owner) return reply({ message: 'Masuk dengan akun ChatGPT untuk membuka pembukuan.' }, 401);
  if (!db) return reply({ message: 'Database belum tersedia.' }, 503);
  if (!['GET', 'PUT'].includes(request.method)) return reply({ message: 'Metode tidak didukung.' }, 405);
  const origin = request.headers.get('Origin');
  if (
    request.method === 'PUT' &&
    (request.headers.get('X-Nota-Client') !== '1' ||
      request.headers.get('Sec-Fetch-Site') === 'cross-site' ||
      (origin && origin !== new URL(request.url).origin) ||
      request.headers.get('Content-Type')?.split(';')[0] !== 'application/json')
  ) {
    return reply({ message: 'Permintaan penyimpanan tidak valid.' }, 403);
  }

  const read = () => db.prepare(selectLedger).bind(owner).first();
  try {
    if (request.method === 'GET') return reply(snapshot(await read()));
    let change;
    let next;
    try {
      change = await readBody(request);
      if (change === TOO_LARGE) return reply({ message: 'Data pembukuan melebihi batas penyimpanan.' }, 413);
      if (
        !Number.isSafeInteger(change?.revision) ||
        change.revision < 0 ||
        !/^[a-zA-Z0-9-]{16,70}$/.test(change.commitId)
      )
        throw new Error('Invalid commit');
      next = readBackup(change.state);
    } catch {
      return reply({ message: 'Data pembukuan tidak valid.' }, 400);
    }
    const row = await read();
    const commits = row ? JSON.parse(row.commits) : [];
    if (commits.includes(change.commitId)) return reply(snapshot(row));
    if (change.revision !== (row?.revision ?? 0)) return reply(snapshot(row), 409);

    next.updatedAt = new Date().toISOString();
    const payload = JSON.stringify(next);
    if (new TextEncoder().encode(payload).length > MAX_BYTES - 1024) {
      return reply({ message: 'Data pembukuan melebihi batas penyimpanan.' }, 413);
    }
    const recent = JSON.stringify([...commits.slice(1 - RECENT_COMMITS), change.commitId]);
    const saved = row
      ? await db
          .prepare(
            'UPDATE ledgers SET revision = revision + 1, payload = ?, commits = ? WHERE owner_id = ? AND revision = ? RETURNING revision',
          )
          .bind(payload, recent, owner, change.revision)
          .first()
      : await db
          .prepare(
            'INSERT INTO ledgers (owner_id, revision, payload, commits) VALUES (?, 1, ?, ?) ON CONFLICT DO NOTHING RETURNING revision',
          )
          .bind(owner, payload, recent)
          .first();

    if (saved) return reply({ revision: saved.revision, state: next });
    const current = await read();
    const committed = current && JSON.parse(current.commits).includes(change.commitId);
    return reply(snapshot(current), committed ? 200 : 409);
  } catch {
    return reply({ message: 'Database sedang tidak bisa diakses. Coba lagi.' }, 503);
  }
}
