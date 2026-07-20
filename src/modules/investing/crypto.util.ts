import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// AES-256-GCM for exchange API keys at rest. Format: "iv:tag:ciphertext", each part base64.
// GCM authenticates the ciphertext, so a tampered or wrongly-keyed value fails loudly on decrypt
// instead of silently producing garbage credentials.

const IV_LENGTH = 12; // GCM standard nonce size

export function encryptSecret(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSecret(payload: string, keyHex: string): string {
  const [iv, tag, data] = payload.split(':');
  if (!iv || !tag || !data) throw new Error('Malformed encrypted payload');
  const key = Buffer.from(keyHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString(
    'utf8',
  );
}
