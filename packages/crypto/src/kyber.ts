import { MlKem768 } from 'crystals-kyber-js';

/**
 * Encrypts a session key using Kyber post-quantum encryption
 * @param key The session key to encrypt
 * @param publicKey The recipient's public key in base64 format
 * @returns The encrypted session key in base64 format
 */
export async function encryptSessionKey(
  key: string,
  publicKey: string,
): Promise<string> {
  // Convert base64 public key to Uint8Array
  const publicKeyBytes = Buffer.from(publicKey, 'base64');

  // Create Kyber instance
  const kyber = new MlKem768();

  // Encrypt the session key using Kyber
  const [ciphertext, sharedSecret] = await kyber.encap(publicKeyBytes);

  // Combine ciphertext and shared secret for transmission
  const combined = new Uint8Array(ciphertext.length + sharedSecret.length);
  combined.set(ciphertext);
  combined.set(sharedSecret, ciphertext.length);

  // Return as base64 string
  return Buffer.from(combined).toString('base64');
}

/**
 * Decrypts a session key using Kyber post-quantum encryption
 * @param encryptedKey The encrypted session key in base64 format
 * @param privateKey The recipient's private key in base64 format
 * @returns The decrypted session key
 */
export async function decryptSessionKey(
  encryptedKey: string,
  privateKey: string,
): Promise<string> {
  // Convert base64 inputs to Uint8Array
  const encryptedBytes = Buffer.from(encryptedKey, 'base64');
  const privateKeyBytes = Buffer.from(privateKey, 'base64');

  // Create Kyber instance
  const kyber = new MlKem768();

  // Split the combined ciphertext and shared secret
  const ciphertext = encryptedBytes.slice(0, 1088); // Kyber768 ciphertext size
  const sharedSecret = encryptedBytes.slice(1088);

  // Decrypt using Kyber
  const decrypted = await kyber.decap(ciphertext, privateKeyBytes);

  // Return the decrypted session key
  return Buffer.from(decrypted).toString('utf8');
}
