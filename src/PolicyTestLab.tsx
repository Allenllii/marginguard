import { useId, useState } from 'react';
import type { ResearchPacket } from '../shared/types';
import { buildPolicyTestSuite } from '../shared/policy-to-test';
import './PolicyTestLab.css';

type ProposedAction = 'review-combination-settings' | 'audit-manual-overrides';

const scenarioLabels = {
  normal: { title: 'Normal / code', assumption: 'Assume an automatic or code discount.' },
  manual: { title: 'Manual / POS / draft', assumption: 'Assume a confirmed manual override.' },
  unknown: { title: 'Unknown', assumption: 'The discount origin is still missing.' },
};

const verdictLabels = {
  supported: 'Supported for investigation',
  contradicted: 'Exception challenges remedy',
  hold: 'HOLD · evidence needed',
};

/** An entirely local counterfactual view of an existing, server-issued packet. */
export default function PolicyTestLab({ packet }: { packet: ResearchPacket }) {
  const id = useId();
  const [action, setAction] = useState<ProposedAction>('review-combination-settings');
  const suite = buildPolicyTestSuite({ packet, action });
  const supportCount = suite.cards.filter(card => card.verdict === 'supported').length;
  const contradictionCount = suite.cards.filter(card => card.verdict === 'contradicted').length;
  const holdCount = suite.cards.filter(card => card.verdict === 'hold').length;

  return <section className="policy-test-lab" aria-labelledby={`${id}-heading`}>
    <header className="ptl-header">
      <div>
        <p className="ptl-eyebrow">CHALLENGE THE PROPOSED FIX</p>
        <h3 id={`${id}-heading`}>Policy-to-Test</h3>
        <p className="ptl-deck">One source packet. Three scenarios. Different next checks.</p>
      </div>
      <span className="ptl-mode">{suite.mode === 'fixture' ? 'Offline fixture · no provider call' : 'Live-mode packet · no new call'}</span>
    </header>

    <p className="ptl-boundary"><strong>Synthetic counterfactual tests.</strong> These cards vary an assumed origin against the same packet. They do not execute a change or test a real store. An evidence match supports a review; store eligibility and the effective policy still need verification.</p>

    <fieldset className="ptl-controls">
      <legend>Proposed action</legend>
      <label htmlFor={`${id}-action`}>Choose the repair to challenge</label>
      <select id={`${id}-action`} value={action} onChange={event => setAction(event.target.value as ProposedAction)}>
        <option value="review-combination-settings">Review combination settings</option>
        <option value="audit-manual-overrides">Audit manual overrides</option>
      </select>
      <p>Only the hypothesis changes. The source packet and financial calculations stay the same.</p>
    </fieldset>

    <p className="ptl-summary" role="status" aria-live="polite" aria-atomic="true">
      {supportCount} supported for investigation · {contradictionCount} challenged by an exception · {holdCount} on HOLD
    </p>

    <ol className="ptl-cards" aria-label="Hypothetical discount-origin scenarios">
      {suite.cards.map((card, index) => <li className={`ptl-card ptl-${card.verdict}`} key={card.scenario}>
        <article aria-labelledby={`${id}-${card.scenario}`}>
          <div className="ptl-card-heading">
            <span className="ptl-number" aria-hidden="true">0{index + 1}</span>
            <h4 id={`${id}-${card.scenario}`}>{scenarioLabels[card.scenario].title}</h4>
          </div>
          <p className="ptl-assumption">{scenarioLabels[card.scenario].assumption}</p>
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
              <p>{suite.mode === 'fixture' ? 'Authored fixture excerpt; no current retrieval.' : 'Excerpt from the existing retrieved packet; verify the full source.'}</p>
            </div>)}
          </details> : <p className="ptl-no-match">No applicable clause passed the code checks for this scenario.</p>}
        </article>
      </li>)}
    </ol>

    <p className="ptl-notice">{suite.notice}</p>
    {suite.rejectedCandidates > 0 ? <p className="ptl-rejected">{suite.rejectedCandidates} candidate{suite.rejectedCandidates === 1 ? '' : 's'} rejected by the evidence checks.</p> : null}
  </section>;
}
