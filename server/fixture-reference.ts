import { z } from 'zod';
import { ContextSchema, KindSchema } from './tavily.js';
import type { ResearchContext } from '../shared/types.js';

// Only enumerated public scenario context is encoded. Sources are always rebuilt
// by the server; a reference cannot supply text, URLs, retrieval proof or live mode.
export function fixtureReference(kind: 'discount' | 'shipping', context: ResearchContext): string {
  const c = ContextSchema.parse(context);
  return ['fixture-v1', KindSchema.parse(kind), c.platform, c.carrier, c.region, c.discountOrigin].join(':');
}
export function parseFixtureReference(value: string) {
  if (value.length > 160) return null;
  const fields = value.split(':');
  if (fields.length !== 6 || fields[0] !== 'fixture-v1') return null;
  const kind = KindSchema.safeParse(fields[1]);
  const context = ContextSchema.safeParse({ platform: fields[2], carrier: fields[3], region: fields[4], discountOrigin: fields[5] });
  return kind.success && context.success ? { kind: kind.data, context: context.data } : null;
}
export const ResearchIdSchema = z.union([z.string().uuid(), z.string().max(160).refine(value => parseFixtureReference(value) !== null)]);
