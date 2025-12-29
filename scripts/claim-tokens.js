function randomTokenSegment() {
  const bytes = new Uint8Array(6);
  if (typeof crypto === 'object' && crypto && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes).map(v => v.toString(16).padStart(2, '0')).join('');
}

export function generateClaimToken() {
  return `${randomTokenSegment()}-${randomTokenSegment()}`;
}

export async function createClaimToken(db, { characterId, sourceUid, payload, expiresInMs = 15 * 60 * 1000 } = {}) {
  if (!db) throw new Error('Database required');
  if (!characterId || !sourceUid) throw new Error('Character id and source uid required');
  const token = generateClaimToken();
  const now = Date.now();
  const record = {
    characterId,
    sourceUid,
    payload: payload && typeof payload === 'object' ? payload : null,
    createdAt: now,
    expiresAt: now + expiresInMs,
    usedAt: 0,
    usedBy: '',
  };
  await db.ref(`claimTokens/${token}`).set(record);
  return { token, payload: record };
}

export async function consumeClaimToken(db, token, consumerUid) {
  if (!db) throw new Error('Database required');
  if (!token || !consumerUid) throw new Error('Token and uid required');
  const ref = db.ref(`claimTokens/${token}`);
  const now = Date.now();
  const result = await ref.transaction(current => {
    if (!current) return;
    if (current.usedAt) return;
    if (current.expiresAt && current.expiresAt < now) return;
    return {
      ...current,
      usedAt: now,
      usedBy: consumerUid,
    };
  });
  if (!result.committed) {
    throw new Error('Claim token invalid or expired');
  }
  return result.snapshot.val();
}
