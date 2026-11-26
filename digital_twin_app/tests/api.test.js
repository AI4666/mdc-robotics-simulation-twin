// Compares every REST endpoint and the basic WebSocket exchange against saved snapshots.
// Run with `npm test`. After an intended change, refresh with `npm run test:update-snapshots`
// and review the diff of tests/snapshots/api.json before committing it.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const WebSocket = require('ws');
const { startServer } = require('./server_harness');

const PORT = 3100;
const SNAPSHOT_FILE = path.join(__dirname, 'snapshots', 'api.json');
const UPDATE = process.env.UPDATE_SNAPSHOTS === '1';

// Same body the browser's AI planner sends with default settings (app.js recalculateFleetSchedule).
const BROWSER_SCHEDULE_BODY = {
  weather_condition: 'Clear',
  pedestrian_traffic_index: 0.48,
  payload_weight_kg: 4.5,
  bounds: { minX: -2.8, maxX: 2.8, minZ: -1.8, maxZ: 1.8 }
};

// The browser's default keep-out boxes (app.js DEFAULT_OBSTACLES).
const BROWSER_OBSTACLES = [
  { minX: -2.2, maxX: -0.4, minZ: -0.6, maxZ: 0.35 },
  { minX: 0.4, maxX: 2.1, minZ: -0.5, maxZ: 0.45 },
  { minX: -1.2, maxX: 1.2, minZ: 0.95, maxZ: 1.25 }
];

// Order matters: the server's A* planner keeps bounds and obstacles between calls.
const CASES = [
  ['GET /api/robots', 'GET', '/api/robots'],
  ['GET /api/stations', 'GET', '/api/stations'],
  ['GET /api/schedule/sample', 'GET', '/api/schedule/sample'],
  ['POST /api/plan/astar (server defaults)', 'POST', '/api/plan/astar',
    { start: { x: -2.0, z: -1.0 }, goal: { x: 2.0, z: 1.0 } }],
  ['POST /api/plan/astar (missing goal)', 'POST', '/api/plan/astar', { start: { x: 0, z: 0 } }],
  ['POST /api/ml/predict-transit', 'POST', '/api/ml/predict-transit',
    { astar_path_len: 14, num_turns: 3, manhattan_dist: 12, detour_ratio: 1.17, payload_weight_kg: 4.5,
      pedestrian_traffic_index: 0.48, weather_condition: 'Clear', robot_model: 'AMR-01' }],
  ['POST /api/schedule/jobs (empty body)', 'POST', '/api/schedule/jobs', {}],
  ['POST /api/schedule/jobs (browser default body)', 'POST', '/api/schedule/jobs', BROWSER_SCHEDULE_BODY],
  ['POST /api/plan/astar (browser bounds + obstacles)', 'POST', '/api/plan/astar',
    { start: { x: -2.0, z: -1.2 }, goal: { x: 2.0, z: 1.5 },
      bounds: BROWSER_SCHEDULE_BODY.bounds, dynamicObstacles: BROWSER_OBSTACLES }],
  ['POST /api/anylogic/update', 'POST', '/api/anylogic/update',
    { source: 'Test', robots: [{ id: 'AMR-01', x: 1.0, z: -0.5, status: 'Test Move' },
                               { id: 'NEW-99', name: 'Added by AnyLogic', x: 0, z: 0 }] }],
  ['GET /api/robots (after AnyLogic update)', 'GET', '/api/robots']
];

// Measured durations change on every run, so they are replaced before comparing.
const TIMING_FIELDS = ['solveTimeMs'];
function withoutTimings(value) {
  return JSON.parse(JSON.stringify(value, (key, v) => (TIMING_FIELDS.includes(key) ? '<timing>' : v)));
}

async function callApi(base, method, url, body) {
  const res = await fetch(base + url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, body: withoutTimings(await res.json()) };
}

// Envelope ids and clock readings change on every run; keep only their shape.
function normalizeEnvelope(msg) {
  return {
    ...msg,
    id: typeof msg.id === 'string' && msg.id.length > 0 ? '<id>' : msg.id,
    t: typeof msg.t === 'number' ? '<t>' : msg.t
  };
}

