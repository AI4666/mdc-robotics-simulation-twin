// Tests for the shared planner in shared/astar.js.
const test = require('node:test');
const assert = require('node:assert');
const { AStarPlanner } = require('../shared/astar.js');
const { LAB_BOUNDS, CLASSROOM_OBSTACLES } = require('../shared/lab_map.js');
// 120 varied queries (two bound sets, random keep-out boxes), recorded with the browser planner
// before the merge. Used here as a query set; the expected routes changed with the 0.1 m grid.
const fixture = require('./fixtures/astar_browser_paths.json');

const { bodySize } = require('../shared/robots.js');
const AMR_HALF_WIDTH_M = bodySize('amr').halfWidth; // wheel edge, on a scan of default size
const HOUSE_BOUNDS = { minX: -8.5, maxX: 8.5, minZ: -7.5, maxZ: 7.5 };

// The largest margin at which a point is still clear: its distance to the nearest wall or box.
function clearance(planner, x, z, obstacles) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const m = (lo + hi) / 2;
    if (planner.isBlocked(x, z, obstacles, m)) hi = m; else lo = m;
  }
  return lo;
}

test('the safety margin covers half an AMR\'s width', () => {
  const planner = new AStarPlanner();
  assert.strictEqual(planner.resolution, 0.1);
  assert.strictEqual(planner.safetyMargin, 0.25);
  assert.ok(planner.safetyMargin > AMR_HALF_WIDTH_M);
});

test('the classroom\'s three real gaps (0.6, 0.8 and 0.7 m) are each passable', () => {
  const planner = new AStarPlanner({ bounds: LAB_BOUNDS });
  // Close two gaps, then ask for a south-to-north route, which must use the third.
  const plugs = {
    left: { minX: -2.8, maxX: -2.2, minZ: -0.2, maxZ: 0 },
    middle: { minX: -0.4, maxX: 0.4, minZ: -0.2, maxZ: 0 },
    right: { minX: 2.1, maxX: 2.8, minZ: -0.2, maxZ: 0 }
  };
  for (const [gap, x] of [['left', -2.5], ['middle', 0], ['right', 2.45]]) {
    const others = Object.entries(plugs).filter(([k]) => k !== gap).map(([, v]) => v);
    const r = planner.findPath({ x, z: -1.4 }, { x, z: 0.7 }, [...CLASSROOM_OBSTACLES, ...others]);
    assert.strictEqual(r.success, true, `${gap} gap`);
  }
});

test('every route keeps the safety margin from obstacles and walls', () => {
  const planner = new AStarPlanner();
  let routed = 0;
  for (const [i, c] of fixture.cases.entries()) {
    planner.setBounds(c.bounds);
    const obstacles = [...CLASSROOM_OBSTACLES, ...c.extraObstacles];
    const r = planner.findPath(c.start, c.goal, obstacles);
    const endsInsideMargin = [c.start, c.goal].filter(e => planner.isBlocked(e.x, e.z, obstacles));
    if (!r.success) {
      if (c.success) assert.ok(endsInsideMargin.length > 0, `case ${i}: the old planner routed it and both ends are clear`);
      continue;
    }
    routed++;
    for (let s = 1; s < r.waypoints.length; s++) {
      const a = r.waypoints[s - 1];
      const b = r.waypoints[s];
      const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.01);
      for (let k = 0; k <= n; k++) {
        const x = a.x + (b.x - a.x) * k / n;
        const z = a.z + (b.z - a.z) * k / n;
        // A start or goal already inside the margin has to be left (or reached) somehow.
        if (endsInsideMargin.some(e => Math.hypot(e.x - x, e.z - z) < 0.45)) continue;
        assert.ok(clearance(planner, x, z, obstacles) >= 0.25 - 1e-6, `case ${i}, segment ${s}: too close at (${x.toFixed(2)}, ${z.toFixed(2)})`);
      }
    }
  }
  assert.ok(routed >= 85, `only ${routed} of 120 routed`);
});

test('routes stay 0.25 m off the walls', () => {
  const planner = new AStarPlanner({ bounds: LAB_BOUNDS });
  const r = planner.findPath({ x: -2.3, z: 1.2 }, { x: -2.3, z: -1.3 }, CLASSROOM_OBSTACLES); // past the left-wall gap
  assert.strictEqual(r.success, true);
  for (const w of r.waypoints) assert.ok(w.x >= LAB_BOUNDS.minX + 0.25 - 1e-9, `waypoint x ${w.x}`);
});

