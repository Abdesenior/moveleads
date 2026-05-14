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

const STEPS = ['community', 'activity', 'relocation'];

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

const TRUST_LINE = 'No setup costs. No commitment required.';

const sectionTitleStyle = {
  fontSize: 20, fontWeight: 700, margin: '32px 0 6px 0', color: '#0f172a',
};

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
      case 'community':
        return answers.fullName.trim().length > 0 &&
               isEmail(answers.email) &&
               isUrl(answers.facebookGroupUrl);
      case 'activity':
        return Boolean(answers.groupSize) && Boolean(answers.movingHelpFrequency);
      case 'relocation':
        return Array.isArray(answers.popularMarkets) && answers.popularMarkets.length > 0;
      default:
        return false;
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
              We're reviewing early community partners in your market and will contact selected
              groups with next steps.
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

          {stepId === 'community' && (
            <>
              <h1 className="fm-question">
                Help Your Members Find Trusted Movers — And Earn From Real Moving Demand
              </h1>
              <p className="fm-helper">
                MoveLeads helps Facebook community owners connect members with verified moving
                companies while creating a new revenue opportunity from moving referrals.
              </p>

              <ul className="fm-intro-bullets">
                <li><span className="fm-trust-check">✓</span> Help members find reliable movers faster</li>
                <li><span className="fm-trust-check">✓</span> Earn from real moving requests in your community</li>
                <li><span className="fm-trust-check">✓</span> No setup costs or contracts</li>
                <li><span className="fm-trust-check">✓</span> Early partners get priority access in their market</li>
              </ul>

              <h2 style={sectionTitleStyle}>Tell us about your community</h2>
              <p className="fm-helper" style={{ marginTop: 0 }}>
                We're currently onboarding selected Facebook communities into the MoveLeads
                partner network.
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
                <input
                  className="fm-input"
                  type="url"
                  value={answers.facebookGroupUrl}
                  onChange={e => setField('facebookGroupUrl', e.target.value)}
                  onKeyDown={onInputKeyDown}
                  placeholder="Facebook group link (https://…)"
                  autoComplete="off"
                />
              </div>
            </>
          )}

          {stepId === 'activity' && (
            <>
              <h1 className="fm-question">Tell us about your group activity</h1>
              <p className="fm-helper">
                This helps us understand moving demand and partnership opportunities in your market.
              </p>

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
            </>
          )}

          {stepId === 'relocation' && (
            <>
              <h1 className="fm-question">Where do members most commonly relocate?</h1>
              <p className="fm-helper">
                We use this to better understand relocation demand and connect members with
                the right movers.
              </p>

              <MarketMultiSelect
                values={answers.popularMarkets}
                onChange={(arr) => setField('popularMarkets', arr)}
                placeholder="Add a city or state…"
                max={8}
              />
              <p className="fm-finetext" style={{ marginTop: 12 }}>
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

          <p className="fm-finetext" style={{ marginTop: 18, textAlign: 'center' }}>{TRUST_LINE}</p>
        </div>
      </div>
    </div>
  );
}
