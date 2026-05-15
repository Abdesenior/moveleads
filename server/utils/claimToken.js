/**
 * Claim token generator — Phase 4 SMS Claim scaffolding.
 *
 * Generates short, human-friendly tokens that movers can type into an SMS
 * reply (e.g. "SEND A7K2") to claim a lead. Used token-from-day-one so the
 * claim flow never has to disambiguate "which lead did this reply target?"
 * by guessing from broadcast history.
 *
 * Token shape:
 *   - 4 chars
 *   - 31-char alphabet (digits 2-9 + A-Z minus {O, I, L}) — excludes
 *     ambiguous characters movers might mistype
 *   - 31^4 ≈ 924k namespace per emit; collision is checked at write-time
 *     in claimWindow.token (caller must retry on duplicate)
 *
 * Deliberately NOT using crypto.randomUUID — UUIDs are 36 chars and a mover
 * cannot type them on a phone. The 4-char compromise prioritizes mover UX.
 */

const crypto = require('crypto');

// 28 chars: digits 2-9, letters A-Z minus {O, I, L}
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function generateToken(length = 4) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/**
 * Parse a mover SMS body and try to extract a claim token. Accepts:
 *   "SEND A7K2"   → { keyword: 'SEND', token: 'A7K2' }
 *   "send a7k2"   → { keyword: 'SEND', token: 'A7K2' }
 *   "CLAIM A7K2"  → { keyword: 'CLAIM', token: 'A7K2' }
 *   "A7K2"        → { keyword: null, token: 'A7K2' }   (token alone)
 *   "yes please"  → { keyword: null, token: null }     (unparseable)
 *
 * Conservative: only returns a token when it matches the alphabet exactly.
 */
function parseClaimReply(body, opts = {}) {
  if (!body) return { keyword: null, token: null };
  const tokenLength = opts.tokenLength || 4;
  const text = String(body).toUpperCase().trim();

  // Try "<KEYWORD> <TOKEN>" first
  const kwMatch = text.match(/^(SEND|CLAIM|TAKE)\s+([A-Z0-9]{2,8})\b/);
  if (kwMatch) {
    const candidate = kwMatch[2];
    if (candidate.length === tokenLength && [...candidate].every(c => ALPHABET.includes(c))) {
      return { keyword: kwMatch[1], token: candidate };
    }
  }

  // Try a bare token
  const bareMatch = text.match(/^([A-Z0-9]{2,8})$/);
  if (bareMatch) {
    const candidate = bareMatch[1];
    if (candidate.length === tokenLength && [...candidate].every(c => ALPHABET.includes(c))) {
      return { keyword: null, token: candidate };
    }
  }

  return { keyword: null, token: null };
}

module.exports = {
  generateToken,
  parseClaimReply,
  ALPHABET,
};
