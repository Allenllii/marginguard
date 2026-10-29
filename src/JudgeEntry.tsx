import { ArrowRight, CornerDownRight, FileCheck2 } from 'lucide-react';
import type { Issue } from '../shared/types';
import { preciseMoney } from '../shared/types';

export default function JudgeEntry({ issue, ceiling, busy, open }: { issue: Issue; ceiling: number; busy: boolean; open: () => void }) {
  return <section className="card judge-entry" aria-label="Policy counterexample demo">
    <div className="case-main"><div className="case-provenance"><span><FileCheck2 size={15} /> Synthetic investigation</span><span>Offline source preview</span></div>
      <h2>A policy exception changes the next check.</h2>
      <p className="case-description">The CSV flags the discount exposure. The seller supplies the origin. A documented exception redirects the investigation.</p>
      <button className="button case-start" disabled={busy} onClick={open}>See the discount policy counterexample<ArrowRight size={17} /></button>
      <div className="case-flow"><div className="case-state initial"><span>Initial hypothesis</span><strong>Review combination settings</strong><small>Before checking the selected discount origin</small></div><CornerDownRight className="case-connector" aria-hidden="true" size={26} /><div className="case-state changed"><span>Changed next check</span><strong>Audit manual overrides</strong><small>When the manual-discount exception applies</small></div></div>
    </div>
    <aside className="case-ledger" aria-label="Synthetic case facts"><span className="case-ledger-label">The evidence boundary</span><dl><div><dt>CSV evidence</dt><dd>{issue.rowIds.length} flagged rows</dd></div><div><dt>Modeled exposure</dt><dd className="case-amount">{preciseMoney(issue.exposure)}</dd></div><div><dt>Seller assumption</dt><dd>{ceiling}% discount ceiling</dd></div><div><dt>Policy reference</dt><dd>Shopify discount combinations</dd></div></dl><p>No current search or model call. Authored policy summary; rule-based routing. Exposure is hypothetical, not recovered revenue.</p></aside>
  </section>;
}
