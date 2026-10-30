// Shared contract for "Check any fix" (POST /api/check-fix, GET /api/check-fix/examples).
// A seller's proposed margin fix is tested against official policy retrieved live.
export type CheckFixPlatform = 'Shopify' | 'WooCommerce';
export type CheckFixCarrier = 'USPS' | 'UPS';
export type CheckFixRegion = 'US' | 'UK' | 'unknown';
export interface CheckFixContext { platform: CheckFixPlatform; carrier: CheckFixCarrier; region: CheckFixRegion; }
export interface CheckFixRequest { fix: string; context: CheckFixContext; live: boolean; }

export type CheckFixStatus = 'supported' | 'contradicted' | 'insufficient' | 'hold';
export type CheckFixTopic = 'discounts' | 'shipping' | 'returns' | 'other';
export interface CheckFixSource { id: string; title: string; url: string; passage: string; }
export interface CheckFixQuote { sourceId: string; quote: string; }
export interface CheckFixStep { op: 'search' | 'extract'; url?: string; requestId?: string; credits?: number; latencyMs?: number; ok: boolean; }

export interface CheckFixResponse {
  status: CheckFixStatus;
  mode: 'live' | 'recorded' | 'offline';
  /** Human provenance line. */
  label: string;
  claim: string | null;
  topic: CheckFixTopic | null;
  query: string | null;
  domain: string | null;
  sources: CheckFixSource[];
  /** Only quotes that code verified verbatim against the cited source. */
  quotes: CheckFixQuote[];
  explanation: string | null;
  nextCheck: string | null;
  holdReason: string | null;
  retrieval: { steps: CheckFixStep[] } | null;
  models: { plan: string | null; judge: string | null };
  proof: { planRequestId: string | null; judgeRequestId: string | null; inputTokens: number | null; outputTokens: number | null; latencyMs: number } | null;
}

export interface CheckFixExample { id: string; fix: string; context: CheckFixContext; }
