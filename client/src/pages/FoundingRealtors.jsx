import React, { useState } from 'react';
import MarketAutocomplete from '../components/MarketAutocomplete';
import { usePartnerForm } from '../hooks/usePartnerForm';
import './FoundingMovers.css';

const STORAGE_KEY = 'ml_founding_realtor_v1';

const VOLUME_OPTIONS = [
  { value: '1-4',   label: '1–4 clients / month',   subline: 'Light volume' },
  { value: '5-14',  label: '5–14 clients / month',  subline: 'Steady pipeline' },
  { value: '15-29', label: '15–29 clients / month', subline: 'High volume' },
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

  const [stepId, setStepId] = useState('identity'); // 'identity' | 'business'

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
            <h1 className="fm-question">You're on the list 🎯</h1>
            <p className="fm-helper">
              Thanks for applying to the MoveLeads Realtor Partner Network. We're hand-reviewing
              early partners in your market and will reach out to selected applicants with
              next steps and onboarding details.
            </p>

            <ul className="fm-trust">
              <li><span className="fm-trust-check">✓</span> Application received</li>
              <li><span className="fm-trust-check">✓</span> Reviewed by our partnerships team</li>
              <li><span className="fm-trust-check">✓</span> Selected partners contacted directly</li>
            </ul>

            <div className="fm-actions">
              <a
                href="https://moveleads.cloud/?utm_source=founding_realtors&utm_medium=funnel"
                className="fm-continue fm-continue-link"
              >
                See how MoveLeads works →
              </a>
            </div>
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
                Help your clients move easier while unlocking referral revenue opportunities.
                Tell us a bit about you to get started.
              </p>

              <ul className="fm-intro-bullets">
                <li><span className="fm-trust-check">✓</span> Verified moving partners for your clients</li>
                <li><span className="fm-trust-check">✓</span> Referral revenue on every closed move</li>
                <li><span className="fm-trust-check">✓</span> Early-access pricing for founding realtors</li>
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
                  placeholder="Work email"
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
              <h1 className="fm-question">A few details about your business</h1>
              <p className="fm-helper">
                This helps us match founding partners with the right markets.
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
                <MarketAutocomplete
                  value={answers.mainMarket}
                  onChange={(code) => setField('mainMarket', code)}
                  placeholder="Main market"
                />
              </div>

              <div className="fm-group fm-group-spaced">
                <div className="fm-group-label">Approx. clients who move or relocate monthly</div>
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
                  {submitting ? 'Sending…' : 'Apply for Early Partner Access →'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
