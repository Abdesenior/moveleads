import { X, CheckCircle2, User as UserIcon, Phone as PhoneIcon } from 'lucide-react';

/**
 * PurchaseSuccessModal — post-purchase confirmation that the lead is owned.
 *
 * Visual language mirrors ConfirmPurchaseModal (same overlay, container
 * chrome, header, row layout, footer button styling) so the buy flow has
 * one consistent look from Confirm → Success. Replaces the legacy
 * .modal-overlay / .success-modal / .contact-details-box CSS-class
 * component that pre-dated the Phase B refactor.
 *
 * Props:
 *   lead       — Lead doc returned by the buy-now/claim endpoint, with PII
 *                (customerName, customerPhone) populated for the buyer
 *   onView     — primary CTA handler (parent navigates to
 *                /dashboard/my-leads?highlight=<leadId>)
 *   onClose    — secondary CTA handler / overlay click (parent clears
 *                successData so the modal unmounts)
 *
 * Operator spec:
 *   - Title: "Lead purchased successfully"
 *   - Short confirmation message
 *   - Route summary
 *   - Customer/contact teaser or unlocked status
 *   - Two buttons:
 *       View full move details  →  onView
 *       Keep browsing leads     →  onClose
 */
export default function PurchaseSuccessModal({ lead, onView, onClose }) {
  if (!lead) return null;

  const hasContact = !!(lead.customerName && lead.customerPhone);
  const fmtPart = (city, state) => {
    if (city && state) return `${city}, ${state}`;
    return city || state || '—';
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="purchase-success-title"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15,23,42,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 20,
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
        {/* Header — mirrors ConfirmPurchaseModal chrome */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 id="purchase-success-title" style={{
            margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a',
            fontFamily: 'var(--font-heading)', letterSpacing: '-0.01em',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 26, height: 26, borderRadius: 999,
              background: '#dcfce7', color: '#16a34a',
              flexShrink: 0,
            }}>
              <CheckCircle2 size={16} />
            </span>
            Lead purchased successfully
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
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
          <p style={{ margin: '0 0 16px', fontSize: 13.5, color: '#475569', lineHeight: 1.5 }}>
            You now have full access to the customer's contact details. The
            lead has moved to your <strong>My Leads</strong> dashboard.
          </p>

          {/* Route — same chip-style card as ConfirmPurchaseModal */}
          <div style={{
            padding: '14px 16px', borderRadius: 12,
            background: '#f8fafc', border: '1px solid #e2e8f0',
            marginBottom: 14,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
              Route
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
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

          {/* Unlocked contact — labeled rows matching ConfirmModal's money breakdown */}
          {hasContact ? (
            <div style={{
              padding: '14px 16px', borderRadius: 12,
              background: '#f0fdf4', border: '1px solid #bbf7d0',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={12} /> Customer details unlocked
              </div>
              <ContactRow icon={<UserIcon size={14} />} label="Name"  value={lead.customerName} />
              <ContactRow icon={<PhoneIcon size={14} />} label="Phone" value={lead.customerPhone} mono />
              {lead.customerEmail && !String(lead.customerEmail).startsWith('noemail+') && (
                <ContactRow label="Email" value={lead.customerEmail} mono />
              )}
            </div>
          ) : (
            <div style={{
              padding: '12px 14px', borderRadius: 10,
              background: '#fff7ed', border: '1px solid #fed7aa',
              fontSize: 12.5, color: '#9a3412',
            }}>
              Contact details syncing — they'll appear on the My Leads page momentarily.
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px 18px', borderTop: '1px solid #f1f5f9',
          display: 'flex', gap: 10, justifyContent: 'flex-end',
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '11px 18px', borderRadius: 10,
              border: '1px solid #e2e8f0', background: '#fff',
              color: '#64748b', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Keep browsing leads
          </button>
          <button
            type="button"
            onClick={onView}
            style={{
              padding: '11px 22px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg,#f97316,#ea580c)',
              color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'var(--font-heading)',
              boxShadow: '0 4px 12px rgba(234,88,12,0.25)',
            }}
          >
            View full move details
          </button>
        </div>
      </div>
    </div>
  );
}

function ContactRow({ icon, label, value, mono = false }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '6px 0',
    }}>
      {icon && (
        <span style={{ color: '#16a34a', display: 'inline-flex', flexShrink: 0 }}>
          {icon}
        </span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginBottom: 1 }}>
          {label}
        </div>
        <div style={{
          fontSize: 14, color: '#0f172a', fontWeight: 700,
          fontFamily: mono ? 'ui-monospace, SF Mono, Menlo, monospace' : 'inherit',
          letterSpacing: mono ? '-0.01em' : 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {value}
        </div>
      </div>
    </div>
  );
}
