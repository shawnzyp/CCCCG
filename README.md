# Catalyst Core Character Tracker

Hosted version of the mobile-optimized character sheet for GitHub Pages.

## Architecture

### Utilities
- `$`, `qs`, `qsa` – lightweight DOM query shortcuts.
- `num`, `mod` – numeric helpers for safe parsing and ability modifiers.
- `show`, `hide`, `toast` – UI helpers for overlays and notifications.

### Event Flow
- **Tabs** – clicking a tab triggers `setTab`, displaying the chosen section.
- **HP/SP controls** – damage, heal, reset, and long-rest buttons update bars and pills.
- **Dice/Coin tools** – roll/flip actions calculate outcomes, log them, and the log button reveals history.
- **Encounter tracker** – modal buttons add, reorder, advance rounds, or reset combatants.