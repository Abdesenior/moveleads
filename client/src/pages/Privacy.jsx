import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import MarketingLayout from '../components/MarketingLayout';

const F = "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif";
const NAVY = '#0b1628';
const ORANGE = '#f97316';
const BL = 'rgba(15,23,42,0.08)';
const NOISE = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E")`;

const SECTIONS = [
  {
    id: 'information-we-collect',
    title: '1. Information We Collect',
    content: `We collect information you provide directly to us when you create an account, purchase leads, or contact us for support. This includes:

**Account information:** Name, email address, company name, phone number, and password when you register.

**Payment information:** We use Stripe to process payments. We do not store your full credit card number on our servers. Stripe may collect and store payment data per their Privacy Policy.

**Lead purchase data:** Records of which leads you purchase, including timestamps, lead details, and purchase amounts.

**Usage data:** Information about how you use our platform, including pages visited, features used, and interactions with leads.

**Communications:** Messages you send to our support team, feedback, and survey responses.

We also automatically collect certain technical information when you use our service, including IP address, browser type, operating system, referring URLs, and device identifiers.`,
  },
  {
    id: 'how-we-use',
    title: '2. How We Use Your Information',
    content: `We use the information we collect to:

- **Provide our services:** Deliver leads to your dashboard, process payments, and manage your account.
- **Improve our platform:** Analyze usage patterns to enhance features and fix issues.
- **Communicate with you:** Send transactional emails (receipts, lead notifications), respond to support requests, and send service updates.
- **Prevent fraud:** Detect and prevent fraudulent activity, including fake accounts and payment fraud.
- **Legal compliance:** Comply with applicable laws and respond to lawful requests from authorities.
- **Marketing:** With your consent, send promotional emails about new features or offers. You may opt out at any time.

We do not sell your personal information to third parties. We do not share your data with advertising networks.`,
  },
  {
    id: 'lead-data',
    title: '3. Lead Data & Third-Party Information',
    content: `MoveLeads sources leads from individuals who have submitted moving quote requests through our partner network. This data is handled as follows:

**Lead contact information** (name, phone, email, address) is provided to you as a paying customer for the sole purpose of contacting that individual about their moving needs. You agree not to:
- Resell or redistribute leads to any third party
- Use lead data for any purpose unrelated to moving services
- Contact leads more than is reasonably necessary to close a job

**Data retention:** Lead contact information is encrypted in our database. We retain lead records for billing and compliance purposes for up to 3 years.

**Your responsibilities:** As a lead buyer, you act as a data controller for the contact information you receive. You are responsible for handling that data in compliance with applicable privacy laws (CCPA, CAN-SPAM, TCPA, etc.).`,
  },
  {
    id: 'data-sharing',
    title: '4. Sharing of Information',
    content: `We may share your information with:

**Service providers:** Companies that help us operate our platform, including Stripe (payments), AWS (hosting), SendGrid (email), and analytics providers. These providers are contractually required to protect your data.

**Business transfers:** If MoveLeads is acquired or merges with another company, your data may be transferred as part of that transaction. You will be notified before such a transfer.

**Legal requirements:** We may disclose your information if required by law, court order, or government request, or to protect the rights and safety of MoveLeads, our customers, or the public.

**Aggregated data:** We may share anonymized, aggregated statistics (e.g., "X moving companies use our platform") that do not identify any individual.

We will never sell your personal information to data brokers or advertising companies.`,
  },
  {
    id: 'data-security',
    title: '5. Data Security',
    content: `We take security seriously and implement industry-standard protections:

- **Encryption:** All data is encrypted in transit using TLS 1.3 and encrypted at rest using AES-256.
- **Access control:** Access to production systems is restricted to authorized personnel only, with multi-factor authentication required.
- **Payment security:** We use Stripe, a PCI-DSS Level 1 certified payment processor. Your card details never touch our servers.
- **Regular audits:** We conduct periodic security reviews of our infrastructure and code.
- **Incident response:** In the event of a data breach, we will notify affected users within 72 hours as required by applicable law.

While we take reasonable precautions, no system is 100% secure. You are responsible for keeping your account credentials confidential.`,
  },
  {
    id: 'your-rights',
    title: '6. Your Rights & Choices',
    content: `Depending on your location, you may have the following rights regarding your personal information:

**Access:** Request a copy of the personal data we hold about you.

**Correction:** Request that we correct inaccurate or incomplete data.

**Deletion:** Request that we delete your personal data. Note that some data may be retained for legal and billing purposes.

**Portability:** Request your data in a machine-readable format.

**Opt-out of marketing:** Click "Unsubscribe" in any marketing email or contact support@moveleads.io.

**California residents (CCPA):** You have the right to know, delete, and opt out of the sale of your personal information. We do not sell personal information.

To exercise any of these rights, contact us at privacy@moveleads.io. We will respond within 30 days.`,
  },
  {
    id: 'cookies',
    title: '7. Cookies & Tracking',
    content: `We use cookies and similar tracking technologies to operate our service:

**Essential cookies:** Required for login sessions and security. Cannot be disabled without breaking the service.

**Analytics cookies:** We use anonymized analytics to understand how customers use our platform. No personally identifiable information is included.

**Preference cookies:** Remember your settings and preferences (e.g., table sort order, filters).

We do not use advertising or retargeting cookies. You can control cookies through your browser settings. Disabling cookies may affect the functionality of our service.`,
  },
  {
    id: 'retention',
    title: '8. Data Retention',
    content: `We retain your data for as long as necessary to provide our services and comply with legal obligations:

- **Account data:** Retained for the life of your account plus 3 years after closure.
- **Transaction records:** Retained for 7 years for tax and financial compliance.
- **Lead purchase records:** Retained for 3 years.
- **Support communications:** Retained for 2 years.

When data is no longer needed, we securely delete or anonymize it.`,
  },
  {
    id: 'changes',
    title: '9. Changes to This Policy',
    content: `We may update this Privacy Policy from time to time. When we make material changes, we will:

- Update the "Last updated" date at the top of this page.
- Send an email notification to registered users.
- Display a banner on our platform for 30 days after the change.

Your continued use of MoveLeads after any changes constitutes acceptance of the updated policy. If you do not agree with the changes, you should close your account.`,
  },
  {
    id: 'contact',
    title: '10. Contact Us',
    content: `If you have questions about this Privacy Policy or how we handle your data, contact us:

**Email:** privacy@moveleads.io
**Support:** support@moveleads.io
**Mailing address:** MoveLeads, Inc., Austin, TX, United States

For EU/UK inquiries related to GDPR, you may also contact our Data Protection contact at: dpo@moveleads.io

We aim to respond to all privacy inquiries within 5 business days.`,
  },
];

