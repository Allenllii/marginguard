import { ArrowRight, CornerDownRight, FileCheck2 } from 'lucide-react';
import type { Issue } from '../shared/types';
import { preciseMoney } from '../shared/types';
import Limits from './Limits';

export default function JudgeEntry({ issue, ceiling, busy, open }: { issue: Issue; ceiling: number; busy: boolean; open: () => void }) {
  return <section className="card judge-entry" aria-label="Policy counterexample demo">
    <div className="case-main"><div className="case-provenance"><span><FileCheck2 size={15} /> Synthetic store</span><span>Saved Shopify policy result</span></div>
      <h2>The suggested fix won’t work here. MarginGuard changes the next check.</h2>
      <p className="case-description">The usual fix for stacked discounts is to tighten combination settings. Official Shopify policy says manual and POS discounts skip those settings, so the next check becomes an audit of manual overrides. Same rows, same dollars.</p>
      <button className="button case-start" disabled={busy} onClick={open}>See the discount policy counterexample<ArrowRight size={17} /></button>
      <div className="case-flow"><div className="case-state initial"><span>Suggested fix</span><strong>Review combination settings</strong><small>Before the policy check</small></div><CornerDownRight className="case-connector" aria-hidden="true" size={26} /><div className="case-state changed"><span>Next check after policy</span><strong>Audit manual overrides</strong><small>When discounts are manual, POS or draft orders</small></div></div>
    </div>
    <aside className="case-ledger" aria-label="Synthetic case facts"><span className="case-ledger-label">What stays fixed</span><dl><div><dt>CSV evidence</dt><dd>{issue.rowIds.length} flagged rows</dd></div><div><dt>Modeled exposure</dt><dd className="case-amount">{preciseMoney(issue.exposure)}</dd></div><div><dt>Seller assumption</dt><dd>{ceiling}% discount ceiling</dd></div><div><dt>Who decides</dt><dd>Code owns money and the decision; Nemotron drafts the cited check</dd></div></dl>
      <Limits items={['Modeled exposure is an estimate, not realized savings.', 'You (the seller) supply the discount origin; the CSV cannot show it.', 'This hero uses a saved policy summary. No live search or model call runs here.']} /></aside>
  </section>;
}
