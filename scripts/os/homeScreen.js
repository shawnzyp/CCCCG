export function createHomeScreen({ root } = {}) {
  const iosTimeEl = root?.querySelector('[data-pt-ios-time]') || null;
  const iosDateEl = root?.querySelector('[data-pt-ios-date]') || null;

  function updateLockTime() {
    const now = new Date();
    const pad2 = (n) => String(n).padStart(2, '0');
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const h12 = hours % 12 || 12;
    const time = `${pad2(h12)}:${pad2(minutes)}`;

    const weekday = now.toLocaleDateString(undefined, { weekday: 'long' });
    const month = now.toLocaleDateString(undefined, { month: 'short' });
    const day = now.getDate();
    const date = `${weekday}, ${month} ${day}`;

    if (iosTimeEl) iosTimeEl.textContent = time;
    if (iosDateEl) iosDateEl.textContent = date;
  }

  return { updateLockTime };
}
