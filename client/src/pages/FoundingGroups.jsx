import React, { useState } from 'react';
import MarketMultiSelect from '../components/MarketMultiSelect';
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

const STEPS = ['name', 'email', 'groupUrl', 'size', 'frequency', 'markets'];

const INITIAL_ANSWERS = {
  fullName: '',
  email: '',
  facebookGroupUrl: '',
  groupSize: '',
  movingHelpFrequency: '',
  popularMarkets: [],
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

  const [stepIdx, setStepIdx] = useState(0);
  const stepId = STEPS[stepIdx];

  function canContinue() {
    switch (stepId) {
      case 'name':       return answers.fullName.trim().length > 0;
      case 'email':      return isEmail(answers.email);
      case 'groupUrl':   return isUrl(answers.facebookGroupUrl);
      case 'size':       return Boolean(answers.groupSize);
      case 'frequency':  return Boolean(answers.movingHelpFrequency);
      case 'markets':    return Array.isArray(answers.popularMarkets) && answers.popularMarkets.length > 0;
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

          {stepId === 'name' && (
            <>
              <h1 className="fm-question">Let's start with your name</h1>
              <p className="fm-helper">
                Apply to become an early MoveLeads Community Partner. Help your members find
                verified movers — and unlock founding access perks.
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
                We'll only use this to reach out about your community partner application.
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

          {stepId === 'groupUrl' && (
            <>
              <h1 className="fm-question">What's your Facebook group link?</h1>
              <p className="fm-helper">
                Paste the public URL of the group you admin.
              </p>
              <div className="fm-stack">
                <input
                  className="fm-input"
                  type="url"
                  value={answers.facebookGroupUrl}
                  onChange={e => setField('facebookGroupUrl', e.target.value)}
                  onKeyDown={onInputKeyDown}
                  placeholder="https://facebook.com/groups/…"
                  autoComplete="off"
                  autoFocus
                />
              </div>
            </>
          )}

          {stepId === 'size' && (
            <>
              <h1 className="fm-question">Roughly how big is the group?</h1>
              <p className="fm-helper">
                A quick gauge — pick the range that's closest.
              </p>
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
            </>
          )}

          {stepId === 'frequency' && (
            <>
              <h1 className="fm-question">How often do members ask for moving help?</h1>
              <p className="fm-helper">
                Helps us understand demand inside your community.
              </p>
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
            </>
          )}

          {stepId === 'markets' && (
            <>
              <h1 className="fm-question">Which markets do members most commonly move between?</h1>
              <p className="fm-helper">
                Add any cities or states — Miami, Texas, Orlando, New York, etc.
                Helps us match the right movers to demand in your community.
              </p>
              <MarketMultiSelect
                values={answers.popularMarkets}
                onChange={(arr) => setField('popularMarkets', arr)}
                placeholder="Add a city or state…"
                max={8}
              />
              <p className="fm-finetext" style={{ marginTop: 16 }}>
                Tip — press Enter to add, Backspace to remove the last one.
              </p>
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
