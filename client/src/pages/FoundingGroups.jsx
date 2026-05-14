import React, { useState } from 'react';
import { usePartnerForm } from '../hooks/usePartnerForm';
import './FoundingMovers.css';

const STORAGE_KEY = 'ml_founding_group_v1';

const SIZE_OPTIONS = [
  { value: '1k-5k',    label: '1k–5k members',    subline: 'Niche community' },
  { value: '5k-20k',   label: '5k–20k members',   subline: 'Mid-size group' },
  { value: '20k-50k',  label: '20k–50k members',  subline: 'Large community' },
  { value: '50k+',     label: '50k+ members',     subline: 'Major hub' },
];

const FREQ_OPTIONS = [
  { value: 'daily',        label: 'Daily',        subline: 'Multiple asks per day' },
  { value: 'weekly',       label: 'Weekly',       subline: 'A few asks per week' },
  { value: 'occasionally', label: 'Occasionally', subline: 'A few per month' },
  { value: 'rarely',       label: 'Rarely',       subline: 'Comes up sometimes' },
];

const INITIAL_ANSWERS = {
  fullName: '',
  email: '',
  facebookGroupUrl: '',
  groupSize: '',
  movingHelpFrequency: '',
  website: '',
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

  const [stepId, setStepId] = useState('identity'); // 'identity' | 'group'

  const step1Valid = answers.fullName.trim() && isEmail(answers.email);
  const step2Valid =
    isUrl(answers.facebookGroupUrl) &&
    answers.groupSize &&
    answers.movingHelpFrequency;

  if (submitted) {
    return (
      <div className="fm-root">
        <div className="fm-step" key="done">
          <div className="fm-step-inner">
            <h1 className="fm-question">You're on the list 🎯</h1>
            <p className="fm-helper">
              Thanks for applying to become a MoveLeads Community Partner. We're reviewing
              selected groups and will contact approved partners with early-access details.
            </p>

            <ul className="fm-trust">
              <li><span className="fm-trust-check">✓</span> Application received</li>
              <li><span className="fm-trust-check">✓</span> Reviewed by our partnerships team</li>
              <li><span className="fm-trust-check">✓</span> Approved community partners contacted directly</li>
            </ul>

            <div className="fm-actions">
              <a
                href="https://moveleads.cloud/?utm_source=founding_groups&utm_medium=funnel"
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
  const showBack = stepId === 'group';

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
              <h1 className="fm-question">Become an Early MoveLeads Community Partner</h1>
              <p className="fm-helper">
                Help your members find verified movers while earning referral revenue from
                moving requests. Tell us a bit about you to get started.
              </p>

              <ul className="fm-intro-bullets">
                <li><span className="fm-trust-check">✓</span> Verified movers for your members</li>
                <li><span className="fm-trust-check">✓</span> Referral revenue per closed move</li>
                <li><span className="fm-trust-check">✓</span> Early-access perks for founding community partners</li>
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
                  onClick={() => setStepId('group')}
                  disabled={!step1Valid}
                >
                  Continue →
                </button>
              </div>
            </>
          )}

          {stepId === 'group' && (
            <>
              <h1 className="fm-question">Tell us about your community</h1>
              <p className="fm-helper">
                This helps us prioritize groups where members ask about moving most often.
              </p>

              <div className="fm-stack">
                <input
                  className="fm-input"
                  type="url"
                  value={answers.facebookGroupUrl}
                  onChange={e => setField('facebookGroupUrl', e.target.value)}
                  placeholder="Facebook group link (https://…)"
                  autoComplete="off"
                />
              </div>

              <div className="fm-group fm-group-spaced">
                <div className="fm-group-label">Approx. group size</div>
                <div className="fm-choices">
                  {SIZE_OPTIONS.map(opt => {
                    const isSelected = answers.groupSize === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        className={`fm-choice${isSelected ? ' selected' : ''}`}
                        onClick={() => setField('groupSize', opt.value)}
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

              <div className="fm-group fm-group-spaced">
                <div className="fm-group-label">How often do members ask for moving help?</div>
                <div className="fm-choices">
                  {FREQ_OPTIONS.map(opt => {
                    const isSelected = answers.movingHelpFrequency === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        className={`fm-choice${isSelected ? ' selected' : ''}`}
                        onClick={() => setField('movingHelpFrequency', opt.value)}
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
                We'll only use these details to evaluate founding community partner applications.
              </p>

              {errorMsg && <div className="fm-error">{errorMsg}</div>}

              <div className="fm-actions">
                <button
                  type="button"
                  className="fm-continue"
                  onClick={() => submit()}
                  disabled={!step2Valid || submitting}
                >
                  {submitting ? 'Sending…' : 'Apply as a Community Partner →'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