// Connects a client, records INIT_FLEET, sends UPDATE_STATIONS and records the broadcast reply.
// The client sends the old un-enveloped form, which the server must still accept. WORLD_STATE
// arrives on a 5 Hz timer and has its own tests, so it isn't recorded here.
function websocketExchange(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    const received = [];
    const timer = setTimeout(() => { ws.terminate(); reject(new Error('WebSocket exchange timed out')); }, 5000);
    ws.on('message', raw => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'WORLD_STATE') return;
      received.push(normalizeEnvelope(msg));
      if (msg.type === 'INIT_FLEET') {
        ws.send(JSON.stringify({ type: 'UPDATE_STATIONS', data: { stations: { inventory: { x: -2.0, y: 0.05, z: -1.0 } } } }));
      } else if (msg.type === 'STATIONS_UPDATE') {
        clearTimeout(timer);
        ws.close();
        resolve(received);
      }
    });
    ws.on('error', reject);
  });
}

// Opens a client and resolves once the server's INIT_FLEET has arrived.
function connectClient(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    ws.once('message', () => resolve(ws));
    ws.once('error', reject);
  });
}

// Sends one message and collects everything the server sends back within waitMs, except the
// WORLD_STATE every client receives on a timer.
function sendAndCollect(port, message, waitMs = 300) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    const received = [];
    ws.on('message', raw => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'INIT_FLEET') {
        ws.send(JSON.stringify(message));
        setTimeout(() => { ws.close(); resolve(received); }, waitMs);
      } else if (msg.type !== 'WORLD_STATE') {
        received.push(msg);
      }
    });
    ws.on('error', reject);
  });
}

test('server API and WebSocket match snapshots', async t => {
  const server = await startServer(PORT);
  t.after(() => server.stop());

  const actual = {};
  for (const [name, method, url, body] of CASES) {
    actual[name] = await callApi(server.url, method, url, body);
  }
  actual['WebSocket INIT_FLEET then UPDATE_STATIONS'] = await websocketExchange(PORT);

  if (UPDATE || !fs.existsSync(SNAPSHOT_FILE)) {
    fs.mkdirSync(path.dirname(SNAPSHOT_FILE), { recursive: true });
    fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(actual, null, 2) + '\n');
    t.diagnostic(`Snapshots written to ${SNAPSHOT_FILE}`);
    return;
  }

  const expected = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'));
  for (const name of Object.keys({ ...expected, ...actual })) {
    await t.test(name, () => assert.deepStrictEqual(actual[name], expected[name]));
  }
});

test('server envelopes its messages and acknowledges reliable ones', async t => {
  const server = await startServer(PORT + 2);
  t.after(() => server.stop());
  const port = PORT + 2;

  await t.test('a reliable message with an id gets an ACK and is still re-broadcast', async () => {
    const replies = await sendAndCollect(port, { type: 'DISPATCH_TARGET', id: 'test-1', t: 5, data: { id: 'AMR-01', targetX: 1, targetZ: 1 } });
    const ack = replies.find(m => m.type === 'ACK');
    assert.ok(ack, 'expected an ACK');
    assert.strictEqual(ack.data.id, 'test-1');
    assert.ok(typeof ack.data.holdMs === 'number' && ack.data.holdMs >= 0);
    const echo = replies.find(m => m.type === 'DISPATCH_TARGET');
    assert.deepStrictEqual(echo.data, { id: 'AMR-01', targetX: 1, targetZ: 1 });
  });

  await t.test('server messages carry a unique string id and a numeric t', async () => {
    const replies = await sendAndCollect(port, { type: 'EXECUTE_SCHEDULE', id: 'test-2', t: 6, data: { masterSchedule: [] } });
    assert.ok(replies.length >= 2);
    for (const m of replies) {
      assert.ok(typeof m.id === 'string' && m.id.startsWith('s-'), `bad id ${m.id}`);
      assert.strictEqual(typeof m.t, 'number');
    }
    assert.strictEqual(new Set(replies.map(m => m.id)).size, replies.length);
  });

  await t.test('latest-class messages and messages without an id get no ACK', async () => {
    const latest = await sendAndCollect(port, { type: 'UPDATE_STATIONS', id: 'test-3', t: 7, data: { stations: {} } });
    assert.ok(!latest.some(m => m.type === 'ACK'));
    const noId = await sendAndCollect(port, { type: 'DISPATCH_TARGET', data: { id: 'AMR-02', targetX: 0, targetZ: 0 } });
    assert.ok(!noId.some(m => m.type === 'ACK'));
  });

  await t.test('E_STOP is relayed to every client and a repeated E_STOP is handled once', async () => {
    const watcher = await connectClient(port);
    const relayed = [];
    watcher.on('message', raw => { const m = JSON.parse(raw.toString()); if (m.type === 'E_STOP') relayed.push(m); });
    const stop = { type: 'E_STOP', id: 'test-stop', t: 9, data: { robotId: 'AMR-01', source: 'test' } };
    const first = await sendAndCollect(port, stop);
    const repeat = await sendAndCollect(port, stop);
    assert.ok(first.some(m => m.type === 'ACK' && m.data.id === 'test-stop'));
    assert.ok(repeat.some(m => m.type === 'ACK' && m.data.id === 'test-stop'), 'a repeat is ACKed again');
    // The watcher doesn't ACK, so the server keeps re-sending its one relayed E_STOP (same id).
    assert.deepStrictEqual([...new Set(relayed.map(m => m.id))].length, 1, 'but relayed only once');
    assert.ok(relayed.length > 1, 'an unACKed E_STOP is re-sent');
    assert.deepStrictEqual(relayed[0].data, { robotId: 'AMR-01', source: 'test' });
    assert.ok(relayed[0].id.startsWith('s-'));
    // Once the watcher ACKs, the re-sends stop.
    watcher.send(JSON.stringify({ type: 'ACK', id: 'watcher-ack', t: 0, data: { id: relayed[0].id, holdMs: 0 } }));
    await new Promise(r => setTimeout(r, 150));
    const countAfterAck = relayed.length;
    await new Promise(r => setTimeout(r, 300));
    watcher.close();
    assert.strictEqual(relayed.length, countAfterAck, 're-sends stop after the ACK');
  });

  await t.test('an incoming ACK is accepted silently', async () => {
    const replies = await sendAndCollect(port, { type: 'ACK', id: 'test-4', t: 8, data: { id: 's-x-1', holdMs: 1 } });
    assert.deepStrictEqual(replies, []);
    assert.ok(!server.logs.some(l => l.includes('parse error')));
  });
});

