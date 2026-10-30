import type { ReactNode } from 'react';

/** One collapsible place per panel for the caveats that matter. */
export default function Limits({ items, label = 'Limits' }: { items: ReactNode[]; label?: string }) {
  return <details className="limits"><summary>{label}</summary><ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul></details>;
}

/** The single site-wide caveat, shown once at the top of each workspace. */
export function DemoBanner() {
  return <p className="demo-banner" role="note"><strong>Synthetic store data.</strong> No store connection. Live Tavily and Nemotron calls run only when the header says Live and you click a live button; everything else is a labelled recorded run from October 30.</p>;
}
