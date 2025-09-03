import { ReactionService } from '../services/reaction.service.js';
import {
  authorize,
  RequestHandler,
  RequestHandlerReturn,
  ExtendedRequest,
  validateAgainstLexicon,
  User,
  getSessionDid,
} from '@speakeasy-services/common';
import {
  createReactionDef,
  deleteReactionDef,
} from '../lexicon/types/reactions.js';

const reactionService = new ReactionService();

// Define method handlers with lexicon validation
const methodHandlers = {
  'social.spkeasy.reaction.createReaction': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    const did = getSessionDid(req);

    // Validate input against lexicon
    validateAgainstLexicon(createReactionDef, req.body);

    const { uri } = req.body;

    authorize(req, 'create', 'reaction', { userDid: did });

    const reaction = await reactionService.createReaction(did, uri);

    return {
      body: reaction,
    };
  },
  'social.spkeasy.reaction.deleteReaction': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    const did = getSessionDid(req);

    // Validate input against lexicon
    validateAgainstLexicon(deleteReactionDef, req.body);

    const { uri } = req.body;

    authorize(req, 'delete', 'reaction', { userDid: did });

    await reactionService.deleteReaction(did, uri);

    return {
      body: { status: 'success' },
    };
  },
} as const;

// Define methods using XRPC lexicon
export const methods: Record<MethodName, { handler: RequestHandler }> = {
  'social.spkeasy.reaction.createReaction': {
    handler: methodHandlers['social.spkeasy.reaction.createReaction'],
  },
  'social.spkeasy.reaction.deleteReaction': {
    handler: methodHandlers['social.spkeasy.reaction.deleteReaction'],
  },
};

type MethodName = keyof typeof methodHandlers;
