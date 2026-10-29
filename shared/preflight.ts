/** A bounded seller-authored experiment. No store, checkout, provider, or network access. */
export interface PreflightSku { id: string; priceCents: number; unitCostCents: number; }
interface PreflightRuleThresholds { id: string; minSubtotalCents: number; minItems: number; }
export type PreflightRule = PreflightRuleThresholds & (
  | { type: 'percent'; scope: 'product' | 'order'; basisPoints: number }
  | { type: 'fixed'; amountCents: number }
  | { type: 'free_shipping' }
);
export interface PreflightEvidence {
  mode: 'fixture' | 'user';
  semantics: 'explicit_simulation' | 'unknown';
  costsReference: string;
  rulesReference: string;
  operationsReference: string;
}
export interface PreflightInput {
  currency: 'USD'; skus: PreflightSku[]; maxQuantity: number; rules: PreflightRule[];
  shippingChargedCents: number; shippingCostCents: number; paymentFeeBps: number;
  contributionFloorCents: number; evidence: PreflightEvidence;
}
export interface PreflightStep {
  ruleId: string; type: PreflightRule['type']; eligible: boolean; reason: string;
  discountCents: number; shippingReductionCents: number; remainingMerchandiseCents: number;
  remainingShippingChargedCents: number;
}
export interface PreflightScenario {
  basket: { skuId: string; quantity: number }[];
  ruleOrder: string[]; triggeredRules: string[]; steps: PreflightStep[];
  subtotalCents: number; discountCents: number; merchandiseCents: number;
  shippingChargedCents: number; cogsCents: number; shippingCostCents: number;
  paymentFeeCents: number; revenueCents: number; contributionCents: number; belowFloor: boolean;
}
export interface PreflightResult {
  version: 1; mode: 'offline'; status: 'HOLD' | 'REVIEW' | 'MODEL_CLEAR';
  holdReasons: string[]; riskBreach: boolean; worst: PreflightScenario;
  /** Maximum-quantity basket, with every rule in the exact user-provided order. */
  fullStackTrace: PreflightScenario;
  /** Same maximum-quantity basket, with no promotion rules. */
  baseline: PreflightScenario;
  searchSpace: { baskets: number; ruleSequences: number; scenarios: number; maxScenarios: 1008 };
  assumptions: string[]; input: PreflightInput; formula: string;
}

export class PreflightValidationError extends Error {
  readonly code = 'PREFLIGHT_INVALID_INPUT';
  constructor(message: string) { super(message); this.name = 'PreflightValidationError'; }
}

export const PREFLIGHT_FIXTURE: PreflightInput = {
  currency: 'USD', skus: [{ id: 'DEMO-SKU', priceCents: 5000, unitCostCents: 3000 }], maxQuantity: 1,
  rules: [
    { id: 'PRODUCT20', type: 'percent', scope: 'product', basisPoints: 2000, minSubtotalCents: 0, minItems: 0 },
    { id: 'ORDER20', type: 'percent', scope: 'order', basisPoints: 2000, minSubtotalCents: 0, minItems: 0 },
    { id: 'FREESHIP', type: 'free_shipping', minSubtotalCents: 0, minItems: 0 },
  ],
  shippingChargedCents: 800, shippingCostCents: 800, paymentFeeBps: 0, contributionFloorCents: 0,
  evidence: { mode: 'fixture', semantics: 'unknown', costsReference: 'Synthetic fixture; no seller cost evidence', rulesReference: 'Authored product/order percentage experiment', operationsReference: '' },
};

