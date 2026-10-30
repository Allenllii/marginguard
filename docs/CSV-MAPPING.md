# CSV column mapping

The Data & method page includes a CSV mapping assistant for order-level exports with different column names. It selects and renames fields, then reuses the existing strict order validator. It does not change the analysis API, money calculations, policy rules or provider behavior.

## Try the feature

1. Open **Data & method**, or use the mobile navigation menu.
2. In **Different column names? Map your CSV.**, choose a CSV or **Try synthetic mapping example**.
3. Review all 12 source-column selections, first-row samples, field definitions and excluded columns. Explicitly acknowledge each excluded column, then confirm the field meanings. Suggestions match only canonical names and narrow field-label equivalents; ambiguous matches remain unselected.
4. Confirm the field meanings, USD currency and one-order-per-row structure. Choose **Validate mapped CSV locally**.
5. Download the exact mapped CSV, or choose **Analyze mapped CSV** to send its 12 selected columns to the existing app server. The server validates it again.

The built-in example is two authored synthetic orders and an extra synthetic email column. That email column is excluded by default. Directly analyzing this example keeps the dataset and report marked synthetic; it provides a feature demonstration, not customer validation.

Recalculating seller assumptions on that same dataset preserves its known synthetic origin. Importing a new file starts a separate dataset and does not inherit that annotation. The integration regression exports reports after both operations to check this distinction.

## Data boundary and limitations

- File reading, column suggestions, preview and first validation run in browser memory. No new storage, telemetry or provider request is added. Unselected columns are omitted from the generated CSV and the analysis request.
- The same 12 analysis fields remain required. Missing COGS, actual shipping costs, refund handling or promotion counts must be supplied from the seller's own records. The assistant does not fill zeros or estimate them.
- This is not a complete Shopify or WooCommerce export converter. It does not group line items, infer column semantics, convert currency or dates, split tax/shipping out of totals, or reconcile mixed-currency records.
- Amounts and labels retain the existing validator's restrictions. Decimal strings are not recalculated. Quoted leading/trailing whitespace is preserved so the original strict validator can reject invalid values rather than silently repairing them.
- Source input is limited to 2 MiB, 100 distinct nonempty headers and 10,000 rows. Mapped output also has a 2 MiB ceiling and must pass the original parser's record limits.
- Hidden control/direction characters in headers are rejected. Ordinary Unicode labels remain available for explicit mapping; their meanings are never guessed.
- Row order is preserved, blank lines are removed, and mapped columns use canonical order. Evidence row numbers and the dataset fingerprint therefore refer to the mapped CSV, not byte positions in the original export. Download that file for the evidence source.
- Mapping state is transient and is cleared when leaving the Data & method view. A downloaded/re-uploaded synthetic file uses the ordinary CSV importer, which cannot infer whether a user-supplied file is synthetic.

## Verification

Base revision: `868ff2e813ff21f33edf713bd46eebae506ca865`.

```powershell
npm run lint
npm run build
npm test

# Independent local offline QA server; no .env file is loaded by this command.
$env:PORT = '4317'
node --import tsx server/index.ts --production --offline-qa

# In another terminal:
npx playwright test --config playwright.csv-mapping.config.ts

# Full integrated UI regressions (including CSV mapping) against the same server:
$env:MARGINGUARD_TEST_URL = 'http://127.0.0.1:4317'
npx playwright test --config playwright.config.ts --output test-results/existing
```

The mapping unit suite checks schema agreement, exact financial equivalence after reordering, CSV quoting and whitespace, excluded-column removal, ambiguous and duplicate mappings, byte/row/header limits, and downstream rejections of unsafe labels, invalid money, dates and duplicate orders.

Labels such as Total, Net sales, Cost per item and Shipping method are not inferred as financial fields. The default `npm run test:ui` suite includes the mapping regressions, and its separate configuration remains available for focused checks.

The mapping browser suite checks desktop and 320px layouts, associated field labels, keyboard focus, confirmation invalidation after edits, no POST during preview/validation/download, exact submitted CSV equality, excluded-column removal, synthetic report labeling and local validation failures. Screenshot and JSON evidence are generated locally by these tests. These are development regressions, not the final benchmark or real-user research.
