import { z } from 'zod';

const Quote = z.object({
  text: z.string().min(40).max(600).refine(value => !/<[^>]*>|[\p{Cc}\p{Cf}]/u.test(value.replace(/[\t\n\r]/gu, ''))
    && !/ignore.{0,60}(?:instructions?|previous)|system\s+prompt|api[\s_-]*key|execute.{0,30}(?:code|command)|send.{0,40}(?:secret|credential)|you are (?:chatgpt|an assistant)/iu.test(value.replace(/\s+/gu, ' '))),
  start: z.number().int().min(0).max(80_000), end: z.number().int().min(40).max(80_000),
}).strict().refine(value => value.end - value.start === value.text.length);
export const PolicyReviewDossierSchema = z.object({
  kind: z.literal('unreviewed-policy'),
  url: z.literal('https://help.shopify.com/en/manual/discounts/discount-combinations'),
  retrievedAt: z.string().datetime(), bodySha256: z.string().regex(/^[a-f0-9]{64}$/u),
  bodyLength: z.number().int().min(40).max(80_000), quotes: z.array(Quote).min(1).max(3),
  unresolved: z.tuple([z.literal('POLICY_VERSION_REVIEW'), z.literal('EFFECTIVE_DATE'), z.literal('STORE_ELIGIBILITY'), z.literal('COMBINATION_SETTINGS'), z.literal('CHECKOUT_BEHAVIOR')]),
}).strict().refine(value => value.quotes.every((quote, index) => quote.end <= value.bodyLength && (index === 0 || quote.start >= value.quotes[index - 1].end)));
export type PolicyReviewDossier = z.infer<typeof PolicyReviewDossierSchema>;
