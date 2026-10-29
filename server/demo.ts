import { HEADERS } from './analysis.js';

// Fixed seed and dates: exact same fixture on every machine and every run.
export function createDemoCsv() {
  const rows: string[] = [HEADERS.join(',')];
  let state = 73021;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const products = [{ sku: 'CLOUD-HOODIE', category: 'Apparel', price: 89, cogs: 29 }, { sku: 'TRAIL-PACK', category: 'Accessories', price: 128, cogs: 43 }, { sku: 'STUDIO-MUG', category: 'Home', price: 42, cogs: 11 }];
  for (let day = 0; day < 28; day++) for (let product = 0; product < 3; product++) for (let j = 0; j < 6; j++) {
    const p = products[product];
    const date = new Date(Date.UTC(2026, 8, 1 + day)).toISOString().slice(0, 10);
    const gross = p.price + (random() > 0.75 ? 8 : 0);
    const stacked = product === 1 && day >= 14 && j < 2;
    const shippingSpike = product === 2 && day >= 7 && j === 5;
    const returned = product === 0 && ((day < 21 && day % 3 === 0 && j === 0) || (day >= 21 && j < 2));
    const discount = Math.round(gross * (stacked ? 0.38 : 0.1) * 100) / 100;
    rows.push([`MG-${String(day * 18 + product * 6 + j + 1).padStart(4, '0')}`, date, p.sku, p.category, gross.toFixed(2), discount.toFixed(2), stacked ? 2 : 1, p.cogs.toFixed(2), '4.90', shippingSpike ? '18.40' : (6.2 + random() * 1.2).toFixed(2), returned ? (gross - discount).toFixed(2) : '0.00', returned ? '7.50' : '0.00'].join(','));
  }
  return rows.join('\n') + '\n';
}
