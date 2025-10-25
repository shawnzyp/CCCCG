/**
 * Global application event bus built on top of a single {@link EventTarget} instance.
 *
 * The helpers below provide typed publish / subscribe utilities for the shared
 * bus so that modules do not need to coordinate DOM targets manually. Each
 * channel listed in {@link EVENT_CHANNELS} documents the intended detail payload
 * for the corresponding events.
 */

/**
 * @typedef {Object} PlayerCreditPayload
 * @property {string} account
 * @property {string} type
 * @property {string} sender
 * @property {string} ref
 * @property {string} txid
 * @property {number} amount
 * @property {string} memo
 * @property {string} timestamp
 * @property {string} player
 */

/**
 * @typedef {Object} PlayerCreditEventDetail
 * @property {PlayerCreditPayload|null} payload
 * @property {PlayerCreditPayload[]} history
 * @property {{ event: string } & Record<string, unknown>} meta
 */

/**
 * @typedef {Object} ToastShownDetail
 * @property {string} message
 * @property {Record<string, unknown>} options
 */

/**
 * @typedef {Object} ToastDismissedDetail
 */

/**
 * @typedef {Object} CreditsLedgerDetail
 * @property {number} amount
 * @property {number} balance
 * @property {string} reason
 * @property {number} ts
 */

/**
 * @typedef {Object} CharacterAutosaveDetail
 * @property {string} name
 * @property {number} ts
 */

/**
 * @typedef {Record<string, unknown>} CatalogSubmitDetail
 */

/**
 * Map of event channel names to their detail payload shapes.
 *
 * @typedef {Object} EventDetailMap
 * @property {PlayerCreditEventDetail} 'player-credit:update'
 * @property {PlayerCreditEventDetail} 'player-credit:sync'
 * @property {ToastShownDetail} 'cc:toast-shown'
 * @property {ToastDismissedDetail} 'cc:toast-dismissed'
 * @property {string} 'character-saved'
 * @property {string} 'character-deleted'
 * @property {CharacterAutosaveDetail} 'character-autosaved'
 * @property {CreditsLedgerDetail} 'credits-ledger-updated'
 * @property {CatalogSubmitDetail} 'dm:catalog-submit'
 */

/**
 * Channels available on the event bus.
 */
export const EVENT_CHANNELS = Object.freeze({
  PLAYER_CREDIT_UPDATE: 'player-credit:update',
  PLAYER_CREDIT_SYNC: 'player-credit:sync',
  TOAST_SHOWN: 'cc:toast-shown',
  TOAST_DISMISSED: 'cc:toast-dismissed',
  CHARACTER_SAVED: 'character-saved',
  CHARACTER_DELETED: 'character-deleted',
  CHARACTER_AUTOSAVED: 'character-autosaved',
  CREDITS_LEDGER_UPDATED: 'credits-ledger-updated',
  DM_CATALOG_SUBMIT: 'dm:catalog-submit',
});

const noop = () => {};

const createFallbackTarget = () => ({
  addEventListener: noop,
  removeEventListener: noop,
  dispatchEvent: () => false,
});

const busTarget = (() => {
  if (typeof EventTarget === 'function') {
    try {
      return new EventTarget();
    } catch {}
  }
  if (typeof window !== 'undefined' && typeof window.EventTarget === 'function') {
    try {
      return new window.EventTarget();
    } catch {}
  }
  return createFallbackTarget();
})();

/**
 * Returns the shared {@link EventTarget} powering the application event bus.
 *
 * @returns {EventTarget}
 */
export const getEventBusTarget = () => busTarget;

/**
 * Publishes an event on the shared bus.
 *
 * @template {keyof EventDetailMap} T
 * @param {T} type
 * @param {EventDetailMap[T]} detail
 * @returns {boolean}
 */
export const publish = (type, detail) => {
  if (typeof CustomEvent !== 'function') return false;
  try {
    return busTarget.dispatchEvent(new CustomEvent(type, { detail }));
  } catch {
    return false;
  }
};

/**
 * Subscribes to an event on the shared bus.
 *
 * The provided listener receives the {@link CustomEvent} so that callers can
 * access metadata such as the original `detail` payload.
 *
 * @template {keyof EventDetailMap} T
 * @param {T} type
 * @param {(event: CustomEvent<EventDetailMap[T]>) => void} listener
 * @param {boolean|AddEventListenerOptions} [options]
 * @returns {() => void}
 */
export const subscribe = (type, listener, options) => {
  if (!listener || typeof listener !== 'function') {
    return noop;
  }

  const target = getEventBusTarget();
  if (!target || typeof target.addEventListener !== 'function' || typeof target.removeEventListener !== 'function') {
    return noop;
  }

  target.addEventListener(type, listener, options);
  return () => {
    try {
      target.removeEventListener(type, listener, options);
    } catch {}
  };
};

/**
 * Subscribes to an event for a single invocation.
 *
 * @template {keyof EventDetailMap} T
 * @param {T} type
 * @param {(event: CustomEvent<EventDetailMap[T]>) => void} listener
 * @returns {() => void}
 */
export const subscribeOnce = (type, listener) => {
  if (!listener || typeof listener !== 'function') {
    return noop;
  }
  const target = getEventBusTarget();
  if (!target || typeof target.addEventListener !== 'function') {
    return noop;
  }
  const wrapped = (event) => {
    try {
      listener(event);
    } finally {
      try {
        target.removeEventListener(type, wrapped);
      } catch {}
    }
  };
  target.addEventListener(type, wrapped, { once: true });
  return () => {
    try {
      target.removeEventListener(type, wrapped);
    } catch {}
  };
};

if (typeof globalThis !== 'undefined') {
  const api = {
    publish,
    subscribe,
    subscribeOnce,
    getEventBusTarget,
    EVENT_CHANNELS,
  };
  const existing = globalThis.ccEventBus;
  if (!existing || typeof existing !== 'object') {
    try {
      Object.defineProperty(globalThis, 'ccEventBus', {
        value: api,
        enumerable: false,
        configurable: false,
        writable: false,
      });
    } catch {
      globalThis.ccEventBus = api;
    }
  } else {
    Object.assign(existing, api);
  }
}

export default {
  publish,
  subscribe,
  subscribeOnce,
  getEventBusTarget,
  EVENT_CHANNELS,
};