function fail(path: string, message: string): never { throw new PreflightValidationError(`${path}: ${message}`); }
function object(value: unknown, path: string, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(path, 'expected a plain object');
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => !keys.includes(key))) fail(path, 'unknown fields are not supported');
  if (keys.some(key => !Object.hasOwn(record, key))) fail(path, 'required fields are missing');
  return record;
}
function integer(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) fail(path, `expected an integer from ${min} to ${max}`);
  return value;
}
function list(value: unknown, path: string, min: number, max: number): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max || Object.getPrototypeOf(value) !== Array.prototype) fail(path, `provide ${min}-${max} entries`);
  const keys = Object.keys(value);
  if (keys.length !== value.length || keys.some((key, index) => key !== String(index))) fail(path, 'sparse arrays and extra array fields are not supported');
  return value;
}
function identifier(value: unknown, path: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(value) || ['__proto__', 'prototype', 'constructor'].includes(value)) fail(path, 'use 1-40 letters, digits, underscores or hyphens, starting with a letter or digit');
  return value;
}
function reference(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length > 240 || /[<>\u202a-\u202e\u2066-\u2069]/.test(value) || [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) fail(path, 'expected at most 240 plain text characters');
  return value.trim();
}
function choice<T extends string>(value: unknown, path: string, choices: readonly T[]): T {
  if (typeof value !== 'string' || !choices.includes(value as T)) fail(path, 'unsupported value');
  return value as T;
}

/** Validate unknown data at the boundary and return a fresh, allowlisted input snapshot. */
export function validatePreflightInput(value: unknown): PreflightInput {
  const input = object(value, 'preflight', ['currency', 'skus', 'maxQuantity', 'rules', 'shippingChargedCents', 'shippingCostCents', 'paymentFeeBps', 'contributionFloorCents', 'evidence']);
  const currency = choice(input.currency, 'currency', ['USD'] as const);
  const skus = list(input.skus, 'skus', 1, 3).map((value: unknown, index: number): PreflightSku => {
    const sku = object(value, `skus[${index}]`, ['id', 'priceCents', 'unitCostCents']);
    return { id: identifier(sku.id, `skus[${index}].id`), priceCents: integer(sku.priceCents, `skus[${index}].priceCents`, 0, 1_000_000), unitCostCents: integer(sku.unitCostCents, `skus[${index}].unitCostCents`, 0, 1_000_000) };
  });
  if (new Set(skus.map(sku => sku.id.toLowerCase())).size !== skus.length) fail('skus', 'duplicate SKU IDs are not supported (case insensitive)');
  const rules = list(input.rules, 'rules', 0, 3).map((value: unknown, index: number): PreflightRule => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`rules[${index}]`, 'expected a rule');
    const type = choice((value as Record<string, unknown>).type, `rules[${index}].type`, ['percent', 'fixed', 'free_shipping'] as const);
    const extra = type === 'percent' ? ['scope', 'basisPoints'] : type === 'fixed' ? ['amountCents'] : [];
    const rule = object(value, `rules[${index}]`, ['id', 'type', 'minSubtotalCents', 'minItems', ...extra]);
    const base = { id: identifier(rule.id, `rules[${index}].id`), minSubtotalCents: integer(rule.minSubtotalCents, `rules[${index}].minSubtotalCents`, 0, 9_000_000), minItems: integer(rule.minItems, `rules[${index}].minItems`, 0, 9) };
    if (type === 'percent') return { ...base, type, scope: choice(rule.scope, `rules[${index}].scope`, ['product', 'order'] as const), basisPoints: integer(rule.basisPoints, `rules[${index}].basisPoints`, 0, 10000) };
    if (type === 'fixed') return { ...base, type, amountCents: integer(rule.amountCents, `rules[${index}].amountCents`, 0, 1_000_000) };
    return { ...base, type };
  });
  if (new Set(rules.map(rule => rule.id.toLowerCase())).size !== rules.length) fail('rules', 'duplicate rule IDs are not supported (case insensitive)');
  const semantics = rules.map(rule => {
    const values = [rule.type, rule.minSubtotalCents, rule.minItems];
    return JSON.stringify(rule.type === 'percent' ? [...values, rule.scope, rule.basisPoints] : rule.type === 'fixed' ? [...values, rule.amountCents] : values);
  });
  if (new Set(semantics).size !== rules.length) fail('rules', 'duplicate rule semantics are not supported');
  const evidence = object(input.evidence, 'evidence', ['mode', 'semantics', 'costsReference', 'rulesReference', 'operationsReference']);
  return {
    currency, skus, rules, maxQuantity: integer(input.maxQuantity, 'maxQuantity', 1, 3),
    shippingChargedCents: integer(input.shippingChargedCents, 'shippingChargedCents', 0, 1_000_000),
    shippingCostCents: integer(input.shippingCostCents, 'shippingCostCents', 0, 1_000_000),
    paymentFeeBps: integer(input.paymentFeeBps, 'paymentFeeBps', 0, 10000),
    contributionFloorCents: integer(input.contributionFloorCents, 'contributionFloorCents', -10_000_000, 10_000_000),
    evidence: {
      mode: choice(evidence.mode, 'evidence.mode', ['fixture', 'user'] as const),
      semantics: choice(evidence.semantics, 'evidence.semantics', ['explicit_simulation', 'unknown'] as const),
      costsReference: reference(evidence.costsReference, 'evidence.costsReference'),
      rulesReference: reference(evidence.rulesReference, 'evidence.rulesReference'),
      operationsReference: reference(evidence.operationsReference, 'evidence.operationsReference'),
    },
  };
}

