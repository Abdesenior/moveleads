# Partner Validation Funnels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two single-screen public application funnels (`/founding-realtors`, `/founding-groups`) that write into one shared `PartnerResearchSubmission` collection, plus a minimal admin dashboard at `/admin/partner-research` for manual review.

**Architecture:** One Mongoose model with a `partnerType` discriminator. One shared public submit endpoint behind a router-level rate limiter. One admin router with list/detail/stats only. Two single-screen React forms that share a `usePartnerForm` hook for UTM capture + localStorage save/restore + submit. Reuse `FoundingMovers.css` classes for visual parity; copy the state autocomplete pattern into a new `MarketAutocomplete` component (zero modifications to founding-movers).

**Tech Stack:** Node/Express + Mongoose (server). React + Vite + react-router (client). `express-rate-limit` for throttling. Lucide icons. No new dependencies.

**Discipline notes (deliberate deviations from defaults):**
- **No unit tests.** Reference founding-movers feature has zero unit tests; codebase uses Playwright e2e for landing pages. Match the pattern. Final task adds one Playwright smoke test.
- **No worktree.** User selected `mode: implement` with `core_focus: speed`. Work is bounded and uncommitted state on `main` is already untracked artifacts unrelated to this feature.
- **Commit cadence:** one commit per task. Feature branch is `main` (current branch). Final task creates a single squash-friendly history.

---

## File Structure

**New server files:**
- `server/models/PartnerResearchSubmission.js` — Mongoose schema with discriminator
- `server/routes/partnerResearch.js` — public POST submit
- `server/routes/admin/partnerResearch.js` — admin list/detail/stats

**Modified server files:**
- `server/server.js` — mount the two new routers

**New client files:**
- `client/src/components/MarketAutocomplete.jsx` — copy of `StateAutocomplete` pattern, standalone
- `client/src/hooks/usePartnerForm.js` — UTM capture + localStorage + submit
- `client/src/pages/FoundingRealtors.jsx`
- `client/src/pages/FoundingGroups.jsx`
- `client/src/pages/admin/AdminPartnerResearch.jsx`

**Modified client files:**
- `client/src/App.jsx` — three new routes + three lazy imports
- `client/src/components/AdminLayout.jsx` — one NavLink entry

**Optional test file (Task 11):**
- `tests/e2e/partner-research.spec.js` — Playwright smoke

---

## Task 1: Mongoose model — `PartnerResearchSubmission`

**Files:**
- Create: `server/models/PartnerResearchSubmission.js`

- [ ] **Step 1: Write the model**

```js
const mongoose = require('mongoose');

/**
 * PartnerResearchSubmission — captures intake from the two partner
 * validation funnels (/founding-realtors and /founding-groups).
 *
 * One collection, partnerType discriminator. The compound unique index
 * on (email, partnerType) lets the same person apply as both a realtor
 * and a group admin — a legitimate scenario.
 */
const PartnerResearchSubmissionSchema = new mongoose.Schema({
  partnerType: {
    type: String,
    enum: ['realtor', 'facebook_group_admin'],
    required: true,
    index: true,
  },

  // Shared identity
  fullName: { type: String, required: true, trim: true },
  email:    { type: String, required: true, lowercase: true, trim: true },

  // Realtor-specific (sparse: only set when partnerType = 'realtor')
  brokerageName:        { type: String, trim: true },
  mainMarket:           { type: String, trim: true, uppercase: true }, // 2-letter state code
  monthlyMovingClients: { type: String, enum: ['1-4', '5-14', '15-29', '30+', ''], default: '' },

  // Facebook-group-specific (sparse: only set when partnerType = 'facebook_group_admin')
  facebookGroupUrl:     { type: String, trim: true },
  groupSize:            { type: String, enum: ['1k-5k', '5k-20k', '20k-50k', '50k+', ''], default: '' },
  movingHelpFrequency:  { type: String, enum: ['daily', 'weekly', 'occasionally', 'rarely', ''], default: '' },

  // Metadata
  source:    String,
  utm: {
    source:   String,
    medium:   String,
    campaign: String,
    term:     String,
    content:  String,
  },
  ipAddress:             String,
  userAgent:             String,
  completionTimeSeconds: Number,
  submittedAt:           { type: Date, default: Date.now, index: true },
});

// Compound unique — same email may exist twice if partnerType differs.
PartnerResearchSubmissionSchema.index(
  { email: 1, partnerType: 1 },
  { unique: true, sparse: true }
);

module.exports = mongoose.model('PartnerResearchSubmission', PartnerResearchSubmissionSchema);
```

