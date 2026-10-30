import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ArrowUpRight, BadgeCheck, BookOpen, CircleCheck, CircleHelp, CirclePause, CircleX, LoaderCircle, Search, SearchCheck } from 'lucide-react';
import Limits from './Limits';
import './check-any-fix.css';

// Contract for POST /api/check-fix and GET /api/check-fix/examples (server built separately).
export type FixContext = { platform: 'Shopify' | 'WooCommerce'; carrier: 'USPS' | 'UPS'; region: 'US' | 'UK' | 'unknown' };
type Step = { op: 'search' | 'extract'; url?: string; requestId?: string; credits?: number; latencyMs?: number; ok: boolean };
export type FixCheck = {
  status: 'supported' | 'contradicted' | 'insufficient' | 'hold'; mode: 'live' | 'recorded' | 'offline'; label: string;
  claim: string | null; topic: 'discounts' | 'shipping' | 'returns' | 'other' | null; query: string | null; domain: string | null;
  sources: { id: string; title: string; url: string; passage: string }[]; quotes: { sourceId: string; quote: string }[];
  explanation: string | null; nextCheck: string | null; holdReason: string | null;
  retrieval: { steps: Step[] } | null; models: { plan: string | null; judge: string | null };
  proof: { planRequestId: string | null; judgeRequestId: string | null; inputTokens: number | null; outputTokens: number | null; latencyMs: number | null } | null;
};
type Example = { id: string; fix: string; context: FixContext };

const MAX = 240;
const DEFAULT_CONTEXT: FixContext = { platform: 'Shopify', carrier: 'USPS', region: 'US' };
const VERDICT: Record<FixCheck['status'], { badge: string; heading: string; icon: typeof CircleCheck }> = {
  supported: { badge: 'Supported', heading: 'Official policy supports this fix.', icon: CircleCheck },
  contradicted: { badge: 'Contradicted', heading: 'Policy says this fix won’t work as stated.', icon: CircleX },
  insufficient: { badge: 'Not enough evidence', heading: 'The official sources found don’t settle it.', icon: CircleHelp },
  hold: { badge: 'On hold', heading: 'On hold: this fix was not judged.', icon: CirclePause },
};
const STAGES = [
  { key: 'plan', name: 'Plan claim', by: 'Nemotron' },
  { key: 'search', name: 'Tavily Search', by: 'Tavily' },
  { key: 'extract', name: 'Tavily Extract', by: 'Tavily' },
  { key: 'judge', name: 'Judge', by: 'Nemotron' },
  { key: 'verify', name: 'Verify quotes', by: 'Code' },
] as const;
const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };
const shortId = (id: string) => id.length > 10 ? `${id.slice(0, 8)}…` : id;
const sum = (values: (number | undefined)[]) => values.reduce<number>((total, v) => total + (v ?? 0), 0);

type StageState = { state: 'done' | 'failed' | 'skipped'; detail: string };
function stageStates(result: FixCheck): Record<(typeof STAGES)[number]['key'], StageState> {
  const steps = result.retrieval?.steps ?? [];
  const ops = (op: Step['op']): StageState => {
    const mine = steps.filter(s => s.op === op);
    if (!mine.length) return { state: 'skipped', detail: 'Not run' };
    const ok = mine.filter(s => s.ok).length;
    const credits = mine.some(s => typeof s.credits === 'number') ? ` · ${sum(mine.map(s => s.credits))} cr` : '';
    return { state: ok ? 'done' : 'failed', detail: op === 'search' ? `${ok ? 'Found sources' : 'Failed'}${credits}` : `${ok}/${mine.length} page${mine.length === 1 ? '' : 's'}${credits}` };
  };
  return {
    plan: result.models.plan ? { state: 'done', detail: 'Testable claim' } : { state: 'skipped', detail: 'Not run' },
    search: ops('search'),
    extract: ops('extract'),
    judge: result.models.judge ? { state: 'done', detail: VERDICT[result.status].badge } : { state: 'skipped', detail: 'Not run' },
    verify: result.models.judge ? { state: 'done', detail: `${result.quotes.length} quote${result.quotes.length === 1 ? '' : 's'} exact` } : { state: 'skipped', detail: 'Not run' },
  };
}