// Positive values only. BigInt makes half-up rounding independent of binary floating point.
function basisPointAmount(cents: number, basisPoints: number): number {
  return Number((BigInt(cents) * BigInt(basisPoints) + 5000n) / 10000n);
}
function scenario(input: PreflightInput, quantities: number[], rules: PreflightRule[]): PreflightScenario {
  const basket = input.skus.flatMap((sku, index) => quantities[index] > 0 ? [{ skuId: sku.id, quantity: quantities[index] }] : []);
  const subtotalCents = input.skus.reduce((total, sku, index) => total + sku.priceCents * quantities[index], 0);
  const cogsCents = input.skus.reduce((total, sku, index) => total + sku.unitCostCents * quantities[index], 0);
  const items = quantities.reduce((total, quantity) => total + quantity, 0);
  let merchandiseCents = subtotalCents, shippingChargedCents = input.shippingChargedCents;
  const steps: PreflightStep[] = [], triggeredRules: string[] = [];
  for (const rule of rules) {
    const eligible = subtotalCents >= rule.minSubtotalCents && items >= rule.minItems;
    let discountCents = 0, shippingReductionCents = 0;
    if (eligible) {
      triggeredRules.push(rule.id);
      if (rule.type === 'percent') discountCents = basisPointAmount(merchandiseCents, rule.basisPoints);
      else if (rule.type === 'fixed') discountCents = Math.min(merchandiseCents, rule.amountCents);
      else shippingReductionCents = shippingChargedCents;
      merchandiseCents -= discountCents;
      shippingChargedCents -= shippingReductionCents;
    }
    steps.push({ ruleId: rule.id, type: rule.type, eligible, reason: eligible ? 'Selected rule meets the original-basket subtotal and item thresholds.' : 'Original-basket threshold not met; rule has no effect.', discountCents, shippingReductionCents, remainingMerchandiseCents: merchandiseCents, remainingShippingChargedCents: shippingChargedCents });
  }
  const revenueCents = merchandiseCents + shippingChargedCents;
  const paymentFeeCents = basisPointAmount(revenueCents, input.paymentFeeBps);
  const contributionCents = revenueCents - cogsCents - input.shippingCostCents - paymentFeeCents;
  return { basket, ruleOrder: rules.map(rule => rule.id), triggeredRules, steps, subtotalCents, discountCents: subtotalCents - merchandiseCents, merchandiseCents, shippingChargedCents, cogsCents, shippingCostCents: input.shippingCostCents, paymentFeeCents, revenueCents, contributionCents, belowFloor: contributionCents < input.contributionFloorCents };
}
function orderedRuleSubsets(rules: PreflightRule[]): PreflightRule[][] {
  const sequences: PreflightRule[][] = [[]];
  function visit(prefix: PreflightRule[], remaining: PreflightRule[]) {
    for (let index = 0; index < remaining.length; index++) {
      const next = [...prefix, remaining[index]];
      sequences.push(next);
      visit(next, remaining.filter((_, other) => other !== index));
    }
  }
  visit([], rules);
  return sequences;
}

