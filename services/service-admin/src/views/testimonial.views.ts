import { createListView } from '@speakeasy-services/common';
import type { ContributionPublicData } from '../types/contribution.js';

// NOTE: The Contribution model has an 'internal' field that MUST NEVER be included in API responses

type ContributionResponse = {
  createdAt: Date;
  contribution: string;
  public: ContributionPublicData | null;
};

type TestimonialResponse = {
  id: string;
  did: string;
  content: unknown;
  createdAt: Date;
  contributions: ContributionResponse[];
};

type ContributionView = {
  createdAt: string;
  contribution: string;
  public: ContributionPublicData | null;
};

export type TestimonialView = {
  id: string;
  did: string;
  content: unknown;
  createdAt: string;
  contributions: ContributionView[];
};

/**
 * Create a view that transforms a testimonial for API response
 */
export const toTestimonialView = (
  testimonial: TestimonialResponse,
): TestimonialView => ({
  id: testimonial.id,
  did: testimonial.did,
  content: testimonial.content,
  createdAt: testimonial.createdAt.toISOString(),
  contributions: testimonial.contributions.map((c) => ({
    createdAt: c.createdAt.toISOString(),
    contribution: c.contribution,
    public: c.public,
  })),
});

/**
 * Create a list view that maps over the array
 */
export const toTestimonialListView = createListView<
  TestimonialResponse,
  TestimonialView
>(toTestimonialView);