// The server plans each request on its own: keep-out boxes and bounds from one request must
// not leak into the next (the planner used to keep them between requests).
test('/api/plan/astar plans each request on its own', async t => {
  const port = PORT + 6;
  const server = await startServer(port);
  t.after(() => server.stop());
  const plan = body => callApi(server.url, 'POST', '/api/plan/astar', body);
  const southRoute = { start: { x: -2.3, z: -1.3 }, goal: { x: 2.2, z: -1.3 } };

  const plain = (await plan(southRoute)).body;
  assert.strictEqual(plain.success, true);
  assert.strictEqual(plain.waypoints.length, 2, 'straight along the south side of the classroom');

  const blocked = (await plan({ ...southRoute, dynamicObstacles: [{ minX: -0.2, maxX: 0.2, minZ: -1.8, maxZ: -0.9 }] })).body;
  assert.notDeepStrictEqual(blocked.waypoints, plain.waypoints, 'a keep-out box in the request changes the route');

  const wide = (await plan({ ...southRoute, bounds: { minX: -6, maxX: 6, minZ: -4, maxZ: 4 } })).body;
  assert.strictEqual(wide.success, true);

  assert.deepStrictEqual((await plan(southRoute)).body, plain, 'the next plain request is planned exactly as before');
});

// Routes keep the request's clearance from boxes and walls (room for larger robots on a scan, see
// shared/robots.js), kept within its limits; a request without one plans as before.
test('the planner keeps the clearance a request asks for', async t => {
  const port = PORT + 8;
  const server = await startServer(port);
  t.after(() => server.stop());
  const plan = body => callApi(server.url, 'POST', '/api/plan/astar', body);
  // A box 0.3 north of a straight route below the benches: clear at the minimum 0.25, not at 0.39.
  const box = { minX: -0.2, maxX: 0.2, minZ: -0.7, maxZ: -0.6 };
  const route = { start: { x: -2.3, z: -1.0 }, goal: { x: 2.2, z: -1.0 }, dynamicObstacles: [box] };
  const plain = (await plan(route)).body;
  assert.strictEqual(plain.waypoints.length, 2, 'straight past the box at the minimum clearance');
  assert.deepStrictEqual((await plan({ ...route, clearance: 0.1 })).body, plain, 'never less than the minimum');
  assert.deepStrictEqual((await plan({ ...route, clearance: 'wide' })).body, plain, 'not a number: the minimum');

  const wide = (await plan({ ...route, clearance: 0.39 })).body;
  assert.strictEqual(wide.success, true);
  assert.ok(wide.waypoints.length > 2, 'bends away from the box');
  const pts = [route.start, ...wide.waypoints, route.goal];
  let closest = Infinity;
  for (let i = 1; i < pts.length; i++) {
    for (let k = 0; k <= 50; k++) {
      const x = pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k / 50, z = pts[i - 1].z + (pts[i].z - pts[i - 1].z) * k / 50;
      closest = Math.min(closest, Math.hypot(Math.max(box.minX - x, 0, x - box.maxX), Math.max(box.minZ - z, 0, z - box.maxZ)));
    }
  }
  assert.ok(closest >= 0.37, `keeps about 0.39 from the box (closest ${closest.toFixed(3)})`);
  assert.deepStrictEqual((await plan({ ...route, clearance: 5 })).body, (await plan({ ...route, clearance: 1.0 })).body, 'never more than the maximum');
  assert.deepStrictEqual((await plan(route)).body, plain, 'the next request without one plans as before');

  const jobs = clearance => callApi(server.url, 'POST', '/api/schedule/jobs', clearance === undefined ? {} : { clearance });
  const etas = body => body.masterSchedule.map(j => j.ml_prediction && j.ml_prediction.predicted_delivery_time_min);
  const before = (await jobs()).body;
  assert.notDeepStrictEqual((await jobs(0.6)).body.jobRoutes, before.jobRoutes, 'the AI planner keeps the clearance too');
  assert.deepStrictEqual(etas((await jobs()).body), etas(before), 'and plans as before without one');
});

