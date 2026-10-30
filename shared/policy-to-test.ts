import { z } from 'zod';
import type { PolicyDecision, ResearchContext, ResearchPacket } from './types.js';
import { decidePolicy } from './policy-decision.js';
import { incompatibleSourceRegion, unresolvedPolicyStatement } from './policy-source-scope.js';

export type PolicyTestAction = 'review-combination-settings' | 'audit-manual-overrides';
export type PolicyTestRule = 'native-combination' | 'manual-exception';
export interface PolicyTestEvidence { sourceId: string; url: string; quote: string; ruleId: PolicyTestRule; }
export interface PolicyTestCard {
  scenario: 'normal' | 'manual' | 'unknown';
  verdict: 'supported' | 'contradicted' | 'hold';
  reason: string; nextCheck: string; evidence: PolicyTestEvidence[]; missingEvidence: string[];
}
export interface PolicyTestSuite {
  action: PolicyTestAction; mode: 'fixture' | 'live'; status: 'ready' | 'hold';
  // ponytail: always 0 since model candidates were removed; kept only because
  // PolicyTestLab and the v1 audit schema still read it. Drop with those.
  cards: PolicyTestCard[]; rejectedCandidates: number; notice: string;
}

const PacketSchema = z.object({
  kind: z.literal('discount'), mode: z.enum(['fixture', 'live']), status: z.literal('ok'),
  context: z.object({ platform: z.enum(['Shopify', 'WooCommerce']), region: z.literal('US') }),
  sources: z.array(z.object({
    id: z.string().regex(/^S[1-3]$/u), title: z.string().max(2000),
    url: z.string().max(2048), snippet: z.string().min(1).max(1200),
    sourceRegion: z.enum(['US', 'UK', 'global', 'other']).optional(),
  })).min(1).max(3),
});
type Platform = z.infer<typeof PacketSchema>['context']['platform'];

// Cheap pre-screens that hold every card. They stay on top of decidePolicy
// because Policy-to-Test can be handed a packet that was never screened.
const instructions = /ignore.{0,30}(?:instructions|previous)|system\s*prompt|api.?key|execute.{0,20}(?:code|command)|send.{0,20}(?:secret|credential)|you are (?:chatgpt|an assistant)|<[^>]+>|[\p{Cc}\p{Cf}]/iu;
const retraction = /\b(?:sentence|statement|claim|source|exception|rule)\b.{0,120}\b(?:false|untrue|incorrect|outdated|retracted|hypothetical\s+example)\b/iu;
const incompatibleRegion = /\b(?:united\s+kingdom|UK\s+only|british\s+(?:stores|merchants|accounts))\b/iu;

function safeSourceUrl(raw: string, platform: Platform) {
  try {
    const url = new URL(raw);
    const domain = platform === 'Shopify' ? 'help.shopify.com' : 'woocommerce.com';
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && (url.hostname === domain || url.hostname.endsWith(`.${domain}`));
  } catch { return false; }
}

// Picks the sentence a reader should see for a cited source. This only chooses
// the quote; decidePolicy alone decides whether the source counts.
const manualWord = /\b(?:manual(?:ly)?|draft|POS)\b/iu;
const quoteFocus: Record<PolicyTestRule, RegExp[]> = {
  'manual-exception': [/\b(?:manual(?:ly)?|draft|POS)\b.*\b(?:always apply|bypass(?:es)?|regardless)\b/iu, manualWord],
  'native-combination': [/^(?!.*\b(?:manual(?:ly)?|draft|POS)\b).*(?:combin|individual use|usage restrict)/iu, /combin|individual use|usage restrict/iu],
};
function quoteFor(snippet: string, rule: PolicyTestRule): string {
  const sentences = (snippet.match(/[^.!?]+(?:[.!?]+|$)/gu) ?? []).map(text => text.trim()).filter(Boolean);
  for (const focus of quoteFocus[rule]) {
    const hit = sentences.find(sentence => focus.test(sentence));
    if (hit) return hit;
  }
  return sentences[0] ?? snippet.trim();
}

const nextChecks = {
  normal: 'Find the official rule for how discount codes and automatic discounts combine, then check the store’s active discount settings.',
  manual: 'Find the official rule for manual POS and draft-order discounts, then pull the override record for one flagged order.',
  unknown: 'Open a flagged order and check whether the discount came from a code, an automatic discount, a staff override or an app.',
  audit: 'Check who applied the manual discounts on flagged orders, what staff are allowed to do, and what the promotion was meant to allow.',
};
const missing = {
  normal: ['The official rule for combining code and automatic discounts', 'The store’s active discount settings'],
  manual: ['The official rule for manual POS and draft-order discounts', 'The override record and who applied it'],
  unknown: ['Where the discount on a flagged order came from'],
  audit: ['The override record, staff permissions and what the promotion was meant to allow'],
  settings: ['The store’s actual discount settings and what the promotion was meant to allow'],
};

