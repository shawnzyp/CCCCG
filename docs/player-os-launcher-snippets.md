# Player OS launcher snippets

This reference collects the pieces requested for Player OS: the `setLayerVisible` utility used throughout the launcher script and the HTML structure that powers the home screen (`.pt-home` and `.pt-home-pages`).

## `setLayerVisible`

The launcher uses a simple helper to deterministically toggle visibility on any layer. It hides the element via multiple mechanisms—`hidden`, `aria-hidden`, inline `display`, and `pointer-events`—to prevent invisible overlays from intercepting input.

```js
function setLayerVisible(el, visible) {
  if (!el) return;
  // Use deterministic visibility to avoid invisible overlays intercepting input
  el.hidden = !visible;
  el.setAttribute('aria-hidden', visible ? 'false' : 'true');
  el.style.display = visible ? '' : 'none';
  el.style.pointerEvents = visible ? 'auto' : 'none';
}
```

## `.pt-home` / `.pt-home-pages` HTML

The launcher home view wraps two swipeable pages and a dock. Each page is marked with `data-pt-home-page` and controlled by the dots in `data-pt-home-dots`.

```html
<section class="pt-home" data-pt-launcher-home hidden aria-hidden="true">
  <div class="pt-home-wallpaper" aria-hidden="true"></div>

  <div class="pt-home-pages" data-pt-home-pages>
    <div class="pt-home-page is-active" data-pt-home-page="0">
      <div class="pt-home-grid" role="list">
        <button class="pt-home-icon" data-pt-open-app="playerTools" data-pt-app-label="Player Tools" role="listitem">
          <span class="icon" aria-hidden="true">🛠️</span>
          <span class="label">Player Tools</span>
        </button>
        <button class="pt-home-icon" data-pt-open-app="shards" data-pt-app-label="Shards of Many Fates" role="listitem">
          <span class="icon" aria-hidden="true">♦️</span>
          <span class="label">Shards</span>
        </button>
        <button class="pt-home-icon" data-pt-open-app="messages" data-pt-app-label="Director’s Messages" role="listitem">
          <span class="icon" aria-hidden="true">📡</span>
          <span class="label">Messages</span>
        </button>
        <button class="pt-home-icon" data-pt-open-app="settings" data-pt-app-label="Settings" role="listitem">
          <span class="icon" aria-hidden="true">⚙️</span>
          <span class="label">Settings</span>
        </button>
        <button class="pt-home-icon" data-pt-open-app="loadSave" data-pt-app-label="Load / Save" role="listitem">
          <span class="icon" aria-hidden="true">💾</span>
          <span class="label">Load / Save</span>
        </button>
        <button class="pt-home-icon" data-pt-open-app="encounter" data-pt-app-label="Encounter / Initiative" role="listitem">
          <span class="icon" aria-hidden="true">⚔️</span>
          <span class="label">Encounter</span>
        </button>
        <button class="pt-home-icon" data-pt-open-app="actionLog" data-pt-app-label="Action Log" role="listitem">
          <span class="icon" aria-hidden="true">📝</span>
          <span class="label">Action Log</span>
        </button>
        <button class="pt-home-icon" data-pt-open-app="creditsLedger" data-pt-app-label="Credits Ledger" role="listitem">
          <span class="icon" aria-hidden="true">💳</span>
          <span class="label">Credits</span>
        </button>
        <button class="pt-home-icon" data-pt-open-app="campaignLog" data-pt-app-label="Campaign Log" role="listitem">
          <span class="icon" aria-hidden="true">📓</span>
          <span class="label">Campaign</span>
        </button>
        <button class="pt-home-icon" data-pt-open-app="rules" data-pt-app-label="Rules" role="listitem">
          <span class="icon" aria-hidden="true">📖</span>
          <span class="label">Rules</span>
        </button>
        <button class="pt-home-icon" data-pt-open-app="help" data-pt-app-label="Help" role="listitem">
          <span class="icon" aria-hidden="true">❔</span>
          <span class="label">Help</span>
        </button>
        <button class="pt-home-icon" data-pt-open-app="locked" data-pt-app-label="OMNI Vault" role="listitem">
          <span class="icon" aria-hidden="true">🔒</span>
          <span class="label">OMNI Vault</span>
        </button>
        <button class="pt-home-icon" data-pt-open-app="minigames" data-pt-app-label="Minigames" role="listitem">
          <span class="icon" aria-hidden="true">🎮</span>
          <span class="label">Minigames</span>
        </button>
      </div>
    </div>

    <div class="pt-home-page" data-pt-home-page="1" aria-hidden="true">
      <div class="pt-home-grid" role="list">
        <section class="pt-widget pt-widget--uplink" aria-label="O.M.N.I. Uplink">
          <div class="pt-widget__head">
            <div class="pt-widget__title">O.M.N.I. Uplink</div>
            <div class="pt-widget__pill" data-pt-uplink-signal>Signal: 92%</div>
          </div>

          <div class="pt-widget__row">
            <span>Threat Level</span>
            <strong data-pt-uplink-threat>GREEN</strong>
          </div>

          <div class="pt-widget__row">
            <span>Satellite Lock</span>
            <strong data-pt-uplink-lock>SEARCHING</strong>
          </div>

          <div class="pt-widget__row">
            <span>Last Directive</span>
            <strong data-pt-uplink-last>Just now</strong>
          </div>

          <button type="button" class="pt-widget__btn" data-pt-uplink-open-messages>
            Open Messages
          </button>
        </section>
      </div>
    </div>
  </div>

  <div class="pt-home-dots" data-pt-home-dots aria-label="Home pages" role="tablist">
    <button type="button" class="pt-dot is-active" data-pt-dot="0" aria-label="Page 1" aria-selected="true"></button>
    <button type="button" class="pt-dot" data-pt-dot="1" aria-label="Page 2" aria-selected="false"></button>
  </div>

  <div class="pt-home-dock" role="list" aria-label="Dock">
    <button class="pt-dock-icon" data-pt-open-app="campaignLog" data-pt-app-label="Campaign Log" role="listitem">
      <span class="icon" aria-hidden="true">📓</span>
      <span class="label">Campaign</span>
    </button>
    <button class="pt-dock-icon" data-pt-open-app="messages" data-pt-app-label="Director’s Messages" role="listitem">
      <span class="icon" aria-hidden="true">📡</span>
      <span class="label">Messages</span>
    </button>
    <button class="pt-dock-icon" data-pt-open-app="playerTools" data-pt-app-label="Player Tools" role="listitem">
      <span class="icon" aria-hidden="true">🛠️</span>
      <span class="label">Tools</span>
    </button>
  </div>
</section>
```