// A job whose stations can't be connected shows as 'no route' with no ETA, instead of an ETA
// for a zero-length trip.
test('jobs with no route get no ETA', async t => {
  const port = PORT + 7;
  const server = await startServer(port);
  t.after(() => server.stop());
  // A keep-out box over the Electronics Bench station (-2.3, 1.2) seals it in.
  const sealed = [{ minX: -2.6, maxX: -2.0, minZ: 0.9, maxZ: 1.5 }];
  const body = (await callApi(server.url, 'POST', '/api/schedule/jobs', { dynamicObstacles: sealed })).body;
  const byJob = Object.fromEntries(body.masterSchedule.map(j => [j.job_id, j]));
  for (const id of ['JOB-102', 'JOB-103', 'JOB-105']) { // to or from the Electronics Bench
    assert.strictEqual(byJob[id].route_status, 'no_route', id);
    assert.strictEqual(byJob[id].ml_prediction, null, `${id} has no ETA`);
    assert.strictEqual(body.jobRoutes[id].success, false);
  }
  for (const id of ['JOB-101', 'JOB-104']) {
    assert.strictEqual(byJob[id].route_status, 'ok', id);
    assert.ok(byJob[id].ml_prediction.predicted_delivery_time_min > 0);
  }
});

// Shadow mode: browser telemetry updates the world model, is never broadcast, and only one
// tab (the first to report, until it disconnects) feeds it.
test('ROBOT_TELEMETRY feeds the world model from one tab without echoing', async t => {
  const port = PORT + 4;
  const server = await startServer(port);
  t.after(() => server.stop());
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const telemetry = (x, extra = {}) => JSON.stringify({ type: 'ROBOT_TELEMETRY', id: `tel-${Math.random()}`, t: 0,
    data: { robotId: 'AMR-02', source: 'sim', x, y: 0.05, z: 0.5, heading: 0.25, speed: 0.9, battery: 79.5, status: 'Patrolling', ...extra } });
  const amr02 = async () => (await callApi(server.url, 'GET', '/api/robots')).body.robots.find(r => r.id === 'AMR-02');

  const tabA = await connectClient(port);
  const tabB = await connectClient(port);
  const observer = await connectClient(port);
  t.after(() => { tabA.terminate(); tabB.terminate(); observer.terminate(); });
  const observed = [];
  observer.on('message', raw => observed.push(JSON.parse(raw.toString()).type));

  await t.test('the first tab to report becomes the source; /api/robots shows its values', async () => {
    tabA.send(telemetry(-0.75));
    await sleep(100);
    const r = await amr02();
    assert.deepStrictEqual([r.x, r.z, r.heading, r.speed, r.battery, r.source], [-0.75, 0.5, 0.25, 0.9, 79.5, 'sim']);
    assert.ok(Date.now() - r.lastTelemetryAt < 1000, 'lastTelemetryAt is recent');
  });

  await t.test('another tab is ignored while the first is connected', async () => {
    tabB.send(telemetry(2.0));
    await sleep(100);
    assert.strictEqual((await amr02()).x, -0.75);
  });

  await t.test('telemetry is never broadcast to other clients', async () => {
    for (let i = 0; i < 20; i++) tabA.send(telemetry(-0.75 + i / 100));
    await sleep(200);
    // WORLD_STATE (the aggregator's 5 Hz summary) is expected; a relay of telemetry is not.
    assert.deepStrictEqual(observed.filter(type => !['ACK', 'WORLD_STATE'].includes(type)), [], `observer received ${observed.join(', ')}`);
    assert.strictEqual((await amr02()).x, -0.56);
  });

  await t.test('when the source tab disconnects, the next tab to report takes over', async () => {
    tabA.close();
    await sleep(150);
    tabB.send(telemetry(2.0));
    await sleep(100);
    assert.strictEqual((await amr02()).x, 2.0);
    assert.ok(server.logs.some(l => l.includes('Simulation source disconnected')));
  });
});

