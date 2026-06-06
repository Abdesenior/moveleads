// Contact-trust gate — distributionDecision.js rule 6.5 (2026-06-06)
//
// Promotes contact legitimacy to a PRIMARY approval gate so a high
// composite score driven by move-value signals (size / distance /
// urgency / intent) can't auto-publish a weak-trust lead.
//
// Feature-flagged via env CONTACT_TRUST_GATE_ENABLED=true. When unset
// or 'false' the gate is bypassed and deriveSystemDecision behaves
// exactly as before. Each suite below toggles the flag explicitly.

const test = require('node:test');
const assert = require('node:assert');
const {
  deriveSystemDecision,
  describeSystemDecisionSource,
} = require('../utils/distributionDecision');

// Baseline that would otherwise pass every existing gate and land at
// system_approved. Override targeted fields per test to trigger
// individual rules.
function cleanLead(overrides = {}) {
  return {
    _id: 'lead-test-1',
    status: 'Pending Verification',
    qualityGateCleared: true,
    shadowTier: 'premium',
    structuralBlockers: [],
    validation: {
      phone: {
        valid: true,
        lineType: 'mobile',
        isVoip: false,
        suspicionPattern: null,
        providerSuspicion: 'low',
        validityReason: null,
        checkedAt: new Date('2026-06-01T00:00:00Z'),
        identityMatch: { firstNameMatch: true, lastNameMatch: true },
      },
      fraud: { smsPumpingRisk: 'low' },
      fingerprint: { bot: false },
    },
    scores: { trustScore: 80, compositeScore: 85 },
    ...overrides,
  };
}

// Cleaner test output — suppress the gate's structured warn lines.
// Production callers want to see them; tests don't.
const _origWarn = console.warn;
function silenceWarnings() {
  console.warn = () => {};
}
function restoreWarnings() {
  console.warn = _origWarn;
}

// ─────────────────────────────────────────────────────────────────
// SUITE A — gate ENABLED
// ─────────────────────────────────────────────────────────────────

test('contact-trust gate enabled — Rule 1: landline WITHOUT identity match → system_held', () => {
  process.env.CONTACT_TRUST_GATE_ENABLED = 'true';
  silenceWarnings();
  try {
    const lead = cleanLead({
      validation: {
        phone: {
          valid: true,
          lineType: 'landline',
          isVoip: false,
          checkedAt: new Date(),
          identityMatch: { firstNameMatch: false, lastNameMatch: false },
        },
        fraud: { smsPumpingRisk: 'low' },
        fingerprint: { bot: false },
      },
    });
    assert.strictEqual(deriveSystemDecision(lead), 'system_held');
    assert.match(
      describeSystemDecisionSource(lead),
      /contact_trust_gate:landline_no_identity_match/
    );
  } finally {
    restoreWarnings();
  }
});

test('contact-trust gate enabled — Rule 1: landline WITH firstNameMatch → falls through, system_approved', () => {
  process.env.CONTACT_TRUST_GATE_ENABLED = 'true';
  silenceWarnings();
  try {
    const lead = cleanLead({
      validation: {
        phone: {
          valid: true,
          lineType: 'landline',
          isVoip: false,
          checkedAt: new Date(),
          identityMatch: { firstNameMatch: true, lastNameMatch: false },
        },
        fraud: { smsPumpingRisk: 'low' },
        fingerprint: { bot: false },
      },
    });
    assert.strictEqual(deriveSystemDecision(lead), 'system_approved');
  } finally {
    restoreWarnings();
  }
});

test('contact-trust gate enabled — Rule 2: lineType=voip → system_held even with identity match', () => {
  process.env.CONTACT_TRUST_GATE_ENABLED = 'true';
  silenceWarnings();
  try {
    const lead = cleanLead({
      validation: {
        phone: {
          valid: true,
          lineType: 'voip',
          isVoip: true,
          checkedAt: new Date(),
          identityMatch: { firstNameMatch: true, lastNameMatch: true },
        },
        fraud: { smsPumpingRisk: 'low' },
        fingerprint: { bot: false },
      },
    });
    assert.strictEqual(deriveSystemDecision(lead), 'system_held');
    assert.match(
      describeSystemDecisionSource(lead),
      /contact_trust_gate:voip/
    );
  } finally {
    restoreWarnings();
  }
});

test('contact-trust gate enabled — Rule 2: lineType=fixedvoip → system_held', () => {
  process.env.CONTACT_TRUST_GATE_ENABLED = 'true';
  silenceWarnings();
  try {
    const lead = cleanLead({
      validation: {
        phone: {
          valid: true,
          lineType: 'fixedvoip',
          isVoip: false,
          checkedAt: new Date(),
          identityMatch: { firstNameMatch: true },
        },
        fraud: { smsPumpingRisk: 'low' },
        fingerprint: { bot: false },
      },
    });
    assert.strictEqual(deriveSystemDecision(lead), 'system_held');
  } finally {
    restoreWarnings();
  }
});

