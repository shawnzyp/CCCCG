import { jest } from '@jest/globals';

describe('character events', () => {
  test('dispatches events on save and delete', async () => {
    jest.unstable_mockModule('../scripts/storage.js', () => ({
      saveLocal: jest.fn(),
      loadLocal: jest.fn().mockRejectedValue(new Error('no')),
      listLocalSaves: jest.fn().mockReturnValue([]),
      deleteSave: jest.fn(),
      saveCloud: jest.fn(),
      loadCloud: jest.fn().mockRejectedValue(new Error('no')),
      listCloudSaves: jest.fn().mockResolvedValue([]),
      listCloudBackups: jest.fn().mockResolvedValue([]),
      loadCloudBackup: jest.fn().mockResolvedValue({}),
      deleteCloud: jest.fn()
    }));

    const { saveCharacter, deleteCharacter } = await import('../scripts/characters.js');

    const saveSpy = jest.fn();
    document.addEventListener('character-saved', saveSpy);
    await saveCharacter({}, 'Alice');
    expect(saveSpy).toHaveBeenCalled();

    const delSpy = jest.fn();
    document.addEventListener('character-deleted', delSpy);
    await deleteCharacter('Alice');
    expect(delSpy).toHaveBeenCalled();
  });
});
