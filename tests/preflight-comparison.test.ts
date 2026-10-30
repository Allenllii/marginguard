import test from 'node:test';
import assert from 'node:assert/strict';
import { PREFLIGHT_FIXTURE, PreflightValidationError, type PreflightInput, type PreflightRule } from '../shared/preflight.js';
import { runPreflightComparison } from '../shared/preflight-comparison.js';

const percent = (id: string, basisPoints: number): PreflightRule => ({ id, type: 'percent', scope: 'order', basisPoints, minItems: 0, minSubtotalCents: 0 });
const fixed = (id: string, amountCents: number): PreflightRule => ({ id, type: 'fixed', amountCents, minItems: 0, minSubtotalCents: 0 });
function input(overrides: Partial<PreflightInput> = {}): PreflightInput {
  return { ...structuredClone(PREFLIGHT_FIXTURE), evidence: { mode: 'user', semantics: 'explicit_simulation', costsReference: 'Seller cost sheet v1', rulesReference: 'Original seller rules v1', operationsReference: 'Seller shipping and payment assumptions v1' }, ...overrides };
}
function request(overrides: Record<string, unknown> = {}) {
  return { input: input(), quantities: [1], adjustedRules: [PREFLIGHT_FIXTURE.rules[0], PREFLIGHT_FIXTURE.rules[2]], adjustmentReference: 'Seller removes ORDER20 in revised rules v2', sellerConfirmed: true, ...overrides };
}

test('compares the exact selected basket and authored rule order; never selects different worst cases', () => {
  const source = input({ maxQuantity: 3, skus: [{ id: 'A', priceCents: 1000, unitCostCents: 400 }, { id: 'B', priceCents: 2000, unitCostCents: 900 }], rules: [fixed('OFF300', 300), percent('HALF', 5000)] });
  const result = runPreflightComparison(request({ input: source, quantities: [1, 0], adjustedRules: [percent('HALF', 5000), fixed('OFF300', 300)] }));
  assert.deepEqual(result.original.basket, [{ skuId: 'A', quantity: 1 }]);
  assert.deepEqual(result.adjusted.basket, result.original.basket);
  assert.equal(result.original.merchandiseCents, 350);
  assert.equal(result.adjusted.merchandiseCents, 200);
  assert.equal(result.deltaCents, -150);
  assert.deepEqual(result.original.ruleOrder, ['OFF300', 'HALF']);
  assert.deepEqual(result.adjusted.ruleOrder, ['HALF', 'OFF300']);
  for (const key of ['subtotalCents', 'cogsCents', 'shippingCostCents'] as const) assert.equal(result.original[key], result.adjusted[key]);
});

test('golden comparison retains original negative contribution and B-A conditional delta', () => {
  const result = runPreflightComparison(request());
  assert.equal(result.original.contributionCents, -600);
  assert.equal(result.adjusted.contributionCents, 200);
  assert.equal(result.deltaCents, 800);
  assert.equal(result.status, 'REVIEW');
  assert.equal(result.riskBreach, true);
  assert.deepEqual(result.original.steps.map(step => step.remainingMerchandiseCents), [4000, 3200, 3200]);
});

test('payment fee uses discounted merchandise plus charged shipping on both sides', () => {
  const source = input({ skus: [{ id: 'A', priceCents: 1999, unitCostCents: 800 }], maxQuantity: 2, rules: [percent('A20', 2000)], shippingChargedCents: 500, shippingCostCents: 450, paymentFeeBps: 300 });
  const result = runPreflightComparison(request({ input: source, quantities: [2], adjustedRules: [percent('B10', 1000)] }));
  assert.equal(result.original.paymentFeeCents, 111);
  assert.equal(result.adjusted.paymentFeeCents, 123);
  assert.equal(result.original.contributionCents, 1537);
  assert.equal(result.adjusted.contributionCents, 1925);
  assert.equal(result.deltaCents, 388);
});

test('rounds each percentage stage and payment fee half up in integer cents', () => {
  const source = input({ skus: [{ id: 'A', priceCents: 105, unitCostCents: 0 }], maxQuantity: 3, rules: [percent('TEN', 1000)], shippingChargedCents: 0, shippingCostCents: 0, paymentFeeBps: 5000 });
  const result = runPreflightComparison(request({ input: source, quantities: [3], adjustedRules: [] }));
  assert.equal(result.original.discountCents, 32);
  assert.equal(result.original.paymentFeeCents, 142);
  assert.equal(result.adjusted.paymentFeeCents, 158);
  assert.equal(result.deltaCents, 16);
  for (const side of [result.original, result.adjusted]) for (const value of Object.values(side)) if (typeof value === 'number') assert.ok(Number.isSafeInteger(value));
});

test('thresholds use original locked subtotal and quantities, with inclusive eligibility', () => {
  const source = input({ skus: [{ id: 'A', priceCents: 500, unitCostCents: 0 }], maxQuantity: 2, rules: [percent('HALF', 5000), { ...fixed('THRESHOLD', 100), minSubtotalCents: 1000, minItems: 2 }] });
  const result = runPreflightComparison(request({ input: source, quantities: [2], adjustedRules: source.rules }));
  assert.equal(result.original.steps[1].eligible, true);
  assert.equal(result.adjusted.steps[1].eligible, true);
  assert.equal(result.original.merchandiseCents, 400);
  assert.equal(result.deltaCents, 0);
});

