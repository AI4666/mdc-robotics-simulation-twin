// zones.js — which keep-out boxes belong to which scan. Used by the browser (drawing, collisions,
// planning, yielding) and by the server (AI planner routes), so both see the same boxes.
//
// The classroom furniture exists only in the classroom scan. Each keep-out zone the user draws is
// tagged with the scan it was drawn on and only applies there.

import { CLASSROOM_OBSTACLES, CAMPUS_OBSTACLES, CAMPUS_OSM_OBSTACLES } from './lab_map.js';

export const CLASSROOM_SCAN = 'robotics_lab.glb';
export const CAMPUS_SCAN = 'mdc_north_campus.glb';
export const CAMPUS_OSM_SCAN = 'mdc_north_campus_osm.glb';

// Browser storage: all drawn zones, every scan, each with a `scan` field. The older key held one
// untagged list for all scans; it is read once to migrate, and never written or removed, so it
// stays as a backup.
export const ZONES_KEY = 'keepout_zones_by_scan';
export const LEGACY_ZONES_KEY = 'custom_keepout_zones';

// Zones saved before zones had a scan were drawn for the classroom, the default scan.
export const LEGACY_ZONE_SCAN = CLASSROOM_SCAN;

const clone = box => JSON.parse(JSON.stringify(box));

// The fixed furniture boxes of a scan as defined in code (copies, so they can be edited in place).
export function furnitureForScan(scan) {
  if (scan === CLASSROOM_SCAN) return CLASSROOM_OBSTACLES.map(clone);
  if (scan === CAMPUS_SCAN) return CAMPUS_OBSTACLES.map(clone);
  if (scan === CAMPUS_OSM_SCAN) return CAMPUS_OSM_OBSTACLES.map(clone);
  return [];
}

// The user's edits to a scan's furniture, saved per scan as only what differs from the defaults:
// { boxes: { id: { minX, maxX, minZ, maxZ, height, rotY } }, deleted: [id, ...] }. Defaults stay in
// code, so a default that was never edited follows later changes to it.
export const furnitureEditsKey = scan => `furniture_edits_${scan}`;
const EDIT_FIELDS = ['minX', 'maxX', 'minZ', 'maxZ', 'height', 'rotY'];
const NO_EDITS = () => ({ boxes: {}, deleted: [] });

// Saved edits from storage (the raw string, or null). Anything malformed is ignored.
export function parseFurnitureEdits(json) {
  let raw;
  try { raw = json ? JSON.parse(json) : null; } catch (e) { raw = null; }
  const edits = NO_EDITS();
  if (!raw || typeof raw !== 'object') return edits;
  if (raw.boxes && typeof raw.boxes === 'object') {
    for (const [id, box] of Object.entries(raw.boxes)) {
      if (!box || typeof box !== 'object') continue;
      const fields = {};
      for (const k of EDIT_FIELDS) if (Number.isFinite(box[k])) fields[k] = box[k];
      if (Object.keys(fields).length) edits.boxes[id] = fields;
    }
  }
  if (Array.isArray(raw.deleted)) edits.deleted = raw.deleted.filter(id => typeof id === 'string');
  return edits;
}

// The furniture with the edits applied: deleted boxes left out, edited ones moved/resized/rotated.
// Permanently solid campus structures (b.permanentSolid) cannot be deleted or warped by box edits.
export function applyFurnitureEdits(furniture, edits) {
  const e = edits || NO_EDITS();
  return furniture
    .filter(b => b.permanentSolid || !e.deleted.includes(b.id))
    .map(b => (!b.permanentSolid && e.boxes[b.id] ? { ...b, ...e.boxes[b.id] } : b));
}

// The edits that turn `defaults` into `current` (the furniture as it is now, matched by id).
export function furnitureEditsFrom(defaults, current) {
  const edits = NO_EDITS();
  const same = (a, b) => Math.abs((a ?? 0) - (b ?? 0)) < 1e-9;
  for (const d of defaults) {
    if (d.permanentSolid || d.isWalkwayNetwork) continue;
    const now = current.find(b => b.id === d.id);
    if (!now) { edits.deleted.push(d.id); continue; }
    if (EDIT_FIELDS.some(k => !same(now[k], d[k]))) {
      edits.boxes[d.id] = Object.fromEntries(EDIT_FIELDS.map(k => [k, now[k] ?? 0]));
    }
  }
  return edits;
}

