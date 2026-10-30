import type { ReactNode } from 'react';

/** One collapsible place per panel for the caveats that matter. */
export default function Limits({ items, label = 'Limits' }: { items: ReactNode[]; label?: string }) {
  return <details className="limits"><summary>{label}</summary><ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul></details>;
}

/** The single site-wide caveat, shown once at the top of each workspace. */
export function DemoBanner() {
  return <p className="demo-banner" role="note"><strong>Synthetic store data.</strong> No store connection. Live Tavily search and Nemotron drafts run only when you run MarginGuard locally with your own keys and click; otherwise you see saved results. The manual-discount case replays a recorded live Tavily and Nemotron run from October 30.</p>;
}
