import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpRight, BookOpen, Check, ExternalLink, Globe2, LoaderCircle, Search, Sparkles } from 'lucide-react';
import type { Analysis, Remediation, ResearchContext, ResearchPacket } from '../shared/types';
import { preciseMoney } from '../shared/types';
import { decidePolicy } from '../shared/policy-decision';
import PolicyDecisionCard from './PolicyDecisionCard';
import PolicyDraftCard from './PolicyDraftCard';
import PolicyTestLab from './PolicyTestLab';
import Limits from './Limits';

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The policy check could not complete.');
  return data;
}
export default function PolicyResearch({ analysis, csv, tavilyConfigured, nvidiaConfigured, initialPacket = null }: { analysis: Analysis; csv: string; tavilyConfigured: boolean; nvidiaConfigured: boolean; initialPacket?: ResearchPacket | null }) {
  const supported = analysis.issues.filter(i => i.kind === 'discount' || i.kind === 'shipping');
  const [issueId, setIssueId] = useState((initialPacket ? supported.find(i => i.kind === initialPacket.kind)?.id : supported[0]?.id) ?? '');
  const [context, setContext] = useState<ResearchContext>(initialPacket?.context ?? { platform: 'Shopify', carrier: 'USPS', region: 'US', discountOrigin: 'unknown' });
  const [packet, setPacket] = useState<ResearchPacket | null>(initialPacket);
  const [remedy, setRemedy] = useState<Remediation | null>(null);
  const [busy, setBusy] = useState<'search' | 'model' | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const decisionHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!initialPacket) return;
    const heading = decisionHeading.current;
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ block: 'start', behavior: 'auto' });
  }, [initialPacket]);
  const requestVersion = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => { requestVersion.current++; controller.current?.abort(); }, []);
  const issue = supported.find(i => i.id === issueId);
  const decision = packet && issue ? decidePolicy(issue.kind, packet) : null;
  const liveDraft = nvidiaConfigured && packet?.mode === 'live';
  const clear = () => { requestVersion.current++; controller.current?.abort(); setPacket(null); setRemedy(null); setError(''); setBusy(null); };
  async function search(live: boolean) {
    if (!issue) return;
    const version = ++requestVersion.current;
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    setBusy('search'); setError(''); setRemedy(null); setPacket(null);
    try { const result = await post<ResearchPacket>('/api/research', { kind: issue.kind, context, live }, abort.signal); if (version === requestVersion.current) setPacket(result); }
    catch (e) { if (!abort.signal.aborted && version === requestVersion.current) setError((e as Error).message); } finally { if (version === requestVersion.current) setBusy(null); }
  }
  async function draft(live: boolean) {
    if (!issue || !packet) return;
    const version = ++requestVersion.current;
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    setBusy('model'); setError(''); setRemedy(null);
    try { const result = await post<Remediation>('/api/remediate', { csv, assumptions: analysis.assumptions, issueId: issue.id, researchId: packet.researchId, live }, abort.signal); if (version === requestVersion.current) setRemedy(result); }
    catch (e) { if (!abort.signal.aborted && version === requestVersion.current) setError((e as Error).message); } finally { if (version === requestVersion.current) setBusy(null); }
  }
  function exportPolicy() {
    if (!packet || !issue) return;
    const lines = ['# MarginGuard policy evidence', '', `Finding: ${issue.title}`, `CSV evidence ID: ${issue.id}`, `CSV source rows: ${issue.rowIds.join(', ')}`, `User-provided cost model: ${preciseMoney(issue.exposure)} exposure, not realized recovery`, `Formula: ${issue.formula}`, `Dataset: ${analysis.fingerprint}`, '', `Search mode: ${packet.mode}`, `Context: ${context.platform} / ${context.carrier} / ${context.region} / discount origin ${context.discountOrigin}`, `Seller assumptions: ceiling ${analysis.assumptions.discountCeilingPercent}%; shipping subsidy ${preciseMoney(analysis.assumptions.shippingSubsidyCents)}`, `Decision status: ${decision?.status ?? "not evaluated"}`, `Policy constraint: ${decision?.constraint ?? "none"}`, `Next check: ${decision?.nextCheck ?? "hold"}`, `What would disprove it: ${decision?.disprove ?? "not assessed"}`, `Query (no private data): ${packet.query}`, `Retrieved at: ${packet.checkedAt ?? 'not retrieved; offline fixture'}`, packet.note, '', ...packet.sources.flatMap(s => [`## ${s.id}: ${s.title}`, s.url, `Short ${packet.mode === 'live' ? 'returned excerpt' : 'fixture summary'}: ${s.snippet}`, `Published date returned: ${s.publishedDate ?? 'not provided'}. Policy effective date not verified.`, '']), '## Analyst remediation', 'Decision authority: Rule-based policy check', 'Draft authority: Review aid; cannot approve a remedy or estimate recovery', `Model mode: ${remedy?.mode ?? 'not generated'}; model: ${remedy?.model ?? 'none'}`, ...(remedy ? [...remedy.documentedPolicy.map(p => `Source-linked policy (${p.sourceId}): ${p.statement}`), `Analyst inference: ${remedy.inference}`, `Next step: ${remedy.nextStep}`, `Uncertainty: ${remedy.uncertainty}`, remedy.fallbackReason ?? ''] : []), '', JSON.stringify({ tavily: packet.proof ?? null, nvidia: remedy?.proof ?? null }, null, 2)];
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/markdown' }));
    const a = document.createElement('a'); a.href = url; a.download = 'marginguard-policy-evidence.md'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="card policy-card"><div className="section-title"><div><span className="eyebrow"><Globe2 size={15} /> POLICY EVIDENCE · TAVILY</span><h2>Check the suggested fix against official policy.</h2></div><span className={`mode-pill ${packet?.mode === 'live' ? 'live' : ''}`}><i />{packet ? packet.mode === 'live' ? 'Live Tavily result' : 'Saved result' : tavilyConfigured ? 'Live search available' : 'Saved results'}</span></div><p className="method-text">Tavily finds the official discount or shipping policy for your context. Code decides the next check. Nemotron on Nebius drafts it with citations.</p>
    {!supported.length ? <p className="method-text">No discount or shipping findings are available in this dataset. Return analysis remains a local evidence workflow.</p> : <><div className="policy-form"><label>Finding<select aria-label="Policy finding" value={issueId} disabled={!!busy} onChange={e => { setIssueId(e.target.value); clear(); }}>{supported.map(i => <option key={i.id} value={i.id}>{i.kind === 'discount' ? 'Stacked discounts' : 'Shipping overrun'}</option>)}</select></label><label>Platform<select aria-label="Store platform" value={context.platform} disabled={!!busy} onChange={e => { setContext({ ...context, platform: e.target.value as ResearchContext['platform'] }); clear(); }}><option>Shopify</option><option>WooCommerce</option></select></label><label>Carrier<select aria-label="Shipping carrier" value={context.carrier} disabled={!!busy} onChange={e => { setContext({ ...context, carrier: e.target.value as ResearchContext['carrier'] }); clear(); }}><option>USPS</option><option>UPS</option></select></label><label>Discount origin<select aria-label="Discount origin" value={context.discountOrigin} disabled={!!busy || issue?.kind !== "discount"} onChange={e => { setContext({ ...context, discountOrigin: e.target.value as ResearchContext["discountOrigin"] }); clear(); }}><option value="unknown">Unknown · on hold</option><option value="native">Automatic / code</option><option value="manual">Manual / POS / draft</option><option value="scripts-api">Shopify Scripts (legacy, confirmed)</option><option value="app">App (mechanism unknown) · on hold</option></select></label><label>Operating region<select aria-label="Operating region" value={context.region} disabled={!!busy} onChange={e => { setContext({ ...context, region: e.target.value as ResearchContext["region"] }); clear(); }}><option value="US">United States</option><option value="UK">United Kingdom · on hold</option><option value="unknown">Unknown · on hold</option></select></label></div><div className="policy-actions"><button className={`button ${tavilyConfigured ? 'secondary' : 'primary'}`} disabled={!!busy} onClick={() => search(false)}><BookOpen size={15} />Show saved policy result</button>{tavilyConfigured ? <button className="button primary" disabled={!!busy || !consent} onClick={() => search(true)}>{busy === 'search' ? <LoaderCircle size={15} className="spin" /> : <Search size={15} />}Search official policies</button> : null}</div>{tavilyConfigured ? <><label className="consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />Allow generic context queries to Tavily and, when requested, aggregate evidence plus short source excerpts to Nebius. Live calls may use credits.</label><p className="caption">No customer details, order IDs, product names, costs, or raw CSV enter a search query.</p></> : <p className="live-note">Live Tavily search runs locally with your keys.</p>}</>}
    {error ? <div className="fallback-note" role="alert">{error}</div> : null}
    {packet ? <div className="policy-results"><div className="policy-query"><span className="eyebrow">SEARCH QUERY · NO STORE DATA</span><code>{packet.query}</code><span className="caption">{packet.checkedAt ? `Retrieved ${packet.checkedAt}` : 'Saved result · no live search ran'}</span></div><p className="caption">{packet.note}</p>{decision && issue ? <PolicyDecisionCard headingRef={decisionHeading} issue={issue} packet={packet} decision={decision} assumptions={analysis.assumptions} /> : null}{packet.sources.map(s => <details className="policy-source" key={s.id} open={decision?.sourceIds.includes(s.id) || (!decision?.sourceIds.length && packet.sources[0]?.id === s.id)}><summary><span className="source-id">{s.id}</span><strong>{s.title}</strong><ExternalLink size={14} /></summary><div><span className="source-host">{new URL(s.url).hostname}</span><p>{s.snippet}</p>{s.savedAt ? <small>Saved {s.savedAt} · paraphrased summary of the official page</small> : null}<a href={s.url} target="_blank" rel="noopener noreferrer">Open official source <ArrowUpRight size={13} /></a><small>Published: {s.publishedDate ?? 'not returned'} · check the effective date on the source</small></div></details>)}{packet.proof ? <p className="proof"><Check size={15} />Tavily request {packet.proof.requestId ?? 'ID not returned'} · {packet.proof.latencyMs} ms observed · credits {packet.proof.usageCredits ?? 'not returned'}</p> : null}
    {issue?.kind === 'discount' && packet.kind === 'discount' ? <PolicyTestLab packet={packet} dataset={{ fingerprint: analysis.fingerprint, synthetic: analysis.synthetic, currency: analysis.currency, assumptions: analysis.assumptions, finding: issue }} /> : null}
    {packet.sources.length ? <><div className="policy-input-evidence"><span>FROM YOUR CSV · UNCHANGED BY POLICY</span><strong>{issue ? preciseMoney(issue.exposure) : '—'} exposure</strong><small>{issue?.rowIds.length} source rows · the policy never changes the dollars</small></div><div className="policy-actions"><button className={`button ${liveDraft ? 'secondary' : 'primary'}`} disabled={!!busy} onClick={() => draft(false)}><LayersIcon />Draft offline checks</button>{liveDraft ? <button className="button primary" disabled={!!busy || !consent || packet.status !== 'ok' || decision?.status === "hold" || decision?.status === "insufficient"} onClick={() => draft(true)}>{busy === 'model' ? <LoaderCircle size={15} className="spin" /> : <Sparkles size={15} />}Draft with Nemotron</button> : null}</div>{liveDraft ? null : <p className="live-note">{nvidiaConfigured ? 'Nemotron drafts need a live search result.' : 'Live Nemotron drafts run locally with your keys.'}</p>}</> : null}
    {remedy ? <PolicyDraftCard remedy={remedy} packet={packet} /> : null}<button className="text-button policy-export" onClick={exportPolicy}><ArrowDownToLine size={15} />Export policy evidence</button></div> : null}
    {supported.length ? <Limits items={['Official policy can show that a fix won’t work. It cannot show why your numbers look this way.', 'You supply the discount origin and region. This demo has no store connection.', 'Check account eligibility and the policy’s effective date on the cited source before acting.', 'Modeled exposure is an estimate, not realized savings.']} /> : null}
  </section>;
}
function LayersIcon() { return <BookOpen size={15} />; }
