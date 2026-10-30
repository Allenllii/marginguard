import { useRef, useState, type FormEvent } from 'react';
import { ArrowDownToLine, ArrowRight, LockKeyhole, Plus, Trash2 } from 'lucide-react';
import { validatePreflightInput, type PreflightInput, type PreflightRule, type PreflightScenario } from '../shared/preflight';
import { runPreflightComparison, type PreflightComparisonResult } from '../shared/preflight-comparison';
import './preflight-comparison.css';

type RuleDraft = { id: string; type: PreflightRule['type']; scope: 'product' | 'order'; value: string; minSubtotalCents: string; minItems: string };
const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const signedMoney = (cents: number) => `${cents > 0 ? '+' : ''}${money(cents)}`;
const ruleDraft = (rule: PreflightRule): RuleDraft => ({ id: rule.id, type: rule.type, scope: rule.type === 'percent' ? rule.scope : 'order', value: String(rule.type === 'percent' ? rule.basisPoints : rule.type === 'fixed' ? rule.amountCents : 0), minSubtotalCents: String(rule.minSubtotalCents), minItems: String(rule.minItems) });
function integer(value: string, label: string) {
  if (!/^(0|[1-9]\d*)$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error(`${label}: enter a safe whole number, with no decimal, comma or exponent.`);
  return Number(value);
}
function rulesFromDraft(rules: RuleDraft[]): PreflightRule[] {
  return rules.map((rule, index) => {
    const base = { id: rule.id, minSubtotalCents: integer(rule.minSubtotalCents, `Adjusted rule ${index + 1} subtotal`), minItems: integer(rule.minItems, `Adjusted rule ${index + 1} item threshold`) };
    if (rule.type === 'percent') return { ...base, type: rule.type, scope: rule.scope, basisPoints: integer(rule.value, `Adjusted rule ${index + 1} value`) };
    if (rule.type === 'fixed') return { ...base, type: rule.type, amountCents: integer(rule.value, `Adjusted rule ${index + 1} value`) };
    return { ...base, type: rule.type };
  });
}
function ruleText(rule: PreflightRule) {
  const value = rule.type === 'percent' ? `${rule.basisPoints / 100}% ${rule.scope}` : rule.type === 'fixed' ? `${money(rule.amountCents)} off merchandise` : 'Remove charged shipping';
  return `${rule.id}: ${value}. Original subtotal ≥ ${money(rule.minSubtotalCents)}; items ≥ ${rule.minItems}.`;
}
function Ledger({ side, scenario, rules, feeBps }: { side: 'original' | 'adjusted'; scenario: PreflightScenario; rules: PreflightRule[]; feeBps: number }) {
  return <article className="pc-side">
    <p className="pf-kicker">{side === 'original' ? 'A / ORIGINAL RULES' : 'B / SELLER ADJUSTMENT'}</p>
    <h4>{side === 'original' ? 'Original contribution' : 'Adjusted contribution'}</h4>
    <strong className="pc-amount" data-testid={`comparison-${side}-contribution`}>{money(scenario.contributionCents)}</strong>
    <ol className="pf-trace pc-trace">
      <li><div><strong>Same original merchandise</strong><span>{money(scenario.subtotalCents)}</span></div></li>
      {scenario.steps.map((step, index) => <li key={step.ruleId}>
        <div><strong>{step.ruleId}</strong><span>{money(step.remainingMerchandiseCents)}</span></div>
        <p>{ruleText(rules[index])}</p>
        <p>{step.eligible ? `Applied: −${money(step.discountCents)} merchandise; −${money(step.shippingReductionCents)} shipping.` : 'Not applied.'} {step.reason}</p>
      </li>)}
      {!scenario.steps.length ? <li>No promotion rules. Merchandise remains unchanged.</li> : null}
    </ol>
    <dl className="pf-ledger">
      <div><dt>Merchandise after discount</dt><dd>{money(scenario.merchandiseCents)}</dd></div>
      <div><dt>Shipping collected</dt><dd>+{money(scenario.shippingChargedCents)}</dd></div>
      <div><dt>Revenue / fee base</dt><dd>{money(scenario.revenueCents)}</dd></div>
      <div><dt>Same COGS</dt><dd>−{money(scenario.cogsCents)}</dd></div>
      <div><dt>Same shipping cost</dt><dd>−{money(scenario.shippingCostCents)}</dd></div>
      <div><dt>Payment fee ({feeBps / 100}%)</dt><dd>−{money(scenario.paymentFeeCents)}</dd></div>
      <div className="pf-ledger-total"><dt>Contribution</dt><dd>{money(scenario.contributionCents)}</dd></div>
    </dl>
    <p className="pf-note">Percentage stages and the payment fee each round half up to one cent.</p>
  </article>;
}
function download(result: PreflightComparisonResult) {
  const report = { reportVersion: 'promo-preflight-same-cart-v1', boundary: 'Conditional same-cart model comparison only; not actual savings, sales prediction, checkout verification or launch approval.', ...result };
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'promo-preflight-comparison.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Remount with the source draft revision so every upstream edit immediately invalidates the lock. */
export default function PreflightComparison({ getInput }: { getInput: () => PreflightInput }) {
  const [source] = useState(() => { try { return getInput(); } catch { return null; } });
  const [quantities, setQuantities] = useState(() => source?.skus.map(() => String(source.maxQuantity)) ?? []);
  const [locked, setLocked] = useState<PreflightInput | null>(null);
  const [rules, setRules] = useState<RuleDraft[]>([]);
  const [reference, setReference] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<PreflightComparisonResult | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('Choose exact quantities, then lock the current inputs for both sides.');
  const reportRef = useRef<HTMLElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  function invalidate() {
    setResult(null); setError(''); setConfirmed(false);
    setNotice('Comparison inputs changed. Previous results are cleared. Review and compare again.');
  }
  function lock() {
    invalidate();
    try {
      const input = validatePreflightInput(getInput());
      // Validate quantities before advertising a lock, using the same comparison boundary.
      runPreflightComparison({ input, quantities: quantities.map((value, index) => integer(value, `Quantity ${index + 1}`)), adjustedRules: input.rules, adjustmentReference: '', sellerConfirmed: false });
      setLocked(input); setRules(input.rules.map(ruleDraft)); setReference('');
      setNotice('One basket and cost snapshot locked for A and B. Adjust B, record its reference, then explicitly review it.');
    } catch (failure) {
      setLocked(null); setError(failure instanceof Error ? failure.message : 'Check the basket inputs.');
      requestAnimationFrame(() => errorRef.current?.focus());
    }
  }
  function changeRule(index: number, key: keyof RuleDraft, value: string) {
    invalidate(); setRules(previous => previous.map((rule, position) => position === index ? { ...rule, [key]: value } : rule));
  }
  function compare(event: FormEvent) {
    event.preventDefault();
    if (!locked) return;
    setResult(null); setError('');
    try {
      const next = runPreflightComparison({ input: locked, quantities: quantities.map((value, index) => integer(value, `Quantity ${index + 1}`)), adjustedRules: rulesFromDraft(rules), adjustmentReference: reference, sellerConfirmed: confirmed });
      setResult(next); setNotice(`Same-cart comparison complete. ${next.status}. Model contribution difference ${signedMoney(next.deltaCents)}.`);
      requestAnimationFrame(() => { reportRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' }); reportRef.current?.focus({ preventScroll: true }); });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Check the adjusted rules.');
      setNotice('Comparison is on HOLD. No result is available for invalid or unsupported input.');
      requestAnimationFrame(() => errorRef.current?.focus());
    }
  }
  return <section className="pc-shell" aria-labelledby="pc-title">
    <div className="pc-heading"><div><p className="pf-kicker">SAME CART / TWO RULE SETS</p><h2 id="pc-title">Compare the same cart</h2><p>Keep quantities, prices and cost conditions fixed. Change only the promotion rules you explicitly choose.</p></div><span className="pc-local"><LockKeyhole size={15} aria-hidden="true" /> Local calculation</span></div>
    <p className="pc-boundary">A conditional contribution difference for this cart. It is not actual savings, a forecast of sales or approval to launch.</p>
    <div className="pc-lock-panel">
      <h3>1. Lock the basket and cost conditions</h3>
      <p className="pf-help">Uses the SKU prices, costs, original rules, shipping, fee rate, contribution floor and evidence entered above. Edit those inputs to start a new comparison.</p>
      <div className="pc-quantities">{source?.skus.map((sku, index) => <label key={index} className="pf-field"><span>Comparison quantity for {sku.id}</span><input aria-label={`Comparison quantity for ${sku.id}`} type="text" inputMode="numeric" maxLength={2} autoComplete="off" disabled={!!locked} value={quantities[index] ?? ''} onChange={event => { invalidate(); setQuantities(previous => previous.map((value, position) => position === index ? event.target.value : value)); }} /><small>0–{source.maxQuantity}; at least one item in the cart.</small></label>)}</div>
      {!source ? <p className="pf-help">Correct the numeric basket inputs above before locking.</p> : null}
      <div className="pf-run-actions"><button type="button" className="pf-reset" onClick={lock} disabled={!!locked}>Lock current basket and costs</button>{locked ? <button type="button" className="pf-text-action" onClick={() => { invalidate(); setLocked(null); }}>Edit comparison basket</button> : null}</div>
      {locked ? <div className="pc-snapshot" data-testid="comparison-locked-snapshot"><p className="pf-kicker">ONE SNAPSHOT SHARED BY A + B</p><ul>{locked.skus.map((sku, index) => <li key={sku.id}><strong>{sku.id} × {quantities[index]}</strong> · {money(sku.priceCents)} each · {money(sku.unitCostCents)} unit cost</li>)}</ul><p>Shipping collected {money(locked.shippingChargedCents)} · shipping cost {money(locked.shippingCostCents)} · payment fee {locked.paymentFeeBps / 100}% · contribution floor {money(locked.contributionFloorCents)}.</p><p>{locked.evidence.mode === 'fixture' ? 'Synthetic inputs: HOLD remains in effect.' : 'Seller-attested inputs; references are not independently verified.'}</p></div> : null}
    </div>
    <div className="pf-error" role={error ? 'alert' : undefined} tabIndex={-1} ref={errorRef} hidden={!error}><strong>HOLD — comparison unavailable.</strong> {error}</div>
    {locked ? <form onSubmit={compare} noValidate className="pc-editor" aria-label="Same-cart rule comparison inputs">
      <section className="pc-original" aria-labelledby="pc-original-title"><p className="pf-kicker">A / LOCKED ORIGINAL</p><h3 id="pc-original-title">Original promotion rules</h3><ol>{locked.rules.map(rule => <li key={rule.id}>{ruleText(rule)}</li>)}</ol>{!locked.rules.length ? <p>No rules.</p> : null}<p className="pf-note">Order is exactly as entered above. The comparison does not select a different worst basket or search rule permutations.</p></section>
      <section aria-labelledby="pc-adjusted-title"><p className="pf-kicker">B / YOUR EXPLICIT CHOICE</p><h3 id="pc-adjusted-title">2. Adjust the rules</h3><p className="pf-help">B starts as an exact copy of A. Supported: basket percentage stages, fixed merchandise discount and free shipping. Other platform behavior is outside this model.</p>
        {rules.map((rule, index) => <fieldset key={index} className="pf-rule"><legend>Adjusted rule {index + 1}</legend>
          <div className="pf-rule-heading"><label className="pf-field"><span>Adjusted rule {index + 1} ID</span><input value={rule.id} maxLength={40} onChange={event => changeRule(index, 'id', event.target.value)} /></label><button type="button" className="pf-icon-action" aria-label={`Remove adjusted rule ${index + 1}`} onClick={() => { invalidate(); setRules(previous => previous.filter((_, position) => position !== index)); }}><Trash2 size={16} aria-hidden="true" /></button></div>
          <div className="pc-rule-fields"><label className="pf-field"><span>Adjusted rule {index + 1} type</span><select value={rule.type} onChange={event => changeRule(index, 'type', event.target.value)}><option value="percent">Percentage</option><option value="fixed">Fixed discount</option><option value="free_shipping">Free shipping</option></select></label>
            {rule.type !== 'free_shipping' ? <label className="pf-field"><span>Adjusted rule {index + 1} value</span><input aria-label={`Adjusted rule ${index + 1} value`} type="text" inputMode="numeric" maxLength={15} value={rule.value} onChange={event => changeRule(index, 'value', event.target.value)} /><small>{rule.type === 'percent' ? 'Basis points: 2000 = 20%; max 10000.' : 'Integer cents; max 1000000.'}</small></label> : null}
            {rule.type === 'percent' ? <label className="pf-field"><span>Adjusted rule {index + 1} scope</span><select value={rule.scope} onChange={event => changeRule(index, 'scope', event.target.value)}><option value="product">Product stage</option><option value="order">Order stage</option></select></label> : null}
          </div>
          <div className="pf-thresholds"><label className="pf-field"><span>Adjusted rule {index + 1} minimum subtotal</span><input type="text" inputMode="numeric" maxLength={15} value={rule.minSubtotalCents} onChange={event => changeRule(index, 'minSubtotalCents', event.target.value)} /><small>Original merchandise cents</small></label><label className="pf-field"><span>Adjusted rule {index + 1} minimum items</span><input type="text" inputMode="numeric" maxLength={2} value={rule.minItems} onChange={event => changeRule(index, 'minItems', event.target.value)} /></label></div>
        </fieldset>)}
        {!rules.length ? <p className="pf-note">B has no promotion rules.</p> : null}
        <button type="button" className="pf-text-action" disabled={rules.length >= 3} onClick={() => { invalidate(); let index = 1; while (rules.some(rule => rule.id.toLowerCase() === `adjusted-${index}`)) index++; setRules(previous => [...previous, { id: `ADJUSTED-${index}`, type: 'percent', scope: 'order', value: '0', minSubtotalCents: '0', minItems: '0' }]); }}><Plus size={15} aria-hidden="true" /> Add adjusted rule</button>
        <label className="pf-field"><span>Adjustment evidence reference</span><input aria-label="Adjustment evidence reference" value={reference} maxLength={240} placeholder="Your authored rule revision or experiment reference" onChange={event => { invalidate(); setReference(event.target.value); }} /><small>Plain text attestation. Do not paste customer information or secrets.</small></label>
        <label className="pf-check"><input type="checkbox" checked={confirmed} onChange={event => { setResult(null); setError(''); setConfirmed(event.target.checked); setNotice('Review updated. Run the comparison to calculate.'); }} /><span>I explicitly chose and reviewed the adjusted rules for this simulation</span></label>
        <button type="submit" className="pf-run">Compare original and adjusted rules <ArrowRight size={16} aria-hidden="true" /></button>
      </section>
    </form> : null}
    <p className="pf-notice pc-notice" aria-live="polite">{notice}</p>
    {result ? <section className="pc-report" aria-label="Same-cart comparison report" tabIndex={-1} ref={reportRef}>
      <div className="pc-report-heading"><h3>3. Same-cart comparison report</h3><span className={`pf-pill ${result.status === 'MODEL_CLEAR' ? 'pf-pill-green' : 'pf-pill-warm'}`} data-testid="comparison-status">{result.status}</span></div>
      <div className="pc-delta"><span>Modeled contribution difference · B − A</span><strong data-testid="comparison-delta">{signedMoney(result.deltaCents)}</strong><p>{result.deltaCents === 0 ? 'No modeled contribution change for this cart.' : 'Conditional on the same cart and cost conditions recorded above.'} No demand response or realized savings is modeled.</p></div>
      {result.holdReasons.length ? <div className="pf-hold"><h4>Why this comparison stays on HOLD</h4><ul>{result.holdReasons.map(reason => <li key={reason}>{reason}</li>)}</ul><p>The numbers remain conditional calculations, not a recommendation.</p></div> : <p className="pc-boundary">{result.riskBreach ? 'At least one side is below the supplied contribution floor. Review the risk.' : 'Both sides meet the supplied floor in this limited model.'} Checkout execution remains unverified.</p>}
      <div className="pc-sides"><Ledger side="original" scenario={result.original} rules={result.input.rules} feeBps={result.input.paymentFeeBps} /><Ledger side="adjusted" scenario={result.adjusted} rules={result.adjustedRules} feeBps={result.input.paymentFeeBps} /></div>
      <details className="pf-details"><summary>Shared assumptions, formula and references</summary><p className="pf-formula">{result.formula}</p><ul>{result.assumptions.map(assumption => <li key={assumption}>{assumption}</li>)}</ul><dl className="pf-reference-list"><div><dt>Prices / costs · A + B</dt><dd>{result.input.evidence.costsReference || 'Missing'}</dd></div><div><dt>Original rules · A</dt><dd>{result.input.evidence.rulesReference || 'Missing'}</dd></div><div><dt>Shipping / fees · A + B</dt><dd>{result.input.evidence.operationsReference || 'Missing'}</dd></div><div><dt>Adjusted rules · B</dt><dd>{result.adjustmentReference || 'Missing'}</dd></div></dl><p>References are supplied attestations, not fetched documents. This comparison makes no provider requests.</p></details>
      <button type="button" className="pf-export" onClick={() => download(result)}><ArrowDownToLine size={16} aria-hidden="true" /> Download comparison JSON</button>
    </section> : null}
  </section>;
}
