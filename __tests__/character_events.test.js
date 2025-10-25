import { jest } from '@jest/globals';
import { subscribe } from '../scripts/event-bus.js';

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
      listCloudBackupNames: jest.fn().mockResolvedValue([]),
      loadCloudBackup: jest.fn().mockResolvedValue({}),
      saveCloudAutosave: jest.fn(),
      listCloudAutosaves: jest.fn().mockResolvedValue([]),
      listCloudAutosaveNames: jest.fn().mockResolvedValue([]),
      loadCloudAutosave: jest.fn().mockResolvedValue({}),
      deleteCloud: jest.fn(),
      appendCampaignLogEntry: jest.fn().mockResolvedValue({ id: 'test', t: Date.now(), name: '', text: '' }),
      deleteCampaignLogEntry: jest.fn().mockResolvedValue(),
      fetchCampaignLogEntries: jest.fn().mockResolvedValue([]),
      subscribeCampaignLog: () => null,
      beginQueuedSyncFlush: () => {},
      getLastSyncStatus: () => 'idle',
      subscribeSyncStatus: () => () => {},
      getQueuedCloudSaves: async () => [],
      clearQueuedCloudSaves: async () => true,
      subscribeSyncErrors: () => () => {},
      subscribeSyncActivity: () => () => {},
      subscribeSyncQueue: (cb) => {
        if (typeof cb === 'function') {
          try { cb(); } catch {}
        }
        return () => {};
      },
      getLastSyncActivity: () => null,
    }));

    const { saveCharacter, deleteCharacter } = await import('../scripts/characters.js');

    const saveSpy = jest.fn();
    const unsubscribeSave = subscribe('character-saved', saveSpy);
    await saveCharacter({}, 'Alice');
    expect(saveSpy).toHaveBeenCalled();

    const delSpy = jest.fn();
    const unsubscribeDelete = subscribe('character-deleted', delSpy);
    await deleteCharacter('Alice');
    expect(delSpy).toHaveBeenCalled();

    unsubscribeSave();
    unsubscribeDelete();
  });
});
