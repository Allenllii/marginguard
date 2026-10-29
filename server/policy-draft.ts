import { z } from 'zod';
import { decidePolicy } from '../shared/policy-decision.js';
import type { ResearchPacket } from '../shared/types.js';

const Output = z.object({
  documentedPolicy: z.array(z.object({ sourceId: z.string().max(8), statement: z.string().min(10).max(500) }).strict()).min(1).max(3),
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
        : 'The returned passage describes an app or script exception to combination settings.'
      : 'The returned passage describes conditions for combining discounts or restricting coupon use.';
  return decision.sourceIds.map(sourceId => ({ sourceId, statement }));
}

const normalizeStatement = (text: string) => text.trim().replace(/\s+/gu, ' ').replace(/[.!?]$/u, '').toLowerCase();
const words = (text: string) => text.toLowerCase().match(/[a-z]+/gu) ?? [];

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

export function validatePolicyDraft(raw: unknown, packet: ResearchPacket) {
  const value = Output.parse(raw);
  const allowed = new Map(permittedPolicyStatements(packet).map(item => [item.sourceId, item.statement]));
  const ids = value.documentedPolicy.map(item => item.sourceId);
  if (ids.some(id => !packet.sources.some(source => source.id === id))) throw new Error('Unknown citation');
  if (new Set(ids).size !== ids.length || value.documentedPolicy.some(item => !allowed.has(item.sourceId) || normalizeStatement(item.statement) !== normalizeStatement(allowed.get(item.sourceId)!))) throw new Error('Unsupported policy statement');
  const prose = [...value.documentedPolicy.map(item => item.statement), value.inference, value.nextStep, value.uncertainty];
  if (prose.some(text => /[\d$%]|https?:|<[^>]+>|guaranteed savings|definitely caused|proves.{0,20}(cause|defect)/iu.test(text))) throw new Error('Unsupported claim');
  // These are observed failure-shape checks, not a general grammar verifier.
  // No terminal punctuation is required and preposition-ending sentences pass.
  if ([value.inference, value.nextStep, value.uncertainty].some(text => {
    const tail = text.trim().replace(/[.!?\s"'\u2019\u201d]+$/gu, '');
    return /\b(?:because|although|unless|including|such as|as well as|as|and|or|but)$/iu.test(tail) || copiedLongPassage(text, packet);
  })) throw new Error('Incomplete or copied policy prose');
  return { ...value, documentedPolicy: value.documentedPolicy.map(item => ({ sourceId: item.sourceId, statement: allowed.get(item.sourceId)! })) };
}
