import { decryptSecret, encryptSecret } from './crypto.util';

const KEY = 'a'.repeat(64); // 32 bytes hex
const OTHER_KEY = 'b'.repeat(64);

describe('crypto.util', () => {
  it('round-trips a secret', () => {
    const encrypted = encryptSecret('my-api-secret', KEY);
    expect(encrypted).not.toContain('my-api-secret');
    expect(decryptSecret(encrypted, KEY)).toBe('my-api-secret');
  });

  it('uses a fresh IV every time (same input → different ciphertext)', () => {
    expect(encryptSecret('x', KEY)).not.toBe(encryptSecret('x', KEY));
  });

  it('fails loudly on a wrong key', () => {
    const encrypted = encryptSecret('secret', KEY);
    expect(() => decryptSecret(encrypted, OTHER_KEY)).toThrow();
  });

  it('fails loudly on tampered ciphertext', () => {
    const [iv, tag, data] = encryptSecret('secret', KEY).split(':');
    const tampered = Buffer.from(data, 'base64');
    tampered[0] ^= 0xff;
    expect(() => decryptSecret(`${iv}:${tag}:${tampered.toString('base64')}`, KEY)).toThrow();
  });

  it('rejects a malformed payload', () => {
    expect(() => decryptSecret('not-encrypted', KEY)).toThrow('Malformed encrypted payload');
  });
});
