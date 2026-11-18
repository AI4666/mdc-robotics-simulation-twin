// separation.js — robot body footprints and the gap between two robots' bodies. Used by the
// browser simulation (robot-to-robot yielding in app.js) and by tests.
//
// Footprints, in app units, from each robot's real size (shared/robots.js) and its scan's meters
// per app unit:
//   AMR    oriented rectangle: half its width, half its length plus the headlights, its height
//   G1     circle around its standing width and depth, its height
//   drone  circle of its rotor reach, from below to above its center
// A robot is { type, x, y, z, heading, metersPerUnit? }; heading 0 faces +z, and the robot moves
// along (sin heading, cos heading). Without metersPerUnit, a scan nobody has measured.

import { bodySize, DEFAULT_METERS_PER_UNIT } from './robots.js';

export function footprint(robot) {
  const b = bodySize(robot.type, robot.metersPerUnit);
  if (robot.type === 'amr') return { kind: 'rect', halfWidth: b.halfWidth, halfLength: b.halfLength, bottom: 0, top: b.height };
  if (robot.type === 'drone') return { kind: 'circle', radius: b.radius, bottom: robot.y - b.below, top: robot.y + b.above };
  return { kind: 'circle', radius: b.radius, bottom: 0, top: b.height };
}

// Corners of an AMR rectangle in world x/z.
function corners(r, f) {
  const fx = Math.sin(r.heading), fz = Math.cos(r.heading); // forward
  const rx = Math.cos(r.heading), rz = -Math.sin(r.heading); // right
  return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([l, w]) => ({
    x: r.x + fx * f.halfLength * l + rx * f.halfWidth * w,
    z: r.z + fz * f.halfLength * l + rz * f.halfWidth * w
  }));
}

// Signed distance from point p to the rectangle (negative inside).
function pointToRect(p, r, f) {
  const dx = p.x - r.x, dz = p.z - r.z;
  const along = dx * Math.sin(r.heading) + dz * Math.cos(r.heading);
  const across = dx * Math.cos(r.heading) - dz * Math.sin(r.heading);
  const ox = Math.abs(across) - f.halfWidth;
  const oz = Math.abs(along) - f.halfLength;
  if (ox <= 0 && oz <= 0) return Math.max(ox, oz);
  return Math.hypot(Math.max(ox, 0), Math.max(oz, 0));
}

function pointToSegment(p, a, b) {
  const vx = b.x - a.x, vz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / (vx * vx + vz * vz)));
  return Math.hypot(p.x - (a.x + vx * t), p.z - (a.z + vz * t));
}

// Two rectangles: penetration depth (negative) if they overlap, else the shortest distance.
function rectToRect(a, fa, b, fb) {
  const ca = corners(a, fa), cb = corners(b, fb);
  let minOverlap = Infinity;
  for (const poly of [ca, cb]) {
    for (let i = 0; i < 4; i++) {
      const p = poly[i], q = poly[(i + 1) % 4];
      const nx = -(q.z - p.z), nz = q.x - p.x;
      const len = Math.hypot(nx, nz);
      const proj = c => (c.x * nx + c.z * nz) / len;
      const pa = ca.map(proj), pb = cb.map(proj);
      const overlap = Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb));
      if (overlap <= 0) {
        let d = Infinity;
        for (let j = 0; j < 4; j++) {
          d = Math.min(d, pointToSegment(ca[j], cb[j], cb[(j + 1) % 4]), pointToSegment(cb[j], ca[j], ca[(j + 1) % 4]));
          for (let k = 0; k < 4; k++) d = Math.min(d, pointToSegment(ca[j], cb[k], cb[(k + 1) % 4]), pointToSegment(cb[j], ca[k], ca[(k + 1) % 4]));
        }
        return d;
      }
      minOverlap = Math.min(minOverlap, overlap);
    }
  }
  return -minOverlap;
}

// Horizontal gap between two footprints (negative = overlapping).
export function horizontalGap(a, b) {
  const fa = footprint(a), fb = footprint(b);
  if (fa.kind === 'circle' && fb.kind === 'circle') return Math.hypot(a.x - b.x, a.z - b.z) - fa.radius - fb.radius;
  if (fa.kind === 'rect' && fb.kind === 'rect') return rectToRect(a, fa, b, fb);
  const [rect, fr, circle, fc] = fa.kind === 'rect' ? [a, fa, b, fb] : [b, fb, a, fa];
  return pointToRect(circle, rect, fr) - fc.radius;
}

// Gap between two bodies. Bodies whose height ranges don't overlap (a drone flying over a ground
// robot) can't touch: the gap is then the larger of the horizontal and vertical gaps.
export function bodyGap(a, b) {
  const fa = footprint(a), fb = footprint(b);
  const h = horizontalGap(a, b);
  const v = Math.max(fa.bottom - fb.top, fb.bottom - fa.top);
  return v > 0 ? Math.max(h, v) : h;
}

