import React from 'react';
import { usePartnerForm } from '../hooks/usePartnerForm';
import './FoundingMovers.css';

const STORAGE_KEY = 'ml_founding_group_v1';

const SIZE_OPTIONS = [
  { value: '1k-5k',    label: '1k–5k members' },
  { value: '5k-20k',   label: '5k–20k members' },
  { value: '20k-50k',  label: '20k–50k members' },
  { value: '50k+',     label: '50k+ members' },
];

const FREQ_OPTIONS = [
  { value: 'daily',        label: 'Daily' },
  { value: 'weekly',       label: 'Weekly' },
  { value: 'occasionally', label: 'Occasionally' },
  { value: 'rarely',       label: 'Rarely' },
];

const INITIAL_ANSWERS = {
  fullName: '',
  email: '',
  facebookGroupUrl: '',
  groupSize: '',
  movingHelpFrequency: '',
  website: '', // honeypot
  utm: { source: '', medium: '', campaign: '', term: '', content: '' },
};

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
const isUrl   = (s) => /^https?:\/\/.+/i.test(String(s || '').trim());

export default function FoundingGroups() {
  const { answers, setField, submit, submitting, submitted, errorMsg } = usePartnerForm({
    storageKey: STORAGE_KEY,
    partnerType: 'facebook_group_admin',
    source: 'founding-groups-v1',
    initialAnswers: INITIAL_ANSWERS,
  });

  const canSubmit =
    answers.fullName.trim() &&
    isEmail(answers.email) &&
    isUrl(answers.facebookGroupUrl) &&
    answers.groupSize &&
    answers.movingHelpFrequency;

  if (submitted) {
    return (
      <div className="fm-root">
        <div className="fm-step">
          <div className="fm-step-inner">
            <h1 className="fm-question">Thanks — we'll be in touch.</h1>
            <p className="fm-helper">
              Thanks for applying to become a MoveLeads Community Partner. We're reviewing
              selected groups and will contact approved partners with early-access details.
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
          <h1 className="fm-question">Become an Early MoveLeads Community Partner</h1>
          <p className="fm-helper">
            Help your members find verified movers while earning referral revenue from moving requests.
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
              type="url"
              value={answers.facebookGroupUrl}
              onChange={e => setField('facebookGroupUrl', e.target.value)}
              placeholder="Facebook group link (https://…)"
              autoComplete="off"
            />
            <select
              className="fm-input"
              value={answers.groupSize}
              onChange={e => setField('groupSize', e.target.value)}
            >
              <option value="">Approx. group size</option>
              {SIZE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select
              className="fm-input"
              value={answers.movingHelpFrequency}
              onChange={e => setField('movingHelpFrequency', e.target.value)}
            >
              <option value="">How often do members ask for moving help?</option>
              {FREQ_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

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
              {submitting ? 'Submitting…' : 'Apply as a Community Partner'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
