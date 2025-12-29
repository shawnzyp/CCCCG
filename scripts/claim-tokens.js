function normalizeToken(token) {
  if (typeof token !== 'string') return '';
  return token.replace(/\s+/g, '').toUpperCase();
}

function generateToken() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let raw = '';
  try {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    raw = Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
  } catch {
    for (let i = 0; i < 12; i++) {
      raw += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
  }
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

export async function createClaimToken(db, { sourceUid, characterId, targetUid, expiresAt } = {}) {
  if (!db) throw new Error('Database required');
  if (!sourceUid) throw new Error('Source uid required');
  if (!characterId) throw new Error('Character id required');
  if (!targetUid) throw new Error('Target uid required');
  const expiry = Number(expiresAt);
  if (!Number.isFinite(expiry) || expiry <= Date.now()) {
    throw new Error('Expiry must be in the future');
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const token = generateToken();
    const normalized = normalizeToken(token);
    const ref = db.ref(`claimTokens/${normalized}`);
    const payload = {
      sourceUid,
      characterId,
      targetUid,
      expiresAt: expiry,
      createdAt: Date.now(),
      consumedAt: null,
      consumedBy: null,
    };
    const result = await ref.transaction(current => {
      if (current) return;
      return payload;
    });
    if (result?.committed) {
      return token;
    }
  }
  throw new Error('Failed to generate claim token');
}

export async function consumeClaimToken(db, token, uid) {
  if (!db) throw new Error('Database required');
  const normalized = normalizeToken(token);
  if (!normalized) throw new Error('Claim token required');
  if (!uid) throw new Error('User id required');
  const ref = db.ref(`claimTokens/${normalized}`);
  const now = Date.now();
  const result = await ref.transaction(current => {
    if (!current) return;
    if (current.consumedAt) return;
    if (current.expiresAt && current.expiresAt < now) return;
    if (current.targetUid && current.targetUid !== uid) return;
    return {
      ...current,
      consumedAt: now,
      consumedBy: uid,
    };
  });
  if (!result?.committed) {
    throw new Error('Claim token invalid or expired');
  }
  return result.snapshot?.val?.() || result.snapshot?.val || {};
}
