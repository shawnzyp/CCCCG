import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jest } from '@jest/globals';

const __filename = fileURLToPath(import.meta.url);
const TEST_DIR = path.dirname(__filename);
const ROOT_DIR = path.resolve(TEST_DIR, '..');

function loadDom() {
  const html = fs.readFileSync(path.resolve(ROOT_DIR, 'index.html'), 'utf8');
  document.documentElement.innerHTML = html;
}

describe('welcome modal handlers', () => {
  beforeEach(() => {
    loadDom();
  });

  test('login and continue buttons trigger handlers', async () => {
    const { bindWelcomeModalHandlers } = await import('../scripts/claim-utils.js');
    const onLogin = jest.fn();
    const onContinue = jest.fn();

    bindWelcomeModalHandlers({ onLogin, onContinue });

    const login = document.getElementById('welcome-login');
    const cont = document.getElementById('welcome-continue');

    expect(login).not.toBeNull();
    expect(cont).not.toBeNull();

    login.click();
    cont.click();

    expect(onLogin).toHaveBeenCalledTimes(1);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});

describe('recovery code parsing', () => {
  test('parses deviceId/characterId forms', async () => {
    const { parseRecoveryCode } = await import('../scripts/claim-utils.js');

    expect(parseRecoveryCode('device-1/char-2')).toEqual({ deviceId: 'device-1', characterId: 'char-2' });
    expect(parseRecoveryCode('device-1:char-2')).toEqual({ deviceId: 'device-1', characterId: 'char-2' });
    expect(parseRecoveryCode('device-1 / char-2')).toEqual({ deviceId: 'device-1', characterId: 'char-2' });
    expect(parseRecoveryCode('')).toBeNull();
    expect(parseRecoveryCode('device-only')).toBeNull();
  });
});
