import { writeTextToClipboard, buildExportFilename, downloadTextFile } from './dm-export-helpers.js';

const ABILITY_ORDER = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
const PERK_ORDER = [
  ['alignment', 'Alignment'],
  ['classification', 'Classification'],
  ['powerStyle', 'Power Style'],
  ['origin', 'Origin'],
  ['tier', 'Tier'],
];
const STAT_ORDER = [
  ['init', 'Init'],
  ['speed', 'Speed'],
  ['pp', 'PP'],
];

export const CHARACTER_QUESTION_LABELS = {
  'q-mask': 'Who are you behind the mask?',
  'q-justice': 'What does justice mean to you?',
  'q-fear': 'What is your biggest fear or unresolved trauma?',
  'q-first-power': 'What moment first defined your sense of power—was it thrilling, terrifying, or tragic?',
  'q-origin-meaning': 'What does your Origin Story mean to you now?',
  'q-before-powers': 'What was your life like before you had powers or before you remembered having them?',
  'q-power-scare': 'What is one way your powers scare even you?',
  'q-signature-move': 'What is your signature move or ability, and how does it reflect who you are?',
  'q-emotional': 'What happens to your powers when you are emotionally compromised?',
  'q-no-line': 'What line will you never cross even if the world burns around you?',
};

function toDisplayValue(value) {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : String(value);
}

function normalizeAbilities(data = {}) {
  return ABILITY_ORDER.reduce((acc, label) => {
    const key = label.toLowerCase();
    acc[label] = toDisplayValue(data[key] ?? data[label] ?? '');
    return acc;
  }, {});
}

function normalizePerks(data = {}) {
  return {
    alignment: toDisplayValue(data.alignment ?? ''),
    classification: toDisplayValue(data.classification ?? ''),
    powerStyle: toDisplayValue(data['power-style'] ?? data.powerStyle ?? ''),
    origin: toDisplayValue(data.origin ?? ''),
    tier: toDisplayValue(data.tier ?? ''),
  };
}

function normalizeStats(data = {}) {
  return {
    init: toDisplayValue(data.initiative ?? data.init ?? ''),
    speed: toDisplayValue(data.speed ?? ''),
    pp: toDisplayValue(data.pp ?? ''),
  };
}

function formatSpCost(spCost) {
  const value = Number(spCost);
  if (!Number.isFinite(value) || value <= 0) return '';
  return `${value} SP`;
}

function normalizePowerEntry(entry, fallback) {
  const source = entry && typeof entry === 'object' ? entry : {};

  const normalized = {
    name: toDisplayValue(source.name ?? fallback ?? ''),
    style: toDisplayValue(source.style ?? ''),
    action: toDisplayValue(source.actionType ?? source.action ?? ''),
    intensity: toDisplayValue(source.intensity ?? ''),
    uses: toDisplayValue(source.uses ?? ''),
    cost: '',
    sp: '',
    save: '',
    rules: '',
    description: '',
    special: '',
  };

  const isModern = (
    source
    && (source.rulesText !== undefined
      || source.effectTag !== undefined
      || source.spCost !== undefined
      || source.intensity !== undefined
      || source.actionType !== undefined
      || source.signature !== undefined)
  );

  if (isModern) {
    normalized.cost = toDisplayValue(source.cost ?? formatSpCost(source.spCost));
    if (!normalized.cost) normalized.cost = formatSpCost(source.spCost);
    normalized.save = source.requiresSave ? toDisplayValue(source.saveAbilityTarget ?? source.save ?? '') : '';
    normalized.rules = toDisplayValue(source.rulesText ?? '');
    normalized.description = toDisplayValue(source.description ?? '');
    normalized.special = toDisplayValue(source.special ?? '');
  } else {
    const legacyDesc = source?.description ?? source?.desc ?? '';
    normalized.sp = toDisplayValue(source?.sp ?? '');
    normalized.save = toDisplayValue(source?.save ?? '');
    normalized.special = toDisplayValue(source?.special ?? '');
    normalized.description = toDisplayValue(legacyDesc);
  }

  return normalized;
}

function normalizeSimpleList(items = [], mapFn) {
  if (!Array.isArray(items)) return [];
  return items
    .map(item => mapFn(item))
    .filter(entry => !!entry);
}

function normalizeWeapon(entry = {}) {
  const name = toDisplayValue(entry.name ?? '');
  const damage = toDisplayValue(entry.damage ?? '');
  const range = toDisplayValue(entry.range ?? '');
  if (!name && !damage && !range) return null;
  return { name, damage, range };
}

