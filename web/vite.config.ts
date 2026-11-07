import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

// In development, /api and /uploads are proxied to the running Docker stack.
const backend = process.env.EUSKALDUO_BACKEND ?? 'http://127.0.0.1:8765';

function filesIn(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesIn(join(dir, e.name)) : [join(dir, e.name)]));
}

/**
 * Emits /sw.js (offline mode, web/sw/sw.js) with the list of files this build
 * produced, so the whole learner app is stored on install. The version hash
 * changes whenever any file name or the page changes, which makes browsers
 * install the new worker and drop the old files.
 */
function serviceWorker(): Plugin {
  const source = resolve(import.meta.dirname, 'sw/sw.js');
  return {
    name: 'euskalduo-service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const publicDir = resolve(import.meta.dirname, 'public');
      const files = [
        '/',
        ...Object.keys(bundle).filter((f) => f !== 'index.html' && !f.endsWith('.map')).map((f) => `/${f}`),
        ...filesIn(publicDir).map((f) => `/${relative(publicDir, f).split('\\').join('/')}`),
      ].sort();
      const page = bundle['index.html'];
      const hash = createHash('sha256').update(JSON.stringify(files));
      if (page?.type === 'asset') hash.update(page.source);
      const code = readFileSync(source, 'utf8')
        .replace('= __VERSION__;', `= ${JSON.stringify(hash.digest('hex').slice(0, 12))};`)
        .replace('= __PRECACHE__;', `= ${JSON.stringify(files)};`);
      if (code.includes('= __')) this.error('sw/sw.js: a placeholder was not replaced');
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: code });
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  server: {
    fs: { allow: ['..'] },
    proxy: {
      '/api': backend,
      '/uploads': backend,
      '/audio': backend,
    },
  },
  build: {
    sourcemap: false,
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
