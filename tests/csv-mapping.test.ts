import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, HEADERS, parseOrders } from '../server/analysis.js';
import { CSV_FIELDS, buildMappedCsv, mappingProblems, readMappingCsv, suggestMapping, type CsvMapping, type ParsedCsv } from '../shared/csv-mapping.js';

const values = ['MG-0001', '2026-09-01', 'EXAMPLE', 'Accessories', '100.00', '10.0', '1', '30.00', '4.90', '6.50', '0.00', '0.00'];
const csv = (row = values) => [HEADERS.join(','), row.join(',')].join('\n');
const canonicalMapping = (): CsvMapping => Object.fromEntries(HEADERS.map((field, index) => [field, index]));

test('mapping fields match the existing 12-column calculation contract', () => {
  assert.deepEqual(CSV_FIELDS.map(field => field.key), HEADERS);
  assert.ok(CSV_FIELDS.every(field => field.label.trim() && field.help.trim()));
});

test('reader handles BOM, CRLF, quoted values, whitespace and embedded quotes without losing content', () => {
  const parsed = readMappingCsv('\uFEFFOrder ID,Notes\r\n"  MG-1  ","Please leave at the door, then say ""hello"""\r\n');
  assert.deepEqual(parsed.headers, ['Order ID', 'Notes']);
  assert.deepEqual(parsed.rows, [['  MG-1  ', 'Please leave at the door, then say "hello"']]);
  assert.deepEqual(readMappingCsv('Order ID, Notes\n  MG-1  ,  plain note  ').rows, [['MG-1', 'plain note']]);
});

test('canonical header suggestions are case and separator tolerant but omit ambiguous matches', () => {
  const friendly = ['Order ID', 'Order Date', 'SKU', 'Category', 'Gross Sales', 'Discount', 'Promo Count', 'COGS', 'Shipping Charged', 'Shipping Cost', 'Refund', 'Return Cost'];
  assert.deepEqual(suggestMapping(friendly), canonicalMapping());
  const ambiguous = suggestMapping(['order_id', 'Order ID', 'order_date', 'customer_email']);
  assert.equal(ambiguous.order_id, undefined);
  assert.equal(ambiguous.order_date, 2);
  assert.equal(Object.keys(ambiguous).length, 1);
});

test('mapping suggestions never infer financial semantics from totals, net sales or unit costs', () => {
  assert.deepEqual(suggestMapping(['Total', 'Net sales', 'Subtotal', 'Order total', 'Discount code', 'Cost per item', 'Line item price', 'Shipping method', 'Customer name', 'Email']), {});
  const ambiguous = suggestMapping(['gross_sales', 'Gross sales', 'COGS', 'c_o_g_s']);
  assert.equal(ambiguous.gross_sales, undefined);
  assert.equal(ambiguous.cogs, undefined);
});

test('headers reject hidden controls while ordinary Unicode column labels can be reviewed explicitly', () => {
  for (const header of ['SKU\u202E', 'Order\u200BID', 'Name\u0000', 'Name\t']) {
    assert.throws(() => readMappingCsv(`"${header}",note\nA,B`));
  }
  const parsed = readMappingCsv('订单编号,备注\nA,B');
  assert.deepEqual(parsed.headers, ['订单编号', '备注']);
  assert.deepEqual(suggestMapping(parsed.headers), {});
});

test('mapping validates its own field names and requires own source selections', () => {
  const parsed = readMappingCsv(csv());
  for (const mapping of [null, [], { ...canonicalMapping(), customer_email: 0 }, Object.create(canonicalMapping())]) {
    assert.ok(mappingProblems(parsed, mapping as CsvMapping).length);
    assert.throws(() => buildMappedCsv(parsed, mapping as CsvMapping));
  }
});

test('reordered columns map to the same exact contribution and source values', () => {
  const parsed = readMappingCsv([HEADERS.toReversed().join(','), values.toReversed().join(',')].join('\n'));
  const output = buildMappedCsv(parsed, suggestMapping(parsed.headers));
  const converted = readMappingCsv(output);
  assert.deepEqual(converted.headers, HEADERS);
  assert.deepEqual(converted.rows, [values]);
  assert.deepEqual(parseOrders(output), parseOrders(csv()));
  assert.deepEqual(analyze(output).totals, analyze(csv()).totals);
});

