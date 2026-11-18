// WebSocket link to the simulation server: connects to /ws, reconnects with backoff and
// sends enveloped { type, id, t, data } messages through an outbox that applies each type's
// delivery class (shared/outbox.js). Reliable and critical messages from the server are
// answered with ACK. What incoming messages mean is up to the caller.
import { createEnvelopeFactory, createAck, needsAck, createSeenIds } from '/shared/protocol.js';
import { createOutbox } from '/shared/outbox.js';

const envelope = createEnvelopeFactory('c');
let socket = null;
let reconnectDelay = 1000;
let handlers = {};
// Reliable and critical server message ids already handled (the server re-sends E_STOP until ACKed).
const seenIds = createSeenIds();
// One outbox for the page: queued and unACKed messages survive a reconnect.
const outbox = createOutbox({
  isOpen,
  write: text => socket.send(text),
  bufferedAmount: () => (socket ? socket.bufferedAmount : 0)
});

// handlers.onOpen() runs after every (re)connect; handlers.onMessage(msg) gets each parsed message.
export function connect(options = {}) {
  handlers = options;
  open();
}

function open() {
  try {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

    socket.onopen = () => {
      console.log('[AnyLogic Bridge] Connected to simulation server');
      reconnectDelay = 1000;
      outbox.onOpen();
      if (handlers.onOpen) handlers.onOpen();
    };

    socket.onclose = () => {
      console.warn(`[AnyLogic Bridge] Disconnected. Reconnecting in ${reconnectDelay / 1000}s...`);
      setTimeout(open, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 15000);
    };

    socket.onmessage = (event) => {
      const receivedAt = performance.now();
      let msg;
      try {
        msg = JSON.parse(event.data);
        if (msg.type === 'ACK') {
          outbox.ack(msg.data && msg.data.id);
          return;
        }
        // A re-sent reliable or critical message is ACKed again but handled once.
        const repeat = needsAck(msg) && seenIds.has(msg.id);
        if (needsAck(msg)) seenIds.add(msg.id);
        if (!repeat && handlers.onMessage) handlers.onMessage(msg);
      } catch (err) {
        console.error(err);
      }
      if (needsAck(msg)) outbox.send(createAck(envelope, msg, receivedAt));
    };
  } catch (err) {
    console.warn('[WebSocket] Could not connect:', err);
  }
}

export function isOpen() {
  return !!socket && socket.readyState === WebSocket.OPEN;
}

// Queues a message for the server. The outbox decides when it is written; messages queued
// while disconnected follow their delivery class after the reconnect (see shared/outbox.js).
export function send(type, data) {
  outbox.send(envelope(type, data));
  return true;
}
