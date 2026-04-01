import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import MarketingLayout from '../components/MarketingLayout';
import useCanonical from '../utils/useCanonical';

const F = "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif";
const NAVY = '#0b1628';
const ORANGE = '#f97316';

const SECTIONS = [
  {
    id: 'acceptance',
    title: '1. Acceptance of Terms',
    content: `By accessing or using moveleads.cloud ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the Service.

These terms apply to all users, including homeowners requesting moving quotes ("Customers") and moving companies purchasing leads ("Movers").`,
  },
  {
    id: 'for-customers',
    title: '2. For Homeowners (Customers)',
    content: `MoveLeads is a free quote request service. By submitting a quote request you agree to:

**Be contacted:** You consent to be contacted by licensed moving companies on our platform via phone, email, or text message regarding your moving request.

**Accurate information:** You agree to provide accurate and truthful information about your move, including origin, destination, home size, and move date.

**No obligation:** Receiving a quote does not obligate you to hire any moving company. You are free to accept or decline any offer.

**Data sharing:** Your contact information and move details will be shared with moving companies who service your route.`,
  },
  {
    id: 'for-movers',
    title: '3. For Moving Companies (Movers)',
    content: `**Licensing requirement:** You must maintain a valid operating license (USDOT number or state equivalent) to use the Service. MoveLeads reserves the right to verify and revoke access at any time.

**Pay per lead:** You agree to pay per lead as shown at time of purchase. Prices are dynamic and may vary based on lead quality, distance, home size, and demand.

**All sales final:** All lead purchases are final. Refunds are only available if a lead is proven invalid (disconnected phone, duplicate, or fraudulent) and a dispute is filed within 24 hours of purchase.

**Lead exclusivity:** Leads may be sold to multiple moving companies unless explicitly marked as exclusive.

**Prohibited conduct:** You may not resell leads, use them for purposes other than contacting the customer about their move, or engage in any deceptive or harassing contact.

**Account suspension:** MoveLeads reserves the right to suspend or terminate accounts that violate these terms, generate excessive disputes, or receive consistent negative feedback.`,
  },
  {
    id: 'payment',
    title: '4. Payment Terms',
    content: `Payments are processed securely via Stripe. By adding a payment method, you authorize MoveLeads to charge your card for lead purchases.

Credits purchased on the platform do not expire but are non-refundable except as provided in the dispute resolution policy.

MoveLeads reserves the right to change pricing at any time with notice.`,
  },
  {
    id: 'disputes',
    title: '5. Dispute Resolution',
    content: `If you believe a lead is invalid, you may file a dispute within 24 hours of purchase through your dashboard.

A lead is considered invalid if:
- The phone number is disconnected or non-functional
- The lead is a duplicate of one you previously purchased
- The lead is demonstrably fraudulent

Approved disputes result in a credit to your MoveLeads account balance. MoveLeads decisions on disputes are final.`,
  },
  {
    id: 'disclaimer',
    title: '6. Disclaimer of Warranties',
    content: `The Service is provided "as is" without warranties of any kind. MoveLeads does not guarantee:

- That every lead will result in a booked move
- The accuracy of customer-provided information
- Any specific lead volume or quality

MoveLeads is a lead generation platform, not a moving company, and bears no responsibility for the quality of moving services provided by companies in our network.`,
  },
  {
    id: 'limitation',
    title: '7. Limitation of Liability',
    content: `To the fullest extent permitted by law, MoveLeads shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Service.

Our total liability for any claim shall not exceed the amount you paid to MoveLeads in the 30 days preceding the claim.`,
  },
  {
    id: 'changes',
    title: '8. Changes to Terms',
    content: `MoveLeads may update these Terms of Service at any time. Continued use of the Service after changes are posted constitutes acceptance of the updated terms.

We will notify registered users of material changes via email.`,
  },
  {
    id: 'contact',
    title: '9. Contact',
    content: `Questions about these Terms? Contact us at support@moveleads.cloud.`,
  },
];

export default function Terms() {
  useCanonical('/terms');
  useEffect(() => { document.title = 'Terms of Service — MoveLeads.cloud'; }, []);

  return (
    <MarketingLayout>
      {/* Hero */}
      <section style={{
        background: `linear-gradient(160deg, ${NAVY} 0%, #0f2447 100%)`,
        padding: '90px 0 70px',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: '-20%', right: '-10%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(249,115,22,0.08) 0%, transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 28px', position: 'relative' }}>
          <div style={{ display: 'inline-block', background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.22)', borderRadius: 100, padding: '5px 16px', marginBottom: 20 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: ORANGE, letterSpacing: 1, textTransform: 'uppercase' }}>Legal</span>
          </div>
          <h1 style={{ fontSize: 44, fontWeight: 900, color: '#fff', margin: '0 0 16px', letterSpacing: '-0.8px', lineHeight: 1.1 }}>
            Terms of Service
          </h1>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.55)', margin: 0 }}>
            Last updated: April 1, 2026
          </p>
        </div>
      </section>

      {/* Content */}
      <section style={{ padding: '72px 0 100px', background: '#fff' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 28px', display: 'grid', gridTemplateColumns: '1fr', gap: 0 }}>

          {/* Intro */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: '24px 28px', marginBottom: 40 }}>
            <p style={{ margin: 0, fontSize: 15, color: '#475569', lineHeight: 1.7 }}>
              Please read these Terms of Service carefully before using MoveLeads.cloud. These terms govern your use of our platform as both a homeowner requesting moving quotes and as a moving company purchasing leads.
            </p>
          </div>

          {SECTIONS.map((sec) => (
            <div key={sec.id} id={sec.id} style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: 36, marginBottom: 36 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: NAVY, margin: '0 0 16px', letterSpacing: '-0.3px' }}>
                {sec.title}
              </h2>
              <div style={{ fontSize: 15, color: '#475569', lineHeight: 1.75 }}>
                {sec.content.split('\n\n').map((para, i) => {
                  if (para.startsWith('- ')) {
                    const items = para.split('\n').filter(l => l.startsWith('- '));
                    return (
                      <ul key={i} style={{ margin: '0 0 16px', paddingLeft: 20 }}>
                        {items.map((item, j) => (
                          <li key={j} style={{ marginBottom: 6 }}
                            dangerouslySetInnerHTML={{ __html: item.slice(2).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }}
                          />
                        ))}
                      </ul>
                    );
                  }
                  return (
                    <p key={i} style={{ margin: '0 0 16px' }}
                      dangerouslySetInnerHTML={{ __html: para.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }}
                    />
                  );
                })}
              </div>
            </div>
          ))}

          {/* Footer note */}
          <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 14, padding: '24px 28px', textAlign: 'center' }}>
            <p style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: '#92400e' }}>Questions about these terms?</p>
            <p style={{ margin: 0, fontSize: 14, color: '#b45309' }}>
              Email us at{' '}
              <a href="mailto:support@moveleads.cloud" style={{ color: ORANGE, fontWeight: 600, textDecoration: 'none' }}>
                support@moveleads.cloud
              </a>
              {' '}or visit our{' '}
              <Link to="/contact" style={{ color: ORANGE, fontWeight: 600, textDecoration: 'none' }}>Contact page</Link>.
            </p>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
