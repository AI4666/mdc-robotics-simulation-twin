/**
 * state_aggregator.js — Produces WORLD_STATE for each connected client
 *
 * Architecture plan, section 5.3. The aggregator reads the world model and decides what goes
 * out to clients; nothing else produces WORLD_STATE. Every tick (5 Hz) each client gets one
 * message carrying only the fields that differ from what that client was last sent:
 *
 *   { seq, reset, complete, robots?: { id: fields | null }, stations?: { key: fields | null } }
 *
 *   reset     the client clears its copy first: a snapshot, sent on connect, every 5 s, and
 *             after a lost snapshot
 *   complete  false when the 8 KB budget held some changes back for the next tick
 *   null      the entity was removed
 *
 * Pose changes under 1 cm or 1° are not sent. A robot is `stale` when no telemetry has
 * arrived for 1 s. WORLD_STATE is a "latest" message: when a newer one replaces an unsent one
 * in the client's outbox, replaced() marks what only the old one carried as unsent, so the
 * next tick sends it again. shared/world_state.js rebuilds the state on the client.
 */

const DEFAULTS = {
  intervalMs: 200,
  snapshotMs: 5000,
  staleMs: 1000,
  maxBytes: 8 * 1024,
  envelopeBytes: 200 // room for { type, id, t } around the data
};

const DEADBANDS = { x: 0.01, y: 0.01, z: 0.01, heading: Math.PI / 180 };
const DECIMALS = { x: 3, y: 3, z: 3, heading: 3, speed: 2, battery: 1 };
const MAX_TEXT = 200; // status strings are cut to this length
const EPSILON = 1e-9;

function round(value, decimals) {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

// Whether `next` should be sent to a client that was last sent `prev`.
function hasChanged(field, prev, next) {
  if (next === undefined) return false;
  if (prev === undefined) return true;
  if (field === 'heading') {
    return Math.abs(Math.atan2(Math.sin(next - prev), Math.cos(next - prev))) >= DEADBANDS.heading - EPSILON;
  }
  if (DEADBANDS[field] !== undefined) return Math.abs(next - prev) >= DEADBANDS[field] - EPSILON;
  return prev !== next;
}

class StateAggregator {
  constructor(world, options = {}) {
    this.world = world;
    this.options = { ...DEFAULTS, ...options };
    this.now = options.now || (() => Date.now());
    this.clients = new Map(); // handle -> { send, sent, seq, needsReset, lastResetAt }
  }

  get intervalMs() {
    return this.options.intervalMs;
  }

  /**
   * The world as clients should see it: rounded values, derived stale flag.
   */
  view() {
    const now = this.now();
    const robots = {};
    for (const r of this.world.getRobots()) {
      const v = {
        name: r.name,
        type: r.type,
        status: typeof r.status === 'string' ? r.status.slice(0, MAX_TEXT) : r.status,
        source: r.source || null,
        stale: !(Number.isFinite(r.lastTelemetryAt) && now - r.lastTelemetryAt <= this.options.staleMs)
      };
      for (const field of Object.keys(DECIMALS)) {
        if (Number.isFinite(r[field])) v[field] = round(r[field], DECIMALS[field]);
      }
      robots[r.id] = v;
    }
    const stations = {};
    const worldStations = this.world.getStations();
    for (const key of Object.keys(worldStations)) {
      const st = worldStations[key];
      stations[key] = { name: st.name, x: round(st.x, 3), y: round(st.y, 3), z: round(st.z, 3) };
    }
    return { robots, stations };
  }

  /**
   * Registers a client and sends it a snapshot at once. send(data) queues one WORLD_STATE.
   */
  addClient(handle, send) {
    this.clients.set(handle, { send, sent: { robots: {}, stations: {} }, seq: 0, needsReset: true, lastResetAt: -Infinity });
    this.tickClient(this.clients.get(handle), this.view());
  }

  removeClient(handle) {
    this.clients.delete(handle);
  }

  /**
   * One WORLD_STATE per client. Also called right after discrete events (station edits,
   * AnyLogic updates) so they don't wait for the next tick.
   */
  tick() {
    const view = this.view();
    this.clients.forEach(client => this.tickClient(client, view));
  }

  tickClient(client, view) {
    const now = this.now();
    let reset = false;
    if (client.needsReset || now - client.lastResetAt >= this.options.snapshotMs) {
      client.sent = { robots: {}, stations: {} };
      client.needsReset = false;
      client.lastResetAt = now;
      reset = true;
    }
    const data = { seq: ++client.seq, reset, complete: true, robots: {}, stations: {} };
    let size = JSON.stringify(data).length + this.options.envelopeBytes;

    for (const section of ['robots', 'stations']) {
      const current = view[section];
      const sent = client.sent[section];
      const ids = [...new Set([...Object.keys(current), ...Object.keys(sent)])].sort();
      for (const id of ids) {
        let patch = null;
        if (id in current) {
          patch = {};
          for (const [field, value] of Object.entries(current[id])) {
            if (hasChanged(field, sent[id] && sent[id][field], value)) patch[field] = value;
          }
          if (Object.keys(patch).length === 0) continue;
        }
        const cost = JSON.stringify({ [id]: patch }).length;
        if (size + cost > this.options.maxBytes) {
          data.complete = false; // stays unsent; goes out on a later tick
          continue;
        }
        size += cost;
        data[section][id] = patch;
        if (patch === null) delete sent[id];
        else sent[id] = { ...(sent[id] || {}), ...patch };
      }
      if (Object.keys(data[section]).length === 0) delete data[section];
    }
    client.send(data);
  }

  /**
   * The client's outbox replaced the unsent WORLD_STATE `oldData` with `newData`. Whatever only
   * oldData carried is marked unsent, so the next tick sends it again.
   */
  replaced(handle, oldData, newData) {
    const client = this.clients.get(handle);
    if (!client || newData.reset) return;
    if (oldData.reset) {
      client.needsReset = true;
      return;
    }
    for (const section of ['robots', 'stations']) {
      const sent = client.sent[section];
      const newer = newData[section] || {};
      for (const [id, patch] of Object.entries(oldData[section] || {})) {
        if (patch === null) {
          if (!(id in newer)) client.needsReset = true; // the removal was lost
          continue;
        }
        if (!sent[id]) continue;
        for (const field of Object.keys(patch)) {
          if (!newer[id] || !(field in newer[id])) delete sent[id][field];
        }
      }
    }
  }
}

module.exports = { StateAggregator, DEADBANDS };
