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

describe('welcome modal layout', () => {
  beforeEach(() => {
    loadDom();
  });

  test('renders login and continue actions', () => {
    const login = document.getElementById('welcome-login');
    const create = document.getElementById('welcome-create');
    const cont = document.getElementById('welcome-continue');

    expect(login).not.toBeNull();
    expect(create).not.toBeNull();
    expect(cont).not.toBeNull();
    expect(cont.hasAttribute('disabled')).toBe(true);
  });
});
