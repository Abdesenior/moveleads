import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Phone, MapPin, Clock, Send, CheckCircle, ArrowRight } from 'lucide-react';
import MarketingLayout from '../components/MarketingLayout';

const F = "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif";
const NAVY = '#0b1628';
const ORANGE = '#f97316';
const BL = 'rgba(15,23,42,0.08)';
const NOISE = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E")`;

function useReveal() {
  const ref = useRef();
  const [v, setV] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setV(true); }, { threshold: 0.08 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return [ref, v];
}
function Reveal({ children, delay = 0 }) {
  const [ref, v] = useReveal();
  return (
    <div ref={ref} style={{ opacity: v ? 1 : 0, transform: v ? 'translateY(0)' : 'translateY(20px)', transition: `opacity 0.6s ease ${delay}s, transform 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}s` }}>
      {children}
    </div>
  );
}

const inputStyle = (focused) => ({
  width: '100%', padding: '13px 16px', borderRadius: 11, fontSize: 14, fontFamily: F,
  border: `1.5px solid ${focused ? ORANGE : BL}`,
  outline: 'none', background: '#fff', color: NAVY, boxSizing: 'border-box',
  transition: 'border-color 0.18s, box-shadow 0.18s',
  boxShadow: focused ? '0 0 0 3px rgba(249,115,22,0.1)' : 'none',
});

