import { OWNER_SALT } from './owner-config.mjs?v=owner-access';

export const OWNER_SESSION_KEY = 'nota-reseller.owner-session.v1';
const encoder = new TextEncoder();

export async function passwordProof(username, password) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const buffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: 600000,
      salt: encoder.encode('Nota Reseller owner v1/' + OWNER_SALT + '/' + username),
    },
    material,
    256,
  );
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

function validSession(value) {
  return (
    typeof value?.token === 'string' &&
    /^[A-Za-z0-9_-]{43}$/.test(value.token) &&
    Number.isSafeInteger(value.expiresAt) &&
    value.expiresAt > Date.now()
  );
}

export function readOwnerSession() {
  for (const storage of ['sessionStorage', 'localStorage']) {
    try {
      const value = JSON.parse(window[storage].getItem(OWNER_SESSION_KEY));
      if (validSession(value)) return value;
    } catch {
      // A fresh login works if browser storage is unavailable.
    }
  }
  return null;
}

export function forgetOwnerSession(token) {
  for (const storage of ['sessionStorage', 'localStorage']) {
    try {
      const value = JSON.parse(window[storage].getItem(OWNER_SESSION_KEY));
      if (value?.token === token) window[storage].removeItem(OWNER_SESSION_KEY);
    } catch {
      // The server also revokes signed-out sessions.
    }
  }
}

export function storeOwnerSession(value, remember) {
  try {
    window[remember ? 'localStorage' : 'sessionStorage'].setItem(OWNER_SESSION_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function ownerRequest(url, options = {}, token) {
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', 'Bearer ' + token);
  return fetch(url, {
    ...options,
    headers,
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'error',
    signal: options.signal ?? AbortSignal.timeout(12000),
  });
}

export async function signInOwner(api, username, password, remember) {
  username = username.trim().toLowerCase();
  const proof = await passwordProof(username, password);
  const response = await ownerRequest(new URL('login', api), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, proof, remember }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !validSession(result))
    throw new Error(result?.message || 'Login belum tersedia. Coba kembali.');
  return result;
}
