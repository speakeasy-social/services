/**
 * Encodes a Uint8Array to a URL-safe base64 string
 * @param data The data to encode
 * @returns URL-safe base64 string
 */
export function encodeUrlSafeBase64(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\//g, '_')
    .replace(/\+/g, '-')
    .replace(/[=]+$/, '');
}

/**
 * Decodes a URL-safe base64 string to a Uint8Array
 * @param encoded The URL-safe base64 string to decode
 * @returns Uint8Array containing the decoded data
 */
export function decodeUrlSafeBase64(encoded: string): Uint8Array {
  // Add back padding
  const padded = encoded.padEnd(
    encoded.length + ((4 - (encoded.length % 4)) % 4),
    '=',
  );

  // Convert URL-safe characters back to standard base64
  const standardBase64 = padded.replace(/_/g, '/').replace(/-/g, '+');

  // Decode and convert to Uint8Array
  const binary = atob(standardBase64);
  return new Uint8Array(binary.length).map((_, i) => binary.charCodeAt(i));
}
