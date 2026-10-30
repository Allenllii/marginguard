import { useEffect, useRef, useState } from 'react';
import { TriangleAlert, ArrowUpRight, CircleCheck, CircleSlash, Eye, LoaderCircle, CircleMinus, RefreshCw } from 'lucide-react';
import './policy-watch.css';

// Shapes returned by GET /api/policy-watch and POST /api/policy-watch/check (server/policy-watch.ts).
type Step = { op: string; url?: string; requestId?: string; credits?: number; latencyMs?: number; ok: boolean; detail?: string };
export type WatchPage = { id: string; title: string; url: string; dependsOn: string; reviewedAt: string; fingerprint: string; note?: string };
export type WatchResult = { id: string; status: 'unchanged' | 'changed' | 'unavailable'; currentFingerprint?: string; summary?: string };
export type WatchCheck = { mode: 'live' | 'recorded'; checkedAt: string; label: string; results: WatchResult[]; retrieval: { steps: Step[] } };
export type WatchData = { pages: WatchPage[]; lastCheck: WatchCheck | null };

const STATUS = {
  unchanged: { label: 'Unchanged', Icon: CircleCheck },
  changed: { label: 'Changed · re-review', Icon: TriangleAlert },
  unavailable: { label: 'Unavailable', Icon: CircleSlash },
  none: { label: 'Not checked', Icon: CircleMinus },
} as const;
const hex = /^[0-9a-f]{64}$/;
const short = (value: string) => hex.test(value) ? `${value.slice(0, 12)}…` : value;
const host = (url: string) => { try { return new URL(url).hostname; } catch { return url; } };

export function PolicyWatchView({ data, tavilyConfigured, busy = false, consent = false, error = '', onConsent, onCheck }: { data: WatchData | null; tavilyConfigured: boolean; busy?: boolean; consent?: boolean; error?: string; onConsent?: (value: boolean) => void; onCheck?: () => void }) {
  const check = data?.lastCheck ?? null;
  const steps = check?.retrieval.steps ?? [];
  const first = steps[0], requestId = steps.find(s => s.requestId)?.requestId;
  const counts = check ? check.results.reduce<Record<string, number>>((n, r) => ({ ...n, [r.status]: (n[r.status] ?? 0) + 1 }), {}) : {};
  return <section className="card pw-card" aria-labelledby="pw-heading">
    <div className="section-title"><div><span className="eyebrow"><Eye size={15} /> POLICY WATCH · TAVILY EXTRACT</span><h2 id="pw-heading">Are the official pages still the ones we reviewed?</h2></div><span className={`mode-pill ${check?.mode === 'live' ? 'live' : ''}`}><i />{check ? check.mode === 'live' ? 'Live check' : 'Recorded check' : 'No check yet'}</span></div>
    <p className="method-text">MarginGuard’s decisions cite these official pages. One Tavily Extract call re-reads them; code re-hashes the operative sentences each decision uses and compares them with the fingerprint we reviewed.</p>
    {data ? <ul className="pw-list" aria-label="Watched policy pages">{data.pages.map(page => {
      const result = check?.results.find(r => r.id === page.id);
      const status = STATUS[result?.status ?? 'none'];
      return <li key={page.id} className={`pw-row pw-${result?.status ?? 'none'}`} aria-label={page.dependsOn}>
        <div className="pw-page">
          <a href={page.url} target="_blank" rel="noopener noreferrer"><strong>{page.title}</strong><ArrowUpRight size={13} /></a>
          <span className="pw-host">{host(page.url)}</span>
          <span className="pw-depends">Used by: {page.dependsOn}</span>
        </div>
        <dl className="pw-meta">
          <div><dt>Reviewed</dt><dd>{page.reviewedAt}</dd></div>
          <div><dt>Fingerprint</dt><dd><code title={page.fingerprint}>{short(page.fingerprint)}</code></dd></div>
          {result?.currentFingerprint && result.status === 'changed' ? <div><dt>Now</dt><dd><code title={result.currentFingerprint}>{short(result.currentFingerprint)}</code></dd></div> : null}
        </dl>
        <span className="pw-status"><status.Icon size={14} aria-hidden="true" />{status.label}</span>
        {result?.status === 'changed' ? <p className="pw-detail" role="note"><strong>Official page changed since our review.</strong> {result.summary}</p> : result?.status === 'unavailable' && result.summary ? <p className="pw-detail">{result.summary}</p> : !result && page.note ? <p className="pw-detail">{page.note}</p> : null}
      </li>;
    })}</ul> : <p className="caption" role="status">Loading watched pages…</p>}
    {check ? <p className="pw-last">
      <span><strong>{check.label}</strong> · checked {check.checkedAt.replace('T', ' ').slice(0, 16)} UTC</span>
      {requestId ? <span>request <code title={requestId}>{requestId.slice(0, 8)}…</code></span> : <span>no request ID returned</span>}
      {typeof first?.credits === 'number' ? <span>{first.credits} credit{first.credits === 1 ? '' : 's'} reported</span> : null}
      {typeof first?.latencyMs === 'number' ? <span>{first.latencyMs} ms</span> : null}
      <span>{counts.unchanged ?? 0} unchanged · {counts.changed ?? 0} changed · {counts.unavailable ?? 0} unavailable</span>
    </p> : data ? <p className="caption">No recorded check is available.</p> : null}
    {check?.mode === 'recorded' ? <p className="caption">This is a recorded result, not a current check. A page may have changed since then.</p> : null}
    {tavilyConfigured ? <div className="pw-actions">
      <label className="consent"><input type="checkbox" checked={consent} disabled={busy} onChange={e => onConsent?.(e.target.checked)} />Allow one Tavily Extract call for the official URLs above. No store data is sent; it may use a credit.</label>
      <button className="button primary" disabled={busy || !consent || !data} onClick={onCheck}>{busy ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />}Check now with Tavily</button>
    </div> : <p className="live-note">Live checks run locally with your own Tavily key; this panel shows the recorded check.</p>}
    {error ? <div className="fallback-note" role="alert">{error}</div> : null}
    <p className="sr-only" aria-live="polite">{busy ? 'Checking official pages with Tavily…' : ''}</p>
  </section>;
}

export default function PolicyWatch() {
  const [data, setData] = useState<WatchData | null>(null);
  const [tavilyConfigured, setTavilyConfigured] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    fetch('/api/policy-watch').then(r => r.json()).then((d: WatchData) => { if (alive.current) setData(d); }).catch(() => { if (alive.current) setError('Could not load the watched pages.'); });
    fetch('/api/health').then(r => r.json()).then((h: { tavily?: { mode?: string } }) => { if (alive.current) setTavilyConfigured(h.tavily?.mode === 'configured'); }).catch(() => undefined);
    return () => { alive.current = false; };
  }, []);
  async function check() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/policy-watch/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ live: true }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'The live check could not complete.');
      if (alive.current) setData(body as WatchData);
    } catch (e) { if (alive.current) setError(`${(e as Error).message} The last shown result is unchanged.`); }
    finally { if (alive.current) setBusy(false); }
  }
  return <PolicyWatchView data={data} tavilyConfigured={tavilyConfigured} busy={busy} consent={consent} error={error} onConsent={setConsent} onCheck={check} />;
}
