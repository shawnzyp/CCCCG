import { jest } from '@jest/globals';

afterEach(() => {
  delete global.fetch;
  delete window.firebase;
});

test('listCloudSaves uses id token from anonymous sign in', async () => {
  jest.resetModules();
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(null),
  });
  global.fetch = fetchMock;
  const getIdToken = jest.fn().mockResolvedValue('TOKEN123');
  const signInAnonymously = jest.fn().mockResolvedValue({ user: { getIdToken } });
  const auth = { currentUser: null, signInAnonymously };
  window.firebase = { auth: () => auth };

  const { listCloudSaves } = await import('../scripts/storage.js');

  await listCloudSaves();

  expect(signInAnonymously).toHaveBeenCalled();
  expect(fetchMock).toHaveBeenCalled();
  const url = fetchMock.mock.calls[0][0];
  expect(url).toContain('auth=TOKEN123');
});

test('listCloudSaves skips invalid getIdToken', async () => {
  jest.resetModules();
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(null),
  });
  global.fetch = fetchMock;
  const signInAnonymously = jest.fn().mockResolvedValue({ user: { getIdToken: 'not-a-function' } });
  const auth = { currentUser: null, signInAnonymously };
  window.firebase = { auth: () => auth };

  const { listCloudSaves } = await import('../scripts/storage.js');

  await listCloudSaves();

  expect(signInAnonymously).toHaveBeenCalled();
  expect(fetchMock).toHaveBeenCalled();
  const url = fetchMock.mock.calls[0][0];
  expect(url).not.toContain('auth=');
});
