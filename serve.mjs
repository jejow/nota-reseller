import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('./docs/', import.meta.url));
const args = process.argv.slice(2);
const lan = args.includes('--lan');
const portIndex = args.indexOf('--port');
const port = portIndex < 0 ? 4173 : Number(args[portIndex + 1]);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be between 1 and 65535.');

const types = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    return response.end();
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    const child = relative(root, path);
    const contentType = types[extname(path)];
    if (isAbsolute(child) || child.startsWith('..') || !contentType) {
      response.writeHead(404);
      return response.end('Not found');
    }
    const file = await readFile(path);
    response.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': file.length,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : file);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});

server.on('error', (error) => {
  console.error(
    error.code === 'EADDRINUSE'
      ? `Port ${port} sudah dipakai. Gunakan --port untuk memilih port lain.`
      : error.message,
  );
  process.exitCode = 1;
});

server.listen(port, lan ? '0.0.0.0' : '127.0.0.1', () => {
  const url = `http://127.0.0.1:${port}/`;
  console.log('Nota Reseller · ' + url);
  if (lan)
    for (const addresses of Object.values(networkInterfaces())) {
      for (const address of addresses ?? []) {
        if (address.family === 'IPv4' && !address.internal)
          console.log(`Wi-Fi/LAN · http://${address.address}:${port}/`);
      }
    }
  if (args.includes('--open') && process.platform === 'win32') {
    const opened = spawn('explorer.exe', [url], { detached: true, stdio: 'ignore', windowsHide: true });
    opened.on('error', () => console.log('Buka alamat tersebut di browser.'));
    opened.unref();
  }
});
