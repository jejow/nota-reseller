import { build } from 'esbuild';
import { readdir, readFile } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const root = resolve(project, 'docs');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};
const assets = {};

async function collect(directory) {
  const files = await readdir(directory, { withFileTypes: true });
  for (const file of files) {
    const path = resolve(directory, file.name);
    if (file.isDirectory()) {
      await collect(path);
      continue;
    }
    const type = types[extname(file.name)];
    if (!file.isFile() || !type) continue;
    const name = '/' + relative(root, path).split(sep).join('/');
    const source = await readFile(path, type === 'font/woff2' ? 'base64' : 'utf8');
    const content =
      name === '/index.html'
        ? source.replace('<html lang="id">', '<html lang="id" data-storage="cloud">')
        : source;
    assets[name] = [type, content];
  }
}

await collect(root);
if (!assets['/index.html']?.[1].includes('data-storage="cloud"'))
  throw new Error('Cloud index missing its storage mode.');
await build({
  stdin: {
    contents:
      'import { createWorker } from "./cloud/worker.mjs"; export default createWorker(' +
      JSON.stringify(assets) +
      ');',
    resolveDir: project,
    sourcefile: 'site-entry.mjs',
  },
  outfile: resolve(project, 'dist/server/index.js'),
  bundle: true,
  format: 'esm',
  target: 'es2022',
  logLevel: 'info',
});
