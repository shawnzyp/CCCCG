import { jest } from '@jest/globals';

describe('autosave controller', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('rejected autosave keeps dirty flag set', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const {
      initializeAutosaveController,
      markAutoSaveDirty,
      performScheduledAutoSave,
      getAutoSaveState,
      clearScheduledAutoSave,
    } = await import('../scripts/autosave-controller.js');

    const saveAutoBackup = jest.fn().mockRejectedValue(new Error('nope'));
    initializeAutosaveController({
      getCurrentCharacter: () => 'Hero',
      saveAutoBackup,
    });

    markAutoSaveDirty({ hp: 1 });
    await performScheduledAutoSave();

    expect(getAutoSaveState().autoSaveDirty).toBe(true);
    expect(saveAutoBackup).toHaveBeenCalledWith({ hp: 1 }, 'Hero');

    clearScheduledAutoSave();
    consoleError.mockRestore();
  });

  test('new edits during in-flight save remain queued', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const {
      initializeAutosaveController,
      markAutoSaveDirty,
      performScheduledAutoSave,
      getAutoSaveState,
      clearScheduledAutoSave,
    } = await import('../scripts/autosave-controller.js');

    let resolveSave;
    const saveAutoBackup = jest.fn(() => new Promise(resolve => { resolveSave = resolve; }));
    initializeAutosaveController({
      getCurrentCharacter: () => 'Hero',
      saveAutoBackup,
    });

    markAutoSaveDirty({ version: 1 });
    const savePromise = performScheduledAutoSave();

    markAutoSaveDirty({ version: 2 });
    resolveSave?.(123);
    await savePromise;

    const state = getAutoSaveState();
    expect(state.autoSaveDirty).toBe(true);
    expect(state.pendingAutoSaveSnapshot).toEqual({ version: 2 });

    clearScheduledAutoSave();
    consoleError.mockRestore();
  });
});
