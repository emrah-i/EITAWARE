import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(resolve(root, 'dist/client/.vite/manifest.json'), 'utf8'));
const reveal = manifest['src/lib/reveal.ts'];
assert.ok(reveal?.isDynamicEntry, 'Reveals must stay in a deferred chunk.');
const seen = new Set();
const files = [];
async function collect(key) {
  if (seen.has(key)) return;
  seen.add(key);
  const entry = manifest[key];
  assert.ok(entry, `Missing manifest entry ${key}`);
  const data = await readFile(resolve(root, 'dist/client', entry.file));
  files.push({ file: entry.file, bytes: data.length, gzipBytes: gzipSync(data).length });
  for (const dependency of entry.imports || []) await collect(dependency);
}
await collect('src/lib/reveal.ts');
// Unminified bootstrap source is a conservative estimate of its small inline contribution.
const bootstrapGzipBytes = gzipSync(await readFile(resolve(root, 'src/lib/reveal-loader.ts'))).length;
const animationGzipBytes = files.reduce((sum, file) => sum + file.gzipBytes, bootstrapGzipBytes);
assert.ok(animationGzipBytes <= 5 * 1024, `Animation exceeds the 5KB gzip budget: ${animationGzipBytes} bytes.`);
const initialEntries = Object.values(manifest).filter(entry => entry.isEntry);
const initial = await Promise.all(initialEntries.map(async entry => ({ file: entry.file, gzipBytes: gzipSync(await readFile(resolve(root, 'dist/client', entry.file))).length })));
assert.ok(initialEntries.some(entry => entry.dynamicImports?.includes('src/lib/reveal.ts')), 'The initial application must load reveals dynamically.');
const report = { animationBudgetBytes: 5120, animationGzipBytes, bootstrapGzipBytes, deferredChunks: files, initial };
await mkdir(resolve(root, 'artifacts'), { recursive: true });
await writeFile(resolve(root, 'artifacts/performance.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Animation budget passed: ${animationGzipBytes}/5120 bytes gzip including conservative bootstrap estimate; deferred chunk(s): ${files.map(file => file.file).join(', ')}.`);