function Pipeline({ result }: { result: FixCheck | null }) {
  const states = result ? stageStates(result) : null;
  return <ol className={`cf-pipeline ${states ? 'is-done' : 'is-running'}`} aria-label={states ? 'Steps that ran' : 'Check in progress'}>
    {STAGES.map((stage, index) => {
      const s = states?.[stage.key];
      return <li key={stage.key} className={`cf-stage ${s ? s.state : 'running'}`}>
        <span className="cf-stage-dot" aria-hidden="true">{s?.state === 'done' ? <CircleCheck size={15} /> : s?.state === 'failed' ? <CircleX size={15} /> : index + 1}</span>
        <span className="cf-stage-text"><strong>{stage.name}</strong><small>{s ? s.detail : stage.by}</small></span>
        <span className="sr-only">{s ? (s.state === 'done' ? 'completed' : s.state === 'failed' ? 'failed' : 'not run') : 'waiting for the response'}</span>
      </li>;
    })}
  </ol>;
}

// Shows the passage with the verified quote marked, when the quote sits inside the returned passage.
function Passage({ passage, quote }: { passage: string; quote: string }) {
  const at = passage.indexOf(quote);
  if (at < 0) return <p>{passage}</p>;
  return <p>{passage.slice(0, at)}<mark>{quote}</mark>{passage.slice(at + quote.length)}</p>;
}

function Provenance({ result }: { result: FixCheck }) {
  const steps = result.retrieval?.steps ?? [];
  const credits = steps.some(s => typeof s.credits === 'number') ? sum(steps.map(s => s.credits)) : null;
  const latency = steps.some(s => typeof s.latencyMs === 'number') ? sum(steps.map(s => s.latencyMs)) : null;
  const ids = steps.filter(s => s.requestId).map(s => <span key={`${s.op}-${s.requestId}`}>{s.op === 'search' ? 'Search' : 'Extract'} <code title={s.requestId}>{shortId(s.requestId!)}</code></span>);
  const rows: [string, ReactNode][] = [
    ['Mode', <span className={`cf-mode ${result.mode}`}>{result.label}</span>],
    ...(result.query ? [['Tavily query', <><code className="cf-query">{result.query}</code>{result.domain ? <> on {result.domain}</> : null}</>] as [string, ReactNode]] : []),
    ...(steps.length ? [['Tavily requests', <span className="cf-ids">{ids.length ? ids.reduce<ReactNode[]>((all, id, i) => i ? [...all, <span key={`arrow-${i}`} aria-hidden="true">→</span>, id] : [id], []) : 'No request IDs returned'}{credits !== null ? <span>{credits} credit{credits === 1 ? '' : 's'}</span> : null}{latency !== null ? <span>{(latency / 1000).toFixed(1)} s</span> : null}</span>] as [string, ReactNode]] : []),
    ['Models', <span className="cf-ids"><span>plan = <code>{result.models.plan ?? 'not run'}</code></span><span>judge = <code>{result.models.judge ?? 'not run'}</code></span></span>],
    ...(result.proof ? [['Nemotron', <span className="cf-ids">{result.proof.planRequestId ? <span>plan <code title={result.proof.planRequestId}>{shortId(result.proof.planRequestId)}</code></span> : null}{result.proof.judgeRequestId ? <span>judge <code title={result.proof.judgeRequestId}>{shortId(result.proof.judgeRequestId)}</code></span> : null}{result.proof.inputTokens !== null ? <span>{result.proof.inputTokens} in / {result.proof.outputTokens ?? '?'} out tokens</span> : null}{result.proof.latencyMs !== null ? <span>{(result.proof.latencyMs / 1000).toFixed(1)} s</span> : null}</span>] as [string, ReactNode]] : []),
  ];
  return <dl className="cf-provenance">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

function Result({ result, fix, headingRef }: { result: FixCheck; fix: string; headingRef: RefObject<HTMLHeadingElement | null> }) {
  const verdict = VERDICT[result.status];
  const Icon = verdict.icon;
  const hasEvidence = !!(result.claim || result.quotes.length || result.sources.length || result.explanation);
  return <section className={`cf-result ${result.status}`} aria-labelledby="cf-result-heading">
    <header className="cf-verdict">
      <span className="cf-badge" data-testid="cf-verdict"><Icon size={18} aria-hidden="true" />{verdict.badge}</span>
      <h2 id="cf-result-heading" ref={headingRef} tabIndex={-1}>{verdict.heading}</h2>
      <p className="cf-asked"><span>You asked</span>“{fix}”</p>
      {result.holdReason ? <p className="cf-hold" role="note"><strong>Why it’s on hold</strong>{result.holdReason}</p> : null}
    </header>
    <div className={`cf-result-body ${hasEvidence ? '' : 'single'}`}>
      {hasEvidence ? <div className="cf-evidence">
        {result.claim ? <div className="cf-claim"><span className="cf-label">Claim tested</span><p>{result.claim}</p></div> : null}
        {result.quotes.length ? <><span className="cf-label">What the official policy says</span>
          {result.quotes.map((q, i) => {
            const source = result.sources.find(s => s.id === q.sourceId);
            return <figure className="cf-quote" key={`${q.sourceId}-${i}`}>
              <blockquote cite={source?.url}><p><span>{q.quote}</span></p></blockquote>
              <figcaption>
                <span className="cf-verified"><BadgeCheck size={15} aria-hidden="true" />Quote verified verbatim against the Tavily text</span>
                {source ? <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} <span className="cf-host">{host(source.url)}</span><ArrowUpRight size={13} aria-hidden="true" /></a> : null}
              </figcaption>
              {source?.passage ? <details className="cf-passage"><summary>Show the surrounding passage</summary><Passage passage={source.passage} quote={q.quote} /></details> : null}
            </figure>;
          })}</> : result.sources.length ? <><span className="cf-label">Sources read</span><ul className="cf-sources">{result.sources.map(s => <li key={s.id}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title} <span className="cf-host">{host(s.url)}</span><ArrowUpRight size={13} aria-hidden="true" /></a></li>)}</ul></> : null}
        {result.explanation ? <div className="cf-explain"><span className="cf-label">Why</span><p>{result.explanation}</p></div> : null}
      </div> : null}
      <aside className="cf-side">
        {result.nextCheck ? <div className="cf-next"><span className="cf-label">Next check</span><p>{result.nextCheck}</p></div> : null}
        <Pipeline result={result} />
      </aside>
    </div>
    <Provenance result={result} />
    <Limits items={['The verdict is Nemotron’s judgment of the retrieved text. Code checks that every quote appears word for word in what Tavily returned.', 'Not legal advice. Policies change; open the source before you act.']} />
  </section>;
}