test('mapped export excludes unmapped sensitive columns and retains all required amounts', () => {
  const parsed = readMappingCsv(`${HEADERS.join(',')},customer_email\n${values.join(',')},merchant-private@example.test`);
  const output = buildMappedCsv(parsed, suggestMapping(parsed.headers));
  assert.ok(!output.includes('customer_email'));
  assert.ok(!output.includes('merchant-private'));
  assert.deepEqual(readMappingCsv(output).rows, [values]);
  assert.equal(parseOrders(output)[0].shippingCharged, 490);
});

test('missing fields, repeated source columns and invalid source indices prevent conversion', () => {
  const parsed = readMappingCsv(csv());
  const missing = canonicalMapping();
  delete missing.cogs;
  for (const mapping of [missing, { ...canonicalMapping(), cogs: 4 }, ...[-1, 12, 0.5, NaN].map(index => ({ ...canonicalMapping(), cogs: index }))]) {
    assert.ok(mappingProblems(parsed, mapping).length > 0);
    assert.throws(() => buildMappedCsv(parsed, mapping));
  }
  assert.deepEqual(mappingProblems(parsed, canonicalMapping()), []);
});

test('CSV escaping preserves commas, quotes and newlines rather than altering merchant values', () => {
  const unusual = [...values];
  unusual[2] = 'Item, "quoted"\nsecond line';
  const parsed: ParsedCsv = { headers: [...HEADERS], rows: [unusual] };
  const output = buildMappedCsv(parsed, canonicalMapping());
  assert.deepEqual(readMappingCsv(output).rows, [unusual]);
  assert.throws(() => parseOrders(output));
});

test('reader rejects duplicate or empty headers, malformed quoting and inconsistent row width', () => {
  for (const input of ['sku,sku\nA,B', 'sku,\nA,B', ',sku\nA,B', 'sku,note\nA,"unterminated', 'sku,note\nA,B,C', 'sku,note\nA']) {
    assert.throws(() => readMappingCsv(input), input);
  }
});

test('reader enforces nonempty data, 100-column and 10,000-order limits', () => {
  for (const input of ['', 'sku', 'sku\n', Array.from({ length: 101 }, (_, i) => `column_${i}`).join(',') + '\n' + Array.from({ length: 101 }, () => 'A').join(','), 'sku\n' + Array.from({ length: 10001 }, () => 'A').join('\n')]) {
    assert.throws(() => readMappingCsv(input));
  }
  assert.equal(readMappingCsv('sku\n' + Array.from({ length: 10000 }, () => 'A').join('\n')).rows.length, 10000);
});

test('input and mapped output both enforce the 2 MiB byte ceiling', () => {
  assert.throws(() => readMappingCsv('sku\n' + 'x'.repeat(2 * 1024 * 1024)));
  const oversizedValues = [...values];
  oversizedValues[2] = 'x'.repeat(2 * 1024 * 1024);
  assert.throws(() => buildMappedCsv({ headers: [...HEADERS], rows: [oversizedValues] }, canonicalMapping()));
});

test('mapping does not silently repair unsafe labels, invalid amounts or impossible dates', () => {
  const variants = [
    { index: 0, value: ' MG-0001 ' },
    { index: 2, value: '=IMPORTXML(unsafe)' },
    { index: 3, value: '<script>' },
    { index: 4, value: '-1.00' },
    { index: 4, value: '$100.00' },
    { index: 4, value: '100.00 ' },
    { index: 5, value: '100.001' },
    { index: 1, value: '2026-02-30' },
    { index: 1, value: '09/01/2026' },
    { index: 6, value: '1.5' },
  ];
  for (const variant of variants) {
    const row = [...values];
    row[variant.index] = variant.value;
    const output = buildMappedCsv({ headers: [...HEADERS], rows: [row] }, canonicalMapping());
    assert.equal(readMappingCsv(output).rows[0][variant.index], variant.value);
    assert.throws(() => parseOrders(output));
  }
});

test('one-order-per-row and refund consistency still use the existing validation rules', () => {
  const duplicateOrders = readMappingCsv(`${csv()}\n${values.join(',')}`);
  assert.throws(() => parseOrders(buildMappedCsv(duplicateOrders, canonicalMapping())));
  const impossibleRefund = [...values];
  impossibleRefund[10] = '99.00';
  assert.throws(() => parseOrders(buildMappedCsv({ headers: [...HEADERS], rows: [impossibleRefund] }, canonicalMapping())));
});
