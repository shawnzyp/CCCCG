# Catalyst Core Character Tracker

Hosted version of the mobile-optimized character sheet for GitHub Pages.

## Offline support

The service worker pre-caches every asset listed in `asset-manifest.json` so the
app is fully available after a user's first visit. Run
`npm run build:manifest` whenever static files change to refresh the manifest
and ensure updated assets are synchronized to clients on subsequent visits.

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
    }
  }
}
```

The application communicates with the database using its public REST API.

## DM tools access

The DM tools are protected by a shared PIN defined in `scripts/dm-pin.js`. You
can further restrict access so the tools only appear on a single device by
setting `DM_DEVICE_FINGERPRINT` in the same file. To generate the fingerprint
string, open the site on the allowed device and run
`window.computeDmDeviceFingerprint()` in the browser console. Copy the returned
value into `DM_DEVICE_FINGERPRINT`. The DM tools menu will be hidden on devices
whose fingerprint does not match.

