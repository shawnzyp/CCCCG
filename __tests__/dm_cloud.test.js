import { jest } from '@jest/globals';

jest.unstable_mockModule('../scripts/storage.js', () => ({
  saveLocal: jest.fn(),
  loadLocal: jest.fn(),
  loadCloud: jest.fn(),
  saveCloud: jest.fn(),
  deleteSave: jest.fn(),
  listCloudSaves: jest.fn(),
}));

const users = await import('../scripts/users.js');
const storage = await import('../scripts/storage.js');

const { registerPlayer, loginDM, loadPlayerCharacter } = users;

describe('DM cloud loading', () => {
  beforeEach(() => {
    localStorage.clear();
    storage.loadLocal.mockReset();
    storage.loadCloud.mockReset();
    storage.saveLocal.mockReset();
  });

  test('loads from cloud before local', async () => {
    registerPlayer('Eve', 'pw');
    storage.loadCloud.mockResolvedValue({ hp: 30 });
    expect(loginDM('Dragons22!')).toBe(true);
    const data = await loadPlayerCharacter('Eve');
    expect(storage.loadCloud).toHaveBeenCalledWith('player:Eve');
    expect(storage.loadLocal).not.toHaveBeenCalled();
    expect(storage.saveLocal).toHaveBeenCalledWith('player:Eve', { hp: 30 });
    expect(data.hp).toBe(30);
  });

  test('falls back to local when cloud fails', async () => {
    registerPlayer('Eve', 'pw');
    storage.loadCloud.mockRejectedValue(new Error('No save found'));
    storage.loadLocal.mockResolvedValue({ hp: 15 });
    expect(loginDM('Dragons22!')).toBe(true);
    const data = await loadPlayerCharacter('Eve');
    expect(storage.loadCloud).toHaveBeenCalledWith('player:Eve');
    expect(storage.loadLocal).toHaveBeenCalledWith('player:Eve');
    expect(data.hp).toBe(15);
  });
});
