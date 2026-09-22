// Environmental Scheduler — Overview Card (LCARS skin)
// Same data/actions as environmental-scheduler-overview-card, rendered in
// LCARS style. Wraps engine/overview-engine.js — no fetch/service-call
// logic lives here, see docs/card-architecture.md.
//
// Config (YAML for now — visual editor is a follow-up, see TODO below):
//   type: custom:environmental-scheduler-overview-card-lcars
//   title:         "Home Overview"
//   schedule_view: "/lovelace/schedule"
//   persons:       list of { entity, name }        (optional override)
//   heat_pump:     { scop_entity, live_cop_entity, outdoor_temp_entity,
//                    power_input_entity, flow_temp_entity }
//   sections:      ordered list of which sections to render, from
//                  [house_mode, presence, rooms, heat_pump]. Omit for all
//                  four in that order; a subset renders only those, in the
//                  order given — e.g. sections: [rooms] for a rooms-only
//                  card, no separate card type needed.
//   lcars_options:
//     color_scheme: classic | blue | gold | custom
//     custom_colors: { primary, secondary, accent, bg, panelBg }
//     corner_style: elbow | pill | square
//     font: antonio | swiss-911

import { OverviewEngine } from '../../engine/overview-engine.js';
import { lcarsTokensCSS } from './lcars-tokens.js';

const MODES = [
  { key: 'normal', label: 'NORMAL' },
  { key: 'away', label: 'AWAY' },
  { key: 'vacation', label: 'VACATION' },
];

const REASON_COLORS = {
  schedule: '#66ff99',
  fallback: '#cccccc',
  away: '#ffaa33',
  persons_away: '#ffaa33',
  vacation: 'var(--lcars-accent)',
  error: '#ff3333',
};

const DEFAULT_SECTIONS = ['house_mode', 'presence', 'rooms', 'heat_pump'];

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

