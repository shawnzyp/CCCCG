# Catalyst Core Character Tracker

Hosted version of the mobile-optimized character sheet for GitHub Pages.

## CCCCG Features

- Auto-fills classification perks with matching resistances and vulnerabilities and surfaces primary/secondary power-style and origin perks
- Offers origin story options and extensive character questions for backstory building
- Provides skill proficiency tracking with auto-calculated modifiers
- Tracks cinematic points alongside resistances and vulnerabilities in the combat tab
- Logs downtime activities like Research, Training, and Media Control for campaign bookkeeping
- Captures all CCCCG ability, skill, and narrative inputs across the Combat, Abilities, Powers, Gear, and Story tabs

## Firebase Configuration

Firebase settings are now stored in a standalone `firebase-config.json` file. The
application fetches this file at runtime and initializes Firebase with the
retrieved values.

For different environments you can provide alternate configuration values in
several ways:

1. **Replace the file** – deploy a different `firebase-config.json` alongside
   `Index.html`.
2. **Point to another file** – set a global `FIREBASE_CONFIG_URL` before the
   main script loads to fetch a different JSON file (e.g. `firebase-config.prod.json`).
3. **Override individual fields** – define a global `FIREBASE_CONFIG` object to
   merge/override values from the fetched JSON. This pattern works well with
   environment variables injected by your hosting platform.

Example:

```html
<script>
  window.FIREBASE_CONFIG = {
    apiKey: '$FIREBASE_API_KEY',
    authDomain: '$FIREBASE_AUTH_DOMAIN'
  };
</script>
```
