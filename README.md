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

## Gear classification vocabulary

The catalog build normalizes every item into a controlled set of
`classifications` so search, filters, and character gating can reason about the
gear consistently. The script infers tags from the source CSV using section,
type, and keyword heuristics. The available tags are:

| Tag | Meaning |
| --- | --- |
| `useful` | Items that originate from the **Useful** section of the source CSV. |
| `gear` | Entries from the **Gear** section. |
| `catalyst` | Entries from the **Catalyst** section. |
| `weapon` | Weapon-type gear (automatically also tagged `offense`). |
| `armor` | Armor entries. |
| `shield` | Shield entries. |
| `utility` | Utility-type gear providing general tools or support. |
| `item` | Generic items without a more specific type. |
| `melee` | Weapons with close-combat language (blade, gauntlet, spear, etc.). |
| `ranged` | Weapons that reference shots, launchers, bows, or other ranged cues. |
| `offense` | Weapons or gear that emphasize dealing damage. |
| `defense` | Protective equipment or entries that focus on shielding, resistance, or mitigation. |
| `support` | Boons that assist allies, coordination, or buffs. |
| `healing` | Medical and restorative equipment. |
| `mobility` | Gear that enhances movement, teleportation, or traversal. |
| `stealth` | Items that aid stealth, invisibility, or concealment. |
| `control` | Effects that hinder, restrain, or disable foes. |
| `tech` | Clearly technological gadgets, drones, or devices. |
| `magic` | Items with explicitly arcane, mystical, or enchanted themes. |
| `psionic` | Gear flavored around psychic or telepathic effects. |
| `chemical` | Chemical, toxic, or pharmaceutical consumables. |
| `consumable` | Single-use or charge-based entries that are expended on use. |

When new items are added to the CSV, ensure their copy includes descriptive
language that lets the build heuristics assign the right tags, or supply
explicit classifications in the CSV to supplement the inferred values. These
descriptors are treated as non-restrictive; gating only applies when a catalog
entry lists additional classification tokens outside of this vocabulary.

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