/** Exhaustive only inside the stated 1-3 SKU x 0..3 quantity x ordered-rule-subset model. */
export function runPreflight(value: unknown): PreflightResult {
  const input = validatePreflightInput(value);
  const sequences = orderedRuleSubsets(input.rules);
  const quantities = Array<number>(input.skus.length).fill(0);
  let baskets = 0, scenarios = 0, worst: PreflightScenario | undefined;
  function visit(index: number) {
    if (index < quantities.length) {
      for (let quantity = 0; quantity <= input.maxQuantity; quantity++) { quantities[index] = quantity; visit(index + 1); }
      return;
    }
    if (!quantities.some(quantity => quantity > 0)) return;
    baskets++;
    for (const sequence of sequences) {
      const current = scenario(input, quantities, sequence);
      scenarios++;
      if (!worst || current.contributionCents < worst.contributionCents) worst = current;
    }
  }
  visit(0);
  // Validation guarantees at least one SKU and one allowed quantity.
  if (!worst) throw new PreflightValidationError('preflight: no supported scenario');
  const holdReasons: string[] = [];
  if (input.evidence.mode === 'fixture') holdReasons.push('Fixture values and authored examples are not seller execution evidence.');
  if (input.evidence.semantics === 'unknown') holdReasons.push('Rule order, eligibility and stacking semantics have not been explicitly confirmed for this simulation.');
  if (!input.evidence.costsReference) holdReasons.push('Seller price and unit-cost evidence is missing.');
  if (input.rules.length > 0 && !input.evidence.rulesReference) holdReasons.push('Seller-authored promotion rule evidence is missing.');
  if (!input.evidence.operationsReference) holdReasons.push('Seller shipping cost, charged shipping and payment fee evidence is missing.');
  const riskBreach = worst.belowFloor;
  const fullQuantities = input.skus.map(() => input.maxQuantity);
  return {
    version: 1, mode: 'offline', status: holdReasons.length > 0 ? 'HOLD' : riskBreach ? 'REVIEW' : 'MODEL_CLEAR',
    holdReasons, riskBreach, worst,
    fullStackTrace: scenario(input, fullQuantities, input.rules), baseline: scenario(input, fullQuantities, []),
    searchSpace: { baskets, ruleSequences: sequences.length, scenarios, maxScenarios: 1008 }, input,
    formula: 'contribution = subtotal - merchandise discounts + charged shipping - COGS - shipping cost - payment fee',
    assumptions: [
      'Offline seller-authored simulation only; no Shopify checkout execution, store connection, order placement or configuration change is modeled or performed.',
      'USD integer cents; each percentage discount and payment fee rounds half up separately. Discounts cannot exceed the remaining merchandise amount.',
      'Product/order scope labels distinguish user-provided experiment stages. Both apply to the current basket merchandise amount; per-unit and per-line rounding are outside this model.',
      'Every rule may combine with every other rule, each at most once. Stress search includes every ordered subset, even if a real platform would prohibit that combination.',
      'Eligibility thresholds use the original merchandise subtotal and original item quantity. Shipping cost and charged shipping are fixed per basket; free shipping removes the charge only.',
      'Payment fees apply to discounted merchandise plus charged shipping. Tax, demand, refunds, returns, duties, fixed overhead, marketing, fulfillment tiers and other fees are excluded.',
      'Only 1-3 SKUs, quantities 0 through the chosen maximum of 1-3, nonempty baskets and up to 3 rules are searched. The lowest contribution is an absolute amount, not a margin rate.',
      'Evidence references are user attestations, not independently verified documents or platform validation. MODEL_CLEAR applies only to this bounded model and is not approval to launch or actual savings.',
      'Ties retain the first scenario in deterministic input-order enumeration. Baseline and full-stack trace use the maximum-quantity basket; worst may use a different basket.',
    ],
  };
}
