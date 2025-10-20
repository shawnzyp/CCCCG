# Player Credit Modal Events

The player-facing credit modal broadcasts DOM events whenever a transaction is
rendered so other UI features can react without reaching into the modal’s
internal state.

## Event constants

`PLAYER_CREDIT_EVENTS` is exported from
`scripts/player-credit-modal.js` for reuse in other modules:

```js
import { PLAYER_CREDIT_EVENTS } from './player-credit-modal.js';
```

The constant exposes the following event names:

| Key   | Event name             | Description |
|-------|------------------------|-------------|
| UPDATE | `player-credit:update` | Fired after the modal renders a sanitized payload via `handleUpdate`. The `detail` object includes a `payload` property with the sanitized transaction and a `history` array of the most recent entries. |
| SYNC  | `player-credit:sync`    | Fired after `syncHistoryFromEntries` replaces the transaction history (for example, when DM tools broadcast a batch). The `detail` contains the newest `latest` entry along with the full `history` slice. |

## Usage pattern

Listen for the events on `window` (or `document`) and update indicators or
badges accordingly:

```js
window.addEventListener(PLAYER_CREDIT_EVENTS.UPDATE, (event) => {
  const { payload } = event.detail;
  // Update a badge with the most recent deposit amount.
  updateBadge(Math.abs(payload.amount));
});

window.addEventListener(PLAYER_CREDIT_EVENTS.SYNC, (event) => {
  const { history } = event.detail;
  // Refresh any history-driven UI using the sanitized list.
  refreshHistory(history);
});
```

The modal always publishes sanitized values (amounts as numbers, timestamps in
ISO 8601 format, trimmed memo text) so downstream consumers can safely render
data without duplicating validation logic.
