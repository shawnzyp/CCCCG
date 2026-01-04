import { getFirebaseDatabase, getFirebaseFirestore } from './auth.js';
import {
  buildCloudSaveEnvelope,
  normalizeCloudSaveEnvelope,
  resolveUpdatedAt,
  selectLatestCloudEntry,
} from './cloud-save-helpers.js';
const FIRESTORE_SAVE_COLLECTION = 'saves';
const FIRESTORE_PRIMARY_DOC = 'primary';

function getFirestoreServerTimestamp(firestore) {
  if (firestore?.FieldValue?.serverTimestamp && typeof firestore.FieldValue.serverTimestamp === 'function') {
    return firestore.FieldValue.serverTimestamp();
  }
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

async function loadRtdbEnvelope(uid) {
  const db = await getFirebaseDatabase();
  const ref = db.ref(`users/${uid}/saves/primary`);
  const snapshot = await ref.once('value');
  const val = snapshot.val();
  if (val === null || val === undefined) return null;
  if (typeof val === 'object' && val.payload) {
    return normalizeCloudSaveEnvelope(val);
  }
  const payload = coerceCloudPayload(val);
  if (!payload) return null;
  return buildCloudSaveEnvelope(payload, { updatedAt: resolveUpdatedAt(payload) || Date.now() });
}

export async function saveCloudSave(uid, envelope, { mirrorToRtdb = true, markMigrated = false } = {}) {
  if (!uid) throw new Error('Missing user id.');
  const normalizedEnvelope = normalizeCloudSaveEnvelope(envelope)
    || buildCloudSaveEnvelope(envelope?.payload || envelope, { updatedAt: Date.now() });
  if (!normalizedEnvelope?.payload) throw new Error('Missing payload.');
  const firestore = await getFirebaseFirestore();
  const updatedAt = Date.now();
  const serverTimestamp = getFirestoreServerTimestamp(firestore);
  const firestoreEnvelope = {
    ...normalizedEnvelope,
    updatedAt,
    updatedAtServer: serverTimestamp || updatedAt,
  };
  if (markMigrated) {
    firestoreEnvelope.migratedAt = updatedAt;
    firestoreEnvelope.firestoreSyncedAt = updatedAt;
  }

  await firestore
    .collection('users')
    .doc(uid)
    .collection(FIRESTORE_SAVE_COLLECTION)
    .doc(FIRESTORE_PRIMARY_DOC)
    .set(firestoreEnvelope, { merge: true });

  if (mirrorToRtdb) {
    const db = await getFirebaseDatabase();
    await db.ref(`users/${uid}/saves/primary`).set(normalizedEnvelope.payload);
  }

  return { envelope: firestoreEnvelope, updatedAt };
}

export async function loadCloudSave(uid) {
  if (!uid) throw new Error('Missing user id.');
  try {
    const firestore = await getFirebaseFirestore();
    const doc = await firestore
      .collection('users')
      .doc(uid)
      .collection(FIRESTORE_SAVE_COLLECTION)
      .doc(FIRESTORE_PRIMARY_DOC)
      .get();
    if (doc?.exists) {
      const data = doc?.data ? doc.data() : null;
      const envelope = normalizeCloudSaveEnvelope(data);
      if (envelope) {
        return { source: 'firestore', data: envelope };
      }
    }
  } catch (err) {
    console.warn('Firestore load failed; will fall back to RTDB.', err);
  }

  const fallback = await loadRtdbEnvelope(uid);
  if (!fallback) return null;
  return { source: 'rtdb', data: fallback };
}

export async function recoverFromRTDB(uid) {
  if (!uid) throw new Error('Missing user id.');
  const fallback = await loadRtdbEnvelope(uid);
  if (!fallback?.payload) return null;
  const { envelope } = await saveCloudSave(uid, fallback, { mirrorToRtdb: false, markMigrated: true });
  return envelope;
}
