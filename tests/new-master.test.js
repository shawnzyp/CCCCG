import { jest } from '@jest/globals';

function createBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

describe('DM credential hashing fallbacks', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('pbkdf2 fallback uses Node-compatible digest identifiers', async () => {
    jest.resetModules();

    const originalCrypto = globalThis.crypto;
    const restoreCrypto = () => {
      if (originalCrypto !== undefined) {
        globalThis.crypto = originalCrypto;
      } else {
        delete globalThis.crypto;
      }
    };

    try {
      delete globalThis.crypto;
    } catch (error) {
      globalThis.crypto = undefined;
    }

    const derivedBuffer = Buffer.alloc(16, 7);
    const pbkdf2Sync = jest.fn(() => derivedBuffer);
    const randomBytes = jest.fn(length => Buffer.alloc(length, 1));

    jest.unstable_mockModule('node:crypto', () => ({
      __esModule: true,
      default: {
        pbkdf2Sync,
        randomBytes,
        webcrypto: {},
      },
      pbkdf2Sync,
      randomBytes,
      webcrypto: {},
    }));

    try {
      const { deriveDmPinHash } = await import('../scripts/dm-pin.js');

      const salt = createBase64('saltysalt');
      const hash = await deriveDmPinHash('1234', {
        salt,
        iterations: 5,
        keyLength: 16,
        digest: 'SHA-256',
      });

      expect(pbkdf2Sync).toHaveBeenCalledWith(
        '1234',
        expect.any(Buffer),
        5,
        16,
        'sha256',
      );
      expect(hash).toBe(derivedBuffer.toString('base64'));
    } finally {
      restoreCrypto();
    }
  });
});
