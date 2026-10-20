import WebSocket from 'ws';

// A small client for the HA WebSocket API, authenticated with HA_TOKEN.
// Config and options flows and config entry delete use HA's REST API with the
// same token, because HA exposes those over REST.
// Env values are read in connect(), never at module load. No secret is logged
// or put in an error message.

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

type Json = Record<string, unknown>;

interface Pending {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}

export interface EventSubscription {
  events: Json[];
  unsubscribe: () => Promise<void>;
}

export class HaWs {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly listeners = new Map<number, (event: Json) => void>();

  private constructor(
    private readonly socket: WebSocket,
    private readonly origin: string,
    private readonly token: string,
  ) {
    socket.on('message', (data) => this.onMessage(data.toString()));
    socket.on('close', () => {
      for (const p of this.pending.values()) {
        p.reject(new Error('HA WebSocket closed'));
      }
      this.pending.clear();
    });
  }

  // Opens ws(s)://<HA_URL host>/api/websocket and authenticates with HA_TOKEN.
  static async connect(): Promise<HaWs> {
    const base = new URL(requireEnv('HA_URL'));
    const token = requireEnv('HA_TOKEN');

    const wsUrl = new URL('/api/websocket', base);
    wsUrl.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';

    const socket = new WebSocket(wsUrl.toString());
    await new Promise<void>((resolve, reject) => {
      socket.once('error', (err) => reject(new Error(`HA WebSocket error: ${err.message}`)));
      socket.on('message', function onAuth(data) {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'auth_required') {
          socket.send(JSON.stringify({ type: 'auth', access_token: token }));
        } else if (msg.type === 'auth_ok') {
          socket.off('message', onAuth);
          resolve();
        } else if (msg.type === 'auth_invalid') {
          socket.off('message', onAuth);
          socket.close();
          reject(new Error('HA WebSocket auth_invalid'));
        }
      });
    });
    return new HaWs(socket, base.origin, token);
  }

  close(): void {
    this.socket.close();
  }

  private onMessage(raw: string): void {
    const msg = JSON.parse(raw);
    if (msg.type === 'result') {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.success) {
        p.resolve(msg.result);
      } else {
        p.reject(new Error(`HA command failed: ${msg.error?.code ?? ''} ${msg.error?.message ?? ''}`.trim()));
      }
    } else if (msg.type === 'event') {
      this.listeners.get(msg.id)?.(msg.event);
    }
  }

  private sendWithId(id: number, type: string, payload: Json): Promise<any> {
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, type, ...payload }));
    });
  }

  // Sends one command with a numbered id and resolves with its result.
  command(type: string, payload: Json = {}): Promise<any> {
    return this.sendWithId(this.nextId++, type, payload);
  }

  // --- Actions and events ---

  // call_service with return_response true; resolves with { context, response }.
  callServiceWithResponse(domain: string, service: string, serviceData: Json = {}, target?: Json): Promise<any> {
    const payload: Json = { domain, service, service_data: serviceData, return_response: true };
    if (target) payload.target = target;
    return this.command('call_service', payload);
  }

  // subscribe_events; received events are collected in `events`.
  async subscribeEvents(eventType?: string): Promise<EventSubscription> {
    const id = this.nextId++;
    const events: Json[] = [];
    this.listeners.set(id, (event) => events.push(event));
    try {
      await this.sendWithId(id, 'subscribe_events', eventType ? { event_type: eventType } : {});
    } catch (err) {
      this.listeners.delete(id);
      throw err;
    }
    return {
      events,
      unsubscribe: async () => {
        await this.command('unsubscribe_events', { subscription: id });
        this.listeners.delete(id);
      },
    };
  }

  getStates(): Promise<Json[]> {
    return this.command('get_states');
  }

  // --- Config entries and flows ---

  private async rest(method: string, path: string, body?: Json): Promise<any> {
    const res = await fetch(`${this.origin}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`HA ${method} ${path} failed: ${res.status} ${text}`);
    }
    return text ? JSON.parse(text) : null;
  }

  listConfigEntries(domain?: string): Promise<Json[]> {
    return this.command('config_entries/get', domain ? { domain } : {});
  }

  deleteConfigEntry(entryId: string): Promise<any> {
    return this.rest('DELETE', `/api/config/config_entries/entry/${entryId}`);
  }

  startConfigFlow(handler: string): Promise<any> {
    return this.rest('POST', '/api/config/config_entries/flow', { handler });
  }

  configFlowStep(flowId: string, userInput: Json = {}): Promise<any> {
    return this.rest('POST', `/api/config/config_entries/flow/${flowId}`, userInput);
  }

  startOptionsFlow(entryId: string): Promise<any> {
    return this.rest('POST', '/api/config/config_entries/options/flow', { handler: entryId });
  }

  optionsFlowStep(flowId: string, userInput: Json = {}): Promise<any> {
    return this.rest('POST', `/api/config/config_entries/options/flow/${flowId}`, userInput);
  }

  // --- Helpers (input_boolean, input_number) ---

  createHelper(domain: 'input_boolean' | 'input_number', fields: Json): Promise<any> {
    return this.command(`${domain}/create`, fields);
  }

  listHelpers(domain: 'input_boolean' | 'input_number'): Promise<Json[]> {
    return this.command(`${domain}/list`);
  }

  deleteHelper(domain: 'input_boolean' | 'input_number', helperId: string): Promise<any> {
    return this.command(`${domain}/delete`, { [`${domain}_id`]: helperId });
  }

  // --- Lovelace ---

  listDashboards(): Promise<Json[]> {
    return this.command('lovelace/dashboards/list');
  }

  createDashboard(fields: Json): Promise<any> {
    return this.command('lovelace/dashboards/create', fields);
  }

  updateDashboard(dashboardId: string, fields: Json): Promise<any> {
    return this.command('lovelace/dashboards/update', { dashboard_id: dashboardId, ...fields });
  }

  getLovelaceConfig(urlPath: string | null): Promise<any> {
    return this.command('lovelace/config', { url_path: urlPath });
  }

  saveLovelaceConfig(urlPath: string | null, config: Json): Promise<any> {
    return this.command('lovelace/config/save', { url_path: urlPath, config });
  }

  listResources(): Promise<Json[]> {
    return this.command('lovelace/resources');
  }

  createResource(url: string, resType: 'module' | 'js' | 'css'): Promise<any> {
    return this.command('lovelace/resources/create', { url, res_type: resType });
  }
}
