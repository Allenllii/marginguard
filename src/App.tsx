import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, BarChart3, Check, ChevronRight, CircleHelp, FileSpreadsheet, FlaskConical, Layers3, Leaf, LoaderCircle, PackageCheck, PanelLeftClose, Percent, RotateCcw, ShieldCheck, SlidersHorizontal, Sparkles, Truck, Upload, X } from 'lucide-react';
import type { Analysis, Explanation, Issue, ProviderStatus, ResearchPacket } from '../shared/types';
import { money, preciseMoney } from '../shared/types';
import PolicyResearch from './PolicyResearch';
import JudgeEntry from './JudgeEntry';
import CsvMappingAssistant from './CsvMappingAssistant';
import { DEFAULT_ASSUMPTIONS, validAssumptions, type Assumptions } from '../shared/assumptions';

type View = 'overview' | 'findings' | 'scenarios' | 'data';
const iconFor = { discount: Percent, shipping: Truck, returns: RotateCcw };
const percent = (n: number) => `${(n * 100).toFixed(1)}%`;
async function api<T>(url: string, data?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { ...(data ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {}), signal });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed. Please try again.');
  return result;
}
function download(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Trend({ analysis }: { analysis: Analysis }) {
  const { daily } = analysis;
  const groups = Array.from({ length: Math.min(28, daily.length) }, (_, n) => {
    const start = Math.floor(n * daily.length / Math.min(28, daily.length));
    const stop = Math.floor((n + 1) * daily.length / Math.min(28, daily.length));
    const chunk = daily.slice(start, stop);
    return { revenue: chunk.reduce((s, d) => s + d.revenue, 0), contribution: chunk.reduce((s, d) => s + d.contribution, 0) };
  });
  const max = Math.max(1, ...groups.flatMap(d => [d.revenue, d.contribution]));
  const min = Math.min(0, ...groups.map(d => d.contribution));
  const y = (value: number) => 175 - (value - min) / (max - min) * 148;
  const baseline = y(0);
  const width = 650 / Math.max(groups.length, 1);
  return <div className="chart-wrap"><svg viewBox="0 0 740 212" role="img" aria-label="Net revenue and contribution by date. Values are calculated from the current CSV.">
    {[0, 1, 2, 3].map(i => <g key={i}><line x1="61" x2="730" y1={27 + i * 49} y2={27 + i * 49} stroke="#e9ece5" strokeDasharray="3 5" /><text x="0" y={31 + i * 49} className="axis-label">{money(max - (max - min) * i / 3)}</text></g>)}
    <line x1="61" x2="730" y1={baseline} y2={baseline} stroke="#d5dbd1" />
    {groups.map((d, i) => <g key={i}><rect x={68 + i * width} y={y(d.revenue)} width={Math.max(2, width * .62)} height={baseline - y(d.revenue)} rx="3" fill="#e3eaca" /><rect x={68 + i * width} y={d.contribution >= 0 ? y(d.contribution) : baseline} width={Math.max(2, width * .62)} height={Math.abs(baseline - y(d.contribution))} rx="3" fill={d.contribution >= 0 ? '#37775e' : '#c66b55'} /></g>)}
    <text x="66" y="205" className="axis-label">{analysis.dateRange.start.slice(5)}</text><text x="376" y="205" className="axis-label">{daily[Math.floor(daily.length / 2)]?.date.slice(5)}</text><text x="687" y="205" className="axis-label">{analysis.dateRange.end.slice(5)}</text>
  </svg></div>;
}
function EvidenceDrawer({ issue, analysis, close }: { issue: Issue; analysis: Analysis; close: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const rows = analysis.orders.filter(o => issue.rowIds.includes(o.row));
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    const previousOverflow = document.body.style.overflow;
    panel.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') {
        const nodes = panel.current?.querySelectorAll<HTMLElement>('button, a, input, [tabindex="0"]');
        if (!nodes?.length) return;
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handler); document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', handler); document.body.style.overflow = previousOverflow; if (old?.isConnected && old.getClientRects().length) old.focus(); };
  }, [close]);
  function exportRows() {
    const header = 'csv_row,order_id,order_date,sku,gross_sales,discount,shipping_charged,shipping_cost,refund,return_cost';
    download([header, ...rows.map(r => [r.row, r.id, r.date, r.sku, ...[r.gross, r.discount, r.shippingCharged, r.shippingCost, r.refund, r.returnCost].map(v => (v / 100).toFixed(2))].join(','))].join('\n'), `${issue.id}-evidence.csv`, 'text/csv');
  }
  return <div className="overlay" onClick={close}><div className="drawer" ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="evidence-title" onClick={e => e.stopPropagation()}>
    <div className="drawer-top"><span className="eyebrow"><ShieldCheck size={15} /> SOURCE-LEVEL EVIDENCE</span><button className="icon-button" onClick={close} aria-label="Close evidence"><X size={21} /></button></div>
    <span className={`severity ${issue.severity}`}>{issue.severity} priority</span><h2 id="evidence-title">{issue.title}</h2><p className="muted">{issue.subtitle}</p>
    <div className="drawer-impact"><span>Modeled opportunity</span><strong>{preciseMoney(issue.exposure)}</strong><span>Assumption-based · USD</span></div>
    <div className="metric-grid">{issue.metrics.map(m => <div key={m.label}><span>{m.label}</span><strong>{m.value}</strong></div>)}</div>
    <h3>Show the math</h3><code className="formula">{issue.formula}</code><p className="method-text">{issue.details}</p>
    <div className="action-box"><PackageCheck size={20} /><div><h4>A practical next step</h4><p>{issue.action}</p></div></div>
    <div className="section-title"><h3>{rows.length} evidence rows</h3><button className="text-button" onClick={exportRows}><ArrowDownToLine size={15} /> Export rows</button></div><p className="caption">CSV row numbers include the header. All amounts below are USD. Full precision is in the export.</p>
    <div className="table-scroll" tabIndex={0} aria-label="Evidence rows, scroll horizontally"><table><thead><tr><th>CSV row</th><th>Order / SKU</th><th>Date</th><th>Gross</th><th>Discount</th><th>Ship fee / cost</th><th>Refund</th></tr></thead><tbody>{rows.map(r => <tr key={r.row}><td><span className="row-id">#{r.row}</span></td><td><strong>{r.id}</strong><small>{r.sku}</small></td><td>{r.date}</td><td>{preciseMoney(r.gross)}</td><td>{preciseMoney(r.discount)}</td><td>{preciseMoney(r.shippingCharged)} / {preciseMoney(r.shippingCost)}</td><td>{preciseMoney(r.refund)}</td></tr>)}</tbody></table></div>
    <p className="caption">Evidence ID: {issue.id} · Dataset SHA-256 prefix: {analysis.fingerprint}</p>
  </div></div>;
}

export default function App({ workspaceActive = true }: { workspaceActive?: boolean }) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [csv, setCsv] = useState('');
  const [provider, setProvider] = useState<ProviderStatus | null>(null);
  const [tavilyConfigured, setTavilyConfigured] = useState(false);
  const [brief, setBrief] = useState<Explanation | null>(null);
  const [view, setView] = useState<View>('overview');
  const [selected, setSelected] = useState<Issue | null>(null);
  const [rates, setRates] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [briefBusy, setBriefBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [consent, setConsent] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [datasetVersion, setDatasetVersion] = useState(0);
  const [casePacket, setCasePacket] = useState<ResearchPacket | null>(null);
  const [caseVersion, setCaseVersion] = useState(0);
  const [assumptionsDraft, setAssumptionsDraft] = useState<Assumptions>({ ...DEFAULT_ASSUMPTIONS });
  const navPanel = useRef<HTMLElement>(null);
  const navToggle = useRef<HTMLButtonElement>(null);
  const caseRequest = useRef(0);
  useEffect(() => {
    if (!sidebar || !workspaceActive) return;
    navPanel.current?.querySelector<HTMLButtonElement>('.nav-item.active')?.focus({ preventScroll: true });
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setSidebar(false); navToggle.current?.focus({ preventScroll: true }); } };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [sidebar, workspaceActive]);
  const upload = useRef<HTMLInputElement>(null);
  const datasetGeneration = useRef(0);
  const dataRequest = useRef(0);
  const briefRequest = useRef(0);
  const briefController = useRef<AbortController | null>(null);
  function resetData(a: Analysis, text: string) { setCasePacket(null); datasetGeneration.current++; briefRequest.current++; briefController.current?.abort(); setBriefBusy(false); setDatasetVersion(v => v + 1); setAnalysis(a); setAssumptionsDraft(a.assumptions); setCsv(text); setBrief(null); setRates(Object.fromEntries(a.issues.map(i => [i.id, 50]))); setSelected(null); setConsent(false); }
  async function openDiscountCase() {
    if (!analysis?.synthetic || busy) return;
    const generation = datasetGeneration.current, requestId = ++caseRequest.current, dataId = dataRequest.current;
    setBusy(true); setError('');
    try {
      const packet = await api<ResearchPacket>('/api/research', { kind: 'discount', context: { platform: 'Shopify', carrier: 'USPS', region: 'US', discountOrigin: 'manual' }, live: false });
      if (generation !== datasetGeneration.current || requestId !== caseRequest.current || dataId !== dataRequest.current) return;
      setCasePacket(packet); setCaseVersion(v => v + 1); setView('findings'); setSidebar(false);
    } catch (e) { if (generation === datasetGeneration.current && requestId === caseRequest.current && dataId === dataRequest.current) setError((e as Error).message); }
    finally { if (generation === datasetGeneration.current && dataId === dataRequest.current) setBusy(false); }
  }
  async function applyAssumptions() {
    if (!validAssumptions(assumptionsDraft)) return;
    const requestId = ++dataRequest.current;
    setBusy(true); setError('');
    try { const data = await api<Analysis>('/api/analyze', { csv, assumptions: assumptionsDraft }); if (requestId !== dataRequest.current) return; resetData(analysis?.synthetic ? { ...data, synthetic: true, source: analysis.source } : data, csv); setNotice('Seller assumptions applied. All findings and exports were recalculated; previous explanations were cleared.'); }
    catch (e) { if (requestId === dataRequest.current) setError((e as Error).message); } finally { if (requestId === dataRequest.current) setBusy(false); }
  }
  async function loadDemo() {
    const requestId = ++dataRequest.current;
    setBusy(true); setError('');
    try { const data = await api<{ csv: string; analysis: Analysis }>('/api/demo'); if (requestId !== dataRequest.current) return; resetData(data.analysis, data.csv); setNotice('Synthetic demo loaded. Three planted issues, ready to inspect.'); }
    catch (e) { if (requestId === dataRequest.current) setError((e as Error).message); } finally { if (requestId === dataRequest.current) setBusy(false); }
  }
  useEffect(() => {
    let active = true;
    const requestId = ++dataRequest.current;
    Promise.all([api<{ csv: string; analysis: Analysis }>('/api/demo'), api<{ provider: ProviderStatus; tavily: { mode: string } }>('/api/health')]).then(([data, status]) => { if (active) { if (requestId === dataRequest.current) resetData(data.analysis, data.csv); setProvider(status.provider); setTavilyConfigured(status.tavily.mode === 'configured'); } }).catch(e => { if (active && requestId === dataRequest.current) setError(e.message); });
    return () => { active = false; briefController.current?.abort(); };
  }, []);
  async function importFile(file?: File, syntheticMappingExample = false) {
    if (!file) return;
    const requestId = ++dataRequest.current;
    if (upload.current) upload.current.value = '';
    setError(''); setNotice('');
    if (!file.name.toLowerCase().endsWith('.csv')) { setBusy(false); setError('Choose a .csv file using the documented schema.'); return; }
    if (file.size > 2 * 1024 * 1024) { setBusy(false); setError('CSV exceeds the 2 MB limit.'); return; }
    setBusy(true);
    try { const text = await file.text(); const data = await api<Analysis>('/api/analyze', { csv: text }); if (requestId !== dataRequest.current) return; resetData(syntheticMappingExample ? { ...data, source: 'Synthetic CSV mapping example', synthetic: true } : data, text); setNotice(`Imported ${data.orders.length.toLocaleString()} validated order${data.orders.length === 1 ? "" : "s"}.${syntheticMappingExample ? ' Synthetic CSV mapping example; not merchant data.' : ''} Data is processed in this browser session and the app server's transient memory.`); setView('overview'); }
    catch (e) { if (requestId === dataRequest.current) setError((e as Error).message); } finally { if (requestId === dataRequest.current) setBusy(false); }
  }
  async function getBrief(live: boolean) {
    const generation = datasetGeneration.current;
    const requestId = ++briefRequest.current;
    briefController.current?.abort();
    const controller = new AbortController(); briefController.current = controller;
    setBriefBusy(true); setError('');
    try { const result = await api<Explanation>('/api/explain', { csv, live, assumptions: analysis?.assumptions }, controller.signal); if (generation === datasetGeneration.current && requestId === briefRequest.current) setBrief(result); }
    catch (e) { if (!controller.signal.aborted && generation === datasetGeneration.current && requestId === briefRequest.current) setError((e as Error).message); } finally { if (generation === datasetGeneration.current && requestId === briefRequest.current) setBriefBusy(false); }
  }
  const recovery = analysis?.issues.reduce((sum, issue) => sum + Math.round(issue.exposure * (rates[issue.id] ?? 0) / 100), 0) ?? 0;
  function exportReport() {
    if (!analysis) return;
    const text = [`# MarginGuard analysis report`, ``, `Generated: ${new Date().toISOString()}`, `Source: ${analysis.source}`, `Synthetic: ${analysis.synthetic}`, `Dataset fingerprint (SHA-256 prefix): ${analysis.fingerprint}`, `Period: ${analysis.dateRange.start} to ${analysis.dateRange.end}`, `Orders: ${analysis.orders.length}`, `Currency: USD`, `Seller-assumed discount ceiling: ${analysis.assumptions.discountCeilingPercent}%`, `Seller-assumed shipping subsidy: ${preciseMoney(analysis.assumptions.shippingSubsidyCents)}`, ``, `## Deterministic results`, `Net revenue: ${preciseMoney(analysis.totals.revenue)}`, `Contribution: ${preciseMoney(analysis.totals.contribution)}`, `Contribution margin: ${percent(analysis.totals.margin)}`, `Modeled opportunity: ${preciseMoney(analysis.totals.opportunity)}`, ``, `Contribution = gross sales - discounts - refunds + shipping charged - COGS - shipping costs - return costs. COGS is retained on refunded orders; no restock credits, taxes, fees, marketing, or fixed overhead are modeled.`, ...analysis.issues.flatMap(i => [``, `## ${i.title}`, `Evidence ID: ${i.id}`, `Modeled exposure: ${preciseMoney(i.exposure)}`, `Source CSV rows: ${i.rowIds.join(', ')}`, `Formula: ${i.formula}`, i.details, `Next step: ${i.action}`, `Scenario recovery assumption: ${rates[i.id] ?? 0}%`]), ``, `## What-if scenario`, `Modeled contribution uplift: ${preciseMoney(recovery)}`, `Scenario contribution: ${preciseMoney(analysis.totals.contribution + recovery)}`, `Illustrative only. No execution, elasticity, timing, or customer behavior model. Discount and shipping components are distinct; return exposures exclude refunded orders from those components.`, ``, `## Explanation provenance`, brief ? `Mode: ${brief.mode}; model: ${brief.model ?? 'none'}` : 'No brief generated. No model call claimed.', ...(brief ? [brief.summary, ...brief.priorities.map(p => `${p.issueId}: ${p.reason} Next: ${p.nextStep}`), brief.caveat, brief.fallbackReason ?? '', brief.proof ? JSON.stringify(brief.proof, null, 2) : ''] : []), ``, `Not a full accounting profit or realized recovery estimate. Validate assumptions before operational changes.`].join('\n');
    download(text, 'marginguard-report.md', 'text/markdown'); setNotice('Report exported with formulas, evidence row IDs, scenario assumptions, and model provenance.');
  }
  const navigate = (v: View) => { caseRequest.current++; setView(v); if (sidebar) navToggle.current?.focus({ preventScroll: true }); setSidebar(false); };
  const navItems: { id: View; label: string; icon: typeof BarChart3 }[] = [{ id: 'overview', label: 'Overview', icon: BarChart3 }, { id: 'findings', label: 'Findings', icon: Layers3 }, { id: 'scenarios', label: 'Scenario lab', icon: SlidersHorizontal }, { id: 'data', label: 'Data & method', icon: FileSpreadsheet }];
  const largest = analysis?.issues[0];
  const findingList = analysis ? <div className="findings-list">{analysis.issues.length ? analysis.issues.map((issue, index) => { const Icon = iconFor[issue.kind]; return <button className="finding-row" key={issue.id} onClick={() => setSelected(issue)}><span className={`issue-icon ${issue.kind}`}><Icon size={20} /></span><span className="finding-copy"><span className="finding-heading"><strong>{issue.title}</strong><span className={`severity ${issue.severity}`}>{issue.severity}</span></span><span>{issue.subtitle}</span></span><span className="finding-value"><strong>{money(issue.exposure)}</strong><span>modeled exposure</span></span><span className="finding-arrow"><ChevronRight size={19} /></span><span className="sr-only">Open evidence for finding {index + 1}</span></button>; }) : <div className="empty-state"><ShieldCheck size={36} /><h3>No rule thresholds crossed</h3><p>Review the method and data coverage. This does not rule out other margin issues.</p></div>}</div> : null;

  return <div className="app-shell">
    <aside ref={navPanel} id="workspace-navigation" className={`sidebar ${sidebar ? 'open' : ''}`}><a className="brand" href="#" onClick={e => { e.preventDefault(); navigate('overview'); }}><span className="brand-mark"><ShieldCheck size={23} /></span>Margin<span>Guard</span></a><div className="workspace-switch"><span className="workspace-avatar">N</span><div><strong>{analysis?.synthetic === false ? 'Your CSV workspace' : 'Northstar Supply'}</strong><small>{analysis?.synthetic === false ? 'Imported dataset' : 'Synthetic demo store'}</small></div><span className="workspace-chevron">⌄</span></div><p className="nav-caption">WORKSPACE</p><nav>{navItems.map(n => <button key={n.id} className={`nav-item ${view === n.id ? 'active' : ''}`} onClick={() => navigate(n.id)}><n.icon size={19} />{n.label}{n.id === 'findings' && analysis ? <span className="nav-count">{analysis.issues.length}</span> : null}</button>)}<a className="nav-item" href="#preflight"><FlaskConical size={19} />Promo Preflight</a></nav><div className="sidebar-note"><span className="note-icon"><Leaf size={20} /></span><h4>Small leaks. Real impact.</h4><p>See where your margin goes, then decide what to do next.</p><button onClick={() => navigate('data')}>Explore the method <ArrowUpRight size={15} /></button></div><div className="sidebar-bottom"><span className="avatar">MG</span><div><strong>Demo workspace</strong><small>No account needed</small></div><ShieldCheck size={17} /></div></aside>
    <main className="main"><header className="topbar"><div className="breadcrumb"><button ref={navToggle} className="mobile-toggle icon-button" aria-controls="workspace-navigation" aria-expanded={sidebar} aria-label="Toggle navigation" onClick={() => setSidebar(!sidebar)}><PanelLeftClose size={21} /></button><span>Workspace</span><ChevronRight size={13} /><strong>{navItems.find(i => i.id === view)?.label}</strong></div><div className="topbar-right"><span className="mode-pill"><i />{brief?.mode === 'live' ? 'Live brief received' : 'Offline demo mode'}</span><button className="icon-button" aria-label="Help and methodology" onClick={() => navigate('data')}><CircleHelp size={20} /></button><span className="top-avatar">N</span></div></header>
    <div className="page-content"><div className="page-heading"><div><div className="eyebrow">MARGIN INTELLIGENCE <span className="tiny-line" /></div><h1>{view === 'overview' ? 'Healthy margins start here.' : view === 'findings' ? 'Follow the evidence.' : view === 'scenarios' ? 'Your next move, modeled.' : 'Good analysis starts with good data.'}</h1><p>{view === 'overview' ? 'Find the leaks. Understand the why. Make your next move count.' : view === 'findings' ? 'Every finding has a formula, a policy assumption, and the rows to back it up.' : view === 'scenarios' ? 'Explore the upside before you change a promotion, product, or shipping policy.' : 'One order per row. Transparent rules. No mystery numbers.'}</p></div><div className="heading-actions"><button className="button secondary" onClick={exportReport} disabled={!analysis}><ArrowDownToLine size={16} />Export report</button><button className="button primary" onClick={() => upload.current?.click()} disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />}Import CSV</button><input ref={upload} type="file" accept=".csv,text/csv" className="sr-only" aria-label="Import order CSV" onChange={e => void importFile(e.target.files?.[0])} /></div></div>
    {error ? <div role="alert" className="alert error"><strong>Check your input</strong><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div> : null}
    {notice ? <div role="status" className="alert notice"><Check size={17} /><span>{notice}</span><button aria-label="Dismiss notice" onClick={() => setNotice('')}><X size={16} /></button></div> : null}
    {!analysis ? <div className="loading-state">{error ? <button className="button primary" onClick={loadDemo}>Retry loading demo</button> : <><LoaderCircle className="spin" size={30} /><p>Preparing your margin workspace…</p></>}</div> : <>
    <div className="dataset-strip"><span><FileSpreadsheet size={15} /><strong>{analysis.synthetic ? 'Synthetic demo' : 'Imported CSV'}</strong><span className="strip-divider" />{analysis.orders.length.toLocaleString()} validated order{analysis.orders.length === 1 ? "" : "s"}<span className="strip-divider" />{analysis.dateRange.start} — {analysis.dateRange.end}</span><button onClick={loadDemo} disabled={busy}><RotateCcw size={13} />Reset demo</button></div>
    <p className="caption data-privacy">CSV uploads are sent to this app's server for validation and calculation; use synthetic or non-sensitive data.</p>
      {view === 'overview' && analysis.synthetic && analysis.issues.find(i => i.kind === 'discount') ? <JudgeEntry issue={analysis.issues.find(i => i.kind === 'discount')!} ceiling={analysis.assumptions.discountCeilingPercent} busy={busy} open={() => void openDiscountCase()} /> : null}
    <form className="assumption-bar" onSubmit={e => { e.preventDefault(); void applyAssumptions(); }}><div><strong>Seller assumptions</strong><small>Demo defaults · editable; not platform policy</small></div><label>Discount ceiling<input aria-label="Discount ceiling percent" type="number" min="0" max="60" step="1" value={Number.isFinite(assumptionsDraft.discountCeilingPercent) ? assumptionsDraft.discountCeilingPercent : ''} onChange={e => setAssumptionsDraft({ ...assumptionsDraft, discountCeilingPercent: e.target.valueAsNumber })} /><span>%</span></label><label>Shipping subsidy<input aria-label="Shipping subsidy USD" type="number" min="0" max="20" step="0.01" value={Number.isFinite(assumptionsDraft.shippingSubsidyCents) ? assumptionsDraft.shippingSubsidyCents / 100 : ''} onChange={e => setAssumptionsDraft({ ...assumptionsDraft, shippingSubsidyCents: Math.round(e.target.valueAsNumber * 100) })} /><span>USD</span></label><button className="button secondary" disabled={busy || !validAssumptions(assumptionsDraft)} type="submit">Recalculate</button><small>Applied: {analysis.assumptions.discountCeilingPercent}% · {preciseMoney(analysis.assumptions.shippingSubsidyCents)}</small></form>
    {view === 'overview' ? <>
      <div className="kpi-grid"><article className="kpi opportunity"><div className="kpi-label">Modeled opportunity <ArrowUpRight size={17} /></div><div className="kpi-value">{money(analysis.totals.opportunity)}<span>USD</span></div><div className="kpi-foot"><span className="mini-badge">{analysis.issues.length} findings</span><span>Worth a closer look</span></div><svg className="kpi-doodle" viewBox="0 0 100 80" aria-hidden="true"><path d="M5 67 27 54 43 59 61 29 78 35 96 7" fill="none" stroke="#aac474" strokeWidth="2" /><path d="m80 8 16-1-1 16" fill="none" stroke="#aac474" strokeWidth="2" /></svg></article><article className="kpi"><div className="kpi-label">Net revenue <span className="metric-icon"><BarChart3 size={15} /></span></div><div className="kpi-value">{money(analysis.totals.revenue)}</div><div className="kpi-foot"><span className="muted">After discounts & refunds</span></div></article><article className="kpi"><div className="kpi-label">Contribution margin <span className="metric-icon"><Percent size={15} /></span></div><div className="kpi-value">{percent(analysis.totals.margin)}</div><div className="kpi-foot"><span className="muted">{money(analysis.totals.contribution)} contribution</span></div></article><article className="kpi"><div className="kpi-label">Orders with refunds <span className="metric-icon"><RotateCcw size={15} /></span></div><div className="kpi-value">{analysis.totals.returns}<span className="normal-value"> / {analysis.orders.length}</span></div><div className="kpi-foot"><span className="muted">{percent(analysis.totals.returns / analysis.orders.length)} of all orders</span></div></article></div>
      <div className="overview-middle"><section className="card trend-card"><div className="section-title"><div><h2>The shape of your margin</h2><p className="caption">Daily revenue and contribution · USD</p></div><span className="period-tag">{analysis.daily.length} days</span></div><div className="chart-legend"><span><i className="legend-square light" />Net revenue</span><span><i className="legend-square dark" />Contribution</span></div><Trend analysis={analysis} /><div className="chart-note"><ShieldCheck size={14} />Calculated from your CSV. No AI-generated numbers.</div></section><section className="next-card"><span className="eyebrow"><Sparkles size={15} /> A GOOD PLACE TO START</span><div className="next-illustration" aria-hidden="true"><span className="illustration-ring" /><ShieldCheck size={48} strokeWidth={1.4} /><span className="illustration-spark">✦</span></div><h2>{largest ? 'Turn a finding into a plan.' : 'Keep an eye on the details.'}</h2><p>{largest ? <>Your largest review candidate represents <strong>{money(largest.exposure)}</strong> in modeled exposure. Open the evidence before taking action.</> : 'No thresholds crossed in this dataset. Review the assumptions and expand your checks.'}</p><button className="button dark" onClick={() => largest ? setSelected(largest) : navigate('data')}>{largest ? 'Inspect top finding' : 'Review the method'}<ArrowRight size={16} /></button><span className="next-foot">A starting point, not a savings promise.</span></section></div>
      <section className="card findings-card"><div className="section-title"><div><div className="title-with-count"><h2>Your margin watchlist</h2><span className="count-badge">{analysis.issues.length}</span></div><p className="caption">Sorted by modeled exposure. You make the final call.</p></div><button className="text-button" onClick={() => navigate('findings')}>View all findings <ArrowRight size={15} /></button></div>{findingList}</section>
      <div className="bottom-nudge"><span><span className="round-icon"><FlaskConical size={17} /></span><strong>What would a better month look like?</strong><span>Try a few recovery assumptions in the scenario lab.</span></span><button className="text-button" onClick={() => navigate('scenarios')}>Model a scenario <ArrowUpRight size={16} /></button></div>
    </> : null}
    {view === 'findings' ? <><section className="card findings-card"><div className="section-title"><div><h2>{analysis.issues.length} opportunities to investigate</h2><p className="caption">Total modeled exposure {preciseMoney(analysis.totals.opportunity)} · not realized savings</p></div><span className="audit-badge"><ShieldCheck size={14} />Evidence attached</span></div>{findingList}</section></> : null}<div hidden={view !== 'findings'}><PolicyResearch key={`${analysis.fingerprint}:${datasetVersion}:${caseVersion}`} initialPacket={casePacket} analysis={analysis} csv={csv} tavilyConfigured={tavilyConfigured} nvidiaConfigured={provider?.mode === "configured"} /></div>{view === 'findings' ? <><section className="card analyst-card"><div className="section-title"><div><span className="eyebrow"><Sparkles size={15} /> ANALYST BRIEF</span><h2>A little context for your next move.</h2></div><span className={`mode-pill ${brief?.mode === 'live' ? 'live' : ''}`}><i />{brief?.mode === 'live' ? 'NVIDIA · Nebius' : 'Offline guidance'}</span></div><p className="method-text">Deterministic rules find the issues. An optional NVIDIA model on Nebius explains and prioritizes the findings using generated evidence IDs and aggregate metrics. CSV uploads are sent to this app's server for validation and calculation. Raw rows and product names are excluded from provider prompts.</p><div className="brief-actions"><button className="button secondary" disabled={briefBusy} onClick={() => getBrief(false)}>{briefBusy ? <LoaderCircle size={16} className="spin" /> : <Layers3 size={16} />}Generate offline brief</button><button className="button primary" disabled={briefBusy || provider?.mode !== 'configured' || !consent} onClick={() => getBrief(true)}><Sparkles size={16} />Generate NVIDIA brief</button></div><label className="consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} disabled={provider?.mode !== 'configured'} />Allow this request to send aggregate findings to Nebius. Live inference may use credits.</label>{provider?.mode !== 'configured' ? <p className="caption">Live inference is not configured. Server-only API key, an explicitly enabled connection, and a verified NVIDIA model are required.</p> : <p className="caption">Configured model: {provider.model}. Availability will be checked with GET /models when you request a brief.</p>}{brief ? <div className="brief-result"><div className="section-title"><strong>{brief.mode === 'live' ? 'Live model explanation' : 'Offline deterministic guidance'}</strong><span className="caption">{brief.model ?? 'No model called'}</span></div>{brief.fallbackReason ? <div className="fallback-note">{brief.fallbackReason}</div> : null}<p>{brief.summary}</p><ol>{brief.priorities.map(p => { const issue = analysis.issues.find(i => i.id === p.issueId); return <li key={p.issueId}><button className="text-button" onClick={() => issue && setSelected(issue)}>{issue?.title}<ArrowUpRight size={14} /></button><p>{p.reason}</p><small>{p.nextStep}</small></li>; })}</ol><p className="caption">{brief.caveat}</p>{brief.proof ? <div className="proof"><Check size={16} />Live response received {brief.proof.requestedAt} · {brief.proof.latencyMs} ms · request {brief.proof.requestId ?? 'ID not returned'} · tokens {brief.proof.inputTokens ?? 'n/a'} in / {brief.proof.outputTokens ?? 'n/a'} out</div> : null}</div> : null}</section></> : null}
    {view === 'scenarios' ? <div className="scenario-layout"><section className="card scenario-controls"><div className="section-title"><div><h2>Set your recovery assumptions</h2><p className="caption">A thought experiment on the current dataset.</p></div><FlaskConical size={21} /></div>{analysis.issues.map(i => { const Icon = iconFor[i.kind]; return <div className="scenario-control" key={i.id}><div className="scenario-control-title"><span className={`issue-icon ${i.kind}`}><Icon size={19} /></span><strong>{i.title}</strong><output htmlFor={`rate-${i.id}`}>{rates[i.id] ?? 0}%</output></div><input id={`rate-${i.id}`} type="range" min={0} max={100} step={5} value={rates[i.id] ?? 0} onChange={e => setRates({ ...rates, [i.id]: Number(e.target.value) })} aria-label={`Recovery assumption for ${i.title}`} /><div className="range-labels"><span>0% recovered</span><span>{money(Math.round(i.exposure * (rates[i.id] ?? 0) / 100))} modeled uplift</span><span>100%</span></div><button className="text-button small" onClick={() => setSelected(i)}>Review the assumption <ArrowUpRight size={13} /></button></div>; })}<button className="text-button" onClick={() => setRates(Object.fromEntries(analysis.issues.map(i => [i.id, 0])))}><RotateCcw size={14} />Set all to zero</button></section><section className="scenario-result"><span className="eyebrow">THE WHAT-IF</span><h2>A little less leakage.<br />A little more room.</h2><span className="scenario-big">+{money(recovery)}</span><p>Illustrative contribution uplift</p><div className="scenario-comparison"><span>Current contribution<strong>{money(analysis.totals.contribution)}</strong></span><span>Scenario contribution<strong>{money(analysis.totals.contribution + recovery)}</strong></span></div><div className="scenario-bar"><span style={{ width: `${Math.max(1, Math.min(100, (analysis.totals.contribution / Math.max(1, analysis.totals.contribution + recovery)) * 100))}%` }} /></div><p className="method-text">Each finding’s exposure × your recovery assumption, rounded to cents, then summed. Revenue is held fixed for comparison. No changes are applied to your store.</p><button className="button dark" onClick={exportReport}><ArrowDownToLine size={16} />Export this scenario</button></section><div className="scenario-disclaimer"><CircleHelp size={18} /><p>These scenarios assume independent cost and discount improvements, with no change in demand or execution costs. Refund exposures are excluded from discount and shipping rules. Actual outcomes can differ. This is contribution analysis, not accounting profit.</p></div></div> : null}
    {view === 'data' ? <div className="data-layout"><section className="card"><div className="section-title"><div><h2>Bring your orders. Keep your context.</h2><p className="caption">UTF-8 CSV · USD only · up to 2 MB / 10,000 rows</p></div><FileSpreadsheet size={24} /></div><div className="upload-zone" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void importFile(e.dataTransfer.files[0]); }}><Upload size={30} /><h3>Drop your order CSV here</h3><p>One unique order per row. All columns are required.</p><button className="button primary" disabled={busy} onClick={() => upload.current?.click()}>Choose CSV file</button><a className="text-button" href="/api/template" download>Download example CSV <ArrowDownToLine size={14} /></a></div><CsvMappingAssistant busy={busy} onImport={importFile} /><h3>Expected columns</h3><div className="schema-list">{[['order_id', 'Unique ID; letters, numbers, _ or -'], ['order_date', 'YYYY-MM-DD; real calendar date'], ['sku, category', 'Product labels; simple text up to 64 characters'], ['gross_sales', 'Positive merchandise sales before discounts'], ['discount', 'Nonnegative; no more than gross sales'], ['promo_count', 'Integer from 0 to 10'], ['cogs', 'Total cost of goods for the order'], ['shipping_charged, shipping_cost', 'Customer fee and actual carrier cost'], ['refund, return_cost', 'Merchandise refunded and handling cost']].map(([field, info]) => <div key={field}><code>{field}</code><span>{info}</span></div>)}</div><p className="caption">Amounts: nonnegative decimal USD with up to two decimal places; no currency symbols or thousands separators. Refund ≤ gross − discount. Partial refunds count as returns. Unknown, duplicate, and missing columns are rejected.</p></section><div><section className="card method-card"><span className="eyebrow"><ShieldCheck size={16} /> BUILT FOR TRUST</span><h2>Evidence first.<br />Explanation second.</h2><p className="method-text">The engine calculates every number. The optional model turns validated findings into an action brief. Model text cannot change source values or execute actions.</p><h3>The contribution formula</h3><code className="formula">Gross − discounts − refunds + shipping charged − COGS − shipping cost − return cost</code><p className="method-text">COGS stays expensed on returned orders. Taxes, payment fees, marketing spend, restock credits, and fixed overhead are outside this MVP. The engine uses integer cents; displayed headline values round to whole dollars.</p><h3>Three transparent rules</h3><p className="method-text">Seller-assumed rules, not platform requirements. Discount stacking: two or more promos and discounts above {analysis.assumptions.discountCeilingPercent}% of gross. Shipping: cost above shipping charged plus a {preciseMoney(analysis.assumptions.shippingSubsidyCents)} subsidy. Returns: latest seven days versus the preceding twenty-one, with volume and rate thresholds shown in the evidence drawer.</p><h3>Your data stays transient</h3><p className="method-text">CSV content is sent to this app's server for validation and calculation, then kept in the browser session and transient server memory. This app does not store CSVs in a database or analytics. On the public demo, use synthetic or non-sensitive data. Hosting infrastructure may process request metadata. Optional provider requests require an explicit click; search receives generic context, and Nebius receives aggregate findings and selected policy excerpts.</p><button className="text-button" onClick={loadDemo}><RotateCcw size={14} />Load reproducible synthetic demo</button></section><div className="fingerprint"><ShieldCheck size={17} /><div><strong>Dataset fingerprint</strong><code>{analysis.fingerprint}</code><p>SHA-256 prefix of the exact CSV bytes.</p></div></div></div></div> : null}
    <footer className="page-footer"><a href="https://github.com/Allenllii/marginguard/blob/main/docs/RELEASE.md" target="_blank" rel="noopener noreferrer">Source &amp; version</a><span><ShieldCheck size={13} />Evidence you can inspect. Decisions you own.</span><span>MarginGuard MVP <span className="footer-dot">·</span> USD contribution analysis</span></footer>
    </>}
    </div></main>{workspaceActive && selected && analysis ? <EvidenceDrawer issue={selected} analysis={analysis} close={() => setSelected(null)} /> : null}
  </div>;
}
