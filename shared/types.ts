export type IssueKind = 'discount' | 'shipping' | 'returns';
export interface Order {
  row: number; id: string; date: string; sku: string; category: string;
  gross: number; discount: number; promoCount: number; cogs: number;
  shippingCharged: number; shippingCost: number; refund: number; returnCost: number;
}
export interface Issue {
  id: string; kind: IssueKind; title: string; subtitle: string; severity: 'high' | 'medium';
  exposure: number; rowIds: number[]; formula: string; details: string; action: string;
  metrics: { label: string; value: string }[];
}
export interface Analysis {
  assumptions: import('./assumptions.js').Assumptions;
  source: string; synthetic: boolean; currency: 'USD'; orders: Order[]; issues: Issue[];
  totals: { gross: number; revenue: number; contribution: number; margin: number; opportunity: number; returns: number };
  daily: { date: string; revenue: number; contribution: number }[];
  dateRange: { start: string; end: string }; fingerprint: string;
}
export interface Explanation {
  mode: 'fixture' | 'live'; model: string | null; summary: string;
  priorities: { issueId: string; reason: string; nextStep: string }[];
  caveat: string; proof?: { requestedAt: string; requestId: string | null; latencyMs: number; inputTokens: number | null; outputTokens: number | null };
  fallbackReason?: string;
}
export interface ProviderStatus { mode: 'fixture' | 'configured'; model: string | null; endpoint: string; }
export interface ResearchContext { platform: 'Shopify' | 'WooCommerce'; carrier: 'USPS' | 'UPS'; region: 'US' | 'UK' | 'unknown'; discountOrigin?: 'native' | 'manual' | 'scripts-api' | 'app' | 'app-script' | 'unknown'; }
export interface PolicySource { id: string; title: string; url: string; snippet: string; publishedDate: string | null; savedAt?: string; sourceRegion?: 'US' | 'UK' | 'global'; }
export interface PolicyDecision { status: 'review' | 'hold' | 'contradicted' | 'insufficient'; constraint: string; nextCheck: string; disprove: string; sourceIds: string[]; }
export interface ResearchPacket {
  researchId: string; kind: IssueKind; context: ResearchContext; mode: 'fixture' | 'live';
  query: string; checkedAt: string | null; sources: PolicySource[]; status: 'ok' | 'no-results' | 'error';
  note: string; retryAfterSeconds?: number; proof?: { requestId: string | null; latencyMs: number; usageCredits: number | null };
}
export interface Remediation {
  mode: 'fixture' | 'live'; model: string | null;
  documentedPolicy: { sourceId: string; statement: string }[];
  inference: string; nextStep: string; uncertainty: string;
  proof?: Explanation['proof']; fallbackReason?: string;
}
export const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);
export const preciseMoney = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
