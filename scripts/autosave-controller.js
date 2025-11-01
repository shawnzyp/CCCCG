const CLOUD_AUTO_SAVE_INTERVAL_MS = 2 * 60 * 1000;

let autoSaveDirty = false;
let lastSyncedSnapshotJson = null;
let pendingAutoSaveSnapshot = null;
let pendingAutoSaveJson = null;
let scheduledAutoSaveId = null;
let scheduledAutoSaveInFlight = false;

let getCurrentCharacter = () => null;
let saveAutoBackup = async () => null;

export function initializeAutosaveController(options = {}) {
  if (typeof options.getCurrentCharacter === 'function') {
    getCurrentCharacter = options.getCurrentCharacter;
  }
  if (typeof options.saveAutoBackup === 'function') {
    saveAutoBackup = options.saveAutoBackup;
  }
}

export function markAutoSaveDirty(snapshot, serialized) {
  pendingAutoSaveSnapshot = snapshot;
  pendingAutoSaveJson = serialized ?? JSON.stringify(snapshot);
  if (pendingAutoSaveJson !== lastSyncedSnapshotJson) {
    autoSaveDirty = true;
    scheduleAutoSave();
  } else {
    autoSaveDirty = false;
    clearScheduledAutoSave();
  }
}

export function markAutoSaveSynced(snapshot, serialized) {
  pendingAutoSaveSnapshot = snapshot;
  pendingAutoSaveJson = serialized ?? JSON.stringify(snapshot);
  lastSyncedSnapshotJson = pendingAutoSaveJson;
  autoSaveDirty = false;
  clearScheduledAutoSave();
}

export function isAutoSaveDirty() {
  return autoSaveDirty;
}

export function scheduleAutoSave() {
  if (typeof window === 'undefined') return;
  if (!autoSaveDirty) return;
  if (scheduledAutoSaveId !== null) {
    window.clearTimeout(scheduledAutoSaveId);
  }
  scheduledAutoSaveId = window.setTimeout(() => {
    scheduledAutoSaveId = null;
    performScheduledAutoSave();
  }, CLOUD_AUTO_SAVE_INTERVAL_MS);
}

export function clearScheduledAutoSave() {
  if (typeof window === 'undefined') return;
  if (scheduledAutoSaveId !== null) {
    window.clearTimeout(scheduledAutoSaveId);
    scheduledAutoSaveId = null;
  }
}

export async function performScheduledAutoSave() {
  if (scheduledAutoSaveInFlight) return;
  if (!autoSaveDirty || !pendingAutoSaveSnapshot) return;
  if (typeof window !== 'undefined' && scheduledAutoSaveId !== null) {
    window.clearTimeout(scheduledAutoSaveId);
    scheduledAutoSaveId = null;
  }
  const name = getCurrentCharacter();
  if (!name) {
    scheduleAutoSave();
    return;
  }
  scheduledAutoSaveInFlight = true;
  const snapshot = pendingAutoSaveSnapshot;
  const serialized = pendingAutoSaveJson;
  try {
    const result = await saveAutoBackup(snapshot, name);
    if (!result) {
      const latestSnapshot = pendingAutoSaveSnapshot ?? snapshot;
      if (latestSnapshot) {
        const latestSerialized = pendingAutoSaveJson ?? serialized;
        markAutoSaveDirty(latestSnapshot, latestSerialized);
      }
      return;
    }
    if (pendingAutoSaveSnapshot === snapshot && pendingAutoSaveJson === serialized) {
      markAutoSaveSynced(snapshot, serialized);
    }
  } catch (err) {
    console.error('Scheduled auto save failed', err);
    const latestSnapshot = pendingAutoSaveSnapshot ?? snapshot;
    if (latestSnapshot) {
      const latestSerialized = pendingAutoSaveJson ?? serialized;
      markAutoSaveDirty(latestSnapshot, latestSerialized);
    }
  } finally {
    scheduledAutoSaveInFlight = false;
    if (autoSaveDirty) {
      scheduleAutoSave();
    }
  }
}

export function getAutoSaveState() {
  return {
    autoSaveDirty,
    lastSyncedSnapshotJson,
    pendingAutoSaveSnapshot,
    pendingAutoSaveJson,
    scheduledAutoSaveId,
    scheduledAutoSaveInFlight,
  };
}

export const __autosaveTesting = {
  markAutoSaveDirty,
  markAutoSaveSynced,
  performScheduledAutoSave,
  scheduleAutoSave,
  clearScheduledAutoSave,
  getState: getAutoSaveState,
};
