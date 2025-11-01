import { jest } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  delete global.fetch;
});

const DM_LOGIN_MODAL_MARKUP = `
  <div id="dm-login-modal" class="hidden" aria-hidden="true">
    <div class="modal-frame">
      <section class="modal dm-login" role="dialog" aria-modal="true" aria-labelledby="dm-login-title">
        <button id="dm-login-close" class="x" aria-label="Close"></button>
        <div class="dm-login__content">
          <div class="dm-login__view" data-login-view="login">
            <h3 id="dm-login-title">DM Login</h3>
            <p class="dm-login__description">Enter your DM PIN to access the tools.</p>
            <input id="dm-login-pin">
            <div class="actions">
              <button id="dm-login-submit" type="button"></button>
            </div>
            <div class="dm-login__links">
              <button type="button" data-login-action="start-create"></button>
              <button type="button" data-login-action="forgot"></button>
            </div>
          </div>
          <div class="dm-login__view" data-login-view="create" hidden aria-hidden="true">
            <input id="dm-login-new-pin">
            <div class="actions">
              <button id="dm-login-create-submit" type="button"></button>
            </div>
            <button type="button" data-login-action="back-to-login"></button>
          </div>
          <div class="dm-login__view" data-login-view="confirm" hidden aria-hidden="true">
            <input id="dm-login-confirm-pin">
            <p data-login-error hidden></p>
            <div class="actions">
              <button id="dm-login-confirm-submit" type="button"></button>
            </div>
            <button type="button" data-login-action="back-to-create"></button>
          </div>
          <div class="dm-login__view" data-login-view="recovery" hidden aria-hidden="true">
            <div class="actions">
              <button type="button" data-login-action="back-to-login"></button>
            </div>
          </div>
          <p data-login-wait hidden></p>
        </div>
      </section>
      <div class="modal-frame__halo" aria-hidden="true"></div>
    </div>
  </div>
`;

