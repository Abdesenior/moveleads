/**
 * personalize.js — pure helpers for reactive onboarding copy.
 *
 * Drives the conversational notes on Steps 2, 3, 5, 8 from mover-entered
 * state. No side effects, no React, no fetches. Returns strings (and
 * structured objects for the success checklist).
 *
 * All copy here is mover-language. No fake claims. No fake numbers.
 */

import { US_STATE_NAMES } from './InteractiveUSMap';

/** Parse the autocomplete-resolved "Houston, TX" address into city/state tokens. */
export function splitAddress(address) {
  const parts = (address || '').split(',');
  const cityName = (parts[0] || '').trim();
  const stateAbbr = (parts[1] || '').trim();
  const stateName = US_STATE_NAMES[stateAbbr] || '';
  return { cityName, stateAbbr, stateName };
}

/** Human-friendly phrase describing the mover's selected delivery states. */
export function buildStatesPhrase(deliveryStates) {
  const selNames = (deliveryStates || [])
    .map((a) => US_STATE_NAMES[a])
    .filter(Boolean);
  if (selNames.length === 0) return 'your selected states';
  if (selNames.length === 1) return selNames[0];
  if (selNames.length <= 4) return selNames.join(' • ');
  return `${selNames.length} selected states`;
}

/** Compact phrase for Step 5/8 — "nationwide", "across {states}", "near {city}", or fallback. */
export function buildCoverageShort({ deliveryMode, statesPhrase, cityName }) {
  if (deliveryMode === 'all') return 'nationwide';
  if (deliveryMode === 'some') return `across ${statesPhrase}`;
  return cityName ? `near ${cityName}` : 'in your area';
}

/** Success-screen summary line: "Nationwide", "Houston + TX • OK", "Houston · local moves". */
export function buildCoverageSummary({ deliveryMode, statesPhrase, cityName }) {
  if (deliveryMode === 'all') return 'Nationwide';
  if (deliveryMode === 'some') {
    return cityName ? `${cityName} + ${statesPhrase}` : statesPhrase;
  }
  return cityName ? `${cityName} · local moves` : 'Local moves';
}

/**
 * SMS Claim demo route — uses the mover's actual city + first selected
 * delivery state if available; falls back to plausible defaults otherwise.
 * Never invents numbers or volume.
 */
export function buildSmsRoute({ cityName, deliveryStates, deliveryMode }) {
  const origin = cityName || 'Houston';
  let dest = 'Dallas';
  if (deliveryStates && deliveryStates.length > 0) {
    dest = US_STATE_NAMES[deliveryStates[0]] || 'Dallas';
  } else if (deliveryMode === 'all') {
    dest = 'Denver';
  }
  return { origin, dest };
}

/** Plain-English alerts label based on chosen channels. */
export function buildAlertsLabel(channels) {
  if (channels.text && channels.email) return 'Text + email alerts enabled';
  if (channels.text) return 'Text alerts enabled';
  if (channels.email) return 'Email alerts enabled';
  return 'Alerts off — turn on anytime';
}

/**
 * Build the personalized Step 8 success checklist.
 * Each item is { text, on, soft? } — `soft` items render with a quieter
 * check style (used for skipped/deferred capabilities).
 */
export function buildSuccessItems({
  address, zip, coverageSummary, phoneVerified, alertsLabel,
  smsEnabled, balance,
}) {
  const items = [];
  items.push({
    text: address
      ? `Company location saved — ${address}${zip ? ' · ' + zip : ''}`
      : 'Company location saved',
    on: true,
  });
  items.push({
    text: address
      ? `Coverage configured — ${coverageSummary}`
      : 'Coverage configured',
    on: true,
  });
  if (phoneVerified) {
    items.push({ text: 'Phone verified', on: true });
  } else {
    items.push({
      text: 'Phone saved — verify later to receive SMS alerts',
      on: true,
      soft: true,
    });
  }
  items.push({ text: alertsLabel, on: true });
  if (smsEnabled) {
    items.push({ text: 'SMS Claim ready — claim leads by text', on: true });
  } else {
    items.push({ text: 'You can enable SMS Claim later', on: true, soft: true });
  }
  if (balance > 0) {
    items.push({
      text: `Credit activated — $${balance} ready to claim & unlock`,
      on: true,
    });
  } else {
    items.push({ text: 'Credit can be added later', on: true, soft: true });
  }
  return items;
}

/**
 * Map design UI vocab ('local'/'some'/'all') to server vocab
 * ('same'/'states'/'nationwide').
 *
 * Server's /api/onboarding/save-step handler expects {same, states, nationwide}
 * — these are the schema enums on User.deliversNationwide branching and on
 * Settings → Service Areas. The design uses lighter language for movers.
 */
export function mapDeliveryUiToServer(uiMode) {
  if (uiMode === 'local') return 'same';
  if (uiMode === 'some') return 'states';
  if (uiMode === 'all') return 'nationwide';
  return 'same'; // safe default
}

/**
 * Derive pickup.{mode,states} from the delivery answer + the mover's
 * dispatch base. The wizard no longer asks for pickup mode — this rule
 * is the load-bearing translation that lets the matcher work.
 *
 * Operator-approved rule (2026-06-03):
 *   local → pickup.mode = near, pickup.states = []
 *           (matcher uses zipcodes.radius(dispatchBase.zip, 50))
 *   some  → pickup.mode = states, pickup.states = [home, ...selected] (deduped)
 *   all   → pickup.mode = states, pickup.states = [home]   (home seeded only)
 *
 * The "include home state" choice on `some` ensures pickup from the mover's
 * own state is always allowed, even if they only listed OTHER states as
 * delivery targets. The "home-only seed" on `all` is conservative —
 * nationwide delivery does not imply nationwide pickup; crews are still
 * physically based somewhere.
 */
export function derivePickup({ deliveryUiMode, deliveryStates, homeState }) {
  if (deliveryUiMode === 'local') {
    return { mode: 'near', states: [] };
  }
  if (deliveryUiMode === 'some') {
    const set = new Set();
    if (homeState) set.add(homeState);
    for (const s of (deliveryStates || [])) {
      if (s) set.add(s);
    }
    return { mode: 'states', states: Array.from(set) };
  }
  if (deliveryUiMode === 'all') {
    return { mode: 'states', states: homeState ? [homeState] : [] };
  }
  return { mode: 'near', states: [] };
}