// ---------------------------------------------------------------------------------------------
// Robot-to-robot yielding (used by the browser simulation for AMRs and the G1).
//
// A robot only reacts to robots in its lane: in front of it and close to its line of travel.
// Its forward speed falls linearly from full at a body gap of SLOW_GAP to zero at its stop gap:
// MIN_GAP normally, YIELD_GAP when the robot in its lane has the higher priority (so it stops
// early and leaves room). A robot held below HELD_FACTOR breaks the deadlock after waiting
// (see deadlockWait): the lower-priority one after DEADLOCK_S, the higher-priority one after twice
// that. While it gives way (for GIVE_WAY_S), it keeps only MIN_GAP from that robot, so the yield
// gap doesn't stop its own escape. With no way around, it retraces its own recent path (up to
// TRAIL_M) until it is out of the other robot's lane, for at most RETREAT_MAX_S; with no path to
// retrace, it backs straight away from the other robot for at most DEADLOCK_S.
export const SEPARATION = Object.freeze({
  MIN_GAP: 0.15, // m between bodies: nobody drives closer than this to a robot in its lane
  YIELD_GAP: 0.6, // m: a lower-priority robot stops this far from a higher-priority one
  SLOW_GAP: 0.8, // m: slowing starts at this body gap
  HELD_FACTOR: 0.2, // below this speed factor a robot counts as held by the robot ahead
  DEADLOCK_S: 2.0, // s held by the same robot before the deadlock breaker acts
  GIVE_WAY_S: 6.0, // s a robot giving way keeps only MIN_GAP from the robot it gives way to
  TRAIL_M: 6.0, // m of its own recent path a robot remembers, to retrace when there is no way around
  RETREAT_MAX_S: 15.0, // s of retracing at most
  RETREAT_SPEED: 0.3 // m/s
});

// Fixed tie-break order: earlier in the list has the right of way.
export const FLEET_ORDER = Object.freeze(['AMR-01', 'AMR-02', 'AMR-03', 'AMR-04', 'AMR-05', 'AMR-06', 'HUM-01']);

// Scale separation gaps into the active scan's app units when metersPerUnit is larger than default
// (e.g. Campus scans at 18 m/unit where robot bodies are 10x smaller in app units).
function gapScale(robot) {
  const mpu = robot && robot.metersPerUnit;
  if (!Number.isFinite(mpu) || mpu <= DEFAULT_METERS_PER_UNIT) return 1;
  return Math.max(0.28, DEFAULT_METERS_PER_UNIT / mpu);
}

// Higher wins. Pedestrians have absolute right-of-way (5000); manually driven robots never yield (1000);
// a dispatched mission beats a route or patrol (100); otherwise fleet order decides.
export function priority(robot) {
  if (robot.type === 'pedestrian') return 5000;
  const rank = FLEET_ORDER.indexOf(robot.id);
  return (robot.manual ? 1000 : 0) + (robot.onMission ? 100 : 0) + (rank < 0 ? 0 : FLEET_ORDER.length - rank);
}

// Radius of a circle around the footprint (used for the lane width).
function reach(robot) {
  const f = footprint(robot);
  return f.kind === 'rect' ? Math.hypot(f.halfWidth, f.halfLength) : f.radius;
}

// Whether `other` is in front of `me` and close enough to my line of travel to be in my way.
export function inLane(me, other) {
  const fx = Math.sin(me.heading), fz = Math.cos(me.heading);
  const dx = other.x - me.x, dz = other.z - me.z;
  const ahead = dx * fx + dz * fz;
  if (ahead <= 0) return false;
  const sideways = Math.abs(dx * fz - dz * fx);
  const myHalfWidth = footprint(me).kind === 'rect' ? footprint(me).halfWidth : footprint(me).radius;
  const scale = gapScale(me);
  return sideways <= myHalfWidth + reach(other) + SEPARATION.MIN_GAP * scale;
}

// Forward speed factor (0 to 1) for `me`, given the other robots, and the robot that limits it.
// Robots are bodies (see footprint) plus { id, manual?, onMission?, givingWayTo? }.
export function speedFactor(me, others) {
  let factor = 1;
  let holder = null;
  const mine = footprint(me);
  const scale = gapScale(me);
  const slowGap = SEPARATION.SLOW_GAP * scale;
  const yieldGap = SEPARATION.YIELD_GAP * scale;
  const minGap = SEPARATION.MIN_GAP * scale;
  for (const other of others) {
    if (other.id === me.id || !inLane(me, other)) continue;
    const theirs = footprint(other);
    if (theirs.bottom >= mine.top || mine.bottom >= theirs.top) continue; // at different heights: can't touch
    const gap = horizontalGap(me, other);
    if (gap >= slowGap) continue;
    const yields = other.type !== 'drone' && priority(other) > priority(me) && me.givingWayTo !== other.id;
    const stopGap = yields ? yieldGap : minGap;
    const f = Math.max(0, Math.min(1, (gap - stopGap) / (slowGap - stopGap)));
    if (f < factor) {
      factor = f;
      holder = other;
    }
  }
  return { factor, holder };
}

// How long `me` waits, held by `holder`, before it acts (re-plans around the robots near it, or
// backs away). The lower-priority robot of a pair gets the first chance (DEADLOCK_S); so does any
// robot held by a parked one. The higher-priority robot acts only if it is still held after twice
// as long, for example when the other robot is caught between two robots and can't clear the way.
// A robot never acts against one that is backing away to make room for it: it just follows.
export function deadlockWait(me, holder) {
  if (holder.retreatingFrom === me.id) return Infinity;
  if (holder.type === 'drone') return SEPARATION.DEADLOCK_S;
  if (priority(holder) > priority(me)) return SEPARATION.DEADLOCK_S;
  if (holder.parked && holder.heldBy !== me.id) return SEPARATION.DEADLOCK_S;
  return 2 * SEPARATION.DEADLOCK_S;
}
