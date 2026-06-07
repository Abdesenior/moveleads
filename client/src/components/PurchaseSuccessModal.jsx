import { X, CheckCircle2, User as UserIcon, Phone as PhoneIcon, ArrowRight } from 'lucide-react';
import { isRealEmail } from '../utils/leadDisplay';

/**
 * PurchaseSuccessModal — post-purchase celebration + handoff to MyLeads.
 *
 * Visual language mirrors ConfirmPurchaseModal (same overlay, container
 * chrome, header, row layout, footer button styling) so the buy flow has
 * one consistent look from Confirm → Success.
 *
 * SCOPE (2026-05-26 simplification, per operator's "one responsibility
 * per surface" guidance):
 *   The modal celebrates the unlock + hands the mover off to MyLeads.
 *   It does NOT re-render the operational-details breakdown the mover
 *   already saw pre-purchase in PreviewModal and is about to see in
 *   the MyLeads ExpandedPanel. The handoff cue below the customer
 *   details points there explicitly.
 *
 * Renders only:
 *   - Title (celebration)
 *   - One-sentence confirmation
 *   - Route card (identity reminder)
 *   - Customer details card — the unlock value just delivered
 *   - Subtle handoff cue: "Full move details … are in My Leads"
 *   - Two CTAs: View full move details → /dashboard/my-leads?highlight=<id>
 *               Keep browsing leads     → close modal
 *
 * Removed in 2026-05-26 simplification:
 *   - Move details card (homeType / access / urgency / distance rows)
 *   - Heavy items chip list
 *   Both duplicated content the mover sees in PreviewModal pre-purchase
 *   AND in MyLeads ExpandedPanel post-purchase. PR A of the lead-detail
 *   architecture simplification, paired with PR B which lightens the
 *   pre-purchase PreviewModal in the same direction.
 */
export default function PurchaseSuccessModal({ lead, onView, onClose }) {
  if (!lead) return null;

  const hasContact = !!(lead.customerName && lead.customerPhone);
  const realEmail = isRealEmail(lead.customerEmail) ? lead.customerEmail : null;
  const hasHeavyItems = Array.isArray(lead.heavyItems) && lead.heavyItems.length > 0;
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
          {/* One-sentence celebration. The handoff-to-MyLeads cue sits at
              the bottom of the body where the user's eye lands before
              the CTAs — keeps this top line purely affirmational. */}
          <p style={{ margin: '0 0 16px', fontSize: 13.5, color: '#475569', lineHeight: 1.5 }}>
            You now have full access to the customer's contact details.
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
              {/* P1 (2026-05-30) — phone wraps in tel: + email in mailto:
                  so the post-unlock moment hands the mover a one-tap call. */}
              <ContactRow
                icon={<PhoneIcon size={14} />} label="Phone" value={lead.customerPhone} mono
                href={lead.customerPhone ? `tel:${String(lead.customerPhone).replace(/[^\d+]/g, '')}` : null}
                testId="success-call-link"
              />
              {realEmail && (
                <ContactRow
                  label="Email" value={realEmail} mono
                  href={`mailto:${realEmail}`}
                  testId="success-mail-link"
                />
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

          {/* Handoff cue — pointer to the comprehensive view in MyLeads.
              Replaces the prior duplicated Move details card per the
              2026-05-26 architecture simplification: PurchaseSuccessModal
              celebrates + hands off; MyLeads is the single workspace for
              the full operational breakdown. Heavy items get one
              lightweight mention here (no enumeration) so the mover
              knows the next page surfaces them. */}
          <div style={{
            marginTop: 14,
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 12.5, color: '#64748b',
            paddingTop: 12, borderTop: '1px dashed #e2e8f0',
          }}>
            <ArrowRight size={14} style={{ color: '#94a3b8', flexShrink: 0 }} />
            <span>
              Home type, access, urgency
              {hasHeavyItems && <>, and <strong style={{ color: '#0f172a' }}>heavy items included</strong></>}
              {' '}are listed in your{' '}
              <strong style={{ color: '#0f172a' }}>My Leads</strong> dashboard.
            </span>
          </div>
        </div>

        {/* Footer — P2 (2026-05-30) CTA reorder. Primary = "Call now"
            (tel: link), secondary = "View in My Leads", tertiary text
            link = "Keep browsing." The post-unlock moment is the moment
            of highest intent; the system should point at the call, not
            the marketplace. */}
        <div className="psm-footer" style={{
          padding: '14px 24px 18px', borderTop: '1px solid #f1f5f9',
          display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap',
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '11px 14px', borderRadius: 10,
              border: 'none', background: 'transparent',
              color: '#64748b', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
              textDecoration: 'underline',
            }}
          >
            Keep browsing
          </button>
          <button
            type="button"
            onClick={onView}
            style={{
              padding: '11px 18px', borderRadius: 10,
              border: '1px solid #e2e8f0', background: '#fff',
              color: '#0f172a', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            View in My Leads
          </button>
          {hasContact && lead.customerPhone && (
            <a
              href={`tel:${String(lead.customerPhone).replace(/[^\d+]/g, '')}`}
              data-testid="success-call-now-cta"
              className="psm-call-now"
              style={{
                padding: '12px 22px', borderRadius: 10, border: 'none',
                background: 'linear-gradient(135deg,#16a34a,#15803d)',
                color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer',
                fontFamily: 'var(--font-heading)',
                textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8,
                boxShadow: '0 4px 14px rgba(22,163,74,0.30)',
              }}
            >
              <PhoneIcon size={15} /> Call {lead.customerName ? lead.customerName.split(' ')[0] : 'now'}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function ContactRow({ icon, label, value, mono = false, href = null, testId = null }) {
  const inner = (
    <>
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
          fontSize: 14, color: href ? '#0d9488' : '#0f172a', fontWeight: 700,
          fontFamily: mono ? 'ui-monospace, SF Mono, Menlo, monospace' : 'inherit',
          letterSpacing: mono ? '-0.01em' : 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {value}
        </div>
      </div>
    </>
  );
  const rowStyle = { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', textDecoration: 'none', color: 'inherit' };
  return href
    ? <a href={href} data-testid={testId || undefined} style={rowStyle}>{inner}</a>
    : <div style={rowStyle}>{inner}</div>;
}