- [ ] **Step 2: Commit**

```bash
git add server/models/PartnerResearchSubmission.js
git commit -m "feat(partner-research): add PartnerResearchSubmission model"
```

---

## Task 2: Public submit route

**Files:**
- Create: `server/routes/partnerResearch.js`

Single `POST /submit` endpoint. Router-level rate limit so both forms share the bucket. Honeypot field `website` — if filled, return success without storing. Dedup by `(email, partnerType)` returning friendly `{ ok: true, alreadySubmitted: true }`.

- [ ] **Step 1: Write the route**

```js
const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const PartnerResearchSubmission = require('../models/PartnerResearchSubmission');

// Router-level: 3 submissions / hour / IP across BOTH forms.
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { msg: 'Too many submissions from this IP. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
router.use(submitLimiter);

const VALID_PARTNER_TYPES = new Set(['realtor', 'facebook_group_admin']);
const REALTOR_VOLUMES = new Set(['1-4', '5-14', '15-29', '30+']);
const GROUP_SIZES     = new Set(['1k-5k', '5k-20k', '20k-50k', '50k+']);
const GROUP_FREQS     = new Set(['daily', 'weekly', 'occasionally', 'rarely']);

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());

/**
 * POST /api/partner-research/submit
 * Public. Rate-limited. Returns friendly { ok, alreadySubmitted } on duplicate.
 */
router.post('/submit', async (req, res) => {
  try {
    const body = req.body || {};

    // Honeypot — silent success without storing.
    if (body.website) return res.json({ ok: true });

    const partnerType = String(body.partnerType || '').trim();
    if (!VALID_PARTNER_TYPES.has(partnerType)) {
      return res.status(400).json({ msg: 'Invalid partner type.' });
    }

    const fullName = String(body.fullName || '').trim();
    const email    = String(body.email || '').trim().toLowerCase();
    if (!fullName || !isEmail(email)) {
      return res.status(400).json({ msg: 'Full name and a valid email are required.' });
    }

    // Type-specific validation
    const doc = { partnerType, fullName, email };
    if (partnerType === 'realtor') {
      const brokerageName        = String(body.brokerageName || '').trim();
      const mainMarket           = String(body.mainMarket || '').trim().toUpperCase();
      const monthlyMovingClients = String(body.monthlyMovingClients || '').trim();
      if (!brokerageName || !mainMarket || !REALTOR_VOLUMES.has(monthlyMovingClients)) {
        return res.status(400).json({ msg: 'Brokerage, market, and client volume are required.' });
      }
      Object.assign(doc, { brokerageName, mainMarket, monthlyMovingClients });
    } else {
      const facebookGroupUrl    = String(body.facebookGroupUrl || '').trim();
      const groupSize           = String(body.groupSize || '').trim();
      const movingHelpFrequency = String(body.movingHelpFrequency || '').trim().toLowerCase();
      if (!facebookGroupUrl || !GROUP_SIZES.has(groupSize) || !GROUP_FREQS.has(movingHelpFrequency)) {
        return res.status(400).json({ msg: 'Group URL, size, and frequency are required.' });
      }
      Object.assign(doc, { facebookGroupUrl, groupSize, movingHelpFrequency });
    }

    // Dedup — friendly success, no enumeration leak.
    const existing = await PartnerResearchSubmission
      .findOne({ email, partnerType })
      .select('_id submittedAt')
      .lean();
    if (existing) return res.json({ ok: true, alreadySubmitted: true });

    // Metadata
    doc.source    = String(body.source || '').slice(0, 64);
    doc.utm = {
      source:   String(body.utm?.source   || '').slice(0, 128),
      medium:   String(body.utm?.medium   || '').slice(0, 128),
      campaign: String(body.utm?.campaign || '').slice(0, 128),
      term:     String(body.utm?.term     || '').slice(0, 128),
      content:  String(body.utm?.content  || '').slice(0, 128),
    };
    doc.completionTimeSeconds = Number(body.completionTimeSeconds) || null;
    doc.ipAddress = req.ip || req.headers['x-forwarded-for'] || '';
    doc.userAgent = (req.headers['user-agent'] || '').slice(0, 512);
    doc.submittedAt = new Date();

    const saved = await new PartnerResearchSubmission(doc).save();
    return res.json({ ok: true, id: saved._id });
  } catch (err) {
    if (err && err.code === 11000) {
      // Race on compound unique — treat as duplicate.
      return res.json({ ok: true, alreadySubmitted: true });
    }
    console.error('[PartnerResearch] submit error', err);
    return res.status(500).json({ msg: 'Could not submit. Please try again.' });
  }
});

module.exports = router;
```

