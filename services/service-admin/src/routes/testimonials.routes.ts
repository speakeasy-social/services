import {
  authorize,
  ExtendedRequest,
  getSessionDid,
  RequestHandler,
  RequestHandlerReturn,
  validateAgainstLexicon
} from '@speakeasy-services/common';
import {
  createTestimonialDef,
} from '../lexicon/types/testimonials.js';
import { TestimonialService } from '../services/testimonial.service.js';

const testimonialService = new TestimonialService();

// Define method handlers with lexicon validation
const methodHandlers = {
  'social.spkeasy.actor.createTestimonial': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    const did = getSessionDid(req);
    authorize(req, 'create', 'testimonial', { userDid: did });

    // Validate input against lexicon
    validateAgainstLexicon(createTestimonialDef, req.body);

    const { message } = req.query;
    const result = await testimonialService.createTestimonial(did as string, message as string);

    return {
      body: {
        status: 'success',
        clientSecret: result,
      },
    };
  },
} as const;

// Define methods using XRPC lexicon
export const methods: Record<MethodName, { handler: RequestHandler }> = {
  'social.spkeasy.actor.createTestimonial': {
    handler: methodHandlers['social.spkeasy.actor.createTestimonial'],
  },
};

type MethodName = keyof typeof methodHandlers;