export default function Contact() {
  useEffect(() => { document.title = 'Contact Us — MoveLeads.io'; }, []);

  const [form, setForm] = useState({ name: '', email: '', company: '', subject: '', message: '' });
  const [focused, setFocused] = useState({});
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => { setLoading(false); setSent(true); }, 1200);
  };

  return (
    <MarketingLayout>

      {/* HERO */}
      <section style={{
        background: `${NOISE}, linear-gradient(155deg, #070e1b 0%, #0b1628 55%, #0d1f38 100%)`,
        position: 'relative', overflow: 'hidden', padding: '90px 0 100px',
      }}>
        <div style={{ position: 'absolute', top: '-15%', right: '0', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(249,115,22,0.09), transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.022) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.022) 1px,transparent 1px)', backgroundSize: '52px 52px', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 700, margin: '0 auto', padding: '0 28px', textAlign: 'center', position: 'relative' }}>
          <Reveal>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderRadius: 100, background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)', marginBottom: 24 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: ORANGE, textTransform: 'uppercase', letterSpacing: 1.8 }}>Get in touch</span>
            </div>
          </Reveal>
          <Reveal delay={0.07}>
            <h1 style={{ fontFamily: F, fontSize: 52, fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.03em', color: '#fff', marginBottom: 18 }}>
              We'd love to hear from you.
            </h1>
          </Reveal>
          <Reveal delay={0.14}>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.5)', lineHeight: 1.75, maxWidth: 520, margin: '0 auto' }}>
              Have a question about leads, pricing, or our platform? Send us a message and we'll get back to you within a few hours.
            </p>
          </Reveal>
        </div>
      </section>

      {/* CONTACT GRID */}
      <section style={{ padding: '100px 0', background: '#fff' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 28px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr', gap: 60, alignItems: 'start' }}>

            {/* FORM */}
            <Reveal>
              <div style={{ background: '#fff', border: `1px solid ${BL}`, borderRadius: 22, padding: '40px 36px', boxShadow: '0 4px 24px rgba(0,0,0,0.05)' }}>
                {sent ? (
                  <div style={{ textAlign: 'center', padding: '48px 0' }}>
                    <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                      <CheckCircle size={36} color="#22c55e" />
                    </div>
                    <h3 style={{ fontFamily: F, fontSize: 24, fontWeight: 800, color: NAVY, marginBottom: 10 }}>Message sent!</h3>
                    <p style={{ fontSize: 15, color: '#64748b', lineHeight: 1.7, maxWidth: 340, margin: '0 auto 28px' }}>
                      Thanks for reaching out. Our team typically responds within 2–4 hours during business hours.
                    </p>
                    <button onClick={() => { setSent(false); setForm({ name:'', email:'', company:'', subject:'', message:'' }); }}
                      style={{ background: 'none', border: `1.5px solid ${BL}`, borderRadius: 10, padding: '10px 22px', fontSize: 13, fontWeight: 600, color: '#64748b', cursor: 'pointer', fontFamily: F, transition: 'all 0.18s' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = ORANGE; e.currentTarget.style.color = ORANGE; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = BL; e.currentTarget.style.color = '#64748b'; }}
                    >Send another message</button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit}>
                    <h2 style={{ fontFamily: F, fontSize: 24, fontWeight: 800, color: NAVY, marginBottom: 6, letterSpacing: '-0.02em' }}>Send us a message</h2>
                    <p style={{ fontSize: 14, color: '#64748b', marginBottom: 28 }}>We respond to every message within one business day.</p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 6, fontFamily: F }}>Your name *</label>
                        <input
                          required value={form.name}
                          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                          onFocus={() => setFocused(f => ({ ...f, name: true }))}
                          onBlur={() => setFocused(f => ({ ...f, name: false }))}
                          placeholder="Alex Johnson"
                          style={inputStyle(focused.name)}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 6, fontFamily: F }}>Work email *</label>
                        <input
                          required type="email" value={form.email}
                          onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                          onFocus={() => setFocused(f => ({ ...f, email: true }))}
                          onBlur={() => setFocused(f => ({ ...f, email: false }))}
                          placeholder="alex@yourcompany.com"
                          style={inputStyle(focused.email)}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 6, fontFamily: F }}>Company name</label>
                        <input
                          value={form.company}
                          onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                          onFocus={() => setFocused(f => ({ ...f, company: true }))}
                          onBlur={() => setFocused(f => ({ ...f, company: false }))}
                          placeholder="Atlas Moving Co"
                          style={inputStyle(focused.company)}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 6, fontFamily: F }}>Subject *</label>
                        <select
                          required value={form.subject}
                          onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                          onFocus={() => setFocused(f => ({ ...f, subject: true }))}
                          onBlur={() => setFocused(f => ({ ...f, subject: false }))}
                          style={{ ...inputStyle(focused.subject), appearance: 'none', cursor: 'pointer' }}
                        >
                          <option value="">Select a topic…</option>
                          <option>General question</option>
                          <option>Lead quality issue</option>
                          <option>Billing support</option>
                          <option>Enterprise pricing</option>
                          <option>Technical support</option>
                          <option>Partnership inquiry</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ marginBottom: 24 }}>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 6, fontFamily: F }}>Message *</label>
                      <textarea
                        required rows={5} value={form.message}
                        onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                        onFocus={() => setFocused(f => ({ ...f, message: true }))}
                        onBlur={() => setFocused(f => ({ ...f, message: false }))}
                        placeholder="Tell us how we can help you…"
                        style={{ ...inputStyle(focused.message), resize: 'vertical', minHeight: 120 }}
                      />
                    </div>

                    <button type="submit" disabled={loading} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      background: loading ? '#94a3b8' : ORANGE, color: '#fff',
                      padding: '13px 28px', borderRadius: 12, fontSize: 14, fontWeight: 700,
                      border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: F,
                      boxShadow: loading ? 'none' : '0 4px 16px rgba(249,115,22,0.35)',
                      transition: 'all 0.18s',
                    }}
                      onMouseEnter={e => { if (!loading) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(249,115,22,0.45)'; } }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = loading ? 'none' : '0 4px 16px rgba(249,115,22,0.35)'; }}
                    >
                      {loading ? (
                        <>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 0.8s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                          Sending…
                        </>
                      ) : (
                        <><Send size={15} />Send message</>
                      )}
                    </button>
                  </form>
                )}
              </div>
            </Reveal>

            {/* CONTACT INFO */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <Reveal delay={0.1}>
                <h3 style={{ fontFamily: F, fontSize: 20, fontWeight: 700, color: NAVY, marginBottom: 4 }}>Other ways to reach us</h3>
                <p style={{ fontSize: 14, color: '#64748b', marginBottom: 0 }}>We're a small team but we respond fast.</p>
              </Reveal>

              {[
                { icon: <Mail size={20} />, c: '#3b82f6', bg: '#eff6ff', label: 'Email us', value: 'support@moveleads.io', sub: 'Responses within 2–4 hours' },
                { icon: <Phone size={20} />, c: '#22c55e', bg: '#f0fdf4', label: 'Call us', value: '+1 (888) 555-0192', sub: 'Mon–Fri, 9am–6pm EST' },
                { icon: <Clock size={20} />, c: ORANGE, bg: '#fff7ed', label: 'Business hours', value: 'Mon – Fri, 9am – 6pm EST', sub: 'Chat support 24/7 in-app' },
                { icon: <MapPin size={20} />, c: '#8b5cf6', bg: '#f5f3ff', label: 'Headquarters', value: 'Austin, TX', sub: 'Serving all 50 states' },
              ].map((item, i) => (
                <Reveal key={i} delay={0.12 + i * 0.07}>
                  <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: 14,
                    background: '#fff', border: `1px solid ${BL}`, borderRadius: 14, padding: '18px 20px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)', transition: 'all 0.18s',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.07)'; e.currentTarget.style.transform = 'translateX(3px)'; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'none'; }}
                  >
                    <div style={{ width: 42, height: 42, borderRadius: 11, background: item.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: item.c, flexShrink: 0 }}>{item.icon}</div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>{item.label}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 2 }}>{item.value}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>{item.sub}</div>
                    </div>
                  </div>
                </Reveal>
              ))}

              <Reveal delay={0.45}>
                <div style={{ background: NAVY, borderRadius: 16, padding: '24px 22px', marginTop: 4 }}>
                  <h4 style={{ fontFamily: F, fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Need leads now?</h4>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.65, marginBottom: 18 }}>
                    Skip the wait — sign up in 2 minutes and start buying verified leads today.
                  </p>
                  <Link to="/register" style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    background: ORANGE, color: '#fff', padding: '10px 20px', borderRadius: 10,
                    fontSize: 13, fontWeight: 700, textDecoration: 'none',
                    boxShadow: '0 3px 12px rgba(249,115,22,0.38)', transition: 'all 0.18s',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}
                  >Get started free <ArrowRight size={13} /></Link>
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ STRIP */}
      <section style={{ padding: '80px 0', background: '#f8fafc', borderTop: `1px solid ${BL}` }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 28px' }}>
          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <h2 style={{ fontFamily: F, fontSize: 34, fontWeight: 800, letterSpacing: '-0.03em', color: NAVY, marginBottom: 10 }}>Common questions</h2>
              <p style={{ fontSize: 15, color: '#64748b' }}>Quick answers before you reach out.</p>
            </div>
          </Reveal>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            {[
              { q: 'How fast will you respond?', a: 'Email responses within 2–4 hours on business days. In-app chat is available 24/7.' },
              { q: 'Is there a demo I can book?', a: 'Yes — email us with "demo" in the subject line and we\'ll schedule a 20-minute walkthrough.' },
              { q: 'Can I speak to an account manager?', a: 'All Pro Bundle customers get a dedicated account manager. Email us to get connected.' },
              { q: 'How do I report a bad lead?', a: 'Contact support@moveleads.io within 48 hours with the lead ID and we\'ll issue a full credit.' },
            ].map((item, i) => (
              <Reveal key={i} delay={i * 0.06}>
                <div style={{ background: '#fff', border: `1px solid ${BL}`, borderRadius: 14, padding: '22px 22px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <h4 style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 8, fontFamily: F }}>{item.q}</h4>
                  <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.65, margin: 0 }}>{item.a}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </MarketingLayout>
  );
}
