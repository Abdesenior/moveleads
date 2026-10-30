// Shared KPI math for a mover's purchased leads (Dashboard + Customers).
// A job is "won" once the mover marks it Booked; Completed comes after
// Booked in the CRM flow, so it still counts as won. Refunded purchases
// cost the mover nothing, so they are left out of spend.

const WON = new Set(['Booked', 'Completed']);

export const isWon = (p) => WON.has(p?.crmStatus);

export function purchaseStats(purchases) {
  const list = Array.isArray(purchases) ? purchases : [];
  const paid = list.filter((p) => !p.refunded);
  const netSpend = paid.reduce((s, p) => s + (p.pricePaid || p.price || 0), 0);
  const jobsWon = list.filter(isWon).length;
  return {
    totalPurchased: list.length,
    jobsWon,
    netSpend,
    costPerJobWon: jobsWon > 0 ? netSpend / jobsWon : null,
  };
}
