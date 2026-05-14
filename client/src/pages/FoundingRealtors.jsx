import React, { useState } from 'react';
import MarketAutocomplete from '../components/MarketAutocomplete';
import { usePartnerForm } from '../hooks/usePartnerForm';
import './FoundingMovers.css';

const STORAGE_KEY = 'ml_founding_realtor_v1';

const VOLUME_OPTIONS = [
  { value: '1-4',   label: '1–4 clients / month',   subline: 'Selective practice' },
  { value: '5-14',  label: '5–14 clients / month',  subline: 'Active practice' },
  { value: '15-29', label: '15–29 clients / month', subline: 'High-volume practice' },
  { value: '30+',   label: '30+ clients / month',   subline: 'Top producer' },
];

const STEPS = ['identity', 'market', 'volume'];

const INITIAL_ANSWERS = {
  fullName: '',
  email: '',
  brokerageName: '',
  mainMarket: '',
  monthlyMovingClients: '',
  website: '',
  utm: { source: '', medium: '', campaign: '', term: '', content: '' },
};

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());

const TRUST_LINE = 'No setup costs. No commitment required.';

const sectionTitleStyle = {
  fontSize: 20, fontWeight: 700, margin: '32px 0 6px 0', color: '#0f172a',
};

export default function FoundingRealtors() {
  const { answers, setField, submit, submitting, submitted, errorMsg } = usePartnerForm({
    storageKey: STORAGE_KEY,
    partnerType: 'realtor',
    source: 'founding-realtors-v1',
    initialAnswers: INITIAL_ANSWERS,
  });

  const [stepIdx, setStepIdx] = useState(0);
  const stepId = STEPS[stepIdx];

  function canContinue() {
    switch (stepId) {
      case 'identity': return answers.fullName.trim().length > 0 && isEmail(answers.email);
      case 'market':   return answers.brokerageName.trim().length > 0 && Boolean(answers.mainMarket);
      case 'volume':   return Boolean(answers.monthlyMovingClients);
      default:         return false;
    }
  }

  function advance() {
    if (stepIdx === STEPS.length - 1) submit();
    else setStepIdx(i => i + 1);
  }

  function goBack() {
    if (stepIdx > 0) setStepIdx(i => i - 1);
  }

  function onInputKeyDown(e) {
    if (e.key === 'Enter' && canContinue()) {
      e.preventDefault();
      advance();
    }
  }

  if (submitted) {
    return (
      <div className="fm-root">
        <div className="fm-step" key="done">
          <div className="fm-step-inner" style={{ textAlign: 'center' }}>
            <SuccessCheck />

            <h1 className="fm-question" style={{ textAlign: 'center' }}>
              Thanks — your application has been received
            </h1>
            <p className="fm-helper" style={{ textAlign: 'center' }}>
              We're currently onboarding selected real estate partners market by market.
            </p>

            <div style={{ height: 1, background: 'rgba(15,23,42,0.08)', margin: '28px auto 24px', maxWidth: 280 }} />

            <p className="fm-helper" style={{ marginTop: 0, textAlign: 'center' }}>
              Approved partners will receive early access details as MoveLeads expands into new markets.
            </p>

            <p className="fm-finetext" style={{ marginTop: 32, textAlign: 'center' }}>
              You can now close this page.
            </p>
            <p className="fm-finetext" style={{ marginTop: 12, textAlign: 'center' }}>
              {TRUST_LINE}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const progressPct = Math.round(((stepIdx + 1) / STEPS.length) * 100);
  const isLast = stepIdx === STEPS.length - 1;

  return (
    <div className="fm-root">
      <div className="fm-progress" aria-hidden="true">
        <div className="fm-progress-bar" style={{ width: `${progressPct}%` }} />
      </div>

      {stepIdx > 0 && (
        <button type="button" className="fm-back" onClick={goBack} aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}

      <div className="fm-step" key={stepId}>
        <div className="fm-step-inner">
          {/* Honeypot */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={answers.website}
            onChange={e => setField('website', e.target.value)}
            style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, opacity: 0 }}
          />

          {stepId === 'identity' && (
            <>
              <h1 className="fm-question">
                Help Clients Move Smarter — And Earn From Every Referral
              </h1>
              <p className="fm-helper">
                Connect clients with trusted movers while unlocking a new referral revenue stream.
              </p>

              <ul className="fm-intro-bullets">
                <li><span className="fm-trust-check">✓</span> Trusted movers for your clients</li>
                <li><span className="fm-trust-check">✓</span> Additional revenue from referrals</li>
                <li><span className="fm-trust-check">✓</span> Priority partner access in your market</li>
              </ul>

              <h2 style={sectionTitleStyle}>Tell us about yourself</h2>
              <p className="fm-helper" style={{ marginTop: 0 }}>
                Tell us a bit about your business.
              </p>

              <div className="fm-stack">
                <input
                  className="fm-input"
                  type="text"
                  value={answers.fullName}
                  onChange={e => setField('fullName', e.target.value)}
                  onKeyDown={onInputKeyDown}
                  placeholder="Full name"
                  autoComplete="name"
                  autoFocus
                />
                <input
                  className="fm-input"
                  type="email"
                  value={answers.email}
                  onChange={e => setField('email', e.target.value)}
                  onKeyDown={onInputKeyDown}
                  placeholder="Email address"
                  autoComplete="email"
                />
              </div>
            </>
          )}

          {stepId === 'market' && (
            <>
              <h1 className="fm-question">Tell us about your market</h1>
              <p className="fm-helper">
                We're expanding market by market.
              </p>

              <div className="fm-stack">
                <input
                  className="fm-input"
                  type="text"
                  value={answers.brokerageName}
                  onChange={e => setField('brokerageName', e.target.value)}
                  onKeyDown={onInputKeyDown}
                  placeholder="Brokerage name"
                  autoComplete="organization"
                  autoFocus
                />
              </div>

              <div className="fm-group fm-group-spaced">
                <div className="fm-group-label">Your primary market</div>
                <p className="fm-helper" style={{ marginTop: 0, marginBottom: 10 }}>
                  Search by city or state
                </p>
                <MarketAutocomplete
                  value={answers.mainMarket}
                  onChange={(v) => setField('mainMarket', v)}
                  placeholder="City or state…"
                />
              </div>
            </>
          )}

          {stepId === 'volume' && (
            <>
              <h1 className="fm-question">How many clients move each month?</h1>
              <p className="fm-helper">
                We're prioritizing active markets with strong relocation demand.
              </p>

              <div className="fm-choices">
                {VOLUME_OPTIONS.map(opt => {
                  const isSelected = answers.monthlyMovingClients === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      className={`fm-choice${isSelected ? ' selected' : ''}`}
                      onClick={() => setField('monthlyMovingClients', opt.value)}
                      aria-pressed={isSelected}
                    >
                      <span className="fm-choice-text">
                        <span className="fm-choice-label">{opt.label}</span>
                        <span className="fm-choice-subline">{opt.subline}</span>
                      </span>
                      <span className="fm-choice-check">{isSelected ? '✓' : ''}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {errorMsg && <div className="fm-error">{errorMsg}</div>}

          <div className="fm-actions">
            <button
              type="button"
              className="fm-continue"
              onClick={advance}
              disabled={!canContinue() || submitting}
            >
              {isLast ? (submitting ? 'Sending…' : 'Submit application →') : 'Continue →'}
            </button>
          </div>

          <p className="fm-finetext" style={{ marginTop: 18, textAlign: 'center' }}>{TRUST_LINE}</p>
        </div>
      </div>
    </div>
  );
}

function SuccessCheck() {
  return (
    <div
      aria-hidden="true"
      style={{
        width: 64, height: 64, borderRadius: '50%',
        background: 'rgba(34,197,94,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 24px',
      }}
    >
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a"
           strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </div>
  );
}
