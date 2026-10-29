import { useId, useRef, useState } from 'react';
import { parseOrders } from '../server/analysis';
import { buildMappedCsv, CSV_FIELDS, mappingProblems, readMappingCsv, suggestMapping, SYNTHETIC_MAPPING_CSV, type CsvMapping, type ParsedCsv } from '../shared/csv-mapping';
import './CsvMappingAssistant.css';

interface Props { busy: boolean; onImport: (file: File, syntheticExample: boolean) => Promise<void>; }
export default function CsvMappingAssistant({ busy, onImport }: Props) {
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const fileRequest = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const result = useRef<HTMLDivElement>(null);
  const [source, setSource] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<CsvMapping>({});
  const [confirmed, setConfirmed] = useState(false);
  const [reviewedExclusions, setReviewedExclusions] = useState<number[]>([]);
  const [validated, setValidated] = useState('');
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [synthetic, setSynthetic] = useState(false);
  const blocked = busy || reading;
  const problems = source ? mappingProblems(source, mapping) : [];
  const used = new Set(Object.values(mapping));
  const ignoredIndices = source?.headers.flatMap((_, index) => used.has(index) ? [] : [index]) ?? [];
  const ignored = ignoredIndices.map(index => source!.headers[index]);
  const exclusionsReviewed = ignoredIndices.every(index => reviewedExclusions.includes(index));

  function stage(text: string, isSynthetic: boolean) {
    const parsed = readMappingCsv(text);
    setSource(parsed); setMapping(suggestMapping(parsed.headers)); setSynthetic(isSynthetic);
    setConfirmed(false); setReviewedExclusions([]); setValidated(''); setError('');
    // The new controls follow this heading in keyboard order.
    requestAnimationFrame(() => heading.current?.focus());
  }
  async function chooseFile(file?: File) {
    if (!file) return;
    const requestId = ++fileRequest.current;
    setReading(true); setError(''); setSource(null); setValidated(''); setConfirmed(false); setReviewedExclusions([]);
    try {
      if (!file.name.toLowerCase().endsWith('.csv')) throw new Error('Choose a .csv file.');
      if (file.size > 2 * 1024 * 1024) throw new Error('CSV exceeds the 2 MB limit.');
      const text = await file.text();
      if (requestId === fileRequest.current) stage(text, false);
    } catch (cause) {
      if (requestId === fileRequest.current) setError((cause as Error).message);
    } finally {
      if (requestId === fileRequest.current) setReading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }
  function validate() {
    if (!source || !confirmed || !exclusionsReviewed) return;
    setError('');
    try {
      const csv = buildMappedCsv(source, mapping);
      parseOrders(csv); // The existing strict validator remains the contract.
      setValidated(csv);
      requestAnimationFrame(() => result.current?.focus());
    } catch (cause) { setValidated(''); setError((cause as Error).message); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([validated], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'marginguard-mapped-orders.csv'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function clear() {
    fileRequest.current++; setSource(null); setMapping({}); setConfirmed(false); setReviewedExclusions([]); setValidated(''); setError(''); setReading(false);
    fileInput.current?.focus();
  }

  return <section className="csv-mapper" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`}>Different column names? Map your CSV.</h3>
    <p>Match your order export to the analysis fields. All 12 fields are required. This tool renames and selects columns; it does not aggregate line items, convert currencies or dates, or fill missing costs.</p>
    <p className="csv-mapper-boundary">Your file is read locally for mapping. Only the selected columns are sent to this app's server when you choose Analyze mapped CSV. Use synthetic or non-sensitive data.</p>
    <div className="csv-mapper-actions">
      <label className="csv-mapper-file">Choose CSV to map<input ref={fileInput} type="file" accept=".csv,text/csv" disabled={blocked} onChange={e => void chooseFile(e.target.files?.[0])} /></label>
      <button type="button" disabled={blocked} onClick={() => { fileRequest.current++; stage(SYNTHETIC_MAPPING_CSV, true); }}>Try synthetic mapping example</button>
    </div>
    {reading ? <p role="status">Reading CSV locally…</p> : null}
    {error ? <p role="alert" className="csv-mapper-error">{error} Check the source file and field meanings, then try again.</p> : null}
    {source ? <>
      <h4 ref={heading} tabIndex={-1}>{synthetic ? 'Synthetic example' : 'Local mapping preview'}: {source.rows.length.toLocaleString()} order rows</h4>
      <p>Suggestions use column names only. Confirm what each column means. Amounts must be nonnegative decimal USD without currency symbols or thousands separators. Repeated order IDs and unsupported labels still fail validation.</p>
      <div className="csv-mapper-fields">{CSV_FIELDS.map(field => <div className="csv-mapper-field" key={field.key}>
        <label htmlFor={`${id}-${field.key}`}>{field.label}<code>{field.key}</code></label>
        <select id={`${id}-${field.key}`} value={mapping[field.key] ?? ''} aria-describedby={`${id}-${field.key}-help`} disabled={blocked} onChange={e => {
          const index = e.target.value === '' ? undefined : Number(e.target.value);
          setMapping(previous => ({ ...previous, [field.key]: index })); setConfirmed(false); setReviewedExclusions([]); setValidated(''); setError('');
        }}><option value="">Choose source column</option>{source.headers.map((header, index) => <option value={index} key={index}>{header}</option>)}</select>
        <small id={`${id}-${field.key}-help`}>{field.help}</small>
        <span className="csv-mapper-sample">First row: <code>{mapping[field.key] === undefined ? 'No column selected' : (source.rows[0][mapping[field.key]!] || '(empty)').slice(0, 96)}</code></span>
      </div>)}</div>
      <div className="csv-mapper-review" aria-live="polite">
        <p>{problems.length ? problems[0] : 'All 12 fields have distinct source columns.'}</p>
        <p>Excluded columns ({ignored.length}): {ignored.length ? ignored.join(', ') : 'none'}. These columns will not be downloaded or submitted.</p>
      </div>
      {ignoredIndices.length ? <fieldset className="csv-mapper-exclusions"><legend>Confirm excluded columns</legend><p>Review each omitted column. Its values will not enter the mapped download or analysis request.</p>{ignoredIndices.map(index => <label key={index}><input type="checkbox" aria-label={`Exclude column ${index + 1}: ${source.headers[index]}`} checked={reviewedExclusions.includes(index)} disabled={blocked} onChange={e => { setReviewedExclusions(previous => e.target.checked ? [...previous, index] : previous.filter(i => i !== index)); setConfirmed(false); setValidated(''); }} />Exclude column {index + 1}: {source.headers[index]}</label>)}</fieldset> : null}
      <label className="csv-mapper-confirm"><input type="checkbox" checked={confirmed} disabled={blocked || Boolean(problems.length) || !exclusionsReviewed} onChange={e => { setConfirmed(e.target.checked); setValidated(''); }} />I checked the field meanings and excluded columns. This CSV uses USD and one unique order per row.</label>
      <p>Rows keep their order; blank lines are removed. Evidence row numbers and the dataset fingerprint refer to the mapped CSV. Download that file to keep the exact evidence source.</p>
      <div className="csv-mapper-actions"><button type="button" onClick={validate} disabled={blocked || !confirmed || Boolean(problems.length) || !exclusionsReviewed}>Validate mapped CSV locally</button><button type="button" onClick={clear} disabled={blocked}>Clear mapping</button></div>
      {validated ? <div ref={result} tabIndex={-1} role="status" className="csv-mapper-result">
        <strong>{source.rows.length.toLocaleString()} mapped order rows passed local schema validation.</strong>
        <p>Financial findings are calculated after import. The server validates the selected fields again.</p>
        <div className="csv-mapper-actions"><button type="button" disabled={blocked} onClick={() => void onImport(new File([validated], 'marginguard-mapped-orders.csv', { type: 'text/csv' }), synthetic)}>Analyze mapped CSV</button><button type="button" disabled={blocked} onClick={download}>Download mapped CSV</button></div>
      </div> : null}
    </> : null}
  </section>;
}
