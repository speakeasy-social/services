/** Encrypted media blobs are immutable once uploaded */
export const CACHE_IMMUTABLE_PRIVATE = 'private, max-age=31536000, immutable';

/** Data that rarely changes but is behind auth (e.g. public keys) */
export const CACHE_SHORT_PRIVATE = 'private, max-age=300';

/** Public data with short TTL (e.g. testimonials) */
export const CACHE_SHORT_PUBLIC = 'public, max-age=60';