export default function CheckAnyFix({ live }: { live: boolean }) {
  const [fix, setFix] = useState('');
  const [context, setContext] = useState<FixContext>(DEFAULT_CONTEXT);
  const [examples, setExamples] = useState<Example[]>([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState<'live' | 'recorded' | null>(null);
  const [error, setError] = useState('');
  const [outcome, setOutcome] = useState<{ result: FixCheck; fix: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const version = useRef(0);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    fetch('/api/check-fix/examples', { signal: abort.signal }).then(r => r.ok ? r.json() : []).then(data => { if (Array.isArray(data)) setExamples(data); }).catch(() => { /* no chips; the form still works */ });
    return () => abort.abort();
  }, []);
  useEffect(() => () => { version.current++; controller.current?.abort(); }, []);
  useEffect(() => { if (outcome) heading.current?.focus(); }, [outcome]);

  async function run(useLive: boolean) {
    const text = fix.trim();
    if (!text || busy) return;
    const id = ++version.current;
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    setBusy(useLive ? 'live' : 'recorded'); setError(''); setOutcome(null);
    try {
      const response = await fetch('/api/check-fix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fix: text, context, live: useLive }), signal: abort.signal });
      if (response.status === 429) {
        const wait = Number(response.headers.get('Retry-After')) || 0, body = await response.json().catch(() => null);
        throw new Error(`${body?.error || 'The live budget is busy.'}${wait ? ` Try again in ${wait} s.` : ''} Recorded examples still work.`);
      }
      if (response.status === 503) throw new Error('Live checks are unavailable right now. Try a recorded example.');
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.status) throw new Error(data?.error || 'The check could not complete. Please try again.');
      if (id === version.current) setOutcome({ result: data as FixCheck, fix: text });
    } catch (e) {
      if (!abort.signal.aborted && id === version.current) setError((e as Error).name === 'TypeError' ? 'The check could not complete. Please try again.' : (e as Error).message);
    } finally { if (id === version.current) setBusy(null); }
  }
  const pick = (example: Example) => { setFix(example.fix.slice(0, MAX)); setContext(example.context); setError(''); };
  const select = <K extends keyof FixContext>(key: K, label: string, options: [FixContext[K], string][]) =>
    <label>{label}<select aria-label={label} value={context[key]} disabled={!!busy} onChange={e => setContext({ ...context, [key]: e.target.value })}>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>;
  const empty = !fix.trim();
  const status = busy ? 'Checking the fix against official policy…' : error ? '' : outcome ? `${VERDICT[outcome.result.status].badge}. ${outcome.result.nextCheck ? `Next check: ${outcome.result.nextCheck}` : ''}` : '';

  return <div className="cf-shell">
    <section className="cf-ask" aria-labelledby="cf-ask-heading">
      <div className="cf-ask-copy">
        <span className="cf-kicker"><SearchCheck size={15} aria-hidden="true" />Tavily Search + Extract · Nemotron · code-verified quotes</span>
        <h2 id="cf-ask-heading">Got a margin fix from an AI assistant? Check it against official policy.</h2>
        <p>Paste what you were told to change. MarginGuard tests it against the platform’s own help pages.</p>
        <ol className="cf-how">
          <li><span>Nemotron</span>Turns the fix into a testable claim and a generic search</li>
          <li><span>Tavily</span>Search finds the official page; Extract reads it</li>
          <li><span>Nemotron</span>Judges whether the page supports the claim</li>
          <li><span>Code</span>Checks every quote word for word against the Tavily text</li>
        </ol>
      </div>
      <form className="cf-form" onSubmit={e => { e.preventDefault(); if (!live || consent) void run(live); }}>
        <label className="cf-fix-label" htmlFor="cf-fix">Proposed fix</label>
        <textarea id="cf-fix" value={fix} maxLength={MAX} rows={3} disabled={!!busy} aria-describedby="cf-count" placeholder="e.g. Tighten discount combination settings to stop staff discounts stacking" onChange={e => setFix(e.target.value)} />
        <div className="cf-form-row">
          <div className="cf-selects">
            {select('platform', 'Platform', [['Shopify', 'Shopify'], ['WooCommerce', 'WooCommerce']])}
            {select('carrier', 'Carrier', [['USPS', 'USPS'], ['UPS', 'UPS']])}
            {select('region', 'Region', [['US', 'US'], ['UK', 'UK'], ['unknown', 'Unknown']])}
          </div>
          <span id="cf-count" className="cf-count">{fix.length} / {MAX}</span>
        </div>
        {examples.length ? <div className="cf-examples" role="group" aria-label="Example fixes"><span>Try an example</span>{examples.map(example => <button type="button" key={example.id} className={`cf-chip ${fix === example.fix ? 'active' : ''}`} aria-pressed={fix === example.fix} disabled={!!busy} onClick={() => pick(example)}><span>{example.fix}</span><small>{example.context.platform} · {example.context.region === 'unknown' ? 'region unknown' : example.context.region}</small></button>)}</div> : null}
        {live ? <label className="cf-consent"><input type="checkbox" checked={consent} disabled={!!busy} onChange={e => setConsent(e.target.checked)} />Send this fix text and generic queries to Nemotron and Tavily; uses live credits.</label> : null}
        <div className="cf-actions">
          {live ? <button type="submit" className="button cf-run" disabled={empty || !consent || !!busy}>{busy === 'live' ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <Search size={16} aria-hidden="true" />}Check with Tavily + Nemotron</button> : null}
          <button type={live ? 'button' : 'submit'} className={`button ${live ? 'cf-secondary' : 'cf-run'}`} disabled={empty || !!busy} onClick={live ? () => void run(false) : undefined}>{busy === 'recorded' ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <BookOpen size={16} aria-hidden="true" />}Show recorded check</button>
        </div>
        <p className="cf-note">{live ? 'Recorded checks replay a saved live run for the example fixes, with no new provider call.' : 'Recorded checks work for the example fixes. Live checks need the live demo or your own keys.'}</p>
      </form>
    </section>
    <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="cf-status">{status}</p>
    {error ? <div className="cf-error" role="alert">{error}</div> : null}
    {busy ? <section className="cf-progress" aria-label="Check in progress"><div className="cf-progress-head"><LoaderCircle size={16} className="spin" aria-hidden="true" /><strong>{busy === 'live' ? 'Running the live check' : 'Loading the recorded check'}</strong><span>Steps are confirmed when the response arrives.</span></div><Pipeline result={null} /></section> : null}
    {outcome ? <Result result={outcome.result} fix={outcome.fix} headingRef={heading} /> : null}
  </div>;
}