test('contact-trust gate enabled — Rule 2: isVoip=true with mobile lineType → system_held', () => {
  process.env.CONTACT_TRUST_GATE_ENABLED = 'true';
  silenceWarnings();
  try {
    const lead = cleanLead({
      validation: {
        phone: {
          valid: true,
          lineType: 'mobile',
          isVoip: true,
          checkedAt: new Date(),
          identityMatch: { firstNameMatch: true },
        },
        fraud: { smsPumpingRisk: 'low' },
        fingerprint: { bot: false },
      },
    });
    assert.strictEqual(deriveSystemDecision(lead), 'system_held');
  } finally {
    restoreWarnings();
  }
});

test('contact-trust gate enabled — Rule 3: validityReason=twilio_no_enrichment, no identity → system_held', () => {
  process.env.CONTACT_TRUST_GATE_ENABLED = 'true';
  silenceWarnings();
  try {
    const lead = cleanLead({
      validation: {
        phone: {
          valid: true,
          lineType: 'mobile',
          isVoip: false,
          validityReason: 'twilio_no_enrichment',
          checkedAt: new Date(),
          identityMatch: { firstNameMatch: false, lastNameMatch: false },
        },
        fraud: { smsPumpingRisk: 'low' },
        fingerprint: { bot: false },
      },
    });
    assert.strictEqual(deriveSystemDecision(lead), 'system_held');
    assert.match(
      describeSystemDecisionSource(lead),
      /contact_trust_gate:no_telecom_enrichment/
    );
  } finally {
    restoreWarnings();
  }
});

test('contact-trust gate enabled — Rule 3: checkedAt missing, no identity → system_held', () => {
  process.env.CONTACT_TRUST_GATE_ENABLED = 'true';
  silenceWarnings();
  try {
    const lead = cleanLead({
      validation: {
        phone: {
          valid: true,
          lineType: 'mobile',
          isVoip: false,
          checkedAt: null,
          identityMatch: { firstNameMatch: false, lastNameMatch: false },
        },
        fraud: { smsPumpingRisk: 'low' },
        fingerprint: { bot: false },
      },
    });
    assert.strictEqual(deriveSystemDecision(lead), 'system_held');
  } finally {
    restoreWarnings();
  }
});

test('contact-trust gate enabled — Rule 3: no enrichment but identity match → falls through, system_approved', () => {
  process.env.CONTACT_TRUST_GATE_ENABLED = 'true';
  silenceWarnings();
  try {
    const lead = cleanLead({
      validation: {
        phone: {
          valid: true,
          lineType: 'mobile',
          isVoip: false,
          checkedAt: null,
          identityMatch: { firstNameMatch: true, lastNameMatch: false },
        },
        fraud: { smsPumpingRisk: 'low' },
        fingerprint: { bot: false },
      },
    });
    assert.strictEqual(deriveSystemDecision(lead), 'system_approved');
  } finally {
    restoreWarnings();
  }
});

test('contact-trust gate enabled — Rule 4: trustScore 55 + composite 80 → system_held', () => {
  process.env.CONTACT_TRUST_GATE_ENABLED = 'true';
  silenceWarnings();
  try {
    const lead = cleanLead({
      scores: { trustScore: 55, compositeScore: 80 },
    });
    assert.strictEqual(deriveSystemDecision(lead), 'system_held');
    assert.match(
      describeSystemDecisionSource(lead),
      /contact_trust_gate:trust_score_below_60/
    );
  } finally {
    restoreWarnings();
  }
});

test('contact-trust gate enabled — Rule 5: trustScore 60 + composite 70 → system_held (composite>=70 + trust<65)', () => {
  process.env.CONTACT_TRUST_GATE_ENABLED = 'true';
  silenceWarnings();
  try {
    const lead = cleanLead({
      scores: { trustScore: 60, compositeScore: 70 },
    });
    assert.strictEqual(deriveSystemDecision(lead), 'system_held');
    assert.match(
      describeSystemDecisionSource(lead),
      /contact_trust_gate:composite_overrides_weak_trust/
    );
  } finally {
    restoreWarnings();
  }
});

test('contact-trust gate enabled — trustScore 70 + composite 80 → system_approved (passes gate)', () => {
  process.env.CONTACT_TRUST_GATE_ENABLED = 'true';
  silenceWarnings();
  try {
    const lead = cleanLead({
      scores: { trustScore: 70, compositeScore: 80 },
    });
    assert.strictEqual(deriveSystemDecision(lead), 'system_approved');
  } finally {
    restoreWarnings();
  }
});

