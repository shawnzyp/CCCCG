import { DM_PIN } from '../../scripts/dm-pin.js';

export function resolveTestDmPin() {
  if (typeof DM_PIN === 'string' && DM_PIN) {
    return DM_PIN;
  }

  if (typeof process !== 'undefined' && process?.env) {
    const override = process.env.CCCCG_DM_PIN_TEST_OVERRIDE || process.env.DM_PIN_TEST_OVERRIDE;
    if (typeof override === 'string' && override) {
      return override;
    }
  }

  if (DM_PIN && typeof DM_PIN === 'object') {
    const candidate = DM_PIN.testPin || DM_PIN.plaintext;
    if (typeof candidate === 'string' && candidate) {
      return candidate;
    }
  }

  // Default test PIN published in docs/dm-credit-tool.md.
  return '123123';
}

export const TEST_DM_PIN = resolveTestDmPin();

export const TEST_DM_PIN_HASH = '96cae35ce8a9b0244178bf28e4966c2ce1b8385723a96a6b838858cdd6ca0a1e';

export function seedTestDmPin() {
  if (typeof localStorage === 'undefined' || typeof localStorage.setItem !== 'function') {
    return;
  }
  try {
    localStorage.setItem('pin:__dm__', TEST_DM_PIN);
  } catch {
    /* ignore storage seed failures in tests */
  }
}
