# Catalyst Core Character Tracker

## Overview

Catalyst Core Character Tracker is a mobile friendly character sheet and campaign companion. The app stores each character on the device first and keeps a cloud copy for syncing across devices, recovery after local storage loss, and collaboration with DM tools.

## Core Design Principles

- Local first. Your device always has the authoritative working copy.
- Cloud first indexing. The cloud maintains indices for discovery, recovery, and multi device access.
- No silent overwrites. The app never replaces a character without an explicit user decision.
- Explicit conflict handling. Conflicts are surfaced and require user choices.
- Offline continuity. The sheet remains usable without network access.

## Authentication and Accounts

- Authentication uses Firebase Auth with a username and password only.
- Usernames are normalized to lowercase, spaces become underscores, and only letters, numbers, and underscores are allowed. Length is 3 to 20 characters.
- The normalized username is mapped to a synthetic email address in the form `username@ccccg.local` for Firebase Auth.
- Usernames are unique and cannot be changed after claim.
- There is no email login and no password reset flow. Account recovery requires the correct credentials.

## User Roles and Permissions

- Player. Can read and write their own data and manage their own characters.
- DM or Admin. Users with `auth.token.admin === true` can read and write across all user paths, generate claim tokens, and use administrative tools. This role does not grant silent ownership changes.

## Local Storage System

- Characters, UI state, autosave metadata, and last synced timestamps are stored in `localStorage`.
- Local saves are used for immediate editing and offline play.
- Clearing browser storage removes local copies only and does not delete cloud data.

## Cloud Sync Architecture

- Firebase Realtime Database stores the cloud copy of characters, autosaves, indices, and history.
- The app uses the Firebase REST API, authenticated with the user token from Firebase Auth.
- Cloud indices are used to list characters, autosaves, and ownership without scanning full payloads.
- Local and cloud timestamps are compared using server timestamps for authoritative ordering.

## Character Lifecycle

1. Create a character locally or import a JSON file.
2. Save locally and optionally push to the cloud when logged in.
3. The cloud stores the full payload, plus index entries for listing.
4. Autosaves and manual saves are tracked for recovery.
5. When loading, the app compares local and cloud versions and prompts on conflicts.

## Autosaves and History

- Autosaves run while you edit and are stored in the cloud per character.
- The autosaves index tracks the latest autosave timestamp and label for quick recovery.
- Conflict backups are written to the history path before any overwrite decision.

## Conflict Detection and Resolution

- Each character tracks `meta.updatedAt` and `meta.updatedAtServer` in the payload.
- The app stores a local `lastSyncedAt` value per character.
- If both local and cloud timestamps are newer than `lastSyncedAt`, the app shows a conflict modal with choices: Keep Cloud, Keep Local, or Merge Later.
- Before resolving, the app writes local conflict snapshots to `localStorage` and cloud conflict snapshots to `/history/{uid}/{characterId}/conflict/{timestamp}`.
- There is no automatic merge.

## Claiming and Migration

- Pre account characters can be claimed through the claim modal after login.
- Claiming links a character to the current account by setting the owner and writing cloud copies.
- DMs can generate claim tokens for a specific character and target user id.
- Tokens are one time, expire at a specified timestamp, and can only be consumed by the target user.

## Import and Export JSON

- Export JSON saves the current character payload to a file.
- Import JSON accepts a file and validates the payload, then migrates it to the current schema.
- Imported characters receive a new local copy and can be pushed to the cloud after login.

## Offline Mode and Asset Caching

- A service worker precaches every asset listed in `asset-manifest.json`.
- On load, the app preloads the manifest into Cache Storage.
- The cloud sync panel includes a Download offline assets button to refresh the cached bundle.
- Run `npm run build` to regenerate compiled assets. The build pipeline performs:
  1. Catalog normalization with `npm run build:catalog`.
  2. Header and animated title bundling with esbuild.
  3. Launch animation transcoding with `npm run build:media`.
  4. Font packaging with `npm run build:fonts`.
  5. Precache manifest refresh with `npm run build:manifest`.

## DM and Admin Tools

- DM tools require a shared PIN stored as a salted PBKDF2 hash in `scripts/dm-pin.js`.
- Admin users can generate claim tokens, access notifications, and review roster data.
- DM access does not change character ownership without an explicit claim or import.

## Security Model

- Firebase rules enforce ownership and role based overrides via `auth.token.admin`.
- Usernames are locked to a single uid once claimed.
- Character payloads include `meta.ownerUid` to support ownership checks and debugging.
- No cross user writes are allowed without admin claims.

