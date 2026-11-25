import { createState, newId, readBackup } from './model.mjs?v=github-sync';

export class SyncError extends Error {
  constructor(message, retryable = false, status = 0) {
    super(message);
    this.retryable = retryable;
    this.status = status;
  }
}

export function createSyncedLedger(endpoint = './api/ledger', request = fetch) {
  let current = null;
  let pending = Promise.resolve();

  function serialize(action) {
    const result = pending.then(action);
    pending = result.catch(() => {});
    return result;
  }

  async function call(method = 'GET', body) {
    let response;
    try {
      response = await request(endpoint, {
        method,
        signal: AbortSignal.timeout(12000),
        cache: 'no-store',
        credentials: 'same-origin',
        redirect: 'manual',
        headers: body ? { 'Content-Type': 'application/json', 'X-Nota-Client': '1' } : undefined,
        body,
      });
    } catch {
      throw new SyncError('Koneksi ke database terputus. Coba lagi saat terhubung.', true);
    }
    if (response.type === 'opaqueredirect' || response.status === 401) {
      throw new SyncError('Sesi berakhir. Masuk kembali untuk membuka pembukuan.', false, 401);
    }
    const value = await response.json().catch(() => null);
    if (!response.ok && response.status !== 409) {
      throw new SyncError(value?.message || 'Database tidak dapat diakses saat ini.', response.status >= 500);
    }
    if (!Number.isSafeInteger(value?.revision) || value.revision < 0 || (value.revision > 0 && !value.state))
      throw new SyncError('Database mengirim respons yang tidak valid.');
    return { conflict: response.status === 409, result: value };
  }

  function receive(result) {
    if (current && result.revision <= current.revision) return current;
    return (current = {
      revision: result.revision,
      state: result.state ? readBackup(result.state) : createState(),
    });
  }

  async function load() {
    return receive((await call()).result);
  }

  return {
    get current() {
      return current;
    },
    refresh: () => serialize(load),
    transact: (transform) =>
      serialize(async () => {
        const commitId = newId();
        if (!current) await load();
        for (let tries = 0; tries < 4; tries++) {
          const next = structuredClone(current.state);
          const value = transform(next);
          const payload = JSON.stringify({ revision: current.revision, state: next, commitId });
          let response;
          try {
            response = await call('PUT', payload);
          } catch (error) {
            if (!error.retryable) throw error;
            // Retry the same commit if the server saved it before the response was lost.
            response = await call('PUT', payload);
          }
          const snapshot = receive(response.result);
          if (!response.conflict) return { snapshot, value };
        }
        throw new Error('Pembukuan baru saja berubah di perangkat lain. Coba simpan lagi.');
      }),
  };
}
