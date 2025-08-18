export function updateHP(element, amount) {
  const current = parseInt(element.textContent, 10) || 0;
  element.textContent = current + amount;
}
