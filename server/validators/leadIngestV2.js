const { z } = require('zod');
const { fromZodError } = require('zod-validation-error');

/**
 * Zod schema for V5 lead-ingest payload (`POST /api/leads/ingest-v2`).
 *
 * Phase 2 status: DEFINED, NOT WIRED. This file is required by no route in
 * production. It exists so the V5 funnel, validation pipeline, and scoring
 * engine all integrate against a stable backend contract. When Phase 3 ships
 * the V5 client + `ingest-v2` route, this is the validator it uses.
 *
 * Differences vs the V4 schema (`leadIngest.js`):
 *   - `.strict()` — unknown fields are REJECTED, not silently dropped. V4
 *     swallows unknowns; V5 must surface them so client/server drift is
 *     immediately visible.
 *   - `firstName` replaces / augments `customerName` (full name optional)
 *   - `customerEmail` is OPTIONAL — server injects `noemail+{phone}@...`
 *     placeholder if missing so downstream CRM email flows don't break.
 *   - `intentConfirmed` boolean — explicit "yes, send my quote" checkbox
 *   - `urgencyBucket` — client-declared urgency
 *   - `heavyItems[]` — boost lead value score
 *   - `moveSize` — superset of V4's `homeSize`, includes commercial sizes
 *   - `clientSubmissionId` — UUID for idempotency, indexed unique partial
 *   - `funnelVersion` — literal `"v5"`, used for analytics
 *   - `fingerprintVisitorId` / `fingerprintRequestId` — optional, ad-block-safe
 *   - No `distance` enum — server computes it from `miles` + ZIP geocode
 *
 * Strictness ensures V5 client errors become 400s, not silent data loss.
 */

