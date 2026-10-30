import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpRight, BookOpen, Check, ExternalLink, Globe2, LoaderCircle, Search, Sparkles } from 'lucide-react';
import type { Analysis, Remediation, ResearchContext, ResearchPacket } from '../shared/types';
import { preciseMoney } from '../shared/types';
import { decidePolicy } from '../shared/policy-decision';
import PolicyDecisionCard, { decisionLabels } from './PolicyDecisionCard';
import PolicyDraftCard from './PolicyDraftCard';
import PolicyTestLab from './PolicyTestLab';
import Limits from './Limits';

// Optional fields added to ResearchPacket by the retrieval upgrade; typed here so
// this component renders nothing when a packet predates them.
type RetrievalStep = { op: 'search' | 'extract'; url?: string; requestId?: string; credits?: number; latencyMs?: number; ok: boolean };
type PacketProvenance = { retrieval?: { steps?: RetrievalStep[] }; policyChanged?: { url: string; reviewedAt: string } };
const host = (url: string) => { try { return new URL(url).hostname; } catch { return url; } };
const shortId = (id: string) => id.length > 12 ? `${id.slice(0, 8)}…` : id;
function RetrievalSteps({ steps }: { steps: RetrievalStep[] }) {
  const ops = steps.map(step => step.op === 'search' ? 'Search' : 'Extract').filter((op, i, all) => op !== all[i - 1]);
  return <div className="retrieval-steps"><span className="eyebrow">TAVILY {ops.join(' → ').toUpperCase()}</span><ol aria-label="Tavily retrieval steps">{steps.map((step, index) => <li key={index} className={step.ok ? 'ok' : 'failed'}>
    <strong>{step.op === 'search' ? 'Search' : 'Extract'}</strong>{step.url ? <span>{host(step.url)}</span> : null}
    <span>{step.requestId ? <>request <code title={step.requestId}>{shortId(step.requestId)}</code></> : 'no request ID'}</span>
    {typeof step.credits === 'number' ? <span>{step.credits} credit{step.credits === 1 ? '' : 's'}</span> : null}
    {typeof step.latencyMs === 'number' ? <span>{step.latencyMs} ms</span> : null}
    <span className="step-status">{step.ok ? 'ok' : 'failed'}</span>
  </li>)}</ol></div>;
}

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
  // 'saved' is a same-origin replay with no provider call; it never locks the context selects.
  const [busy, setBusy] = useState<'saved' | 'search' | 'model' | null>(null);
  const [consent, setConsent] = useState(false);
  const [labOpen, setLabOpen] = useState(false);
  const [error, setError] = useState('');
  const decisionHeading = useRef<HTMLHeadingElement>(null);
  const originSelect = useRef<HTMLSelectElement>(null);
  const focusOrigin = () => { originSelect.current?.scrollIntoView({ block: 'center' }); originSelect.current?.focus({ preventScroll: true }); };
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
  const provenance = packet as (ResearchPacket & PacketProvenance) | null;
  const steps = Array.isArray(provenance?.retrieval?.steps) ? provenance.retrieval.steps : [];
  const changed = provenance?.policyChanged?.url ? provenance.policyChanged : null;
  // Only the recorded manual-discount replay has a recorded Nemotron draft
  // (server/nebius.ts recordedRemediation); other saved packets get authored checks.
  const recordedDraft = packet?.mode === 'fixture' && !packet.proof && steps.length > 0 && packet.kind === 'discount' && packet.context.discountOrigin === 'manual';
  const lockContext = busy === 'search' || busy === 'model';
  const clear = () => { requestVersion.current++; controller.current?.abort(); setPacket(null); setRemedy(null); setError(''); setBusy(null); };
  async function search(live: boolean, nextContext = context, target = issue) {
    if (!target) return;
    const version = ++requestVersion.current;
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    setBusy(live ? 'search' : 'saved'); setError(''); setRemedy(null); setPacket(null);
    try { const result = await post<ResearchPacket>('/api/research', { kind: target.kind, context: nextContext, live }, abort.signal); if (version === requestVersion.current) setPacket(result); }
    catch (e) { if (!abort.signal.aborted && version === requestVersion.current) setError((e as Error).message); } finally { if (version === requestVersion.current) setBusy(null); }
  }
  // Saved results re-run at once (no provider call); a live result is cleared and
  // needs an explicit click, because a live search spends credits.
  function change(nextContext: ResearchContext, nextIssueId = issueId) {
    setContext(nextContext); setIssueId(nextIssueId);
    const target = supported.find(i => i.id === nextIssueId);
    if (target && (packet ? packet.mode === 'fixture' : !tavilyConfigured)) void search(false, nextContext, target);
    else clear();
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
    {!supported.length ? <p className="method-text">No discount or shipping findings are available in this dataset. Return analysis remains a local evidence workflow.</p> : <><div className="policy-form"><label>Finding<select aria-label="Policy finding" value={issueId} disabled={lockContext} onChange={e => change(context, e.target.value)}>{supported.map(i => <option key={i.id} value={i.id}>{i.kind === 'discount' ? 'Stacked discounts' : 'Shipping overrun'}</option>)}</select></label><label>Platform<select aria-label="Store platform" value={context.platform} disabled={lockContext} onChange={e => change({ ...context, platform: e.target.value as ResearchContext['platform'] })}><option>Shopify</option><option>WooCommerce</option></select></label><label>Carrier<select aria-label="Shipping carrier" value={context.carrier} disabled={lockContext} onChange={e => change({ ...context, carrier: e.target.value as ResearchContext['carrier'] })}><option>USPS</option><option>UPS</option></select></label><label>Discount origin<select ref={originSelect} aria-label="Discount origin" value={context.discountOrigin} disabled={lockContext || issue?.kind !== "discount"} onChange={e => change({ ...context, discountOrigin: e.target.value as ResearchContext["discountOrigin"] })}><option value="unknown">Unknown · on hold</option><option value="native">Automatic / code</option><option value="manual">Manual / POS / draft</option><option value="scripts-api">Shopify Scripts (retired June 2026) · hold</option><option value="app">App (mechanism unknown) · on hold</option></select></label><label>Operating region<select aria-label="Operating region" value={context.region} disabled={lockContext} onChange={e => change({ ...context, region: e.target.value as ResearchContext["region"] })}><option value="US">United States</option><option value="UK">United Kingdom · on hold</option><option value="unknown">Unknown · on hold</option></select></label></div><div className="policy-actions"><button className={`button ${tavilyConfigured ? 'secondary' : 'primary'}`} disabled={!!busy} onClick={() => search(false)}><BookOpen size={15} />Show saved policy result</button>{tavilyConfigured ? <button className="button primary" disabled={!!busy || !consent} onClick={() => search(true)}>{busy === 'search' ? <LoaderCircle size={15} className="spin" /> : <Search size={15} />}Search official policies</button> : null}</div>{tavilyConfigured ? <><label className="consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />Allow generic context queries to Tavily and, when requested, aggregate evidence plus short source excerpts to Nebius. Live calls may use credits.</label><p className="caption">No customer details, order IDs, product names, costs, or raw CSV enter a search query.</p></> : <p className="live-note">Live Tavily search runs locally with your keys.</p>}</>}
    {/* Stays mounted so a verdict change after a context switch is announced; no role, so it is not another status landmark. */}
    <p className="sr-only" data-testid="decision-announcer" aria-live="polite" aria-atomic="true">{busy ? 'Checking policy…' : decision ? `${decisionLabels[decision.status]}. Next check: ${decision.nextCheck}` : ''}</p>
    {error ? <div className="fallback-note" role="alert">{error}</div> : null}
    {packet ? <div className="policy-results"><div className="policy-query"><span className="eyebrow">SEARCH QUERY · NO STORE DATA</span><code>{packet.query}</code><span className="caption">{packet.checkedAt ? `Retrieved ${packet.checkedAt}` : 'Saved result · no live search ran'}</span></div><p className="caption">{packet.note}</p>{changed ? <p className="policy-changed" role="note"><strong>Official page changed since our review</strong> ({changed.reviewedAt}). <a href={changed.url} target="_blank" rel="noopener noreferrer">Read the current page <ArrowUpRight size={13} /></a> before acting.</p> : null}{decision && issue ? <PolicyDecisionCard headingRef={decisionHeading} onChangeOrigin={focusOrigin} issue={issue} packet={packet} decision={decision} assumptions={analysis.assumptions} /> : null}
    {packet.sources.length ? <><div className="policy-input-evidence"><span>FROM YOUR CSV · UNCHANGED BY POLICY</span><strong>{issue ? preciseMoney(issue.exposure) : '—'} exposure</strong><small>{issue?.rowIds.length} source rows · the policy never changes the dollars</small></div><div className="policy-actions"><button className={`button ${liveDraft ? 'secondary' : 'primary'}`} disabled={!!busy} onClick={() => draft(false)}><LayersIcon />{recordedDraft ? 'Show recorded Nemotron draft' : 'Draft offline checks'}</button>{liveDraft ? <button className="button primary" disabled={!!busy || !consent || packet.status !== 'ok' || decision?.status === "hold" || decision?.status === "insufficient"} onClick={() => draft(true)}>{busy === 'model' ? <LoaderCircle size={15} className="spin" /> : <Sparkles size={15} />}Draft with Nemotron</button> : null}</div>{liveDraft ? null : <p className="live-note">{nvidiaConfigured ? 'Nemotron drafts need a live search result.' : 'Live Nemotron drafts run locally with your keys.'}</p>}</> : null}
    {remedy ? <PolicyDraftCard remedy={remedy} packet={packet} /> : null}
    {packet.sources.map(s => <details className="policy-source" key={s.id} open={decision?.sourceIds.includes(s.id) || (!decision?.sourceIds.length && packet.sources[0]?.id === s.id)}><summary><span className="source-id">{s.id}</span><strong>{s.title}</strong><ExternalLink size={14} /></summary><div><span className="source-host">{new URL(s.url).hostname}</span><p>{s.snippet}</p>{s.savedAt ? <small>Saved {s.savedAt} · summary of the official page</small> : null}<a href={s.url} target="_blank" rel="noopener noreferrer">Open official source <ArrowUpRight size={13} /></a><small>Published: {s.publishedDate ?? 'not returned'}</small></div></details>)}{steps.length ? <RetrievalSteps steps={steps} /> : null}{packet.proof ? <p className="proof"><Check size={15} />Tavily request {packet.proof.requestId ?? 'ID not returned'} · {packet.proof.latencyMs} ms observed · credits {packet.proof.usageCredits ?? 'not returned'}</p> : null}
    {issue?.kind === 'discount' && packet.kind === 'discount' ? <PolicyTestLab open={labOpen} onOpenChange={setLabOpen} packet={packet} dataset={{ fingerprint: analysis.fingerprint, synthetic: analysis.synthetic, currency: analysis.currency, assumptions: analysis.assumptions, finding: issue }} /> : null}
    <button className="text-button policy-export" onClick={exportPolicy}><ArrowDownToLine size={15} />Export policy evidence</button></div> : null}
    {supported.length ? <Limits items={['You supply the discount origin and region (there is no store connection). Check eligibility and the effective date on the cited source before acting.']} /> : null}
  </section>;
}
function LayersIcon() { return <BookOpen size={15} />; }