class EnvironmentalSchedulerOverviewCardLCARS extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._engine = null;
    this._unsubscribe = null;
    this._state = null;
  }

  setConfig(config) {
    if (!config) throw new Error('Invalid configuration');
    this._config = config;
    if (this._engine) this._engine.setConfig(config);
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._engine) {
      this._engine = new OverviewEngine(hass, this._config);
    } else {
      this._engine.hass = hass;
    }
    // A disconnect (HA's conditional-card mechanism can unmount/remount
    // this element when switching pages) clears this._unsubscribe without
    // ever nulling this._engine — without the re-subscribe check below,
    // the "else" branch above would just keep feeding hass to an engine
    // with zero listeners, and the card would silently stop updating
    // forever (found live: engine kept resolving fine, card just never
    // heard about it).
    if (!this._unsubscribe) {
      this._unsubscribe = this._engine.subscribe(state => {
        this._state = state;
        this._render();
      });
    }
  }

  disconnectedCallback() {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
  }

  async _setMode(mode) {
    try {
      await this._engine.setHouseMode(mode);
    } catch (e) {
      console.error('[EnvScheduler LCARS Overview] set_house_mode failed', e);
    }
  }

  _navigateToSchedule(roomId) {
    const path = this._config.schedule_view;
    if (!path) return;
    if (roomId) sessionStorage.setItem('envscheduler_selected_room', roomId);
    history.pushState(null, '', path);
    this.dispatchEvent(new CustomEvent('location-changed', { bubbles: true, composed: true, detail: { replace: false } }));
  }

  _render() {
    const s = this._state;
    if (!s) return;

    const title = this._config.title;
    const mode = s.houseMode ?? 'normal';

    const modeBtns = MODES.map(m => `
      <button class="lcars-pill${m.key === mode ? ' active' : ''}" data-mode="${m.key}">${m.label}</button>
    `).join('');

    const roomsHtml = s.loading ? '<div class="lcars-no-data">Loading…</div>' : s.rooms.length ? `
      <div class="lcars-room-grid">
        ${s.rooms.map(r => `
          <div class="lcars-room-tile" data-room="${r.id}" style="--room-accent:${REASON_COLORS[r.reason] ?? '#cccccc'}">
            <div class="lcars-room-accent"></div>
            <div class="lcars-room-body">
              <div class="lcars-room-name">${escHtml(r.name)}</div>
              <div class="lcars-room-temp">${r.targetTemperature != null ? `${r.targetTemperature}&deg;C` : '&mdash;'}</div>
              <div class="lcars-room-reason">${escHtml(r.reasonLabel)}</div>
            </div>
          </div>`).join('')}
      </div>` : '<div class="lcars-no-data">No rooms configured</div>';

    // Each section is self-contained (its own label) so a `sections` config
    // can pick a subset and order them freely — a rooms-only card is just
    // `sections: [rooms]` on this same card type, no separate card needed.
    const sectionHtml = {
      house_mode: `
        <div class="lcars-section-label">House Mode</div>
        <div class="lcars-mode-row">${modeBtns}</div>`,
      presence: s.persons.length ? `
        <div class="lcars-section-label">Presence</div>
        <div class="lcars-person-row">
          ${s.persons.map(p => `
            <div class="lcars-chip${p.isHome ? ' home' : ''}">
              <span class="lcars-chip-name">${escHtml(p.name)}</span>
              <span class="lcars-chip-state">${p.isHome ? 'HOME' : p.state === 'not_home' ? 'AWAY' : 'UNKNOWN'}</span>
            </div>`).join('')}
        </div>` : '',
      rooms: `
        <div class="lcars-section-label">Rooms</div>
        ${s.error ? `<div class="lcars-no-data">${escHtml(s.error)}</div>` : roomsHtml}`,
      heat_pump: s.heatPump.length ? `
        <div class="lcars-section-label">Heat Pump</div>
        <div class="lcars-hp-strip">
          ${s.heatPump.map(hp => `
            <div class="lcars-hp-stat">
              <span class="lcars-hp-label">${escHtml(hp.label)}</span>
              <span class="lcars-hp-value">${escHtml(hp.value)}${hp.unit ? ` ${escHtml(hp.unit)}` : ''}</span>
            </div>`).join('')}
        </div>` : '',
    };

    const sections = (this._config.sections ?? DEFAULT_SECTIONS)
      .filter(key => key in sectionHtml)
      .map(key => sectionHtml[key])
      .join('');

    this.shadowRoot.innerHTML = `
      <style>${lcarsTokensCSS(this._config.lcars_options)}${this._css()}</style>
      <div class="lcars-card">
        ${title ? `
        <div class="lcars-header">
          <div class="lcars-header-elbow"></div>
          <div class="lcars-header-bar"><span class="lcars-title">${escHtml(title)}</span></div>
        </div>` : ''}

        ${sections}
      </div>`;

    this._bindEvents();
  }

  _bindEvents() {
    const root = this.shadowRoot;
    root.querySelectorAll('.lcars-pill[data-mode]').forEach(btn => {
      btn.addEventListener('click', () => this._setMode(btn.dataset.mode));
    });
    root.querySelectorAll('.lcars-room-tile').forEach(tile => {
      tile.addEventListener('click', () => this._navigateToSchedule(tile.dataset.room));
    });
  }

  _css() {
    return `
      .lcars-card { background: var(--lcars-bg); color: var(--lcars-primary); padding: 12px; }

      .lcars-header { display: flex; align-items: stretch; margin-bottom: 10px; }
      .lcars-header-elbow {
        width: 40px; background: var(--lcars-primary);
        border-top-left-radius: var(--lcars-radius-outer);
        border-bottom-left-radius: var(--lcars-radius-inner);
      }
      .lcars-header-bar {
        flex: 1; background: var(--lcars-primary); display: flex; align-items: center;
        padding: 0 16px; border-top-right-radius: var(--lcars-radius-inner);
      }
      .lcars-title { color: var(--lcars-bg); font-size: 1.3rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }

      .lcars-section-label { color: #ffffff; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin: 12px 4px 6px; }

      .lcars-mode-row, .lcars-person-row { display: flex; gap: 8px; flex-wrap: wrap; }
      .lcars-pill {
        /* Matches the dashboard's own button chrome (same vars its nav
           buttons use via card_mod's button-bullet-* classes) rather than
           this skin's own room/header tokens, so it reads as one system
           with the rest of the LCARS dashboard. */
        border: none; cursor: pointer; padding: 8px 20px; font-family: var(--lcars-font, var(--font-family));
        font-weight: 700; letter-spacing: 0.05em; font-size: 0.85rem; text-transform: uppercase;
        border-radius: 999px;
        background: var(--lcars-card-button-color, var(--lcars-panel-bg));
        color: var(--lcars-card-button-text, #ffffff);
        transition: filter 0.15s;
      }
      .lcars-pill.active {
        background: var(--lcars-card-top-color, var(--lcars-primary));
        color: var(--lcars-background-text, #ffffff);
      }
      .lcars-pill:hover:not(.active) { filter: brightness(1.15); }

      .lcars-chip {
        display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 84px;
        background: var(--lcars-panel-bg); border-radius: var(--lcars-radius-inner); padding: 8px 14px;
        border: 2px solid var(--lcars-panel-bg);
      }
      .lcars-chip.home { border-color: var(--lcars-primary); }
      .lcars-chip-name { font-size: 0.78rem; font-weight: 700; color: #ffffff; text-transform: uppercase; }
      .lcars-chip-state { font-size: 0.68rem; color: #ffffff; }

      .lcars-room-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; max-height: 240px; overflow-y: auto; }
      .lcars-room-tile {
        display: flex; cursor: pointer; background: var(--lcars-panel-bg);
        border-radius: var(--lcars-radius-inner); overflow: hidden; transition: filter 0.15s;
      }
      .lcars-room-tile:hover { filter: brightness(1.2); }
      .lcars-room-accent { width: 8px; background: var(--room-accent, #cccccc); }
      .lcars-room-body { flex: 1; padding: 8px 10px; min-width: 0; }
      .lcars-room-name { font-size: 0.78rem; font-weight: 700; color: #ffffff; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .lcars-room-temp { font-size: 1.15rem; font-weight: 700; color: #ffffff; }
      .lcars-room-reason { font-size: 0.68rem; color: #ffffff; text-transform: uppercase; letter-spacing: 0.04em; }

      .lcars-hp-strip { display: flex; gap: 8px; flex-wrap: wrap; }
      .lcars-hp-stat { background: var(--lcars-panel-bg); border-radius: var(--lcars-radius-inner); padding: 6px 12px; }
      .lcars-hp-label { display: block; font-size: 0.65rem; color: #ffffff; text-transform: uppercase; }
      .lcars-hp-value { font-size: 0.95rem; font-weight: 700; color: #ffffff; }

      .lcars-no-data { color: #ffffff; font-size: 0.85rem; padding: 8px 4px; }
    `;
  }

  getCardSize() { return 6; }

  static getStubConfig() {
    return { title: 'Home Overview', schedule_view: '/lovelace/schedule', lcars_options: { color_scheme: 'classic', corner_style: 'elbow', font: 'antonio' } };
  }

  // TODO: visual config editor (getConfigElement), to match the default
  // skin's editor and the parity rule in docs/card-architecture.md.
  // YAML-only config for this first pass.
}

customElements.define('environmental-scheduler-overview-card-lcars', EnvironmentalSchedulerOverviewCardLCARS);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'environmental-scheduler-overview-card-lcars',
  name: 'Environmental Scheduler — Overview (LCARS)',
  description: 'House mode, person presence, all room statuses, and heat pump stats — LCARS styled',
});