// WORLD_STATE over a real server: a client rebuilds the world from a snapshot plus deltas,
// messages arrive at about 5 Hz and stay under 8 KB, and a late joiner rebuilds the same state.
test('clients rebuild the world model from WORLD_STATE', async t => {
  const port = PORT + 5;
  const server = await startServer(port);
  t.after(() => server.stop());
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const { createWorldStateMirror } = require('../shared/world_state.js');
  const watch = async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    const client = { ws, mirror: createWorldStateMirror(), frames: [] };
    ws.on('message', raw => {
      const m = JSON.parse(raw.toString());
      if (m.type !== 'WORLD_STATE') return;
      client.frames.push({ at: Date.now(), bytes: raw.length, reset: m.data.reset });
      client.mirror.apply(m.data);
    });
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    return client;
  };
  const near = (a, b, tol) => Math.abs(a - b) <= tol;

  const early = await watch();
  const tab = await connectClient(port); // stands in for the browser simulation
  t.after(() => { early.ws.terminate(); tab.terminate(); });

  // 2 s of AMR-02 driving a curve, reported at 20 Hz.
  const start = Date.now();
  while (Date.now() - start < 2000) {
    const s = (Date.now() - start) / 1000;
    tab.send(JSON.stringify({ type: 'ROBOT_TELEMETRY', id: `tel-${s}`, t: 0, data: { robotId: 'AMR-02', source: 'sim', x: -1 + s, y: 0.05, z: Math.sin(s), heading: s, speed: 1.0, battery: 80 - s, status: 'Driving' } }));
    await sleep(50);
  }
  await sleep(400);

  await t.test('the rebuilt robots and stations match the server', async () => {
    const robots = (await callApi(server.url, 'GET', '/api/robots')).body.robots;
    const stations = (await callApi(server.url, 'GET', '/api/stations')).body.stations;
    const state = early.mirror.get();
    assert.deepStrictEqual(Object.keys(state.robots).sort(), robots.map(r => r.id).sort());
    for (const r of robots) {
      const m = state.robots[r.id];
      assert.ok(near(m.x, r.x, 0.01) && near(m.z, r.z, 0.01), `${r.id} position ${m.x},${m.z} vs ${r.x},${r.z}`);
      assert.strictEqual(m.status, r.status);
    }
    assert.strictEqual(state.robots['AMR-02'].stale, false);
    assert.strictEqual(state.robots['AMR-01'].stale, true, 'no telemetry for AMR-01');
    for (const [key, st] of Object.entries(stations)) assert.ok(near(state.stations[key].x, st.x, 0.001), key);
    assert.strictEqual(state.complete, true);
  });

  await t.test('after the first snapshot the motion arrived as deltas, at about 5 Hz, under 8 KB', () => {
    const frames = early.frames.filter(f => f.at >= start && f.at <= start + 2000);
    assert.ok(frames.length >= 8 && frames.length <= 13, `${frames.length} WORLD_STATE messages in 2 s`);
    assert.strictEqual(early.frames.filter(f => f.reset).length, 1, 'only the snapshot on connect');
    assert.ok(Math.max(...early.frames.map(f => f.bytes)) <= 8 * 1024);
    t.diagnostic(`${frames.length} WORLD_STATE messages in 2 s; largest ${Math.max(...early.frames.map(f => f.bytes))} bytes`);
  });

  await t.test('a client that joins later rebuilds the same state from its snapshot', async () => {
    const late = await watch();
    await sleep(300);
    late.ws.close();
    const a = early.mirror.get();
    const b = late.mirror.get();
    assert.deepStrictEqual(Object.keys(b.robots).sort(), Object.keys(a.robots).sort());
    for (const id of Object.keys(a.robots)) {
      assert.ok(near(a.robots[id].x, b.robots[id].x, 0.01) && near(a.robots[id].z, b.robots[id].z, 0.01), id);
      assert.strictEqual(a.robots[id].status, b.robots[id].status);
    }
    assert.deepStrictEqual(b.stations, a.stations);
  });

  await t.test('a station edit reaches clients without waiting for the next tick', async () => {
    const before = early.frames.length;
    const sentAt = Date.now();
    tab.send(JSON.stringify({ type: 'UPDATE_STATIONS', id: 'st-1', t: 0, data: { stations: { helipad: { x: 0.5, y: 0.05, z: 0.25 } } } }));
    while (early.mirror.get().stations.helipad.x !== 0.5 && Date.now() - sentAt < 1000) await sleep(5);
    const took = Date.now() - sentAt;
    assert.strictEqual(early.mirror.get().stations.helipad.x, 0.5);
    assert.ok(took < 100, `took ${took} ms`);
    assert.ok(early.frames.length > before);
  });
});

