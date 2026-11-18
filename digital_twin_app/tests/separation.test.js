// Tests for robot body gaps and the yielding rule in shared/separation.js.
const test = require('node:test');
const assert = require('node:assert');
const { bodyGap, horizontalGap, speedFactor, deadlockWait, priority, SEPARATION } = require('../shared/separation.js');

// Heading 0 faces +z; Math.PI faces -z.
const amr = (id, x, z, heading = 0, extra = {}) => ({ id, type: 'amr', x, y: 0.05, z, heading, ...extra });
const g1 = (x, z, heading = 0, extra = {}) => ({ id: 'HUM-01', type: 'humanoid', x, y: 0.05, z, heading, ...extra });
const near = (a, b, tol = 1e-3) => Math.abs(a - b) <= tol;

// On a scan of default size (1 / 0.55 m per unit): the AMR 0.451 x 0.528 (with headlights), the G1
// a circle of radius 0.135 (its 0.45 x 0.20 m standing box) and 0.726 tall, the drone 0.121 deep
// below its center.
test('body gaps: AMR rectangles by orientation, the G1 as a circle, a drone overhead', () => {
  assert.ok(near(horizontalGap(amr('A', 0, 0), amr('B', 0.5, 0)), 0.5 - 0.451), 'side by side: 0.451 m wide');
  assert.ok(near(horizontalGap(amr('A', 0, 0), amr('B', 0, 0.5)), 0.5 - 0.528), 'nose to tail: 0.528 m long, overlapping');
  assert.ok(near(horizontalGap(amr('A', 0, 0, Math.PI / 2), amr('B', 0.5, 0)), 0.5 - 0.264 - 0.2255), 'one turned 90 degrees');
  assert.ok(near(horizontalGap(g1(0.5, 0), amr('A', 0, 0)), 0.5 - 0.2255 - 0.1354));
  const drone = { id: 'UAV-01', type: 'drone', x: 0, y: 1.9, z: 0, heading: 0 };
  assert.ok(near(bodyGap(drone, g1(0, 0)), 1.9 - 0.121 - 0.726), 'flying over the G1: vertical clearance');
  assert.ok(bodyGap({ ...drone, y: 0.25 }, amr('A', 0, 0)) < 0, 'landed on top of an AMR: overlap');
});

test('a robot behind another slows down and stops at the minimum gap; the one in front does not', () => {
  const front = amr('AMR-01', 0, 1.0); // facing +z, ahead of the other
  const behind = amr('AMR-02', 0, 0); // facing +z, 1.0 m behind: body gap 0.472
  assert.strictEqual(speedFactor(front, [behind]).factor, 1, 'nothing in front of the leader');
  const f = speedFactor(behind, [front]);
  assert.strictEqual(f.holder.id, 'AMR-01');
  assert.ok(f.factor === 0, `follower has lower priority, so it stops at the yield gap (got ${f.factor})`);
  // Same situation with priorities reversed: the follower now only stops at the minimum gap.
  const leaderLow = amr('AMR-03', 0, 1.0);
  const followerHigh = amr('AMR-01', 0, 0);
  const f2 = speedFactor(followerHigh, [leaderLow]).factor;
  assert.ok(near(f2, (1.0 - 0.528 - SEPARATION.MIN_GAP) / (SEPARATION.SLOW_GAP - SEPARATION.MIN_GAP)), `slowing, not stopped (got ${f2})`);
  const touching = speedFactor(followerHigh, [{ ...leaderLow, z: 0.528 + SEPARATION.MIN_GAP }]).factor;
  assert.ok(near(touching, 0), 'stops at the minimum gap');
});

test('robots beside or behind are not in the lane and do not slow anyone', () => {
  const me = amr('AMR-01', 0, 0);
  assert.strictEqual(speedFactor(me, [amr('AMR-02', 1.2, 0.3)]).factor, 1, 'beside, outside the lane');
  assert.strictEqual(speedFactor(me, [amr('AMR-02', 0, -0.6)]).factor, 1, 'behind');
  assert.ok(speedFactor(me, [amr('AMR-02', 0.4, 0.7)]).factor < 1, 'ahead and partly in the lane');
});

