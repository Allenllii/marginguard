import { z } from 'zod';
import { decidePolicy } from '../shared/policy-decision.js';
import type { ResearchPacket } from '../shared/types.js';

// Nemotron sometimes returns bare citation IDs ("S1") instead of {sourceId}.
// Both shapes carry only an ID; the IDs are still checked against permitted sources below.
const Citation = z.preprocess(value => typeof value === 'string' ? { sourceId: value } : value, z.object({ sourceId: z.string().max(8), statement: z.string().min(10).max(500).optional() }).strict());
const Output = z.object({
  documentedPolicy: z.array(Citation).min(1).max(3),
  inference: z.string().min(10).max(600), nextStep: z.string().min(10).max(600), uncertainty: z.string().min(20).max(600),
}).strict();

// Code owns these limited scope statements; the model cannot turn a source ID
// into an arbitrary policy assertion. They describe the conservative router's
// evidence category, not account eligibility, semantic certification or cause.
export function permittedPolicyStatements(packet: ResearchPacket): { sourceId: string; statement: string }[] {
  const decision = decidePolicy(packet.kind, packet);
  if (decision.status !== 'review' && decision.status !== 'contradicted') return [];
  const statement = packet.kind === 'shipping'
    ? 'The returned passage describes carrier measurement, rate, or surcharge conditions.'
    : decision.status === 'contradicted'
      ? packet.context.discountOrigin === 'manual'
        ? 'The returned passage describes a manual-discount exception to combination settings.'
        : 'The returned passage describes a Scripts API exception to combination settings.'
      : 'The returned passage describes conditions for combining discounts or restricting coupon use.';
  return decision.sourceIds.map(sourceId => ({ sourceId, statement }));
}

const normalizeStatement = (text: string) => text.trim().replace(/\s+/gu, ' ').replace(/[.!?]$/u, '').toLowerCase();
const words = (text: string) => text.toLowerCase().match(/[a-z]+/gu) ?? [];

// Code already decided the next check and the UI shows it beside the draft, so a
// nextStep that restates it (equal word sets, or >= 90% Jaccard overlap) is not model work.
function restatesCheck(text: string, check: string) {
  const a = new Set(words(text)), b = new Set(words(check));
  const shared = [...a].filter(word => b.has(word)).length;
  return shared / (a.size + b.size - shared) >= 0.9;
}

function copiedLongPassage(text: string, packet: ResearchPacket) {
  const tokens = words(text);
  if (tokens.length <= 24) return false;
  const normalized = tokens.join(' ');
  return packet.sources.some(source => {
    const sourceWords = words(source.snippet);
    for (let i = 0; i + 12 <= sourceWords.length; i++) {
      if ((' ' + normalized + ' ').includes(' ' + sourceWords.slice(i, i + 12).join(' ') + ' ')) return true;
    }
    return false;
  });
}

/** Model prose may not carry numbers, money, links, markup or causal claims about the store. */
export const UNSUPPORTED_CLAIM = /[\d$%]|https?:|<[^>]+>|guaranteed savings|definitely caused|proves.{0,20}(cause|defect)|\b(?:explains?|caused?|causes|accounts? for)\s+(?:the|this|that|all)\s+(?:\w+\s+){0,2}(?:exposure|loss|leak|margin)/iu;

export function validatePolicyDraft(raw: unknown, packet: ResearchPacket) {
  const value = Output.parse(raw);
  const decision = decidePolicy(packet.kind, packet);
  const allowed = new Map(permittedPolicyStatements(packet).map(item => [item.sourceId, item.statement]));
  const ids = value.documentedPolicy.map(item => item.sourceId);
  if (ids.some(id => !packet.sources.some(source => source.id === id))) throw new Error('Unknown citation');
  if (new Set(ids).size !== ids.length || value.documentedPolicy.some(item => !allowed.has(item.sourceId) || (item.statement !== undefined && normalizeStatement(item.statement) !== normalizeStatement(allowed.get(item.sourceId)!)))) throw new Error('Unsupported policy statement');
  // A draft must not recommend the remedy the evidence just rebutted.
  // "Audit the combination settings" repeats it; "... before adjusting combination settings" does not.
  if (decision.status === 'contradicted' && /(?<!\bbefore\s)\b(?:audit|review|check|inspect|chang|adjust|tighten|updat|fix|modif|correct)\w*\s+(?:(?:the|your|its|store|discount)\s+)*combination settings?\b/iu.test(value.nextStep) && !/\b(?:manual|POS|draft|override|Scripts?)\b/iu.test(value.nextStep)) throw new Error('Next step contradicts the policy decision');
  const prose = [...value.documentedPolicy.flatMap(item => item.statement === undefined ? [] : [item.statement]), value.inference, value.nextStep, value.uncertainty];
  // "...which explains the exposure" was observed live: a policy exception does not establish the cause.
  if (prose.some(text => UNSUPPORTED_CLAIM.test(text))) throw new Error('Unsupported claim');
  // Reproduce the observed determiner/account-number mismatch specifically.
  // Do not rewrite model prose or claim this is a general grammar checker.
  if (prose.some(text => /\b(?:this\s+(?:(?:specific|particular|selected)\s+)?accounts|these\s+(?:(?:specific|particular|selected)\s+)?account|an\s+accounts)\b/iu.test(text))) throw new Error('Observed policy prose agreement error');
  // These are observed failure-shape checks, not a general grammar verifier.
  // No terminal punctuation is required and preposition-ending sentences pass.
  if ([value.inference, value.nextStep, value.uncertainty].some(text => {
    const tail = text.trim().replace(/[.!?\s"'\u2019\u201d]+$/gu, '');
    return /\b(?:because|although|unless|including|such as|as well as|as|and|or|but)$/iu.test(tail) || copiedLongPassage(text, packet);
  })) throw new Error('Incomplete or copied policy prose');
  if (restatesCheck(value.nextStep, decision.nextCheck)) throw new Error('Next step restates the code check');
  return { ...value, documentedPolicy: value.documentedPolicy.map(item => ({ sourceId: item.sourceId, statement: allowed.get(item.sourceId)! })) };
}
