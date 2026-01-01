# DM Credit Deposit Tool

This reference describes the GM-facing credit deposit modal that lives in `index.html`
(lines 1569-1689) and its supporting logic in `scripts/dm.js`.

## Feature highlights

- **Deterministic account numbers.** Character names are hashed via
  `computeCreditAccountNumber` so every player always receives the same account
  number when the modal is opened. This logic lives around `scripts/dm.js:428-445`.
- **Dynamic player list.** The account dropdown calls `listCharacters()` when the
  modal opens and replaces the placeholder option with current cloud saves.
- **Sender-specific identifiers.** The reference number and footer ID include the
  sender prefix via `generateCreditReference` / `generateCreditTxid` (mapping known
  sender IDs like `OMNI`, `PFV`, `GREY`, `ANON` and falling back to the uppercased sender
  or `DM`), ensuring IDs match the selected origin (`scripts/dm.js:4120-4133`).
- **Credit transfer workflow.** `handleCreditSubmit` loads the selected cloud save,
  applies deposit/debit deltas, records the campaign log entry, and saves via
  `saveCloud` (`scripts/dm.js:652-707`).

## Manual QA recipe

1. Run `node tools/dev-server.mjs --port 4174` and open `http://127.0.0.1:4174/index.html` in a browser.
2. Unlock the DM tools (`DM PIN` is `123123`), open the DM menu, and choose
   **Credit Deposit**.
3. Verify the account dropdown populates with player saves. Select a player and confirm
   their account number persists after closing/reopening the modal.
4. Enter a deposit value and choose different senders to ensure the reference ID and footer ID
   update with the matching prefix.
5. Submit the transfer and confirm the success toast plus the reset state (`Submit` disabled,
   amount cleared).

## Screenshot

A regression snapshot of the modal was captured for this change and is attached to the pull
request (artifact: `browser:/invocations/cuhwhqbb/artifacts/artifacts/dm-credit-modal.png`).

## Player credit events

The player-facing modal now emits DOM events so other UI features can respond when new
transactions arrive.

- `PLAYER_CREDIT_EVENTS.UPDATE` (`player-credit:update`) fires after any single payload is
  rendered through `handleUpdate`. The event `detail` contains the sanitized `payload`, a
  cloned `history` array, and a `meta` object describing the trigger (e.g. `source`, `reveal`,
  `persist`, and `dmSession`).
- `PLAYER_CREDIT_EVENTS.SYNC` (`player-credit:sync`) fires whenever batches of history entries
  are hydrated or synchronized (including storage events that clear history).

Consumers can import the constant from `scripts/player-credit-events.js` and listen on
`document` or `window`. See `scripts/main.js` for an example that highlights the
player-tools drawer tab until the player opens it.