## Data Model and Firebase Paths

- `/users/{uid}/profile` contains `{ username, createdAt }`.
- `/users/{uid}/charactersIndex/{characterId}` contains `{ name, updatedAt, updatedAtServer }`.
- `/users/{uid}/autosaves/{characterId}` contains `{ latestTs, name, updatedAt, updatedAtServer }`.
- `/characters/{uid}/{characterId}` contains the full character payload including `meta.updatedAt`, `meta.updatedAtServer`, `schemaVersion`, and `meta.ownerUid`.
- `/history/{uid}/{characterId}/conflict/{timestamp}` stores conflict backups before overwrites.
- `/claimTokens/{token}` stores `{ sourceUid, characterId, targetUid, expiresAt, createdAt, consumedAt, consumedBy }`.
- `/usernames/{normalizedUsername}` stores the uid that owns the username.

## Sync Guarantees and Limitations

- Sync is best effort and relies on network availability.
- No silent overwrites, no automatic conflict merges, and no hidden deletes.
- The cloud copy is updated only on explicit saves, autosaves, and sync actions.
- Local storage remains authoritative until a conflict decision is made.

## Device and Browser Behavior

- Each device keeps its own local cache and `lastSyncedAt` values.
- Logging in from another device pulls cloud data but does not copy local state from other devices.
- Clearing storage or using private browsing removes local data.

## Intentional Constraints

- No email login.
- No password reset.
- No automatic conflict merging.
- No account recovery without valid credentials.

## Troubleshooting

- If cloud sync fails, keep working locally and retry once online.
- If a character does not appear after login, use Import / Claim to scan cloud and legacy sources.
- If a claim token fails, confirm it is unexpired and targeted to the current uid.
- If local storage is cleared, log in and open the cloud list to recover.
- API key restrictions are managed in Google Cloud Console under APIs & Services -> Credentials.
- If the GitHub Pages build is stuck on old config, clear the service worker cache for the site and reload.
- Authorized domains for Firebase Auth must include shawnzyp.github.io.

## Schema Versioning and Migration

- Character payloads include `schemaVersion` and `meta` fields.
- On load, the app migrates older payloads to the current schema using `scripts/characters.js`.
- Migrations preserve data and update metadata such as `meta.updatedAt` and `meta.updatedAtServer`.

## Firebase Rules Example

