import './cloud-outbox-shared.js';

const shared = (typeof globalThis !== 'undefined' && globalThis.cccgCloudOutbox)
  ? globalThis.cccgCloudOutbox
  : null;

if (!shared) {
  throw new Error('Cloud outbox helpers unavailable');
}

export const {
  OUTBOX_DB_NAME,
  OUTBOX_VERSION,
  OUTBOX_STORE,
  OUTBOX_PINS_STORE,
  openOutboxDb,
  addOutboxEntry,
  getOutboxEntries,
  deleteOutboxEntry,
  createCloudSaveOutboxEntry,
  createCloudPinOutboxEntry,
} = shared;
