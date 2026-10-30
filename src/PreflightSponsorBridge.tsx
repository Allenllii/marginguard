import { useEffect, useRef, useState } from 'react';
import { PREFLIGHT_FIXTURE, runPreflight, withThresholdBasket, type PreflightInput, type PreflightResult, type PreflightRule } from '../shared/preflight';
import { checkInterpretation, parsePreflightBridgeReply, PREFLIGHT_POLICY_URL, recordedModelOutput, RECORDED_INTERPRETATION, safeBridgeMessage, SYNTHETIC_CAMPAIGN, type PreflightBridgeReply, type UnmodeledCondition } from '../shared/preflight-bridge-response';
import './preflight-sponsor-bridge.css';

export interface BridgeAudit {
  mode: 'fixture' | 'live'; model: string | null; receivedAt: string; confirmedAt: string;
  providerAttempts: number; sources: { id: string; title: string; url: string; snippet: string }[];
  boundary: string;
  /** Set when the untouched sample basket was swapped for the synthetic threshold basket. */
  syntheticBasket?: string;
  /** Present only for the offline replay of a recorded Nemotron run. Not proof of a live call. */
  replay?: { model: string; requestId: string; recordedOn: string; campaign: string; unmodeledConditions: UnmodeledCondition[]; source: string };
}
type Proposal = { mode: 'fixture'; rules: PreflightRule[]; receivedAt: string }
  | { mode: 'recorded'; rules: PreflightRule[]; unmodeled: UnmodeledCondition[]; receivedAt: string }
  | { mode: 'live'; packet: PreflightBridgeReply; receivedAt: string };

const usd = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const CONDITION_LABELS: Record<UnmodeledCondition, string> = { customer_segment: 'customer segment (e.g. VIPs only)', date_window: 'date window', product_subset: 'specific products or collections', usage_limit: 'usage limit', discount_code: 'discount code', other: 'another condition' };
/** Seller-readable rule, with the exact integer value the engine will use in brackets. */
function describeRule(rule: PreflightRule) {
  const what = rule.type === 'percent' ? `${rule.basisPoints / 100}% ${rule.scope} discount [${rule.basisPoints} bp]` : rule.type === 'fixed' ? `${usd(rule.amountCents)} off [${rule.amountCents} cents]` : 'Free shipping';
  const when = [rule.minSubtotalCents ? `subtotal at least ${usd(rule.minSubtotalCents)} [${rule.minSubtotalCents} cents]` : '', rule.minItems ? `at least ${rule.minItems} items` : ''].filter(Boolean).join(' and ');
  return `${rule.id}: ${what}${when ? ` · when ${when}` : ' · no minimum'}`;
}
/** Synthetic basket the confirmation will use instead of the sample basket, if any. Pure; safe on invalid drafts. */
function thresholdBasket(getInput: () => PreflightInput, rules: PreflightRule[]) {
  try { return withThresholdBasket({ ...getInput(), rules }); } catch { return null; }
}
const basketNote = (input: PreflightInput) => `Simulated on a synthetic basket so every threshold can fire: ${input.skus.map(sku => `${sku.id} at ${usd(sku.priceCents)} (unit cost ${usd(sku.unitCostCents)})`).join(', ')}, quantity 1–${input.maxQuantity}. Not your data.`;
const REVIEW_LABEL = 'I reviewed these rules, their order, thresholds and stacking, and approve a simulation only';
const recordedLabel = `Recorded Nemotron 3 Super interpretation (request ${RECORDED_INTERPRETATION.requestId}, ${RECORDED_INTERPRETATION.recordedOn}), replayed offline`;

