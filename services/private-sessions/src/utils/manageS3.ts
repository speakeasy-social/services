import { createHmac, createHash } from 'crypto';
import { Readable } from 'stream';

import axios from 'axios';

import config from '../config.js';

const MAX_FILE_SIZE = 2_000_000; // 2MB in bytes

/**
 * Generates the URL for a media file
 * @param id - The media ID
 * @returns The full URL to access the media
 */
function generateMediaUrl(id: string): string {
  if (config.MEDIA_S3_ENDPOINT.includes('localhost')) {
    // For localstack, use the direct endpoint format with port
    return `http://${config.MEDIA_S3_ENDPOINT}/${config.MEDIA_S3_BUCKET}/${id}`;
  } else {
    // For production services, use virtual hosted-style access
    return `https://${config.MEDIA_S3_BUCKET}.${config.MEDIA_S3_ENDPOINT}/${id}`;
  }
}

/**
 * Creates a Signature V4 for AWS S3 authentication
 */
function getSignatureV4Headers(
  method: string,
  bucket: string,
  endpoint: string,
  region: string,
  objectKey: string,
  contentType: string,
  contentLength: string,
) {
  const accessKey = config.MEDIA_S3_ACCESS_KEY;
  const secretKey = config.MEDIA_S3_SECRET_KEY;

  const date = new Date();
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.substring(0, 8);

  // Create canonical request
  const canonicalUri = `/${objectKey}`;
  const canonicalQueryString = '';
  const canonicalHeaders =
    `content-length:${contentLength}\n` +
    `content-type:${contentType}\n` +
    `host:${bucket}.${endpoint}\n` +
    `x-amz-content-sha256:UNSIGNED-PAYLOAD\n` +
    `x-amz-date:${amzDate}\n`;

  const signedHeaders =
    'content-length;content-type;host;x-amz-content-sha256;x-amz-date';
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  // Create string to sign
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${createHash('sha256').update(canonicalRequest).digest('hex')}`;

  // Calculate signature
  const kDate = createHmac('sha256', `AWS4${secretKey}`)
    .update(dateStamp)
    .digest();
  const kRegion = createHmac('sha256', kDate).update(region).digest();
  const kService = createHmac('sha256', kRegion).update('s3').digest();
  const kSigning = createHmac('sha256', kService)
    .update('aws4_request')
    .digest();
  const signature = createHmac('sha256', kSigning)
    .update(stringToSign)
    .digest('hex');

  // Create authorization header
  const authorizationHeader =
    `${algorithm} ` +
    `Credential=${accessKey}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, ` +
    `Signature=${signature}`;

  return {
    'Content-Type': contentType,
    'Content-Length': contentLength,
    'X-Amz-Date': amzDate,
    'X-Amz-Content-SHA256': 'UNSIGNED-PAYLOAD',
    Authorization: authorizationHeader,
    'x-amz-acl': 'public-read',
  };
}

export async function uploadToS3(
  file: Readable,
  mimeType: string,
  size: number,
  path: string,
) {
  // Get S3 authentication headers
  const authHeaders = getSignatureV4Headers(
    'PUT',
    config.MEDIA_S3_BUCKET,
    config.MEDIA_S3_ENDPOINT,
    config.MEDIA_S3_REGION,
    path,
    mimeType,
    size.toString(),
  );

  let url;
  if (config.MEDIA_S3_ENDPOINT.includes('localhost')) {
    // For localstack, use the direct endpoint format with port
    url = `http://${config.MEDIA_S3_ENDPOINT}/${config.MEDIA_S3_BUCKET}/${path}`;
  } else {
    // For production services, use virtual hosted-style access
    url = `https://${config.MEDIA_S3_BUCKET}.${config.MEDIA_S3_ENDPOINT}/${path}`;
  }

  // Upload to S3 using Axios with streaming and authentication
  return await axios.put(url, file, {
    headers: authHeaders,
    maxBodyLength: MAX_FILE_SIZE,
    maxContentLength: MAX_FILE_SIZE,
  });
}