test('house-sized searches stay fast', () => {
  const planner = new AStarPlanner({ bounds: HOUSE_BOUNDS });
  const maze = [...CLASSROOM_OBSTACLES, { minX: -6, maxX: 8.5, minZ: -2.6, maxZ: -2.4 }, { minX: -8.5, maxX: 6, minZ: 2.4, maxZ: 2.6 }];
  const t0 = performance.now();
  const r = planner.findPath({ x: -8, z: -7 }, { x: 8, z: 7 }, maze);
  const ms = performance.now() - t0;
  assert.strictEqual(r.success, true);
  assert.ok(ms < 100, `worst-case house search took ${ms.toFixed(1)} ms`);
});

test('a straight route: length in meters and model steps, no turns, detour ratio 1', () => {
  const planner = new AStarPlanner({ bounds: LAB_BOUNDS });
  const r = planner.findPath({ x: -2.3, z: -1.3 }, { x: 2.2, z: -1.3 }, CLASSROOM_OBSTACLES);
  assert.strictEqual(r.success, true);
  assert.deepStrictEqual(r.waypoints, [{ x: -2.3, y: 0.05, z: -1.3 }, { x: 2.2, y: 0.05, z: -1.3 }]);
  assert.deepStrictEqual(
    { len: r.astar_path_len, m: r.path_length_m, turns: r.num_turns, detour: r.detour_ratio, manhattan: r.manhattan_dist },
    { len: 12.86, m: 4.5, turns: 0, detour: 1, manhattan: 12.86 });
  assert.ok(r.nodeExpansions > 0);
  assert.deepStrictEqual(r.path[0], planner.worldToGrid(-2.3, -1.3));
});

test('a route around a wall: turns, detour ratio and length agree with its waypoints', () => {
  const planner = new AStarPlanner({ bounds: { minX: -5, maxX: 5, minZ: -5, maxZ: 5 } });
  const wall = [{ minX: -0.2, maxX: 0.2, minZ: -4, maxZ: 3 }];
  const r = planner.findPath({ x: -3, z: 0 }, { x: 3, z: 0 }, wall);
  assert.strictEqual(r.success, true);
  let length = 0;
  for (let i = 1; i < r.waypoints.length; i++) length += Math.hypot(r.waypoints[i].x - r.waypoints[i - 1].x, r.waypoints[i].z - r.waypoints[i - 1].z);
  assert.ok(Math.abs(r.path_length_m - length) < 0.001);
  assert.ok(Math.abs(r.astar_path_len - length / 0.35) < 0.01, 'path length is in 0.35 m model steps');
  assert.ok(r.num_turns >= 1 && r.num_turns <= r.waypoints.length - 2, `turns ${r.num_turns}`);
  assert.ok(r.detour_ratio > 1.1, `detour ${r.detour_ratio}`);
});

test('no route: the goal as the only waypoint and zero metrics', () => {
  const planner = new AStarPlanner({ bounds: { minX: -2, maxX: 2, minZ: -2, maxZ: 2 } });
  const wall = [{ minX: -0.1, maxX: 0.1, minZ: -3, maxZ: 3 }];
  const r = planner.findPath({ x: -1.5, z: 0 }, { x: 1.5, z: 0 }, wall);
  assert.strictEqual(r.success, false);
  assert.deepStrictEqual(r.waypoints, [{ x: 1.5, z: 0 }]);
  assert.deepStrictEqual([r.astar_path_len, r.path_length_m, r.num_turns, r.detour_ratio, r.path.length], [0, 0, 0, 0, 0]);
  assert.ok(r.manhattan_dist > 0);
});

// Distance from (x, z) to a box, rotation included (the browser's collision geometry).
function boxDistance(ob, x, z) {
  const cx = (ob.minX + ob.maxX) / 2, cz = (ob.minZ + ob.maxZ) / 2;
  const a = -(ob.rotY || 0) * Math.PI / 180, dx = x - cx, dz = z - cz;
  const lx = dx * Math.cos(a) - dz * Math.sin(a), lz = dx * Math.sin(a) + dz * Math.cos(a);
  const ox = Math.abs(lx) - (ob.maxX - ob.minX) / 2, oz = Math.abs(lz) - (ob.maxZ - ob.minZ) / 2;
  return (ox <= 0 && oz <= 0) ? Math.max(ox, oz) : Math.hypot(Math.max(ox, 0), Math.max(oz, 0));
}