function normalizeArmor(entry = {}) {
  const name = toDisplayValue(entry.name ?? '');
  const slot = toDisplayValue(entry.slot ?? '');
  const bonusValue = entry.bonus;
  const bonus = bonusValue === null || bonusValue === undefined || bonusValue === ''
    ? ''
    : (Number.isFinite(Number(bonusValue)) ? `${Number(bonusValue) >= 0 ? '+' : ''}${Number(bonusValue)}` : toDisplayValue(bonusValue));
  const equipped = !!entry.equipped;
  if (!name && !slot && !bonus && !equipped) return null;
  return { name, slot, bonus, equipped };
}

function normalizeItem(entry = {}) {
  const name = toDisplayValue(entry.name ?? '');
  const qty = entry.qty === undefined || entry.qty === null ? '' : toDisplayValue(entry.qty);
  const notes = toDisplayValue(entry.notes ?? '');
  if (!name && !qty && !notes) return null;
  return { name, qty, notes };
}

function normalizeQuestions(data = {}) {
  return Object.entries(CHARACTER_QUESTION_LABELS)
    .map(([key, prompt]) => {
      const response = toDisplayValue(data[key] ?? '');
      if (!response) return null;
      return { id: key, prompt, response };
    })
    .filter(Boolean);
}

function normalizePowers(list = [], { fallback } = {}) {
  if (!Array.isArray(list)) return [];
  return list.map(entry => normalizePowerEntry(entry, fallback));
}