- [ ] **Step 2: Commit**

```bash
git add server/routes/partnerResearch.js
git commit -m "feat(partner-research): add public submit route with rate limit + honeypot"
```

---

## Task 3: Admin route — list, detail, stats

**Files:**
- Create: `server/routes/admin/partnerResearch.js`

- [ ] **Step 1: Write the route**

```js
const express = require('express');
const router = express.Router();
const { admin } = require('../../middleware/auth');
const PartnerResearchSubmission = require('../../models/PartnerResearchSubmission');

// Mounted with [auth, requireEmailVerified] from server.js. Add admin gate.
router.use(admin);

const VALID_TYPES = new Set(['realtor', 'facebook_group_admin']);

// GET /api/admin/partner-research?partnerType=&search=&page=&pageSize=
router.get('/', async (req, res) => {
  try {
    const page     = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 25));
    const filter   = {};

    if (VALID_TYPES.has(req.query.partnerType)) filter.partnerType = req.query.partnerType;
    if (req.query.search) {
      const safe = String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(safe, 'i');
      filter.$or = [
        { fullName: rx }, { email: rx },
        { brokerageName: rx }, { mainMarket: rx },
        { facebookGroupUrl: rx },
      ];
    }

    const [submissions, total] = await Promise.all([
      PartnerResearchSubmission
        .find(filter)
        .select('partnerType fullName email brokerageName mainMarket monthlyMovingClients facebookGroupUrl groupSize movingHelpFrequency submittedAt')
        .sort({ submittedAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      PartnerResearchSubmission.countDocuments(filter),
    ]);

    res.json({ submissions, total, page, pageSize });
  } catch (err) {
    console.error('[AdminPartnerResearch] list error', err);
    res.status(500).json({ msg: 'Could not load submissions.' });
  }
});

// GET /api/admin/partner-research/stats
// MUST be declared BEFORE /:id so it isn't swallowed by ObjectId-shaped param.
router.get('/stats', async (_req, res) => {
  try {
    const [total, realtor, facebook_group_admin] = await Promise.all([
      PartnerResearchSubmission.countDocuments({}),
      PartnerResearchSubmission.countDocuments({ partnerType: 'realtor' }),
      PartnerResearchSubmission.countDocuments({ partnerType: 'facebook_group_admin' }),
    ]);
    res.json({ total, realtor, facebook_group_admin });
  } catch (err) {
    console.error('[AdminPartnerResearch] stats error', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/admin/partner-research/:id
router.get('/:id', async (req, res) => {
  try {
    const doc = await PartnerResearchSubmission.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ msg: 'Submission not found.' });
    res.json(doc);
  } catch (err) {
    if (err && err.name === 'CastError') {
      return res.status(404).json({ msg: 'Submission not found.' });
    }
    console.error('[AdminPartnerResearch] detail error', err);
    res.status(500).json({ msg: 'Could not load submission.' });
  }
});

module.exports = router;
```

- [ ] **Step 2: Commit**

```bash
git add server/routes/admin/partnerResearch.js
git commit -m "feat(partner-research): add admin list/detail/stats routes"
```

---

## Task 4: Mount routes in `server.js`

**Files:**
- Modify: `server/server.js:99` (after the `/api/founding-movers` mount) and `server/server.js:113` (after the `/api/admin/mover-research` mount)

