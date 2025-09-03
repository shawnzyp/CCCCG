// Integration test using the live Firebase Realtime Database.
// Requires a service account key (`serviceAccountKey.json`) with permissions
// to read and write to the `/saves` path.

import { jest } from '@jest/globals';

beforeAll(async () => {
  if (typeof global.fetch !== 'function') {
    global.fetch = (await import('node-fetch')).default;
  }
});

test('saveCloud sends data and loadCloud retrieves it from Firebase', async () => {
  jest.resetModules();

  const { saveCloud, loadCloud, deleteCloud } = await import('../scripts/storage.js');

  const name = `Player :Test${Date.now()}`;
  const payload = { hp: 30 };

  await saveCloud(name, payload);
  const data = await loadCloud(name);

  expect(data).toEqual(payload);

  // Clean up the test data from the database.
  await deleteCloud(name);
});

