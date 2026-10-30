import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkInterpretation, recordedModelOutput, RECORDED_INTERPRETATION } from '../shared/preflight-bridge-response.js';
import { screenCampaignText } from '../server/preflight-intent.js';
import { PREFLIGHT_FIXTURE, runPreflight } from '../shared/preflight.js';

test('offline replay is the recorded Nemotron 3 Super run, verbatim from the evidence ledger', async () => {
  const ledger = JSON.parse(await readFile('evidence/live-intent-20261030.json', 'utf8'));
  const step = ledger.steps.find((item: { step: number }) => item.step === 1);
  const completion = step.requests.find((request: { endpoint: string }) => request.endpoint === '/v1/chat/completions');
  assert.equal(RECORDED_INTERPRETATION.campaign, step.campaign);
  assert.equal(RECORDED_INTERPRETATION.model, step.model);
  assert.equal(RECORDED_INTERPRETATION.model, completion.model);
  assert.equal(RECORDED_INTERPRETATION.requestId, completion.requestId);
  assert.equal(RECORDED_INTERPRETATION.recordedOn, completion.at.slice(0, 10));
  assert.deepEqual(RECORDED_INTERPRETATION.rules, step.rules);
  assert.deepEqual(RECORDED_INTERPRETATION.unmodeledConditions, step.unmodeledConditions);
  assert.equal(step.interpretation, 'nemotron_interpreted');
  // No fixture proof object travels with a replay.
  assert.equal('proof' in RECORDED_INTERPRETATION, false);
});

test('the replay passes the same gate as a live reply and the engine reproduces the recorded result', async () => {
  const ledger = JSON.parse(await readFile('evidence/live-intent-20261030.json', 'utf8'));
  const checked = checkInterpretation(screenCampaignText(RECORDED_INTERPRETATION.campaign), recordedModelOutput());
  assert.ok(checked.ok);
  assert.deepEqual(checked.rules, ledger.steps[0].rules);
  assert.deepEqual(checked.unmodeledConditions, ['customer_segment']);
  assert.equal(checked.interpretation, 'nemotron_interpreted');
  const worst = runPreflight({ ...structuredClone(PREFLIGHT_FIXTURE), rules: checked.rules }).worst.contributionCents;
  assert.equal(worst, ledger.steps.find((item: { step: number }) => item.step === 2).worstContributionCents);
  // The gate still bites: a value the seller never wrote, or a different campaign text, holds.
  const ungrounded = recordedModelOutput(); ungrounded.rules[1] = { ...ungrounded.rules[1], amountCents: 1500 } as typeof ungrounded.rules[1];
  assert.equal(checkInterpretation(RECORDED_INTERPRETATION.campaign, ungrounded).ok, false);
  assert.equal(checkInterpretation('25% off sitewide plus an extra $10 off orders over $75 for VIPs', recordedModelOutput()).ok, false);
});
