import test from 'node:test';
import assert from 'node:assert/strict';
import { PREFLIGHT_FIXTURE, PreflightValidationError, runPreflight, type PreflightInput, type PreflightRule } from '../shared/preflight.js';

function scenario(overrides: Partial<PreflightInput> = {}): PreflightInput {
  return {
    ...structuredClone(PREFLIGHT_FIXTURE),
    evidence: { mode: 'user', semantics: 'explicit_simulation', costsReference: 'Seller cost worksheet revision 1', rulesReference: 'Seller-authored promotion experiment', operationsReference: 'Shipping and fee worksheet; explicit simulation order confirmed' },
    ...overrides,
  };
}
const percent = (id: string, basisPoints: number, scope: 'product' | 'order' = 'order'): PreflightRule => ({ id, type: 'percent', scope, basisPoints, minItems: 0, minSubtotalCents: 0 });
const fixed = (id: string, amountCents: number): PreflightRule => ({ id, type: 'fixed', amountCents, minItems: 0, minSubtotalCents: 0 });

test('golden collision: product 20%, order 20%, free shipping moves +2000 to -600 cents', () => {
  const result = runPreflight(PREFLIGHT_FIXTURE);
  assert.equal(result.baseline.contributionCents, 2000);
  assert.deepEqual(result.fullStackTrace.steps.map(step => step.remainingMerchandiseCents), [4000, 3200, 3200]);
  assert.equal(result.fullStackTrace.contributionCents, -600);
  assert.equal(result.worst.contributionCents, -600);
  assert.equal(result.worst.shippingChargedCents, 0);
  assert.equal(result.riskBreach, true);
  assert.equal(result.status, 'HOLD');
  assert.equal(result.searchSpace.scenarios, 16);
});

test('golden counterfactual: removing second 20% leaves +200 cents, never labels this savings', () => {
  const input = scenario();
  input.rules.splice(1, 1);
  const result = runPreflight(input);
  assert.equal(result.fullStackTrace.contributionCents, 200);
  assert.equal(result.worst.contributionCents, 200);
  assert.equal(result.status, 'MODEL_CLEAR');
  assert.equal(result.riskBreach, false);
});

test('search enumerates all nonempty 0..3 quantity baskets and all 16 ordered rule subsets', () => {
  const input = scenario({ maxQuantity: 3, skus: [{ id: 'A', priceCents: 100, unitCostCents: 50 }, { id: 'B', priceCents: 300, unitCostCents: 200 }, { id: 'C', priceCents: 700, unitCostCents: 500 }] });
  const result = runPreflight(input);
  assert.deepEqual(result.searchSpace, { baskets: 63, ruleSequences: 16, scenarios: 1008, maxScenarios: 1008 });
  assert.deepEqual(result.fullStackTrace.basket, [{ skuId: 'A', quantity: 3 }, { skuId: 'B', quantity: 3 }, { skuId: 'C', quantity: 3 }]);
});

test('enumeration finds noncommutative fixed then percent vs percent then fixed order', () => {
  const result = runPreflight(scenario({ skus: [{ id: 'A', priceCents: 1000, unitCostCents: 0 }], shippingChargedCents: 0, shippingCostCents: 0, rules: [fixed('OFF300', 300), percent('HALF', 5000)] }));
  assert.equal(result.fullStackTrace.merchandiseCents, 350);
  assert.equal(result.worst.merchandiseCents, 200);
  assert.deepEqual(result.worst.triggeredRules, ['HALF', 'OFF300']);
});

test('eligible rule checks inclusive original basket subtotal and quantity thresholds', () => {
  const rule = { ...fixed('THRESHOLD', 100), minSubtotalCents: 1000, minItems: 2 };
  const result = runPreflight(scenario({ skus: [{ id: 'A', priceCents: 500, unitCostCents: 0 }], maxQuantity: 2, rules: [percent('HALF', 5000), rule] }));
  assert.equal(result.fullStackTrace.steps[1].eligible, true);
  assert.equal(result.fullStackTrace.merchandiseCents, 400);
  const missed = runPreflight(scenario({ skus: [{ id: 'A', priceCents: 500, unitCostCents: 0 }], rules: [rule] }));
  assert.equal(missed.fullStackTrace.steps[0].eligible, false);
  assert.match(missed.fullStackTrace.steps[0].reason, /threshold/i);
});

test('exact half-cent percentage and payment fees round half up using integer cents', () => {
  const result = runPreflight(scenario({ skus: [{ id: 'PENNY', priceCents: 1, unitCostCents: 0 }], rules: [percent('HALF', 5000)], shippingChargedCents: 1, shippingCostCents: 0, paymentFeeBps: 5000 }));
  assert.equal(result.fullStackTrace.discountCents, 1);
  assert.equal(result.fullStackTrace.paymentFeeCents, 1);
  assert.equal(result.fullStackTrace.contributionCents, 0);
});