test('contact-trust gate enabled — invalid phone still falls into existing Rule 6 → system_held', () => {
  process.env.CONTACT_TRUST_GATE_ENABLED = 'true';
  silenceWarnings();
  try {
    const lead = cleanLead({
      validation: {
        phone: {
          valid: false,
          lineType: 'mobile',
          isVoip: false,
          checkedAt: new Date(),
        },
        fraud: { smsPumpingRisk: 'low' },
        fingerprint: { bot: false },
      },
    });
    assert.strictEqual(deriveSystemDecision(lead), 'system_held');
    // Should be classified by existing Rule 6, NOT the new gate.
    assert.match(
      describeSystemDecisionSource(lead),
      /raw:phone\.valid=false/
    );
  } finally {
    restoreWarnings();
  }
});

test('contact-trust gate enabled — REJECTED_FAKE wins over gate (rule 1 > rule 6.5)', () => {
  process.env.CONTACT_TRUST_GATE_ENABLED = 'true';
  silenceWarnings();
  try {
    const lead = cleanLead({
      status: 'REJECTED_FAKE',
      validation: {
        phone: { lineType: 'landline', identityMatch: {} },
        fraud: { smsPumpingRisk: 'low' },
        fingerprint: { bot: false },
      },
    });
    assert.strictEqual(deriveSystemDecision(lead), 'system_rejected');
  } finally {
    restoreWarnings();
  }
});

test('contact-trust gate enabled — shadowTier=review wins over gate (rule 4 > rule 6.5)', () => {
  process.env.CONTACT_TRUST_GATE_ENABLED = 'true';
  silenceWarnings();
  try {
    const lead = cleanLead({
      shadowTier: 'review',
      validation: {
        phone: { lineType: 'mobile', identityMatch: { firstNameMatch: true } },
        fraud: { smsPumpingRisk: 'low' },
        fingerprint: { bot: false },
      },
      scores: { trustScore: 80, compositeScore: 85 },
    });
    assert.strictEqual(deriveSystemDecision(lead), 'system_held');
    assert.match(describeSystemDecisionSource(lead), /shadowTier=review/);
  } finally {
    restoreWarnings();
  }
});

// ─────────────────────────────────────────────────────────────────
// SUITE B — gate DISABLED (backward compatibility)
// ─────────────────────────────────────────────────────────────────

test('contact-trust gate disabled — landline without identity match → system_approved (legacy behavior)', () => {
  process.env.CONTACT_TRUST_GATE_ENABLED = 'false';
  silenceWarnings();
  try {
    const lead = cleanLead({
      validation: {
        phone: {
          valid: true,
          lineType: 'landline',
          isVoip: false,
          checkedAt: new Date(),
          identityMatch: { firstNameMatch: false, lastNameMatch: false },
        },
        fraud: { smsPumpingRisk: 'low' },
        fingerprint: { bot: false },
      },
    });
    assert.strictEqual(deriveSystemDecision(lead), 'system_approved');
  } finally {
    restoreWarnings();
  }
});

test('contact-trust gate disabled — voip → system_approved (legacy behavior)', () => {
  process.env.CONTACT_TRUST_GATE_ENABLED = 'false';
  silenceWarnings();
  try {
    const lead = cleanLead({
      validation: {
        phone: {
          valid: true,
          lineType: 'voip',
          isVoip: true,
          checkedAt: new Date(),
          identityMatch: { firstNameMatch: true },
        },
        fraud: { smsPumpingRisk: 'low' },
        fingerprint: { bot: false },
      },
    });
    assert.strictEqual(deriveSystemDecision(lead), 'system_approved');
  } finally {
    restoreWarnings();
  }
});

test('contact-trust gate disabled — invalid phone still held by existing Rule 6', () => {
  process.env.CONTACT_TRUST_GATE_ENABLED = 'false';
  silenceWarnings();
  try {
    const lead = cleanLead({
      validation: {
        phone: { valid: false, lineType: 'mobile', checkedAt: new Date() },
        fraud: { smsPumpingRisk: 'low' },
        fingerprint: { bot: false },
      },
    });
    assert.strictEqual(deriveSystemDecision(lead), 'system_held');
  } finally {
    restoreWarnings();
  }
});

test('contact-trust gate undefined env — gate is bypassed (default behavior)', () => {
  delete process.env.CONTACT_TRUST_GATE_ENABLED;
  silenceWarnings();
  try {
    const lead = cleanLead({
      validation: {
        phone: {
          valid: true,
          lineType: 'landline',
          isVoip: false,
          checkedAt: new Date(),
          identityMatch: { firstNameMatch: false, lastNameMatch: false },
        },
        fraud: { smsPumpingRisk: 'low' },
        fingerprint: { bot: false },
      },
    });
    assert.strictEqual(deriveSystemDecision(lead), 'system_approved');
  } finally {
    restoreWarnings();
  }
});
