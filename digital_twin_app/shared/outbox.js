// outbox.js — per-connection send queue that applies the delivery classes in protocol.js.
// Used by server.js (one outbox per client) and public/net.js (one outbox for the page).
//
// A WebSocket is a single TCP stream: nothing can overtake bytes already handed to the
// socket. So queued messages are only written while the socket's own buffer
// (bufferedAmount) is below capBytes. A critical message (E_STOP) is written at once,
// so at most about capBytes plus one message can ever be ahead of it.
//
//   latest    one slot per type (and key); a newer message replaces an unsent older one
//   reliable  FIFO, never coalesced, kept until ACKed; re-sent after a reconnect unless
//             older than the type's expiresMs
//   critical  written immediately, re-sent every criticalResendMs until ACKed
//   none      written immediately if connected, otherwise dropped (ACK)
import { DELIVERY, MESSAGES } from './protocol.js';

export const DEFAULT_CAP_BYTES = 64 * 1024;

// transport: { isOpen(), write(text), bufferedAmount() }
// options.onReplace(oldMsg, newMsg) is called when a latest message replaces an unsent one,
// so a sender of deltas can re-send what only the replaced message carried.
export function createOutbox(transport, options = {}) {
  const capBytes = options.capBytes ?? DEFAULT_CAP_BYTES;
  const retryMs = options.retryMs ?? 10;
  const criticalResendMs = options.criticalResendMs ?? 100;
  const maxUnacked = options.maxUnacked ?? 1000;
  const now = options.now ?? (() => performance.now());

  const reliableQueue = []; // entries not yet written, oldest first
  const latestSlots = new Map(); // `${type}:${key}` -> entry
  const unacked = new Map(); // id -> entry, reliable and critical messages written but not ACKed
  let flushTimer = null;
  let resendTimer = null;
  const counters = { written: 0, coalesced: 0, expired: 0, resent: 0, criticalBytesAhead: [] };

  function entryFor(msg) {
    const spec = MESSAGES[msg.type];
    if (!spec) throw new Error(`Unknown message type ${msg.type}; add it to shared/protocol.js`);
    return { msg, spec, text: JSON.stringify(msg), queuedAt: now() };
  }

  function write(entry) {
    transport.write(entry.text);
    counters.written++;
  }

  function remember(entry) {
    unacked.set(entry.msg.id, entry);
    if (unacked.size > maxUnacked) unacked.delete(unacked.keys().next().value);
  }

  function isExpired(entry) {
    return entry.spec.expiresMs !== undefined && now() - entry.queuedAt > entry.spec.expiresMs;
  }

  function writeCritical(entry) {
    counters.criticalBytesAhead.push(transport.bufferedAmount());
    write(entry);
  }

  function send(msg) {
    const entry = entryFor(msg);
    switch (entry.spec.delivery) {
      case DELIVERY.CRITICAL:
        remember(entry);
        if (transport.isOpen()) writeCritical(entry);
        startResending();
        return;
      case DELIVERY.NONE:
        if (transport.isOpen()) write(entry);
        return;
      case DELIVERY.RELIABLE:
        reliableQueue.push(entry);
        break;
      default: {
        const key = `${msg.type}:${entry.spec.key ? entry.spec.key(msg.data) : ''}`;
        if (latestSlots.has(key)) {
          counters.coalesced++;
          if (options.onReplace) options.onReplace(latestSlots.get(key).msg, msg);
        }
        latestSlots.set(key, entry);
      }
    }
    flush();
  }

  // Writes queued messages while the socket buffer has room: reliable first, then latest.
  function flush() {
    clearTimeout(flushTimer);
    flushTimer = null;
    if (!transport.isOpen()) return;
    while (reliableQueue.length > 0 || latestSlots.size > 0) {
      if (transport.bufferedAmount() >= capBytes) {
        flushTimer = setTimeout(flush, retryMs);
        return;
      }
      if (reliableQueue.length > 0) {
        const entry = reliableQueue.shift();
        if (isExpired(entry)) {
          counters.expired++;
          continue;
        }
        write(entry);
        remember(entry);
      } else {
        const [key, entry] = latestSlots.entries().next().value;
        latestSlots.delete(key);
        write(entry);
      }
    }
  }

  function startResending() {
    if (resendTimer) return;
    resendTimer = setInterval(() => {
      const pending = [...unacked.values()].filter(e => e.spec.delivery === DELIVERY.CRITICAL);
      if (pending.length === 0) {
        clearInterval(resendTimer);
        resendTimer = null;
        return;
      }
      if (!transport.isOpen()) return;
      pending.forEach(entry => {
        writeCritical(entry);
        counters.resent++;
      });
    }, criticalResendMs);
  }

  function ack(id) {
    unacked.delete(id);
  }

  // After a (re)connect: critical messages first, then unACKed reliable ones in their
  // original order ahead of anything queued since, then the normal flush.
  function onOpen() {
    const pending = [...unacked.values()];
    unacked.clear();
    pending.filter(e => e.spec.delivery === DELIVERY.CRITICAL).forEach(entry => {
      remember(entry);
      writeCritical(entry);
    });
    reliableQueue.unshift(...pending.filter(e => e.spec.delivery === DELIVERY.RELIABLE));
    flush();
  }

  // Stops all timers; queued messages are discarded with the outbox.
  function close() {
    clearTimeout(flushTimer);
    clearInterval(resendTimer);
    flushTimer = null;
    resendTimer = null;
  }

  function stats() {
    return {
      ...counters,
      criticalBytesAhead: [...counters.criticalBytesAhead],
      queuedReliable: reliableQueue.length,
      queuedLatest: latestSlots.size,
      unacked: unacked.size
    };
  }

  return { send, flush, ack, onOpen, close, stats };
}
