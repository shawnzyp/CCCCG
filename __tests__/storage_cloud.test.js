import { jest } from '@jest/globals';

afterEach(() => {
  delete global.fetch;
});

test('listCloudSaves fetches from cloud without auth', async () => {
  jest.resetModules();
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(null),
  });
  global.fetch = fetchMock;

  const { listCloudSaves } = await import('../scripts/storage.js');

  await listCloudSaves();

  expect(fetchMock).toHaveBeenCalled();
  const url = fetchMock.mock.calls[0][0];
  expect(url).toBe(
    'https://ccccg-7d6b6-default-rtdb.firebaseio.com/saves.json'
  );
});

