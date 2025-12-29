export async function claimCharacterLock(db, characterId, uid) {
  if (!db) throw new Error('Database required');
  if (!characterId) throw new Error('Character id required');
  if (!uid) throw new Error('User id required');
  const ref = db.ref(`characterClaims/${characterId}`);
  const result = await ref.transaction(current => {
    if (!current || current === uid) {
      return uid;
    }
    return;
  });
  if (!result.committed) {
    throw new Error('Character already claimed');
  }
  return true;
}
