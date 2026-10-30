import { useEffect, useRef, useState } from 'react';
import { PREFLIGHT_FIXTURE, runPreflight, type PreflightInput, type PreflightResult, type PreflightRule } from '../shared/preflight';
import { parsePreflightBridgeReply, PREFLIGHT_POLICY_URL, safeBridgeMessage, SYNTHETIC_CAMPAIGN, type PreflightBridgeReply } from '../shared/preflight-bridge-response';
import './preflight-sponsor-bridge.css';

export interface BridgeAudit {
  mode: 'fixture' | 'live'; model: string | null; receivedAt: string; confirmedAt: string;
  providerAttempts: number; sources: { id: string; title: string; url: string; snippet: string }[];
  boundary: string;
}
type Proposal = { mode: 'fixture'; rules: PreflightRule[]; receivedAt: string } | { mode: 'live'; packet: PreflightBridgeReply; receivedAt: string };

export default function PreflightSponsorBridge({ getInput, onConfirmed, active }: {
  getInput: () => PreflightInput; onConfirmed: (result: PreflightResult, audit: BridgeAudit) => void; active: boolean;
}) {
  const [campaign, setCampaign] = useState(SYNTHETIC_CAMPAIGN), [available, setAvailable] = useState(false);
  const [context, setContext] = useState(false), [consent, setConsent] = useState(false), [reviewed, setReviewed] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null), [message, setMessage] = useState('Optional policy-assisted preparation. Opening this section sends no request.');
  const [busy, setBusy] = useState(false);
  const generation = useRef(0), pending = useRef<AbortController | null>(null), panel = useRef<HTMLDetailsElement>(null);
  const livePermit = useRef(false), confirmationPermit = useRef(false);
  function clear() { generation.current++; pending.current?.abort(); pending.current = null; livePermit.current = false; confirmationPermit.current = false; setBusy(false); setProposal(null); setReviewed(false); setConsent(false); }
  useEffect(() => () => { generation.current++; pending.current?.abort(); }, []);
  useEffect(() => { if (!active) { generation.current++; pending.current?.abort(); if (panel.current) panel.current.open = false; } }, [active]);

  async function checkAvailability() {
    clear(); setAvailable(false); const ticket = generation.current, controller = new AbortController(); pending.current = controller; setBusy(true);
    try { const response = await fetch('/api/health', { signal: controller.signal }); const body = await response.json(); if (ticket !== generation.current) return;
      const enabled = response.ok && body.provider?.mode === 'configured' && body.tavily?.mode === 'configured'; setAvailable(enabled);
      setMessage(enabled ? 'Local live configuration is available. No provider call has been made.' : 'Live providers are unavailable. Use the clearly labeled synthetic proposal.');
    } catch { if (ticket === generation.current) setMessage('Availability check failed. No live preparation is enabled.'); }
    finally { if (ticket === generation.current) setBusy(false); }
  }
  function fixture() {
    clear(); setCampaign(SYNTHETIC_CAMPAIGN);
    const rules = PREFLIGHT_FIXTURE.rules.map((rule, index) => ({ ...rule, id: `R${index + 1}` }));
    setProposal({ mode: 'fixture', rules, receivedAt: new Date().toISOString() });
    setMessage('Authored rules loaded. No retrieval or model call. Review before simulation.');
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
      const packet = parsePreflightBridgeReply(value); setMessage(packet.reason);
      if (packet.status === 'NEEDS_CONFIRMATION') setProposal({ mode: 'live', packet, receivedAt: new Date().toISOString() });
      else setMessage(`${packet.mode === 'live' ? 'Live attempt · HOLD' : 'Offline · HOLD'}: ${packet.reason} (${packet.http.attempted} provider attempts)`);
    } catch (failure) { if (ticket === generation.current) setMessage(`HOLD: ${safeBridgeMessage(failure instanceof Error ? failure.message : null, 'Unsupported response or failed request. No automatic retry.')}`); }
    finally { if (ticket === generation.current) setBusy(false); }
  }
  async function confirm() {
    if (!proposal || !reviewed || busy || !confirmationPermit.current) return;
    confirmationPermit.current = false;
    const ticket = generation.current, controller = new AbortController(); pending.current = controller; setBusy(true); setReviewed(false);
    try {
      const rules = proposal.mode === 'live' ? proposal.packet.rules : proposal.rules;
      const input = { ...getInput(), rules }, expected = runPreflight(input);
      if (proposal.mode === 'live') {
        const response = await fetch('/api/preflight/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ proposalId: proposal.packet.proposalId, confirmed: true, input }) });
        const body = await response.json(); if (ticket !== generation.current) return;
        if (!response.ok) throw Error(safeBridgeMessage(body.error, 'Confirmation held. Review a new proposal explicitly.'));
        if (body.sellerConfirmed !== true || body.checkoutVerified !== false || body.providerRequests !== 0 || JSON.stringify(body.simulation) !== JSON.stringify(expected)) throw Error('HOLD: confirmation result did not match the deterministic engine.');
      }
      if (ticket !== generation.current) return;
      onConfirmed(expected, { mode: proposal.mode, model: proposal.mode === 'live' ? proposal.packet.model : null,
        receivedAt: proposal.receivedAt, confirmedAt: new Date().toISOString(), providerAttempts: proposal.mode === 'live' ? proposal.packet.http.attempted : 0,
        sources: proposal.mode === 'live' ? proposal.packet.policy?.sources ?? [] : [],
        boundary: 'Explicitly confirmed bounded simulation. Policy applicability and real checkout remain unverified; monetary values come only from the integer engine.' });
      clear(); setMessage('Rules confirmed for simulation only. Inspect the deterministic audit below.');
    } catch (failure) { if (ticket === generation.current) { setProposal(null); setMessage(`HOLD: ${safeBridgeMessage(failure instanceof Error ? failure.message : null, 'Confirmation outcome unknown. No retry was made.')}`); } }
    finally { if (ticket === generation.current) setBusy(false); }
  }
  const rules = proposal?.mode === 'live' ? proposal.packet.rules : proposal?.rules;
  return <details className="pf-bridge" ref={panel} onToggle={event => { if (!event.currentTarget.open) clear(); }}>
    <summary>Review a campaign with policy evidence</summary>
    <p className="pf-help">A proposal never changes a store. The money engine stays deterministic. Live preparation sends only restricted campaign words and generic policy queries; no basket costs or customer data go to providers.</p>
    <label className="pf-field">Campaign description<textarea value={campaign} maxLength={240} onChange={event => { clear(); setCampaign(event.target.value); }} rows={3} /></label>
    <p className="pf-help">Supported: product/order percentage discounts and free shipping, separated by “then”. Fixture preview loads the fixed synthetic example.</p>
    <div className="pf-bridge-actions"><button type="button" onClick={fixture} disabled={busy}>Preview synthetic proposal</button><button type="button" onClick={checkAvailability} disabled={busy}>Check live availability</button></div>
    <label className="pf-bridge-check"><input type="checkbox" checked={context} onChange={event => { clear(); setContext(event.target.checked); }} />Shopify, US, automatic/code discounts</label>
    <label className="pf-bridge-check"><input type="checkbox" checked={consent} disabled={!available || busy} onChange={event => { livePermit.current = event.target.checked; setConsent(event.target.checked); }} />Allow one live preparation using credits</label>
    <div className="pf-bridge-actions"><button type="button" onClick={prepare} disabled={busy || !available || !context || !consent}>Prepare with Tavily and NVIDIA</button><button type="button" onClick={() => { clear(); setMessage('Preparation cancelled. Already-sent requests may have consumed credits; no retry was made.'); }} disabled={!busy && !proposal}>Cancel preparation</button></div>
    <p className="pf-bridge-message" role={message.startsWith('HOLD:') ? 'alert' : 'status'}>{message}</p>
    {proposal && rules ? <section aria-label="Proposed campaign rules" className="pf-bridge-proposal">
      <h3>{proposal.mode === 'fixture' ? 'Offline synthetic proposal' : 'Live server response · NEEDS_CONFIRMATION'}</h3>
      <ol>{rules.map(rule => <li key={rule.id}>{rule.type === 'percent' ? `${rule.basisPoints / 100}% ${rule.scope} discount` : rule.type === 'free_shipping' ? 'Free shipping' : `${rule.amountCents} cents fixed discount`} · minimums {rule.minSubtotalCents} cents / {rule.minItems} items</li>)}</ol>
      {proposal.mode === 'live' ? <><p>Model: {proposal.packet.model} · {proposal.packet.http.attempted} provider attempts. Browser received {proposal.receivedAt}; policy effective date unverified.</p>{proposal.packet.policy?.sources.map(source => <blockquote key={source.id}><p>{source.snippet}</p><a href={source.url} target="_blank" rel="noopener noreferrer">[{source.id}] Open official policy</a></blockquote>)}</> : <p>Authored fixture; no search, extraction, model, live request ID or retrieval time. <a href={PREFLIGHT_POLICY_URL} target="_blank" rel="noopener noreferrer">Reference policy</a></p>}
      <p className="pf-help">Live confirmation sends the current synthetic or seller-entered basket inputs to this app server for integer calculation. They are not sent to providers. Confirmation applies these rules only to the sandbox; real checkout remains HOLD.</p>
      <label className="pf-bridge-check"><input type="checkbox" checked={reviewed} onChange={event => { confirmationPermit.current = event.target.checked; setReviewed(event.target.checked); }} disabled={busy} />I reviewed these rules and approve a simulation only</label>
      <button type="button" onClick={confirm} disabled={!reviewed || busy}>Confirm proposed rules</button>
    </section> : null}
  </details>;
}
