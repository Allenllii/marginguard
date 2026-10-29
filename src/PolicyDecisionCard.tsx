import type { Issue, PolicyDecision, ResearchPacket } from '../shared/types';
import { preciseMoney } from '../shared/types';
import type { Assumptions } from '../shared/assumptions';

export default function PolicyDecisionCard({ issue, packet, decision, assumptions }: { issue: Issue; packet: ResearchPacket; decision: PolicyDecision; assumptions: Assumptions }) {
  return <section aria-label="Evidence and next check" className={`decision-card ${decision.status}`}>
    <div className="section-title"><div><span className="eyebrow">EVIDENCE TO NEXT CHECK</span><h3>Rule-based next check</h3></div><strong className="decision-status">{({ review: 'Supported for review', hold: 'Hold · context needed', contradicted: 'Initial settings fix contradicted', insufficient: 'Insufficient evidence' })[decision.status]}</strong></div>
    {issue.kind === 'discount' ? <div className="initial-hypothesis">Initial hypothesis: review combination settings. An applicable policy exception can redirect this check.</div> : null}
    {decision.status === 'contradicted' ? <div className="decision-change" aria-label="Policy changes the investigation"><p>Same {issue.rowIds.length} CSV rows. Same {preciseMoney(issue.exposure)} modeled exposure. Policy changes the investigation, not the numbers.</p><div><span>Initial hypothesis<strong>Review combination settings</strong></span><span>Evidence-conditioned next check<strong>{decision.nextCheck}</strong></span></div><small>{packet.mode === 'fixture' ? 'Offline authored summary; no current retrieval or model call.' : 'Retrieved source evidence; rule-based routing, subject to applicability.'}</small></div> : null}
    <dl><dt>CSV fact</dt><dd>{issue.rowIds.length} flagged rows; {preciseMoney(issue.exposure)} modeled exposure.</dd>
      <dt>Seller assumption</dt><dd>{issue.kind === 'discount' ? `${assumptions.discountCeilingPercent}% discount ceiling` : `${preciseMoney(assumptions.shippingSubsidyCents)} shipping allowance`} — no guarantee of recovery.</dd>
      <dt>Policy constraint</dt><dd>{decision.constraint} {decision.sourceIds.map(id => { const source = packet.sources.find(s => s.id === id); return source ? <a key={id} href={source.url} target="_blank" rel="noopener noreferrer" className="source-citation">[{id}]</a> : null; })}</dd>
      <dt>Next check</dt><dd data-testid="decision-next-check">{decision.nextCheck}</dd>
      <dt>What would disprove it</dt><dd>{decision.disprove}</dd></dl>
    <p className="caption">This check follows the selected context and visible policy passage. It does not establish the anomaly cause, account eligibility or policy effective date. Inspect the cited source before acting.</p>
  </section>;
}
