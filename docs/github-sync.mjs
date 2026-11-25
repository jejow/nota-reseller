import { STORAGE_KEY, createState, newId, readBackup } from './model.mjs?v=github-sync';

export const LEDGER_REPO = 'jejow/nota-reseller-data';
export const CONNECTION_KEY = STORAGE_KEY + '.github';
export const TOKEN_URL =
  'https://github.com/settings/personal-access-tokens/new?name=Nota+Reseller&target_name=jejow&expires_in=90&contents=write';

const api = 'https://api.github.com/repos/' + LEDGER_REPO;
const ledgerPath = '/contents/ledger.enc.json';
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const ledgerContext = 'Nota Reseller ledger v1/' + LEDGER_REPO;
const deviceContext = 'Nota Reseller device v1/' + LEDGER_REPO;
const maxFile = 740000;
const maxState = 2000000;

export class GitHubSyncError extends Error {
  constructor(message, retryable = false) {
    super(message);
    this.retryable = retryable;
  }
}

function toBase64(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 16384) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
  }
  return btoa(binary);
}

const fromBase64 = (text) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
const freshSalt = () => toBase64(crypto.getRandomValues(new Uint8Array(16)));

async function deriveKey(password, salt) {
  const source = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: fromBase64(salt), iterations: 600000, hash: 'SHA-256' },
    source,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function inspectEnvelope(envelope) {
  if (
    envelope?.version !== 1 ||
    typeof envelope.salt !== 'string' ||
    typeof envelope.iv !== 'string' ||
    typeof envelope.data !== 'string' ||
    envelope.data.length > maxFile ||
    fromBase64(envelope.salt).byteLength !== 16 ||
    fromBase64(envelope.iv).byteLength !== 12 ||
    typeof envelope.gzip !== 'boolean'
  ) {
    throw new Error('Unknown encrypted format');
  }
}

async function seal(bytes, key, salt, context, gzip = false) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const additionalData = encoder.encode(context + (gzip ? ':gzip' : ':text'));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData }, key, bytes);
  return { version: 1, salt, iv: toBase64(iv), gzip, data: toBase64(new Uint8Array(encrypted)) };
}

async function unseal(envelope, key, context) {
  const additionalData = encoder.encode(context + (envelope.gzip ? ':gzip' : ':text'));
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(envelope.iv), additionalData },
    key,
    fromBase64(envelope.data),
  );
  return new Uint8Array(plain);
}