test('discounts are capped at merchandise and never subsidize shipping or create negative revenue', () => {
  const result = runPreflight(scenario({ skus: [{ id: 'A', priceCents: 1, unitCostCents: 2 }], rules: [fixed('BIG', 1_000_000), percent('FULL', 10000)], shippingChargedCents: 100, shippingCostCents: 80, paymentFeeBps: 1000 }));
  assert.equal(result.fullStackTrace.merchandiseCents, 0);
  assert.equal(result.fullStackTrace.discountCents, 1);
  assert.equal(result.fullStackTrace.paymentFeeCents, 10);
  assert.equal(result.fullStackTrace.contributionCents, 8);
});

test('zero rules and zero priced merchandise remain valid with one baseline sequence', () => {
  const input = scenario({ skus: [{ id: 'ZERO', priceCents: 0, unitCostCents: 0 }], rules: [], shippingChargedCents: 0, shippingCostCents: 0, paymentFeeBps: 0 });
  input.evidence.rulesReference = '';
  const result = runPreflight(input);
  assert.equal(result.status, 'MODEL_CLEAR');
  assert.equal(result.worst.contributionCents, 0);
  assert.equal(result.worst.belowFloor, false);
  assert.equal(result.searchSpace.scenarios, 1);
});

test('upper supported amounts remain exact safe integers across 9 items and all rules', () => {
  const input = scenario({ skus: ['A', 'B', 'C'].map(id => ({ id, priceCents: 1_000_000, unitCostCents: 1_000_000 })), maxQuantity: 3, shippingChargedCents: 1_000_000, shippingCostCents: 1_000_000, paymentFeeBps: 10000 });
  const result = runPreflight(input);
  for (const value of Object.values(result.fullStackTrace)) if (typeof value === 'number') assert.ok(Number.isSafeInteger(value));
  assert.equal(result.baseline.contributionCents, -10_000_000);
});

test('user evidence cannot override fixture HOLD and unknown simulation semantics HOLD', () => {
  const fixture = scenario(); fixture.evidence.mode = 'fixture';
  assert.equal(runPreflight(fixture).status, 'HOLD');
  const unknown = scenario(); unknown.evidence.semantics = 'unknown';
  assert.equal(runPreflight(unknown).status, 'HOLD');
  assert.ok(runPreflight(unknown).holdReasons.some(reason => /semantics|order|eligibility/i.test(reason)));
});

test('each missing evidence category independently holds the decision, with risk preserved', () => {
  for (const key of ['costsReference', 'rulesReference', 'operationsReference'] as const) {
    const input = scenario(); input.evidence[key] = '   ';
    const result = runPreflight(input);
    assert.equal(result.status, 'HOLD', key);
    assert.equal(result.riskBreach, true, key);
    assert.ok(result.holdReasons.length);
  }
});

test('sufficient user supplied evidence only yields REVIEW or MODEL_CLEAR and preserves user provenance', () => {
  const result = runPreflight(scenario());
  assert.equal(result.status, 'REVIEW');
  assert.equal(result.input.evidence.mode, 'user');
  assert.match(result.assumptions.join(' '), /not.*Shopify|no.*Shopify/i);
});

test('exact floor is clear; a one cent higher required floor flags risk', () => {
  const input = scenario({ rules: [] });
  assert.equal(runPreflight({ ...input, contributionFloorCents: 2000 }).status, 'MODEL_CLEAR');
  assert.equal(runPreflight({ ...input, contributionFloorCents: 2001 }).status, 'REVIEW');
});

test('repeat execution is deterministic, serializable, and does not mutate frozen input', () => {
  const input = scenario();
  const before = JSON.stringify(input);
  const freeze = (value: object) => { Object.freeze(value); for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child); };
  freeze(input);
  assert.deepEqual(runPreflight(input), runPreflight(input));
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(JSON.parse(JSON.stringify(runPreflight(input))), runPreflight(input));
});

test('reject duplicate SKU IDs, duplicate rule IDs, and semantic duplicate rules with distinct IDs', () => {
  const a = scenario(); a.skus.push({ ...a.skus[0] });
  assert.throws(() => runPreflight(a), PreflightValidationError);
  const b = scenario(); b.rules[1] = { ...b.rules[1], id: b.rules[0].id };
  assert.throws(() => runPreflight(b), PreflightValidationError);
  assert.throws(() => runPreflight(scenario({ rules: [percent('A', 1000), percent('B', 1000)] })), PreflightValidationError);
  assert.doesNotThrow(() => runPreflight(scenario({ rules: [percent('A', 1000, 'product'), percent('B', 1000, 'order')] })));
});

