import { X, AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react';

/**
 * ConfirmPurchaseModal — pre-purchase confirmation gate for lead unlock.
 *
 * Phase B of the purchase-flow cleanup. Replaces the prior "click Unlock →
 * instant POST → balance gone" flow with an explicit confirmation step
 * that surfaces the financial impact before charging.
 *
 * Props:
 *   lead          — the Lead doc to confirm
 *   balance       — current mover balance (number)
 *   onConfirm     — called when the user clicks Confirm purchase
 *   onCancel      — called when the user clicks Cancel or the X
 *   isProcessing  — true while the buy-now POST is in flight (disables buttons)
 *   error         — server-side error message to display inline (e.g. lost race)
 *   errorKind     — 'race' | 'insufficient' | 'generic' — picks the right icon/copy
 *
 * Behavior:
 *   - Pre-flight insufficient balance: Confirm button disabled, red "Add Funds" CTA
 *   - In-flight (isProcessing): Confirm shows "Processing…" and is disabled
 *   - Error after submit: shows error block in modal (lead-already-purchased,
 *     generic 5xx). Modal stays open until the user dismisses — never closes
 *     itself on error, since the user needs to read why.
 *   - On 'race' error (lead bought by someone else mid-confirm): the only
 *     button becomes "Close" — there's no Add Funds path; the lead is gone.
 */
export default function ConfirmPurchaseModal({
  lead,
  balance,
  onConfirm,
  onCancel,
  isProcessing = false,
  error = '',
  errorKind = 'generic',
}) {
  if (!lead) return null;

  const price = Number(lead.buyNowPrice || lead.price || 0);
  const balanceAfter = Number(balance || 0) - price;
  const insufficient = balanceAfter < 0;
  const raceLost = errorKind === 'race';
  const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

  // Route display — prefer "City, ST" when state available
  const fmtPart = (city, state) => {
    if (city && state) return `${city}, ${state}`;
    return city || state || '—';
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-purchase-title"
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15,23,42,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        // 13500 — above the mobile fixed app bar (12100 in dashboard.css).
        zIndex: 13500, padding: 20,
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 16, width: '100%', maxWidth: 460,
          boxShadow: '0 24px 64px rgba(15,23,42,0.18), 0 4px 16px rgba(15,23,42,0.06)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 id="confirm-purchase-title" style={{
            margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a',
            fontFamily: 'var(--font-heading)', letterSpacing: '-0.01em',
          }}>
            Confirm lead purchase
          </h2>
          <button
            type="button"
            aria-label="Cancel"
            onClick={onCancel}
            disabled={isProcessing}
            style={{
              background: 'transparent', border: 'none',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              color: '#94a3b8', padding: 4, lineHeight: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 6,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px' }}>
          {/* Race-loss banner — replaces the body details if the lead was just bought by someone else */}
          {raceLost ? (
            <div style={{
              padding: '16px 18px', borderRadius: 12,
              background: '#fff7ed', border: '1px solid #fed7aa',
              display: 'flex', gap: 12, alignItems: 'flex-start',
            }}>
              <CheckCircle2 size={22} color="#ea580c" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                  This lead was just purchased
                </div>
                <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.45 }}>
                  Another mover unlocked it a moment before you. Your balance was not charged.
                  We'll keep showing you fresh leads as they come in.
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Route */}
              <div style={{
                padding: '14px 16px', borderRadius: 12,
                background: '#f8fafc', border: '1px solid #e2e8f0',
                marginBottom: 18,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
                  Route
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{fmtPart(lead.originCity, lead.originState)}</span>
                  <span style={{ color: '#cbd5e1', fontWeight: 400 }}>→</span>
                  <span>{fmtPart(lead.destinationCity, lead.destinationState)}</span>
                </div>
                {(lead.homeSize || lead.distance) && (
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                    {[lead.homeSize, lead.distance].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>

              {/* Money breakdown */}
              <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
                <Row label="Lead price"      value={fmt(price)}                      bold />
                <Row label="Your balance"    value={fmt(balance)}                    muted />
                <Row label="After purchase"  value={fmt(balanceAfter)}
                     color={insufficient ? '#dc2626' : '#16a34a'} bold />
              </div>

              {/* Warning */}
              <div style={{
                padding: '12px 14px', borderRadius: 10,
                background: insufficient ? '#fee2e2' : '#fef3c7',
                border: `1px solid ${insufficient ? '#fecaca' : '#fde68a'}`,
                display: 'flex', gap: 10, alignItems: 'flex-start',
              }}>
                <AlertTriangle size={16} color={insufficient ? '#dc2626' : '#d97706'} style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 12.5, color: '#0f172a', lineHeight: 1.45 }}>
                  {insufficient
                    ? <>You don't have enough balance for this purchase. Add funds to continue.</>
                    : <><strong>{fmt(price)}</strong> will come out of your balance. If the customer is unreachable, you can request a refund from this lead's page.</>
                  }
                </div>
              </div>

              {/* Server-side error after submit (not race-loss — that's handled above) */}
              {error && !raceLost && (
                <div style={{
                  marginTop: 14, padding: '10px 14px', borderRadius: 10,
                  background: '#fee2e2', border: '1px solid #fecaca',
                  fontSize: 13, fontWeight: 600, color: '#dc2626',
                }}>
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer — M6 (2026-05-30) mobile QA: buttons wrap to a stacked
            layout under 480px so the "Confirm purchase – $X" label can't
            truncate. flexWrap + min-width on each button ensures the dollar
            amount stays readable on iPhone SE-class screens. */}
        <div className="cpm-footer" style={{
          padding: '14px 24px 18px', borderTop: '1px solid #f1f5f9',
          display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap',
        }}>
          {raceLost ? (
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '11px 22px', borderRadius: 10, border: 'none',
                background: 'linear-gradient(135deg,#f97316,#ea580c)',
                color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'var(--font-heading)',
              }}
            >
              Got it
            </button>
          ) : insufficient ? (
            <>
              <button
                type="button"
                onClick={onCancel}
                disabled={isProcessing}
                style={{
                  padding: '11px 18px', borderRadius: 10,
                  border: '1px solid #e2e8f0', background: '#fff',
                  color: '#64748b', fontSize: 13, fontWeight: 600,
                  cursor: isProcessing ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
              <a
                href="/dashboard/billing"
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '11px 18px', borderRadius: 10, textDecoration: 'none',
                  background: 'linear-gradient(135deg,#f97316,#ea580c)',
                  color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-heading)',
                }}
              >
                Add funds <ExternalLink size={13} />
              </a>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onCancel}
                disabled={isProcessing}
                style={{
                  padding: '11px 18px', borderRadius: 10,
                  border: '1px solid #e2e8f0', background: '#fff',
                  color: '#64748b', fontSize: 13, fontWeight: 600,
                  cursor: isProcessing ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={isProcessing}
                style={{
                  padding: '11px 22px', borderRadius: 10, border: 'none',
                  background: isProcessing
                    ? 'linear-gradient(135deg,#fdba74,#fb923c)'
                    : 'linear-gradient(135deg,#f97316,#ea580c)',
                  color: '#fff', fontSize: 13, fontWeight: 700,
                  cursor: isProcessing ? 'wait' : 'pointer',
                  fontFamily: 'var(--font-heading)',
                  boxShadow: '0 4px 12px rgba(234,88,12,0.25)',
                }}
              >
                {isProcessing ? 'Processing…' : `Confirm purchase — ${fmt(price)}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, muted = false, bold = false, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <span style={{ fontSize: 13, color: muted ? '#94a3b8' : '#64748b' }}>{label}</span>
      <span style={{
        fontSize: bold ? 15 : 13,
        fontWeight: bold ? 800 : 600,
        color: color || (muted ? '#94a3b8' : '#0f172a'),
        fontFamily: bold ? 'var(--font-heading)' : 'inherit',
        letterSpacing: bold ? '-0.005em' : 0,
      }}>
        {value}
      </span>
    </div>
  );
}
