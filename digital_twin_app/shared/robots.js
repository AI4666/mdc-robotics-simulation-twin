// robots.js — each robot's real size, in meters, and its size in the app. Used by the browser
// (3D models, collisions, LiDAR, yielding, planning) and by the server (planner clearance).
//
// The app's units are the scan's own: a scan that is not at real size has its calibration's
// `metersPerUnit` (real meters per app unit, shared/scan_settings.js), and every robot is drawn and
// simulated at its real size divided by it. All robots on a scan use the same factor.

// Real sizes. Edit these when the real robots are measured.
export const ROBOT_SPECS = Object.freeze({
  // AMR-01, AMR-02, AMR-03. Placeholder: the size of the 3D model (wheel edge to wheel edge, nose
  // to tail, floor to the top of the cargo box).
  amr: Object.freeze({ width: 0.82, length: 0.90, height: 0.49 }),
  // HUM-01, Unitree G1 EDU+ standing (Unitree spec). Its degrees of freedom are not confirmed yet.
  humanoid: Object.freeze({ height: 1.32, width: 0.45, depth: 0.20 }),
  // UAV-01. Placeholder: the size of the 3D model (center to rotor tip, and the body's extent below
  // and above its center).
  drone: Object.freeze({ rotorReach: 0.61, below: 0.22, above: 0.13 })
});

// The 3D models (public/meshes.js) at scale 1, in the same terms.
const MODEL = Object.freeze({
  amr: { width: 0.82, length: 0.90, height: 0.49, wheelRadius: 0.12 },
  humanoid: { height: 1.323 },
  drone: { rotorReach: 0.61 }
});

// The AMR's headlights sit 3 cm past each end of its chassis, so its footprint reaches that far.
const AMR_LIGHT_REACH = 0.03;

// A scan whose size nobody has set: 1 / 0.55, the robot scale every scan had by default before
// sizes were real, so nothing changes until the scan is measured.
export const DEFAULT_METERS_PER_UNIT = 1 / 0.55;

// The planner keeps routes this far from boxes and walls, at least: wider ground robots get more,
// so their bodies clear what the route passes. Requests outside the limits are clamped.
export const CLEARANCE = Object.freeze({ MIN: 0.25, MAX: 1.0, EXTRA: 0.02 });

const validMpu = mpu => (Number.isFinite(mpu) && mpu > 0 ? mpu : DEFAULT_METERS_PER_UNIT);

// Scale of a robot type's 3D model as [x, y, z]. The AMR follows its real width, height and length
// separately; the G1 and the drone keep their proportions (the G1 by height, the drone by reach).
export function modelScale(type, metersPerUnit) {
  const m = validMpu(metersPerUnit);
  if (type === 'amr') {
    const a = ROBOT_SPECS.amr;
    return [a.width / MODEL.amr.width / m, a.height / MODEL.amr.height / m, a.length / MODEL.amr.length / m];
  }
  const s = type === 'drone'
    ? ROBOT_SPECS.drone.rotorReach / MODEL.drone.rotorReach / m
    : ROBOT_SPECS.humanoid.height / MODEL.humanoid.height / m;
  return [s, s, s];
}

// A robot type's body in app units.
//   amr       halfWidth, halfLength (to the headlights), height, wheelRadius
//   humanoid  radius (a circle around its standing width and depth), height
//   drone     radius (rotor tips), below and above its center
export function bodySize(type, metersPerUnit) {
  const m = validMpu(metersPerUnit);
  if (type === 'amr') {
    const a = ROBOT_SPECS.amr;
    return {
      halfWidth: a.width / 2 / m,
      halfLength: (a.length / 2 + AMR_LIGHT_REACH) / m,
      height: a.height / m,
      wheelRadius: MODEL.amr.wheelRadius * a.height / MODEL.amr.height / m
    };
  }
  if (type === 'drone') {
    const d = ROBOT_SPECS.drone;
    return { radius: d.rotorReach / m, below: d.below / m, above: d.above / m };
  }
  const h = ROBOT_SPECS.humanoid;
  return { radius: Math.hypot(h.width / 2, h.depth / 2) / m, height: h.height / m };
}

// How far the planner keeps routes from boxes and walls on a scan: room for the widest ground
// robot (the AMR's half-width, or the G1's radius) plus a little, and never less than the minimum.
export function plannerClearance(metersPerUnit) {
  const widest = Math.max(bodySize('amr', metersPerUnit).halfWidth, bodySize('humanoid', metersPerUnit).radius);
  return clampClearance(widest + CLEARANCE.EXTRA);
}

// A requested clearance, kept within the limits; anything else is the minimum.
export function clampClearance(value) {
  return Number.isFinite(value) ? Math.min(CLEARANCE.MAX, Math.max(CLEARANCE.MIN, value)) : CLEARANCE.MIN;
}
