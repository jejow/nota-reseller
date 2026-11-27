import { handleLedgerStore, readBody } from './ledger.mjs';
import { createLedgerCipher } from './ledger-crypto.mjs';

const encoder = new TextEncoder();
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const fiveMinutes = 5 * 60 * 1000;
const twelveHours = 12 * 60 * 60 * 1000;
const thirtyDays = 30 * 24 * 60 * 60 * 1000;
const accountId = 'nota-reseller-owner';

const base64url = (bytes) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
const hash = async (value) =>
  base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
const reply = (message, status) => Response.json({ message }, { status });
const sessionHash = (token, verifier) => hash('session/' + verifier + '/' + token);

function matchesDigest(digest, expected) {
  const given = encoder.encode(digest);
  const configured = encoder.encode(expected);
  if (crypto.subtle.timingSafeEqual) return crypto.subtle.timingSafeEqual(given, configured);
  let difference = 0;
  for (let index = 0; index < configured.length; index++) difference |= given[index] ^ configured[index];
  return difference === 0;
}

async function signIn(request, env, now) {
  if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') {
    return reply('Format login tidak valid.', 400);
  }
  let data;
  try {
    data = await readBody(request, 2048);
    if (typeof data?.username !== 'string' || !tokenPattern.test(data.proof) || data.username.length > 80) {
      return reply('Format login tidak valid.', 400);
    }
  } catch {
    return reply('Format login tidak valid.', 400);
  }
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const client = await hash('login/' + env.OWNER_PASSWORD_VERIFIER + '/' + ip);
  const attempt = await env.DB.prepare(
    'INSERT INTO owner_login_attempts (client_hash, expires_at, hits) VALUES (?1, ?2, 1) ' +
      'ON CONFLICT(client_hash) DO UPDATE SET ' +
      '  expires_at = CASE WHEN expires_at <= ?3 THEN ?2 ELSE expires_at END, ' +
      '  hits = CASE WHEN expires_at <= ?3 THEN 1 ELSE hits + 1 END ' +
      'WHERE expires_at <= ?3 OR hits < 10 RETURNING hits',
  )
    .bind(client, now + fiveMinutes, now)
    .first();
  if (!attempt) {
    const limited = reply('Terlalu banyak percobaan masuk. Coba lagi dalam beberapa menit.', 429);
    limited.headers.set('Retry-After', String(fiveMinutes / 1000));
    return limited;
  }
  const digest = await hash(data.proof);
  const validPassword = matchesDigest(digest, env.OWNER_PASSWORD_VERIFIER);
  if (!validPassword || data.username !== env.OWNER_USERNAME) {
    return reply('Username atau kata sandi salah.', 401);
  }
  const token = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = now + (data.remember === true ? thirtyDays : twelveHours);
  const tokenHash = await sessionHash(token, env.OWNER_PASSWORD_VERIFIER);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM owner_sessions WHERE expires_at <= ?').bind(now),
    env.DB.prepare('DELETE FROM owner_login_attempts WHERE client_hash = ? OR expires_at <= ?').bind(
      client,
      now,
    ),
    env.DB.prepare('INSERT INTO owner_sessions (token_hash, expires_at) VALUES (?, ?)').bind(
      tokenHash,
      expiresAt,
    ),
  ]);
  return Response.json({ token, expiresAt });
}

async function route(request, env, path) {
  if (!env.DB || !tokenPattern.test(env.OWNER_PASSWORD_VERIFIER) || !env.OWNER_USERNAME)
    return reply('Akses pemilik sedang disiapkan.', 503);
  if (path === '/api/health' && request.method === 'GET') {
    if (!createLedgerCipher(env.OWNER_LEDGER_KEY)) return reply('Penyimpanan privat sedang disiapkan.', 503);
    await env.DB.prepare('SELECT expires_at FROM owner_sessions LIMIT 1').first();
    return Response.json({ ready: true });
  }
  const now = Date.now();
  if (path === '/api/login' && request.method === 'POST') return signIn(request, env, now);
  if (path !== '/api/ledger' && !(path === '/api/logout' && request.method === 'POST'))
    return reply('Halaman tidak tersedia.', 404);

  const token = request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  if (!token) return reply('Masuk untuk membuka pembukuan.', 401);
  const tokenHash = await sessionHash(token, env.OWNER_PASSWORD_VERIFIER);
  const session = await env.DB.prepare('SELECT expires_at FROM owner_sessions WHERE token_hash = ?')
    .bind(tokenHash)
    .first();
  if (!session || session.expires_at <= now) return reply('Sesi berakhir. Masuk kembali.', 401);
  if (path === '/api/ledger') {
    const documents = request.headers.get('X-Nota-Client') === '2';
    if (request.method === 'PUT' && !documents)
      return reply('Muat ulang halaman untuk menyimpan dengan versi Nota Reseller terbaru.', 426);
    const cipher = createLedgerCipher(env.OWNER_LEDGER_KEY);
    if (!cipher) return reply('Penyimpanan privat sedang disiapkan.', 503);
    return handleLedgerStore(request, env.DB, accountId, cipher, documents);
  }
  await env.DB.prepare('DELETE FROM owner_sessions WHERE token_hash = ?').bind(tokenHash).run();
  return new Response(null, { status: 204 });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    if (origin && origin !== env.PAGES_ORIGIN) {
      return new Response(null, { status: 403, headers: { Vary: 'Origin', 'Cache-Control': 'no-store' } });
    }
    const path = new URL(request.url).pathname;
    let result;
    try {
      result =
        request.method === 'OPTIONS' ? new Response(null, { status: 204 }) : await route(request, env, path);
    } catch {
      result = reply('Layanan pembukuan sedang tidak tersedia. Coba lagi.', 503);
    }
    result.headers.set('Cache-Control', 'no-store');
    result.headers.set('X-Content-Type-Options', 'nosniff');
    result.headers.set('Vary', 'Origin');
    if (origin) {
      result.headers.set('Access-Control-Allow-Origin', origin);
      result.headers.set('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
      result.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Nota-Client');
    }
    return result;
  },
};