function heldCards(reason: string): PolicyTestCard[] {
  return [
    { scenario: 'normal', verdict: 'hold', reason, nextCheck: nextChecks.normal, evidence: [], missingEvidence: missing.normal },
    { scenario: 'manual', verdict: 'hold', reason, nextCheck: nextChecks.manual, evidence: [], missingEvidence: missing.manual },
    { scenario: 'unknown', verdict: 'hold', reason: 'We don’t know where these discounts came from, so no policy can be matched to them yet.', nextCheck: nextChecks.unknown, evidence: [], missingEvidence: missing.unknown },
  ];
}

/** Pure local check of an existing research packet; no fetch, no model call.
 * Each card asks decidePolicy (the same rule the main decision card uses) what
 * it says for that discount origin, so the two panels cannot disagree.
 */
export function buildPolicyTestSuite({ packet, action }: { packet: ResearchPacket; action: PolicyTestAction }): PolicyTestSuite {
  const mode = packet?.mode === 'live' ? 'live' : 'fixture';
  const result: PolicyTestSuite = {
    action, mode, status: 'hold', rejectedCandidates: 0,
    notice: `${mode === 'fixture' ? 'Offline fixture: saved policy summaries, no live search.' : 'Live-mode packet, no new search. If that search failed or found nothing usable, every scenario stays on HOLD.'} These are synthetic what-if scenarios on the same evidence, not tests on a real store, and they don’t prove the cause or any recovery.`,
    cards: heldCards('There’s no usable official policy passage for this scenario yet, so the proposed fix stays on hold.'),
  };
  if (action !== 'review-combination-settings' && action !== 'audit-manual-overrides') return result;
  const parsed = PacketSchema.safeParse(packet);
  if (!parsed.success) return result;
  const p = parsed.data;
  if (new Set(p.sources.map(source => source.id)).size !== p.sources.length
    || p.sources.some(source => !safeSourceUrl(source.url, p.context.platform) || instructions.test(source.snippet) || instructions.test(source.title)
      || retraction.test(source.snippet) || incompatibleRegion.test(`${source.title} ${source.snippet}`)
      || incompatibleSourceRegion(source) || unresolvedPolicyStatement(source.title, source.snippet))) return result;

  const decide = (discountOrigin: NonNullable<ResearchContext['discountOrigin']>) =>
    decidePolicy('discount', { ...packet, context: { ...packet.context, discountOrigin } });
  const cite = (decision: PolicyDecision, ruleId: PolicyTestRule): PolicyTestEvidence[] => decision.sourceIds.flatMap(id => {
    const source = p.sources.find(item => item.id === id);
    return source ? [{ sourceId: id, url: source.url, quote: quoteFor(source.snippet, ruleId), ruleId }] : [];
  });
  const settingsFix = action === 'review-combination-settings';

  const native = decide('native');
  if (native.status === 'review') {
    result.cards[0] = settingsFix
      ? { ...result.cards[0], verdict: 'supported', evidence: cite(native, 'native-combination'),
        reason: 'The cited policy ties code and automatic discounts to the store’s combination rules, so reviewing those settings is a fair next step. It doesn’t prove they’re set wrong.',
        nextCheck: p.context.platform === 'Shopify'
          ? 'Open one flagged order, check which discounts stacked and whether each one allows combining, then test a small change.'
          : 'Open one flagged order, check the coupon’s “Individual use only” and usage restrictions, then test a small change.',
        missingEvidence: missing.settings }
      // A code or automatic discount has no manual override to audit, and the
      // cited policy points at settings instead. Nothing here supports the audit,
      // but no exception argues against it either, so this is HOLD, not a rebuttal.
      : { ...result.cards[0], reason: 'This scenario assumes a code or automatic discount, so there’s no manual override to audit. The cited policy points to the combination settings instead.',
        nextCheck: 'Confirm on a flagged order that no staff override was involved, then review the combination settings instead.',
        missingEvidence: ['A sign that a manual override was involved on a flagged order'] };
  }

  const manual = decide('manual');
  if (manual.status === 'contradicted') {
    const says = p.context.platform === 'Shopify' ? 'Shopify says manual POS and draft-order discounts' : 'The cited policy says manual discounts';
    result.cards[1] = { ...result.cards[1], verdict: settingsFix ? 'contradicted' : 'supported', evidence: cite(manual, 'manual-exception'),
      reason: settingsFix
        ? `${says} ignore combination settings, so changing those settings won’t stop this leak.`
        : `${says} ignore combination settings, so the leak has to be stopped where staff apply them. It doesn’t prove anyone made a mistake.`,
      nextCheck: nextChecks.audit, missingEvidence: missing.audit };
  }

  // The unknown card stays HOLD: decidePolicy holds an unknown origin (pinned by tests).
  result.status = result.cards.some(card => card.verdict !== 'hold') ? 'ready' : 'hold';
  return result;
}
