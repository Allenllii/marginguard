import { useId, useState } from 'react';
import type { ResearchPacket } from '../shared/types';
import { buildPolicyTestSuite } from '../shared/policy-to-test';
import { buildPolicyTestAudit, POLICY_TEST_SCENARIO_ASSUMPTIONS, serializePolicyTestAudit, type PolicyTestAuditDataset } from '../shared/policy-test-audit';
import './PolicyTestLab.css';

type ProposedAction = 'review-combination-settings' | 'audit-manual-overrides';

const scenarioLabels = {
  normal: { title: 'Normal / code' },
  manual: { title: 'Manual / POS / draft' },
  unknown: { title: 'Unknown' },
};

const verdictLabels = {
  supported: 'Supported for investigation',
  contradicted: 'Exception challenges remedy',
  hold: 'On hold — needs more evidence',
};

/** An entirely local counterfactual view of an existing, server-issued packet. */
export default function PolicyTestLab({ packet, dataset }: { packet: ResearchPacket; dataset?: PolicyTestAuditDataset }) {
  const id = useId();
  const [action, setAction] = useState<ProposedAction>('review-combination-settings');
  const [exportNotice, setExportNotice] = useState<{ packet: ResearchPacket; action: ProposedAction; message: string } | null>(null);
  const suite = buildPolicyTestSuite({ packet, action });
  const supportCount = suite.cards.filter(card => card.verdict === 'supported').length;
  const contradictionCount = suite.cards.filter(card => card.verdict === 'contradicted').length;
  const holdCount = suite.cards.filter(card => card.verdict === 'hold').length;

  function exportAudit() {
    try {
      const audit = buildPolicyTestAudit({ packet, action, dataset });
      const url = URL.createObjectURL(new Blob([serializePolicyTestAudit(audit)], { type: 'application/json;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url; link.download = 'marginguard-policy-to-test-audit.json';
      try { document.body.append(link); link.click(); }
      finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
      setExportNotice({ packet, action, message: 'Audit JSON download prepared locally. No new retrieval or provider call.' });
    } catch {
      setExportNotice({ packet, action, message: 'The audit could not be exported. Load the policy result again and check the dataset assumptions, then try again.' });
    }
  }

  return <section className="policy-test-lab" aria-labelledby={`${id}-heading`}>
    <header className="ptl-header">
      <div>
        <p className="ptl-eyebrow">CHALLENGE THE PROPOSED FIX</p>
        <h3 id={`${id}-heading`}>Policy-to-Test</h3>
        <p className="ptl-deck">Same sources. Three possible discount origins. Different next checks.</p>
      </div>
      <span className="ptl-mode">{suite.mode === 'fixture' ? 'Saved result · no live call' : 'Live result · no new call'}</span>
    </header>

    <fieldset className="ptl-controls">
      <legend>Proposed action</legend>
      <label htmlFor={`${id}-action`}>Choose the repair to challenge</label>
      <select id={`${id}-action`} value={action} onChange={event => setAction(event.target.value as ProposedAction)}>
        <option value="review-combination-settings">Review combination settings</option>
        <option value="audit-manual-overrides">Audit manual overrides</option>
      </select>
      <p>Only the proposed fix changes. Sources and dollars stay the same.</p>
    </fieldset>

    <p className="ptl-summary" role="status" aria-live="polite" aria-atomic="true">
      {supportCount} supported for investigation · {contradictionCount} challenged by an exception · {holdCount} on hold
      {exportNotice?.packet === packet && exportNotice.action === action ? <>. {exportNotice.message}</> : null}
    </p>

    <ol className="ptl-cards" aria-label="Hypothetical discount-origin scenarios">
      {suite.cards.map((card, index) => <li className={`ptl-card ptl-${card.verdict}`} key={card.scenario}>
        <article aria-labelledby={`${id}-${card.scenario}`}>
          <div className="ptl-card-heading">
            <span className="ptl-number" aria-hidden="true">0{index + 1}</span>
            <h4 id={`${id}-${card.scenario}`}>{scenarioLabels[card.scenario].title}</h4>
          </div>
          <p className="ptl-assumption">{POLICY_TEST_SCENARIO_ASSUMPTIONS[card.scenario]}</p>
          <p className="ptl-verdict">{verdictLabels[card.verdict]}</p>
          <p className="ptl-reason">{card.reason}</p>

          <div className="ptl-next-check">
            <h5>Next check</h5>
            <p>{card.nextCheck}</p>
          </div>

          {card.missingEvidence.length ? <div className="ptl-missing">
            <h5>Evidence still needed</h5>
            <ul>{card.missingEvidence.map((missing, missingIndex) => <li key={missingIndex}>{missing}</li>)}</ul>
          </div> : null}

          {card.evidence.length ? <details className="ptl-evidence">
            <summary>Inspect source match ({card.evidence.length})<span className="ptl-sr-only"> for {scenarioLabels[card.scenario].title}</span></summary>
            {card.evidence.map((evidence, evidenceIndex) => <div className="ptl-source" key={`${evidence.sourceId}-${evidence.ruleId}-${evidenceIndex}`}>
              <blockquote>{evidence.quote}</blockquote>
              <a href={evidence.url} target="_blank" rel="noopener noreferrer">[{evidence.sourceId}] Open cited policy<span className="ptl-sr-only"> in a new tab</span></a>
              <p>{suite.mode === 'fixture' ? 'Saved summary; no live search.' : 'Excerpt from the live result; read the full source.'}</p>
            </div>)}
          </details> : <p className="ptl-no-match">No matching policy passage for this case.</p>}
        </article>
      </li>)}
    </ol>

    <details className="advanced">
      <summary>Advanced: audit details and JSON download</summary>
      <p className="ptl-boundary"><strong>Synthetic what-if tests.</strong> These cards vary an assumed origin against the same sources. They do not execute a change or test a real store. A match supports a review; store eligibility and the effective policy still need checking.</p>
      <p className="ptl-notice">{suite.notice}</p>
      {suite.rejectedCandidates > 0 ? <p className="ptl-rejected">{suite.rejectedCandidates} candidate{suite.rejectedCandidates === 1 ? '' : 's'} rejected by the evidence checks.</p> : null}
      <div className="ptl-export">
        <button type="button" onClick={exportAudit} aria-describedby={`${id}-export-description`}>Download Policy-to-Test audit (JSON)</button>
        <p id={`${id}-export-description`}>Local snapshot of the assumptions, three judgments, on-hold reasons, sources and fingerprints. No new retrieval or provider call. Exposure is not realized savings.</p>
      </div>
    </details>
  </section>;
}
