// Environmental Scheduler — Overview Card (LCARS skin)
// Same data/actions as environmental-scheduler-overview-card, rendered in
// LCARS style. Wraps engine/overview-engine.js — no fetch/service-call
// logic lives here, see docs/card-architecture.md.
//
// Config (YAML for now — visual editor is a follow-up, see TODO below):
//   type: custom:environmental-scheduler-overview-card-lcars
//   title:         "Home Overview"
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
//
// Tapping a room tile opens that room's config panel (name, TRV/hot-water
// entities, sensors, people) — same fields as the default skin's card,
// styled LCARS.

// Static imports of sibling files aren't covered by the cache-busting query
// param (?v=<sha>) put on this file's own Lovelace resource URL — the
// browser can keep serving a stale cached copy of engine.js/lcars-tokens.js
// indefinitely even after a hard reload, since their request URLs never
// change. Forwarding the same ?v= as a dynamic import fixes that (found
// live: engine.js kept serving pre-update code with no error, just missing
// the new methods).
const _cacheBust = new URL(import.meta.url).search;
const { OverviewEngine } = await import(`../../engine/overview-engine.js${_cacheBust}`);
const { lcarsTokensCSS } = await import(`./lcars-tokens.js${_cacheBust}`);

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

    // Room config panel (opened by tapping a room tile)
    this._configRoomId = null;
    this._configTab = 'basic';
    this._configDraft = null;
    this._deleteConfirm = false;
    this._saving = false;
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
        // Don't re-render over an open config panel — it would reset the draft.
        if (!this._configRoomId) this._render();
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

  // ------------------------------------------------------------------ room config panel

  async _openConfig(roomId) {
    let room;
    try {
      const resp = await this._engine.call('get_rooms');
      this._rooms = resp?.rooms ?? [];
      room = this._rooms.find(r => r.id === roomId);
    } catch (e) {
      console.error('[EnvScheduler LCARS Overview] get_rooms failed', e);
      return;
    }
    if (!room) return;

    this._configRoomId = roomId;
    this._configTab = 'basic';
    this._deleteConfirm = false;
    this._saving = false;
    this._configDraft = {
      id: room.id,
      name: room.name ?? '',
      area_id: room.area_id ?? '',
      climate_entities: [...(room.climate_entities ?? [])],
      hot_water_entity: room.hot_water_entity ?? '',
      temperature_sensors: [...(room.temperature_sensors ?? [])],
      door_entities: [...(room.door_entities ?? [])],
      window_entities: [...(room.window_entities ?? [])],
      persons: [...(room.persons ?? [])],
    };
    this._render();
  }

  _closeConfig() {
    this._configRoomId = null;
    this._configDraft = null;
    this._render();
  }

  async _saveConfig() {
    if (this._saving || !this._configDraft) return;
    this._saving = true;
    this._render();
    try {
      const d = this._configDraft;
      await this._engine.call('update_room', {
        room: d.id,
        name: d.name,
        area_id: d.area_id || null,
        climate_entities: d.climate_entities.filter(Boolean),
        hot_water_entity: d.hot_water_entity || null,
        temperature_sensors: d.temperature_sensors.filter(Boolean),
        door_entities: d.door_entities.filter(Boolean),
        window_entities: d.window_entities.filter(Boolean),
        persons: d.persons,
      });
      this._configRoomId = null;
      this._configDraft = null;
      await this._engine.refresh();
    } catch (e) {
      console.error('[EnvScheduler LCARS Overview] update_room failed', e);
      this._saving = false;
      this._render();
    }
  }

  async _deleteRoom() {
    if (!this._configDraft) return;
    try {
      await this._engine.call('delete_room', { room: this._configDraft.id });
      this._configRoomId = null;
      this._configDraft = null;
      await this._engine.refresh();
    } catch (e) {
      console.error('[EnvScheduler LCARS Overview] delete_room failed', e);
    }
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

    const panelHtml = this._configRoomId ? this._renderConfigPanel() : '';

    this.shadowRoot.innerHTML = `
      <style>${lcarsTokensCSS(this._config.lcars_options)}${this._css()}</style>
      <div class="lcars-card">
        ${title ? `
        <div class="lcars-header">
          <div class="lcars-header-elbow"></div>
          <div class="lcars-header-bar"><span class="lcars-title">${escHtml(title)}</span></div>
        </div>` : ''}

        ${sections}
      </div>
      ${panelHtml}`;

    this._bindEvents();
    if (this._configRoomId) {
      this._bindConfigEvents();
      this._initPickers();
    }
  }

  _bindEvents() {
    const root = this.shadowRoot;
    root.querySelectorAll('.lcars-pill[data-mode]').forEach(btn => {
      btn.addEventListener('click', () => this._setMode(btn.dataset.mode));
    });
    root.querySelectorAll('.lcars-room-tile').forEach(tile => {
      tile.addEventListener('click', () => this._openConfig(tile.dataset.room));
    });
  }

  // ------------------------------------------------------------------ room config panel render

  _renderConfigPanel() {
    const d = this._configDraft;
    const tab = this._configTab;

    const tabs = ['basic', 'entities', 'sensors', 'people'].map(t => `
      <button class="lcars-tab${tab === t ? ' active' : ''}" data-tab="${t}">
        ${{ basic: 'Basic', entities: 'Entities', sensors: 'Sensors', people: 'People' }[t]}
      </button>`).join('');

    const content = {
      basic: () => this._renderTabBasic(d),
      entities: () => this._renderTabEntities(d),
      sensors: () => this._renderTabSensors(d),
      people: () => this._renderTabPeople(d),
    }[tab]?.() ?? '';

    const footer = this._deleteConfirm
      ? `<span class="lcars-delete-confirm-text">Delete "${escHtml(d.name)}"?</span>
         <button class="lcars-pill lcars-confirm-yes-btn">YES, DELETE</button>
         <button class="lcars-pill lcars-confirm-no-btn">CANCEL</button>`
      : `<button class="lcars-pill lcars-delete-btn">DELETE ROOM</button>
         <button class="lcars-pill active lcars-save-btn"${this._saving ? ' disabled' : ''}>${this._saving ? 'SAVING…' : 'SAVE'}</button>`;

    return `
      <div class="lcars-panel-overlay">
        <div class="lcars-panel-backdrop"></div>
        <div class="lcars-config-panel">
          <div class="lcars-panel-header">
            <div class="lcars-panel-header-elbow"></div>
            <div class="lcars-panel-header-bar">
              <span class="lcars-panel-title">${escHtml(d.name)}</span>
              <button class="lcars-panel-close">✕</button>
            </div>
          </div>
          <div class="lcars-panel-tabs">${tabs}</div>
          <div class="lcars-panel-content">${content}</div>
          <div class="lcars-panel-footer">${footer}</div>
        </div>
      </div>`;
  }

  _renderTabBasic(d) {
    return `
      <div class="lcars-field-group">
        <label class="lcars-field-label">Room name</label>
        <input class="lcars-field-input" id="cfg-name" type="text" value="${escHtml(d.name)}">
      </div>
      <div class="lcars-field-group">
        <label class="lcars-field-label">HA Area (optional)</label>
        <ha-area-picker id="cfg-area"></ha-area-picker>
      </div>`;
  }

  _renderTabEntities(d) {
    const trvRows = d.climate_entities.map((e, i) => `
      <div class="lcars-picker-row">
        <ha-entity-picker class="lcars-entity-picker" data-field="climate_entities" data-idx="${i}"></ha-entity-picker>
        <button class="lcars-remove-picker-btn" data-field="climate_entities" data-idx="${i}">✕</button>
      </div>`).join('');

    const sensorRows = d.temperature_sensors.map((e, i) => `
      <div class="lcars-picker-row">
        <ha-entity-picker class="lcars-entity-picker" data-field="temperature_sensors" data-idx="${i}"></ha-entity-picker>
        <button class="lcars-remove-picker-btn" data-field="temperature_sensors" data-idx="${i}">✕</button>
      </div>`).join('');

    return `
      <div class="lcars-field-group">
        <label class="lcars-field-label">TRV / Climate entities</label>
        <div>${trvRows}</div>
        <button class="lcars-pill lcars-add-picker-btn" data-field="climate_entities">+ ADD TRV</button>
      </div>
      <div class="lcars-field-group">
        <label class="lcars-field-label">Hot water entity</label>
        <ha-entity-picker class="lcars-entity-picker" data-field="hot_water_entity" data-idx="-1"></ha-entity-picker>
      </div>
      <div class="lcars-field-group">
        <label class="lcars-field-label">Temperature sensors (optional)</label>
        <div>${sensorRows}</div>
        <button class="lcars-pill lcars-add-picker-btn" data-field="temperature_sensors">+ ADD SENSOR</button>
      </div>`;
  }

  _renderTabSensors(d) {
    const doorRows = d.door_entities.map((e, i) => `
      <div class="lcars-picker-row">
        <ha-entity-picker class="lcars-entity-picker" data-field="door_entities" data-idx="${i}"></ha-entity-picker>
        <button class="lcars-remove-picker-btn" data-field="door_entities" data-idx="${i}">✕</button>
      </div>`).join('');

    const winRows = d.window_entities.map((e, i) => `
      <div class="lcars-picker-row">
        <ha-entity-picker class="lcars-entity-picker" data-field="window_entities" data-idx="${i}"></ha-entity-picker>
        <button class="lcars-remove-picker-btn" data-field="window_entities" data-idx="${i}">✕</button>
      </div>`).join('');

    return `
      <div class="lcars-field-group">
        <label class="lcars-field-label">Door sensors</label>
        <div>${doorRows}</div>
        <button class="lcars-pill lcars-add-picker-btn" data-field="door_entities">+ ADD DOOR SENSOR</button>
      </div>
      <div class="lcars-field-group">
        <label class="lcars-field-label">Window sensors</label>
        <div>${winRows}</div>
        <button class="lcars-pill lcars-add-picker-btn" data-field="window_entities">+ ADD WINDOW SENSOR</button>
      </div>`;
  }

  _renderTabPeople(d) {
    const allPersons = this._state?.persons ?? [];
    if (!allPersons.length) return '<div class="lcars-no-data">No persons configured in integration settings.</div>';

    const rows = allPersons.map(p => {
      const checked = d.persons.includes(p.id) ? 'checked' : '';
      return `<label class="lcars-person-check-row">
        <input type="checkbox" class="lcars-person-cb" data-person-id="${p.id}" ${checked}>
        <span>${escHtml(p.name)}</span>
        <span class="lcars-person-entity-hint">${escHtml(p.entity)}</span>
      </label>`;
    }).join('');

    return `<div class="lcars-person-check-list">${rows}</div>`;
  }

  // ------------------------------------------------------------------ room config panel events + picker init

  _bindConfigEvents() {
    const root = this.shadowRoot;

    root.querySelector('.lcars-panel-close')?.addEventListener('click', () => this._closeConfig());
    root.querySelector('.lcars-panel-backdrop')?.addEventListener('click', () => this._closeConfig());

    root.querySelectorAll('.lcars-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this._configTab = btn.dataset.tab;
        this._render();
      });
    });

    root.querySelector('.lcars-save-btn')?.addEventListener('click', () => this._saveConfig());
    root.querySelector('.lcars-delete-btn')?.addEventListener('click', () => {
      this._deleteConfirm = true;
      this._render();
    });
    root.querySelector('.lcars-confirm-yes-btn')?.addEventListener('click', () => this._deleteRoom());
    root.querySelector('.lcars-confirm-no-btn')?.addEventListener('click', () => {
      this._deleteConfirm = false;
      this._render();
    });

    root.querySelector('#cfg-name')?.addEventListener('input', e => {
      this._configDraft.name = e.target.value;
    });

    root.querySelectorAll('.lcars-add-picker-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const field = btn.dataset.field;
        this._configDraft[field] = [...this._configDraft[field], ''];
        this._render();
      });
    });

    root.querySelectorAll('.lcars-remove-picker-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const field = btn.dataset.field;
        const idx = parseInt(btn.dataset.idx);
        this._configDraft[field] = this._configDraft[field].filter((_, i) => i !== idx);
        this._render();
      });
    });

    root.querySelectorAll('.lcars-person-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        const pid = cb.dataset.personId;
        if (cb.checked) {
          if (!this._configDraft.persons.includes(pid))
            this._configDraft.persons = [...this._configDraft.persons, pid];
        } else {
          this._configDraft.persons = this._configDraft.persons.filter(id => id !== pid);
        }
      });
    });
  }

  _initPickers() {
    const root = this.shadowRoot;
    const hass = this._hass;
    const d = this._configDraft;

    const areaPicker = root.querySelector('#cfg-area');
    if (areaPicker) {
      areaPicker.hass = hass;
      areaPicker.value = d.area_id || '';
      areaPicker.addEventListener('value-changed', e => {
        this._configDraft.area_id = e.detail.value ?? '';
      });
    }

    root.querySelectorAll('.lcars-entity-picker').forEach(picker => {
      const field = picker.dataset.field;
      const idx = parseInt(picker.dataset.idx);
      picker.hass = hass;

      if (field === 'climate_entities') {
        picker.includeDomains = ['climate'];
        picker.value = d.climate_entities[idx] ?? '';
      } else if (field === 'hot_water_entity') {
        picker.includeDomains = ['switch', 'water_heater', 'input_boolean'];
        picker.value = d.hot_water_entity ?? '';
      } else if (field === 'temperature_sensors') {
        picker.includeDomains = ['sensor'];
        picker.value = d.temperature_sensors[idx] ?? '';
      } else if (field === 'door_entities') {
        picker.includeDomains = ['binary_sensor'];
        picker.value = d.door_entities[idx] ?? '';
      } else if (field === 'window_entities') {
        picker.includeDomains = ['binary_sensor'];
        picker.value = d.window_entities[idx] ?? '';
      }

      picker.addEventListener('value-changed', e => {
        const val = e.detail.value ?? '';
        if (field === 'hot_water_entity') {
          this._configDraft.hot_water_entity = val;
        } else {
          const arr = [...this._configDraft[field]];
          arr[idx] = val;
          this._configDraft[field] = arr;
        }
      });
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

      /* ---- room config panel overlay ---- */
      .lcars-panel-overlay { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: stretch; justify-content: flex-end; font-family: var(--lcars-font, var(--font-family)); }
      .lcars-panel-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,.6); }
      .lcars-config-panel {
        position: relative; width: min(420px, 100vw); background: var(--lcars-bg);
        display: flex; flex-direction: column; box-shadow: -4px 0 24px rgba(0,0,0,.5);
        animation: lcars-slide-in 0.2s ease-out;
      }
      @keyframes lcars-slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } }

      .lcars-panel-header { display: flex; align-items: stretch; }
      .lcars-panel-header-elbow {
        width: 30px; background: var(--lcars-primary);
        border-top-left-radius: var(--lcars-radius-outer);
      }
      .lcars-panel-header-bar {
        flex: 1; background: var(--lcars-primary); display: flex; align-items: center; justify-content: space-between;
        padding: 10px 16px;
      }
      .lcars-panel-title { color: var(--lcars-bg); font-size: 1.1rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
      .lcars-panel-close { border: none; background: none; cursor: pointer; color: var(--lcars-bg); font-size: 1.1rem; line-height: 1; padding: 4px; }
      .lcars-panel-close:hover { opacity: 0.7; }

      .lcars-panel-tabs { display: flex; gap: 6px; padding: 12px 16px 0; flex-wrap: wrap; }
      .lcars-tab {
        border: none; cursor: pointer; padding: 6px 14px; font-family: inherit;
        font-weight: 700; letter-spacing: 0.05em; font-size: 0.72rem; text-transform: uppercase;
        border-radius: 999px; background: var(--lcars-panel-bg); color: #ffffff; transition: filter 0.15s;
      }
      .lcars-tab.active { background: var(--lcars-primary); color: var(--lcars-bg); }
      .lcars-tab:hover:not(.active) { filter: brightness(1.2); }

      .lcars-panel-content { flex: 1; overflow-y: auto; padding: 16px; }
      .lcars-field-group { margin-bottom: 18px; }
      .lcars-field-label { display: block; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #ffffff; margin-bottom: 6px; }
      .lcars-field-input {
        width: 100%; box-sizing: border-box; background: var(--lcars-panel-bg); border: none; border-radius: var(--lcars-radius-inner);
        color: #ffffff; font-family: inherit; font-size: 0.9rem; padding: 8px 12px;
      }
      .lcars-field-input:focus { outline: 2px solid var(--lcars-primary); }

      .lcars-picker-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
      .lcars-picker-row .lcars-entity-picker { flex: 1; }
      .lcars-remove-picker-btn {
        border: none; cursor: pointer; background: var(--lcars-panel-bg); color: #ffffff;
        border-radius: 50%; width: 26px; height: 26px; flex-shrink: 0; font-size: 0.8rem;
      }
      .lcars-remove-picker-btn:hover { background: var(--lcars-accent); }
      .lcars-add-picker-btn { margin-top: 4px; padding: 6px 16px; font-size: 0.7rem; }

      .lcars-person-check-list { display: flex; flex-direction: column; gap: 4px; }
      .lcars-person-check-row {
        display: flex; align-items: center; gap: 10px; padding: 8px 12px;
        background: var(--lcars-panel-bg); border-radius: var(--lcars-radius-inner); color: #ffffff; font-size: 0.85rem;
      }
      .lcars-person-entity-hint { color: #ffffff; opacity: 0.6; font-size: 0.68rem; margin-left: auto; }

      .lcars-panel-footer { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 14px 16px; }
      .lcars-delete-confirm-text { color: #ffffff; font-size: 0.85rem; margin-right: auto; }
      .lcars-save-btn[disabled] { opacity: 0.6; cursor: default; }
    `;
  }

  getCardSize() { return 6; }

  static getStubConfig() {
    return { title: 'Home Overview', lcars_options: { color_scheme: 'classic', corner_style: 'elbow', font: 'antonio' } };
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
