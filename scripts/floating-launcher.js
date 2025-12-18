const CLASS_NAME = 'dm-floating-covered';
const ATTRIBUTE_NAME = 'data-floating-covered';
let coverCount = 0;

function applyState() {
  if (typeof document === 'undefined') return;
  const body = document.body;
  if (!body) return;
  if (coverCount > 0) {
    body.classList.add(CLASS_NAME);
    body.setAttribute(ATTRIBUTE_NAME, 'true');
  } else {
    body.classList.remove(CLASS_NAME);
    body.removeAttribute(ATTRIBUTE_NAME);
  }
}

export function coverFloatingLauncher() {
  coverCount += 1;
  applyState();
  return coverCount;
}

export function releaseFloatingLauncher() {
  coverCount = Math.max(0, coverCount - 1);
  applyState();
  return coverCount;
}

export function isFloatingLauncherCovered() {
  return coverCount > 0;
}

export function resetFloatingLauncherCoverage() {
  coverCount = 0;
  applyState();
  return coverCount;
}

if (typeof window !== 'undefined') {
  window.coverFloatingLauncher = coverFloatingLauncher;
  window.releaseFloatingLauncher = releaseFloatingLauncher;
  window.isFloatingLauncherCovered = isFloatingLauncherCovered;
  window.resetFloatingLauncherCoverage = resetFloatingLauncherCoverage;
}
