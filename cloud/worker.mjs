import { handleLedger } from './ledger.mjs';

export function createWorker(assets) {
  return {
    async fetch(request, env) {
      const { pathname } = new URL(request.url);
      if (pathname === '/api/ledger') return handleLedger(request, env.DB);
      if (pathname === '/api/health' && request.method === 'GET') {
        let database = false;
        try {
          await env.DB.prepare('SELECT revision FROM ledgers LIMIT 1').first();
          database = true;
        } catch {
          /* Binding or migration unavailable. */
        }
        return Response.json(
          { database },
          { status: database ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
        );
      }
      if (!['GET', 'HEAD'].includes(request.method)) {
        return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
      }
      const key = pathname === '/' ? '/index.html' : pathname;
      const asset = Object.hasOwn(assets, key) ? assets[key] : null;
      if (!asset) return new Response('Not found', { status: 404 });
      const [mime, content] = asset;
      const body =
        mime === 'font/woff2' ? Uint8Array.from(atob(content), (char) => char.charCodeAt(0)) : content;
      return new Response(request.method === 'HEAD' ? null : body, {
        headers: {
          'Content-Type': mime,
          'Cache-Control': 'private, no-cache',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    },
  };
}
