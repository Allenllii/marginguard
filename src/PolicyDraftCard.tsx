import type { Remediation, ResearchPacket } from '../shared/types';
import { decidePolicy } from '../shared/policy-decision';

const columnText = { fontSize: 11, lineHeight: 1.9, color: 'var(--supporting-text)', marginTop: 8 };

export default function PolicyDraftCard({ remedy, packet }: { remedy: Remediation; packet: ResearchPacket }) {
  const live = remedy.mode === 'live';
  // The offline replay of a real Nemotron response is labelled by the server as recorded.
  const recorded = !live && /^recorded nemotron/i.test(remedy.fallbackReason ?? '');
  const modelText = live || recorded;
  // Statements are code-owned, so several sources often share one; show it once, citing each.
  const statements = [...new Set(remedy.documentedPolicy.map(policy => policy.statement))];
  return <section className="remediation" aria-label="Analyst draft for review">
    <div className="section-title"><strong>{live ? 'Nemotron on Nebius — draft for review' : recorded ? 'Recorded Nemotron draft' : 'Offline analyst checks'}</strong><span className="caption">{remedy.model ?? 'No model called'}</span></div>
    {remedy.fallbackReason ? <p className="fallback-note">{remedy.fallbackReason}</p> : null}
    <h4>What the cited policy says</h4>
    {statements.map(statement => <p key={statement}>{statement}{remedy.documentedPolicy.filter(policy => policy.statement === statement).map(policy => { const source = packet.sources.find(s => s.id === policy.sourceId); return source ? <span key={policy.sourceId}> <a className="source-citation" href={source.url} target="_blank" rel="noopener noreferrer">[{policy.sourceId}]</a></span> : null; })}</p>)}
    <h4>{modelText ? 'Model hypothesis — unverified' : 'Rule-based rationale'}</h4><p>{remedy.inference}</p>
    {modelText
      ? <div className="step-compare" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <div><h4>Decided by code</h4><p style={columnText}>{decidePolicy(packet.kind, packet).nextCheck}</p></div>
        <div><h4>Nemotron’s procedure</h4><p style={columnText}>{remedy.nextStep}</p></div>
      </div>
      : <><h4>Next validation step</h4><p>{remedy.nextStep}</p></>}
    <h4>What remains uncertain</h4><p>{remedy.uncertainty}</p>
    <p className="draft-authority">Code made the decision above. A draft cannot approve a remedy or estimate recovery.</p>
    {remedy.proof ? <p className="proof">Nemotron request {remedy.proof.requestId ?? 'ID not returned'} — {remedy.proof.latencyMs} ms observed — {remedy.proof.requestedAt}</p> : null}
  </section>;
}