function formatContent(text) {
  return text.split('\n\n').map((para, i) => {
    if (para.startsWith('- ')) {
      const items = para.split('\n').filter(l => l.startsWith('- '));
      return (
        <ul key={i} style={{ paddingLeft: 20, marginBottom: 16 }}>
          {items.map((item, j) => {
            const raw = item.slice(2);
            return (
              <li key={j} style={{ fontSize: 15, color: '#475569', lineHeight: 1.75, marginBottom: 6 }}>
                {raw.includes('**') ? renderBold(raw) : raw}
              </li>
            );
          })}
        </ul>
      );
    }
    return (
      <p key={i} style={{ fontSize: 15, color: '#475569', lineHeight: 1.8, marginBottom: 16 }}>
        {para.includes('**') ? renderBold(para) : para}
      </p>
    );
  });
}

function renderBold(text) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i} style={{ color: NAVY, fontWeight: 700 }}>{part}</strong> : part
  );
}

export default function Privacy() {
  const [active, setActive] = useState('information-we-collect');
  useEffect(() => { document.title = 'Privacy Policy — MoveLeads.io'; }, []);

  return (
    <MarketingLayout>

      {/* HERO */}
      <section style={{
        background: `${NOISE}, linear-gradient(155deg, #070e1b 0%, #0b1628 55%, #0d1f38 100%)`,
        position: 'relative', overflow: 'hidden', padding: '80px 0 90px',
      }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.022) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.022) 1px,transparent 1px)', backgroundSize: '52px 52px', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 700, margin: '0 auto', padding: '0 28px', textAlign: 'center', position: 'relative' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderRadius: 100, background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)', marginBottom: 22 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: ORANGE, textTransform: 'uppercase', letterSpacing: 1.8 }}>Legal</span>
          </div>
          <h1 style={{ fontFamily: F, fontSize: 48, fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.03em', color: '#fff', marginBottom: 16 }}>
            Privacy Policy
          </h1>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7 }}>
            Last updated: <strong style={{ color: 'rgba(255,255,255,0.65)' }}>March 20, 2026</strong>
          </p>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7, maxWidth: 520, margin: '10px auto 0' }}>
            We take your privacy seriously. This policy explains how MoveLeads.io collects, uses, and protects your information.
          </p>
        </div>
      </section>

      {/* CONTENT */}
      <section style={{ padding: '80px 0 100px', background: '#fff' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 28px', display: 'grid', gridTemplateColumns: '220px 1fr', gap: 52, alignItems: 'start' }}>

          {/* Sticky TOC */}
          <div style={{ position: 'sticky', top: 86 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 14 }}>Contents</p>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {SECTIONS.map(s => (
                <a key={s.id} href={`#${s.id}`}
                  onClick={() => setActive(s.id)}
                  style={{
                    fontSize: 13, fontWeight: active === s.id ? 700 : 500,
                    color: active === s.id ? ORANGE : '#64748b',
                    textDecoration: 'none', padding: '7px 12px', borderRadius: 8,
                    background: active === s.id ? 'rgba(249,115,22,0.07)' : 'transparent',
                    borderLeft: `2px solid ${active === s.id ? ORANGE : 'transparent'}`,
                    transition: 'all 0.15s', lineHeight: 1.45,
                  }}
                  onMouseEnter={e => { if (active !== s.id) e.currentTarget.style.color = NAVY; }}
                  onMouseLeave={e => { if (active !== s.id) e.currentTarget.style.color = '#64748b'; }}
                >
                  {s.title}
                </a>
              ))}
            </nav>
            <div style={{ marginTop: 28, padding: '16px', background: '#f8fafc', border: `1px solid ${BL}`, borderRadius: 12 }}>
              <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6, margin: '0 0 12px' }}>Questions about this policy?</p>
              <Link to="/contact" style={{ fontSize: 12, fontWeight: 700, color: ORANGE, textDecoration: 'none' }}>Contact us →</Link>
            </div>
          </div>

          {/* Sections */}
          <div style={{ maxWidth: 720 }}>
            <div style={{ padding: '18px 22px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, marginBottom: 40 }}>
              <p style={{ fontSize: 14, color: '#92400e', margin: 0, lineHeight: 1.65 }}>
                <strong>Summary:</strong> We collect only what we need, never sell your data, and you can request deletion at any time. Read on for details.
              </p>
            </div>

            {SECTIONS.map((section) => (
              <div key={section.id} id={section.id} style={{ marginBottom: 52, scrollMarginTop: 96 }}>
                <h2 style={{ fontFamily: F, fontSize: 22, fontWeight: 800, color: NAVY, letterSpacing: '-0.02em', marginBottom: 20, paddingBottom: 14, borderBottom: `1px solid ${BL}` }}>
                  {section.title}
                </h2>
                {formatContent(section.content)}
              </div>
            ))}

            <div style={{ padding: '24px 26px', background: '#f8fafc', border: `1px solid ${BL}`, borderRadius: 16, marginTop: 20 }}>
              <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 10px', lineHeight: 1.65 }}>
                Have questions about this Privacy Policy or want to exercise your data rights?
              </p>
              <Link to="/contact" style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                background: NAVY, color: '#fff', padding: '10px 20px', borderRadius: 10,
                fontSize: 13, fontWeight: 700, textDecoration: 'none', transition: 'all 0.18s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = '#0f2040'}
                onMouseLeave={e => e.currentTarget.style.background = NAVY}
              >Contact our privacy team</Link>
            </div>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
