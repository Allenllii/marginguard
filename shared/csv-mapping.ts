import { parse } from 'csv-parse/browser/esm/sync';

export const CSV_FIELDS = [
  { key: 'order_id', label: 'Order ID', help: 'Unique order ID; letters, numbers, _ or -. One order per row.' },
  { key: 'order_date', label: 'Order date', help: 'Real calendar date in YYYY-MM-DD format.' },
  { key: 'sku', label: 'SKU', help: 'Product label; letters, numbers, spaces, dots, _ or -.' },
  { key: 'category', label: 'Category', help: 'Product category; the same simple-text rules as SKU.' },
  { key: 'gross_sales', label: 'Gross sales', help: 'Merchandise sales before discounts/refunds, excluding tax and shipping.' },
  { key: 'discount', label: 'Discount amount', help: 'Total merchandise discount for the order, in USD.' },
  { key: 'promo_count', label: 'Promotion count', help: 'Actual number of promotions applied, an integer from 0 to 10.' },
  { key: 'cogs', label: 'Cost of goods sold', help: 'Total order COGS in USD, including returned merchandise.' },
  { key: 'shipping_charged', label: 'Shipping charged', help: 'Shipping fee paid by the customer, in USD.' },
  { key: 'shipping_cost', label: 'Shipping cost', help: 'Actual carrier cost for the order, in USD.' },
  { key: 'refund', label: 'Refund amount', help: 'Merchandise refunded, excluding shipping and tax, in USD.' },
  { key: 'return_cost', label: 'Return handling cost', help: 'Return handling cost in USD; only allowed with a refund.' },
] as const;

export type CsvField = typeof CSV_FIELDS[number]['key'];
export type CsvMapping = Partial<Record<CsvField, number>>;
export interface ParsedCsv { headers: string[]; rows: string[][]; }
const MAX_BYTES = 2 * 1024 * 1024;
const byteLength = (text: string) => new TextEncoder().encode(text).byteLength;

// This is a header adapter, not an order aggregator or a financial converter.
export function readMappingCsv(text: string): ParsedCsv {
  if (byteLength(text) > MAX_BYTES) throw new Error('CSV exceeds the 2 MB limit.');
  let records: string[][];
  try {
    records = parse(text, { bom: true, trim: true, skip_empty_lines: true, max_record_size: 65536 });
  } catch {
    throw new Error('Invalid CSV. Check quotes, columns, and row lengths.');
  }
  const headers = records.shift();
  if (!headers?.length || headers.length > 100 || headers.some(header => !header || header.length > 128 || /[\p{Cc}\p{Cf}]/u.test(header)) || new Set(headers).size !== headers.length) {
    throw new Error('Use 1 to 100 unique, nonempty column headers, each at most 128 characters and without hidden control characters.');
  }
  if (!records.length || records.length > 10000) throw new Error('Use between 1 and 10,000 order rows.');
  return { headers, rows: records };
}

const normalized = (header: string) => header.toLowerCase().replace(/[ _-]/g, '');
export function suggestMapping(headers: string[]): CsvMapping {
  const mapping: CsvMapping = {};
  for (const field of CSV_FIELDS) {
    const aliases = new Set([normalized(field.key), normalized(field.label)]);
    const candidates = headers.flatMap((header, index) => aliases.has(normalized(header)) ? [index] : []);
    // Ambiguity stays visible for the seller to resolve.
    if (candidates.length === 1) mapping[field.key] = candidates[0];
  }
  return mapping;
}

export function mappingProblems(parsed: ParsedCsv, mapping: CsvMapping): string[] {
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) return ['Choose a source column for every required field.'];
  if (Object.keys(mapping).some(key => !CSV_FIELDS.some(field => field.key === key))) return ['Unknown destination field; use only the 12 analysis columns.'];
  const problems: string[] = [];
  const selected = new Set<number>();
  for (const field of CSV_FIELDS) {
    const index = Object.hasOwn(mapping, field.key) ? mapping[field.key] : undefined;
    if (index === undefined || !Number.isInteger(index) || index < 0 || index >= parsed.headers.length) {
      problems.push(`Choose a source column for ${field.label}.`);
    } else if (selected.has(index)) {
      problems.push(`Use a different source column for ${field.label}; each source column can be used once.`);
    } else selected.add(index);
  }
  return problems;
}

const escapeCell = (value: string) => /[",\r\n]|^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
export function buildMappedCsv(parsed: ParsedCsv, mapping: CsvMapping): string {
  const problems = mappingProblems(parsed, mapping);
  if (problems.length) throw new Error(problems[0]);
  const text = [CSV_FIELDS.map(field => field.key).join(','), ...parsed.rows.map(row => CSV_FIELDS.map(field => {
    const value = row[mapping[field.key]!];
    if (value === undefined) throw new Error('A source row is missing a mapped value.');
    return escapeCell(value);
  }).join(','))].join('\n');
  if (byteLength(text) > MAX_BYTES) throw new Error('Mapped CSV exceeds the 2 MB limit.');
  return text;
}

export const SYNTHETIC_MAPPING_CSV = [
  'Order ID,Order date,SKU,Category,Gross sales,Discount amount,Promotion count,Cost of goods sold,Shipping charged,Shipping cost,Refund amount,Return handling cost,Customer email',
  'SAMPLE_1,2026-09-27,CANDLE,Home,100.00,30.00,2,35.00,5.00,10.00,0.00,0.00,synthetic@example.com',
  'SAMPLE_2,2026-09-28,MUG,Home,40.00,0.00,0,12.00,4.00,5.00,0.00,0.00,synthetic@example.com',
].join('\n');
