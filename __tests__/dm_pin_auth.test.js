import { TextDecoder, TextEncoder } from 'util';
import { dmUnlockWithPin, validateDmPin } from '../scripts/dm-auth.js';

const HASH_1234 = '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4';
const HASH_0000 = '9af15b336e6a9619928537df30b2e6a2376569fcf9d7e773eccede65606529a0';

function hexToArrayBuffer(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes.buffer;
}

describe('dm PIN auth', () => {
  const originalCryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const originalTextEncoder = globalThis.TextEncoder;
  const originalTextDecoder = globalThis.TextDecoder;

  beforeEach(() => {
    document.head.innerHTML = '';
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'cc-dm-pin-sha256');
    meta.setAttribute('content', HASH_1234);
    document.head.appendChild(meta);

    if (!globalThis.TextEncoder) {
      globalThis.TextEncoder = TextEncoder;
    }
    if (!globalThis.TextDecoder) {
      globalThis.TextDecoder = TextDecoder;
    }
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      writable: true,
      value: {
        subtle: {
          digest: jest.fn((algorithm, data) => {
            const decoder = new TextDecoder();
            const input = decoder.decode(new Uint8Array(data));
            const hex = input === '1234' ? HASH_1234 : HASH_0000;
            return Promise.resolve(hexToArrayBuffer(hex));
          }),
        },
      },
    });
  });

  afterEach(() => {
    document.head.innerHTML = '';
    if (originalCryptoDescriptor) {
      Object.defineProperty(globalThis, 'crypto', originalCryptoDescriptor);
    } else {
      delete globalThis.crypto;
    }
    globalThis.TextEncoder = originalTextEncoder;
    globalThis.TextDecoder = originalTextDecoder;
  });

  it('validates and normalizes PINs', () => {
    expect(validateDmPin('12a34')).toBe('1234');
    expect(validateDmPin('123')).toBe('');
    expect(validateDmPin('123456')).toBe('123456');
    expect(validateDmPin('1234567')).toBe('');
    expect(validateDmPin('12 34 56')).toBe('123456');
  });

  it('unlocks with the correct PIN hash', async () => {
    await expect(dmUnlockWithPin('1234')).resolves.toBe(true);
    await expect(dmUnlockWithPin('0000')).resolves.toBe(false);
  });
});