Use the following database rules. These match `firebase.rules.json`.

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "characters": {
      "$uid": {
        ".read": "auth != null && (auth.uid === $uid || auth.token.admin === true)",
        ".write": "auth != null && (auth.uid === $uid || auth.token.admin === true)"
      }
    },
    "history": {
      "$uid": {
        ".read": "auth != null && (auth.uid === $uid || auth.token.admin === true)",
        ".write": "auth != null && (auth.uid === $uid || auth.token.admin === true)"
      }
    },
    "users": {
      "$uid": {
        ".read": "auth != null && (auth.uid === $uid || auth.token.admin === true)",
        ".write": "auth != null && (auth.uid === $uid || auth.token.admin === true)"
      }
    },
    "usernames": {
      "$name": {
        ".read": "auth != null",
        ".write": "auth != null && ((!data.exists() && newData.val() === auth.uid) || data.val() === auth.uid)"
      }
    },
    "characterClaims": {
      "$characterId": {
        ".read": "auth != null && auth.token.admin === true",
        ".write": "auth != null"
      }
    },
    "claimTokens": {
      "$token": {
        ".read": "auth != null && (auth.token.admin === true || data.child('targetUid').val() === auth.uid)",
        ".write": "auth != null && ((auth.token.admin === true && !data.exists() && !newData.child('consumedAt').exists() && newData.child('consumedBy').val() === null) || (auth.uid === data.child('targetUid').val() && !data.child('consumedAt').exists() && newData.child('consumedAt').exists() && newData.child('consumedBy').val() === auth.uid && newData.child('sourceUid').val() === data.child('sourceUid').val() && newData.child('characterId').val() === data.child('characterId').val() && newData.child('targetUid').val() === data.child('targetUid').val() && newData.child('expiresAt').val() === data.child('expiresAt').val() && newData.child('createdAt').val() === data.child('createdAt').val()))"
      }
    },
    "autosaves": {
      "$uid": {
        ".read": "auth != null && (auth.uid === $uid || auth.token.admin === true)",
        ".write": "auth != null && (auth.uid === $uid || auth.token.admin === true)"
      }
    }
  }
}
```

## Firestore Rules Example

Use the following Firestore rules for account creation and username reservation. These match `firestore.rules`.

```firestore
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /usernames/{username} {
      allow read: if request.auth != null;
      allow create, update: if request.auth != null
        && request.resource.data.username == username
        && request.resource.data.uid == request.auth.uid;
    }

    match /users/{userId} {
      allow create, update: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

Note: Realtime Database rules are configured separately from Firestore rules. If you still see "Missing or insufficient permissions," confirm the app is pointed at the correct Firebase project in the Firebase console.

## Developer Notes

### DM tools access

The DM tools are protected by a shared PIN represented as a salted PBKDF2 hash in `scripts/dm-pin.js`.

### Discord webhook testing

Use an absolute Discord webhook URL. A placeholder like `YOUR_DISCORD_WEBHOOK_URL_HERE` becomes a relative URL and will post to GitHub Pages.

Browser console test (localhost only):

```
await import('./scripts/discord-webhook-dev.js');
await window.__CCCG_TEST_DISCORD_WEBHOOK__('https://discord.com/api/webhooks/123/abc', {
  content: 'CCCG roll test from browser.',
});
```

curl test:

```
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"content":"CCCG roll test from curl."}' \
  "https://discord.com/api/webhooks/123/abc"
```

Note: Browsers block cross origin webhook requests with CORS. Use a server or Worker to proxy the request. The Worker allowlist includes https://shawnzyp.github.io and localhost origins.

Recommended Cloudflare Worker proxy:

Create a Worker at `workers/discord-roll-worker.js` and deploy it with Wrangler. Then POST to `/roll` with either a Discord payload or a roll payload. Configure the app meta tag `discord-proxy-url` to point at the Worker /roll URL.

Wrangler config snippet:

```
name = "ccccg-discord-roll"
main = "workers/discord-roll-worker.js"
compatibility_date = "2025-01-22"
```

Set the secret:

```
wrangler secret put DISCORD_WEBHOOK_URL
```

Optional shared secret:

```
wrangler secret put SHARED_SECRET
```

Deploy:

```
wrangler deploy
```

Worker request example:

```
fetch('https://your-worker.yourdomain.workers.dev/roll', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CCCG-Secret': 'your-shared-secret'
  },
  body: JSON.stringify({
    roll: {
      who: 'Vigilante',
      expr: '1d20+5',
      total: 17,
      breakdown: 'd20 (12) + 5'
    }
  })
});
```

#### Rotating the DM PIN

1. Run `node tools/generate-dm-pin.js <new-pin>` to print a new hash configuration. The optional second argument overrides the default 120000 PBKDF2 iterations.
2. Replace the `DM_PIN` export in `scripts/dm-pin.js` with the generated JSON.
3. Commit the change and redeploy the site.

### Audio cues

Call `window.playTone(cueId)` to play lightweight feedback sounds across the app. The following cue identifiers are available for use in features:

- `success` or `info` for success toast chime.
- `warn` or `warning` for warning tone.
- `error`, `danger`, or `failure` for error buzzer.
- `dm-roll` for confirmation ping for DM dice rolls.
- `coin-flip` for staccato flip result tone.
- `campaign-log:add` for soft chime when appending to the campaign log.

Each cue is preloaded on first use so subsequent calls are instant.

### Toast notifications

Use the global `toast(message, options)` helper to surface inline notifications. Toasts are queued and shown sequentially. If one is already visible, the next call waits until the current toast is dismissed before rendering. The helper accepts either a numeric duration in milliseconds or an options object with the following properties:

- `type` applies the visual style and tone such as `info`, `success`, or `error`.
- `duration` is the auto dismiss timer in milliseconds. Set to `0` or any non positive or non finite value to require manual dismissal.
- `icon` is an optional icon name or CSS value. Provide a short name such as `info` or `success` to map to the corresponding `--icon-*` token. Use `none` to hide the icon or any valid `url(...)` or `var(...)` string for custom artwork.
- `html` is custom markup for the toast body. When omitted, the provided message is rendered as plain text.
- `action` is a primary action descriptor. Supply an object with a `label` and `callback` function invoked with `{ message, options }`. Optional `ariaLabel` and `dismissOnAction` keys are supported for accessibility and persistence control.

The convenience method `dismissToast()` immediately hides the active toast and advances the queue.
