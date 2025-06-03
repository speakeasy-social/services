import { SessionKey } from '@prisma/client';

export function toSessionKeyView(sessionKey: SessionKey) {
  return {
    recipientDid: sessionKey.recipientDid,
    encryptedSessionKey: sessionKey.encryptedSessionKey,
  };
}
