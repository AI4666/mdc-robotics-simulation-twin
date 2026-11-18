// Tests for the shared message table and envelope in shared/protocol.js.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { DELIVERY, MESSAGES, deliveryOf, needsAck, createEnvelopeFactory, createAck } = require('../shared/protocol.js');

const ROOT = path.join(__dirname, '..');

test('every table entry has a sender and a known delivery class', () => {
  for (const [type, entry] of Object.entries(MESSAGES)) {
    assert.ok(Array.isArray(entry.from) && entry.from.length > 0, `${type}: from`);
    entry.from.forEach(f => assert.ok(['client', 'server'].includes(f), `${type}: from ${f}`));
    assert.ok(Object.values(DELIVERY).includes(entry.delivery), `${type}: delivery ${entry.delivery}`);
    assert.ok(entry.purpose, `${type}: purpose`);
  }
});

// Every message type the server or browser sends or handles must be in the table.
test('the table covers every message type used in server and browser code', () => {
  const files = ['server.js', 'public/app.js', 'public/net.js'];
  const patterns = [
    /broadcast\('([A-Z_]+)'/g,
    /envelope\('([A-Z_]+)'/g,
    /\bsend\('([A-Z_]+)'/g,
    /\.type\s*[!=]==\s*'([A-Z_]+)'/g
  ];
  const used = new Set();
  for (const file of files) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const re of patterns) for (const m of src.matchAll(re)) used.add(m[1]);
  }
  assert.ok(used.size >= 8, `found only ${[...used].join(', ')}`);
  const missing = [...used].filter(type => !MESSAGES[type]);
  assert.deepStrictEqual(missing, [], `types missing from shared/protocol.js: ${missing.join(', ')}`);
});

test('only reliable and critical messages with an id need an ACK', () => {
  assert.strictEqual(needsAck({ type: 'DISPATCH_TARGET', id: 'a' }), true);
  assert.strictEqual(needsAck({ type: 'INIT_FLEET', id: 'a' }), true);
  assert.strictEqual(needsAck({ type: 'DISPATCH_TARGET' }), false);
  assert.strictEqual(needsAck({ type: 'ROBOT_UPDATE', id: 'a' }), false);
  assert.strictEqual(needsAck({ type: 'ACK', id: 'a' }), false);
  assert.strictEqual(needsAck({ type: 'NOT_A_TYPE', id: 'a' }), false);
  assert.strictEqual(needsAck(undefined), false);
  assert.strictEqual(deliveryOf('NOT_A_TYPE'), null);
});

test('envelopes have unique ids per sender and a monotonic t', () => {
  const a = createEnvelopeFactory('s');
  const b = createEnvelopeFactory('s');
  const m1 = a('ROBOT_UPDATE', { x: 1 });
  const m2 = a('ROBOT_UPDATE', { x: 2 });
  const other = b('ROBOT_UPDATE', {});
  assert.deepStrictEqual(Object.keys(m1), ['type', 'id', 't', 'data']);
  assert.match(m1.id, /^s-[a-z0-9]+-1$/);
  assert.match(m2.id, /^s-[a-z0-9]+-2$/);
  assert.notStrictEqual(m1.id.split('-')[1], other.id.split('-')[1]);
  assert.ok(m2.t >= m1.t);
  assert.deepStrictEqual(m2.data, { x: 2 });
});

test('ACK names the confirmed message and how long it was held', () => {
  const envelope = createEnvelopeFactory('c');
  const ack = createAck(envelope, { type: 'DISPATCH_TARGET', id: 's-abc-7' }, performance.now() - 5);
  assert.strictEqual(ack.type, 'ACK');
  assert.strictEqual(ack.data.id, 's-abc-7');
  assert.ok(ack.data.holdMs >= 5 && ack.data.holdMs < 1000);
});
