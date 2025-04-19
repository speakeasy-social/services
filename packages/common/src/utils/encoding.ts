/**
 * Converts a Uint8Array to SafeText (URL-safe Base64)
 *
 * Used to turn keys and encrypted content into strings that are safe
 * for transport and storage
 *
 * @param {Uint8Array} buf - The input byte array.
 * @returns {string} The SafeText (URL-safe Base64) representation of the input.
 */
export const safeBtoa = (buf: Uint8Array): string =>
  btoa(String.fromCharCode(...buf))
    // Replace / & + with _ & -
    .replace(/\//g, '_')
    .replace(/\+/g, '-')
    // Remove trailing '=' padding
    .replace(/[=]+$/, '');

/**
 * Converts SafeText (URL-safe Base64) to a Uint8Array.
 * @param {string} str - The SafeText input string.
 * @returns {Uint8Array} The decoded byte array.
 */
export const safeAtob = (str: string): Uint8Array => {
  const base64 = str
    // Replace _ & - with / & +
    .replace(/_/g, '/')
    .replace(/-/g, '+')
    // Add '=' padding if necessary
    .padEnd(str.length + ((4 - (str.length % 4)) % 4), '=');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
};
