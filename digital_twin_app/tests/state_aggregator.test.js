// Tests for ai/state_aggregator.js and shared/world_state.js: every message stays under 8 KB,
// and a client rebuilds the server's state from deltas even when queued messages are replaced.
const test = require('node:test');
const assert = require('node:assert');
const { StateAggregator, DEADBANDS } = require('../ai/state_aggregator.js');
const { WorldModel } = require('../world_model.js');
const { createWorldStateMirror } = require('../shared/world_state.js');

const MAX_BYTES = 8 * 1024;
// The largest envelope the server puts around the data.
const envelopeSize = data => JSON.stringify({ type: 'WORLD_STATE', id: 's-abcdef-1234567', t: 123456789.9, data }).length;

// Deterministic random numbers, so a failure can be replayed.
function rng(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// An aggregator over a real world model, with a test clock. Each client stands in for an
// outbox "latest" slot: one unsent WORLD_STATE that a newer one replaces until delivered.
function setup(options = {}) {
  const clock = { t: 0 };
  const world = new WorldModel();
  const aggregator = new StateAggregator(world, { now: () => clock.t, ...options });
  function addClient() {
    const client = { slot: null, mirror: createWorldStateMirror(), sizes: [], messages: [] };
    aggregator.addClient(client, data => {
      client.sizes.push(envelopeSize(data));
      client.messages.push(data);
      if (client.slot) aggregator.replaced(client, client.slot, data);
      client.slot = data;
    });
    client.deliver = () => {
      if (client.slot) client.mirror.apply(client.slot);
      client.slot = null;
    };
    client.sent = () => aggregator.clients.get(client).sent;
    return client;
  }
  return { clock, world, aggregator, addClient };
}

// Rebuilt values match the server's view: pose within the deadband, everything else exactly.
function assertMatchesView(rebuilt, view, label) {
  for (const section of ['robots', 'stations']) {
    assert.deepStrictEqual(Object.keys(rebuilt[section]).sort(), Object.keys(view[section]).sort(), `${label}: ${section} ids`);
    for (const [id, fields] of Object.entries(view[section])) {
      for (const [field, value] of Object.entries(fields)) {
        const got = rebuilt[section][id][field];
        if (field === 'heading') {
          assert.ok(Math.abs(Math.atan2(Math.sin(got - value), Math.cos(got - value))) < DEADBANDS.heading, `${label}: ${id}.heading ${got} vs ${value}`);
        } else if (DEADBANDS[field] !== undefined) {
          assert.ok(Math.abs(got - value) < DEADBANDS[field], `${label}: ${id}.${field} ${got} vs ${value}`);
        } else {
          assert.deepStrictEqual(got, value, `${label}: ${id}.${field}`);
        }
      }
    }
  }
}

function telemetry(world, clock, robotId, fields) {
  world.applyTelemetry({ robotId, source: 'sim', ...fields }, clock.t);
}

test('a client rebuilds the exact state from deltas while 30% of queued messages are replaced', () => {
  const random = rng(42);
  const { clock, world, aggregator, addClient } = setup();
  const client = addClient();
  let replacedCount = 0;
  let checkpoints = 0;

  for (let tickNo = 1; tickNo <= 500; tickNo++) {
    clock.t += 200;
    for (const r of world.getRobots()) {
      if (random() < 0.8) {
        const big = random() < 0.5;
        const step = big ? 0.05 + random() * 0.2 : random() * 0.006; // some moves stay under 1 cm
        telemetry(world, clock, r.id, {
          x: (r.x || 0) + (random() - 0.5) * step,
          z: (r.z || 0) + (random() - 0.5) * step,
          y: r.type === 'drone' ? 1.5 + random() * 0.6 : 0.05,
          heading: ((r.heading || 0) + (random() - 0.5) * (big ? 0.6 : 0.01)) % (Math.PI * 2),
          speed: random() * 1.3,
          battery: Math.max(0, (r.battery || 100) - random() * 0.05),
          status: random() < 0.05 ? `Status ${Math.floor(random() * 5)}` : r.status
        });
      }
    }
    if (random() < 0.05) world.updateStations({ testing: { x: random() * 4 - 2, z: random() * 3 - 1.5 } });
    if (random() < 0.02) world.mergeRobots([{ id: `EXTRA-${tickNo}`, name: 'Added', type: 'amr', x: 0, y: 0.05, z: 0 }]);
    const extra = world.getRobots().findIndex(r => r.id.startsWith('EXTRA-'));
    if (extra >= 0 && random() < 0.02) world.robots.splice(extra, 1); // removal

    if (client.slot && random() < 0.3) replacedCount++; // the next tick will replace it
    else client.deliver();
    aggregator.tick();
    assert.ok(client.sizes.at(-1) <= MAX_BYTES, `tick ${tickNo}: ${client.sizes.at(-1)} bytes`);

    // Checkpoint: drain the slot, one quiet tick, drain again. The copy must then equal
    // exactly what the server believes it sent, and match the world within the deadband.
    if (tickNo % 50 === 0) {
      client.deliver();
      aggregator.tick();
      client.deliver();
      const rebuilt = client.mirror.get();
      assert.deepStrictEqual({ robots: rebuilt.robots, stations: rebuilt.stations }, client.sent(), `tick ${tickNo}: rebuilt vs sent`);
      assertMatchesView(rebuilt, aggregator.view(), `tick ${tickNo}`);
      assert.strictEqual(rebuilt.complete, true);
      checkpoints++;
    }
  }
  assert.strictEqual(checkpoints, 10);
  assert.ok(replacedCount > 100, `only ${replacedCount} messages were replaced`);
  assert.ok(client.mirror.get().resets >= 19, 'a snapshot every 5 s (25 ticks)');
});

test('deltas alone rebuild the same state as a fresh snapshot', () => {
  const random = rng(7);
  const { clock, world, aggregator, addClient } = setup({ snapshotMs: 60000 });
  const early = addClient();
  early.deliver();
  for (let i = 0; i < 100; i++) {
    clock.t += 200;
    for (const r of world.getRobots()) {
      telemetry(world, clock, r.id, { x: (r.x || 0) + random() * 0.1 - 0.05, z: (r.z || 0) + random() * 0.1 - 0.05, heading: random() * 6, speed: random(), battery: 50 + random() * 50, status: `S${i % 7}` });
    }
    aggregator.tick();
    early.deliver();
  }
  assert.strictEqual(early.mirror.get().resets, 1, 'after the first snapshot, only deltas');
  const late = addClient(); // joins now: one snapshot
  late.deliver();
  assert.strictEqual(late.messages.length, 1);
  assertMatchesView(early.mirror.get(), aggregator.view(), 'deltas');
  assertMatchesView(late.mirror.get(), aggregator.view(), 'snapshot');
});

test('every message stays under 8 KB with 60 robots, and the state still arrives in full', () => {
  const { clock, world, aggregator, addClient } = setup();
  const longText = 'Very long status text for size testing '.repeat(4); // 160 characters
  world.mergeRobots(Array.from({ length: 50 }, (_, i) => ({ id: `BULK-${String(i).padStart(2, '0')}`, name: `Bulk robot number ${i} ${longText}`.slice(0, 120), type: 'amr', y: 0.05 })));
  const moveAll = () => world.getRobots().forEach((r, i) => telemetry(world, clock, r.id, { x: Math.sin(clock.t / 1000 + i) * 2, z: Math.cos(clock.t / 1000 + i), heading: (clock.t / 500 + i) % 6, speed: 1.234, battery: 77.7, status: `${longText}${clock.t}` }));
  moveAll();
  const client = addClient();
  assert.strictEqual(client.messages[0].complete, false, 'the first snapshot is bigger than 8 KB, so it is split');
  for (let i = 0; i < 10; i++) {
    client.deliver();
    clock.t += 200;
    aggregator.tick();
  }
  client.deliver();
  assert.ok(Math.max(...client.sizes) <= MAX_BYTES, `largest message ${Math.max(...client.sizes)} bytes`);
  const total = JSON.stringify(aggregator.view()).length;
  assert.ok(total > 1.4 * MAX_BYTES, `test state is only ${total} bytes`);
  // Stop moving: the backlog drains and the copy becomes complete.
  for (let i = 0; i < 6; i++) { aggregator.tick(); client.deliver(); }
  const rebuilt = client.mirror.get();
  assert.strictEqual(rebuilt.complete, true);
  assert.strictEqual(Object.keys(rebuilt.robots).length, 60);
  assertMatchesView(rebuilt, aggregator.view(), '60 robots');
});

test('pose changes under 1 cm or 1° are not sent; larger ones are', () => {
  const { clock, world, aggregator, addClient } = setup();
  telemetry(world, clock, 'AMR-01', { x: 0, z: 0, heading: 3.14 });
  const client = addClient();
  client.deliver();
  const next = fields => { telemetry(world, clock, 'AMR-01', fields); aggregator.tick(); client.deliver(); return client.messages.at(-1).robots && client.messages.at(-1).robots['AMR-01']; };
  assert.strictEqual(next({ x: 0.009 }), undefined, '9 mm: not sent');
  assert.deepStrictEqual(next({ x: 0.011 }), { x: 0.011 }, '11 mm: sent');
  assert.strictEqual(next({ heading: 3.14 + 0.5 * Math.PI / 180 }), undefined, '0.5°: not sent');
  assert.strictEqual(next({ heading: 3.14 - 2 * Math.PI + 0.001 }), undefined, 'same angle after wrapping: not sent');
  assert.ok(next({ heading: 3.14 + 2 * Math.PI / 180 }).heading, '2°: sent');
  assert.deepStrictEqual(next({ status: 'Docked' }), { status: 'Docked' }, 'other fields: any change');
});

test('a robot is stale after 1 s without telemetry; an idle tick is a small heartbeat', () => {
  const { clock, world, aggregator, addClient } = setup();
  telemetry(world, clock, 'AMR-02', { x: 1 });
  const client = addClient();
  client.deliver();
  assert.strictEqual(client.mirror.get().robots['AMR-02'].stale, false);
  assert.strictEqual(client.mirror.get().robots['AMR-03'].stale, true, 'never reported');
  clock.t += 900;
  aggregator.tick();
  client.deliver();
  assert.deepStrictEqual(client.messages.at(-1), { seq: 2, reset: false, complete: true }, 'nothing changed: heartbeat only');
  clock.t += 200;
  aggregator.tick();
  client.deliver();
  assert.deepStrictEqual(client.messages.at(-1).robots, { 'AMR-02': { stale: true } });
});

test('a replaced snapshot is followed by a new snapshot', () => {
  const { aggregator, addClient } = setup();
  const client = addClient(); // snapshot waits in the slot, undelivered
  aggregator.tick(); // a delta replaces it
  aggregator.tick();
  assert.deepStrictEqual(client.messages.map(m => m.reset), [true, false, true]);
  client.deliver();
  assertMatchesView(client.mirror.get(), aggregator.view(), 'after re-snapshot');
});
