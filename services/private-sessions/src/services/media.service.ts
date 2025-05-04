import { getPrismaClient } from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';

import { ValidationError } from '@speakeasy-services/common';
import { uploadToS3 } from '../utils/manageS3.js';

const prisma = getPrismaClient();

const MAX_USER_DAILY_QUOTA = 20_000_000; // 20MB in bytes

export class MediaService {
  /**
   * Uploads a media file and stores its metadata
   * @param file - The file to upload
   * @param mimeType - The MIME type of the file
   * @param size - The size of the file in bytes
   * @returns Promise containing the media metadata
   */
  async uploadMedia(
    userDid: string,
    file: Readable,
    sessionId: string,
    mimeType: string,
    size: number,
  ): Promise<{
    key: string;
    mimeType: string;
    size: number;
  }> {
    // Check the user's media usage in the last 24 hours
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const userMediaUsage = await prisma.media.aggregate({
      where: {
        userDid,
        createdAt: {
          gte: oneDayAgo,
        },
      },
      _sum: {
        size: true,
      },
    });

    const currentUsage = userMediaUsage._sum.size || 0;
    const totalWithNewFile = currentUsage + size;

    if (totalWithNewFile > MAX_USER_DAILY_QUOTA) {
      throw new ValidationError(
        `Daily upload limit of ${MAX_USER_DAILY_QUOTA / 1_000_000}MB exceeded`,
      );
    }

    const id = uuidv4();

    // Prefix the path with the sessionId, that way we can
    // restrict access to media by sessionId
    const key = `${sessionId}/${id}`;

    await uploadToS3(file, mimeType, size, key);

    // Store the file metadata in the database
    await prisma.media.create({
      data: {
        id,
        key,
        userDid,
        mimeType,
        size,
      },
    });

    return {
      key,
      mimeType,
      size,
    };
  }
}
