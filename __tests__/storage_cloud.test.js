import { jest } from '@jest/globals';
import { listCloudSaves } from '../scripts/storage.js';

test('listCloudSaves uses id token from anonymous sign in', async () => {
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

  await listCloudSaves();

  expect(signInAnonymously).toHaveBeenCalled();
  expect(fetchMock).toHaveBeenCalled();
  const url = fetchMock.mock.calls[0][0];
  expect(url).toContain('auth=TOKEN123');

  delete window.firebase;
});
