import type { Issue, PolicyDecision, ResearchPacket } from '../shared/types';
import { preciseMoney } from '../shared/types';
import type { Assumptions } from '../shared/assumptions';
import type { Ref } from 'react';
import { ArrowUp } from 'lucide-react';

export const decisionLabels: Record<PolicyDecision['status'], string> = {
  review: 'Supported for review',
  hold: 'On hold — needs more evidence',
  contradicted: 'Policy says the suggested fix won’t work',
  insufficient: 'Not enough evidence',
};

export default function PolicyDecisionCard({ issue, packet, decision, assumptions, headingRef, onChangeOrigin }: { issue: Issue; packet: ResearchPacket; decision: PolicyDecision; assumptions: Assumptions; headingRef?: Ref<HTMLHeadingElement>; onChangeOrigin?: () => void }) {
  return <section aria-label="Evidence and next check" className={`decision-card ${decision.status}`}>
    <div className="section-title"><div><span className="eyebrow">EVIDENCE TO NEXT CHECK</span><h3 ref={headingRef} tabIndex={-1}>Rule-based next check</h3></div><strong className="decision-status">{decisionLabels[decision.status]}</strong></div>
    {onChangeOrigin && issue.kind === 'discount' ? <button type="button" className="text-button decision-origin" onClick={onChangeOrigin}>Switch discount origin<ArrowUp size={14} aria-hidden="true" /></button> : null}
    {issue.kind === 'discount' && decision.status !== 'contradicted' ? <div className="initial-hypothesis">Suggested fix: review discount-combination settings.</div> : null}
    {decision.status === 'contradicted' ? <div className="decision-change" aria-label="Policy changes the investigation"><p>Same {issue.rowIds.length} CSV rows. Same {preciseMoney(issue.exposure)} modeled exposure. The policy changes the next action, not the numbers.</p><div><span>Suggested fix<strong>Review combination settings</strong></span><span>Next check after policy<strong>{decision.nextCheck}</strong></span></div><small>{packet.mode === 'fixture' ? 'Saved policy summary; no live call in this view.' : 'Live policy result; code applied the rule.'}</small></div> : null}
    <dl><dt>CSV fact</dt><dd>{issue.rowIds.length} flagged rows; {preciseMoney(issue.exposure)} modeled exposure.</dd>
      <dt>Seller assumption</dt><dd>{issue.kind === 'discount' ? `${assumptions.discountCeilingPercent}% discount ceiling` : `${preciseMoney(assumptions.shippingSubsidyCents)} shipping allowance`}</dd>
      <dt>What the policy says</dt><dd>{decision.constraint} {decision.sourceIds.map(id => { const source = packet.sources.find(s => s.id === id); return source ? <a key={id} href={source.url} target="_blank" rel="noopener noreferrer" className="source-citation">[{id}]</a> : null; })}</dd>
      <dt>Next check</dt><dd data-testid="decision-next-check">{decision.nextCheck}</dd>
      <dt>What would change this</dt><dd>{decision.disprove}</dd></dl>
  </section>;
}
