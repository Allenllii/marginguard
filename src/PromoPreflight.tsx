import { useRef, useState, type FormEvent } from 'react';
import { ArrowDownToLine, ArrowRight, FlaskConical, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { PREFLIGHT_FIXTURE, runPreflight, type PreflightInput, type PreflightResult } from '../shared/preflight';
import './promo-preflight.css';
import PreflightSponsorBridge, { type BridgeAudit } from './PreflightSponsorBridge';
import PreflightComparison from './PreflightComparison';

type SkuDraft = { id: string; priceCents: string; unitCostCents: string };
type RuleDraft = { id: string; type: 'percent' | 'fixed' | 'free_shipping'; scope: 'product' | 'order'; value: string; minSubtotalCents: string; minItems: string };
type Draft = {
  skus: SkuDraft[]; rules: RuleDraft[]; maxQuantity: string; shippingChargedCents: string; shippingCostCents: string;
  paymentFeeBps: string; contributionFloorCents: string; sellerAttested: boolean;
  costsReference: string; rulesReference: string; operationsReference: string; semanticsConfirmed: boolean;
};

const usd = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

function fixtureDraft(): Draft {
  return {
    skus: PREFLIGHT_FIXTURE.skus.map(sku => ({ id: sku.id, priceCents: String(sku.priceCents), unitCostCents: String(sku.unitCostCents) })),
    rules: PREFLIGHT_FIXTURE.rules.map(rule => ({ id: rule.id, type: rule.type, scope: rule.type === 'percent' ? rule.scope : 'order', value: String(rule.type === 'percent' ? rule.basisPoints : rule.type === 'fixed' ? rule.amountCents : 0), minSubtotalCents: String(rule.minSubtotalCents), minItems: String(rule.minItems) })),
    maxQuantity: String(PREFLIGHT_FIXTURE.maxQuantity), shippingChargedCents: String(PREFLIGHT_FIXTURE.shippingChargedCents),
    shippingCostCents: String(PREFLIGHT_FIXTURE.shippingCostCents), paymentFeeBps: String(PREFLIGHT_FIXTURE.paymentFeeBps),
    contributionFloorCents: String(PREFLIGHT_FIXTURE.contributionFloorCents), sellerAttested: false,
    costsReference: '', rulesReference: '', operationsReference: '', semanticsConfirmed: false,
  };
}

function nextIdentifier(prefix: string, used: string[]) {
  let index = 1;
  const ids = new Set(used.map(id => id.toLowerCase()));
  while (ids.has(`${prefix}-${index}`.toLowerCase())) index++;
  return `${prefix}-${index}`;
}

function integer(value: string, label: string, signed = false) {
  if (!(signed ? /^-?(0|[1-9]\d*)$/ : /^(0|[1-9]\d*)$/).test(value)) throw new Error(`${label}: enter a whole number${signed ? '' : ' of zero or more'}. Use cents or basis points, with no decimal, comma or exponent.`);
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error(`${label}: the number is too large.`);
  return result;
}

function toInput(draft: Draft): PreflightInput {
  return {
    currency: 'USD',
    skus: draft.skus.map((sku, index) => ({ id: sku.id, priceCents: integer(sku.priceCents, `SKU ${index + 1} price`), unitCostCents: integer(sku.unitCostCents, `SKU ${index + 1} unit cost`) })),
    maxQuantity: integer(draft.maxQuantity, 'Quantity limit'),
    rules: draft.rules.map((rule, index) => {
      const common = { id: rule.id, minSubtotalCents: integer(rule.minSubtotalCents, `Rule ${index + 1} subtotal threshold`), minItems: integer(rule.minItems, `Rule ${index + 1} item threshold`) };
      if (rule.type === 'percent') return { ...common, type: 'percent' as const, scope: rule.scope, basisPoints: integer(rule.value, `Rule ${index + 1} percentage`) };
      if (rule.type === 'fixed') return { ...common, type: 'fixed' as const, amountCents: integer(rule.value, `Rule ${index + 1} fixed discount`) };
      return { ...common, type: 'free_shipping' as const };
    }),
    shippingChargedCents: integer(draft.shippingChargedCents, 'Customer shipping charge'),
    shippingCostCents: integer(draft.shippingCostCents, 'Shipping cost'),
    paymentFeeBps: integer(draft.paymentFeeBps, 'Payment fee'), contributionFloorCents: integer(draft.contributionFloorCents, 'Contribution floor', true),
    evidence: { mode: draft.sellerAttested ? 'user' : 'fixture', semantics: draft.semanticsConfirmed ? 'explicit_simulation' : 'unknown', costsReference: draft.costsReference, rulesReference: draft.rulesReference, operationsReference: draft.operationsReference },
  };
}

function exportAudit(result: PreflightResult, bridge: BridgeAudit | null) {
  const report = {
    reportVersion: 'promo-preflight-sandbox-v1', generatedAt: new Date().toISOString(),
    boundary: 'User-specified simulation only. Provider preparation, when present, is recorded separately. No checkout validation, store connection, order, configuration change or realized savings.',
    bridge,
    ...result,
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = 'promo-preflight-audit.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function NumberField({ label, value, onChange, hint, signed = false }: { label: string; value: string; onChange: (value: string) => void; hint?: string; signed?: boolean }) {
  return <label className="pf-field"><span>{label}</span><input type="text" inputMode={signed ? 'text' : 'numeric'} value={value} onChange={event => onChange(event.target.value)} autoComplete="off" spellCheck={false} maxLength={15} />{hint ? <small>{hint}</small> : null}</label>;
}

export default function PromoPreflight({ workspaceActive = true }: { workspaceActive?: boolean }) {
  const [draft, setDraft] = useState<Draft>(fixtureDraft);
  const [result, setResult] = useState<PreflightResult | null>(null);
  const [error, setError] = useState('');
  const [draftVersion, setDraftVersion] = useState(0);
  const [bridgeAudit, setBridgeAudit] = useState<BridgeAudit | null>(null);
  const [notice, setNotice] = useState('Synthetic example loaded. Run the collision test to inspect its full audit.');
  const errorRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLElement>(null);

  function edit(change: (previous: Draft) => Draft) {
    setDraft(change); setResult(null); setError('');
    setDraftVersion(previous => previous + 1); setBridgeAudit(null);
    setNotice('Inputs changed. Run the collision test to recalculate; the previous result has been cleared.');
  }
  function scalar(key: 'maxQuantity' | 'shippingChargedCents' | 'shippingCostCents' | 'paymentFeeBps' | 'contributionFloorCents' | 'costsReference' | 'rulesReference' | 'operationsReference', value: string) {
    edit(previous => ({ ...previous, [key]: value }));
  }
  function skuField(index: number, key: keyof SkuDraft, value: string) {
    edit(previous => ({ ...previous, skus: previous.skus.map((sku, i) => i === index ? { ...sku, [key]: value } : sku) }));
  }
  function ruleField(index: number, key: keyof RuleDraft, value: string) {
    edit(previous => ({ ...previous, rules: previous.rules.map((rule, i) => i === index ? { ...rule, [key]: value } : rule) }));
  }
  function run(event: FormEvent) {
    event.preventDefault();
    try {
      const next = runPreflight(toInput(draft));
      setResult(next); setError(''); setNotice(`Test complete: ${next.searchSpace.scenarios} bounded scenarios. Decision ${next.status}.`);
      requestAnimationFrame(() => {
        resultRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
        resultRef.current?.focus({ preventScroll: true });
      });
    } catch (failure) {
      setResult(null); setError(failure instanceof Error ? failure.message : 'The simulation could not run. Check your inputs.');
      setNotice(''); requestAnimationFrame(() => errorRef.current?.focus());
    }
  }
  function loadFixture() {
    setDraft(fixtureDraft()); setResult(null); setError('');
    setDraftVersion(previous => previous + 1); setBridgeAudit(null);
    setNotice('Synthetic example restored. Run the collision test to calculate its audit.');
  }
  const worst = result?.worst;
  const basketLimit = (Number(draft.maxQuantity) + 1) ** draft.skus.length - 1;

  return <div className="pf-shell">
    <nav className="pf-back" aria-label="Return to analysis"><a href="#">← Back to analysis</a><span>MarginGuard / Promo Preflight</span></nav>
    <header className="pf-hero">
      <div className="pf-hero-copy">
        <p className="pf-eyebrow"><FlaskConical size={15} aria-hidden="true" /> PROMO PREFLIGHT <span>LOCAL MONEY ENGINE</span></p>
        <h1>Collision-test a promotion<br className="pf-wide-break" /> before launch.</h1>
        <p className="pf-intro">Start with a basket. Stack your proposed rules. Inspect the contribution left behind before anyone checks out.</p>
        <div className="pf-bound"><ShieldCheck size={17} aria-hidden="true" /><p>Explicit seller simulations. No store connection, checkout validation, orders or configuration changes. Policy/model preparation requires separate consent; money comes from your inputs.</p></div>
      </div>
      <aside className="pf-golden" aria-label="Synthetic example walkthrough">
        <p className="pf-kicker">SYNTHETIC EXAMPLE · 1 ITEM</p>
        <div className="pf-golden-path"><span>$50.00<small>Price</small></span><ArrowRight size={16} aria-hidden="true" /><span>$40.00<small>20% product</small></span><ArrowRight size={16} aria-hidden="true" /><span>$32.00<small>20% order</small></span></div>
        <div className="pf-golden-outcome"><div><span>Then free shipping</span><strong>-$6.00</strong><small>Modeled contribution</small></div><span className="pf-pill pf-pill-warm">HOLD</span></div>
        <p>$30.00 COGS + $8.00 shipping cost; fee 0%. Baseline contribution $20.00. Remove the order discount: <strong>+$2.00</strong>.</p>
        <small>Assumed combination eligibility and sequence. Seller confirmation required; this is not a real checkout result.</small>
      </aside>
    </header>

    <PreflightSponsorBridge key={`${draftVersion}:${workspaceActive}`} active={workspaceActive} getInput={() => toInput(draft)} onConfirmed={(confirmed, audit) => {
      setDraft(previous => ({ ...previous, rules: confirmed.input.rules.map(rule => ({ id: rule.id, type: rule.type, scope: rule.type === 'percent' ? rule.scope : 'order', value: String(rule.type === 'percent' ? rule.basisPoints : rule.type === 'fixed' ? rule.amountCents : 0), minSubtotalCents: String(rule.minSubtotalCents), minItems: String(rule.minItems) })) }));
      setDraftVersion(previous => previous + 1); setResult(confirmed); setBridgeAudit(audit); setError(''); setNotice(`Rules explicitly confirmed for simulation. ${confirmed.searchSpace.scenarios} bounded scenarios; ${confirmed.status}.`);
      requestAnimationFrame(() => { resultRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' }); resultRef.current?.focus({ preventScroll: true }); });
    }} />
    {bridgeAudit ? <div className="pf-notice" data-testid="preflight-bridge-provenance">{bridgeAudit.mode === 'fixture' ? 'Offline fixture confirmed' : 'Live preparation confirmed'} · {bridgeAudit.providerAttempts} provider attempts · Money calculated by the integer engine. Checkout remains HOLD.</div> : null}
    <main className="pf-layout" aria-label="Promotion collision sandbox">
      <form className="pf-form" onSubmit={run} noValidate aria-label="Promotion simulation inputs">
        <section className="pf-card" aria-labelledby="pf-basket-title">
          <div className="pf-section-top"><div><p className="pf-kicker">01 / BASKET BOUNDARY</p><h2 id="pf-basket-title">Small enough to audit completely.</h2></div><span className="pf-count">{draft.skus.length} / 3 SKUs</span></div>
          <p className="pf-help">Amounts are integer USD cents: 5000 = $50.00. Every nonempty basket from zero to your quantity limit per SKU is tested.</p>
          {draft.skus.map((sku, index) => <fieldset className="pf-input-row" key={index}>
            <legend>SKU {index + 1}</legend>
            <label className="pf-field"><span>SKU {index + 1} ID</span><input value={sku.id} onChange={event => skuField(index, 'id', event.target.value)} maxLength={40} autoComplete="off" spellCheck={false} /></label>
            <NumberField label={`SKU ${index + 1} price (cents)`} value={sku.priceCents} onChange={value => skuField(index, 'priceCents', value)} />
            <NumberField label={`SKU ${index + 1} unit cost (cents)`} value={sku.unitCostCents} onChange={value => skuField(index, 'unitCostCents', value)} />
            {draft.skus.length > 1 ? <button type="button" className="pf-icon-action" aria-label={`Remove SKU ${index + 1}`} onClick={() => edit(previous => ({ ...previous, skus: previous.skus.filter((_, i) => i !== index) }))}><Trash2 size={16} aria-hidden="true" /></button> : null}
          </fieldset>)}
          <div className="pf-inline-controls"><button type="button" className="pf-text-action" disabled={draft.skus.length >= 3} onClick={() => edit(previous => ({ ...previous, skus: [...previous.skus, { id: nextIdentifier('SKU', previous.skus.map(sku => sku.id)), priceCents: '5000', unitCostCents: '3000' }] }))}><Plus size={15} aria-hidden="true" /> Add SKU</button><label className="pf-field pf-quantity"><span>Quantity limit per SKU</span><select value={draft.maxQuantity} onChange={event => scalar('maxQuantity', event.target.value)}>{[1, 2, 3].map(quantity => <option key={quantity} value={quantity}>{quantity}</option>)}</select></label></div>
        </section>

        <section className="pf-card" aria-labelledby="pf-rule-title">
          <div className="pf-section-top"><div><p className="pf-kicker">02 / PROPOSED RULES</p><h2 id="pf-rule-title">Make every stacking assumption visible.</h2></div><span className="pf-count">{draft.rules.length} / 3 rules</span></div>
          <p className="pf-help">These are simulated rules you supply. Percentages use basis points: 2000 = 20%. Product and order labels both reduce remaining basket merchandise in this limited model.</p>
          {draft.rules.map((rule, index) => <fieldset className="pf-rule" key={index}>
            <legend>Rule {index + 1}</legend><div className="pf-rule-heading"><label className="pf-field"><span>Rule {index + 1} ID</span><input value={rule.id} onChange={event => ruleField(index, 'id', event.target.value)} maxLength={40} autoComplete="off" spellCheck={false} /></label><button type="button" className="pf-icon-action" aria-label={`Remove rule ${index + 1}`} onClick={() => edit(previous => ({ ...previous, rules: previous.rules.filter((_, i) => i !== index) }))}><Trash2 size={16} aria-hidden="true" /></button></div>
            <div className="pf-rule-grid"><label className="pf-field"><span>Rule {index + 1} type</span><select value={rule.type} onChange={event => ruleField(index, 'type', event.target.value)}><option value="percent">Percentage discount</option><option value="fixed">Fixed discount</option><option value="free_shipping">Free shipping</option></select></label>
              {rule.type === 'percent' ? <><label className="pf-field"><span>Rule {index + 1} scope label</span><select value={rule.scope} onChange={event => ruleField(index, 'scope', event.target.value)}><option value="product">Product</option><option value="order">Order</option></select></label><NumberField label={`Rule ${index + 1} discount (bps)`} value={rule.value} onChange={value => ruleField(index, 'value', value)} /></> : rule.type === 'fixed' ? <NumberField label={`Rule ${index + 1} discount (cents)`} value={rule.value} onChange={value => ruleField(index, 'value', value)} /> : <p className="pf-rule-explanation">Reduces the simulated customer shipping charge to zero. Your shipping cost remains.</p>}
            </div><div className="pf-thresholds"><NumberField label={`Rule ${index + 1} minimum subtotal (cents)`} value={rule.minSubtotalCents} onChange={value => ruleField(index, 'minSubtotalCents', value)} hint="Original merchandise subtotal" /><NumberField label={`Rule ${index + 1} minimum items`} value={rule.minItems} onChange={value => ruleField(index, 'minItems', value)} hint="Total units in the basket" /></div>
          </fieldset>)}
          {draft.rules.length === 0 ? <p className="pf-empty-rule">No promotion rules. The test will audit baseline basket contribution.</p> : null}
          <button type="button" className="pf-text-action" disabled={draft.rules.length >= 3} onClick={() => edit(previous => ({ ...previous, rules: [...previous.rules, { id: nextIdentifier('rule', previous.rules.map(rule => rule.id)), type: 'percent', scope: 'order', value: String(1000 + previous.rules.length * 100), minSubtotalCents: '0', minItems: '1' }] }))}><Plus size={15} aria-hidden="true" /> Add rule</button>
          <p className="pf-note">Search includes every ordered subset, including no rules. Each rule can apply once. Thresholds use the original basket; discounts cannot exceed remaining merchandise.</p>
        </section>

        <section className="pf-card" aria-labelledby="pf-cost-title"><div className="pf-section-top"><div><p className="pf-kicker">03 / COSTS & GUARDRAIL</p><h2 id="pf-cost-title">Include the costs that survive the promotion.</h2></div></div><div className="pf-cost-grid">
          <NumberField label="Customer shipping charge (cents)" value={draft.shippingChargedCents} onChange={value => scalar('shippingChargedCents', value)} hint="One charge per basket, before free shipping" />
          <NumberField label="Your shipping cost (cents)" value={draft.shippingCostCents} onChange={value => scalar('shippingCostCents', value)} hint="One cost per basket" />
          <NumberField label="Payment fee (bps)" value={draft.paymentFeeBps} onChange={value => scalar('paymentFeeBps', value)} hint="Charged on merchandise after discount + shipping collected" />
          <NumberField label="Minimum contribution (cents)" value={draft.contributionFloorCents} onChange={value => scalar('contributionFloorCents', value)} hint="A seller guardrail; may be negative" signed />
        </div></section>

        <section className="pf-card" aria-labelledby="pf-evidence-title"><div className="pf-section-top"><div><p className="pf-kicker">04 / EVIDENCE BOUNDARY</p><h2 id="pf-evidence-title">Missing evidence means HOLD.</h2></div></div><p className="pf-help">Fixture results always stay on HOLD. To label a simulation as seller-attested, record all three references and confirm eligibility and sequencing. These entries are your assertions; this sandbox does not verify them.</p>
          <label className="pf-check"><input type="checkbox" checked={draft.sellerAttested} onChange={event => edit(previous => ({ ...previous, sellerAttested: event.target.checked }))} /><span>I am using seller-attested inputs with the references recorded below.</span></label>
          <label className="pf-check pf-check-semantics"><input type="checkbox" checked={draft.semanticsConfirmed} onChange={event => edit(previous => ({ ...previous, semanticsConfirmed: event.target.checked }))} /><span>I explicitly confirm this simulation’s sequencing, thresholds and stacking assumptions, including the proposed combination eligibility.</span></label>
          <div className="pf-evidence-fields"><label className="pf-field"><span>Price / cost evidence reference</span><input value={draft.costsReference} onChange={event => scalar('costsReference', event.target.value)} maxLength={240} placeholder="e.g. seller cost sheet revision and date" autoComplete="off" /></label><label className="pf-field"><span>Rule eligibility / sequence evidence reference</span><input value={draft.rulesReference} onChange={event => scalar('rulesReference', event.target.value)} maxLength={240} placeholder="e.g. seller-reviewed combination test notes" autoComplete="off" /></label><label className="pf-field"><span>Shipping / payment fee evidence reference</span><input value={draft.operationsReference} onChange={event => scalar('operationsReference', event.target.value)} maxLength={240} placeholder="e.g. carrier quote and fee schedule revision" autoComplete="off" /></label></div>
          <p className="pf-note">Unknown platform behavior, unsupported rule mechanics, or uncertain qualification: leave unconfirmed and keep HOLD. Text references are retained only in this browser state and your optional JSON export.</p><p className="pf-reference"><a href="https://help.shopify.com/en/manual/discounts/discount-combinations" target="_blank" rel="noopener noreferrer">Shopify reference — seller must confirm eligibility ↗</a><span>That reference describes product → order → shipping sequencing where eligible. This stress sandbox searches all supplied rule orders; the reference does not prove your promotion qualifies.</span></p>
        </section>

        <div className="pf-run-panel"><div className="pf-error" ref={errorRef} tabIndex={-1} role={error ? 'alert' : undefined} hidden={!error}>{error}</div><div className="pf-run-actions"><button className="pf-run" type="submit">Run collision test <ArrowRight size={17} aria-hidden="true" /></button><button className="pf-reset" type="button" onClick={loadFixture}>Restore synthetic example</button></div><p className="pf-help">1–3 SKUs · 0–3 rules · quantity 1–3 · hard maximum 1,008 scenarios. No network request.</p></div>
      </form>

      <section className="pf-result" aria-labelledby="pf-result-title" ref={resultRef} tabIndex={-1}>
        <div className="pf-result-top"><p className="pf-kicker">COLLISION REPORT</p><span data-testid="preflight-status" className={`pf-pill ${result?.status === 'MODEL_CLEAR' ? 'pf-pill-green' : 'pf-pill-warm'}`}>{result?.status || 'AWAITING RUN'}</span></div>
        <h2 id="pf-result-title">What is left in the worst basket?</h2>
        <p className="pf-notice" role="status" aria-live="polite">{notice}</p>
        {result && worst ? <>
          <div className={`pf-contribution ${result.riskBreach ? 'pf-contribution-risk' : ''}`}><span>Lowest modeled contribution</span><strong data-testid="preflight-worst-contribution">{usd(worst.contributionCents)}</strong><small>{result.riskBreach ? `Below your ${usd(result.input.contributionFloorCents)} floor` : `Within your ${usd(result.input.contributionFloorCents)} floor in this model`}</small></div>
          <p className="pf-result-bound">Simulation only. {result.input.evidence.mode === 'fixture' ? 'Synthetic / fixture inputs.' : 'Seller-attested references, not independently verified.'} This is not actual savings or a launch approval.</p>
          {result.holdReasons.length ? <div className="pf-hold"><h3>Why this stays on HOLD</h3><ul>{result.holdReasons.map(reason => <li key={reason}>{reason}</li>)}</ul></div> : <div className="pf-hold"><h3>{result.status === 'REVIEW' ? 'Review the risk before launch' : 'Within this limited model'}</h3><p>Only your supplied assumptions and bounded search were checked. Confirm the intended checkout behavior separately.</p></div>}
          <dl className="pf-search"><div><dt>Baskets</dt><dd>{result.searchSpace.baskets}</dd></div><div><dt>Rule sequences</dt><dd>{result.searchSpace.ruleSequences}</dd></div><div><dt>Scenarios</dt><dd data-testid="preflight-scenario-count">{result.searchSpace.scenarios} / {result.searchSpace.maxScenarios}</dd></div></dl>
          <div className="pf-audit-part"><h3>Worst basket & trigger</h3><ul className="pf-basket-list">{worst.basket.map(line => <li key={line.skuId}><span>{line.skuId}</span><strong>× {line.quantity}</strong></li>)}</ul><p className="pf-help">Rule order: {worst.ruleOrder.length ? worst.ruleOrder.join(' → ') : 'No rules (baseline)'}. Triggered: {worst.triggeredRules.length ? worst.triggeredRules.join(', ') : 'none'}.</p></div>
          <div className="pf-audit-part"><h3>Trace the collision</h3><ol className="pf-trace"><li><div><strong>Original merchandise</strong><span>{usd(worst.subtotalCents)}</span></div></li>{worst.steps.map((step, index) => {
            const rule = result.input.rules.find(candidate => candidate.id === step.ruleId)!;
            return <li key={`${step.ruleId}-${index}`}><div><strong>{step.ruleId}</strong><span>{usd(step.remainingMerchandiseCents)}</span></div><p>{step.eligible ? `Applied: -${usd(step.discountCents)} merchandise; -${usd(step.shippingReductionCents)} shipping.` : 'Not applied.'} {step.reason}</p><p>Requires original subtotal at least {usd(rule.minSubtotalCents)} and at least {rule.minItems} items.</p></li>;
          })}</ol></div>
          <dl className="pf-ledger"><div><dt>Merchandise after discount</dt><dd>{usd(worst.merchandiseCents)}</dd></div><div><dt>Shipping collected</dt><dd>+{usd(worst.shippingChargedCents)}</dd></div><div><dt>COGS</dt><dd>-{usd(worst.cogsCents)}</dd></div><div><dt>Shipping cost</dt><dd>-{usd(worst.shippingCostCents)}</dd></div><div><dt>Payment fee</dt><dd>-{usd(worst.paymentFeeCents)}</dd></div><div className="pf-ledger-total"><dt>Contribution</dt><dd>{usd(worst.contributionCents)}</dd></div></dl>
          <details className="pf-details"><summary>Assumptions, formula & supplied evidence</summary><p className="pf-formula">{result.formula}</p><ul>{result.assumptions.map(assumption => <li key={assumption}>{assumption}</li>)}</ul><dl className="pf-reference-list"><div><dt>Prices / costs</dt><dd>{result.input.evidence.costsReference || 'Missing'}</dd></div><div><dt>Rules / eligibility</dt><dd>{result.input.evidence.rulesReference || 'Missing'}</dd></div><div><dt>Shipping / fees</dt><dd>{result.input.evidence.operationsReference || 'Missing'}</dd></div></dl></details>
          <button type="button" className="pf-export" onClick={() => exportAudit(result, bridgeAudit)}><ArrowDownToLine size={16} aria-hidden="true" /> Download JSON audit</button>
        </> : <div className="pf-report-placeholder"><div className="pf-placeholder-mark"><FlaskConical size={30} aria-hidden="true" /></div><h3>Your next campaign, under a microscope.</h3><p>Run the example or enter your assumptions to see the lowest contribution, exact basket, triggered rules and evidence gaps.</p><dl className="pf-preview-bounds"><div><dt>Current SKU count</dt><dd>{draft.skus.length}</dd></div><div><dt>Maximum nonempty baskets</dt><dd>{basketLimit}</dd></div><div><dt>Hard scenario cap</dt><dd>1,008</dd></div></dl><p className="pf-note">Taxes, returns, demand, fixed overhead, payment fixed fees and platform-specific execution are outside this model.</p></div>}
      </section>
    </main>
    <PreflightComparison key={draftVersion} getInput={() => toInput(draft)} />
      <footer className="pf-footer">A deterministic preflight sandbox for MarginGuard. Local calculations, integer cents, bounded enumeration. Optional provider preparation requires explicit consent and a second rule-review confirmation; source and checkout applicability remain unverified.</footer>
  </div>;
}
