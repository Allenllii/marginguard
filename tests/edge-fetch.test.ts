import test from 'node:test';
import assert from 'node:assert/strict';
import { edgeFetch } from '../worker/edge-fetch.js';

test('edge fetch sends manual instead of error and still refuses redirects', async () => {
  const seen: (RequestRedirect | undefined)[] = [];
  const fake = (status: number): typeof fetch => (async (_input, init) => { seen.push(init?.redirect); return new Response(null, { status }); }) as typeof fetch;
  assert.equal((await edgeFetch(fake(200))('https://api.tavily.com/search', { method: 'POST', redirect: 'error' })).status, 200);
  await assert.rejects(edgeFetch(fake(302))('https://api.tavily.com/search', { redirect: 'error' }), /Redirect refused/);
  await edgeFetch(fake(200))('https://example.com/', {});
  assert.deepEqual(seen, ['manual', 'manual', undefined]);
});
