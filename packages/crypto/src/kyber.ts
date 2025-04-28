import { MlKem768 } from 'mlkem';
import { ErrorWithDetails, safeAtob } from '@speakeasy-services/common';

/**
 * Encrypts a session DEK using ML-KEM
 * @param {string} dek - The Data Encryption Key to encrypt (SafeText format).
 * @param {string} recipientPublicKey - The recipient's public key (SafeText format).
 * @returns {Promise<string>} The encrypted DEK in SafeText format.
 */
async function encryptDEK(
  dek: Uint8Array,
  recipientPublicKey: string,
): Promise<Uint8Array> {
  // Decode SafeText inputs into Uint8Array for cryptographic operations
  const dekBytes = dek;
  const pubKeyBytes = safeAtob(recipientPublicKey);

  const mlkem = new MlKem768();
  const [ciphertext, sharedSecret] = await mlkem.encap(pubKeyBytes);

  // Generate salt and IV for HKDF and AES-GCM respectively
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Derive AES and HMAC keys using HKDF from the shared secret
  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    sharedSecret,
    { name: 'HKDF' },
    false,
    ['deriveBits'],
  );

  const derivedKeys = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: new TextEncoder().encode('ML-KEM-768-AES-HMAC'),
    },
    hkdfKey,
    512, // Derive both AES-GCM (256 bits) and HMAC-SHA256 (256 bits) keys
  );

  // Split derived keys into AES-GCM key and HMAC key
  const [aesKey, hmacKey] = await Promise.all([
    crypto.subtle.importKey(
      'raw',
      new Uint8Array(derivedKeys.slice(0, 32)),
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt'],
    ),
    crypto.subtle.importKey(
      'raw',
      new Uint8Array(derivedKeys.slice(32, 64)),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    ),
  ]);

  // Encrypt the DEK using AES-GCM with the derived AES key and IV
  const encryptedDek = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    dekBytes,
  );

  // Authenticate ciphertext + IV using HMAC-SHA256 to prevent tampering
  const authData = new Uint8Array([...ciphertext, ...iv]);
  const hmac = await crypto.subtle.sign('HMAC', hmacKey, authData);

  // Package all components together with a version header for future compatibility
  const versionHeader = new TextEncoder().encode('KEMv1|');
  const packaged = new Uint8Array(
    versionHeader.length +
      salt.length +
      ciphertext.length +
      iv.length +
      hmac.byteLength +
      encryptedDek.byteLength,
  );

  let offset = 0;
  packaged.set(versionHeader, offset);
  offset += versionHeader.length;
  packaged.set(salt, offset);
  offset += salt.length;
  packaged.set(ciphertext, offset);
  offset += ciphertext.length;
  packaged.set(iv, offset);
  offset += iv.length;
  packaged.set(new Uint8Array(hmac), offset);
  offset += hmac.byteLength;
  packaged.set(new Uint8Array(encryptedDek), offset);

  return packaged;
}

/**
 * Decrypts an encrypted session DEK using ML-KEM
 * @param {string} encryptedDek - The encrypted DEK in SafeText format.
 * @param {string} recipientPrivateKey - The recipient's private key (SafeText format).
 * @returns {Promise<string>} The decrypted DEK in SafeText format.
 */
async function decryptDEK(
  encryptedDek: Uint8Array,
  recipientPrivateKey: string,
): Promise<Uint8Array> {
  // Decode private key and encrypted data from SafeText to Uint8Array format
  const privateKeyBytes = safeAtob(recipientPrivateKey);
  console.log('privateKey', recipientPrivateKey);

  const data = encryptedDek;

  console.log('latest');

  // Validate version header for compatibility checks
  const versionHeader = new TextEncoder().encode('KEMv1|');
  if (
    !data
      .slice(0, versionHeader.length)
      .every((val, idx) => val === versionHeader[idx])
  ) {
    const versionDelimiter = data.indexOf('|'.charCodeAt(0));
    const version = new TextDecoder().decode(data.slice(0, versionDelimiter));
    console.log('Invalid encrypted DEK version header:', version);
    throw new Error('Invalid version header');
  }

  let offset = versionHeader.length;
  const components = {
    salt: data.slice(offset, offset + 32),
    ciphertext: data.slice(offset + 32, offset + 32 + 1088),
    iv: data.slice(offset + 32 + 1088, offset + 32 + 1088 + 12),
    hmac: data.slice(offset + 32 + 1088 + 12, offset + 32 + 1088 + 12 + 32),
    encryptedKey: data.slice(offset + 32 + 1088 + 12 + 32),
  };

  const mlkem = new MlKem768();
  const sharedSecret = await mlkem.decap(
    components.ciphertext,
    privateKeyBytes,
  );

  console.log('sharedSecret', sharedSecret);

  // Derive AES and HMAC keys using HKDF from the shared secret and salt
  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    sharedSecret,
    { name: 'HKDF' },
    false,
    ['deriveBits'],
  );

  const derivedKeys = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: components.salt,
      info: new TextEncoder().encode('ML-KEM-768-AES-HMAC'),
    },
    hkdfKey,
    512,
  );

  // Split derived keys into AES-GCM key and HMAC key
  const [aesKey, hmacKey] = await Promise.all([
    crypto.subtle.importKey(
      'raw',
      new Uint8Array(derivedKeys.slice(0, 32)),
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    ),
    crypto.subtle.importKey(
      'raw',
      new Uint8Array(derivedKeys.slice(32, 64)),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    ),
  ]);

  console.log('hmacKey', hmacKey);

  // Verify authentication tag using HMAC-SHA256 to ensure integrity of ciphertext + IV
  const authData = new Uint8Array([...components.ciphertext, ...components.iv]);
  const valid = await crypto.subtle.verify(
    'HMAC',
    hmacKey,
    components.hmac,
    authData,
  );

  if (!valid) throw new Error('DEK Authentication failed');

  // Decrypt the DEK using AES-GCM with the derived AES key and IV
  const decryptedDekBytes = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: components.iv },
    aesKey,
    components.encryptedKey,
  );

  // Convert decrypted DEK to SafeText format for secure handling and return it
  const safeDek = new Uint8Array(decryptedDekBytes);

  return safeDek;
}

export async function recryptDEK(
  sessionKey: {
    userKeyPairId: string;
    encryptedDek: Uint8Array;
  },
  privateKey: {
    privateKey: string;
    userKeyPairId: string;
  },
  encryptionPublicKey: string,
): Promise<Uint8Array> {
  console.log('sessionKey', sessionKey.userKeyPairId, Object.keys(sessionKey));
  console.log('privateKey', privateKey.userKeyPairId, Object.keys(privateKey));
  if (privateKey.userKeyPairId !== sessionKey.userKeyPairId) {
    throw new ErrorWithDetails(
      'InternalError',
      'Attempt to decrypt DEK with wrong private key',
      500,
      {
        expectedKeyPairId: sessionKey.userKeyPairId,
        retrievedKeyPairId: privateKey.userKeyPairId,
      },
    );
  }
  const rawDek = await decryptDEK(
    sessionKey.encryptedDek,
    privateKey.privateKey,
  );
  return encryptDEK(rawDek, encryptionPublicKey);
}
