# Dice Result Rendering Behavior

This snapshot documents the dice result rendering behavior in
`src/dice-result.jsx`, which renders values through the `DecryptedText`
component without any sequential cascade animation.

## Scenario

- Run `npm run build:dice` and open `docs/dice-result-demo.html` in a browser
  (e.g. via `node tools/dev-server.mjs --port 4173`).
- Watch the looping rolls to confirm the digits swap immediately to the new
  result when the renderer updates.

## Visual reference

A regression snapshot confirming the current non-cascading render is attached
to the pull request.
