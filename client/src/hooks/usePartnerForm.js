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
 * @param {string} opts.storageKey     localStorage key for draft persistence
 * @param {string} opts.partnerType    'realtor' | 'facebook_group_admin'
 * @param {string} opts.source         e.g. 'founding-realtors-v1'
 * @param {Object} opts.initialAnswers default field values
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

  const submit = useCallback(async () => {
    if (submitting) return false;
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
