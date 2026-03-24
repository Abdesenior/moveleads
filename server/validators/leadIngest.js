const { z } = require('zod');
const { fromZodError } = require('zod-validation-error');

/**
 * Zod schema for incoming lead/quote requests from the marketing site.
 * Enforces strict validation: email format, 10-digit phone, valid 5-digit zip codes,
 * future move dates, and valid home size/distance enums.
 */
const LeadIngestSchema = z.object({
  customerName: z
    .string({ required_error: 'Customer name is required' })
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be at most 100 characters')
    .trim(),

  customerEmail: z
    .string({ required_error: 'Email is required' })
    .email('Must be a valid email address')
    .max(254, 'Email is too long')
    .toLowerCase()
    .trim(),

  customerPhone: z
    .string({ required_error: 'Phone number is required' })
    .transform(val => val.replace(/\D/g, ''))              // strip non-digits
    .pipe(
      z.string()
        .length(10, 'Phone number must be exactly 10 digits')
        .regex(/^\d{10}$/, 'Phone number must contain only digits')
    )
    .transform(digits => `+1${digits}`),                   // E.164 for US/CA

  originCity: z
    .string({ required_error: 'Origin city is required' })
    .min(2, 'Origin city must be at least 2 characters')
    .max(100, 'Origin city is too long')
    .trim(),

  destinationCity: z
    .string({ required_error: 'Destination city is required' })
    .min(2, 'Destination city must be at least 2 characters')
    .max(100, 'Destination city is too long')
    .trim(),

  originZip: z
    .string({ required_error: 'Origin zip code is required' })
    .regex(/^\d{5}$/, 'Origin zip must be a valid 5-digit zip code'),

  destinationZip: z
    .string({ required_error: 'Destination zip code is required' })
    .regex(/^\d{5}$/, 'Destination zip must be a valid 5-digit zip code'),

  homeSize: z.enum(
    ['Studio', '1 Bedroom', '2 Bedroom', '3 Bedroom', '4+ Bedroom'],
    { errorMap: () => ({ message: 'Home size must be one of: Studio, 1 Bedroom, 2 Bedroom, 3 Bedroom, 4+ Bedroom' }) }
  ),

  moveDate: z
    .string({ required_error: 'Move date is required' })
    .datetime({ message: 'Move date must be a valid ISO 8601 date string' })
    .refine(
      (dateStr) => new Date(dateStr) > new Date(),
      { message: 'Move date must be in the future' }
    ),

  distance: z.enum(
    ['Local', 'Long Distance'],
    { errorMap: () => ({ message: 'Distance must be either "Local" or "Long Distance"' }) }
  ),

  specialInstructions: z
    .string()
    .max(1000, 'Special instructions must be at most 1000 characters')
    .trim()
    .optional()
    .default(''),

  estimatedWeight: z
    .string()
    .max(50, 'Estimated weight is too long')
    .trim()
    .optional()
    .default(''),

  numberOfRooms: z
    .number()
    .int('Number of rooms must be a whole number')
    .min(0, 'Number of rooms cannot be negative')
    .max(50, 'Number of rooms seems too high')
    .optional()
    .default(0),
  miles: z
    .number()
    .min(0)
    .optional()
    .default(0),
  sourceCompany: z
    .string()
    .optional()
});

/**
 * Validate an incoming lead payload using Zod.
 *
 * @param {Object} payload - Raw request body
 * @returns {{ success: boolean, data?: Object, errors?: Object }}
 *
 * On success: { success: true, data: { ...parsedFields } }
 * On failure: { success: false, errors: { fieldName: "error message", ... }, message: "human-readable summary" }
 */
function validateLeadPayload(payload) {
  const result = LeadIngestSchema.safeParse(payload);

  if (result.success) {
    return { success: true, data: result.data };
  }

  // Build a friendly field → message map for the frontend
  const fieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path.join('.');
    // Only keep the first error per field
    if (!fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }

  // Also produce a human-readable summary via zod-validation-error
  const formatted = fromZodError(result.error, {
    prefix: 'Validation failed',
    prefixSeparator: ': ',
    issueSeparator: '; '
  });

  return {
    success: false,
    message: formatted.message,
    errors: fieldErrors
  };
}

module.exports = { LeadIngestSchema, validateLeadPayload };
