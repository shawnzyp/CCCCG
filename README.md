# Catalyst Core Character Tracker

Hosted version of the mobile-optimized character sheet for GitHub Pages.

## Offline support

The service worker pre-caches every asset listed in `asset-manifest.json` so the
app is fully available after a user's first visit. Run `npm run build` to
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

The DM tools are protected by a shared PIN represented as a salted PBKDF2 hash
in `scripts/dm-pin.js`. You can further restrict access so the tools only appear
on a single device by setting `DM_DEVICE_FINGERPRINT` in the same file. To
generate the fingerprint string, open the site on the allowed device and run
`window.computeDmDeviceFingerprint()` in the browser console. Copy the returned
value into `DM_DEVICE_FINGERPRINT`. The DM tools menu will be hidden on devices
whose fingerprint does not match.

### Rotating the DM PIN

1. Run `node tools/generate-dm-pin.js <new-pin>` to print a new hash
   configuration (optional second argument overrides the default 120000 PBKDF2
   iterations).
2. Replace the `DM_PIN` export in `scripts/dm-pin.js` with the generated JSON.
3. Commit the change and redeploy the site.

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

