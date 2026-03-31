import { useLocation, Link } from 'react-router-dom';
import { CheckCircle, Phone, Clock, Shield, ArrowRight } from 'lucide-react';
import './ThankYou.css';

export default function ThankYou() {
  const { state } = useLocation();
  const { homeSize, originZip, destZip } = state || {};

  const steps = [
    { icon: <CheckCircle size={20} />, color: '#22c55e', bg: '#f0fdf4', title: 'Request received', desc: 'Your quote request is in our system and verified.' },
    { icon: <Phone size={20} />,       color: '#3b82f6', bg: '#eff6ff', title: 'Movers notified',  desc: 'Up to 3 licensed movers in your area have been alerted.' },
    { icon: <Clock size={20} />,       color: '#f97316', bg: '#fff7ed', title: 'Expect a call',    desc: 'Most movers reach out within 30–60 minutes during business hours.' }
  ];

  return (
    <div className="ty-page">
      <nav className="ty-nav">
        <Link to="/" className="ty-logo">
          MoveLeads<span>.cloud</span>
        </Link>
      </nav>

      <div className="ty-container">
        {/* ── Hero ── */}
        <div className="ty-hero">
          <div className="ty-check-ring">
            <div className="ty-check-inner">
              <CheckCircle size={40} color="#22c55e" strokeWidth={2.5} />
            </div>
          </div>
          <h1 className="ty-heading">You're all set!</h1>
          <p className="ty-sub">
            Up to <strong>3 verified movers</strong> will contact you shortly with personalised quotes.
            {homeSize && originZip && destZip && (
              <> Your <strong>{homeSize}</strong> move from <strong>{originZip}</strong> → <strong>{destZip}</strong> has been submitted.</>
            )}
          </p>
        </div>

        {/* ── What happens next ── */}
        <div className="ty-card">
          <h2 className="ty-card-heading">What happens next?</h2>
          <div className="ty-steps">
            {steps.map((s, i) => (
              <div key={i} className="ty-step">
                <div className="ty-step-icon" style={{ background: s.bg, color: s.color }}>
                  {s.icon}
                </div>
                <div>
                  <p className="ty-step-title">{s.title}</p>
                  <p className="ty-step-desc">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Tips ── */}
        <div className="ty-tips-card">
          <div className="ty-tips-header">
            <Shield size={18} color="#f97316" />
            <span>Tips for getting the best quote</span>
          </div>
          <ul className="ty-tips-list">
            <li>Answer calls from unknown numbers — movers may call from local area codes.</li>
            <li>Have an inventory list ready to give accurate estimates.</li>
            <li>Ask each mover about binding estimates and insurance coverage.</li>
          </ul>
        </div>

        {/* ── CTA ── */}
        <div className="ty-cta-row">
          <Link to="/get-quote" className="ty-btn-home">
            Back to Get Quote <ArrowRight size={15} />
          </Link>
          <Link to="/get-quote" className="ty-btn-another">
            Get Another Quote
          </Link>
        </div>
      </div>
    </div>
  );
}
