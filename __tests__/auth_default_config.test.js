import { jest } from '@jest/globals';

jest.unstable_mockModule('../scripts/notifications.js', () => ({
  toast: jest.fn(),
  dismissToast: jest.fn(),
}));

describe('auth default config', () => {
  it('initializes without window firebase config', async () => {
    delete window.__CCCG_FIREBASE_CONFIG__;
    const { initFirebaseAuth } = await import('../scripts/auth.js');
    await expect(initFirebaseAuth()).resolves.toBeDefined();
  });
});
