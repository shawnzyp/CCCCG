import { jest } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
  sessionStorage.clear();
});

describe('dm login', () => {
  test('loading DM character unlocks tools', async () => {
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

    const promise = loadCharacter('DM');
    expect(document.getElementById('dm-login-modal').classList.contains('hidden')).toBe(false);
    document.getElementById('dm-login-pin').value = '1231';
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
});
