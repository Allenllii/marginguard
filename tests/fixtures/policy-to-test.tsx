import React from 'react';
import ReactDOM from 'react-dom/client';
import type { ResearchPacket } from '../../shared/types';
import PolicyTestLab from '../../src/PolicyTestLab';
import '../../src/styles.css';

// Authored offline fixture for a component regression. These sentences are not
// asserted as a current retrieval, semantic certification, or a real-store test.
const packet: ResearchPacket = {
  researchId: 'fixture-policy-to-test-ui', kind: 'discount', mode: 'fixture', status: 'ok',
  context: { platform: 'Shopify', carrier: 'USPS', region: 'US', discountOrigin: 'unknown' },
  query: 'Synthetic generic discount policy fixture; no search performed', checkedAt: null,
  note: 'Offline authored UI fixture. No CSV or provider is connected.',
  sources: [{
    id: 'S1', title: 'Authored combination policy UI fixture',
    url: 'https://help.shopify.com/en/manual/discounts/discount-combinations',
    snippet: 'Eligible discount classes can combine when the relevant settings permit it. Manual POS and draft-order discounts apply regardless of combination settings.',
    publishedDate: null, sourceRegion: 'global',
  }],
};

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>
  <main className="policy-test-harness">
    <h1>Policy-to-Test component verification</h1>
    <p>Isolated authored fixture. No current policy search, provider call, store connection, or transaction execution.</p>
    <PolicyTestLab packet={packet} />
  </main>
</React.StrictMode>);
