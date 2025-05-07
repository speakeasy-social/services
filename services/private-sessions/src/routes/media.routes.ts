import {
  RequestHandler,
  RequestHandlerReturn,
  ExtendedRequest,
  validateAgainstLexicon,
  authorize,
  User,
} from '@speakeasy-services/common';
import { uploadMediaDef } from '../lexicon/types/media.js';
import { MediaService } from '../services/media.service.js';
import { ValidationError } from '@atproto/lexicon';
import config from '../config.js';

const mediaService = new MediaService();

// Define method handlers with lexicon validation
const methodHandlers = {
  /**
   * Uploads a media file
   * @param req - The request containing the file to upload
   * @returns Promise containing the media metadata
   */
  'social.spkeasy.media.upload': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    // Validate input against lexicon
    validateAgainstLexicon(uploadMediaDef, req.body);

    authorize(req, 'create', 'media');

    const mimeType = req.headers['content-type'] || 'application/octet-stream';

    // Validate content length
    const contentLength = parseInt(req.headers['content-length'] || '0');
    if (!contentLength) {
      throw new ValidationError('Content-Length header is required');
    }
    if (contentLength > config.MEDIA_SIZE_LIMIT) {
      throw new ValidationError(
        `File size must be less than ${config.MEDIA_SIZE_LIMIT / 1_000_000}MB`,
      );
    }

    if (
      !req.headers['x-speakeasy-session-id'] ||
      Array.isArray(req.headers['x-speakeasy-session-id'])
    ) {
      throw new ValidationError(
        'X-Speakeasy-Session-Id header must be set exactly once',
      );
    }
    const sessionId = req.headers['x-speakeasy-session-id'];

    // Restrict mime types to images
    const allowedImageTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/avif',
    ];

    if (!allowedImageTypes.includes(mimeType)) {
      throw new ValidationError(
        'Only image files are allowed. Supported formats: JPEG, PNG, GIF, WEBP, AVIF',
      );
    }

    const result = await mediaService.uploadMedia(
      (req.user as User).did!,
      req,
      sessionId,
      mimeType,
      contentLength,
    );

    return {
      body: {
        media: result,
      },
    };
  },
} as const;

// Define methods using XRPC lexicon
export const methods: Record<MethodName, { handler: RequestHandler }> = {
  'social.spkeasy.media.upload': {
    handler: methodHandlers['social.spkeasy.media.upload'],
  },
};

type MethodName = keyof typeof methodHandlers;
