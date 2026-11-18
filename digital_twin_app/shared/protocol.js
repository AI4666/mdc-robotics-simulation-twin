// protocol.js — WebSocket message table and envelope, shared by server.js (require) and the
// browser (import from /shared/protocol.js). See the architecture plan, section 5.
//
// Every message is { type, id, t, data }:
//   id   unique per sender (a random tag for this process or page, plus a counter)
//   t    sender's monotonic clock in ms (performance.now()); only compared with the same sender's clock
//   data the payload
//
// Delivery classes (section 5.1):
//   latest    a newer message of the same type (and key) replaces an older unsent one
//   reliable  never dropped; the receiver replies with ACK
//   critical  sent ahead of everything else; the receiver replies with ACK
//   none      fire and forget (ACK itself)
// shared/outbox.js applies these classes to each connection.

export const DELIVERY = Object.freeze({
  LATEST: 'latest',
  RELIABLE: 'reliable',
  CRITICAL: 'critical',
  NONE: 'none'
});

// from: who may send it. key: for latest messages that replace each other only per key.
// expiresMs: a reliable message older than this is not sent (or re-sent after a reconnect).
export const MESSAGES = Object.freeze({
  INIT_FLEET:       { from: ['server'], delivery: DELIVERY.RELIABLE, purpose: 'Full robot list sent to a client when it connects' },
  ROBOT_UPDATE:     { from: ['server'], delivery: DELIVERY.LATEST,   purpose: 'Full robot list after an AnyLogic or UPDATE_ROBOT change' },
  STATIONS_UPDATE:  { from: ['server'], delivery: DELIVERY.LATEST,   purpose: 'Full station set after UPDATE_STATIONS' },
  WORLD_STATE:      { from: ['server'], delivery: DELIVERY.LATEST,   purpose: '5 Hz per-client delta (or snapshot) of the world model from ai/state_aggregator.js; rebuilt by shared/world_state.js' },
  UPDATE_STATIONS:  { from: ['client'], delivery: DELIVERY.LATEST,   purpose: 'Station positions as the browser sees them' },
  UPDATE_ROBOT:     { from: ['client'], delivery: DELIVERY.LATEST,   key: data => data && data.id, purpose: 'Fields of one robot' },
  ROBOT_TELEMETRY:  { from: ['client'], delivery: DELIVERY.LATEST,   key: data => data && data.robotId, purpose: 'One robot\'s pose and state at 5 Hz from the browser simulation; feeds the world model only (shadow mode)' },
  DISPATCH_TARGET:  { from: ['client', 'server'], delivery: DELIVERY.RELIABLE, expiresMs: 5000, purpose: 'Send a robot to a point; the server re-broadcasts it' },
  EXECUTE_SCHEDULE: { from: ['client', 'server'], delivery: DELIVERY.RELIABLE, expiresMs: 5000, purpose: 'Run a master schedule; the server re-broadcasts it' },
  E_STOP:           { from: ['client', 'server'], delivery: DELIVERY.CRITICAL, purpose: 'data: { robotId?, reason?, source? } stop one robot, or all without robotId; the server relays it to every client' },
  ACK:              { from: ['client', 'server'], delivery: DELIVERY.NONE,     purpose: 'data: { id, holdMs } confirms delivery of message id' }
});

export function deliveryOf(type) {
  const entry = MESSAGES[type];
  return entry ? entry.delivery : null;
}

// True for a message that should be confirmed with ACK. Messages without an id (older
// senders) can't be acknowledged.
export function needsAck(msg) {
  if (!msg || msg.id === undefined || msg.id === null) return false;
  const delivery = deliveryOf(msg.type);
  return delivery === DELIVERY.RELIABLE || delivery === DELIVERY.CRITICAL;
}

// Returns envelope(type, data) for one sender. senderTag is a short label such as 's' or 'c';
// a random suffix keeps ids unique across restarts and page reloads.
export function createEnvelopeFactory(senderTag) {
  const prefix = `${senderTag}-${Math.random().toString(36).slice(2, 8)}`;
  let counter = 0;
  return (type, data) => ({ type, id: `${prefix}-${++counter}`, t: Math.round(performance.now() * 10) / 10, data });
}

// ACK for msg, given the receiver's clock reading when msg arrived.
export function createAck(envelope, msg, receivedAt) {
  const holdMs = Math.round((performance.now() - receivedAt) * 10) / 10;
  return envelope('ACK', { id: msg.id, holdMs });
}

// Remembers the last `limit` message ids, so a message re-sent after a reconnect (or a
// repeated E_STOP) is acknowledged again but handled only once.
export function createSeenIds(limit = 1000) {
  const ids = new Set();
  return {
    has: id => ids.has(id),
    add(id) {
      ids.add(id);
      if (ids.size > limit) ids.delete(ids.values().next().value);
    }
  };
}
