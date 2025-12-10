export function createPortal(doc) {
  const original = new Map();

  function moveToHost(node, host) {
    if (!node || !host) return null;
    if (!original.has(node)) {
      original.set(node, { parent: node.parentNode, nextSibling: node.nextSibling });
    }
    host.appendChild(node);
    node.hidden = false;
    node.setAttribute('aria-hidden', 'false');
    return node;
  }

  function restore(node) {
    const info = original.get(node);
    if (!info) return;
    const { parent, nextSibling } = info;
    if (!parent) return;
    if (nextSibling && nextSibling.parentNode === parent) {
      parent.insertBefore(node, nextSibling);
    } else {
      parent.appendChild(node);
    }
    node.hidden = true;
    node.setAttribute('aria-hidden', 'true');
  }

  function restoreAll() {
    for (const node of original.keys()) {
      restore(node);
    }
  }

  return { moveToHost, restore, restoreAll };
}
