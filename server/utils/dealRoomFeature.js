/**
 * Deal Room feature flag — V1 kill switch.
 *
 * One env var controls every Deal Room surface:
 *   ENABLE_DEAL_ROOM=true   → mover endpoint serves, admin actions accepted
 *   anything else (default) → mover endpoint 404s, admin actions return 503
 *
 * Used by routes/leads.js (mover deals endpoint), routes/adminInventory.js
 * (admin bulk endpoint), and AdminLeads.jsx (UI hides actions when off).
 * Frontend can query the effective state via existing settings endpoints if
 * we ever want a runtime gate, but for V1 the env-only check is sufficient.
 *
 * Rollback: unset / set to anything other than 'true'/'1' → feature offline
 * within one restart. Data persists (inventoryChannel + originalPrice stay
 * on disk) but no surface exposes it.
 */

function isEnabled() {
  const raw = String(process.env.ENABLE_DEAL_ROOM ?? '').trim().toLowerCase();
  return raw === 'true' || raw === '1';
}

module.exports = { isEnabled };
