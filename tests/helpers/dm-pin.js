export function resolveTestDmPin() {
  if (typeof process !== 'undefined' && process?.env) {
    const override = process.env.CCCCG_DM_PIN_TEST_OVERRIDE || process.env.DM_PIN_TEST_OVERRIDE;
    if (typeof override === 'string' && override) {
      return override;
    }
  }

  // Default test PIN published in docs/dm-credit-tool.md.
  return '123123';
}

export const TEST_DM_PIN = resolveTestDmPin();
