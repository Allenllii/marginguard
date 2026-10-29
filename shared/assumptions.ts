export interface Assumptions { discountCeilingPercent: number; shippingSubsidyCents: number; }
export const DEFAULT_ASSUMPTIONS: Assumptions = { discountCeilingPercent: 20, shippingSubsidyCents: 300 };
export function validAssumptions(a: Assumptions) {
  return Number.isInteger(a.discountCeilingPercent) && a.discountCeilingPercent >= 0 && a.discountCeilingPercent <= 60 && Number.isInteger(a.shippingSubsidyCents) && a.shippingSubsidyCents >= 0 && a.shippingSubsidyCents <= 2000;
}
