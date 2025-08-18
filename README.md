# Catalyst Core Character Tracker

Hosted version of the mobile-optimized character sheet for GitHub Pages.

## Recent Updates

- Removed the legacy print/PDF export controls.
- Added a tier-based experience tracker with add/remove controls.
- Streamlined the encounter tracker with turn highlighting and round persistence.

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
