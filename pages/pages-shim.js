/* global document, location, sessionStorage, Element, fetch, URL, setTimeout, console */
// Loaded into the app page by sw.js. Chrome sends <a download> navigations
// (e.g. "Download example CSV" -> /api/template) straight to the network,
// skipping the service worker, and GitHub Pages has no /api. Fetch them from
// the page instead, which the service worker does answer, and save the blob.
(() => {
  try { sessionStorage.removeItem('mg-pages-boot'); } catch { /* storage blocked */ }
  document.addEventListener('click', event => {
    const link = event.target instanceof Element ? event.target.closest('a[download][href^="/"]') : null;
    if (!link || link.origin !== location.origin) return;
    event.preventDefault();
    fetch(link.href).then(async response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const name = /filename="([^"]+)"/u.exec(response.headers.get('Content-Disposition') ?? '')?.[1] || link.download || 'download';
      const save = Object.assign(document.createElement('a'), { href: URL.createObjectURL(await response.blob()), download: name });
      save.click();
      setTimeout(() => URL.revokeObjectURL(save.href), 10000);
    }).catch(error => console.error('Download failed:', error));
  }, true);
})();
