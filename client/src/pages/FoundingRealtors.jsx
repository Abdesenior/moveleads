import React from 'react';
import MarketAutocomplete from '../components/MarketAutocomplete';
import { usePartnerForm } from '../hooks/usePartnerForm';
import './FoundingMovers.css';

const STORAGE_KEY = 'ml_founding_realtor_v1';

const VOLUME_OPTIONS = [
  { value: '1-4',   label: '1–4 clients / mo' },
  { value: '5-14',  label: '5–14 clients / mo' },
  { value: '15-29', label: '15–29 clients / mo' },
  { value: '30+',   label: '30+ clients / mo' },
];

const INITIAL_ANSWERS = {
  fullName: '',
  email: '',
  brokerageName: '',
  mainMarket: '',
  monthlyMovingClients: '',
  website: '', // honeypot
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

  const canSubmit =
    answers.fullName.trim() &&
    isEmail(answers.email) &&
    answers.brokerageName.trim() &&
    answers.mainMarket &&
    answers.monthlyMovingClients;

  if (submitted) {
    return (
      <div className="fm-root">
        <div className="fm-step">
          <div className="fm-step-inner">
            <h1 className="fm-question">You're on the list.</h1>
            <p className="fm-helper">
              Thanks for applying to the MoveLeads Realtor Partner Network. We're reviewing
              early partners in your market and will reach out to selected applicants with
              next steps.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fm-root">
      <div className="fm-step">
        <div className="fm-step-inner">
          <h1 className="fm-question">Join the MoveLeads Realtor Partner Network</h1>
          <p className="fm-helper">
            Help your clients move easier while unlocking referral revenue opportunities.
          </p>

          <div className="fm-contact-grid">
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
              placeholder="Email"
              autoComplete="email"
            />
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
            <select
              className="fm-input"
              value={answers.monthlyMovingClients}
              onChange={e => setField('monthlyMovingClients', e.target.value)}
            >
              <option value="">Approx. clients who move or relocate monthly</option>
              {VOLUME_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            {/* Honeypot — visually hidden, screen-reader hidden, off-tab. */}
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
          </div>

          {errorMsg && <p className="fm-error" role="alert" style={{ color: '#dc2626', marginTop: 12 }}>{errorMsg}</p>}

          <div style={{ marginTop: 20 }}>
            <button
              type="button"
              className="fm-continue-btn"
              disabled={!canSubmit || submitting}
              onClick={() => submit()}
            >
              {submitting ? 'Submitting…' : 'Apply for Early Partner Access'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
