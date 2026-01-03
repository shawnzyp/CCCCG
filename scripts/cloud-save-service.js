import { getFirebaseFirestore } from './auth.js';
import { ensureCharacterId } from './characters.js';
import {
  listCharacterIndex,
  loadCloudCharacter,
  saveCloudCharacter,
  saveCharacterIndexEntry,
} from './storage.js';

export const CLOUD_SAVE_SCHEMA_VERSION = 1;
const FIRESTORE_CHARACTERS_COLLECTION = 'characters';

function resolveUpdatedAt(entry) {
  if (!entry || typeof entry !== 'object') return 0;
  const direct = Number(entry.updatedAt);
  if (Number.isFinite(direct)) return direct;
  const nested = Number(entry?.meta?.updatedAt);
  return Number.isFinite(nested) ? nested : 0;
}

function getFirestoreServerTimestamp(firestore) {
  const fieldValue = firestore?.constructor?.FieldValue;
  if (fieldValue && typeof fieldValue.serverTimestamp === 'function') {
    return fieldValue.serverTimestamp();
  }
  return null;
}

function coerceCloudPayload(payload) {
  if (!payload) return null;
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload);
    } catch {
      return null;
    }
  }
  return payload;
}

export function buildCloudSaveEnvelope(payload, { updatedAt = Date.now(), schemaVersion = CLOUD_SAVE_SCHEMA_VERSION, migratedAt, firestoreSyncedAt } = {}) {
  const envelope = {
    schemaVersion,
    updatedAt,
    payload,
  };
  if (typeof migratedAt === 'number' && Number.isFinite(migratedAt)) {
    envelope.migratedAt = migratedAt;
  }
  if (typeof firestoreSyncedAt === 'number' && Number.isFinite(firestoreSyncedAt)) {
    envelope.firestoreSyncedAt = firestoreSyncedAt;
  }
  return envelope;
}

export function normalizeCloudSaveEnvelope(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!raw.payload || typeof raw.payload !== 'object') return null;
  const updatedAt = resolveUpdatedAt(raw);
  return {
    schemaVersion: Number(raw.schemaVersion) || CLOUD_SAVE_SCHEMA_VERSION,
    updatedAt,
    payload: raw.payload,
    migratedAt: Number(raw.migratedAt) || 0,
    firestoreSyncedAt: Number(raw.firestoreSyncedAt) || 0,
  };
}

export function selectLatestCloudEntry(entries = []) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  return entries.reduce((latest, entry) => {
    if (!latest) return entry;
    return resolveUpdatedAt(entry) > resolveUpdatedAt(latest) ? entry : latest;
  }, null);
}

export async function saveCloudSave(uid, payload, { mirrorToRtdb = true, markMigrated = false } = {}) {
  if (!uid) throw new Error('Missing user id.');
  if (!payload || typeof payload !== 'object') throw new Error('Missing payload.');
  const firestore = await getFirebaseFirestore();
  const updatedAt = Date.now();
  const serverTimestamp = getFirestoreServerTimestamp(firestore);
  const name = payload?.meta?.name || payload?.character?.name || 'Character';
  const characterId = ensureCharacterId(payload, name);
  const envelope = buildCloudSaveEnvelope(payload, {
    updatedAt,
    migratedAt: markMigrated ? updatedAt : undefined,
    firestoreSyncedAt: markMigrated ? updatedAt : undefined,
  });
  const firestoreEnvelope = {
    ...envelope,
    updatedAtServer: serverTimestamp || updatedAt,
  };

  await firestore
    .collection('users')
    .doc(uid)
    .collection(FIRESTORE_CHARACTERS_COLLECTION)
    .doc(characterId)
    .set(firestoreEnvelope, { merge: true });

  if (mirrorToRtdb) {
    await saveCloudCharacter(uid, characterId, payload);
    await saveCharacterIndexEntry(uid, characterId, {
      name,
      updatedAt,
    });
  }

  return { envelope: firestoreEnvelope, characterId, updatedAt };
}

export async function loadCloudSave(uid) {
  if (!uid) throw new Error('Missing user id.');
  try {
    const firestore = await getFirebaseFirestore();
    const query = await firestore
      .collection('users')
      .doc(uid)
      .collection(FIRESTORE_CHARACTERS_COLLECTION)
      .orderBy('updatedAt', 'desc')
      .limit(1)
      .get();
    if (!query.empty) {
      const doc = query.docs[0];
      const data = doc?.data ? doc.data() : null;
      const envelope = normalizeCloudSaveEnvelope(data);
      if (envelope) {
        return { source: 'firestore', data: envelope };
      }
    }
  } catch (err) {
    console.warn('Firestore load failed; will fall back to RTDB.', err);
  }

  const entries = await listCharacterIndex(uid);
  const latest = selectLatestCloudEntry(entries);
  if (!latest) return null;
  const characterId = latest?.characterId || latest?.id || '';
  if (!characterId) return null;
  const payload = coerceCloudPayload(await loadCloudCharacter(uid, characterId));
  if (!payload) return null;
  const updatedAt = resolveUpdatedAt(latest) || Date.now();
  return {
    source: 'rtdb',
    data: buildCloudSaveEnvelope(payload, { updatedAt }),
  };
}

export async function recoverFromRTDB(uid) {
  if (!uid) throw new Error('Missing user id.');
  const entries = await listCharacterIndex(uid);
  const latest = selectLatestCloudEntry(entries);
  if (!latest) return null;
  const characterId = latest?.characterId || latest?.id || '';
  if (!characterId) return null;
  const payload = coerceCloudPayload(await loadCloudCharacter(uid, characterId));
  if (!payload) return null;
  const { envelope } = await saveCloudSave(uid, payload, { mirrorToRtdb: false, markMigrated: true });
  return envelope;
}
