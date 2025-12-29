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

describe('auth modal layout', () => {
  beforeEach(() => {
    loadDom();
  });

  test('renders login and create account panels', () => {
    const loginTab = document.getElementById('auth-tab-login');
    const createTab = document.getElementById('auth-tab-create');
    const loginPanel = document.getElementById('auth-panel-login');
    const createPanel = document.getElementById('auth-panel-create');
    const offlineButton = document.getElementById('auth-offline');

    expect(loginTab).not.toBeNull();
    expect(createTab).not.toBeNull();
    expect(loginPanel).not.toBeNull();
    expect(createPanel).not.toBeNull();
    expect(offlineButton).not.toBeNull();
  });
});
