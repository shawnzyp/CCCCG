import {
  applyPasswordPolicyError,
  getPasswordLengthError,
  renderPasswordPolicyChecklist,
  updatePasswordPolicyChecklist,
} from '../scripts/password-policy.js';

const testPolicy = {
  minLength: 8,
  maxLength: 12,
  requireUpper: true,
  requireLower: true,
  requireNumber: true,
  requireSpecial: true,
};

describe('password policy checklist', () => {
  test('marks unmet rules correctly', () => {
    const container = document.createElement('ul');
    renderPasswordPolicyChecklist(container, testPolicy);
    updatePasswordPolicyChecklist(container, 'Ab1!', testPolicy);

    const lengthItem = container.querySelector('[data-rule="length"]');
    const upperItem = container.querySelector('[data-rule="upper"]');
    const lowerItem = container.querySelector('[data-rule="lower"]');
    const numberItem = container.querySelector('[data-rule="number"]');
    const specialItem = container.querySelector('[data-rule="special"]');

    expect(lengthItem.classList.contains('is-met')).toBe(false);
    expect(upperItem.classList.contains('is-met')).toBe(true);
    expect(lowerItem.classList.contains('is-met')).toBe(true);
    expect(numberItem.classList.contains('is-met')).toBe(true);
    expect(specialItem.classList.contains('is-met')).toBe(true);
  });

  test('signup rejection shows unmet rules', () => {
    const container = document.createElement('ul');
    renderPasswordPolicyChecklist(container, testPolicy);
    const error = { code: 'auth/password-does-not-meet-requirements' };
    const feedback = applyPasswordPolicyError({
      container,
      password: 'abcdefg',
      policy: testPolicy,
      error,
    });

    expect(feedback).not.toBeNull();
    expect(container.querySelector('[data-rule="length"]').classList.contains('is-met')).toBe(false);
    expect(container.querySelector('[data-rule="upper"]').classList.contains('is-met')).toBe(false);
    expect(container.querySelector('[data-rule="number"]').classList.contains('is-met')).toBe(false);
    expect(container.querySelector('[data-rule="special"]').classList.contains('is-met')).toBe(false);
  });

  test('enforces max length before signup', () => {
    const error = getPasswordLengthError('A1b2!A1b2!A1b2!', testPolicy);
    expect(error).toBe('Password must be at most 12 characters.');
  });
});
