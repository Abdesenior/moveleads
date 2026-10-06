// Lead attribution: where a quote request came from.
//
// The client stores the visitor's FIRST landing page, referrer and UTM tags
// (client/src/utils/attribution.js) and sends them with the quote. This
// module turns that into a small, bounded record:
//   - landingPage: path only (no query string, so no emails/ids leak in)
//   - referrerHost: host only (no path or search terms)
//   - channel: organic_search | ai_assistant | social | referral |
//              campaign | paid | direct
// Everything is optional; bad input degrades to "direct", never throws.

const OWN_HOSTS = /(^|\.)moveleads\.cloud$/;
const AI = /(^|\.)(chatgpt\.com|chat\.openai\.com|perplexity\.ai|copilot\.microsoft\.com|gemini\.google\.com|claude\.ai)$/;
const SEARCH = /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|yahoo\.com|search\.yahoo\.com|ecosia\.org|search\.brave\.com|baidu\.com|yandex\.[a-z]+)$/;
const SOCIAL = /(^|\.)(facebook\.com|fb\.com|instagram\.com|linkedin\.com|lnkd\.in|t\.co|x\.com|twitter\.com|reddit\.com|tiktok\.com|youtube\.com|pinterest\.com|nextdoor\.com)$/;
const PAID_MEDIUM = /^(cpc|ppc|paid|paidsearch|paid_search|paid-social|paid_social|display|cpm)$/i;

const CHANNELS = ['organic_search', 'ai_assistant', 'social', 'referral', 'campaign', 'paid', 'direct'];

const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '') || undefined;

function hostOf(ref) {
  try {
    const u = new URL(ref);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch (_e) {
    return undefined;
  }
}

function pathOf(page) {
  if (typeof page !== 'string' || !page) return undefined;
  try {
    const u = new URL(page, 'https://moveleads.cloud');
    return u.pathname.slice(0, 300);
  } catch (_e) {
    return undefined;
  }
}

function classify({ referrerHost, utmSource, utmMedium }) {
  if (utmMedium && PAID_MEDIUM.test(utmMedium)) return 'paid';
  if (utmSource || utmMedium) return 'campaign';
  if (!referrerHost || OWN_HOSTS.test(referrerHost)) return 'direct';
  if (AI.test(referrerHost)) return 'ai_assistant';
  if (SEARCH.test(referrerHost)) return 'organic_search';
  if (SOCIAL.test(referrerHost)) return 'social';
  return 'referral';
}

function normalizeAttribution(input) {
  const a = input && typeof input === 'object' ? input : {};
  let referrerHost = hostOf(a.referrer);
  if (referrerHost && OWN_HOSTS.test(referrerHost)) referrerHost = undefined;
  const out = {
    landingPage: pathOf(a.landingPage),
    referrerHost,
    utmSource: clean(a.utmSource, 128),
    utmMedium: clean(a.utmMedium, 128),
    utmCampaign: clean(a.utmCampaign, 128),
  };
  const seen = a.firstSeenAt ? new Date(a.firstSeenAt) : null;
  if (seen && !Number.isNaN(seen.getTime())) out.firstSeenAt = seen;
  out.channel = classify(out);
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}

module.exports = { normalizeAttribution, classify, CHANNELS };
