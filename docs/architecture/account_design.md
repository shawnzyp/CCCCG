# Account Design for Cross-Device Access

This game keeps player accounts and progress in a centralized store so that data stays the same across every device.

## Centralized storage
- Maintain player profiles and save data on your own server or a secure cloud database.
- On login the client fetches the profile from this store so the experience is consistent no matter where the player signs in.

## Simplified login
- Let players sign in with an email and password or a trusted identity provider like Google, Apple or Steam.
- For passwordless access, send a one-time “magic link” to the player’s email.
- After authentication return a short‑lived session token stored in a secure cookie or local storage so the user stays signed in for a limited time.

## Security basics
- Serve the game over HTTPS and hash passwords on the server before storage.
- Provide easy account recovery through email or a security question.
- Apply basic rate limiting or CAPTCHA to discourage brute‑force attacks.

## Trusted devices
- Allow players to mark a device as trusted so routine checks like email codes can be skipped for a period of time.
- Continue monitoring for suspicious activity and fall back to full verification if anything looks wrong.

