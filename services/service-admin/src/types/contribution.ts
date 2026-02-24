import { z } from 'zod';

/**
 * Valid contribution types.
 * Maps to the contribution field in the contributions table.
 */
export const CONTRIBUTION_TYPES = [
  'donor',
  'contributor',
  'designer',
  'engineer',
  'testing',
] as const;

export type ContributionType = (typeof CONTRIBUTION_TYPES)[number];

/**
 * Zod schemas for contribution public data.
 * Public data is visible in API responses.
 * All fields are optional, allowing any contribution type to include feature:
 * - recognition?: string (donor)
 * - isRegularGift?: boolean (donor)
 * - feature?: string (all types - optional and applicable to any contribution type)
 */
export const ContributionPublicDataSchema = z.object({
  recognition: z.string().optional(),
  isRegularGift: z.boolean().optional(),
  feature: z.string().optional(),
});

/**
 * TypeScript type for contribution public data.
 * All fields are optional, allowing flexibility across contribution types.
 */
export type ContributionPublicData = z.infer<
  typeof ContributionPublicDataSchema
>;

/**
 * Zod schema for contribution internal data.
 * Internal data MUST NEVER be returned in API responses.
 * Only donors have internal data: { amount: number, donationId?: string }
 * Other contribution types have null internal data.
 */
export const ContributionInternalDataSchema = z.union([
  z.null(),
  z.object({
    amount: z.number(),
    donationId: z.string().optional(),
    appeal: z.string().optional(),
  }),
]);

/**
 * TypeScript type for contribution internal data.
 * null for contributor, designer, engineer, testing; or { amount, donationId?, appeal? } for donor.
 */
export type ContributionInternalData = z.infer<
  typeof ContributionInternalDataSchema
>;
