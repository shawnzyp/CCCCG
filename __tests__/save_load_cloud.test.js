// Integration test using the live Firebase Realtime Database.
// Requires a service account key (`serviceAccountKey.json`) with permissions
// to read and write to the `/saves` path.

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

testOrSkip('saveCloud sends data and loadCloud retrieves it from Firebase', async () => {
  jest.resetModules();

  const { saveCloud, loadCloud, deleteCloud } = await import('../scripts/storage.js');

  const name = `Player :Test${Date.now()}`;
  const payload = { hp: 30 };

  try {
    await saveCloud(name, payload);
    const data = await loadCloud(name);

    expect(data).toEqual(payload);

    // Clean up the test data from the database.
    await deleteCloud(name);
  } catch (e) {
    if (e?.code === 'ENETUNREACH') {
      console.warn('Skipping cloud save/load test due to network unavailability:', e.message);
      return;
    }
    throw e;
  }
});

