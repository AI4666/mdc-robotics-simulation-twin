// scan_settings.js — browser settings kept per scan: the Scale & Align calibration and whether the
// AI planner draws its 3D A* ribbons. Each scan is a different physical space, so nothing here is
// shared between scans. Storage access is passed in (getItem), so this can be tested in Node.

import { CLASSROOM_SCAN } from './zones.js';
import { DEFAULT_METERS_PER_UNIT } from './robots.js';

// Calibration of a scan nobody has calibrated yet.
export const CALIBRATION_DEFAULTS = Object.freeze({
  // Real meters per app unit, which sizes every robot on the scan (shared/robots.js).
  metersPerUnit: DEFAULT_METERS_PER_UNIT,
  meshScale: 1.0,
  meshRotY: 0.0,
  meshOffsetX: 0.0,
  meshOffsetY: 0.0,
  meshOffsetZ: 0.0,
  boundWidth: 5.6,
  boundDepth: 3.6
});

// The one calibration saved before calibration was per scan. It is read once, for the classroom
// (the default scan), and never written or removed, so it stays as a backup.
export const LEGACY_CALIBRATION_KEY = 'lab_calibration';
export const calibrationKey = scan => `lab_calibration_${scan}`;

// Meters per app unit a scan may have (the Scan Scale slider and the measuring tool).
export const METERS_PER_UNIT_RANGE = Object.freeze({ MIN: 0.5, MAX: 5.0 });
const inRange = v => Number.isFinite(v) && v >= METERS_PER_UNIT_RANGE.MIN && v <= METERS_PER_UNIT_RANGE.MAX;

// A scan's calibration: its own saved one, else (classroom only) the legacy one, else the
// defaults. Unknown or non-numeric saved values are ignored, and so is meters per unit outside its
// range. `source` says where it came from.
// A calibration saved before robots had real sizes holds a robot scale instead of meters per unit:
// robot scale s drew the AMR (whose real size is its model's) s times its size, which is 1 / s
// meters per unit, so the AMRs stay exactly as they were.
export function loadCalibration(scan, getItem) {
  const parse = s => { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } };
  let saved = parse(getItem(calibrationKey(scan)));
  let source = saved ? 'scan' : 'defaults';
  if (!saved && scan === CLASSROOM_SCAN) {
    saved = parse(getItem(LEGACY_CALIBRATION_KEY));
    if (saved) source = 'legacy';
  }
  const calibration = { ...CALIBRATION_DEFAULTS };
  if (saved && typeof saved === 'object') {
    for (const k of Object.keys(CALIBRATION_DEFAULTS)) {
      if (Number.isFinite(saved[k])) calibration[k] = saved[k];
    }
    if (!inRange(saved.metersPerUnit)) {
      calibration.metersPerUnit = inRange(1 / saved.robotScale) ? 1 / saved.robotScale : DEFAULT_METERS_PER_UNIT;
    }
  }
  return { calibration, source };
}

// Measuring a scan: two points on it (app units, x/y/z) and the real distance between them, in
// meters, give its meters per app unit. `ok` is false, with the reason, when the points are too
// close to measure, the distance is not a positive number, or the result is out of range.
export const MIN_MEASURE_UNITS = 0.05;
export function measureMetersPerUnit(a, b, realMeters) {
  const units = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  if (!(units >= MIN_MEASURE_UNITS)) return { ok: false, units, reason: 'The points are too close together.' };
  if (!(Number.isFinite(realMeters) && realMeters > 0)) return { ok: false, units, reason: 'Enter the real distance in meters.' };
  const metersPerUnit = realMeters / units;
  if (!inRange(metersPerUnit)) {
    return { ok: false, units, metersPerUnit, reason: `1 unit = ${metersPerUnit.toFixed(2)} m is outside ${METERS_PER_UNIT_RANGE.MIN}-${METERS_PER_UNIT_RANGE.MAX} m.` };
  }
  return { ok: true, units, metersPerUnit };
}

// The calibration to store for a scan after measuring it: what is stored for it now (or what it
// loads as), with only meters per unit changed. Other Scale & Align changes not saved yet stay
// unsaved.
export function withMetersPerUnit(scan, metersPerUnit, getItem) {
  return { ...loadCalibration(scan, getItem).calibration, metersPerUnit };
}

// Whether the planner's 3D A* ribbons are shown on a scan (on unless turned off there).
export const ribbonsKey = scan => `astar_ribbons_${scan}`;
export function ribbonsVisible(scan, getItem) {
  return getItem(ribbonsKey(scan)) !== 'off';
}
