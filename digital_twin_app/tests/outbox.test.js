// Unit tests for shared/outbox.js with a fake socket whose buffered byte count the test controls.
const test = require('node:test');
const assert = require('node:assert');
const { createOutbox, DEFAULT_CAP_BYTES } = require('../shared/outbox.js');
const { createEnvelopeFactory } = require('../shared/protocol.js');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// A fake socket: records every write; `buffered` stands in for WebSocket.bufferedAmount.
function fakeTransport() {
  const t = {
    open: true,
    buffered: 0,
    writes: [],
    isOpen: () => t.open,
    write: text => t.writes.push(JSON.parse(text)),
    bufferedAmount: () => t.buffered
  };
  return t;
}

function setup(options = {}) {
  const transport = fakeTransport();
  const outbox = createOutbox(transport, { retryMs: 5, criticalResendMs: 40, ...options });
  const envelope = createEnvelopeFactory('s');
  return { transport, outbox, envelope };
}

test('without congestion every message is written at once, in order', t => {
  const { transport, outbox, envelope } = setup();
  t.after(() => outbox.close());
  outbox.send(envelope('ROBOT_UPDATE', { n: 1 }));
  outbox.send(envelope('DISPATCH_TARGET', { id: 'AMR-01' }));
  outbox.send(envelope('ROBOT_UPDATE', { n: 2 }));
  outbox.send(envelope('ACK', { id: 'x', holdMs: 0 }));
  assert.deepStrictEqual(transport.writes.map(m => m.type), ['ROBOT_UPDATE', 'DISPATCH_TARGET', 'ROBOT_UPDATE', 'ACK']);
  assert.deepStrictEqual(transport.writes.map(m => m.data.n ?? null), [1, null, 2, null]);
});

test('E_STOP is written immediately while hundreds of messages wait behind a full socket', async t => {
  const { transport, outbox, envelope } = setup();
  t.after(() => outbox.close());
  transport.buffered = DEFAULT_CAP_BYTES; // socket buffer at the cap: nothing queued may be written

  for (let n = 1; n <= 500; n++) outbox.send(envelope('ROBOT_UPDATE', { n }));
  for (let n = 1; n <= 50; n++) outbox.send(envelope('DISPATCH_TARGET', { n }));
  assert.strictEqual(transport.writes.length, 0, 'nothing may pass the cap');

  const stop = envelope('E_STOP', { robotId: 'AMR-01' });
  outbox.send(stop);
  assert.deepStrictEqual(transport.writes.map(m => m.id), [stop.id], 'E_STOP must be the very next write');
  const stats = outbox.stats();
  assert.strictEqual(stats.queuedReliable, 50);
  assert.strictEqual(stats.queuedLatest, 1);
  assert.deepStrictEqual(stats.criticalBytesAhead, [DEFAULT_CAP_BYTES], 'bytes ahead of E_STOP never exceed the cap plus one message');

  // When the socket drains: all 50 reliable messages in order, then one ROBOT_UPDATE (the newest).
  transport.buffered = 0;
  await sleep(30);
  const after = transport.writes.slice(1).filter(m => m.type !== 'E_STOP');
  assert.deepStrictEqual(after.filter(m => m.type === 'DISPATCH_TARGET').map(m => m.data.n), Array.from({ length: 50 }, (_, i) => i + 1));
  assert.deepStrictEqual(after.filter(m => m.type === 'ROBOT_UPDATE').map(m => m.data.n), [500]);
  assert.strictEqual(after.at(-1).type, 'ROBOT_UPDATE', 'queued reliable messages go before queued latest ones');
  assert.strictEqual(outbox.stats().coalesced, 499);
});

test('latest messages with a key are coalesced per key', async t => {
  const { transport, outbox, envelope } = setup();
  t.after(() => outbox.close());
  transport.buffered = DEFAULT_CAP_BYTES;
  for (let n = 1; n <= 30; n++) {
    outbox.send(envelope('UPDATE_ROBOT', { id: `AMR-0${(n % 3) + 1}`, n }));
  }
  transport.buffered = 0;
  await sleep(20);
  assert.deepStrictEqual(transport.writes.map(m => `${m.data.id}:${m.data.n}`).sort(), ['AMR-01:30', 'AMR-02:28', 'AMR-03:29']);
});

test('the socket buffer never goes over the cap by more than one message', async t => {
  const { transport, outbox, envelope } = setup();
  t.after(() => outbox.close());
  // Each write adds its size to the fake buffer, like a socket that cannot send.
  transport.write = text => { transport.writes.push(JSON.parse(text)); transport.buffered += text.length; };
  const big = 'x'.repeat(4000);
  for (let n = 1; n <= 100; n++) outbox.send(envelope('DISPATCH_TARGET', { n, big }));
  const oneMessage = JSON.stringify(envelope('DISPATCH_TARGET', { n: 100, big })).length;
  assert.ok(transport.buffered < DEFAULT_CAP_BYTES + oneMessage, `buffered ${transport.buffered}`);
  assert.ok(outbox.stats().queuedReliable > 0, 'the rest waits in the outbox');
});

test('a critical message is re-sent until it is ACKed', async t => {
  const { transport, outbox, envelope } = setup();
  t.after(() => outbox.close());
  const stop = envelope('E_STOP', {});
  outbox.send(stop);
  await sleep(130);
  const sentBeforeAck = transport.writes.filter(m => m.id === stop.id).length;
  assert.ok(sentBeforeAck >= 3, `expected the first send plus re-sends, got ${sentBeforeAck}`);
  outbox.ack(stop.id);
  await sleep(100);
  assert.strictEqual(transport.writes.filter(m => m.id === stop.id).length, sentBeforeAck);
  assert.strictEqual(outbox.stats().unacked, 0);
});

test('after a reconnect: E_STOP first, then unACKed reliable messages in order, expired ones dropped', t => {
  let clock = 0;
  const { transport, outbox, envelope } = setup({ now: () => clock, criticalResendMs: 60000 });
  t.after(() => outbox.close());
  const old = envelope('DISPATCH_TARGET', { n: 'old' });
  outbox.send(old); // written but never ACKed
  clock = 1000;
  const recent = envelope('EXECUTE_SCHEDULE', { n: 'recent' });
  outbox.send(recent); // written but never ACKed
  const acked = envelope('DISPATCH_TARGET', { n: 'acked' });
  outbox.send(acked);
  outbox.ack(acked.id);

  transport.open = false;
  const queuedWhileDown = envelope('DISPATCH_TARGET', { n: 'while down' });
  outbox.send(queuedWhileDown);
  const stop = envelope('E_STOP', {});
  outbox.send(stop);
  outbox.send(envelope('ACK', { id: 'dropped while down', holdMs: 0 }));
  const writesBefore = transport.writes.length;

  clock = 5500; // `old` is now 5.5 s old, past the 5 s expiry; the others are not
  transport.open = true;
  outbox.onOpen();
  const replay = transport.writes.slice(writesBefore);
  assert.deepStrictEqual(replay.map(m => m.data.n ?? m.type), ['E_STOP', 'recent', 'while down']);
  assert.strictEqual(outbox.stats().expired, 1);
});

test('an unknown message type is rejected', t => {
  const { outbox, envelope } = setup();
  t.after(() => outbox.close());
  assert.throws(() => outbox.send(envelope('NOT_IN_TABLE', {})), /shared\/protocol\.js/);
});
