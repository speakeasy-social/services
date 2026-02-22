import type { Response } from 'express';
import {
  RequestHandler,
  RequestHandlerReturn,
  ExtendedRequest,
  validateAgainstLexicon,
  authorize,
  getSessionDid,
  NotFoundError,
  ValidationError,
} from '@speakeasy-services/common';
import { uploadMediaDef, getMediaDef, deleteMediaDef } from '../lexicon/types/media.js';
import { MediaService } from '../services/media.service.js';
import { getFromS3 } from '../utils/manageS3.js';
import config from '../config.js';

const mediaService = new MediaService();

// Define method handlers with lexicon validation
const methodHandlers = {
  /**
   * Handles media file uploads with validation and processing
   *
   * This endpoint allows authenticated users to upload image files. It performs several validations:
   * - Validates the request against the lexicon definition
   * - Checks user authorization
   * - Validates content length and file size limits
   * - Ensures required session ID header is present
   * - Validates allowed image MIME types (JPEG, PNG, GIF, WEBP, AVIF)
   *
   * @param req - The extended request object containing:
   *   - body: The request body to validate against lexicon
   *   - headers: Request headers including content-type, content-length, and x-speakeasy-session-id
   *   - user: The authenticated user object containing the user's DID
   *
   * @throws {ValidationError} When:
   *   - Content-Length header is missing
   *   - File size exceeds MEDIA_SIZE_LIMIT
   *   - X-Speakeasy-Session-Id header is missing or invalid
   *   - File type is not an allowed image format
   *
   * @returns {Promise<RequestHandlerReturn>} Object containing:
   *   - body: { media: MediaMetadata } The uploaded media metadata
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
      getSessionDid(req),
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

  'social.spkeasy.media.get': async (
    req: ExtendedRequest,
    res: Response,
  ): RequestHandlerReturn => {
    validateAgainstLexicon(getMediaDef, req.query);
    const key = req.query.key as string;

    const record = await mediaService.findMediaByKey(key);
    if (!record) {
      throw new NotFoundError('Media not found');
    }
    authorize(req, 'get', 'media', record);

    const stream = await getFromS3(key);
    res.setHeader('Content-Type', record.mimeType);
    res.status(200);
    stream.pipe(res);

    await new Promise<void>((resolve, reject) => {
      stream.on('end', () => resolve());
      stream.on('error', reject);
    });

    return { body: {} };
  },

  'social.spkeasy.media.delete': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    validateAgainstLexicon(deleteMediaDef, req.body);

    authorize(req, 'delete', 'media', {
      key: req.body.key,
    });

    await mediaService.deleteMedia(req.body.key);

    return {
      body: {
        success: true,
      },
    };
  },
} as const;

// Define methods using XRPC lexicon
export const methods: Record<MethodName, { handler: RequestHandler }> = {
  'social.spkeasy.media.upload': {
    handler: methodHandlers['social.spkeasy.media.upload'],
  },
  'social.spkeasy.media.get': {
    handler: methodHandlers['social.spkeasy.media.get'],
  },
  'social.spkeasy.media.delete': {
    handler: methodHandlers['social.spkeasy.media.delete'],
  },
};

type MethodName = keyof typeof methodHandlers;