function buildBaseDom(extra = '') {
  return `
    <button id="dm-login"></button>
    <button id="dm-tools-toggle" hidden></button>
    <div id="dm-tools-menu" hidden>
      <div id="dm-session-status" hidden></div>
      <button id="dm-session-extend" hidden></button>
    </div>
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
    document.getElementById('dm-login-pin').value = '123123';
    document.getElementById('dm-login-submit').click();
    await promise;

    expect(window.toast).toHaveBeenCalledWith('DM tools unlocked','success');
    expect(window.dismissToast).toHaveBeenCalled();
    expect(sessionStorage.getItem('dmLoggedInAt')).not.toBeNull();
    expect(sessionStorage.getItem('dmLoggedInLastActive')).not.toBeNull();
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
    document.getElementById('dm-login-pin').value = '123123';
    document.getElementById('dm-login-submit').click();

    await expect(promise).resolves.toBe(true);
    expect(window.toast).not.toHaveBeenCalledWith(
      'This device is not authorized to access the DM tools.',
      'error',
    );

    delete window.toast;
    delete window.dismissToast;
  });

  test('restores persistent session token on load', async () => {
    document.body.innerHTML = buildBaseDom();
    window.toast = jest.fn();
    window.dismissToast = jest.fn();

    const token = 'token-restore';
    const deviceId = 'device-restore';
    localStorage.setItem('cc:dm-session-token', token);
    localStorage.setItem('cc:dm-session-device', deviceId);

    const future = Date.now() + 600000;
    const sessionsUrl = 'https://ccccg-7d6b6-default-rtdb.firebaseio.com/dm-sessions/' + encodeURIComponent(token) + '.json';
    global.fetch = jest.fn((url, options) => {
      if (!options) {
        return Promise.resolve({ ok: true, json: async () => ({ deviceId, expiresAt: future }) });
      }
      if (options.method === 'PATCH') {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

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

    await window.__dmTestHooks.waitForSessionBootstrap();

    const sessionFetch = global.fetch.mock.calls.find(([url, options]) => url === sessionsUrl && options === undefined);
    expect(sessionFetch).toBeTruthy();
    expect(sessionStorage.getItem('dmLoggedIn')).toBe('1');
    await expect(window.dmRequireLogin()).resolves.toBe(true);
    expect(document.getElementById('dm-login').hidden).toBe(true);

    delete window.toast;
    delete window.dismissToast;
  });

  test('logout invalidates persistent session token', async () => {
    document.body.innerHTML = buildBaseDom();
    window.toast = jest.fn();
    window.dismissToast = jest.fn();

    const fetchMock = jest.fn((url, options) => {
      if (!options) {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      if (options.method === 'PUT') {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      if (options.method === 'PATCH') {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    global.fetch = fetchMock;

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

    const loginPromise = window.dmRequireLogin();
    document.getElementById('dm-login-pin').value = '123123';
    document.getElementById('dm-login-submit').click();
    await loginPromise;

    const storedToken = window.__dmTestHooks.getPersistentSessionToken();
    expect(typeof storedToken).toBe('string');

    const registrationCall = fetchMock.mock.calls.find(([, options]) => options?.method === 'PUT');
    expect(registrationCall).toBeTruthy();
    const registeredPayload = JSON.parse(registrationCall[1].body);
    expect(registeredPayload.revoked).toBe(false);
    expect(registeredPayload.deviceId).toBe(localStorage.getItem('cc:dm-session-device'));

    document.getElementById('dm-tools-logout').click();
    await Promise.resolve();
    await Promise.resolve();

    const revocationPayloads = fetchMock.mock.calls
      .filter(([, options]) => options?.method === 'PATCH')
      .map(([, options]) => JSON.parse(options.body));
    expect(revocationPayloads.some(payload => payload.revoked === true && payload.revokeReason === 'logout')).toBe(true);
    expect(localStorage.getItem('cc:dm-session-token')).toBeNull();

    delete window.toast;
    delete window.dismissToast;
  });

  test('revokes stored token when device id mismatches', async () => {
    document.body.innerHTML = buildBaseDom();
    window.toast = jest.fn();
    window.dismissToast = jest.fn();

    const token = 'token-mismatch';
    localStorage.setItem('cc:dm-session-token', token);
    localStorage.setItem('cc:dm-session-device', 'device-a');

    global.fetch = jest.fn((url, options) => {
      if (!options) {
        return Promise.resolve({ ok: true, json: async () => ({ deviceId: 'device-b', expiresAt: Date.now() + 600000 }) });
      }
      if (options.method === 'PATCH') {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

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

    await window.__dmTestHooks.waitForSessionBootstrap();

    expect(localStorage.getItem('cc:dm-session-token')).toBeNull();
    const revocationCalls = global.fetch.mock.calls.filter(([, options]) => options?.method === 'PATCH');
    expect(revocationCalls.length).toBeGreaterThan(0);
    expect(revocationCalls.some(([, options]) => {
      const payload = JSON.parse(options.body);
      return payload.revoked === true && payload.revokeReason === 'device-mismatch';
    })).toBe(true);
    expect(sessionStorage.getItem('dmLoggedIn')).toBeNull();
    expect(document.getElementById('dm-login').hidden).toBe(false);

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

    modal.querySelector('[data-login-action="start-create"]').click();

    const createView = modal.querySelector('[data-login-view="create"]');
    expect(createView.hidden).toBe(false);

    document.getElementById('dm-login-new-pin').value = '246810';
    document.getElementById('dm-login-create-submit').click();

    const confirmView = modal.querySelector('[data-login-view="confirm"]');
    expect(confirmView.hidden).toBe(false);

    document.getElementById('dm-login-confirm-pin').value = '246810';
    document.getElementById('dm-login-confirm-submit').click();

    expect(setPinEvents).toEqual([{ pin: '246810' }]);
    const loginView = modal.querySelector('[data-login-view="login"]');
    expect(loginView.hidden).toBe(false);
    expect(document.getElementById('dm-login-pin').value).toBe('246810');

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
    document.getElementById('dm-login-new-pin').value = '13579';
    document.getElementById('dm-login-create-submit').click();

    document.getElementById('dm-login-confirm-pin').value = '97531';
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

  test('session status hides when logged out', async () => {
    document.body.innerHTML = buildBaseDom();
    window.toast = jest.fn();
    window.dismissToast = jest.fn();
    window.dmLoginTimeoutMs = 60000;

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
    document.getElementById('dm-login-pin').value = '123123';
    document.getElementById('dm-login-submit').click();
    await loginPromise;

    const status = document.getElementById('dm-session-status');
    const extend = document.getElementById('dm-session-extend');
    expect(status.hidden).toBe(false);
    expect(status.textContent).toMatch(/Session expires in/);
    expect(extend.hidden).toBe(false);

    document.getElementById('dm-tools-logout').click();

    expect(status.hidden).toBe(true);
    expect(extend.hidden).toBe(true);

    delete window.toast;
    delete window.dismissToast;
    delete window.dmLoginTimeoutMs;
  });

  test('session warning toast triggers near expiration and resets after extend', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2020-01-01T00:00:00Z'));

    document.body.innerHTML = buildBaseDom();
    window.toast = jest.fn();
    window.dismissToast = jest.fn();
    window.dmLoginTimeoutMs = 120000;
    window.dmSessionWarningThresholdMs = 60000;

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

    try {
      const loginPromise = window.dmRequireLogin();
      document.getElementById('dm-login-pin').value = '123123';
      document.getElementById('dm-login-submit').click();
      await loginPromise;

      window.toast.mockClear();

      const timeoutMs = Number(window.dmLoginTimeoutMs);
      const thresholdMs = Number(window.dmSessionWarningThresholdMs);
      const now = Date.now();
      const elapsedBeyondThreshold = timeoutMs - thresholdMs + 5000;
      sessionStorage.setItem('dmLoggedInLastActive', String(now - elapsedBeyondThreshold));

      jest.advanceTimersByTime(1000);

      const warningMessage = 'DM session will expire soon. Extend to stay logged in.';
      expect(window.toast).toHaveBeenCalledTimes(1);
      expect(window.toast).toHaveBeenCalledWith(warningMessage, 'warning');

      jest.advanceTimersByTime(1000);
      expect(window.toast).toHaveBeenCalledTimes(1);

      document.getElementById('dm-session-extend').click();

      window.toast.mockClear();

      const afterExtendNow = Date.now();
      sessionStorage.setItem('dmLoggedInLastActive', String(afterExtendNow - elapsedBeyondThreshold));

      jest.advanceTimersByTime(1000);

      expect(window.toast).toHaveBeenCalledTimes(1);
      expect(window.toast).toHaveBeenCalledWith(warningMessage, 'warning');
    } finally {
      jest.useRealTimers();
      delete window.toast;
      delete window.dismissToast;
      delete window.dmLoginTimeoutMs;
      delete window.dmSessionWarningThresholdMs;
    }
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
      document.getElementById('dm-login-pin').value = '123123';
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

    void window.dmRequireLogin();
    const pin = document.getElementById('dm-login-pin');
    const submit = document.getElementById('dm-login-submit');

    for (let i = 0; i < 3; i += 1) {
      pin.value = '000000';
      submit.click();
    }

    const waitMessage = document.querySelector('[data-login-wait]');
    expect(submit.disabled).toBe(true);
    expect(pin.disabled).toBe(true);
    expect(waitMessage).not.toBeNull();
    expect(waitMessage.hidden).toBe(false);
    expect(waitMessage.textContent).toContain('Too many failed attempts');
    expect(sessionStorage.getItem('dmLoginLockUntil')).not.toBeNull();
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
          <div id="dm-session-status" hidden></div>
          <button id="dm-session-extend" hidden></button>
        </div>
        <button id="dm-tools-tsomf"></button>
        <button id="dm-tools-logout"></button>
        <div id="dm-login-modal" class="hidden" aria-hidden="true">
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
    const pin = document.getElementById('dm-login-pin');
    const submit = document.getElementById('dm-login-submit');

    for (let i = 0; i < 3; i += 1) {
      pin.value = '000000';
      submit.click();
    }

    expect(submit.disabled).toBe(true);
    expect(pin.disabled).toBe(true);

    jest.advanceTimersByTime(30_000);

    expect(submit.disabled).toBe(false);
    expect(pin.disabled).toBe(false);
    const waitMessage = document.querySelector('[data-login-wait]');
    expect(waitMessage).not.toBeNull();
    expect(waitMessage.hidden).toBe(true);

    pin.value = '123123';
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
          <div id="dm-session-status" hidden></div>
          <button id="dm-session-extend" hidden></button>
        </div>
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

  test('expired DM session logs out and shows toast', async () => {
    document.body.innerHTML = `
        <button id="dm-login"></button>
        <button id="dm-tools-toggle" hidden></button>
        <div id="dm-tools-menu" hidden>
          <div id="dm-session-status" hidden></div>
          <button id="dm-session-extend" hidden></button>
        </div>
        <button id="dm-tools-tsomf"></button>
        <button id="dm-tools-logout"></button>
        <div id="somfDM-toasts"></div>
      `;
    window.toast = jest.fn();

    const now = Date.now();
    sessionStorage.setItem('dmLoggedIn', '1');
    sessionStorage.setItem('dmLoggedInAt', String(now - 10_000));
    sessionStorage.setItem('dmLoggedInLastActive', String(now - 10_000));
    window.dmLoginTimeoutMs = 1000;

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

    expect(sessionStorage.getItem('dmLoggedIn')).toBeNull();
    expect(window.toast).toHaveBeenCalledWith('DM session expired. Please log in again.', 'warning');

    delete window.toast;
    delete window.dmLoginTimeoutMs;
  });
});
