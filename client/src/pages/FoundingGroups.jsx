import React, { useState } from 'react';
import MarketAutocomplete from '../components/MarketAutocomplete';
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
  originMarket: '',
  destinationMarket: '',
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

  const [stepId, setStepId] = useState('identity'); // 'identity' | 'group' | 'markets'

  const step1Valid = answers.fullName.trim() && isEmail(answers.email);
  const step2Valid =
    isUrl(answers.facebookGroupUrl) &&
    answers.groupSize &&
    answers.movingHelpFrequency;
  const step3Valid = answers.originMarket && answers.destinationMarket;

  if (submitted) {
    return (
      <div className="fm-root">
        <div className="fm-step" key="done">
          <div className="fm-step-inner">
            <h1 className="fm-question">Application received</h1>
            <p className="fm-helper">
              Thank you for applying to become a MoveLeads Community Partner. Our partnerships
              team will review your application and contact selected community partners
              directly with next steps.
            </p>

            <ul className="fm-trust">
              <li><span className="fm-trust-check">✓</span> Application received</li>
              <li><span className="fm-trust-check">✓</span> Under review by our partnerships team</li>
              <li><span className="fm-trust-check">✓</span> Approved partners contacted personally</li>
            </ul>

            <p className="fm-finetext" style={{ marginTop: 24 }}>
              You can now close this page.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const progressPct = stepId === 'identity' ? 33 : stepId === 'group' ? 66 : 100;
  const showBack = stepId !== 'identity';

  function goBack() {
    if (stepId === 'group') setStepId('identity');
    else if (stepId === 'markets') setStepId('group');
  }

  return (
    <div className="fm-root">
      <div className="fm-progress" aria-hidden="true">
        <div className="fm-progress-bar" style={{ width: `${progressPct}%` }} />
      </div>

      {showBack && (
        <button
          type="button"
          className="fm-back"
          onClick={goBack}
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
                Help your members find verified movers while earning early-access perks as a
                founding community partner.
              </p>

              <ul className="fm-intro-bullets">
                <li><span className="fm-trust-check">✓</span> Verified movers for your members</li>
                <li><span className="fm-trust-check">✓</span> Trusted partner for moving asks in your group</li>
                <li><span className="fm-trust-check">✓</span> Founding access to the community partner program</li>
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
                This helps us prioritize groups where members actively ask about moving.
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

              <div className="fm-actions">
                <button
                  type="button"
                  className="fm-continue"
                  onClick={() => setStepId('markets')}
                  disabled={!step2Valid}
                >
                  Continue →
                </button>
              </div>
            </>
          )}

          {stepId === 'markets' && (
            <>
              <h1 className="fm-question">Where are your members moving?</h1>
              <p className="fm-helper">
                Routes help us match the right movers and surface high-demand markets.
              </p>

              <div className="fm-group fm-group-spaced">
                <div className="fm-group-label">Where do members most commonly move from?</div>
                <p className="fm-helper" style={{ marginTop: 0, marginBottom: 12 }}>
                  Start typing a city or state — we'll match standardized markets.
                </p>
                <MarketAutocomplete
                  value={answers.originMarket}
                  onChange={(v) => setField('originMarket', v)}
                  placeholder="Origin city or state…"
                />
              </div>

              <div className="fm-group fm-group-spaced">
                <div className="fm-group-label">Where do members most commonly move to?</div>
                <p className="fm-helper" style={{ marginTop: 0, marginBottom: 12 }}>
                  Same dropdown — pick the most common destination.
                </p>
                <MarketAutocomplete
                  value={answers.destinationMarket}
                  onChange={(v) => setField('destinationMarket', v)}
                  placeholder="Destination city or state…"
                />
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
                  disabled={!step3Valid || submitting}
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
