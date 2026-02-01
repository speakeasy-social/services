import {
  AuthenticationError,
  authorize,
  ExtendedRequest,
  ForbiddenError,
  NotFoundError,
  RequestHandler,
  RequestHandlerReturn,
  ValidationError,
  validateAgainstLexicon,
} from '@speakeasy-services/common';
import {
  createTestimonialDef,
  deleteTestimonialDef,
  listTestimonialsDef,
} from '../lexicon/types/testimonials.js';
import { SupporterService } from '../services/supporter.service.js';
import { TestimonialService } from '../services/testimonial.service.js';

const testimonialService = new TestimonialService();
const supporterService = new SupporterService();

type TestimonialContent = {
  text: string;
  facets?: unknown[];
};

// Define method handlers with lexicon validation
const methodHandlers = {
  'social.spkeasy.actor.createTestimonial': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    // Validate input against lexicon
    validateAgainstLexicon(createTestimonialDef, req.body);

    const { content } = req.body as { content: TestimonialContent };

    // Validate content.text is provided and within limits
    if (!content?.text) {
      throw new ValidationError('content.text is required');
    }
    if (content.text.length > 300) {
      throw new ValidationError('content.text must be under 300 characters');
    }

    // Require authenticated user
    if (req.user?.type !== 'user') {
      throw new AuthenticationError('Authentication required');
    }
    const did = req.user.did;

    // Check authorization (user can only create testimonials for themselves)
    authorize(req, 'create', 'testimonial', { did });

    // Check if user is a supporter (business logic, separate from authorization)
    const isSupporter = await supporterService.isSupporter(did);
    if (!isSupporter) {
      throw new ForbiddenError('You must be a supporter to create a testimonial');
    }

    const testimonial = await testimonialService.createTestimonial(did, content);

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
        testimonials: result.testimonials.map((t) => ({
          id: t.id,
          did: t.did,
          content: t.content,
          createdAt: t.createdAt.toISOString(),
        })),
        cursor: result.cursor,
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

  'social.spkeasy.actor.checkSupporter': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    // Require authenticated user
    if (req.user?.type !== 'user') {
      throw new AuthenticationError('Authentication required');
    }
    const did = req.user.did;

    // Authorize - user can only check their own supporter status
    authorize(req, 'get', 'supporter', { did });

    const isSupporter = await supporterService.isSupporter(did);
    const contributions = await supporterService.getContributions(did);

    return {
      body: {
        isSupporter,
        contributions,
      },
    };
  },
} as const;

// Define methods using XRPC lexicon
export const methods: Record<MethodName, { handler: RequestHandler }> = {
  'social.spkeasy.actor.createTestimonial': {
    handler: methodHandlers['social.spkeasy.actor.createTestimonial'],
  },
  'social.spkeasy.actor.listTestimonials': {
    handler: methodHandlers['social.spkeasy.actor.listTestimonials'],
  },
  'social.spkeasy.actor.deleteTestimonial': {
    handler: methodHandlers['social.spkeasy.actor.deleteTestimonial'],
  },
  'social.spkeasy.actor.checkSupporter': {
    handler: methodHandlers['social.spkeasy.actor.checkSupporter'],
  },
};

type MethodName = keyof typeof methodHandlers;