const LeadIngestV2Schema = z.object({
  // ── Identity ────────────────────────────────────────────────────────────
  firstName: z
    .string({ required_error: 'First name is required' })
    .min(1, 'First name must be at least 1 character')
    .max(60, 'First name is too long')
    .trim(),

  // Legacy compatibility — V5 collects first/last separately but we also
  // accept a combined customerName if the client wants to send it.
  customerName: z
    .string()
    .min(2)
    .max(100)
    .trim()
    .optional(),

  lastName: z
    .string()
    .min(1)
    .max(60)
    .trim()
    .optional(),

  // Email is now optional. Server injects a placeholder when missing so the
  // legacy CRM review-email flow keeps working. See architecture doc Risk #4.
  customerEmail: z
    .string()
    .email('Must be a valid email address')
    .max(254, 'Email is too long')
    .toLowerCase()
    .trim()
    .optional(),

  customerPhone: z
    .string({ required_error: 'Phone number is required' })
    .regex(/^\+?[\d\s\-().]{7,15}$/, 'Enter a valid phone number')
    .transform(val => {
      if (val.startsWith('+')) return val.replace(/[\s\-().]/g, '');
      const digits = val.replace(/\D/g, '');
      if (digits.length === 10) return `+1${digits}`;
      return `+${digits}`;
    }),

  // ── Route ───────────────────────────────────────────────────────────────
  // V5 always sends ZIPs; city/state are server-side enrichments via Mapbox.
  // Accept either `originZip` (V4-style) or `pickupZip` (V5 wording).
  pickupZip: z
    .string()
    .regex(/^\d{5}$/, 'Pickup zip must be 5 digits')
    .optional(),
  originZip: z
    .string()
    .regex(/^\d{5}$/, 'Origin zip must be 5 digits')
    .optional(),
  destinationZip: z
    .string({ required_error: 'Destination zip is required' })
    .regex(/^\d{5}$/, 'Destination zip must be 5 digits'),

  // ── Move details ────────────────────────────────────────────────────────
  moveDate: z
    .string({ required_error: 'Move date is required' })
    .datetime({ message: 'Move date must be a valid ISO 8601 date string' })
    .refine(d => new Date(d) > new Date(), { message: 'Move date must be in the future' }),

  urgencyBucket: z
    .enum(['asap', 'this_week', 'this_month', 'flexible'])
    .optional(),

  // Superset of V4's homeSize — includes commercial. Server seeds matching
  // PricingRule for 'Office / Commercial' BEFORE the V5 client ships
  // (per architecture doc Phase 3 prerequisite).
  moveSize: z
    .enum([
      'Studio', '1 Bedroom', '2 Bedroom', '3 Bedroom', '4 Bedroom',
      '4+ Bedroom', '5 Bedroom', '5+ Bedroom',
      'House (Small)', 'House (Medium)', 'House (Large)',
      'Office / Commercial',
    ])
    .optional(),
  // Back-compat alias — V4 field name. Either moveSize or homeSize must be set.
  homeSize: z
    .enum([
      'Studio', '1 Bedroom', '2 Bedroom', '3 Bedroom', '4 Bedroom',
      '4+ Bedroom', '5 Bedroom', '5+ Bedroom',
      'House (Small)', 'House (Medium)', 'House (Large)',
      'Office / Commercial',
    ])
    .optional(),

  moveType: z
    .enum(['residential', 'commercial', 'office', 'storage', 'other'])
    .optional(),

  // V6 conversational funnel — operational difficulty signals.
  // Both fields OPTIONAL so V5 payloads continue to validate unchanged.
  homeType: z
    .enum(['house', 'apartment', 'condo', 'townhouse', 'storage', 'other'])
    .optional(),

  stairs: z
    .enum(['ground_floor', 'walk_up_2', 'walk_up_3plus', 'elevator'])
    .optional(),

  heavyItems: z
    .array(z.string().min(1).max(80))
    .max(20, 'Too many heavy items')
    .optional()
    .default([]),

  specialInstructions: z
    .string()
    .max(1000)
    .trim()
    .optional()
    .default(''),

  // ── Intent & quality signals ────────────────────────────────────────────
  intentConfirmed: z
    .boolean({ required_error: 'intentConfirmed is required for V5 payloads' }),

  fingerprintVisitorId: z.string().max(128).optional(),
  fingerprintRequestId: z.string().max(128).optional(),

  // ── Idempotency & meta ──────────────────────────────────────────────────
  clientSubmissionId: z
    .string({ required_error: 'clientSubmissionId is required for V5 (UUID)' })
    .min(8)
    .max(64),

  // V6 conversational funnel is additive — same data contract, richer UX.
  // Accept both versions on the same ingest endpoint; client stamps the
  // version it shipped from for analytics segmentation.
  funnelVersion: z.enum(['v5', 'v6']),

  // Optional attribution stamp
  sourceCompany: z.string().optional(),

  // Optional miles (server can recompute via Mapbox)
  miles: z.number().min(0).optional().default(0),
}).strict()  // ← REJECT unknown fields (V5 must surface client/server drift)
  .refine(
    d => (d.pickupZip || d.originZip),
    { message: 'pickupZip or originZip is required', path: ['pickupZip'] }
  )
  .refine(
    d => (d.moveSize || d.homeSize),
    { message: 'moveSize or homeSize is required', path: ['moveSize'] }
  )
  .refine(
    d => {
      const o = d.pickupZip || d.originZip;
      return o !== d.destinationZip;
    },
    { message: 'Origin and destination zip cannot be the same', path: ['destinationZip'] }
  );

/**
 * Validate a V5 payload. Same return shape as the V4 validator so the future
 * ingest-v2 handler can use identical error-response code.
 */
function validateLeadPayloadV2(payload) {
  const result = LeadIngestV2Schema.safeParse(payload);
  if (result.success) {
    // Normalize: collapse pickupZip→originZip, moveSize→homeSize so downstream
    // code (which already knows V4 field names) can consume V5 results without
    // branching.
    const data = result.data;
    if (!data.originZip && data.pickupZip) data.originZip = data.pickupZip;
    if (!data.homeSize && data.moveSize)   data.homeSize  = data.moveSize;
    if (!data.customerName) {
      data.customerName = [data.firstName, data.lastName].filter(Boolean).join(' ').trim();
    }
    // Email placeholder injection — keeps legacy CRM review flow alive
    if (!data.customerEmail) {
      const phoneTail = String(data.customerPhone).replace(/\D/g, '').slice(-10);
      data.customerEmail = `noemail+${phoneTail}@moveleads.cloud`;
    }
    return { success: true, data };
  }
  const friendly = fromZodError(result.error, { prefix: 'Validation failed' });
  const errors = {};
  for (const issue of result.error.issues) {
    errors[issue.path.join('.')] = issue.message;
  }
  return { success: false, message: friendly.message, errors };
}

module.exports = {
  validateLeadPayloadV2,
  LeadIngestV2Schema,
};
