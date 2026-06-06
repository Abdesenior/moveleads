/**
 * Step 1 — Welcome. No inputs. No save. Single primary CTA in the footer
 * (controller renders the footer; this component is body-only).
 *
 * Trust-chip copy is operator-approved and locked in by W3 / W4 of
 * server/__tests__/onboardingV2WizardLockIn.test.js.
 */

import { Home, Filter, Unlock, PhoneCall, Check } from 'lucide-react';

const FLOW = [
  { Icon: Home,      label: 'Homeowner requests a quote' },
  { Icon: Filter,    label: 'We qualify the request' },
  { Icon: Unlock,    label: 'You claim the fresh lead' },
  { Icon: PhoneCall, label: 'Call the customer' },
];

const TRUST_CHIPS = [
  'Exclusive leads',
  'Ready-to-book customers',
  'Delivered within seconds',
];

export default function StepWelcome() {
  return (
    <div className="ow-content ow-content--wide">
      <div className="ow-welcome2">
        <div className="ow-welcome2-copy">
          <span className="ow-eyebrow">Welcome to MoveLeads</span>
          <h1 className="ow-h1">Get more moving jobs in your service area</h1>
          <p className="ow-sub">
            Real, qualified homeowner move requests — matched to movers in
            the areas they serve.
          </p>
          <div className="ow-chips">
            {TRUST_CHIPS.map((c) => (
              <span className="ow-chip" key={c}>
                <Check size={13} strokeWidth={3} /> {c}
              </span>
            ))}
          </div>
        </div>

        <div className="ow-flow" role="list" aria-label="How MoveLeads works">
          {FLOW.map((f, i) => (
            <div
              className="ow-flow-node"
              role="listitem"
              key={f.label}
              style={{ animationDelay: 140 + i * 120 + 'ms' }}
            >
              <span className="ow-flow-icon"><f.Icon size={18} /></span>
              <span className="ow-flow-label">{f.label}</span>
              {i < FLOW.length - 1 && (
                <span className="ow-flow-line" aria-hidden="true" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