- [ ] **Step 1: Add public mount after line 99**

Use Edit. After `app.use('/api/founding-movers', require('./routes/foundingMovers')); // PUBLIC: Founding Mover Program intake`, add:

```js
app.use('/api/partner-research', require('./routes/partnerResearch')); // PUBLIC: Partner validation funnels (realtors + FB groups)
```

- [ ] **Step 2: Add admin mount after line 113**

After `app.use('/api/admin/mover-research', verifiedGate, require('./routes/admin/moverResearch'));`, add:

```js
app.use('/api/admin/partner-research', verifiedGate, require('./routes/admin/partnerResearch'));
```

- [ ] **Step 3: Commit**

```bash
git add server/server.js
git commit -m "feat(partner-research): mount public + admin routers"
```

---

## Task 5: `MarketAutocomplete` shared component

**Files:**
- Create: `client/src/components/MarketAutocomplete.jsx`

Functional copy of `StateAutocomplete` from `FoundingMovers.jsx:655-761` with placeholder text changed to "Main market". Same `US_STATES` data, same `.fm-state-*` classnames so existing `FoundingMovers.css` applies. Zero changes to `FoundingMovers.jsx`.

- [ ] **Step 1: Write the component**

```jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { US_STATES } from '../data/usStates';

/**
 * MarketAutocomplete — state-level market picker matching the UX of the
 * founding-movers state autocomplete. Stores the 2-letter state code.
 *
 * Uses the .fm-state-* classnames so FoundingMovers.css styles apply when
 * imported on a page that also imports FoundingMovers.css.
 */
export default function MarketAutocomplete({ value, onChange, placeholder = 'Main market' }) {
  const [query, setQuery]         = useState('');
  const [open, setOpen]           = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = useRef(null);

  const selected = useMemo(() => {
    if (!value) return null;
    return US_STATES.find(s => s.code === value || s.name === value) || null;
  }, [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return US_STATES.slice(0, 6);
    const matches = US_STATES.filter(s =>
      s.name.toLowerCase().includes(q) || s.code.toLowerCase().startsWith(q)
    );
    return matches.sort((a, b) => {
      const aPref = a.name.toLowerCase().startsWith(q) || a.code.toLowerCase().startsWith(q) ? 0 : 1;
      const bPref = b.name.toLowerCase().startsWith(q) || b.code.toLowerCase().startsWith(q) ? 0 : 1;
      if (aPref !== bPref) return aPref - bPref;
      return a.name.localeCompare(b.name);
    }).slice(0, 6);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  function commit(state) {
    onChange(state.code);
    setQuery('');
    setOpen(false);
    setActiveIdx(0);
  }

  function handleKey(e) {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = filtered[activeIdx] || filtered[0];
      if (pick) commit(pick);
    }
    else if (e.key === 'Escape') { setOpen(false); }
  }

  if (selected) {
    return (
      <div className="fm-state-chip-row">
        <span className="fm-state-chip">
          {selected.name} <span className="fm-state-chip-code">({selected.code})</span>
          <button
            type="button"
            className="fm-state-chip-x"
            aria-label={`Remove ${selected.name}`}
            onClick={() => onChange('')}
          >×</button>
        </span>
      </div>
    );
  }

  return (
    <div className="fm-state-wrap" ref={wrapRef}>
      <input
        className="fm-input"
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); setActiveIdx(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        aria-autocomplete="list"
        aria-expanded={open}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="fm-state-dropdown" role="listbox">
          {filtered.map((s, i) => (
            <button
              key={s.code}
              type="button"
              role="option"
              aria-selected={i === activeIdx}
              className={`fm-state-option${i === activeIdx ? ' active' : ''}`}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => commit(s)}
            >
              <span className="fm-state-name">{s.name}</span>
              <span className="fm-state-code">({s.code})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/MarketAutocomplete.jsx
git commit -m "feat(partner-research): add MarketAutocomplete shared component"
```

---

## Task 6: `usePartnerForm` hook

**Files:**
- Create: `client/src/hooks/usePartnerForm.js`