test('rotated boxes are planned around by their real (rotated) shape', () => {
  const planner = new AStarPlanner({ bounds: LAB_BOUNDS });
  // A 1.2 x 0.3 m zone along the south wall, rotated 30 degrees: its corners reach 0.28 m further
  // north than the unrotated box, past the 0.25 m margin.
  const zone = { minX: -0.6, maxX: 0.6, minZ: -1.7, maxZ: -1.4, rotY: 30 };
  const corner = { x: 0.44, z: -1.14 }; // inside the rotated box's north corner, outside the unrotated box's margin
  assert.ok(boxDistance(zone, corner.x, corner.z) < 0);
  assert.strictEqual(planner.isBlocked(corner.x, corner.z, [zone]), true, 'inside the rotated box');
  assert.strictEqual(planner.isBlocked(corner.x, corner.z, [{ ...zone, rotY: 0 }]), false, 'clear of the unrotated one');
  assert.strictEqual(planner.isLineOfSightClear({ x: -2.3, z: -1.0 }, { x: 2.2, z: -1.0 }, [zone]), false, 'a straight line past the rotated corner');

  // Every route around it keeps the margin from the rotated box itself.
  const obstacles = [...CLASSROOM_OBSTACLES, zone];
  const r = planner.findPath({ x: -2.3, z: -1.3 }, { x: 2.2, z: -1.3 }, obstacles);
  assert.strictEqual(r.success, true);
  for (let s = 1; s < r.waypoints.length; s++) {
    const a = r.waypoints[s - 1], b = r.waypoints[s];
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.01);
    for (let k = 0; k <= n; k++) {
      const x = a.x + (b.x - a.x) * k / n, z = a.z + (b.z - a.z) * k / n;
      if (Math.hypot(x + 2.3, z + 1.3) < 0.45 || Math.hypot(x - 2.2, z + 1.3) < 0.45) continue;
      assert.ok(boxDistance(zone, x, z) >= 0.25 - 1e-6, `too close to the rotated zone at (${x.toFixed(2)}, ${z.toFixed(2)})`);
    }
  }

  // Unrotated boxes are tested exactly as before.
  for (let x = -2.8; x <= 2.8; x += 0.07) {
    for (let z = -1.8; z <= 1.8; z += 0.07) {
      const old = CLASSROOM_OBSTACLES.some(ob => x >= ob.minX - 0.25 && x <= ob.maxX + 0.25 && z >= ob.minZ - 0.25 && z <= ob.maxZ + 0.25) ||
        x < -2.8 + 0.25 || x > 2.8 - 0.25 || z < -1.8 + 0.25 || z > 1.8 - 0.25;
      assert.strictEqual(planner.isBlocked(x, z, CLASSROOM_OBSTACLES), old);
    }
  }
});

test('nearest free point: a target inside a zone by a wall moves to where it can be reached', () => {
  const planner = new AStarPlanner({ bounds: LAB_BOUNDS });
  // The Testing Table station (2.2, -1.3) covered by a zone in the south-east corner. Pushing it
  // out along one axis used to land outside the room and be clamped back into the zone.
  const zone = { minX: 1.9, maxX: 2.5, minZ: -1.6, maxZ: -1.0 };
  const obstacles = [...CLASSROOM_OBSTACLES, zone];
  const p = planner.nearestFreePoint(2.2, -1.3, obstacles);
  assert.ok(p, 'found');
  assert.strictEqual(planner.isBlocked(p.x, p.z, obstacles), false, 'clear by the margin');
  assert.ok(boxDistance(zone, p.x, p.z) >= 0.25 - 1e-6);
  assert.ok(Math.hypot(p.x - 2.2, p.z + 1.3) < 0.8, `near the station (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
  assert.strictEqual(planner.findPath({ x: -2.3, z: -1.3 }, p, obstacles).success, true, 'and routable');
  // A clear point is its own nearest free point.
  assert.deepStrictEqual(planner.nearestFreePoint(0, -1.3, obstacles), { x: 0, y: 0.05, z: -1.3 });
  // Nothing free nearby: null.
  assert.strictEqual(planner.nearestFreePoint(0, 0, [{ minX: -2.8, maxX: 2.8, minZ: -1.8, maxZ: 1.8 }], 1), null);
});

test('a start inside a zone\'s margin is routed out; a start inside the zone itself is not', () => {
  const planner = new AStarPlanner({ bounds: LAB_BOUNDS });
  const zone = { minX: -2.7, maxX: -1.9, minZ: -1.7, maxZ: -0.9 };
  const obstacles = [...CLASSROOM_OBSTACLES, zone];
  const goal = { x: 2.2, z: -1.3 };
  // 5 cm east of the zone: deep in its margin (more than one cell), as a robot pushed out of a
  // zone drawn on top of it ends up.
  const start = { x: -1.85, z: -1.3 };
  const r = planner.findPath(start, goal, obstacles);
  assert.strictEqual(r.success, true);
  assert.deepStrictEqual([r.waypoints[0].x, r.waypoints[0].z], [start.x, start.z], 'the route starts at the robot');
  assert.strictEqual(planner.findPath({ x: -2.3, z: -1.3 }, goal, obstacles).success, false, 'inside the zone: no route');
});
