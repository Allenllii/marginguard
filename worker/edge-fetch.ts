// Cloudflare Workers reject `redirect: 'error'` (only 'follow' and 'manual' exist
// there). Provider calls ask for 'error' so a redirect can never be followed; on
// the edge we send 'manual' and refuse any redirect response instead.
export function edgeFetch(base: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    if (init?.redirect !== 'error') return base(input, init);
    const response = await base(input, { ...init, redirect: 'manual' });
    if ((response.status >= 300 && response.status < 400) || response.type === 'opaqueredirect') throw new TypeError('Redirect refused');
    return response;
  };
}
