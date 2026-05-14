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

  const [stepId, setStepId] = useState('identity');

  const step1Valid = answers.fullName.trim() && isEmail(answers.email);
  const step2Valid =
    answers.brokerageName.trim() &&
    answers.mainMarket &&
    answers.monthlyMovingClients;

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

  const progressPct = stepId === 'identity' ? 50 : 100;
  const showBack = stepId === 'business';

  return (
    <div className="fm-root">
      <div className="fm-progress" aria-hidden="true">
        <div className="fm-progress-bar" style={{ width: `${progressPct}%` }} />
      </div>

      {showBack && (
        <button
          type="button"
          className="fm-back"
          onClick={() => setStepId('identity')}
          aria-label="Back"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}

      <div className="fm-step" key={stepId}>
        <div className="fm-step-inner">
          {stepId === 'identity' && (
            <>
              <h1 className="fm-question">Join the MoveLeads Realtor Partner Network</h1>
              <p className="fm-helper">
                A trusted relocation network for the realtors your clients rely on.
                Early-access applications open to a select group of partners.
              </p>

              <ul className="fm-intro-bullets">
                <li><span className="fm-trust-check">✓</span> Vetted moving partners for your clients</li>
                <li><span className="fm-trust-check">✓</span> Smooth, transparent relocations from listing to delivery</li>
                <li><span className="fm-trust-check">✓</span> Founding access to the partner program</li>
              </ul>

              <div className="fm-stack">
                <input
                  className="fm-input"
                  type="text"
                  value={answers.fullName}
                  onChange={e => setField('fullName', e.target.value)}
                  placeholder="Full name"
                  autoComplete="name"
                />
                <input
                  className="fm-input"
                  type="email"
                  value={answers.email}
                  onChange={e => setField('email', e.target.value)}
                  placeholder="Email address"
                  autoComplete="email"
                />
              </div>

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

              <div className="fm-actions">
                <button
                  type="button"
                  className="fm-continue"
                  onClick={() => setStepId('business')}
                  disabled={!step1Valid}
                >
                  Continue →
                </button>
              </div>
            </>
          )}

          {stepId === 'business' && (
            <>
              <h1 className="fm-question">Tell us about your practice</h1>
              <p className="fm-helper">
                A few details help us match founding partners to the right markets.
              </p>

              <div className="fm-stack">
                <input
                  className="fm-input"
                  type="text"
                  value={answers.brokerageName}
                  onChange={e => setField('brokerageName', e.target.value)}
                  placeholder="Brokerage name"
                  autoComplete="organization"
                />
              </div>

              <div className="fm-group fm-group-spaced">
                <div className="fm-group-label">Your primary market</div>
                <p className="fm-helper" style={{ marginTop: 0, marginBottom: 12 }}>
                  Start typing a city or state — we'll match standardized markets.
                </p>
                <MarketAutocomplete
                  value={answers.mainMarket}
                  onChange={(v) => setField('mainMarket', v)}
                  placeholder="City or state…"
                />
              </div>

              <div className="fm-group fm-group-spaced">
                <div className="fm-group-label">Roughly how many clients relocate or move with you each month?</div>
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
              </div>

              <p className="fm-finetext">
                We'll only use these details to evaluate founding partner applications.
              </p>

              {errorMsg && <div className="fm-error">{errorMsg}</div>}

              <div className="fm-actions">
                <button
                  type="button"
                  className="fm-continue"
                  onClick={() => submit()}
                  disabled={!step2Valid || submitting}
                >
                  {submitting ? 'Sending…' : 'Submit application →'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
