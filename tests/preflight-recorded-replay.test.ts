import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkInterpretation, recordedModelOutput, RECORDED_INTERPRETATION } from '../shared/preflight-bridge-response.js';
import { screenCampaignText } from '../server/preflight-intent.js';
import { PREFLIGHT_FIXTURE, runPreflight, withThresholdBasket } from '../shared/preflight.js';

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

test('the replay is simulated on a synthetic basket that can cross the $75 threshold, exposing the stacking risk', () => {
  const sample = { ...structuredClone(PREFLIGHT_FIXTURE), rules: structuredClone(RECORDED_INTERPRETATION.rules) };
  // On the one-$50-item sample the $75 rule never fires: worst +200, within the floor.
  assert.equal(runPreflight(sample).worst.triggeredRules.includes('R2'), false);
  const input = withThresholdBasket(sample);
  assert.ok(input);
  assert.deepEqual(input.skus, [{ id: 'DEMO-SKU-40', priceCents: 4000, unitCostCents: 2400 }]);
  assert.equal(input.maxQuantity, 3);
  const result = runPreflight(input);
  // 2 x $40 = $80 >= $75: $80 -20% = $64, -$10 = $54, free shipping; 54 - 48 COGS - 8 shipping = -$2.00.
  assert.deepEqual(result.worst.basket, [{ skuId: 'DEMO-SKU-40', quantity: 2 }]);
  assert.deepEqual(result.worst.triggeredRules, ['R1', 'R2', 'R3']);
  assert.equal(result.worst.contributionCents, -200);
  assert.equal(result.riskBreach, true);
  assert.equal(result.status, 'HOLD');
  assert.equal(result.searchSpace.scenarios, 48);
  // Not swapped: no threshold (sample proposal), a seller-edited basket, or a threshold the synthetic basket cannot reach either.
  assert.equal(withThresholdBasket(structuredClone(PREFLIGHT_FIXTURE)), null);
  assert.equal(withThresholdBasket({ ...sample, maxQuantity: 2 }), null);
  assert.equal(withThresholdBasket({ ...sample, skus: [{ id: 'MINE', priceCents: 5000, unitCostCents: 3000 }] }), null);
  assert.equal(withThresholdBasket({ ...sample, rules: [{ ...sample.rules[1], minSubtotalCents: 20000 }] }), null);
  // Pure: the caller's input is not mutated.
  assert.equal(sample.maxQuantity, 1);
});