test('reject numeric strings, fractional/negative/unsafe/NaN/infinite amounts and basis points', () => {
  for (const invalid of ['100', 1.5, -1, 1_000_001, Number.MAX_SAFE_INTEGER, NaN, Infinity]) {
    const input = scenario();
    (input.skus[0] as unknown as Record<string, unknown>).priceCents = invalid;
    assert.throws(() => runPreflight(input), PreflightValidationError, String(invalid));
  }
  for (const invalid of [-1, 10001, 12.5, NaN]) assert.throws(() => runPreflight({ ...scenario(), paymentFeeBps: invalid }), PreflightValidationError);
});

test('reject empty/excess SKU/rule lists and quantity boundaries before enumeration', () => {
  const input = scenario();
  for (const skus of [[], Array.from({ length: 4 }, (_, index) => ({ id: `SKU${index}`, priceCents: 1, unitCostCents: 1 }))]) assert.throws(() => runPreflight({ ...input, skus }), PreflightValidationError);
  for (const maxQuantity of [0, 4, 1.5, '3', null]) assert.throws(() => runPreflight({ ...input, maxQuantity }), PreflightValidationError);
  assert.throws(() => runPreflight({ ...input, rules: [...input.rules, fixed('FOURTH', 100)] }), PreflightValidationError);
});

test('reject unknown keys, prototype-shaped objects, HTML/control character IDs, and oversized references', () => {
  const input = scenario();
  assert.throws(() => runPreflight({ ...input, checkoutUrl: 'https://evil.example' }), PreflightValidationError);
  assert.throws(() => runPreflight({ ...input, skus: [{ ...input.skus[0], unsupported: true }] }), PreflightValidationError);
  assert.throws(() => runPreflight({ ...input, evidence: { ...input.evidence, approved: true } }), PreflightValidationError);
  for (const id of ['', '<img src=x>', 'A\nB', '__proto__', 'a'.repeat(41)]) assert.throws(() => runPreflight({ ...input, skus: [{ ...input.skus[0], id }] }), PreflightValidationError);
  assert.throws(() => runPreflight({ ...input, evidence: { ...input.evidence, costsReference: 'a'.repeat(241) } }), PreflightValidationError);
  assert.throws(() => runPreflight({ ...input, evidence: { ...input.evidence, costsReference: '<script>alert(1)</script>' } }), PreflightValidationError);
  assert.throws(() => runPreflight(Object.assign(Object.create({ surprise: true }), input)), PreflightValidationError);
});

test('malformed discriminated rules fail closed rather than silently changing rule interpretation', () => {
  for (const rule of [{ ...percent('A', 100), scope: 'checkout' }, { ...percent('A', 100), amountCents: 30 }, { ...fixed('A', 100), basisPoints: 50 }, { id: 'SHIP', type: 'free_shipping', minItems: 0 }, { ...fixed('A', 100), minItems: 10 }, { ...fixed('A', 100), minSubtotalCents: 9_000_001 }, { ...fixed('A', 100), type: 'execute' }]) {
    assert.throws(() => runPreflight({ ...scenario(), rules: [rule] }), PreflightValidationError);
  }
});

test('invalid top-level structures and currencies reject with typed non-secret errors', () => {
  for (const input of [null, undefined, [], 1, 'input', {}, { ...scenario(), currency: 'EUR' }]) {
    assert.throws(() => runPreflight(input), (error: unknown) => error instanceof PreflightValidationError && error.message.length < 200);
  }
});

test('sparse SKU/rule arrays and extra array properties reject with the typed validation error', () => {
  for (const skus of [Array(1), [{ id: 'A', priceCents: 100, unitCostCents: 50 }], undefined]) {
    if (skus && Object.hasOwn(skus, 0)) Object.assign(skus, { unexpected: true });
    assert.throws(() => runPreflight({ ...scenario(), skus }), PreflightValidationError);
  }
  assert.throws(() => runPreflight({ ...scenario(), rules: Array(1) }), PreflightValidationError);
});

test('case variants of SKU and rule IDs are duplicates rather than separate promotions', () => {
  const input = scenario();
  assert.throws(() => runPreflight({ ...input, skus: [input.skus[0], { ...input.skus[0], id: input.skus[0].id.toLowerCase() }] }), PreflightValidationError);
  assert.throws(() => runPreflight({ ...input, rules: [percent('RULE', 2000), percent('rule', 3000)] }), PreflightValidationError);
});
