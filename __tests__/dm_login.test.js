import { jest } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
  sessionStorage.clear();
});

describe('dm login', () => {
  test('loading The DM character unlocks tools', async () => {
    document.body.innerHTML = `
        <button id="dm-login" hidden></button>
        <div id="dm-tools-menu" hidden></div>
        <button id="dm-tools-tsomf"></button>
        <button id="dm-tools-logout"></button>
        <div id="dm-login-modal" class="hidden" aria-hidden="true">
          <input id="dm-login-pin">
          <button id="dm-login-submit"></button>
        </div>
      `;
    window.toast = jest.fn();

    jest.unstable_mockModule('../scripts/storage.js', () => ({
      saveLocal: jest.fn(),
      loadLocal: jest.fn(async () => ({})),
      listLocalSaves: jest.fn(() => []),
      deleteSave: jest.fn(),
      saveCloud: jest.fn(),
      loadCloud: jest.fn(async () => ({})),
      listCloudSaves: jest.fn(async () => []),
      listCloudBackups: jest.fn(async () => []),
      loadCloudBackup: jest.fn(async () => ({})),
      deleteCloud: jest.fn(),
    }));

    await import('../scripts/dm.js');
    const { loadCharacter } = await import('../scripts/characters.js');

    const promise = loadCharacter('The DM');
    expect(document.getElementById('dm-login-modal').classList.contains('hidden')).toBe(false);
    document.getElementById('dm-login-pin').value = '123123';
    document.getElementById('dm-login-submit').click();
    await promise;

    expect(window.toast).toHaveBeenCalledWith('DM tools unlocked','success');
    const dmBtn = document.getElementById('dm-login');
    const menu = document.getElementById('dm-tools-menu');
    expect(dmBtn.hidden).toBe(false);
    expect(menu.hidden).toBe(true);
    dmBtn.click();
    expect(menu.hidden).toBe(false);
    delete window.toast;
  });

  test('falls back to prompt when modal elements missing for The DM', async () => {
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
      loadCloudBackup: jest.fn(async () => ({})),
      deleteCloud: jest.fn(),
    }));

    await import('../scripts/dm.js');
    const { loadCharacter } = await import('../scripts/characters.js');

    await loadCharacter('The DM');

    expect(window.prompt).toHaveBeenCalled();
    expect(window.toast).toHaveBeenCalledWith('DM tools unlocked','success');
    delete window.toast;
    delete window.prompt;
  });
});
