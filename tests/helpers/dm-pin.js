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