Owns UTM capture, localStorage save/restore (7d TTL, `savedAt` timestamp), `completionTimeSeconds` tracking, and submit-to-server with friendly `alreadySubmitted` handling.

- [ ] **Step 1: Write the hook**

```js
import { useState, useEffect, useRef, useCallback } from 'react';

const RAW_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const API_URL  = RAW_BASE.endsWith('/api') ? RAW_BASE : `${RAW_BASE}/api`;

const STORAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * usePartnerForm — shared form-state engine for /founding-realtors and
 * /founding-groups. Captures UTM from the URL on mount, persists draft
 * state to localStorage (TTL 7 days), tracks completion time, and posts
 * to /api/partner-research/submit with friendly duplicate handling.
 *
 * @param {Object} opts
 * @param {string} opts.storageKey       — localStorage key for draft persistence
 * @param {string} opts.partnerType      — 'realtor' | 'facebook_group_admin'
 * @param {string} opts.source           — 'founding-realtors-v1' or 'founding-groups-v1'
 * @param {Object} opts.initialAnswers   — default field values for the form
 */
export function usePartnerForm({ storageKey, partnerType, source, initialAnswers }) {
  const [answers, setAnswers]       = useState(initialAnswers);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [errorMsg, setErrorMsg]     = useState('');
  const startedAtRef = useRef(null);

  // Restore + UTM capture on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.savedAt && (Date.now() - parsed.savedAt) < STORAGE_TTL_MS) {
          if (parsed.answers)   setAnswers(prev => ({ ...prev, ...parsed.answers }));
          if (parsed.startedAt) startedAtRef.current = parsed.startedAt;
        } else {
          localStorage.removeItem(storageKey);
        }
      }
    } catch { /* corrupted — ignore */ }

    try {
      const qs = new URLSearchParams(window.location.search);
      const utm = {
        source:   qs.get('utm_source')   || '',
        medium:   qs.get('utm_medium')   || '',
        campaign: qs.get('utm_campaign') || '',
        term:     qs.get('utm_term')     || '',
        content:  qs.get('utm_content')  || '',
      };
      if (Object.values(utm).some(Boolean)) {
        setAnswers(prev => ({ ...prev, utm: { ...prev.utm, ...utm } }));
      }
    } catch { /* noop */ }
  }, [storageKey]);

  // Persist draft. Skip after success.
  useEffect(() => {
    if (submitted) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        savedAt: Date.now(),
        startedAt: startedAtRef.current,
        answers,
      }));
    } catch { /* quota — ignore */ }
  }, [answers, submitted, storageKey]);

  const setField = useCallback((field, value) => {
    if (!startedAtRef.current) startedAtRef.current = Date.now();
    setAnswers(prev => ({ ...prev, [field]: value }));
  }, []);

  const submit = useCallback(async (payloadOverrides = {}) => {
    if (submitting) return;
    setSubmitting(true);
    setErrorMsg('');
    try {
      const completionTimeSeconds = startedAtRef.current
        ? Math.round((Date.now() - startedAtRef.current) / 1000)
        : null;

      const payload = {
        partnerType,
        source,
        utm: answers.utm,
        completionTimeSeconds,
        website: answers.website || '', // honeypot
        ...answers,
        ...payloadOverrides,
      };

      const res = await fetch(`${API_URL}/partner-research/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok && !body.alreadySubmitted) {
        setErrorMsg(body.msg || 'Could not submit. Please try again.');
        setSubmitting(false);
        return false;
      }
      try { localStorage.removeItem(storageKey); } catch { /* noop */ }
      setSubmitted(true);
      return true;
    } catch (_e) {
      setErrorMsg('Network error. Please try again.');
      return false;
    } finally {
      setSubmitting(false);
    }
  }, [answers, partnerType, source, storageKey, submitting]);

  return { answers, setField, submit, submitting, submitted, errorMsg };
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/hooks/usePartnerForm.js
git commit -m "feat(partner-research): add usePartnerForm hook"
```

---

## Task 7: `FoundingRealtors` page

**Files:**
- Create: `client/src/pages/FoundingRealtors.jsx`

Single-screen form: fullName, email, brokerageName, MarketAutocomplete, monthlyMovingClients select, honeypot. Reuses `FoundingMovers.css` via import. Embedded success state replaces the form after submit.

- [ ] **Step 1: Write the page**

```jsx
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

          {errorMsg && <p className="fm-error" role="alert">{errorMsg}</p>}

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
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/FoundingRealtors.jsx
git commit -m "feat(partner-research): add FoundingRealtors page"
```

---

## Task 8: `FoundingGroups` page

**Files:**
- Create: `client/src/pages/FoundingGroups.jsx`

Mirrors FoundingRealtors structure with FB-group fields.

- [ ] **Step 1: Write the page**

```jsx
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

          {errorMsg && <p className="fm-error" role="alert">{errorMsg}</p>}

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
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/FoundingGroups.jsx
git commit -m "feat(partner-research): add FoundingGroups page"
```

---

## Task 9: `AdminPartnerResearch` page

**Files:**
- Create: `client/src/pages/admin/AdminPartnerResearch.jsx`

3 stat cards + partnerType filter + search + table + click-to-open detail drawer. Mirrors structure of `AdminMoverResearch.jsx` but drops intel sections, CSV, delete, tag/state filters.

- [ ] **Step 1: Write the page**

```jsx
import React, { useState, useEffect, useContext, useCallback } from 'react';
import { Users2, Search, X } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { AuthContext } from '../../context/AuthContext';