function slugifyName(name) {
  if (!name) return '';
  return name
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeHtml(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wrapHtmlDocument(content, title = 'Character') {
  const safeTitle = escapeHtml(title || 'Character');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${safeTitle}</title>
  <style>
    body { background: #0c1017; color: #fff; font-family: Arial, sans-serif; margin: 0; padding: 24px; }
    .character-card { max-width: 960px; margin: 0 auto; }
    .character-card strong { font-size: 20px; }
    a { color: inherit; }
  </style>
</head>
<body>
  <div class="character-card" style="border:1px solid #1b2532;border-radius:8px;background:#0c1017;padding:16px;">
    ${content}
  </div>
</body>
</html>`;
}

function renderLabeled(label, value) {
  if (!value) return '';
  return `<div><span style="opacity:.8;font-size:12px">${label}</span><div>${value}</div></div>`;
}

function renderList(title, items) {
  if (!items || !items.length) return '';
  const inner = items.join('');
  if (!inner) return '';
  return `<div style="margin-top:6px"><span style=\"opacity:.8;font-size:12px\">${title}</span><ul style=\"margin:4px 0 0 18px;padding:0\">${inner}</ul></div>`;
}

function renderPowerEntry(entry = {}, fallback = 'Power') {
  const parts = [
    renderLabeled('Name', entry.name || fallback),
    renderLabeled('Style', entry.style),
    renderLabeled('Action', entry.action),
    renderLabeled('Intensity', entry.intensity),
    renderLabeled('Uses', entry.uses),
    renderLabeled('Cost', entry.cost),
    renderLabeled('SP', entry.sp),
    renderLabeled('Save', entry.save),
    renderLabeled('Rules', entry.rules),
    renderLabeled('Description', entry.description),
    renderLabeled('Special', entry.special),
  ];
  return `<li>${parts.join('')}</li>`;
}

function renderWeapon(entry = {}) {
  return `<li>${renderLabeled('Name', entry.name)}${renderLabeled('Damage', entry.damage)}${renderLabeled('Range', entry.range)}</li>`;
}

function renderArmor(entry = {}) {
  return `<li>${renderLabeled('Name', entry.name)}${renderLabeled('Slot', entry.slot)}${renderLabeled('Bonus', entry.bonus)}${renderLabeled('Equipped', entry.equipped ? 'Yes' : '')}</li>`;
}

function renderItem(entry = {}) {
  return `<li>${renderLabeled('Name', entry.name)}${renderLabeled('Qty', entry.qty)}${renderLabeled('Notes', entry.notes)}</li>`;
}

export function buildCharacterExport(name, data = {}) {
  const safeData = (data && typeof data === 'object') ? data : {};
  const exportName = toDisplayValue(name ?? safeData.name ?? '');
  return {
    name: exportName,
    health: {
      hp: toDisplayValue(safeData['hp-bar'] ?? safeData.hp ?? ''),
      tc: toDisplayValue(safeData.tc ?? ''),
      sp: toDisplayValue(safeData['sp-bar'] ?? safeData.sp ?? ''),
    },
    abilities: normalizeAbilities(safeData),
    perks: normalizePerks(safeData),
    stats: normalizeStats(safeData),
    powers: normalizePowers(safeData.powers, { fallback: 'Power' }),
    signatures: normalizePowers(safeData.signatures, { fallback: 'Signature' }),
    weapons: normalizeSimpleList(safeData.weapons, normalizeWeapon),
    armor: normalizeSimpleList(safeData.armor, normalizeArmor),
    items: normalizeSimpleList(safeData.items, normalizeItem),
    storyNotes: toDisplayValue(safeData['story-notes'] ?? safeData.storyNotes ?? ''),
    questions: normalizeQuestions(safeData),
  };
}

export function renderCharacterHtml(exportData) {
  const data = ensureExportData(exportData);
  const abilityGrid = ABILITY_ORDER
    .map(label => renderLabeled(label, data.abilities[label]))
    .join('');
  const perkGrid = PERK_ORDER
    .map(([key, label]) => renderLabeled(label, data.perks[key]))
    .join('');
  const statsGrid = STAT_ORDER
    .map(([key, label]) => renderLabeled(label, data.stats[key]))
    .join('');

  let html = `
    <div><strong>${data.name}</strong></div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px">
      ${renderLabeled('HP', data.health.hp)}
      ${renderLabeled('TC', data.health.tc)}
      ${renderLabeled('SP', data.health.sp)}
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px">${abilityGrid}</div>
  `;

  if (perkGrid.trim()) {
    html += `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-top:6px">${perkGrid}</div>`;
  }
  if (statsGrid.trim()) {
    html += `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px">${statsGrid}</div>`;
  }

  if (data.powers.length) {
    const powers = data.powers.map(entry => renderPowerEntry(entry, 'Power'));
    html += renderList('Powers', powers);
  }
  if (data.signatures.length) {
    const signatures = data.signatures.map(entry => renderPowerEntry(entry, 'Signature'));
    html += renderList('Signatures', signatures);
  }
  if (data.weapons.length) {
    html += renderList('Weapons', data.weapons.map(renderWeapon));
  }
  if (data.armor.length) {
    html += renderList('Armor', data.armor.map(renderArmor));
  }
  if (data.items.length) {
    html += renderList('Items', data.items.map(renderItem));
  }
  if (data.storyNotes) {
    html += `<div style="margin-top:6px"><span style=\"opacity:.8;font-size:12px\">Backstory / Notes</span><div>${data.storyNotes}</div></div>`;
  }
  if (data.questions.length) {
    const list = data.questions
      .map(entry => `<li><strong>${entry.prompt}</strong> ${entry.response}</li>`)
      .join('');
    if (list) {
      html += `<div style="margin-top:6px"><span style=\"opacity:.8;font-size:12px\">Character Questions</span><ul style=\"margin:4px 0 0 18px;padding:0\">${list}</ul></div>`;
    }
  }

  return html;
}

export async function copyCharacterJson(nameOrExportData, maybeData) {
  const exportData = ensureExportData(nameOrExportData, maybeData);
  const payload = JSON.stringify(exportData, null, 2);
  return writeTextToClipboard(payload);
}

export function downloadCharacterHtml(nameOrExportData, maybeData) {
  const exportData = ensureExportData(nameOrExportData, maybeData);
  const markup = renderCharacterHtml(exportData);
  const documentHtml = wrapHtmlDocument(markup, exportData.name || 'Character');
  const slug = slugifyName(exportData.name);
  const filename = buildExportFilename(slug ? `character-${slug}` : 'character', { extension: 'html' });
  return downloadTextFile(filename, documentHtml, { type: 'text/html' });
}

export function downloadCharacterPdf(nameOrExportData, maybeData) {
  const exportData = ensureExportData(nameOrExportData, maybeData);
  const markup = renderCharacterHtml(exportData);
  const documentHtml = wrapHtmlDocument(markup, exportData.name || 'Character');
  const slug = slugifyName(exportData.name);
  const filename = buildExportFilename(slug ? `character-${slug}` : 'character', { extension: 'pdf' });
  return downloadTextFile(filename, documentHtml, { type: 'application/pdf' });
}

function ensureExportData(exportData, maybeData) {
  if (maybeData === undefined && exportData && typeof exportData === 'object' && !Array.isArray(exportData) && exportData.abilities) {
    return exportData;
  }
  return buildCharacterExport(exportData, maybeData);
}
