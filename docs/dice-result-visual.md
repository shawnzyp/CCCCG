# Dice Result Cascade Regression

This snapshot documents the sequential end-to-start reveal applied to dice
results rendered by `src/dice-result.jsx` via the `DecryptedText` component.

## Scenario

- Run `npm run build:dice` and open `docs/dice-result-demo.html` in a browser
  (e.g. via `npx http-server . -p 4173`).
- Watch the looping rolls to confirm the digits cascade from right to left as
  they settle.

## Visual reference

A regression snapshot confirming the cascade is attached to the pull request
(artifact: `browser:/invocations/utwvmzoe/artifacts/artifacts/dice-result-cascade.png`).

