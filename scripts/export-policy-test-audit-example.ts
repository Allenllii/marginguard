import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { analyze } from '../server/analysis.js';
import { research } from '../server/tavily.js';
import { buildPolicyTestAudit, serializePolicyTestAudit } from '../shared/policy-test-audit.js';

// Local development example only. Explicit empty config skips environment lookup;
// an injected fail-closed transport prevents any provider dispatch.
const csv = await readFile(new URL('../data/northstar-demo.csv', import.meta.url), 'utf8');
const analysis = analyze(csv, 'Synthetic example', true);
const finding = analysis.issues.find(issue => issue.kind === 'discount');
assert.ok(finding);
let outboundAttempts = 0;
const noProvider: typeof fetch = async () => { outboundAttempts++; throw new Error('Example must stay offline'); };
const context = { platform: 'Shopify', carrier: 'USPS', region: 'US', discountOrigin: 'manual' } as const;
const packet = { ...await research('discount', context, false, {}, noProvider), researchId: 'authored-offline-audit-example' };
const audit = buildPolicyTestAudit({ packet, action: 'review-combination-settings', dataset: { ...analysis, finding } });
assert.equal(outboundAttempts, 0);
assert.equal(audit.dataset?.finding.exposureCents, 65808);
assert.deepEqual(audit.evaluation.scenarios.map(card => card.verdict), ['hold', 'contradicted', 'hold']);
await writeFile(new URL('../evidence/policy-test-audit-example.json', import.meta.url), serializePolicyTestAudit(audit));
console.log('Authored offline example saved: evidence/policy-test-audit-example.json; zero outbound attempts. Not a live retrieval or final benchmark.');
