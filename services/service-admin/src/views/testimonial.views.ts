import { createListView } from '@speakeasy-services/common';

type ContributionResponse = {
  createdAt: Date;
  contribution: string;
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
export const toTestimonialView = (testimonial: TestimonialResponse): TestimonialView => ({
  id: testimonial.id,
  did: testimonial.did,
  content: testimonial.content,
  createdAt: testimonial.createdAt.toISOString(),
  contributions: testimonial.contributions.map((c) => ({
    createdAt: c.createdAt.toISOString(),
    contribution: c.contribution,
  })),
});

/**
 * Create a list view that maps over the array
 */
export const toTestimonialListView = createListView<TestimonialResponse, TestimonialView>(
  toTestimonialView
);
