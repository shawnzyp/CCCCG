# Catalyst Core Character Tracker

Hosted version of the mobile-optimized character sheet for GitHub Pages.

## Offline support

The service worker pre-caches every asset listed in `asset-manifest.json` so the
app is fully available after a user's first visit. On load, the app now
preloads the entire manifest into the Cache Storage API and surfaces a
**Download offline assets** button inside the cloud sync panel so players can
manually refresh their local bundle at any time. Run `npm run build` to
regenerate the compiled assets before deploying. This pipeline will:

1. Normalize the gear catalog CSV exports into `data/gear-catalog.json` via
   `npm run build:catalog`.
2. Bundle interactive headers and animated titles with esbuild.
3. Transcode the launch animation into lightweight WebM/MP4 assets with
   `npm run build:media` (requires `ffmpeg` on your PATH).
4. Refresh the precache manifest with `npm run build:manifest`.

If you only need to refresh the manifest, the legacy
`npm run build:manifest` command is still available.

## Storage

Saved characters are stored locally in your browser using `localStorage` and synchronized through a Firebase Realtime Database.

### Cloud saves

The app requires a Firebase Realtime Database for real-time updates. To
configure the database:

1. Create a Firebase project and enable the **Realtime Database**.
2. Use the following database rules to allow read and write access:

```json
{
  "rules": {
    "saves": {
      ".read": true,
      ".write": true
    },
    "dm-notifications": {
      ".read": true,
      ".write": true
    }
  }
}
```

The application communicates with the database using its public REST API.

## DM tools access

The DM tools are protected by a shared PIN stored as a salted PBKDF2 hash in
a dedicated credential store that `scripts/dm-pin.js` synchronizes with the
cloud backend.

### Rotating the DM PIN

1. Run `node tools/generate-dm-pin.js <new-pin>` to print a new hash
   configuration (optional second argument overrides the default 120000 PBKDF2
   iterations).
2. Upload the generated credential JSON to the DM credential path in the
   database (`/dmCredentials/<username>`). The app will pull the new value and
   update its local cache automatically.
3. (Optional) Update the bootstrap record in `scripts/dm-pin.js` if you want a
   new default for offline development.
4. Commit the change and redeploy the site.

## Audio cues

Call `window.playTone(cueId)` to play lightweight feedback sounds across the
app. The following cue identifiers are available for use in features:

* `success`/`info` — success toast chime.
* `warn`/`warning` — warning tone.
* `error`/`danger`/`failure` — error buzzer.
* `dm-roll` — confirmation ping for DM dice rolls.
* `coin-flip` — staccato flip result tone.
* `campaign-log:add` — soft chime when appending to the campaign log.

Each cue is preloaded on first use so subsequent calls are instant.

### Toast notifications

Use the global `toast(message, options)` helper to surface inline notifications. Toasts
are queued and shown sequentially: if one is already visible, the next call waits until
the current toast is dismissed before rendering. The helper accepts either a numeric
duration (in milliseconds) or an options object with the following properties:

* `type` – Applies the visual style and tone (`'info'`, `'success'`, `'error'`, etc.).
* `duration` – Auto-dismiss timer in milliseconds. Set to `0` (or any non-positive or
  non-finite value) to require manual dismissal.
* `icon` – Optional icon name or CSS value. Provide a short name such as `'info'` or
  `'success'` to map to the corresponding `--icon-*` token, `'none'` to hide the icon, or
  any valid `url(...)`/`var(...)` string for custom artwork.
* `html` – Custom markup for the toast body. When omitted, the provided message is
  rendered as plain text.
* `action` – Primary action descriptor. Supply an object with a `label` and `callback`
  function (invoked with `{ message, options }`). Optional `ariaLabel` and
  `dismissOnAction` (default `true`) keys are supported for accessibility and
  persistence control.

The convenience method `dismissToast()` immediately hides the active toast and advances
the queue.

