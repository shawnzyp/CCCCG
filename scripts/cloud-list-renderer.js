function formatUpdatedAt(updatedAt) {
  const ts = Number(updatedAt);
  if (!Number.isFinite(ts) || ts <= 0) return 'Updated time unknown';
  try {
    return `Updated ${new Date(ts).toLocaleString()}`;
  } catch {
    return 'Updated time unknown';
  }
}

export function buildClaimRow({ name, meta, actions = [] } = {}) {
  const row = document.createElement('div');
  row.className = 'claim-row';
  row.setAttribute('role', 'listitem');
  const main = document.createElement('div');
  main.className = 'claim-row__main';
  const nameEl = document.createElement('div');
  nameEl.className = 'claim-row__name';
  nameEl.textContent = name;
  const metaEl = document.createElement('div');
  metaEl.className = 'claim-row__meta';
  metaEl.textContent = meta;
  main.append(nameEl, metaEl);
  const actionsEl = document.createElement('div');
  actionsEl.className = 'claim-row__actions';
  actions.forEach(btn => actionsEl.append(btn));
  row.append(main, actionsEl);
  return row;
}

export function renderEmptyRow(container, message) {
  if (!container) return;
  const row = buildClaimRow({ name: message, meta: '' });
  row.classList.add('claim-row--empty');
  container.append(row);
}

function getEntryUpdatedAt(entry) {
  const serverValue = Number(entry?.updatedAtServer);
  if (Number.isFinite(serverValue) && serverValue > 0) return serverValue;
  const value = Number(entry?.updatedAt);
  return Number.isFinite(value) ? value : 0;
}

export function renderCloudCharacterList(container, entries = [], options = {}) {
  if (!container) return;
  const {
    actionLabel = '',
    onOpen,
    emptyMessage = 'No cloud characters found.',
  } = options;
  container.textContent = '';
  const list = Array.isArray(entries) ? entries.slice() : [];
  if (!list.length) {
    renderEmptyRow(container, emptyMessage);
    return;
  }
  list.sort((a, b) => getEntryUpdatedAt(b) - getEntryUpdatedAt(a));
  list.forEach(entry => {
    const name = entry?.name || entry?.characterId || 'Unnamed character';
    const actions = [];
    if (typeof onOpen === 'function' && actionLabel) {
      const btn = document.createElement('button');
      btn.className = 'cc-btn cc-btn--ghost';
      btn.type = 'button';
      btn.textContent = actionLabel;
      btn.addEventListener('click', () => onOpen(entry));
      actions.push(btn);
    }
    container.append(buildClaimRow({
      name,
      meta: formatUpdatedAt(getEntryUpdatedAt(entry)),
      actions,
    }));
  });
}