// A client that stops reading lets the server's outbox fill up. E_STOP sent after a flood of
// robot updates must reach that client ahead of the updates still queued for it, and the
// stale updates must be coalesced instead of delivered one by one.
test('E_STOP overtakes queued traffic to a slow client', async t => {
  const port = PORT + 3;
  const server = await startServer(port);
  t.after(() => server.stop());
  const FLOOD = 3000;
  const blob = 'x'.repeat(8000);

  const slow = await connectClient(port);
  const sender = await connectClient(port);
  const emergency = await connectClient(port);
  t.after(() => { slow.terminate(); sender.terminate(); emergency.terminate(); });
  const received = [];
  let bytes = 0;
  slow.on('message', raw => {
    bytes += raw.length;
    const m = JSON.parse(raw.toString());
    received.push({ type: m.type, n: m.type === 'ROBOT_UPDATE' ? m.data.robots[0].n : undefined, bytesBefore: bytes - raw.length });
  });
  slow._socket.pause(); // stop reading: the server can't write to this client any more

  for (let n = 1; n <= FLOOD; n++) {
    sender.send(JSON.stringify({ type: 'UPDATE_ROBOT', data: { id: 'AMR-01', n, blob } }));
  }
  await new Promise(r => setTimeout(r, 200));
  emergency.send(JSON.stringify({ type: 'E_STOP', id: 'flood-stop', t: 0, data: { robotId: 'AMR-01', source: 'test' } }));
  for (let i = 0; i < 40 && sender.bufferedAmount > 0; i++) await new Promise(r => setTimeout(r, 50));
  await new Promise(r => setTimeout(r, 200));
  slow._socket.resume();
  await new Promise(r => setTimeout(r, 1500));

  const stopIdx = received.findIndex(m => m.type === 'E_STOP');
  assert.ok(stopIdx >= 0, 'the slow client received E_STOP');
  const updates = received.filter(m => m.type === 'ROBOT_UPDATE');
  const updatesAfterStop = received.slice(stopIdx + 1).filter(m => m.type === 'ROBOT_UPDATE');
  t.diagnostic(`flood ${FLOOD} updates (${(FLOOD * blob.length / 1e6).toFixed(1)} MB): slow client got ${updates.length}, ` +
    `E_STOP after ${received[stopIdx].bytesBefore} bytes, ${updatesAfterStop.length} update(s) after it`);
  assert.ok(updatesAfterStop.length >= 1, 'E_STOP arrived ahead of updates that were queued before it');
  assert.ok(updates.length < FLOOD / 4, `stale updates were coalesced (got ${updates.length})`);
  assert.strictEqual(updates.at(-1).n, FLOOD, 'the newest update is still delivered');
});
