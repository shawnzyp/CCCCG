# Catalyst Core Character Tracker

Hosted version of the mobile-optimized character sheet for GitHub Pages.

## Storage

Saved characters are stored locally in your browser using `localStorage`.

### Cloud saves

The app can also synchronize saves through a Firebase Realtime Database. To
enable this feature:

1. Create a Firebase project and enable **Authentication** (any provider or
   anonymous sign-in) and the **Realtime Database**.
2. Add `https://ccccg-7d6b6.firebaseapp.com/__/auth/handler` to the list of
   authorized domains in the Firebase Auth console.
3. Use the following database rules to allow each authenticated user to
   access only their own saves while denying all other reads and writes. A DM
   account with a `dm` custom claim may access any save:

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "saves": {
      ".read": "auth.token.dm === true",
      ".write": "auth.token.dm === true",
      "$uid": {
        ".read": "$uid === auth.uid || auth.token.dm === true",
        ".write": "$uid === auth.uid || auth.token.dm === true"
      }
    }
  }
}
```

When Firebase is available the application signs in automatically and attaches
the ID token to each database request.

