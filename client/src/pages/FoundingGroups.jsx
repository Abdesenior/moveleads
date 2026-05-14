import React, { useState } from 'react';
import MarketMultiSelect from '../components/MarketMultiSelect';
import { usePartnerForm } from '../hooks/usePartnerForm';
import './FoundingMovers.css';

const STORAGE_KEY = 'ml_founding_group_v1';

const SIZE_OPTIONS = [
  { value: '1k-5k',    label: '1k–5k members',    subline: 'Niche community' },
  { value: '5k-20k',   label: '5k–20k members',   subline: 'Growing group' },
  { value: '20k-50k',  label: '20k–50k members',  subline: 'Large community' },
  { value: '50k+',     label: '50k+ members',     subline: 'Major audience' },
];

const FREQ_OPTIONS = [
  { value: 'daily',        label: 'Daily',        subline: 'Very active demand' },
  { value: 'weekly',       label: 'Weekly',       subline: 'Frequent requests' },
  { value: 'occasionally', label: 'Occasionally', subline: 'Steady activity' },
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

const isEmail   = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
// Lenient: accept anything that looks domain-like. We'll silently prepend
// https:// on advance if missing, so the admin gets a clickable link.
const isUrlish  = (s) => /[a-z0-9-]+\.[a-z]{2,}/i.test(String(s || '').trim());

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
               isUrlish(answers.facebookGroupUrl);
      case 'activity':
        return Boolean(answers.groupSize) && Boolean(answers.movingHelpFrequency);
      case 'relocation':
        return Array.isArray(answers.popularMarkets) && answers.popularMarkets.length > 0;
      default:
        return false;
    }
  }

  function normalizeGroupUrl() {
    const raw = String(answers.facebookGroupUrl || '').trim();
    if (raw && !/^https?:\/\//i.test(raw) && /\./.test(raw)) {
      setField('facebookGroupUrl', 'https://' + raw);
    }
  }

  function advance() {
    if (stepId === 'community') normalizeGroupUrl();
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
          <div className="fm-step-inner" style={{ textAlign: 'center' }}>
            <SuccessCheck />

            <h1 className="fm-question" style={{ textAlign: 'center' }}>
              Application received
            </h1>
            <p className="fm-helper" style={{ textAlign: 'center' }}>
              We're reviewing selected communities and onboarding early partners market by market.
            </p>

            <div style={{ height: 1, background: 'rgba(15,23,42,0.08)', margin: '28px auto 24px', maxWidth: 280 }} />

            <p className="fm-helper" style={{ marginTop: 0, textAlign: 'center' }}>
              Approved groups will receive early access details and partnership information soon.
            </p>

            <p className="fm-finetext" style={{ marginTop: 32, textAlign: 'center' }}>
              You can now close this page.
            </p>
            <p className="fm-finetext" style={{ marginTop: 12, textAlign: 'center' }}>
              {TRUST_LINE}
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

          {stepId === 'community' && (
            <>
              <h1 className="fm-question">
                Help Members Find Movers — And Earn From Every Referral
              </h1>
              <p className="fm-helper">
                Turn moving conversations in your community into a new revenue stream.
              </p>

              <ul className="fm-intro-bullets">
                <li><span className="fm-trust-check">✓</span> Earn from real moving requests</li>
                <li><span className="fm-trust-check">✓</span> Help members find trusted movers</li>
                <li><span className="fm-trust-check">✓</span> Priority access in your market</li>
              </ul>

              <h2 style={sectionTitleStyle}>Tell us about your community</h2>
              <p className="fm-helper" style={{ marginTop: 0 }}>
                We're onboarding selected communities into the MoveLeads network.
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
                  placeholder="Facebook group link"
                  autoComplete="off"
                />
              </div>
            </>
          )}

          {stepId === 'activity' && (
            <>
              <h1 className="fm-question">Tell us about your group activity</h1>
              <p className="fm-helper">
                We want to understand how active your community is.
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
              <h1 className="fm-question">Which areas do members move between most often?</h1>
              <p className="fm-helper">
                Add the cities or states most commonly mentioned in your community.
              </p>

              <MarketMultiSelect
                values={answers.popularMarkets}
                onChange={(arr) => setField('popularMarkets', arr)}
                placeholder="Add a city or state…"
                max={8}
              />
              <p className="fm-finetext" style={{ marginTop: 12 }}>
                Press Enter to add another market.
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

function SuccessCheck() {
  return (
    <div
      aria-hidden="true"
      style={{
        width: 64, height: 64, borderRadius: '50%',
        background: 'rgba(34,197,94,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 24px',
      }}
    >
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a"
           strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </div>
  );
}
