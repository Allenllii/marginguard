import assert from 'node:assert/strict';
import { copyFile, lstat, mkdir, readFile, rm } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Portable equivalent of the official Worker ESM starter's scripts/build.sh.
// Read required inputs before replacing only this project's generated dist/.
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = resolve(root, 'dist');
assert.equal(dirname(dist), root);
assert.equal(basename(dist), 'dist');
assert.notEqual(dist, resolve(root, 'frontend-dist'));
const previous = await lstat(dist).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
assert.ok(!previous?.isSymbolicLink(), 'Refuse to replace a symlinked artifact directory');
await readFile(resolve(root, 'worker/index.js'));
JSON.parse(await readFile(resolve(root, '.openai/hosting.json'), 'utf8'));
await rm(dist, { recursive: true, force: true });
await mkdir(resolve(dist, 'server'), { recursive: true });
await mkdir(resolve(dist, '.openai'), { recursive: true });
await copyFile(resolve(root, 'worker/index.js'), resolve(dist, 'server/index.js'));
await copyFile(resolve(root, '.openai/hosting.json'), resolve(dist, '.openai/hosting.json'));
console.log(`Built ${dist}`);
