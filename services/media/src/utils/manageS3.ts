import { createHmac, createHash } from 'crypto';
import { Readable } from 'stream';

import axios, { AxiosError } from 'axios';

import { CACHE_IMMUTABLE_PRIVATE } from '@speakeasy-services/service-base';
import config from '../config.js';

const MAX_FILE_SIZE = 2_000_000; // 4MB in bytes

/**
 * Extracts hostname from endpoint URL
 */
function getHostnameFromEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    return url.hostname;
  } catch {
    // If it's not a valid URL, assume it's just a hostname
    return endpoint;
  }
}

/**
 * Generates the URL for a media file
 * @param id - The media ID
 * @returns The full URL to access the media
 */
function generateMediaUrl(id: string): string {
  if (config.MEDIA_S3_ENDPOINT.includes('localhost')) {
    // For localstack, use the direct endpoint format with port
    return `${config.MEDIA_S3_ENDPOINT}/${config.MEDIA_S3_BUCKET}/${id}`;
  } else {
    // For production services, use virtual hosted-style access
    const hostname = getHostnameFromEndpoint(config.MEDIA_S3_ENDPOINT);
    return `https://${hostname}.${config.MEDIA_S3_BUCKET}/${id}`;
  }
}

/**
 * Creates a Signature V4 for AWS S3 authentication
 */
function getSignatureV4Headers(
  method: string,
  endpoint: string,
  region: string,
  fullPath: string,
  contentType: string,
  contentLength: string,
) {
  const accessKey = config.MEDIA_S3_ACCESS_KEY;
  const secretKey = config.MEDIA_S3_SECRET_KEY;

  const date = new Date();
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.substring(0, 8);

  // Extract hostname from endpoint (removing protocol if present)
  const host = getHostnameFromEndpoint(endpoint);

  // Only sign content headers for requests with a body
  const hasBody = contentType !== '';

  // Create canonical request
  const canonicalUri = fullPath;
  const canonicalQueryString = '';
  const canonicalHeaders =
    (hasBody
      ? `content-length:${contentLength}\ncontent-type:${contentType}\n`
      : '') +
    `host:${host}\n` +
    `x-amz-content-sha256:UNSIGNED-PAYLOAD\n` +
    `x-amz-date:${amzDate}\n`;

  const signedHeaders =
    (hasBody ? 'content-length;content-type;' : '') +
    'host;x-amz-content-sha256;x-amz-date';
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

  const baseHeaders = {
    'X-Amz-Date': amzDate,
    'X-Amz-Content-SHA256': 'UNSIGNED-PAYLOAD',
    Authorization: authorizationHeader,
    'x-amz-acl': 'public-read',
    'Cache-Control': CACHE_IMMUTABLE_PRIVATE,
  };

  if (hasBody) {
    return {
      ...baseHeaders,
      'Content-Type': contentType,
      'Content-Length': contentLength,
    };
  }

  return baseHeaders;
}

function buildS3RequestUrl(fullPath: string): string {
  const endpoint = config.MEDIA_S3_ENDPOINT;

  // If endpoint already has a protocol, use it as-is
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return `${endpoint}${fullPath}`;
  }

  // Otherwise, add the appropriate protocol
  if (endpoint.includes('localhost')) {
    return `http://${endpoint}${fullPath}`;
  }
  return `https://${endpoint}${fullPath}`;
}

function rethrowWithS3Context(err: unknown): never {
  if (err instanceof AxiosError && err.response?.data) {
    (err as any).log = {
      s3message: err.response?.data,
    };
  }
  throw err;
}

export async function uploadToS3(
  file: Readable,
  mimeType: string,
  size: number,
  path: string,
) {
  const fullPath = `/${config.MEDIA_S3_BUCKET}/${path}`;

  // Get S3 authentication headers
  const authHeaders = getSignatureV4Headers(
    'PUT',
    config.MEDIA_S3_ENDPOINT,
    config.MEDIA_S3_REGION,
    fullPath,
    mimeType,
    size.toString(),
  );

  const url = buildS3RequestUrl(fullPath);

  try {
    // Upload to S3 using Axios with streaming and authentication
    return await axios.put(url, file, {
      headers: authHeaders,
      maxBodyLength: MAX_FILE_SIZE,
      maxContentLength: MAX_FILE_SIZE,
    });
  } catch (err: unknown) {
    rethrowWithS3Context(err);
  }
}

export async function deleteFromS3(path: string) {
  // Delete from S3
  const fullPath = `/${config.MEDIA_S3_BUCKET}/${path}`;
  const authHeaders = getSignatureV4Headers(
    'DELETE',
    config.MEDIA_S3_ENDPOINT,
    config.MEDIA_S3_REGION,
    fullPath,
    '',
    '0',
  );

  const url = buildS3RequestUrl(fullPath);

  try {
    await axios.delete(url, {
      headers: authHeaders,
    });
  } catch (err: unknown) {
    rethrowWithS3Context(err);
  }
}

/**
 * Stream a media file from S3 by path (key).
 * @param path - The S3 object key (e.g. sessionId/uuid)
 * @returns The response body as a Readable stream
 */
export async function getFromS3(path: string): Promise<Readable> {
  const fullPath = `/${config.MEDIA_S3_BUCKET}/${path}`;
  const authHeaders = getSignatureV4Headers(
    'GET',
    config.MEDIA_S3_ENDPOINT,
    config.MEDIA_S3_REGION,
    fullPath,
    '',
    '0',
  );

  const url = buildS3RequestUrl(fullPath);

  try {
    const response = await axios.get<Readable>(url, {
      responseType: 'stream',
      headers: authHeaders,
    });
    return response.data;
  } catch (err: unknown) {
    rethrowWithS3Context(err);
  }
}
