import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { ContextSchema, safeSources } from '../server/tavily.js';
import { decidePolicy } from '../shared/policy-decision.js';
const Fixture = z.object({ scope: z.string(), cases: z.array(z.object({ id: z.string(), group: z.string(), kind: z.enum(['discount', 'shipping']), platform: z.enum(['Shopify', 'WooCommerce']), carrier: z.enum(['USPS', 'UPS']), region: z.literal('US'), origin: z.enum(['native', 'manual', 'scripts-api', 'app', 'app-script', 'unknown']), passage: z.string(), expected: z.enum(['review', 'hold', 'contradicted', 'insufficient']), nextCheck: z.string(), abstain: z.boolean() })).length(12) });
export const fixtures = Fixture.parse(JSON.parse(await readFile('data/decision-cases.json', 'utf8')));
export function fixturePacket(c: typeof fixtures.cases[number]) {
  const context = ContextSchema.parse({ platform: c.platform, carrier: c.carrier, region: c.region, discountOrigin: c.origin });
  const url = c.kind === 'discount' ? c.platform === 'Shopify' ? 'https://help.shopify.com/en/manual/discounts/discount-combinations' : 'https://woocommerce.com/document/coupon-management/' : c.carrier === 'USPS' ? 'https://www.usps.com/business/prices.htm' : 'https://www.ups.com/us/en/support/shipping-support/shipping-dimensions-weight';
  const sources = safeSources({ results: c.passage ? [{ title: c.kind === 'discount' ? 'Discount policy test fixture' : 'Shipping policy test fixture', url, content: c.passage, score: 0.9 }] : [] }, c.kind, context);
  return { context, sources, status: sources.length ? 'ok' as const : 'no-results' as const };
}
const results = fixtures.cases.map(c => { const decision = decidePolicy(c.kind, fixturePacket(c)); assert.equal(decision.status, c.expected, c.id); assert.ok(decision.nextCheck.includes(c.nextCheck), c.id); assert.equal(decision.status !== 'review', c.abstain, c.id); return { id: c.id, group: c.group, status: 'PASS', expected: c.expected, observed: decision.status, nextCheck: decision.nextCheck }; });
const report = { executedAt: new Date().toISOString(), scope: fixtures.scope, fixtureCases: results.length, passed: results.length, actualLiveEvaluation: 'PENDING approved credentials and observed calls; no live accuracy/fidelity claim', results };
await mkdir('evidence', { recursive: true }); await writeFile('evidence/policy-fixture-evaluation.json', JSON.stringify(report, null, 2) + '\n');
console.log(`Synthetic decision routing: ${results.length}/12 passed. Semantic fidelity on actual retrieved passages remains a human-reviewed live gate.`);
