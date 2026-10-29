import type { Remediation, ResearchPacket } from '../shared/types';

export default function PolicyDraftCard({ remedy, packet }: { remedy: Remediation; packet: ResearchPacket }) {
  const live = remedy.mode === 'live';
  return <section className="remediation" aria-label="Analyst draft for review">
    <div className="section-title"><strong>{live ? 'NVIDIA / Nebius — draft for review' : 'Offline analyst checks'}</strong><span className="caption">{remedy.model ?? 'No model called'}</span></div>
    {remedy.fallbackReason ? <p className="fallback-note">{remedy.fallbackReason}</p> : null}
    <h4>{packet.mode === 'fixture' ? 'Saved-source policy scope' : 'Cited policy scope'}</h4>
    <p className="caption">Policy scope is limited to the cited passage. Verify transaction eligibility and the effective date on the source.</p>
    {remedy.documentedPolicy.map((policy, index) => { const source = packet.sources.find(s => s.id === policy.sourceId); return <p key={index}>{policy.statement} {source ? <a className="source-citation" href={source.url} target="_blank" rel="noopener noreferrer">[{policy.sourceId}]</a> : null}</p>; })}
    <h4>{live ? 'Model hypothesis — unverified' : 'Rule-based rationale'}</h4><p>{remedy.inference}</p>
    <h4>{live ? 'Proposed validation step' : 'Next validation step'}</h4><p>{remedy.nextStep}</p>
    <h4>What remains uncertain</h4><p>{remedy.uncertainty}</p>
    <p className="draft-authority">Decision status comes from the evidence check above. A draft cannot approve a remedy or estimate recovery.</p>
    {remedy.proof ? <p className="proof">NVIDIA request {remedy.proof.requestId ?? 'ID not returned'} — {remedy.proof.latencyMs} ms observed — {remedy.proof.requestedAt}</p> : null}
  </section>;
}
