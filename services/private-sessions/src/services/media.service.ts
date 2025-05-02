import { getPrismaClient } from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import config from '../config.js';
import { Readable } from 'stream';
import { ValidationError } from '@speakeasy-services/common';

const prisma = getPrismaClient();

const MAX_FILE_SIZE = 2_000_000; // 2MB in bytes
const MAX_USER_DAILY_QUOTA = 20_000_000; // 20MB in bytes

export class MediaService {
  /**
   * Generates the URL for a media file
   * @param id - The media ID
   * @returns The full URL to access the media
   */
  generateMediaUrl(id: string): string {
    return `https://${config.UPCLOUD_S3_BUCKET}.${config.UPCLOUD_S3_ENDPOINT}/${id}`;
  }

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
    mimeType: string,
    size: number,
  ): Promise<{
    id: string;
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

    // Upload to S3 using Axios with streaming
    await axios.put(
      `https://${config.UPCLOUD_S3_BUCKET}.${config.UPCLOUD_S3_ENDPOINT}/${id}`,
      file,
      {
        headers: {
          'Content-Type': mimeType,
          'x-amz-acl': 'public-read',
          'Content-Length': size.toString(),
        },
        maxBodyLength: MAX_FILE_SIZE,
        maxContentLength: MAX_FILE_SIZE,
      },
    );

    // Store the file metadata in the database
    await prisma.media.create({
      data: {
        id,
        userDid,
        mimeType,
        size,
      },
    });

    return {
      id,
      mimeType,
      size,
    };
  }
}
