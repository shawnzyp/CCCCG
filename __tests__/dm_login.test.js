import { jest } from '@jest/globals';

const TEST_DM_USERNAME = 'TestDM';
const TEST_DM_PIN = '1234';
const ALT_DM_PIN = '5678';

const ORIGINAL_FETCH = global.fetch;

const defaultFetchImplementation = async (url, options = {}) => {
  const method = typeof options?.method === 'string' ? options.method.toUpperCase() : 'GET';
  return {
    ok: true,
    status: 200,
    json: async () => {
      if (method === 'GET') {
        return {};
      }
      return {};
    },
  };
};

let verifyDmCredentialMock;
let upsertDmCredentialPinMock;
let fetchMock;

beforeEach(() => {
  jest.resetModules();
  verifyDmCredentialMock = jest.fn(async (username, pin) => pin === TEST_DM_PIN);
  upsertDmCredentialPinMock = jest.fn(async (username, pin) => ({
    username,
    hash: `hash-${pin}`,
    salt: 'salt-value',
    iterations: 120000,
    keyLength: 32,
    digest: 'SHA-256',
    updatedAt: Date.now(),
  }));
  jest.unstable_mockModule('../scripts/dm-pin.js', () => ({
    verifyDmCredential: verifyDmCredentialMock,
    upsertDmCredentialPin: upsertDmCredentialPinMock,
    getDmCredential: jest.fn(async () => null),
    loadDmCredentialRecords: jest.fn(async () => new Map()),
    resetDmCredentialCache: jest.fn(),
  }));
  fetchMock = jest.fn(defaultFetchImplementation);
  global.fetch = fetchMock;
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  if (ORIGINAL_FETCH === undefined) {
    delete global.fetch;
  } else {
    global.fetch = ORIGINAL_FETCH;
  }
});

const DM_LOGIN_MODAL_MARKUP = `
  <div id=\"dm-login-modal\" class=\"hidden\" aria-hidden=\"true\">
    <div class=\"modal-frame\">
      <section class=\"modal dm-login\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"dm-login-title\">
        <button id=\"dm-login-close\" class=\"x\" aria-label=\"Close\"></button>
        <div class=\"dm-login__content\">
          <div class=\"dm-login__view\" data-login-view=\"login\">
            <h3 id=\"dm-login-title\">DM Login</h3>
            <p class=\"dm-login__description\">Enter your DM username and 4-digit PIN to access the tools.</p>
            <input id=\"dm-login-username\">
            <input id=\"dm-login-pin\">
            <div class=\"actions\">
              <button id=\"dm-login-submit\" type=\"button\"></button>
            </div>
            <div class=\"dm-login__links\">
              <button type=\"button\" data-login-action=\"start-create\"></button>
              <button type=\"button\" data-login-action=\"start-reset\"></button>
              <button type=\"button\" data-login-action=\"forgot\"></button>
            </div>
          </div>
          <div class=\"dm-login__view\" data-login-view=\"create\" hidden aria-hidden=\"true\">
            <input id=\"dm-login-new-username\">
            <input id=\"dm-login-new-pin\">
            <div class=\"actions\">
              <button id=\"dm-login-create-submit\" type=\"button\"></button>
            </div>
            <button type=\"button\" data-login-action=\"back-to-login\"></button>
          </div>
          <div class=\"dm-login__view\" data-login-view=\"reset\" hidden aria-hidden=\"true\">
            <input id=\"dm-login-reset-username\">
            <input id=\"dm-login-reset-pin\">
            <div class=\"actions\">
              <button id=\"dm-login-reset-submit\" type=\"button\"></button>
            </div>
            <button type=\"button\" data-login-action=\"back-to-login\"></button>
          </div>
          <div class=\"dm-login__view\" data-login-view=\"confirm\" hidden aria-hidden=\"true\">
            <p data-login-confirm-description></p>
            <p data-login-confirm-summary hidden></p>
            <input id=\"dm-login-confirm-pin\">
            <div class=\"actions\">
              <button id=\"dm-login-confirm-submit\" type=\"button\"></button>
            </div>
            <div class=\"dm-login__links dm-login__links--back\">
              <button type=\"button\" data-login-action=\"back-to-create\" hidden aria-hidden=\"true\"></button>
              <button type=\"button\" data-login-action=\"back-to-reset\" hidden aria-hidden=\"true\"></button>
            </div>
          </div>
          <div class=\"dm-login__view\" data-login-view=\"recovery\" hidden aria-hidden=\"true\">
            <div class=\"actions\">
              <button type=\"button\" data-login-action=\"back-to-login\"></button>
            </div>
          </div>
          <p class=\"dm-login__error\" data-login-error hidden></p>
          <p data-login-wait hidden></p>
        </div>
      </section>
      <div class=\"modal-frame__halo\" aria-hidden=\"true\"></div>
    </div>
  </div>
`;

