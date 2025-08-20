import { jest } from '@jest/globals';

jest.unstable_mockModule('../scripts/storage.js', () => ({
  saveLocal: jest.fn(),
  loadLocal: jest.fn().mockRejectedValue(new Error('No save found')),
  loadCloud: jest.fn().mockResolvedValue({ hp: 30 }),
  deleteSave: jest.fn(),
}));

const users = await import('../scripts/users.js');
const storage = await import('../scripts/storage.js');

const { registerPlayer, loginDM, loadPlayerCharacter } = users;

describe('DM cloud fallback', () => {
  beforeEach(() => {
    localStorage.clear();
    storage.loadLocal.mockRejectedValue(new Error('No save found'));
    storage.loadCloud.mockResolvedValue({ hp: 30 });
  });

  test('loads from cloud when local missing', async () => {
    registerPlayer('Eve', 'pw');
    expect(loginDM('Dragons22!')).toBe(true);
    const data = await loadPlayerCharacter('Eve');
    expect(storage.loadLocal).toHaveBeenCalledWith('player:Eve');
    expect(storage.loadCloud).toHaveBeenCalledWith('player:Eve');
    expect(data.hp).toBe(30);
  });
});
