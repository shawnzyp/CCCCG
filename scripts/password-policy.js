export const PASSWORD_POLICY = Object.freeze({
  minLength: 8,
  maxLength: 64,
  requireUpper: true,
  requireLower: true,
  requireNumber: true,
  requireSpecial: true,
});

function normalizePolicy(policy = PASSWORD_POLICY) {
  return {
    minLength: Number.isFinite(policy.minLength) ? policy.minLength : 0,
    maxLength: Number.isFinite(policy.maxLength) ? policy.maxLength : null,
    requireUpper: !!policy.requireUpper,
    requireLower: !!policy.requireLower,
    requireNumber: !!policy.requireNumber,
    requireSpecial: !!policy.requireSpecial,
  };
}

export function getPasswordPolicyRules(policy = PASSWORD_POLICY) {
  const normalized = normalizePolicy(policy);
  const rules = [
    {
      key: 'length',
      label: normalized.maxLength
        ? `${normalized.minLength}-${normalized.maxLength} characters`
        : `At least ${normalized.minLength} characters`,
      test: password => {
        if (normalized.maxLength) {
          return password.length >= normalized.minLength && password.length <= normalized.maxLength;
        }
        return password.length >= normalized.minLength;
      },
    },
  ];
  if (normalized.requireUpper) {
    rules.push({
      key: 'upper',
      label: 'At least 1 uppercase letter',
      test: password => /[A-Z]/.test(password),
    });
  }
  if (normalized.requireLower) {
    rules.push({
      key: 'lower',
      label: 'At least 1 lowercase letter',
      test: password => /[a-z]/.test(password),
    });
  }
  if (normalized.requireNumber) {
    rules.push({
      key: 'number',
      label: 'At least 1 number',
      test: password => /[0-9]/.test(password),
    });
  }
  if (normalized.requireSpecial) {
    rules.push({
      key: 'special',
      label: 'At least 1 special character',
      test: password => /[^A-Za-z0-9]/.test(password),
    });
  }
  return rules;
}

export function evaluatePasswordPolicy(password, policy = PASSWORD_POLICY) {
  const rules = getPasswordPolicyRules(policy);
  const results = {};
  const unmetRules = [];
  rules.forEach(rule => {
    const met = rule.test(password);
    results[rule.key] = met;
    if (!met) unmetRules.push(rule.key);
  });
  return { rules, results, unmetRules };
}

export function renderPasswordPolicyChecklist(container, policy = PASSWORD_POLICY) {
  if (!container) return;
  container.innerHTML = '';
  const rules = getPasswordPolicyRules(policy);
  rules.forEach(rule => {
    const item = document.createElement('li');
    item.className = 'password-policy__item is-unmet';
    item.dataset.rule = rule.key;
    item.textContent = rule.label;
    container.appendChild(item);
  });
}

export function updatePasswordPolicyChecklist(container, password, policy = PASSWORD_POLICY) {
  if (!container) return [];
  const { results, unmetRules } = evaluatePasswordPolicy(password, policy);
  container.querySelectorAll('[data-rule]').forEach(node => {
    const key = node.dataset.rule;
    const met = results[key];
    if (met) {
      node.classList.add('is-met');
      node.classList.remove('is-unmet');
    } else {
      node.classList.remove('is-met');
      node.classList.add('is-unmet');
    }
  });
  return unmetRules;
}

export function getPasswordLengthError(password, policy = PASSWORD_POLICY) {
  const normalized = normalizePolicy(policy);
  if (normalized.maxLength && password.length > normalized.maxLength) {
    return `Password must be at most ${normalized.maxLength} characters.`;
  }
  return '';
}

export function isPasswordPolicyError(error) {
  const code = error?.code || '';
  const message = `${error?.message || ''}`.toUpperCase();
  return (
    code === 'auth/password-does-not-meet-requirements' ||
    code === 'auth/weak-password' ||
    message.includes('PASSWORD_DOES_NOT_MEET_REQUIREMENTS') ||
    message.includes('WEAK_PASSWORD')
  );
}

function buildPolicyMessage(unmetRules, policy = PASSWORD_POLICY) {
  if (!unmetRules.length) {
    return 'Password does not meet requirements.';
  }
  const rules = getPasswordPolicyRules(policy);
  const labels = rules
    .filter(rule => unmetRules.includes(rule.key))
    .map(rule => rule.label);
  return `Password must include: ${labels.join(', ')}.`;
}

export function applyPasswordPolicyError({ container, password, policy = PASSWORD_POLICY, error }) {
  if (!isPasswordPolicyError(error)) return null;
  const unmetRules = updatePasswordPolicyChecklist(container, password, policy);
  return {
    message: buildPolicyMessage(unmetRules, policy),
    unmetRules,
  };
}