test('free shipping removes only the shipping charge while locked shipping cost remains', () => {
  const source = input({ rules: [] });
  const result = runPreflightComparison(request({ input: source, adjustedRules: [PREFLIGHT_FIXTURE.rules[2]] }));
  assert.equal(result.original.shippingChargedCents, 800);
  assert.equal(result.adjusted.shippingChargedCents, 0);
  assert.equal(result.adjusted.shippingCostCents, 800);
  assert.equal(result.deltaCents, -800);
});

test('identical rules give zero difference and an exact floor remains clear', () => {
  const source = input({ rules: [], contributionFloorCents: 2000 });
  const result = runPreflightComparison(request({ input: source, adjustedRules: [] }));
  assert.equal(result.deltaCents, 0);
  assert.equal(result.status, 'MODEL_CLEAR');
  assert.equal(result.riskBreach, false);
  assert.equal(runPreflightComparison(request({ input: { ...source, contributionFloorCents: 2001 }, adjustedRules: [] })).status, 'REVIEW');
});

test('fixture or unknown semantics remain HOLD even after seller confirmation', () => {
  for (const evidence of [{ ...input().evidence, mode: 'fixture' }, { ...input().evidence, semantics: 'unknown' }]) {
    const result = runPreflightComparison(request({ input: { ...input(), evidence } }));
    assert.equal(result.status, 'HOLD');
    assert.equal(result.deltaCents, 800);
    assert.ok(result.holdReasons.length);
  }
});

test('each missing seller evidence reference independently holds while preserving conditional math', () => {
  for (const key of ['costsReference', 'rulesReference', 'operationsReference'] as const) {
    const source = input(); source.evidence[key] = '   ';
    const result = runPreflightComparison(request({ input: source }));
    assert.equal(result.status, 'HOLD', key);
    assert.equal(result.deltaCents, 800);
    assert.ok(result.holdReasons.length);
  }
});

test('missing explicit seller confirmation or adjusted rule reference holds the comparison', () => {
  for (const overrides of [{ sellerConfirmed: false }, { sellerConfirmed: undefined }, { adjustmentReference: '' }, { adjustmentReference: undefined }]) {
    const result = runPreflightComparison(request(overrides));
    assert.equal(result.status, 'HOLD');
    assert.equal(result.deltaCents, 800);
    assert.ok(result.holdReasons.length);
  }
});

test('empty original rules do not require a nonexistent original rule source', () => {
  const source = input({ rules: [] }); source.evidence.rulesReference = '';
  assert.equal(runPreflightComparison(request({ input: source, adjustedRules: [] })).status, 'MODEL_CLEAR');
});

test('rejects malformed, empty, sparse, extra and out-of-range basket quantities', () => {
  for (const quantities of [undefined, null, [], [0], [1, 1], [-1], [2], [1.5], ['1'], [NaN], [Infinity], Array(1), Object.assign([1], { extra: true })]) {
    assert.throws(() => runPreflightComparison(request({ quantities })), PreflightValidationError, String(quantities));
  }
});

test('rejects unsupported and ambiguous adjusted rules rather than silently ignoring them', () => {
  for (const adjustedRules of [undefined, null, Array(1), [{ ...fixed('BAD', 10), type: 'bogo' }], [{ ...percent('BAD', 1000), fixedFeeCents: 30 }], [{ ...percent('BAD', 1000), basisPoints: 10001 }], [percent('DUP', 1000), percent('dup', 2000)], [percent('A', 1000), percent('B', 1000)]]) {
    assert.throws(() => runPreflightComparison(request({ adjustedRules })), PreflightValidationError);
  }
});

test('rejects invalid source input and attempts to vary per-side basket/cost conditions', () => {
  for (const source of [null, { ...input(), paymentFeeBps: '300' }, { ...input(), shippingCostCents: NaN }]) assert.throws(() => runPreflightComparison(request({ input: source })), PreflightValidationError);
  for (const extra of [{ adjustedInput: input() }, { adjustedQuantities: [1] }, { shippingCostCents: 0 }]) assert.throws(() => runPreflightComparison(request(extra)), PreflightValidationError);
  assert.throws(() => runPreflightComparison(Object.assign(Object.create({ extra: true }), request())), PreflightValidationError);
});

test('rejects non-boolean confirmation and unrenderable adjustment references', () => {
  for (const sellerConfirmed of ['true', 1, null]) assert.throws(() => runPreflightComparison(request({ sellerConfirmed })), PreflightValidationError);
  for (const adjustmentReference of [1, null, '<script>', 'a\nb', 'a'.repeat(241), '\u202efoo']) assert.throws(() => runPreflightComparison(request({ adjustmentReference })), PreflightValidationError);
});

test('fresh snapshots preserve evidence and are deterministic without mutating callers', () => {
  const value = request(); const before = JSON.stringify(value);
  const freeze = (value: object) => { Object.freeze(value); for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child); };
  freeze(value);
  const first = runPreflightComparison(value);
  assert.deepEqual(first, runPreflightComparison(value));
  assert.equal(JSON.stringify(value), before);
  assert.notEqual(first.input, value.input);
  assert.notEqual(first.adjustedRules, value.adjustedRules);
  assert.notEqual(first.quantities, value.quantities);
  assert.match(first.adjustmentReference, /Seller removes/);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
  assert.match(first.assumptions.join(' '), /same|identical|locked/i);
  assert.match(first.assumptions.join(' '), /not.*savings|no.*savings/i);
  assert.match(first.assumptions.join(' '), /no.*recommend|not.*recommend/i);
});
