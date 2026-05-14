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
          <div className="fm-step-inner">
            <h1 className="fm-question">Thanks for applying</h1>
            <p className="fm-helper">
              We're currently reviewing early realtor partnerships in your market and will
              contact selected applicants with next steps.
            </p>
            <p className="fm-helper" style={{ marginTop: 24 }}>
              You can now close this page.
            </p>
            <p className="fm-finetext" style={{ marginTop: 28 }}>{TRUST_LINE}</p>
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
                Help Your Clients Move With Confidence — While Unlocking a New Revenue Opportunity
              </h1>
              <p className="fm-helper">
                MoveLeads helps real estate professionals connect clients with verified moving
                companies while creating additional income opportunities through trusted moving
                referrals.
              </p>

              <ul className="fm-intro-bullets">
                <li><span className="fm-trust-check">✓</span> Help clients find trusted movers faster</li>
                <li><span className="fm-trust-check">✓</span> Improve the relocation experience after closing</li>
                <li><span className="fm-trust-check">✓</span> Unlock additional referral income opportunities</li>
                <li><span className="fm-trust-check">✓</span> Early access for selected real estate partners</li>
              </ul>

              <h2 style={sectionTitleStyle}>Tell us about yourself</h2>
              <p className="fm-helper" style={{ marginTop: 0 }}>
                We're currently onboarding a limited number of real estate partners in selected
                markets.
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
                This helps us understand relocation activity and moving demand in your area.
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
                  Start typing a city or a state — we'll match standardized markets.
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
              <h1 className="fm-question">How often do your clients relocate?</h1>
              <p className="fm-helper">
                We're prioritizing markets with active moving demand and strong relocation activity.
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
