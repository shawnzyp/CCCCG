import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jest } from '@jest/globals';

const __filename = fileURLToPath(import.meta.url);
const TEST_DIR = path.dirname(__filename);
const ROOT_DIR = path.resolve(TEST_DIR, '..');

const installDomScaffolding = () => {
  const html = fs.readFileSync(path.resolve(ROOT_DIR, 'index.html'), 'utf8');
  document.documentElement.innerHTML = html;
  document.querySelector('[data-m24n-ticker-track]')?.remove();
  document.querySelector('[data-m24n-ticker-text]')?.remove();
};

const installEventSourceMock = () => {
  if (typeof globalThis.EventSource === 'function') return;
  globalThis.EventSource = class {
    constructor() {}
    addEventListener() {}
    removeEventListener() {}
    close() {}
  };
};

const installScrollMock = () => {
  if (typeof window !== 'undefined') {
    window.scrollTo = () => {};
  }
};

describe('launcher registry', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    document.documentElement.innerHTML = '';
  });

  test('home launcher dispatch routes through openApp', async () => {
    installDomScaffolding();
    installEventSourceMock();
    installScrollMock();
    await import('../scripts/main.js');
    document.documentElement.setAttribute('data-pt-phone-open', '1');

    const openSpy = jest.fn().mockResolvedValue({ ok: true });
    window.openApp = openSpy;

    const btn = document.querySelector('[data-pt-open-app="campaignLog"]');
    btn.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true }));

    expect(openSpy).toHaveBeenCalledWith('campaignLog', expect.objectContaining({ source: 'launcher', element: btn }));
  });

  test('unknown app returns unknown-app response', async () => {
    installDomScaffolding();
    installEventSourceMock();
    installScrollMock();
    const { openApp } = await import('../scripts/main.js');

    await expect(openApp('not-real-app')).resolves.toEqual({ ok: false, reason: 'unknown-app' });
  });

  test('health check warns on mismatched ids', async () => {
    installDomScaffolding();
    installEventSourceMock();
    installScrollMock();
    const ghost = document.createElement('button');
    ghost.setAttribute('data-pt-open-app', 'ghostApp');
    ghost.textContent = 'Ghost';
    document.body.appendChild(ghost);

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { runLauncherHealthCheck } = await import('../scripts/main.js');

    const result = runLauncherHealthCheck();

    expect(result.ok).toBe(false);
    expect(result.missingRegistry).toContain('ghostApp');
    expect(warnSpy).toHaveBeenCalled();
  });

  test('all launcher buttons map to registry', async () => {
    installDomScaffolding();
    installEventSourceMock();
    installScrollMock();

    const { APP_REGISTRY } = await import('../scripts/main.js');

    const ids = [...document.querySelectorAll('[data-pt-open-app]')]
      .map((b) => b.getAttribute('data-pt-open-app'))
      .filter(Boolean);

    const missing = ids.filter((id) => !APP_REGISTRY[id]);
    expect(missing).toEqual([]);
  });

  test('registry apps have targets or routes', async () => {
    installDomScaffolding();
    installEventSourceMock();
    installScrollMock();

    const { runLauncherHealthCheck } = await import('../scripts/main.js');
    const result = runLauncherHealthCheck();

    if (!result.skippedTargetsCheck) {
      expect(result.missingTargets).toEqual([]);
    }
  });
});