test('head-on: the lower-priority robot stops early (yield gap); the other comes to the minimum gap', () => {
  const high = amr('AMR-01', 0, 0, 0); // facing +z
  const low = amr('AMR-02', 0, 0.528 + 0.62, Math.PI); // facing -z, toward it; body gap 0.62
  const fLow = speedFactor(low, [high]);
  const fHigh = speedFactor(high, [low]);
  assert.ok(fLow.factor < fHigh.factor, 'the lower-priority robot slows harder');
  // low: (0.62 - 0.6) / (0.8 - 0.6) = 0.1; high: (0.62 - 0.15) / (0.8 - 0.15) = 0.72
  assert.ok(near(fLow.factor, 0.1) && near(fHigh.factor, 0.47 / 0.65), `low ${fLow.factor}, high ${fHigh.factor}`);
  const closer = speedFactor(low, [{ ...high, z: 1.3 - 0.528 - SEPARATION.YIELD_GAP }]);
  assert.strictEqual(closer.factor, 0, 'lower-priority robot is stopped at the yield gap');
});

test('a robot giving way keeps only the minimum gap from that robot, so it can make its escape', () => {
  const high = amr('AMR-01', 0, 0, 0);
  const low = amr('AMR-02', 0, 0.528 + 0.4, Math.PI); // body gap 0.4: inside the yield gap
  assert.strictEqual(speedFactor(low, [high]).factor, 0, 'normally stopped');
  const escaping = speedFactor({ ...low, givingWayTo: 'AMR-01' }, [high]).factor;
  assert.ok(near(escaping, (0.4 - SEPARATION.MIN_GAP) / (SEPARATION.SLOW_GAP - SEPARATION.MIN_GAP)), `got ${escaping}`);
});

test('a drone flying overhead is ignored; a landed drone in the lane is an obstacle', () => {
  const me = g1(0, 0);
  const flying = { id: 'UAV-01', type: 'drone', x: 0, y: 1.9, z: 0.7, heading: 0 };
  assert.strictEqual(speedFactor(me, [flying]).factor, 1);
  const landed = { ...flying, y: 0.05, z: 1.0 };
  const f = speedFactor(me, [landed]);
  assert.ok(f.factor < 1 && f.holder.id === 'UAV-01');
});

test('priority: pedestrians first, then manual driving, then a dispatched mission, then fleet order', () => {
  assert.ok(priority({ id: 'PED-01', type: 'pedestrian' }) > priority({ id: 'AMR-03', manual: true }));
  assert.ok(priority({ id: 'AMR-01' }) > priority({ id: 'AMR-02' }));
  assert.ok(priority({ id: 'AMR-03' }) > priority({ id: 'HUM-01' }));
  assert.ok(priority({ id: 'HUM-01', onMission: true }) > priority({ id: 'AMR-01' }));
  assert.ok(priority({ id: 'AMR-03', manual: true }) > priority({ id: 'AMR-01', onMission: true }));
});

test('deadlock breaker: the lower-priority robot acts first, the other only if still held twice as long', () => {
  const high = amr('AMR-01', 0, 0, 0, { heldBy: 'AMR-02' });
  const low = amr('AMR-02', 0, 1, Math.PI, { heldBy: 'AMR-01' });
  assert.strictEqual(deadlockWait(low, high), SEPARATION.DEADLOCK_S, 'the lower-priority robot gives way first');
  assert.strictEqual(deadlockWait(high, low), 2 * SEPARATION.DEADLOCK_S, 'the higher-priority robot waits longer');
  const parked = amr('AMR-03', 0, 1, 0, { parked: true });
  assert.strictEqual(deadlockWait(high, parked), SEPARATION.DEADLOCK_S, 'a parked robot is gone around without the extra wait');
  assert.strictEqual(deadlockWait(high, { ...parked, heldBy: 'AMR-01' }), 2 * SEPARATION.DEADLOCK_S, 'unless it is stopped because it waits for us');
  assert.strictEqual(deadlockWait(high, { ...low, retreatingFrom: 'AMR-01' }), Infinity, 'never against a robot backing away to make room for us');
  assert.strictEqual(deadlockWait(high, { ...low, retreatingFrom: 'AMR-03' }), 2 * SEPARATION.DEADLOCK_S, 'backing away for another robot does not count');
});