export default function PreflightSponsorBridge({ getInput, onConfirmed, active }: {
  getInput: () => PreflightInput; onConfirmed: (result: PreflightResult, audit: BridgeAudit) => void; active: boolean;
}) {
  const [campaign, setCampaign] = useState<string>(RECORDED_INTERPRETATION.campaign), [available, setAvailable] = useState(false);
  const [context, setContext] = useState(false), [consent, setConsent] = useState(false), [reviewed, setReviewed] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null), [message, setMessage] = useState('Optional policy-assisted preparation. Opening this section sends no request.');
  const [busy, setBusy] = useState(false);
  const [reviewEvidence, setReviewEvidence] = useState<NonNullable<PreflightBridgeReply['policy']>['reviewEvidence']>();
  const generation = useRef(0), pending = useRef<AbortController | null>(null), panel = useRef<HTMLDetailsElement>(null);
  const livePermit = useRef(false), confirmationPermit = useRef(false);
  function clear() { generation.current++; pending.current?.abort(); pending.current = null; livePermit.current = false; confirmationPermit.current = false; setBusy(false); setProposal(null); setReviewEvidence(undefined); setReviewed(false); setConsent(false); }
  useEffect(() => () => { generation.current++; pending.current?.abort(); }, []);
  useEffect(() => { if (!active) { generation.current++; pending.current?.abort(); if (panel.current) panel.current.open = false; } }, [active]);

  async function checkAvailability() {
    clear(); setAvailable(false); const ticket = generation.current, controller = new AbortController(); pending.current = controller; setBusy(true);
    try { const response = await fetch('/api/health', { signal: controller.signal }); const body = await response.json(); if (ticket !== generation.current) return;
      const enabled = response.ok && body.provider?.mode === 'configured' && body.tavily?.mode === 'configured'; setAvailable(enabled);
      setMessage(enabled ? 'Local live configuration is available. No provider call has been made.' : 'Live providers are not configured here. Use the sample proposal.');
    } catch { if (ticket === generation.current) setMessage('Availability check failed. No live preparation is enabled.'); }
    finally { if (ticket === generation.current) setBusy(false); }
  }
  function fixture() {
    clear(); setCampaign(SYNTHETIC_CAMPAIGN);
    const rules = PREFLIGHT_FIXTURE.rules.map((rule, index) => ({ ...rule, id: `R${index + 1}` }));
    setProposal({ mode: 'fixture', rules, receivedAt: new Date().toISOString() });
    setMessage('Sample rules loaded. No search or model call. Review them before the simulation.');
  }
  /** Offline: replay the recorded Super reading through the same gate a live reply passes. */
  function interpretOffline() {
    clear();
    if (campaign.trim().replace(/ +/g, ' ') !== RECORDED_INTERPRETATION.campaign) {
      setMessage('Interpreting new text needs a live Nemotron call, which runs only on a local server with your Tavily and Nebius keys. Offline you can replay the recorded campaign or load the sample proposal.');
      return;
    }
    const checked = checkInterpretation(RECORDED_INTERPRETATION.campaign, recordedModelOutput());
    if (!checked.ok) { setMessage(`On hold: [${checked.code}] ${checked.reason}`); return; }
    setProposal({ mode: 'recorded', rules: checked.rules, unmodeled: checked.unmodeledConditions, receivedAt: new Date().toISOString() });
    setMessage('Recorded interpretation replayed offline: no provider was called. It passed the schema, engine and grounding checks. Review it, then confirm to simulate.');
  }
  async function prepare() {
    if (busy || !available || !context || !consent || !livePermit.current) return;
    clear(); const ticket = generation.current, controller = new AbortController(); pending.current = controller; setBusy(true);
    setMessage('One requested live preparation is in progress. No automatic retry.');
    try {
      const response = await fetch('/api/preflight/prepare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ activity: campaign, context: { platform: 'Shopify', carrier: 'USPS', region: 'US', discountOrigin: 'native' }, live: true }) });
      const value = await response.json(); if (ticket !== generation.current) return;
      if (!response.ok) throw Error(safeBridgeMessage(value.error ?? value.reason, `Preparation held (HTTP ${response.status}). No automatic retry.`));
      const packet = parsePreflightBridgeReply(value); setMessage(packet.reason); setReviewEvidence(packet.policy?.reviewEvidence);
      if (packet.status === 'NEEDS_CONFIRMATION') setProposal({ mode: 'live', packet, receivedAt: new Date().toISOString() });
      else setMessage(`${packet.mode === 'live' ? 'Live attempt · on hold' : 'Offline · on hold'}: ${packet.reason} (${packet.http.attempted} provider calls)`);
    } catch (failure) { if (ticket === generation.current) setMessage(`On hold: ${safeBridgeMessage(failure instanceof Error ? failure.message : null, 'Unsupported response or failed request. No automatic retry.')}`); }
    finally { if (ticket === generation.current) setBusy(false); }
  }
  async function confirm() {
    if (!proposal || !reviewed || busy || !confirmationPermit.current) return;
    confirmationPermit.current = false;
    const ticket = generation.current, controller = new AbortController(); pending.current = controller; setBusy(true); setReviewed(false);
    try {
      const rules = proposal.mode === 'live' ? proposal.packet.rules : proposal.rules;
      const offline = proposal.mode !== 'live';
      // The explicit review covers rule order, thresholds and stacking, so it is the semantics confirmation.
      const reviewed = { ...getInput(), rules }, base = { ...reviewed, evidence: { ...reviewed.evidence, semantics: 'explicit_simulation' as const } };
      const swapped = withThresholdBasket(base), input = swapped ?? base, expected = runPreflight(input);
      if (proposal.mode === 'live') {
        const response = await fetch('/api/preflight/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ proposalId: proposal.packet.proposalId, confirmed: true, input }) });
        const body = await response.json(); if (ticket !== generation.current) return;
        if (!response.ok) throw Error(safeBridgeMessage(body.error, 'Confirmation held. Review a new proposal explicitly.'));
        if (body.sellerConfirmed !== true || body.checkoutVerified !== false || body.providerRequests !== 0 || JSON.stringify(body.simulation) !== JSON.stringify(expected)) throw Error('Confirmation result did not match the deterministic engine.');
      }
      if (ticket !== generation.current) return;
      onConfirmed(expected, { mode: offline ? 'fixture' : 'live', model: proposal.mode === 'live' ? proposal.packet.model : null,
        receivedAt: proposal.receivedAt, confirmedAt: new Date().toISOString(), providerAttempts: proposal.mode === 'live' ? proposal.packet.http.attempted : 0,
        sources: proposal.mode === 'live' ? proposal.packet.policy?.sources ?? [] : [],
        boundary: 'Explicitly confirmed bounded simulation. Policy applicability and real checkout remain unverified; monetary values come only from the integer engine.',
        ...(swapped ? { syntheticBasket: basketNote(swapped) } : {}),
        ...(proposal.mode === 'recorded' ? { replay: { model: RECORDED_INTERPRETATION.model, requestId: RECORDED_INTERPRETATION.requestId, recordedOn: RECORDED_INTERPRETATION.recordedOn, campaign: RECORDED_INTERPRETATION.campaign, unmodeledConditions: proposal.unmodeled, source: 'evidence/live-intent-20261030.json' } } : {}) });
      clear(); setMessage('Rules confirmed for simulation only. Inspect the deterministic audit below.');
    } catch (failure) { if (ticket === generation.current) { setProposal(null); setMessage(`On hold: ${safeBridgeMessage(failure instanceof Error ? failure.message : null, 'Confirmation outcome unknown. No retry was made.')}`); } }
    finally { if (ticket === generation.current) setBusy(false); }
  }
  const rules = proposal?.mode === 'live' ? proposal.packet.rules : proposal?.rules;
  const swapPreview = rules ? thresholdBasket(getInput, rules) : null;
  const unmodeled = proposal?.mode === 'live' ? proposal.packet.unmodeledConditions ?? [] : proposal?.mode === 'recorded' ? proposal.unmodeled : [];
  return <details className="pf-bridge" ref={panel} open onToggle={event => { if (!event.currentTarget.open) clear(); }}>
    <summary>Describe a campaign: Nemotron proposes the rules, Tavily checks the policy page</summary>
    <p className="pf-help">A proposal never changes a store, and code does the money. Live preparation sends only the campaign words and generic policy queries to providers; no basket costs or customer data.</p>
    <label className="pf-field">Campaign description<textarea value={campaign} maxLength={240} onChange={event => { clear(); setCampaign(event.target.value); }} rows={3} /></label>
    <p className="pf-help">Write it the way you would brief a colleague. Nemotron 3 Super turns it into percentage, fixed-amount and free-shipping rules; code checks every number against your words before anything is simulated. Offline, the recorded VIP campaign above replays a real Nemotron reading.</p>
    <div className="pf-bridge-actions"><button type="button" onClick={interpretOffline} disabled={busy}>Interpret campaign (offline replay)</button><button type="button" className="pf-bridge-secondary" onClick={fixture} disabled={busy}>Show sample proposal (offline)</button><button type="button" className="pf-bridge-secondary" onClick={checkAvailability} disabled={busy}>Check live availability</button></div>
    {available ? <>
      <label className="pf-bridge-check"><input type="checkbox" checked={context} onChange={event => { clear(); setContext(event.target.checked); }} />Shopify, US, automatic/code discounts</label>
      <label className="pf-bridge-check"><input type="checkbox" checked={consent} disabled={busy} onChange={event => { livePermit.current = event.target.checked; setConsent(event.target.checked); }} />Allow one live preparation using credits</label>
      <div className="pf-bridge-actions"><button type="button" onClick={prepare} disabled={busy || !context || !consent}>Prepare with Tavily and NVIDIA</button><button type="button" onClick={() => { clear(); setMessage('Preparation cancelled. Already-sent requests may have consumed credits; no retry was made.'); }} disabled={!busy && !proposal && !reviewEvidence}>Cancel preparation</button></div>
    </> : <p className="pf-help">Live preparation runs locally with your Tavily and Nebius keys.</p>}
    <p className="pf-bridge-message" role={message.startsWith('On hold:') ? 'alert' : 'status'}>{message}</p>
    {reviewEvidence ? <section aria-label="Unreviewed policy evidence" className="pf-bridge-proposal">
      <h3>Policy evidence for review · on hold</h3>
      <p>This policy version needs review. Selected excerpts are incomplete; read the full policy and resolve all conflicts. No campaign rules were proposed.</p>
      {reviewEvidence.quotes.map(quote => <blockquote key={quote.start}><p>{quote.text}</p><p className="pf-help">Received extraction range [{quote.start}, {quote.end}) in UTF-16 code units.</p></blockquote>)}
      <p><a href={reviewEvidence.url} target="_blank" rel="noopener noreferrer">Read the complete official policy</a> · Retrieved {reviewEvidence.retrievedAt}</p>
      <p>Confirm the policy version and effective date, store eligibility, combination settings and actual checkout behavior before proceeding.</p>
      <details><summary>Advanced: evidence fingerprint</summary><p>SHA-256: <code>{reviewEvidence.bodySha256}</code> · {reviewEvidence.bodyLength} UTF-16 code units. This fingerprint identifies received text; it does not authenticate the source or establish policy validity.</p></details>
    </section> : null}
    {proposal && rules ? <section aria-label="Proposed campaign rules" className="pf-bridge-proposal">
      <h3>{proposal.mode === 'fixture' ? 'Offline sample proposal' : proposal.mode === 'recorded' ? recordedLabel : 'Live Nemotron proposal · needs your confirmation'}</h3>
      {proposal.mode === 'recorded' ? <p className="pf-help">Campaign: “{RECORDED_INTERPRETATION.campaign}”. The local parser cannot read this free-form text, so these rules are Nemotron&apos;s reading ({RECORDED_INTERPRETATION.model}). Every value appears in the campaign text.</p> : null}
      <ol>{rules.map(rule => <li key={rule.id}>{describeRule(rule)}</li>)}</ol>
      {swapPreview ? <p className="pf-bridge-unmodeled" data-testid="preflight-threshold-basket">The one-item {usd(PREFLIGHT_FIXTURE.skus[0].priceCents)} sample never reaches a threshold above. {basketNote(swapPreview)}</p> : null}
      {unmodeled.length ? <p className="pf-bridge-unmodeled" data-testid="preflight-unmodeled">Not simulated: {unmodeled.map(condition => CONDITION_LABELS[condition]).join(', ')}. The simulation applies the rules to every basket, so check who actually qualifies.</p> : null}
      {proposal.mode === 'recorded' ? <p>Recorded on {RECORDED_INTERPRETATION.recordedOn} with live Tavily and Nebius calls; replayed here with no provider call. <a href={PREFLIGHT_POLICY_URL} target="_blank" rel="noopener noreferrer">Reference policy</a></p> : proposal.mode === 'live' ? <><p>Model: {proposal.packet.model} · {proposal.packet.http.attempted} provider calls. Browser received {proposal.receivedAt}; policy effective date unverified.</p><p className="pf-help">{proposal.packet.policy?.reason} Read the complete policy and check your store settings. A reference permits hypothetical preparation only; it does not clear a campaign for launch.</p>{proposal.packet.policy?.sources.map(source => <blockquote key={source.id}><p>{source.snippet}</p><a href={source.url} target="_blank" rel="noopener noreferrer">[{source.id}] Open official policy</a></blockquote>)}</> : <p>Sample rules written for this demo; no search or model call. <a href={PREFLIGHT_POLICY_URL} target="_blank" rel="noopener noreferrer">Reference policy</a></p>}
      <p className="pf-help">{proposal.mode === 'live' ? 'Live confirmation sends the current synthetic or seller-entered basket inputs to this app server for integer calculation. They are not sent to providers.' : 'Confirmation runs the integer engine in this browser; nothing is sent.'} Confirmation applies these rules only to the sandbox; real checkout stays on hold.</p>
      <label className="pf-bridge-check"><input type="checkbox" checked={reviewed} onChange={event => { confirmationPermit.current = event.target.checked; setReviewed(event.target.checked); }} disabled={busy} />{REVIEW_LABEL}</label>
      <button type="button" onClick={confirm} disabled={!reviewed || busy}>Confirm proposed rules</button>
    </section> : null}
  </details>;
}