export function hasFurnitureEdits(edits) {
  return !!edits && (edits.deleted.length > 0 || Object.keys(edits.boxes).length > 0);
}

// Zones from the legacy untagged list, tagged with the classroom scan. Anything that isn't a box
// is dropped.
export function migrateLegacyZones(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter(z => z && typeof z === 'object' && ['minX', 'maxX', 'minZ', 'maxZ'].every(k => Number.isFinite(z[k])))
    .map(z => ({ color: 0xef4444, height: 0.8, ...clone(z), userCreated: true, scan: typeof z.scan === 'string' ? z.scan : LEGACY_ZONE_SCAN }));
}

// A new zone's name: the lowest "User Zone #n" not used yet on its scan.
export function nextZoneName(namesOnScan) {
  let n = 1;
  while (namesOnScan.includes(`User Zone #${n}`)) n++;
  return `User Zone #${n}`;
}

// A new zone's id: the lowest "zone-n" not taken yet (ids are unique across all scans).
export function newZoneId(takenIds) {
  const taken = takenIds instanceof Set ? takenIds : new Set(takenIds);
  let n = 1;
  while (taken.has(`zone-${n}`)) n++;
  return `zone-${n}`;
}

const BOX_KEYS = ['minX', 'maxX', 'minZ', 'maxZ', 'height', 'rotY'];
const sameBox = (a, b) => a.scan === b.scan && BOX_KEYS.every(k => (a[k] ?? 0) === (b[k] ?? 0));

// Drops exact duplicates (same scan, same box), and gives every zone an id and a name of its own on
// its scan. `changed` says whether anything was fixed (so the caller saves the cleaned list).
export function cleanZones(zones) {
  const out = [];
  let changed = false;
  for (const z of zones) {
    if (out.some(o => sameBox(o, z))) { changed = true; continue; }
    out.push({ ...z });
  }
  const ids = new Set();
  const namesByScan = {};
  for (const z of out) {
    if (!z.id || ids.has(z.id)) { z.id = newZoneId(ids); changed = true; }
    ids.add(z.id);
    const names = namesByScan[z.scan] || (namesByScan[z.scan] = []);
    if (!z.name || names.includes(z.name)) { z.name = nextZoneName(names); changed = true; }
    names.push(z.name);
  }
  return { zones: out, changed };
}

// The stored zone list from the two storage values (the raw strings, or null): the new list if
// there is one, otherwise the migrated legacy list, cleaned (see cleanZones). The caller saves it
// under the new key when `migrated` (it came from the legacy list) or `cleaned` (it was fixed).
// The legacy list is only read when the new key is missing.
export function loadZones(storedJson, legacyJson) {
  const parse = s => { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } };
  const stored = parse(storedJson);
  const fromNew = Array.isArray(stored);
  const legacy = fromNew ? null : parse(legacyJson);
  const { zones, changed } = cleanZones(migrateLegacyZones(fromNew ? stored : legacy));
  return { zones, migrated: !fromNew && Array.isArray(legacy), cleaned: changed };
}

export function zonesForScan(zones, scan) {
  return zones.filter(z => z.scan === scan);
}

// The stored list with one scan's zones replaced by `scanZones` (the other scans' are kept).
export function replaceScanZones(zones, scan, scanZones) {
  return [...zones.filter(z => z.scan !== scan), ...scanZones.map(z => ({ ...clone(z), userCreated: true, scan }))];
}

// Everything robots keep out of on a scan: its furniture (with the user's edits to it), then its
// zones.
export function obstaclesForScan(scan, zones, furnitureEdits) {
  return [...applyFurnitureEdits(furnitureForScan(scan), furnitureEdits), ...zonesForScan(zones, scan).map(clone)];
}

// What a route planner plans around for a request: the scan's furniture plus the boxes the
// request adds (the user's zones on that scan). The furniture is the request's own list when it
// sends one (the browser's, as edited; empty when all of it was deleted), otherwise the scan's
// defaults. A request without a scan is a classroom request.
export function planningObstacles(scan, dynamicObstacles, furniture) {
  const extra = Array.isArray(dynamicObstacles) ? dynamicObstacles : [];
  const base = Array.isArray(furniture) ? furniture : furnitureForScan(scan || CLASSROOM_SCAN);
  return [...base, ...extra];
}
