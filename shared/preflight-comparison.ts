import { calculatePreflightScenario, PreflightValidationError, validatePreflightInput, type PreflightInput, type PreflightRule, type PreflightScenario } from './preflight.js';

/** Both rule sets are evaluated against one seller-authored basket and cost snapshot. */
export interface PreflightComparisonRequest {
  input: unknown;
  quantities: unknown;
  adjustedRules: unknown;
  adjustmentReference?: string;
  sellerConfirmed?: boolean;
}

export interface PreflightComparisonResult {
  version: 1;
  mode: 'offline';
  status: 'HOLD' | 'REVIEW' | 'MODEL_CLEAR';
  holdReasons: string[];
  riskBreach: boolean;
  original: PreflightScenario;
  adjusted: PreflightScenario;
  /** Adjusted minus original modeled contribution for the identical basket; never actual savings. */
  deltaCents: number;
  input: PreflightInput;
  quantities: number[];
  adjustedRules: PreflightRule[];
  adjustmentReference: string;
  sellerConfirmed: boolean;
  assumptions: string[];
  formula: string;
}

function fail(path: string, message: string): never {
  throw new PreflightValidationError(`${path}: ${message}`);
}

function request(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('comparison', 'expected a plain object');
  const record = value as Record<string, unknown>;
  const keys = ['input', 'quantities', 'adjustedRules', 'adjustmentReference', 'sellerConfirmed'];
  if (Object.keys(record).some(key => !keys.includes(key))) fail('comparison', 'unknown fields are not supported; both sides must share one basket and cost snapshot');
  if (['input', 'quantities', 'adjustedRules'].some(key => !Object.hasOwn(record, key))) fail('comparison', 'input, quantities and adjustedRules are required');
  return record;
}

function basketQuantities(value: unknown, input: PreflightInput): number[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length !== input.skus.length) fail('quantities', 'provide one quantity for every SKU in its original order');
  const keys = Object.keys(value);
  if (keys.length !== value.length || keys.some((key, index) => key !== String(index))) fail('quantities', 'sparse arrays and extra array fields are not supported');
  const quantities = value.map((quantity: unknown, index: number) => {
    if (typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity < 0 || quantity > input.maxQuantity) fail(`quantities[${index}]`, `expected an integer from 0 to ${input.maxQuantity}`);
    return quantity;
  });
  if (!quantities.some(quantity => quantity > 0)) fail('quantities', 'select a nonempty basket');
  return quantities;
}

function adjustmentEvidence(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.length > 240 || /[<>\u202a-\u202e\u2066-\u2069]/.test(value) || [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) fail('adjustmentReference', 'expected at most 240 plain text characters');
  return value.trim();
}

/**
 * A single deterministic comparison, not a search or recommendation. Invalid or unsupported
 * structures throw; missing attestations hold the decision while retaining conditional math.
 */
export function runPreflightComparison(value: unknown): PreflightComparisonResult {
  const draft = request(value);
  const input = validatePreflightInput(draft.input);
  const quantities = basketQuantities(draft.quantities, input);
  // Reuse the same strict allowlist and bounded rule validation as the original engine.
  const adjustedRules = validatePreflightInput({ ...input, rules: draft.adjustedRules }).rules;
  const adjustmentReference = adjustmentEvidence(draft.adjustmentReference);
  if (draft.sellerConfirmed !== undefined && typeof draft.sellerConfirmed !== 'boolean') fail('sellerConfirmed', 'expected an explicit boolean');
  const sellerConfirmed = draft.sellerConfirmed === true;
  const original = calculatePreflightScenario(input, quantities, input.rules);
  const adjusted = calculatePreflightScenario(input, quantities, adjustedRules);
  const holdReasons: string[] = [];
  if (input.evidence.mode === 'fixture') holdReasons.push('Fixture values and authored examples are not seller execution evidence.');
  if (input.evidence.semantics === 'unknown') holdReasons.push('Rule order, eligibility and stacking semantics have not been explicitly confirmed for this simulation.');
  if (!input.evidence.costsReference) holdReasons.push('Seller price and unit-cost evidence is missing.');
  if (input.rules.length > 0 && !input.evidence.rulesReference) holdReasons.push('Original seller-authored promotion rule evidence is missing.');
  if (!input.evidence.operationsReference) holdReasons.push('Seller shipping cost, charged shipping and payment fee evidence is missing.');
  if (!adjustmentReference) holdReasons.push('A seller-authored reference describing the adjusted rules is missing.');
  if (!sellerConfirmed) holdReasons.push('The seller has not explicitly confirmed the adjusted rules for this comparison.');
  const riskBreach = original.belowFloor || adjusted.belowFloor;
  return {
    version: 1, mode: 'offline', status: holdReasons.length > 0 ? 'HOLD' : riskBreach ? 'REVIEW' : 'MODEL_CLEAR',
    holdReasons, riskBreach, original, adjusted, deltaCents: adjusted.contributionCents - original.contributionCents,
    input, quantities, adjustedRules, adjustmentReference, sellerConfirmed,
    formula: 'contribution = subtotal - merchandise discounts + charged shipping - COGS - shipping cost - payment fee; conditional difference = adjusted contribution - original contribution',
    assumptions: [
      'Both sides use the identical locked basket, SKU prices, unit costs, shipping charge, shipping cost, payment fee rate and contribution floor. Only the authored promotion rules and their order change.',
      'Each side applies every rule exactly once in its supplied order. No rule subsets, alternate baskets or worst-case searches are selected for this comparison.',
      'USD integer cents; each percentage discount and payment fee rounds half up separately. Discounts are capped at the remaining merchandise amount.',
      'Product/order scope labels distinguish experiment stages; both apply to current basket merchandise. Per-unit and per-line rounding are outside this model.',
      'Eligibility uses the original merchandise subtotal and original item count. Fixed shipping costs remain even when a rule removes the customer shipping charge.',
      'Payment fees apply to discounted merchandise plus charged shipping. Tax, demand, refunds, returns, duties, fixed overhead, marketing, fulfillment tiers and other fees are excluded.',
      'Evidence references are seller attestations, not independently verified documents. Fixture values, unknown semantics or missing references keep the decision on HOLD even when conditional amounts can be calculated.',
      'No recommendation is made by this comparison. The conditional contribution difference is not actual savings, realized profit, guaranteed sales, checkout validation or approval to launch.',
      'Offline seller-authored simulation only; no provider call, store connection, checkout execution, order placement or configuration change is performed.',
    ],
  };
}
