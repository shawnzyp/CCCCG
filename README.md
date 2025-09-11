# Catalyst Core Character Tracker

Hosted version of the mobile-optimized character sheet for GitHub Pages.

## Storage

Saved characters are stored locally in your browser using `localStorage`.

### Cloud saves

The app can also synchronize saves through a Firebase Realtime Database. To
enable this feature:

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

## Ask the Wizard

A simple DM tool powered by Firebase's Gemini API. The "Ask the Wizard" section
in the app calls the `gemini-2.5-flash-image-preview` model for each prompt you
send and can display both text and image responses. Configure your Firebase
project and update `scripts/wizard.js` with your credentials to enable the
tool.

