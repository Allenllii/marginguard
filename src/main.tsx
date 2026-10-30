import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

const PromoPreflight = React.lazy(() => import('./PromoPreflight'));

function Workspace() {
  const [{ preflight, analysisVisited, sandboxVisited }, setRoute] = React.useState(() => {
    const preflight = window.location.hash === '#preflight';
    return { preflight, analysisVisited: !preflight, sandboxVisited: preflight };
  });
  const analysisPanel = React.useRef<HTMLDivElement>(null);
  const sandboxPanel = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const navigate = () => {
      const next = window.location.hash === '#preflight';
      setRoute(previous => ({ preflight: next, analysisVisited: previous.analysisVisited || !next, sandboxVisited: previous.sandboxVisited || next }));
    };
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);
  React.useEffect(() => {
    (preflight ? sandboxPanel : analysisPanel).current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [preflight]);
  // Mount each workspace once and hide inactive content from focus and the
  // accessibility tree. Switching views must not discard imported data or edits.
  // Direct sandbox entry still mounts no analysis app and makes no API request.
  return <>
    {analysisVisited ? <div ref={analysisPanel} hidden={preflight} tabIndex={-1} aria-label="Analysis workspace"><App workspaceActive={!preflight} /></div> : null}
    {sandboxVisited ? <div ref={sandboxPanel} hidden={!preflight} tabIndex={-1} aria-label="Promo Preflight workspace"><React.Suspense fallback={<p role="status">Loading Promo Preflight sandbox…</p>}><PromoPreflight workspaceActive={preflight} /></React.Suspense></div> : null}
  </>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Workspace /></React.StrictMode>);
