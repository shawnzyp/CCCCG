const participants = new Set();

function normalizeParticipant(participant) {
  if (!participant || typeof participant !== 'object') {
    return null;
  }
  const { key, capture, apply, priority = 0 } = participant;
  if (typeof capture !== 'function' || typeof apply !== 'function') {
    return null;
  }
  const normalizedKey = typeof key === 'string' && key.trim() ? key.trim() : `participant-${participants.size + 1}`;
  const normalizedPriority = Number.isFinite(priority) ? priority : 0;
  return { key: normalizedKey, capture, apply, priority: normalizedPriority };
}

export function registerSnapshotParticipant(participant) {
  const normalized = normalizeParticipant(participant);
  if (!normalized) {
    return () => {};
  }
  participants.add(normalized);
  return () => {
    participants.delete(normalized);
  };
}

function getSortedParticipants() {
  return Array.from(participants).sort((a, b) => a.priority - b.priority || a.key.localeCompare(b.key));
}

export function collectSnapshotParticipants() {
  const entries = {};
  getSortedParticipants().forEach(participant => {
    try {
      const snapshot = participant.capture();
      if (snapshot !== undefined) {
        entries[participant.key] = snapshot;
      }
    } catch (err) {
      console.error('Snapshot participant capture failed', err);
    }
  });
  return entries;
}

export function applySnapshotParticipants(state = {}) {
  if (!state || typeof state !== 'object') {
    return;
  }
  getSortedParticipants().forEach(participant => {
    if (!Object.prototype.hasOwnProperty.call(state, participant.key)) {
      return;
    }
    try {
      participant.apply(state[participant.key]);
    } catch (err) {
      console.error('Snapshot participant apply failed', err);
    }
  });
}
