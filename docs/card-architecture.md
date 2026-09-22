# Card Architecture: Engine + Skins

**Status:** Planned — describes the target architecture. The current `www/*.js` cards predate this split (engine and render logic are bundled together); migrating them is a separate, not-yet-scheduled refactor. New skin work should follow this doc, not the old files' structure.

## Why

The integration ships a default (Material/HA-theme) card today. LCARS support is being added as a first-class, fully-featured skin — not a stripped-down variant — and the project should stay open to further community skins later without each one re-implementing data fetching. Splitting **engine** (data) from **skin** (render) means a bug fix or service-call change lands once and every skin benefits, and a new skin is an isolated addition.

## Engine

One module per card "kind" (overview, room-config, schedule-editor). Responsibilities:
- Fetch/subscribe to the relevant `environmental_scheduler` entities and HA state.
- Normalize that into a skin-agnostic state object (plain data, no DOM/CSS).
- Expose actions (service calls: `set_profile`, `set_vacation_mode`, block CRUD, etc.) as plain async functions.
- No knowledge of any skin — must not import from `skins/`.

Sketch:
```js
// engine/overview-engine.js
export class OverviewEngine {
  constructor(hass, config) { ... }
  getState() { /* returns plain state object */ }
  subscribe(callback) { /* calls back on relevant state change */ }
  // actions
  async setProfile(room, profile) { ... }
  async setVacationMode(enabled) { ... }
}
```

## Skin

Given engine state + actions, a skin renders DOM/CSS and translates user interaction back into engine action calls. Each skin registers as its own HA custom card type (e.g. `custom:environmental-scheduler-overview-card`, `custom:environmental-scheduler-overview-card-lcars`).

**Parity rule:** every skin must implement the full feature set of the engine it wraps — no skin ships as a lesser version. A skin that can't yet support a feature blocks on adding support, not on shipping incomplete.

Sketch:
```js
// skins/lcars/overview-card.js
import { OverviewEngine } from '../../engine/overview-engine.js';

class EnvironmentalSchedulerOverviewCardLCARS extends HTMLElement {
  setConfig(config) {
    this._engine = new OverviewEngine(this._hass, config);
    this._skinConfig = config.lcars_options ?? {};
  }
  set hass(hass) { this._engine.hass = hass; this._render(); }
  _render() { /* build DOM from this._engine.getState(), styled per this._skinConfig */ }
}
```

## Config schema

### Common (all skins)
Same config keys every skin's card accepts, since they all wrap the same engine:
```yaml
type: custom:environmental-scheduler-overview-card-lcars
rooms: all            # or an explicit list of room ids
show_persons: true
show_house_mode: true
```

### Skin-specific block
Each skin may accept an additional namespaced config block for its own visual knobs. Unrecognized keys are ignored by other skins, so a config authored for one skin degrades gracefully if switched to another.

LCARS skin (`lcars_options`):
```yaml
type: custom:environmental-scheduler-overview-card-lcars
lcars_options:
  color_scheme: classic   # classic (orange/amber) | blue | gold | custom
  custom_colors:          # only used when color_scheme: custom
    primary: "#ff9966"
    accent: "#9999ff"
  corner_style: elbow      # elbow | pill | square
  font: antonio             # antonio | swiss-911 | ...
```

Default skin (`default_options`, name TBD): standard HA card options only for now (no extra knobs planned yet — add here if/when needed).

## Directory layout (planned)

```
www/
  engine/
    overview-engine.js
    room-config-engine.js
    schedule-editor-engine.js
  skins/
    default/
      overview-card.js
      room-config-card.js
      schedule-editor-card.js
    lcars/
      overview-card.js
      room-config-card.js
      schedule-editor-card.js
      lcars-tokens.css   # shape/color tokens, imported by all lcars/*.js
```

## Adding a new skin

1. Create `www/skins/<name>/`.
2. Implement one custom-card element per card kind, each importing the matching `engine/*.js` — never re-implement fetching/state logic in the skin.
3. Register each element under its own `custom:environmental-scheduler-<kind>-card-<name>` tag.
4. Meet the parity rule above before merging.
5. Document the skin's own config block (if any) here, following the `lcars_options` example.
