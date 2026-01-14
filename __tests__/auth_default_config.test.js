import { jest } from '@jest/globals';

jest.unstable_mockModule('../scripts/notifications.js', () => ({
  toast: jest.fn(),
  dismissToast: jest.fn(),
}));

describe('auth default config', () => {
  it('initializes without window firebase config', async () => {
    delete window.__CCCG_FIREBASE_CONFIG__;
    const toastMock = jest.fn();
    window.toast = toastMock;
    const { initFirebaseAuth, __test__ } = await import('../scripts/auth.js');
    __test__.setForceDefaultConfigForTest(true);
    await expect(initFirebaseAuth()).rejects.toThrow('Firebase configuration missing');
    expect(toastMock).toHaveBeenCalledWith(
      'Firebase authentication is not configured for this deployment.',
      'error'
    );
    __test__.setForceDefaultConfigForTest(false);
  });
});
