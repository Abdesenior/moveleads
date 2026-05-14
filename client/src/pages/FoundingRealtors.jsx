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

const STEPS = ['name', 'email', 'brokerage', 'market', 'volume'];

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
      case 'name':       return answers.fullName.trim().length > 0;
      case 'email':      return isEmail(answers.email);
      case 'brokerage':  return answers.brokerageName.trim().length > 0;
      case 'market':     return Boolean(answers.mainMarket);
      case 'volume':     return Boolean(answers.monthlyMovingClients);
      default:           return false;
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
            <h1 className="fm-question">Application received</h1>
            <p className="fm-helper">
              Thank you for applying to the MoveLeads Realtor Partner Network. Our partnerships
              team will review your application and contact selected partners directly with
              next steps.
            </p>

            <ul className="fm-trust">
              <li><span className="fm-trust-check">✓</span> Application received</li>
              <li><span className="fm-trust-check">✓</span> Under review by our partnerships team</li>
              <li><span className="fm-trust-check">✓</span> Selected partners contacted personally</li>
            </ul>

            <p className="fm-finetext" style={{ marginTop: 24 }}>
              You can now close this page.
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
          {/* Honeypot — always rendered, off-screen */}
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

          {stepId === 'name' && (
            <>
              <h1 className="fm-question">Let's start with your name</h1>
              <p className="fm-helper">
                A trusted relocation network for the realtors your clients rely on.
                Early-access applications open to a select group of partners.
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
              </div>
            </>
          )}

          {stepId === 'email' && (
            <>
              <h1 className="fm-question">What's your email address?</h1>
              <p className="fm-helper">
                We'll use this only to reach out about your founding partner application.
              </p>
              <div className="fm-stack">
                <input
                  className="fm-input"
                  type="email"
                  value={answers.email}
                  onChange={e => setField('email', e.target.value)}
                  onKeyDown={onInputKeyDown}
                  placeholder="Email address"
                  autoComplete="email"
                  autoFocus
                />
              </div>
            </>
          )}

          {stepId === 'brokerage' && (
            <>
              <h1 className="fm-question">Which brokerage are you with?</h1>
              <p className="fm-helper">
                Helps us match founding partners to the right networks.
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
            </>
          )}

          {stepId === 'market' && (
            <>
              <h1 className="fm-question">Where do you primarily operate?</h1>
              <p className="fm-helper">
                Start typing a city or a state — we'll match standardized markets.
              </p>
              <MarketAutocomplete
                value={answers.mainMarket}
                onChange={(v) => setField('mainMarket', v)}
                placeholder="City or state…"
                autoFocus
              />
            </>
          )}

          {stepId === 'volume' && (
            <>
              <h1 className="fm-question">Roughly how many clients relocate or move with you each month?</h1>
              <p className="fm-helper">
                A quick gauge — pick the range that's closest.
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
        </div>
      </div>
    </div>
  );
}
