// Environmental Scheduler — Overview Engine
// Skin-agnostic data layer for the overview card: fetches house status,
// subscribes to change events, and exposes actions as plain async
// functions. No DOM/CSS here — see docs/card-architecture.md.
//
// Usage:
//   const engine = new OverviewEngine(hass, config);
//   const unsubscribe = engine.subscribe(state => { ... });
//   await engine.setHouseMode('away');
//   engine.destroy();

export const REASON_LABELS = {
  schedule:     'Schedule',
  fallback:     'Fallback',
  away:         'Away',
  persons_away: 'Unoccupied',
  vacation:     'Vacation',
  error:        'Error',
};

const REFRESH_INTERVAL_MS = 30000;
const CHANGE_EVENTS = [
  'environmental_scheduler.house_mode_changed',
  'environmental_scheduler.block_changed',
  'environmental_scheduler.active_block_changed',
  'environmental_scheduler.room_changed',
];

export class OverviewEngine {
  constructor(hass, config = {}) {
    this._hass = hass;
    this._config = config;
    this._state = { loading: true, error: null, houseMode: null, persons: [], rooms: [], heatPump: [] };
    this._listeners = new Set();
    this._refreshTimer = null;
    this._eventUnsubs = [];
    this._started = false;
  }

  set hass(hass) {
    this._hass = hass;
    this._recomputeHeatPump();
    this._notify();
  }

  get hass() {
    return this._hass;
  }

  setConfig(config) {
    this._config = config ?? {};
    this._recomputeHeatPump();
    this._notify();
  }

  getState() {
    return this._state;
  }

  /** Registers a callback invoked with the current (and every future) state. Returns an unsubscribe function. */
  subscribe(callback) {
    this._listeners.add(callback);
    if (!this._started) this._start();
    callback(this._state);
    return () => {
      this._listeners.delete(callback);
      if (this._listeners.size === 0) this._stop();
    };
  }

  destroy() {
    this._stop();
  }

  async refresh() {
    await this._doRefresh();
  }

  // ------------------------------------------------------------------ actions

  async setHouseMode(mode) {
    await this._call('set_house_mode', { mode });
    await this._doRefresh();
  }

  // ------------------------------------------------------------------ internal

  _start() {
    this._started = true;
    this._doRefresh();
    this._refreshTimer = setInterval(() => this._doRefresh(), REFRESH_INTERVAL_MS);
    if (this._hass?.connection) {
      const onEvent = () => this._doRefresh();
      this._eventUnsubs = CHANGE_EVENTS.map(evt => {
        const unsubPromise = this._hass.connection.subscribeEvents(onEvent, evt);
        return () => unsubPromise.then(unsub => unsub());
      });
    }
  }

  _stop() {
    this._started = false;
    if (this._refreshTimer) clearInterval(this._refreshTimer);
    this._refreshTimer = null;
    this._eventUnsubs.forEach(unsub => unsub());
    this._eventUnsubs = [];
  }

  async _call(service, data = {}) {
    const r = await this._hass.connection.sendMessagePromise({
      type: 'call_service', domain: 'environmental_scheduler',
      service, service_data: data, return_response: true,
    });
    return r.response;
  }

  async _doRefresh() {
    try {
      const status = await this._call('get_house_status');
      this._state = {
        loading: false,
        error: null,
        houseMode: status.house_mode,
        vacationTemp: status.vacation_temp,
        globalAwayTemp: status.global_away_temp,
        persons: (status.persons ?? []).map(p => this._normalizePerson(p)),
        rooms: (status.rooms ?? []).map(r => this._normalizeRoom(r)),
        heatPump: this._state.heatPump,
      };
    } catch (e) {
      console.error('[EnvScheduler OverviewEngine] refresh failed', e);
      this._state = { ...this._state, loading: false, error: String(e?.message ?? e) };
    }
    this._notify();
  }

  _normalizePerson(p) {
    const liveState = this._hass?.states?.[p.ha_entity]?.state ?? p.state ?? 'unknown';
    return {
      id: p.id,
      name: p.name,
      entity: p.ha_entity,
      state: liveState,
      isHome: liveState === 'home',
    };
  }

  _normalizeRoom(r) {
    return {
      id: r.id,
      name: r.name,
      targetTemperature: r.target_temperature,
      reason: r.reason,
      reasonLabel: REASON_LABELS[r.reason] ?? r.reason,
      activeBlock: r.active_block,
      persons: r.persons ?? [],
    };
  }

  /** heat_pump entity map comes from card config (this._config.heat_pump), not the backend — read live from hass.states. */
  _recomputeHeatPump() {
    const hp = this._config.heat_pump;
    if (!hp || !this._hass) { this._state = { ...this._state, heatPump: [] }; return; }

    const read = (key, label, entityId) => {
      if (!entityId) return null;
      const s = this._hass.states[entityId];
      if (!s) return null;
      return { key, label, value: s.state, unit: s.attributes?.unit_of_measurement ?? '' };
    };

    this._state = {
      ...this._state,
      heatPump: [
        read('scop', 'Lifetime SCoP', hp.scop_entity),
        read('live_cop', 'Live CoP', hp.live_cop_entity),
        read('outdoor_temp', 'Outdoor', hp.outdoor_temp_entity),
        read('power_input', 'Power in', hp.power_input_entity),
        read('flow_temp', 'Flow temp', hp.flow_temp_entity),
      ].filter(Boolean),
    };
  }

  _notify() {
    this._listeners.forEach(cb => cb(this._state));
  }
}
