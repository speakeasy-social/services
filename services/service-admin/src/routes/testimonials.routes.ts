import {
  authorize,
  ExtendedRequest,
  ForbiddenError,
  getSessionDid,
  NotFoundError,
  RequestHandler,
  RequestHandlerReturn,
  ValidationError,
  validateAgainstLexicon,
} from '@speakeasy-services/common';
import { CACHE_SHORT_PUBLIC } from '@speakeasy-services/service-base';
import {
  checkContributionDef,
  createTestimonialDef,
  deleteTestimonialDef,
  listTestimonialsDef,
  updateTestimonialDef,
} from '../lexicon/types/testimonials.js';
import { ContributionService } from '../services/contribution.service.js';
import { TestimonialService } from '../services/testimonial.service.js';
import { toTestimonialListView } from '../views/testimonial.views.js';

const testimonialService = new TestimonialService();
const contributionService = new ContributionService();

type TestimonialContent = {
  text: string;
  facets?: unknown[];
};

type MethodName = keyof typeof methodHandlers;

function validateTestimonialContent(content: TestimonialContent): void {
  if (!content?.text) {
    throw new ValidationError('content.text is required');
  }
  if (content.text.length > 300) {
    throw new ValidationError('content.text must be under 300 characters');
  }
}

// Define method handlers with lexicon validation
const methodHandlers = {
  'social.spkeasy.actor.createTestimonial': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    // Validate input against lexicon
    validateAgainstLexicon(createTestimonialDef, req.body);

    const { content } = req.body as { content: TestimonialContent };
    validateTestimonialContent(content);

    const did = getSessionDid(req);

    // Check authorization (user can only create testimonials for themselves)
    authorize(req, 'create', 'testimonial', { did });

    // Check if user is a contributor (business logic, separate from authorization)
    const isContributor = await contributionService.isContributor(did);
    if (!isContributor) {
      throw new ForbiddenError(
        'You must be a contributor to create a testimonial',
      );
    }

    const testimonial = await testimonialService.createTestimonial(
      did,
      content,
    );

    return {
      body: {
        id: testimonial.id,
        createdAt: testimonial.createdAt.toISOString(),
      },
    };
  },

  'social.spkeasy.actor.listTestimonials': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    // Public endpoint - authorize with public abilities
    authorize(req, 'list', 'testimonial');

    // Validate input against lexicon
    validateAgainstLexicon(listTestimonialsDef, req.query);

    const { did, limit, cursor } = req.query as {
      did?: string;
      limit?: string;
      cursor?: string;
    };

    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    const effectiveLimit = Math.min(Math.max(parsedLimit, 1), 100);

    const result = await testimonialService.listTestimonials({
      did,
      limit: effectiveLimit,
      cursor,
    });

    return {
      body: {
        testimonials: toTestimonialListView(result.testimonials),
        cursor: result.cursor,
      },
    };
  },

  'social.spkeasy.actor.updateTestimonial': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    // Validate input against lexicon
    validateAgainstLexicon(updateTestimonialDef, req.body);

    const { id, content } = req.body as {
      id: string;
      content: TestimonialContent;
    };
    validateTestimonialContent(content);

    // Fetch testimonial to check ownership
    const testimonial = await testimonialService.getTestimonial(id);
    if (!testimonial) {
      throw new NotFoundError('Testimonial not found');
    }

    // Authorize update (checks user.did matches testimonial.did)
    authorize(req, 'update', 'testimonial', { did: testimonial.did });

    const updated = await testimonialService.updateTestimonial(id, content);

    return {
      body: {
        id: updated.id,
        createdAt: updated.createdAt.toISOString(),
      },
    };
  },

  'social.spkeasy.actor.deleteTestimonial': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    // Validate input against lexicon
    validateAgainstLexicon(deleteTestimonialDef, req.body);

    const { id } = req.body as { id: string };

    // Fetch testimonial to check ownership
    const testimonial = await testimonialService.getTestimonial(id);
    if (!testimonial) {
      throw new NotFoundError('Testimonial not found');
    }

    // Authorize deletion (checks user.did matches testimonial.did)
    authorize(req, 'delete', 'testimonial', { did: testimonial.did });

    // Delete is now safe - authorization passed
    await testimonialService.deleteTestimonialById(id);

    return {
      body: {
        success: true,
      },
    };
  },

  'social.spkeasy.actor.checkContribution': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    // Validate input against lexicon (query has no params but validates structure)
    validateAgainstLexicon(checkContributionDef, req.query);

    const did = getSessionDid(req);

    // Authorize - user can only check their own contribution status
    authorize(req, 'get', 'contribution', { did });

    const isContributor = await contributionService.isContributor(did);
    const contributions = await contributionService.getContributions(did);

    return {
      body: {
        isContributor,
        contributions,
      },
    };
  },
} as const;

// Define methods using XRPC lexicon
export const methods: Record<
  MethodName,
  { handler: RequestHandler; cacheControl?: string }
> = {
  'social.spkeasy.actor.createTestimonial': {
    handler: methodHandlers['social.spkeasy.actor.createTestimonial'],
  },
  'social.spkeasy.actor.listTestimonials': {
    handler: methodHandlers['social.spkeasy.actor.listTestimonials'],
    cacheControl: CACHE_SHORT_PUBLIC,
  },
  'social.spkeasy.actor.updateTestimonial': {
    handler: methodHandlers['social.spkeasy.actor.updateTestimonial'],
  },
  'social.spkeasy.actor.deleteTestimonial': {
    handler: methodHandlers['social.spkeasy.actor.deleteTestimonial'],
  },
  'social.spkeasy.actor.checkContribution': {
    handler: methodHandlers['social.spkeasy.actor.checkContribution'],
  },
};
