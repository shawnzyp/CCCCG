import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jest } from '@jest/globals';

const __filename = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(__filename), '..');

function installDom() {
  const html = fs.readFileSync(path.resolve(ROOT_DIR, 'index.html'), 'utf8');
  document.documentElement.innerHTML = html;
}

describe('Player OS exports', () => {
  beforeEach(() => {
    jest.resetModules();
    installDom();
    const raf = cb => setTimeout(() => cb(Date.now()), 0);
    const caf = id => clearTimeout(id);
    window.requestAnimationFrame = window.requestAnimationFrame || raf;
    window.cancelAnimationFrame = window.cancelAnimationFrame || caf;
    window.matchMedia =
      window.matchMedia ||
      jest.fn().mockReturnValue({
        matches: false,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      });
    delete window.PlayerOS;
  });

  test('openApp is available for launcher button handlers', async () => {
    await import('../scripts/player-os.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    expect(typeof window.PlayerOS?.openApp).toBe('function');
    expect(typeof window.PlayerOS?.openLauncher).toBe('function');
  });
});
