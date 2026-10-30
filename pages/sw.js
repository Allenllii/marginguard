/* global self, URL, Request, Headers, Response */
// Static-hosting adapter: runs the forced-offline Worker inside a service worker.
// scripts/build-pages.mjs bundles this file with offline-dist/server/index.js
// into one classic script, so no module-service-worker support is required.
import worker from '../offline-dist/server/index.js';

const scope = new URL(self.registration.scope).pathname; // e.g. "/marginguard/"
const staticFiles = new Set([`${scope}pages-shim.js`]);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || staticFiles.has(url.pathname)) return;
  event.respondWith(handle(event.request, url));
});

async function handle(request, url) {
  // The app uses root-absolute URLs (/assets/…, /api/…). Those reach us as
  // subresources of a controlled page; in-scope paths lose the scope prefix.
  let path = url.pathname.startsWith(scope) ? `/${url.pathname.slice(scope.length)}` : url.pathname;
  if (path === '/index.html') path = '/';
  const navigate = request.mode === 'navigate';
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const forwarded = new Request(new URL(path + url.search, url.origin), { method: request.method, headers: request.headers, body: hasBody ? await request.arrayBuffer() : undefined });
  // Origin is a forbidden header: hidden from service workers and dropped by
  // new Request(). The Worker's same-origin POST check needs it. Non-navigation
  // fetch events only come from this origin's own controlled pages, so supply
  // it there; navigations (e.g. a cross-site form POST) keep it absent -> 403.
  const headers = new Headers(request.headers);
  if (!navigate) headers.set('Origin', self.location.origin);
  Object.defineProperty(forwarded, 'headers', { value: headers });
  const response = await worker.fetch(forwarded, {});
  if (!navigate || !response.headers.get('Content-Type')?.startsWith('text/html')) return response;
  // data: icon stops Chrome's direct (non-service-worker) /favicon.ico request 404ing.
  const html = (await response.text()).replace('</head>', '<link rel="icon" href="data:,"><script src="pages-shim.js"></script></head>');
  return new Response(html, { status: response.status, headers: response.headers });
}