async function transformBytes(bytes, transform) {
  const reader = new Blob([bytes]).stream().pipeThrough(transform).getReader();
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxState) {
        await reader.cancel();
        throw new GitHubSyncError('Data pembukuan melebihi batas penyimpanan.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export async function sealConnection(token, password) {
  const salt = freshSalt();
  return seal(encoder.encode(token), await deriveKey(password, salt), salt, deviceContext);
}

export async function openConnection(envelope, password) {
  try {
    inspectEnvelope(envelope);
    return decoder.decode(await unseal(envelope, await deriveKey(password, envelope.salt), deviceContext));
  } catch {
    throw new GitHubSyncError('Kata sandi sinkronisasi tidak cocok dengan sambungan di perangkat ini.');
  }
}

export function createGitHubLedger({ token, password, request = fetch }) {
  let current = null;
  let pending = Promise.resolve();
  let verified = false;
  let key;
  let salt;

  async function getKey(forSalt) {
    if (salt !== forSalt) {
      key = await deriveKey(password, forSalt);
      salt = forSalt;
    }
    return key;
  }

  function serialize(action) {
    const result = pending.then(action);
    pending = result.catch(() => {});
    return result;
  }

  async function call(path, method = 'GET', body) {
    let response;
    try {
      response = await request(api + path, {
        method,
        headers: {
          Authorization: 'Bearer ' + token,
          Accept: 'application/vnd.github+json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new GitHubSyncError('Koneksi ke GitHub terputus. Coba lagi saat terhubung.', true);
    }
    if (response.status === 401) throw new GitHubSyncError('Token GitHub tidak valid atau sudah kedaluwarsa.');
    if (response.status === 403 || response.status === 429) {
      if (response.status === 429 || response.headers.get('x-ratelimit-remaining') === '0') {
        throw new GitHubSyncError('Batas sementara GitHub tercapai. Coba lagi nanti.');
      }
      throw new GitHubSyncError('Periksa izin Contents pada token dan akses ke repo privat.');
    }
    if (response.status >= 500) throw new GitHubSyncError('GitHub sedang tidak dapat diakses.', true);
    return response;
  }

  async function load() {
    if (!verified) {
      const response = await call('');
      const repo = response.ok ? await response.json() : null;
      if (repo?.full_name?.toLowerCase() !== LEDGER_REPO || repo.private !== true) {
        throw new GitHubSyncError('Repo privat Nota Reseller tidak dapat diakses dengan token ini.');
      }
      verified = true;
    }
    const response = await call(ledgerPath + '?ref=main');
    if (response.status === 404 && !current?.sha) {
      return (current ??= { sha: null, revision: 0, commits: [], state: createState() });
    }
    if (!response.ok) throw new GitHubSyncError('File pembukuan GitHub tidak dapat dibaca.');
    const file = await response.json();
    if (file.sha === current?.sha) return current;
    try {
      if (file.encoding !== 'base64' || !file.sha || file.size > maxFile) throw new Error('Invalid file');
      const envelope = JSON.parse(decoder.decode(fromBase64(file.content)));
      inspectEnvelope(envelope);
      let plain = await unseal(envelope, await getKey(envelope.salt), ledgerContext);
      if (envelope.gzip) plain = await transformBytes(plain, new DecompressionStream('gzip'));
      const snapshot = JSON.parse(decoder.decode(plain));
      if (
        !Number.isSafeInteger(snapshot.revision) ||
        snapshot.revision < 1 ||
        !Array.isArray(snapshot.commits)
      ) {
        throw new Error('Invalid revision');
      }
      return (current = { ...snapshot, sha: file.sha, state: readBackup(snapshot.state) });
    } catch {
      throw new GitHubSyncError('Pembukuan tidak dapat dibuka. Periksa kata sandi sinkronisasi.');
    }
  }

  async function encode(snapshot) {
    let bytes = encoder.encode(JSON.stringify(snapshot));
    if (bytes.byteLength > maxState) throw new GitHubSyncError('Data pembukuan melebihi batas penyimpanan.');
    const gzip = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
    if (gzip) bytes = await transformBytes(bytes, new CompressionStream('gzip'));
    const forSalt = salt || freshSalt();
    const envelope = await seal(bytes, await getKey(forSalt), forSalt, ledgerContext, gzip);
    const file = encoder.encode(JSON.stringify(envelope));
    if (file.byteLength > maxFile) throw new GitHubSyncError('File pembukuan melebihi batas sinkronisasi.');
    return toBase64(file);
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
        for (let attempt = 0; attempt < 4; attempt++) {
          const before = current;
          const next = structuredClone(before.state);
          const value = transform(next);
          if (JSON.stringify(next) === JSON.stringify(before.state)) return { snapshot: before, value };
          next.updatedAt = new Date().toISOString();
          const snapshot = {
            revision: before.revision + 1,
            commits: [...before.commits.slice(-31), commitId],
            state: readBackup(next),
          };
          const payload = {
            message: 'Sinkronkan pembukuan Nota Reseller',
            branch: 'main',
            content: await encode(snapshot),
            ...(before.sha ? { sha: before.sha } : {}),
          };
          let response;
          try {
            response = await call(ledgerPath, 'PUT', payload);
          } catch (error) {
            if (!error.retryable) throw error;
            response = await call(ledgerPath, 'PUT', payload);
          }
          if (response.ok) {
            const result = await response.json();
            return { snapshot: (current = { ...snapshot, sha: result.content.sha }), value };
          }
          if (![409, 422].includes(response.status)) {
            throw new GitHubSyncError('Perubahan ditolak GitHub. Periksa izin Contents: Read and write.');
          }
          await load();
          if (current.commits.includes(commitId)) return { snapshot: current, value };
          if (current.sha === before.sha) {
            throw new GitHubSyncError('GitHub belum menerima perubahan. Periksa izin tulis atau coba lagi.');
          }
        }
        throw new GitHubSyncError('Pembukuan sedang diubah di perangkat lain. Coba simpan lagi.');
      }),
  };
}
