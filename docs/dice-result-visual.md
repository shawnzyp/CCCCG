# Dice Result Cascade Regression

This snapshot documents the sequential end-to-start reveal applied to dice
results rendered by `src/dice-result.jsx` via the `DecryptedText` component.

## Feature flagging

- Sequential cascading is enabled by default.
- Disable it with `data-dice-cascade="false"` on the mount node, by passing
  `{ cascade: false }` to `ensureDiceResultRenderer`, or via the global flag
  `window.__CCCCG_DISABLE_DICE_CASCADE__ = true`.
- Explicitly enabling the cascade is also supported through
  `window.__CCCCG_ENABLE_DICE_CASCADE__ = true`.

## Scenario

- Run `npm run build:dice` and open `docs/dice-result-demo.html` in a browser
  (e.g. via `npx http-server . -p 4173`).
- Watch the looping rolls to confirm the digits cascade from right to left as
  they settle.

## Visual reference

A regression snapshot confirming the cascade is attached to the pull request
(artifact: `browser:/invocations/dvmcexha/artifacts/artifacts/dice-result-cascade.png`).

