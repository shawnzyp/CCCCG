import { jest } from '@jest/globals';
import fs from 'fs';

const keyPath = 'serviceAccountKey.json';
const hasCredentials = fs.existsSync(keyPath);
const testOrSkip = hasCredentials ? test : test.skip;

beforeAll(async () => {
  if (!hasCredentials) return;
  process.env.GOOGLE_APPLICATION_CREDENTIALS = keyPath;
  if (typeof global.fetch !== 'function') {
    global.fetch = (await import('node-fetch')).default;
  }
});

beforeEach(() => {
  localStorage.clear();
});

testOrSkip('loginPlayer retrieves credentials from Firebase', async () => {
  jest.resetModules();
  const { saveCloud, deleteCloud } = await import('../scripts/storage.js');
  const { loginPlayer, currentPlayer, logoutPlayer } = await import('../scripts/users.js');

  const name = `LoginTest${Date.now()}`;
  const record = { password: 'pw', question: 'q', answer: 'a' };

  try {
    await saveCloud('user:' + name, record);
    expect(await loginPlayer(name, 'pw')).toBe(true);
    expect(currentPlayer()).toBe(name);
  } finally {
    await deleteCloud('user:' + name);
    logoutPlayer();
  }
});