const TYPE_LABELS = {
  realtor: 'Realtor',
  facebook_group_admin: 'FB Group',
};

const FREQ_LABELS = {
  daily: 'Daily',
  weekly: 'Weekly',
  occasionally: 'Occasionally',
  rarely: 'Rarely',
  '': '—',
};

export default function AdminPartnerResearch() {
  const { API_URL, token } = useContext(AuthContext);

  const [stats, setStats]             = useState({ total: 0, realtor: 0, facebook_group_admin: 0 });
  const [submissions, setSubmissions] = useState([]);
  const [total, setTotal]             = useState(0);
  const [loading, setLoading]         = useState(true);

  const [page, setPage]   = useState(1);
  const [pageSize]        = useState(25);
  const [search, setSearch] = useState('');
  const [typeFilter, setType] = useState('');

  const [drawerId, setDrawerId]   = useState(null);
  const [drawerDoc, setDrawerDoc] = useState(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/admin/partner-research/stats`, {
        headers: { 'x-auth-token': token },
      });
      const json = await res.json();
      if (res.ok) setStats(json);
    } catch (e) { console.error('[AdminPartnerResearch] stats fetch failed', e); }
  }, [API_URL, token]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (search) params.set('search', search);
      if (typeFilter) params.set('partnerType', typeFilter);
      const res = await fetch(`${API_URL}/admin/partner-research?${params.toString()}`, {
        headers: { 'x-auth-token': token },
      });
      const json = await res.json();
      if (res.ok) {
        setSubmissions(json.submissions || []);
        setTotal(json.total || 0);
      }
    } catch (e) { console.error('[AdminPartnerResearch] list fetch failed', e); }
    finally { setLoading(false); }
  }, [API_URL, token, page, pageSize, search, typeFilter]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchList(); }, [fetchList]);
  useEffect(() => { setPage(1); }, [search, typeFilter]);

  useEffect(() => {
    if (!drawerId) { setDrawerDoc(null); return; }
    (async () => {
      try {
        const res = await fetch(`${API_URL}/admin/partner-research/${drawerId}`, {
          headers: { 'x-auth-token': token },
        });
        const json = await res.json();
        if (res.ok) setDrawerDoc(json);
      } catch (e) { console.error(e); }
    })();
  }, [drawerId, API_URL, token]);

  function signalFor(row) {
    if (row.partnerType === 'realtor') {
      return [row.mainMarket || '—', row.monthlyMovingClients ? `${row.monthlyMovingClients} clients/mo` : ''].filter(Boolean).join(' • ');
    }
    return [row.groupSize || '—', FREQ_LABELS[row.movingHelpFrequency || ''] || '—'].filter(Boolean).join(' • ');
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <AdminLayout>
      <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>Partner Research</h1>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
          <StatCard label="Total submissions" value={stats.total} />
          <StatCard label="Realtors" value={stats.realtor} />
          <StatCard label="Facebook groups" value={stats.facebook_group_admin} />
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <select
            value={typeFilter}
            onChange={e => setType(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #d4d4d8' }}
          >
            <option value="">All types</option>
            <option value="realtor">Realtors</option>
            <option value="facebook_group_admin">FB Groups</option>
          </select>
          <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#71717a' }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name / email / market / group URL"
              style={{ width: '100%', padding: '8px 10px 8px 30px', borderRadius: 8, border: '1px solid #d4d4d8' }}
            />
          </div>
        </div>

        {/* Table */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e4e4e7', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead style={{ background: '#fafafa', textAlign: 'left' }}>
              <tr>
                <th style={th}>Date</th>
                <th style={th}>Type</th>
                <th style={th}>Name</th>
                <th style={th}>Email</th>
                <th style={th}>Signal</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#71717a' }}>Loading…</td></tr>
              ) : submissions.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#71717a' }}>No submissions yet.</td></tr>
              ) : submissions.map(row => (
                <tr key={row._id} onClick={() => setDrawerId(row._id)} style={{ cursor: 'pointer', borderTop: '1px solid #f4f4f5' }}>
                  <td style={td}>{new Date(row.submittedAt).toLocaleDateString()}</td>
                  <td style={td}>{TYPE_LABELS[row.partnerType] || row.partnerType}</td>
                  <td style={td}>{row.fullName}</td>
                  <td style={td}>{row.email}</td>
                  <td style={{ ...td, color: '#52525b' }}>{signalFor(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Prev</button>
            <span style={{ alignSelf: 'center', fontSize: 13, color: '#52525b' }}>Page {page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</button>
          </div>
        )}

        {/* Detail drawer */}
        {drawerId && (
          <Drawer onClose={() => setDrawerId(null)} doc={drawerDoc} />
        )}
      </div>
    </AdminLayout>
  );
}

const th = { padding: '12px 14px', fontSize: 12, fontWeight: 600, color: '#52525b', textTransform: 'uppercase', letterSpacing: 0.4 };
const td = { padding: '12px 14px', verticalAlign: 'middle' };

function StatCard({ label, value }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#71717a', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function Drawer({ onClose, doc }) {
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', zIndex: 100 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'absolute', right: 0, top: 0, bottom: 0,
          width: 'min(520px, 100vw)', background: '#fff',
          padding: 24, overflowY: 'auto', boxShadow: '-12px 0 32px rgba(15,23,42,0.18)',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close drawer"
          style={{ position: 'absolute', right: 12, top: 12, background: 'transparent', border: 0, cursor: 'pointer' }}
        >
          <X size={18} />
        </button>
        {!doc ? <p>Loading…</p> : (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>{doc.fullName}</h2>
            <p style={{ color: '#52525b', fontSize: 13, marginBottom: 16 }}>
              {TYPE_LABELS[doc.partnerType]} · {new Date(doc.submittedAt).toLocaleString()}
            </p>

            <Row label="Email" value={doc.email} />
            {doc.partnerType === 'realtor' && (
              <>
                <Row label="Brokerage" value={doc.brokerageName} />
                <Row label="Main market" value={doc.mainMarket} />
                <Row label="Monthly clients" value={doc.monthlyMovingClients} />
              </>
            )}
            {doc.partnerType === 'facebook_group_admin' && (
              <>
                <Row label="Facebook group" value={
                  <a href={doc.facebookGroupUrl} target="_blank" rel="noreferrer">{doc.facebookGroupUrl}</a>
                } />
                <Row label="Group size" value={doc.groupSize} />
                <Row label="Help frequency" value={FREQ_LABELS[doc.movingHelpFrequency || ''] || '—'} />
              </>
            )}

            <h3 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', color: '#71717a', marginTop: 20, marginBottom: 8 }}>Metadata</h3>
            <Row label="Source" value={doc.source} />
            <Row label="UTM source" value={doc.utm?.source} />
            <Row label="UTM medium" value={doc.utm?.medium} />
            <Row label="UTM campaign" value={doc.utm?.campaign} />
            <Row label="Completion (s)" value={doc.completionTimeSeconds} />
            <Row label="IP" value={doc.ipAddress} />
            <Row label="User agent" value={doc.userAgent} />
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div style={{ display: 'flex', gap: 12, padding: '6px 0', borderBottom: '1px solid #f4f4f5', fontSize: 14 }}>
      <div style={{ width: 140, color: '#71717a', flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, color: '#0f172a', wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/admin/AdminPartnerResearch.jsx
git commit -m "feat(partner-research): add admin dashboard page"
```

---

## Task 10: Wire routes + admin nav

**Files:**
- Modify: `client/src/App.jsx:52` (add lazy imports) and `client/src/App.jsx:98,117` (add routes)
- Modify: `client/src/components/AdminLayout.jsx:139` (add NavLink)

- [ ] **Step 1: Add lazy imports in App.jsx**

After line 52 (`const FoundingMovers = lazy(...)`), add:

```jsx
const FoundingRealtors = lazy(() => import('./pages/FoundingRealtors'));
const FoundingGroups = lazy(() => import('./pages/FoundingGroups'));
const AdminPartnerResearch = lazy(() => import('./pages/admin/AdminPartnerResearch'));
```

- [ ] **Step 2: Add public routes in App.jsx**

After line 98 (`<Route path="/founding-movers" element={<FoundingMovers />} />`), add:

```jsx
<Route path="/founding-realtors" element={<FoundingRealtors />} />
<Route path="/founding-groups" element={<FoundingGroups />} />
```

- [ ] **Step 3: Add admin route in App.jsx**

After line 117 (`<Route path="/admin/mover-research" ...>`), add:

```jsx
<Route path="/admin/partner-research" element={<ProtectedRoute requireAdmin><AdminPartnerResearch /></ProtectedRoute>} />
```

- [ ] **Step 4: Add admin nav entry in AdminLayout.jsx**

After line 141 (the closing `</NavLink>` of the mover-research entry), add:

```jsx
<NavLink to="/admin/partner-research" title={collapsed ? 'Partner Research' : undefined} onClick={() => setSidebarOpen(false)} className={({isActive}) => isActive ? "nav-item active" : "nav-item"}>
  <ClipboardList size={18} /> <span className="nav-label">Partner Research</span>
</NavLink>
```

Note: `ClipboardList` is already imported in AdminLayout — no import change needed.

- [ ] **Step 5: Commit**

```bash
git add client/src/App.jsx client/src/components/AdminLayout.jsx
git commit -m "feat(partner-research): wire public + admin routes and nav entry"
```

---

## Task 11: Verification

- [ ] **Step 1: Server boots without error**

```bash
cd server && node -e "require('./models/PartnerResearchSubmission'); require('./routes/partnerResearch'); require('./routes/admin/partnerResearch'); console.log('OK');"
```
Expected: `OK`

- [ ] **Step 2: Lint client files (Vite build typecheck)**

```bash
cd client && npm run build 2>&1 | tail -40
```
Expected: build succeeds with no errors for the new files.

- [ ] **Step 3: Manual smoke**

Start dev server, visit `/founding-realtors` and `/founding-groups`. Submit one of each. Visit `/admin/partner-research` (admin user required) and verify stat cards + table + drawer render.

- [ ] **Step 4: Final commit if anything was fixed**

```bash
git add -A && git status
# Only commit if there are uncommitted fixes
```

---

## Self-Review

- ✅ Spec coverage: every `confirmed_decisions` item maps to a task. Compound unique index in Task 1. Honeypot in Tasks 2/7/8. Rate limit at router level in Task 2. Dedup-as-success + race fallback in Task 2. UTM + localStorage in Task 6. MarketAutocomplete state-level reuse in Task 5. 3 stat cards in Task 9. Signal column formatting in Task 9. No CSV/delete/charts/tags/approval — confirmed absent.
- ✅ No placeholders: every code block is the actual file content or actual edit.
- ✅ Type consistency: `partnerType` values `'realtor' | 'facebook_group_admin'` match across model, public route, admin route, hook, both pages, and admin page. Field names match.
- ✅ Tasks 7 and 8 share structure but each shows complete code (engineer can read either out of order).
