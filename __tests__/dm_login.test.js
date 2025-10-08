import { jest } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
  sessionStorage.clear();
  localStorage.clear();
});

describe('dm login', () => {
  test('DM login unlocks tools', async () => {
    document.body.innerHTML = `
        <button id="dm-login"></button>
        <button id="dm-tools-toggle" hidden></button>
        <div id="dm-tools-menu" hidden></div>
        <button id="dm-tools-tsomf"></button>
        <button id="dm-tools-logout"></button>
        <div id="dm-login-modal" class="hidden" aria-hidden="true">
          <input id="dm-login-pin">
          <button id="dm-login-submit"></button>
        </div>
      `;
    window.toast = jest.fn();
    window.dismissToast = jest.fn();

    jest.unstable_mockModule('../scripts/storage.js', () => ({
      saveLocal: jest.fn(),
      loadLocal: jest.fn(async () => ({})),
      listLocalSaves: jest.fn(() => []),
      deleteSave: jest.fn(),
      saveCloud: jest.fn(),
      loadCloud: jest.fn(async () => ({})),
      listCloudSaves: jest.fn(async () => []),
      listCloudBackups: jest.fn(async () => []),
      listCloudBackupNames: jest.fn(async () => []),
      loadCloudBackup: jest.fn(async () => ({})),
      saveCloudAutosave: jest.fn(),
      listCloudAutosaves: jest.fn(async () => []),
      listCloudAutosaveNames: jest.fn(async () => []),
      loadCloudAutosave: jest.fn(async () => ({})),
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
    await import('../scripts/modal.js');
    await import('../scripts/dm.js');

    const promise = window.dmRequireLogin();
    const modal = document.getElementById('dm-login-modal');
    expect(modal.classList.contains('hidden')).toBe(false);
    expect(modal.style.display).toBe('flex');
    document.getElementById('dm-login-pin').value = '123123';
    document.getElementById('dm-login-submit').click();
    await promise;

    expect(window.toast).toHaveBeenCalledWith('DM tools unlocked','success');
    expect(window.dismissToast).toHaveBeenCalled();
    expect(modal.classList.contains('hidden')).toBe(true);
    expect(modal.getAttribute('aria-hidden')).toBe('true');
    const dmBtn = document.getElementById('dm-login');
    const menu = document.getElementById('dm-tools-menu');
    const toggle = document.getElementById('dm-tools-toggle');
    expect(dmBtn.hidden).toBe(true);
    expect(dmBtn.getAttribute('aria-hidden')).toBe('true');
    expect(toggle.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(menu.hidden).toBe(true);
    toggle.click();
    expect(menu.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    delete window.toast;
    delete window.dismissToast;
  });

  test('login modal closes even if tools init fails', async () => {
    document.body.innerHTML = `
        <button id="dm-login"></button>
        <button id="dm-tools-toggle" hidden></button>
        <div id="dm-tools-menu" hidden></div>
        <button id="dm-tools-tsomf"></button>
        <button id="dm-tools-logout"></button>
        <div id="dm-login-modal" class="hidden" aria-hidden="true">
          <input id="dm-login-pin">
          <button id="dm-login-submit"></button>
        </div>
      `;
    window.toast = jest.fn();
    window.dismissToast = jest.fn();
    window.initSomfDM = jest.fn(() => { throw new Error('fail'); });

    jest.unstable_mockModule('../scripts/storage.js', () => ({
      saveLocal: jest.fn(),
      loadLocal: jest.fn(async () => ({})),
      listLocalSaves: jest.fn(() => []),
      deleteSave: jest.fn(),
      saveCloud: jest.fn(),
      loadCloud: jest.fn(async () => ({})),
      listCloudSaves: jest.fn(async () => []),
      listCloudBackups: jest.fn(async () => []),
      listCloudBackupNames: jest.fn(async () => []),
      loadCloudBackup: jest.fn(async () => ({})),
      saveCloudAutosave: jest.fn(),
      listCloudAutosaves: jest.fn(async () => []),
      listCloudAutosaveNames: jest.fn(async () => []),
      loadCloudAutosave: jest.fn(async () => ({})),
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
    await import('../scripts/modal.js');
    await import('../scripts/dm.js');

    const promise = window.dmRequireLogin();
    const modal = document.getElementById('dm-login-modal');
    document.getElementById('dm-login-pin').value = '123123';
    document.getElementById('dm-login-submit').click();
    await promise;

    expect(window.initSomfDM).toHaveBeenCalled();
    expect(modal.classList.contains('hidden')).toBe(true);
    const dmBtn = document.getElementById('dm-login');
    const menu = document.getElementById('dm-tools-menu');
    const toggle = document.getElementById('dm-tools-toggle');
    expect(dmBtn.hidden).toBe(true);
    expect(toggle.hidden).toBe(false);
    expect(menu.hidden).toBe(true);
    toggle.click();
    expect(menu.hidden).toBe(false);
    delete window.toast;
    delete window.dismissToast;
    delete window.initSomfDM;
  });

  test('falls back to prompt when modal elements missing', async () => {
    document.body.innerHTML = '';
    window.toast = jest.fn();
    window.prompt = jest.fn(() => '123123');

    jest.unstable_mockModule('../scripts/storage.js', () => ({
      saveLocal: jest.fn(),
      loadLocal: jest.fn(async () => ({})),
      listLocalSaves: jest.fn(() => []),
      deleteSave: jest.fn(),
      saveCloud: jest.fn(),
      loadCloud: jest.fn(async () => ({})),
      listCloudSaves: jest.fn(async () => []),
      listCloudBackups: jest.fn(async () => []),
      listCloudBackupNames: jest.fn(async () => []),
      loadCloudBackup: jest.fn(async () => ({})),
      saveCloudAutosave: jest.fn(),
      listCloudAutosaves: jest.fn(async () => []),
      listCloudAutosaveNames: jest.fn(async () => []),
      loadCloudAutosave: jest.fn(async () => ({})),
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

    await import('../scripts/dm.js');

    await window.dmRequireLogin();

    expect(window.prompt).toHaveBeenCalled();
    expect(window.toast).toHaveBeenCalledWith('DM tools unlocked','success');
    delete window.toast;
    delete window.prompt;
  });

  test('logout clears DM session but keeps last save', async () => {
    document.body.innerHTML = `
        <button id="dm-login"></button>
        <div id="dm-tools-menu" hidden></div>
        <button id="dm-tools-logout"></button>
      `;
    sessionStorage.setItem('dmLoggedIn', '1');
    localStorage.setItem('last-save', 'The DM');

    const { currentCharacter } = await import('../scripts/characters.js');
    await import('../scripts/dm.js');

    expect(currentCharacter()).toBeNull();

    document.getElementById('dm-tools-logout').click();

    expect(sessionStorage.getItem('dmLoggedIn')).toBeNull();
    expect(currentCharacter()).toBeNull();
    expect(localStorage.getItem('last-save')).toBe('The DM');
  });
});