function buildBaseDom(extra = '') {
  return `
    <button id="dm-login"></button>
    <button id="dm-tools-toggle" hidden></button>
    <div id="dm-tools-menu" hidden></div>
    <button id="dm-tools-tsomf"></button>
    <button id="dm-tools-logout"></button>
    ${DM_LOGIN_MODAL_MARKUP}
    ${extra}
  `;
}

describe('dm login', () => {
  test('DM login unlocks tools', async () => {
    document.body.innerHTML = buildBaseDom();
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
    document.getElementById('dm-login-username').value = TEST_DM_USERNAME;
    document.getElementById('dm-login-pin').value = TEST_DM_PIN;
    document.getElementById('dm-login-submit').click();
    await promise;

    expect(window.toast).toHaveBeenCalledWith('DM tools unlocked','success');
    expect(window.dismissToast).toHaveBeenCalled();
    expect(sessionStorage.getItem('dmLoggedInAt')).not.toBeNull();
    expect(sessionStorage.getItem('dmLoggedInLastActive')).toBeNull();
    const persistedRaw = localStorage.getItem('cc:dm:persistent-session');
    expect(persistedRaw).not.toBeNull();
    const persisted = JSON.parse(persistedRaw);
    expect(persisted.refreshToken).toEqual(expect.any(String));
    expect(persisted.username).toBe(TEST_DM_USERNAME);
    const putSessionCalls = fetchMock.mock.calls.filter(([url, options]) => (
      typeof url === 'string'
        && url.includes('/dm-sessions/')
        && String(options?.method || 'GET').toUpperCase() === 'PUT'
    ));
    expect(putSessionCalls.length).toBeGreaterThan(0);
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

  test('restores persistent DM session on load', async () => {
    const refreshToken = 'restore-token';
    const issuedAt = Date.now() - 10_000;
    const futureExpiry = Date.now() + 5 * 60 * 1000;
    localStorage.setItem('cc:dm:persistent-session', JSON.stringify({
      refreshToken,
      username: TEST_DM_USERNAME,
      issuedAt,
      lastValidatedAt: issuedAt,
    }));
    fetchMock.mockImplementation(async (url, options = {}) => {
      const method = String(options?.method || 'GET').toUpperCase();
      if (method === 'GET') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ username: TEST_DM_USERNAME, expiresAt: futureExpiry }),
        };
      }
      if (method === 'PATCH') {
        return { ok: true, status: 200, json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    document.body.innerHTML = buildBaseDom();
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
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(sessionStorage.getItem('dmLoggedIn')).toBe('1');
    const modal = document.getElementById('dm-login-modal');
    expect(modal.classList.contains('hidden')).toBe(true);
    const getCall = fetchMock.mock.calls.find(([url, options]) => (
      typeof url === 'string'
        && url.includes(refreshToken)
        && String(options?.method || 'GET').toUpperCase() === 'GET'
    ));
    expect(getCall).toBeTruthy();
    const patchCall = fetchMock.mock.calls.find(([url, options]) => (
      typeof url === 'string'
        && url.includes(refreshToken)
        && String(options?.method || 'GET').toUpperCase() === 'PATCH'
    ));
    expect(patchCall).toBeTruthy();
    const updatedRecord = JSON.parse(localStorage.getItem('cc:dm:persistent-session'));
    expect(updatedRecord.lastValidatedAt).toBeGreaterThanOrEqual(updatedRecord.issuedAt);
    delete window.toast;
    delete window.dismissToast;
  });

  test('logout invalidates persistent DM session token', async () => {
    document.body.innerHTML = buildBaseDom();
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

    const loginPromise = window.dmRequireLogin();
    document.getElementById('dm-login-username').value = TEST_DM_USERNAME;
    document.getElementById('dm-login-pin').value = TEST_DM_PIN;
    document.getElementById('dm-login-submit').click();
    await loginPromise;

    const persistedRecord = JSON.parse(localStorage.getItem('cc:dm:persistent-session'));
    expect(persistedRecord.refreshToken).toEqual(expect.any(String));

    fetchMock.mockClear();
    document.getElementById('dm-tools-logout').click();
    await Promise.resolve();
    await Promise.resolve();

    expect(sessionStorage.getItem('dmLoggedIn')).not.toBe('1');
    expect(localStorage.getItem('cc:dm:persistent-session')).toBeNull();
    const deleteCall = fetchMock.mock.calls.find(([url, options]) => (
      typeof url === 'string'
        && url.includes(persistedRecord.refreshToken)
        && String(options?.method || 'GET').toUpperCase() === 'DELETE'
    ));
    expect(deleteCall).toBeTruthy();
    delete window.toast;
    delete window.dismissToast;
  });

  test('expired persistent session token forces reauthentication', async () => {
    const refreshToken = 'expired-token';
    const issuedAt = Date.now() - 60_000;
    localStorage.setItem('cc:dm:persistent-session', JSON.stringify({
      refreshToken,
      username: TEST_DM_USERNAME,
      issuedAt,
      lastValidatedAt: issuedAt,
    }));
    fetchMock.mockImplementation(async (url, options = {}) => {
      const method = String(options?.method || 'GET').toUpperCase();
      if (method === 'GET') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ username: TEST_DM_USERNAME, expiresAt: issuedAt - 1 }),
        };
      }
      if (method === 'DELETE') {
        return { ok: true, status: 200, json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    document.body.innerHTML = buildBaseDom();
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
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(sessionStorage.getItem('dmLoggedIn')).not.toBe('1');
    expect(localStorage.getItem('cc:dm:persistent-session')).toBeNull();
    const deleteCall = fetchMock.mock.calls.find(([url, options]) => (
      typeof url === 'string'
        && url.includes(refreshToken)
        && String(options?.method || 'GET').toUpperCase() === 'DELETE'
    ));
    expect(deleteCall).toBeTruthy();
    const loginButton = document.getElementById('dm-login');
    expect(loginButton.hidden).toBe(false);
    delete window.toast;
    delete window.dismissToast;
  });

  test('multiple logins register independent DM session tokens', async () => {
    document.body.innerHTML = buildBaseDom();
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

    const firstLoginPromise = window.dmRequireLogin();
    document.getElementById('dm-login-username').value = TEST_DM_USERNAME;
    document.getElementById('dm-login-pin').value = TEST_DM_PIN;
    document.getElementById('dm-login-submit').click();
    await firstLoginPromise;

    const firstRecord = JSON.parse(localStorage.getItem('cc:dm:persistent-session'));
    expect(firstRecord.refreshToken).toEqual(expect.any(String));
    const firstToken = firstRecord.refreshToken;

    sessionStorage.clear();
    localStorage.clear();

    const secondLoginPromise = window.dmRequireLogin();
    const modal = document.getElementById('dm-login-modal');
    expect(modal.classList.contains('hidden')).toBe(false);
    document.getElementById('dm-login-username').value = TEST_DM_USERNAME;
    document.getElementById('dm-login-pin').value = TEST_DM_PIN;
    document.getElementById('dm-login-submit').click();
    await secondLoginPromise;

    const secondRecord = JSON.parse(localStorage.getItem('cc:dm:persistent-session'));
    expect(secondRecord.refreshToken).toEqual(expect.any(String));
    const secondToken = secondRecord.refreshToken;
    expect(secondToken).not.toBe(firstToken);

    const registeredTokens = fetchMock.mock.calls
      .filter(([url, options]) => (
        typeof url === 'string'
          && url.includes('/dm-sessions/')
          && String(options?.method || 'GET').toUpperCase() === 'PUT'
      ))
      .map(([url]) => {
        const match = /dm-sessions\/(.+)\.json/.exec(url);
        return match ? match[1] : url;
      });
    expect(registeredTokens).toEqual(expect.arrayContaining([firstToken, secondToken]));
    const deleteCalls = fetchMock.mock.calls.filter(([url, options]) => (
      typeof url === 'string'
        && url.includes('/dm-sessions/')
        && String(options?.method || 'GET').toUpperCase() === 'DELETE'
    ));
    expect(deleteCalls.length).toBe(0);
    delete window.toast;
    delete window.dismissToast;
  });

  test('requireLogin succeeds without device fingerprint restriction', async () => {
    document.body.innerHTML = buildBaseDom();
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
      subscribeSyncQueue: cb => {
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
    document.getElementById('dm-login-username').value = TEST_DM_USERNAME;
    document.getElementById('dm-login-pin').value = TEST_DM_PIN;
    document.getElementById('dm-login-submit').click();

    await expect(promise).resolves.toBe(true);
    expect(window.toast).not.toHaveBeenCalledWith(
      'This device is not authorized to access the DM tools.',
      'error',
    );

    delete window.toast;
    delete window.dismissToast;
  });

  test('DM login supports creating a new PIN', async () => {
    document.body.innerHTML = buildBaseDom();
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

    const modal = document.getElementById('dm-login-modal');
    const setPinEvents = [];
    modal.addEventListener('dm-login:set-pin', event => setPinEvents.push(event.detail));

    void window.dmRequireLogin();
    await Promise.resolve();

    modal.querySelector('[data-login-action="start-create"]').click();

    const createView = modal.querySelector('[data-login-view="create"]');
    expect(createView.hidden).toBe(false);

    document.getElementById('dm-login-new-username').value = TEST_DM_USERNAME;
    document.getElementById('dm-login-new-pin').value = ALT_DM_PIN;
    document.getElementById('dm-login-create-submit').click();

    const confirmView = modal.querySelector('[data-login-view="confirm"]');
    expect(confirmView.hidden).toBe(false);

    document.getElementById('dm-login-confirm-pin').value = ALT_DM_PIN;
    document.getElementById('dm-login-confirm-submit').click();
    await Promise.resolve();

    expect(setPinEvents).toEqual([
      expect.objectContaining({
        username: TEST_DM_USERNAME,
        pin: ALT_DM_PIN,
        mode: 'create',
        record: expect.objectContaining({ username: TEST_DM_USERNAME, hash: expect.any(String) }),
      }),
    ]);
    const loginView = modal.querySelector('[data-login-view="login"]');
    expect(loginView.hidden).toBe(false);
    expect(document.getElementById('dm-login-username').value).toBe(TEST_DM_USERNAME);
    expect(document.getElementById('dm-login-pin').value).toBe(ALT_DM_PIN);

    delete window.toast;
    delete window.dismissToast;
  });

  test('DM login mismatched confirmation shows error', async () => {
    document.body.innerHTML = buildBaseDom();
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

    const modal = document.getElementById('dm-login-modal');
    const setPinSpy = jest.fn();
    modal.addEventListener('dm-login:set-pin', setPinSpy);

    void window.dmRequireLogin();

    modal.querySelector('[data-login-action="start-create"]').click();
    document.getElementById('dm-login-new-username').value = TEST_DM_USERNAME;
    document.getElementById('dm-login-new-pin').value = TEST_DM_PIN;
    document.getElementById('dm-login-create-submit').click();

    document.getElementById('dm-login-confirm-pin').value = ALT_DM_PIN;
    document.getElementById('dm-login-confirm-submit').click();

    const error = modal.querySelector('[data-login-error]');
    expect(error.hidden).toBe(false);
    expect(error.textContent).toContain('PINs do not match');
    expect(setPinSpy).not.toHaveBeenCalled();
    expect(modal.querySelector('[data-login-view="confirm"]').hidden).toBe(false);
    expect(modal.querySelector('[data-login-view="login"]').hidden).toBe(true);

    delete window.toast;
    delete window.dismissToast;
  });

  test('DM reset flow updates username and PIN', async () => {
    document.body.innerHTML = buildBaseDom();
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

    const modal = document.getElementById('dm-login-modal');
    const setPinEvents = [];
    modal.addEventListener('dm-login:set-pin', event => setPinEvents.push(event.detail));

    void window.dmRequireLogin();

    const updatedUsername = `${TEST_DM_USERNAME}-Prime`;
    modal.querySelector('[data-login-action="start-reset"]').click();

    const resetView = modal.querySelector('[data-login-view="reset"]');
    expect(resetView.hidden).toBe(false);

    document.getElementById('dm-login-reset-username').value = updatedUsername;
    document.getElementById('dm-login-reset-pin').value = ALT_DM_PIN;
    document.getElementById('dm-login-reset-submit').click();

    const confirmView = modal.querySelector('[data-login-view="confirm"]');
    expect(confirmView.hidden).toBe(false);

    const backToReset = confirmView.querySelector('[data-login-action="back-to-reset"]');
    const backToCreate = confirmView.querySelector('[data-login-action="back-to-create"]');
    expect(backToReset.hidden).toBe(false);
    expect(backToCreate.hidden).toBe(true);

    const summary = modal.querySelector('[data-login-confirm-summary]');
    expect(summary.hidden).toBe(false);
    expect(summary.textContent).toContain(updatedUsername);

    document.getElementById('dm-login-confirm-pin').value = ALT_DM_PIN;
    document.getElementById('dm-login-confirm-submit').click();
    await Promise.resolve();

    expect(setPinEvents).toEqual([
      expect.objectContaining({
        username: updatedUsername,
        pin: ALT_DM_PIN,
        mode: 'reset',
        record: expect.objectContaining({ username: updatedUsername, hash: expect.any(String) }),
      }),
    ]);
    expect(document.getElementById('dm-login-username').value).toBe(updatedUsername);
    expect(document.getElementById('dm-login-pin').value).toBe(ALT_DM_PIN);

    delete window.toast;
    delete window.dismissToast;
  });

  test('DM login recovery flow is accessible', async () => {
    document.body.innerHTML = buildBaseDom();
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

    const modal = document.getElementById('dm-login-modal');
    const recoveryEvents = [];
    modal.addEventListener('dm-login:forgot-pin', event => recoveryEvents.push(event.detail));

    void window.dmRequireLogin();

    modal.querySelector('[data-login-action="forgot"]').click();

    const recoveryView = modal.querySelector('[data-login-view="recovery"]');
    expect(recoveryView.hidden).toBe(false);
    expect(recoveryEvents).toEqual([{ view: 'recovery' }]);

    const backButton = recoveryView.querySelector('[data-login-action="back-to-login"]');
    backButton.click();

    expect(modal.querySelector('[data-login-view="login"]').hidden).toBe(false);

    delete window.toast;
    delete window.dismissToast;
  });

  test('login modal closes even if tools init fails', async () => {
    document.body.innerHTML = buildBaseDom();
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
    document.getElementById('dm-login-username').value = TEST_DM_USERNAME;
    document.getElementById('dm-login-pin').value = TEST_DM_PIN;
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
    expect(window.toast).toHaveBeenCalledWith('Unable to initialize DM tools. Please try again.', 'error');
    expect(window.dismissToast).toHaveBeenCalled();
    delete window.toast;
    delete window.dismissToast;
    delete window.initSomfDM;
  });

  test('async DM tool initialization failure is handled', async () => {
    document.body.innerHTML = buildBaseDom();
    window.toast = jest.fn();
    window.dismissToast = jest.fn();
    const rejection = new Error('async fail');
    window.initSomfDM = jest.fn(() => Promise.reject(rejection));

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
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

      const loginPromise = window.dmRequireLogin();
      document.getElementById('dm-login-username').value = TEST_DM_USERNAME;
      document.getElementById('dm-login-pin').value = TEST_DM_PIN;
      document.getElementById('dm-login-submit').click();
      await loginPromise;
      await Promise.resolve();
      await Promise.resolve();

      expect(window.initSomfDM).toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith('Failed to init DM tools', rejection);
      expect(window.toast).toHaveBeenCalledWith('Unable to initialize DM tools. Please try again.', 'error');
      expect(window.dismissToast).toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
      delete window.toast;
      delete window.dismissToast;
      delete window.initSomfDM;
    }
  });

  test('existing DM session reinitializes tools', async () => {
    document.body.innerHTML = buildBaseDom();
    document.getElementById('dm-login').hidden = true;

    const now = Date.now();
    sessionStorage.setItem('dmLoggedIn', '1');
    sessionStorage.setItem('dmLoggedInAt', String(now));
    sessionStorage.setItem('dmLoggedInLastActive', String(now));

    window.toast = jest.fn();
    window.dismissToast = jest.fn();
    window.initSomfDM = jest.fn();

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

    await window.dmRequireLogin();

    expect(window.initSomfDM).toHaveBeenCalled();
    expect(window.toast).not.toHaveBeenCalledWith('Unable to initialize DM tools. Please try again.', 'error');

    delete window.toast;
    delete window.dismissToast;
    delete window.initSomfDM;
  });

  test('falls back to prompt when modal elements missing', async () => {
    document.body.innerHTML = '';
    window.toast = jest.fn();
    const promptMock = jest
      .fn()
      .mockImplementationOnce(() => TEST_DM_USERNAME)
      .mockImplementationOnce(() => TEST_DM_PIN);
    window.prompt = promptMock;

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

    expect(window.prompt).toHaveBeenCalledTimes(2);
    expect(window.toast).toHaveBeenCalledWith('DM tools unlocked','success');
    delete window.toast;
    delete window.prompt;
  });

  test('throttles DM login after repeated failures', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2023-01-01T00:00:00Z'));

    document.body.innerHTML = buildBaseDom();
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

    const lockUntil = Date.now() + 30_000;
    sessionStorage.setItem('dmLoginFailureCount', '3');
    sessionStorage.setItem('dmLoginLockUntil', String(lockUntil));

    void window.dmRequireLogin();
    await Promise.resolve();

    const username = document.getElementById('dm-login-username');
    const pin = document.getElementById('dm-login-pin');
    const submit = document.getElementById('dm-login-submit');
    const waitMessage = document.querySelector('[data-login-wait]');

    expect(submit.disabled).toBe(true);
    expect(pin.disabled).toBe(true);
    expect(waitMessage).not.toBeNull();
    expect(waitMessage.hidden).toBe(false);
    expect(waitMessage.textContent).toContain('Too many failed attempts');
    expect(window.toast).toHaveBeenLastCalledWith(expect.stringContaining('Too many failed attempts'), 'error');

    jest.useRealTimers();
    delete window.toast;
    delete window.dismissToast;
  });

  test('successful DM login clears throttle after cooldown', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2023-01-01T00:00:00Z'));

      document.body.innerHTML = `
          <button id="dm-login"></button>
          <button id="dm-tools-toggle" hidden></button>
          <div id="dm-tools-menu" hidden>
          </div>
        <button id="dm-tools-tsomf"></button>
        <button id="dm-tools-logout"></button>
        <div id="dm-login-modal" class="hidden" aria-hidden="true">
          <input id="dm-login-username">
          <input id="dm-login-pin">
          <div class="actions"><button id="dm-login-submit"></button></div>
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

    const loginPromise = window.dmRequireLogin();
    const username = document.getElementById('dm-login-username');
    const pin = document.getElementById('dm-login-pin');
    const submit = document.getElementById('dm-login-submit');

    username.value = TEST_DM_USERNAME;
    for (let i = 0; i < 3; i += 1) {
      pin.value = '0000';
      submit.click();
      await Promise.resolve();
    }

    expect(submit.disabled).toBe(true);
    expect(pin.disabled).toBe(true);

    jest.advanceTimersByTime(30_000);
    await Promise.resolve();

    expect(submit.disabled).toBe(false);
    expect(pin.disabled).toBe(false);
    const waitMessage = document.querySelector('[data-login-wait]');
    expect(waitMessage).not.toBeNull();
    expect(waitMessage.hidden).toBe(true);

    username.value = TEST_DM_USERNAME;
    pin.value = TEST_DM_PIN;
    submit.click();

    await loginPromise;

    expect(sessionStorage.getItem('dmLoginFailureCount')).toBeNull();
    expect(sessionStorage.getItem('dmLoginLockUntil')).toBeNull();
    expect(window.toast).toHaveBeenCalledWith('DM tools unlocked','success');

    jest.useRealTimers();
    delete window.toast;
    delete window.dismissToast;
  });

    test('logout clears DM session but keeps last save', async () => {
      document.body.innerHTML = `
          <button id="dm-login"></button>
          <div id="dm-tools-menu" hidden>
          <button id="dm-tools-logout"></button>
        `;
    sessionStorage.setItem('dmLoggedIn', '1');
    sessionStorage.setItem('dmLoggedInAt', String(Date.now() - 1000));
    sessionStorage.setItem('dmLoggedInLastActive', String(Date.now() - 1000));
    localStorage.setItem('last-save', 'The DM');

    const { currentCharacter } = await import('../scripts/characters.js');
    await import('../scripts/dm.js');

    expect(currentCharacter()).toBeNull();

    document.getElementById('dm-tools-logout').click();

    expect(sessionStorage.getItem('dmLoggedIn')).toBeNull();
    expect(sessionStorage.getItem('dmLoggedInAt')).toBeNull();
    expect(sessionStorage.getItem('dmLoggedInLastActive')).toBeNull();
    expect(currentCharacter()).toBeNull();
    expect(localStorage.getItem('last-save')).toBe('The DM');
  });

});
