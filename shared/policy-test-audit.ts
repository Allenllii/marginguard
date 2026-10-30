import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { z } from 'zod';
import { buildPolicyTestSuite, type PolicyTestAction } from './policy-to-test.js';
import type { Analysis, Issue, ResearchPacket } from './types.js';

// Bump when policy-to-test clause matching, applicability or verdict semantics change.
export const POLICY_TEST_RULESET_VERSION = 'policy-to-test/v1';

/** Metadata only. Raw CSV, order IDs, product labels and filenames are excluded. */
export interface PolicyTestAuditDataset {
  fingerprint: Analysis['fingerprint']; synthetic: boolean; currency: Analysis['currency'];
  assumptions: Analysis['assumptions'];
  finding: Pick<Issue, 'id' | 'kind' | 'exposure' | 'rowIds' | 'formula'>;
}

const DatasetSchema = z.object({
  fingerprint: z.string().regex(/^[a-f0-9]{16}$/u),
  synthetic: z.boolean(), currency: z.literal('USD'),
  assumptions: z.object({ discountCeilingPercent: z.number().int().min(0).max(60), shippingSubsidyCents: z.number().int().min(0).max(2000) }),
  finding: z.object({
    id: z.string().min(1).max(200), kind: z.literal('discount'),
    exposure: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    rowIds: z.array(z.number().int().min(2).max(10001)).max(10000), formula: z.string().min(1).max(2000),
  }),
});

export const POLICY_TEST_SCENARIO_ASSUMPTIONS = {
  normal: 'Assume an automatic or code discount.',
  manual: 'Assume a confirmed manual override.',
  unknown: 'The discount origin is still missing.',
} as const;

/** Recursively sorted JSON; array order is meaningful. Includes one trailing LF.
 * Hash this UTF-8 representation, not a pretty-printed third-party rendering.
 */
export function serializePolicyTestAudit(value: unknown): string {
  function canonical(item: unknown): unknown {
    if (Array.isArray(item)) return item.map(canonical);
    if (item !== null && typeof item === 'object') {
      return Object.fromEntries(Object.entries(item).filter(([, child]) => child !== undefined)
        .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => [key, canonical(child)]));
    }
    return item;
  }
  return `${JSON.stringify(canonical(value), null, 2)}\n`;
}

function digest(value: unknown): string {
  return bytesToHex(sha256(new TextEncoder().encode(serializePolicyTestAudit(value))));
}

/** Local snapshot of the existing packet, never a retrieval or authentication.
 * Recomputes decisions with the code evaluator; callers cannot supply verdicts.
 * Source records remain plain JSON data, including records that failed matching.
 */
export function buildPolicyTestAudit({ packet, action, dataset, exportedAt = new Date().toISOString() }: {
  packet: ResearchPacket; action: PolicyTestAction; dataset?: PolicyTestAuditDataset; exportedAt?: string;
}) {
  const exportMillis = Date.parse(exportedAt);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(exportedAt)
    || !Number.isFinite(exportMillis)
    || new Date(exportMillis).toISOString() !== (exportedAt.includes('.') ? exportedAt : exportedAt.replace('Z', '.000Z'))) {
    throw new Error('A valid UTC ISO export timestamp is required.');
  }
  const suite = buildPolicyTestSuite({ packet, action });
  const data = dataset === undefined ? null : DatasetSchema.parse(dataset);
  const datasetSnapshot = data === null ? null : {
    fingerprint: { algorithm: 'sha256' as const, value: data.fingerprint, hexCharacters: 16, scope: 'original-csv-prefix' as const },
    synthetic: data.synthetic, currency: data.currency, sellerAssumptions: data.assumptions,
    finding: { id: data.finding.id, kind: data.finding.kind, exposureCents: data.finding.exposure, rowIds: data.finding.rowIds, formula: data.finding.formula },
  };
  const evidence = {
    researchId: packet.researchId, kind: packet.kind, mode: packet.mode, status: packet.status,
    provenance: packet.mode === 'fixture' ? 'authored-offline-fixture' as const : 'received-live-mode-packet-unverified' as const,
    retrievedAt: packet.mode === 'live' && packet.status === 'ok' && packet.sources.length ? packet.checkedAt : null,
    reportedCheckedAt: packet.checkedAt,
    context: { platform: packet.context.platform, carrier: packet.context.carrier, region: packet.context.region, discountOrigin: packet.context.discountOrigin ?? 'unknown' },
    query: packet.query, note: packet.note,
    sources: packet.sources.map(source => ({
      id: source.id, title: source.title, url: source.url, snippet: source.snippet,
      publishedDate: source.publishedDate, savedAt: source.savedAt ?? null, sourceRegion: source.sourceRegion ?? null,
    })),
    proof: packet.mode === 'live' && packet.proof ? { requestId: packet.proof.requestId, latencyMs: packet.proof.latencyMs, usageCredits: packet.proof.usageCredits } : null,
  };
  const evaluation = {
    rulesetVersion: POLICY_TEST_RULESET_VERSION, action: suite.action, status: suite.status,
    scenarios: suite.cards.map(card => ({ ...card, assumption: POLICY_TEST_SCENARIO_ASSUMPTIONS[card.scenario], holdReason: card.verdict === 'hold' ? card.reason : null })),
    rejectedCandidates: suite.rejectedCandidates, notice: suite.notice,
  };
  const limitations = [
    'Synthetic counterfactual scenarios; no real-store test, transaction execution or approved change.',
    'Export is local and performs no new provider call or retrieval. ExportedAt is the export clock, not a retrieval date.',
    'A fixture is an authored summary with no current retrieval; savedAt is a recorded source-review date, not retrieval or policy effective date.',
    'A live-mode label, request metadata, URL match or content fingerprint does not authenticate a packet or certify semantic fidelity.',
    'Received source records are retained for inspection; only scenario evidence arrays identify matched clauses. Source inclusion does not establish applicability.',
    'Store eligibility, actual discount mechanism, promotion intent and policy effective date remain unverified. Published dates do not establish effective dates.',
    'Exposure is an assumption-based review amount in integer USD cents, not realized savings, profit, guaranteed recovery or customer impact.',
    'Dataset fingerprint is the original CSV SHA-256 prefix (16 hex characters), not a full hash. Raw CSV, order records, product labels and filenames are outside the export schema. Received policy-source text is preserved as text, not redacted.',
    'SHA-256 fingerprints detect snapshot differences; they are not signatures or proof of origin. Packet hash covers evidence; audit hash covers schemaVersion, dataset, evidence, evaluation and limitations, excluding exportedAt and fingerprints.',
    ...(data === null ? ['Dataset and financial assumptions were not supplied; no dataset linkage or exposure is inferred.'] : []),
  ];
  const snapshot = { schemaVersion: 'marginguard.policy-test-audit.v1' as const, dataset: datasetSnapshot, evidence, evaluation, limitations };
  return { ...snapshot, exportedAt, fingerprints: { packetSha256: digest(evidence), auditSha256: digest(snapshot) } };
}

export type PolicyTestAudit = ReturnType<typeof buildPolicyTestAudit>;
