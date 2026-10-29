import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { parse } from 'csv-parse/browser/esm/sync';
import type { Analysis, Issue, Order } from '../shared/types.js';
import { DEFAULT_ASSUMPTIONS, validAssumptions, type Assumptions } from '../shared/assumptions.js';

export const HEADERS = ['order_id', 'order_date', 'sku', 'category', 'gross_sales', 'discount', 'promo_count', 'cogs', 'shipping_charged', 'shipping_cost', 'refund', 'return_cost'];
export const MAX_BYTES = 2 * 1024 * 1024;
export class InputError extends Error {}
const cents = (s: string, row: number, field: string): number => {
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) throw new InputError(`Row ${row}: ${field} must be a nonnegative amount with up to 2 decimals.`);
  return Math.round(Number(s) * 100);
};
export function parseOrders(csv: string): Order[] {
  if (new TextEncoder().encode(csv).byteLength > MAX_BYTES) throw new InputError('CSV exceeds the 2 MB limit.');
  let records: string[][];
  try { records = parse(csv, { bom: true, skip_empty_lines: true, trim: true, max_record_size: 4096 }); }
  catch { throw new InputError('Invalid CSV. Check quotes, columns, and row lengths.'); }
  const headers = records.shift();
  if (!headers || headers.length !== HEADERS.length || new Set(headers).size !== HEADERS.length || !HEADERS.every(h => headers.includes(h))) throw new InputError(`CSV needs these unique columns: ${HEADERS.join(', ')}.`);
  if (!records.length || records.length > 10000) throw new InputError('Upload between 1 and 10,000 order rows.');
  const ids = new Set<string>();
  return records.map((values, index) => {
    const row = index + 2;
    if (values.length !== HEADERS.length) throw new InputError(`Row ${row}: wrong column count.`);
    const r = Object.fromEntries(headers.map((h, i) => [h, values[i]]));
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(r.order_id) || ids.has(r.order_id)) throw new InputError(`Row ${row}: order_id must be unique and use letters, numbers, _ or -.`);
    ids.add(r.order_id);
    for (const field of ['sku', 'category']) if (!/^[a-zA-Z0-9 _.-]{1,64}$/.test(r[field])) throw new InputError(`Row ${row}: ${field} must use 1–64 letters, numbers, spaces, dots, _ or -.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.order_date) || !Number.isFinite(Date.parse(r.order_date)) || new Date(r.order_date).toISOString().slice(0, 10) !== r.order_date) throw new InputError(`Row ${row}: order_date must be a real ISO date (YYYY-MM-DD).`);
    if (!/^\d{1,2}$/.test(r.promo_count) || Number(r.promo_count) > 10) throw new InputError(`Row ${row}: promo_count must be an integer from 0 to 10.`);
    const order: Order = {
      row, id: r.order_id, date: r.order_date, sku: r.sku, category: r.category,
      gross: cents(r.gross_sales, row, 'gross_sales'), discount: cents(r.discount, row, 'discount'),
      promoCount: Number(r.promo_count), cogs: cents(r.cogs, row, 'cogs'),
      shippingCharged: cents(r.shipping_charged, row, 'shipping_charged'), shippingCost: cents(r.shipping_cost, row, 'shipping_cost'),
      refund: cents(r.refund, row, 'refund'), returnCost: cents(r.return_cost, row, 'return_cost'),
    };
    if (!order.gross || order.discount > order.gross || order.refund > order.gross - order.discount) throw new InputError(`Row ${row}: gross_sales must be positive; discount and refund cannot exceed the sale.`);
    if (order.returnCost > 0 && order.refund === 0) throw new InputError(`Row ${row}: return_cost requires a refund.`);
    return order;
  });
}
const sum = (rows: Order[], select: (r: Order) => number) => rows.reduce((s, r) => s + select(r), 0);
export const revenue = (r: Order) => r.gross - r.discount - r.refund + r.shippingCharged;
export const contribution = (r: Order) => revenue(r) - r.cogs - r.shippingCost - r.returnCost;
const digest = (text: string) => bytesToHex(sha256(new TextEncoder().encode(text)));
export const returnIssueId = (sku: string) => `returns-${digest(sku)}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function analyze(csv: string, source = 'Imported CSV', synthetic = false, assumptions: Assumptions = DEFAULT_ASSUMPTIONS): Analysis {
  if (!validAssumptions(assumptions)) throw new InputError('Discount ceiling must be an integer 0–60%; shipping subsidy must be 0–2000 integer cents.');
  const { discountCeilingPercent: ceiling, shippingSubsidyCents: subsidy } = assumptions;
  const orders = parseOrders(csv);
  const dates = orders.map(r => r.date).sort();
  const end = dates.at(-1)!;
  const cutoff = new Date(Date.parse(end) - 6 * 86400000).toISOString().slice(0, 10);
  const baselineStart = new Date(Date.parse(end) - 27 * 86400000).toISOString().slice(0, 10);
  const issues: Issue[] = [];
  const stacked = orders.filter(r => r.refund === 0 && r.promoCount >= 2 && r.discount > Math.round(r.gross * ceiling / 100));
  if (stacked.length) issues.push({
    id: 'discount-stacking', kind: 'discount', title: 'Promotions are stacking past your floor', subtitle: `${stacked.length} orders · discount guardrail`, severity: 'high',
    exposure: sum(stacked, r => r.discount - Math.round(r.gross * ceiling / 100)), rowIds: stacked.map(r => r.row),
    formula: `Σ (discount − round(gross sales × ${ceiling}%)), where promo_count ≥ 2 and refund = 0`,
    details: `Seller assumption: a ${ceiling}% discount ceiling, editable in this demo. This is not a platform policy. Only the amount above the ceiling is counted; extra promotions may be intentional.`,
    action: 'Verify discount origin and the applicable policy exception before considering a combined-discount setting or ceiling change.',
    metrics: [{ label: 'Flagged orders', value: String(stacked.length) }, { label: 'Seller-assumed ceiling', value: `${ceiling}%` }, { label: 'Average discount', value: pct(sum(stacked, r => r.discount) / sum(stacked, r => r.gross)) }],
  });
  const shipping = orders.filter(r => r.refund === 0 && r.shippingCost > r.shippingCharged + subsidy);
  if (shipping.length) issues.push({
    id: 'shipping-overrun', kind: 'shipping', title: 'Shipping is eating the order margin', subtitle: `${shipping.length} orders · fulfillment costs`, severity: 'medium',
    exposure: sum(shipping, r => r.shippingCost - r.shippingCharged - subsidy), rowIds: shipping.map(r => r.row),
    formula: `Σ max(0, shipping cost − shipping charged − $${(subsidy / 100).toFixed(2)}), where refund = 0`,
    details: `Seller assumption: a $${(subsidy / 100).toFixed(2)} shipping subsidy per kept order. This editable allowance is not a carrier rule; modeled exposure remains subject to actual rates and packaging.`,
    action: 'Audit package dimensions and carrier adjustments; compare a packaging or shipping-price test.',
    metrics: [{ label: 'Flagged orders', value: String(shipping.length) }, { label: 'Seller-assumed subsidy', value: `$${(subsidy / 100).toFixed(2)} / order` }, { label: 'Avg. shipping cost', value: `$${(sum(shipping, r => r.shippingCost) / shipping.length / 100).toFixed(2)}` }],
  });
  for (const sku of [...new Set(orders.map(r => r.sku))].sort()) {
    const recent = orders.filter(r => r.sku === sku && r.date >= cutoff);
    const baseline = orders.filter(r => r.sku === sku && r.date >= baselineStart && r.date < cutoff);
    if (recent.length < 5 || baseline.length < 10) continue;
    const returned = recent.filter(r => r.refund > 0);
    const baselineRate = baseline.filter(r => r.refund > 0).length / baseline.length;
    const recentRate = returned.length / recent.length;
    if (recentRate < 0.15 || recentRate < baselineRate + 0.1 || recentRate < baselineRate * 2) continue;
    const excess = returned.length - recent.length * baselineRate;
    issues.push({
      id: returnIssueId(sku), kind: 'returns', title: `${sku} has a return-rate spike`, subtitle: `${returned.length} recent returns · product health`, severity: 'high',
      exposure: Math.round(sum(returned, r => r.refund + r.returnCost) * excess / returned.length), rowIds: returned.map(r => r.row),
      formula: '(recent returns − recent orders × baseline return rate) × average(refund + return cost) for recent returns',
      details: `Latest 7 days (${cutoff}–${end}) versus preceding 21 days. Thresholds: ≥5 recent orders, ≥10 baseline orders, ≥15% recent return rate, +10 percentage points and ≥2× baseline. Refunds are a proxy; partial refunds count as returns. No causal or statistical-significance claim.`,
      action: 'Review return reasons and listing expectations; inspect the affected product before a small corrective test.',
      metrics: [{ label: 'Recent return rate', value: pct(recentRate) }, { label: 'Baseline rate', value: pct(baselineRate) }, { label: 'Excess returns (model)', value: excess.toFixed(2) }],
    });
  }
  issues.sort((a, b) => b.exposure - a.exposure || a.id.localeCompare(b.id));
  const totalRevenue = sum(orders, revenue);
  const totalContribution = sum(orders, contribution);
  return {
    assumptions: { ...assumptions },
    source, synthetic, currency: 'USD', orders, issues,
    totals: { gross: sum(orders, r => r.gross), revenue: totalRevenue, contribution: totalContribution, margin: totalRevenue ? totalContribution / totalRevenue : 0, opportunity: issues.reduce((s, i) => s + i.exposure, 0), returns: orders.filter(r => r.refund > 0).length },
    daily: [...new Set(dates)].map(date => { const rows = orders.filter(r => r.date === date); return { date, revenue: sum(rows, revenue), contribution: sum(rows, contribution) }; }),
    dateRange: { start: dates[0], end }, fingerprint: digest(csv).slice(0, 16),
  };
}
export function simulate(analysis: Analysis, rates: Record<string, number>) {
  const recovery = analysis.issues.reduce((s, i) => {
    const rate = rates[i.id] ?? 0;
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new InputError('Scenario rates must be between 0 and 100.');
    return s + Math.round(i.exposure * rate / 100);
  }, 0);
  return { recovery, contribution: analysis.totals.contribution + recovery, marginOnCurrentRevenue: analysis.totals.revenue ? (analysis.totals.contribution + recovery) / analysis.totals.revenue : 0 };
}
