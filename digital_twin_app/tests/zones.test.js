// Tests for per-scan keep-out zones (shared/zones.js) and for the AI planner planning each scan
// around that scan's own furniture and zones only.
const test = require('node:test');
const assert = require('node:assert');
const { startServer } = require('./server_harness');
const {
  CLASSROOM_SCAN, CAMPUS_SCAN, CAMPUS_OSM_SCAN, LEGACY_ZONE_SCAN, loadZones, migrateLegacyZones, replaceScanZones, zonesForScan,
  obstaclesForScan, furnitureForScan, planningObstacles, cleanZones, nextZoneName, newZoneId
} = require('../shared/zones.js');
const { CLASSROOM_OBSTACLES, CAMPUS_OBSTACLES, CAMPUS_OSM_OBSTACLES } = require('../shared/lab_map.js');

const PORT = 3230;
const HOUSE = 'scan_house.glb';
const zone = (name, minX, maxX, minZ, maxZ, scan) => ({ name, minX, maxX, minZ, maxZ, height: 0.8, ...(scan ? { scan } : {}) });

test('zones saved before this change are moved to the classroom; the old list is only read', () => {
  const legacy = JSON.stringify([zone('Custom Zone 1', 0, 1, 0, 1), zone('Custom Zone 2', -1, 0, -1, 0)]);
  const { zones, migrated } = loadZones(null, legacy);
  assert.strictEqual(migrated, true);
  assert.strictEqual(LEGACY_ZONE_SCAN, CLASSROOM_SCAN);
  assert.deepStrictEqual(zones.map(z => [z.name, z.scan, z.userCreated]), [['Custom Zone 1', CLASSROOM_SCAN, true], ['Custom Zone 2', CLASSROOM_SCAN, true]]);

  // Once the new list exists it wins, even if the old one is still there (it is the backup).
  const stored = JSON.stringify([zone('House Zone', 2, 3, 2, 3, HOUSE)]);
  const again = loadZones(stored, legacy);
  assert.strictEqual(again.migrated, false);
  assert.deepStrictEqual(again.zones.map(z => [z.name, z.scan]), [['House Zone', HOUSE]]);

  assert.deepStrictEqual(loadZones(null, null), { zones: [], migrated: false, cleaned: false });
  assert.deepStrictEqual(loadZones('not json', '{"also":"not a list"}'), { zones: [], migrated: false, cleaned: false });
  // Cleared: with both keys gone nothing comes back, and an empty new list never re-imports the
  // old one.
  assert.deepStrictEqual(loadZones('[]', legacy).zones, [], 'an empty new list wins over the old list');
  assert.deepStrictEqual(migrateLegacyZones([null, { name: 'no coordinates' }, zone('ok', 0, 1, 0, 1)]).map(z => z.name), ['ok']);
  const bare = migrateLegacyZones([{ name: 'bare', minX: 0, maxX: 1, minZ: 0, maxZ: 1 }])[0];
  assert.ok(Number.isFinite(bare.color) && Number.isFinite(bare.height), 'a zone missing its color or height gets the defaults the zone tool uses');
});

test('each scan sees only its own zones, and only the classroom has the furniture', () => {
  const all = [zone('Classroom Zone', 0, 1, 0, 1, CLASSROOM_SCAN), zone('House Zone', 2, 3, 2, 3, HOUSE)];
  assert.deepStrictEqual(zonesForScan(all, HOUSE).map(z => z.name), ['House Zone']);

  const classroom = obstaclesForScan(CLASSROOM_SCAN, all).map(b => b.name);
  assert.deepStrictEqual(classroom, [...CLASSROOM_OBSTACLES.map(b => b.name), 'Classroom Zone']);
  assert.deepStrictEqual(obstaclesForScan(HOUSE, all).map(b => b.name), ['House Zone']);
  assert.deepStrictEqual(obstaclesForScan('scan_secondary.glb', all), []);
  assert.deepStrictEqual(furnitureForScan(HOUSE), []);
  assert.deepStrictEqual(furnitureForScan(CAMPUS_SCAN).map(b => b.id), CAMPUS_OBSTACLES.map(b => b.id));
  assert.deepStrictEqual(furnitureForScan(CAMPUS_OSM_SCAN).map(b => b.id), CAMPUS_OSM_OBSTACLES.map(b => b.id));

  // Editing the boxes of the active scan never changes the stored list or the furniture.
  const boxes = obstaclesForScan(CLASSROOM_SCAN, all);
  boxes[0].minX = 99;
  boxes[boxes.length - 1].minX = 99;
  assert.notStrictEqual(CLASSROOM_OBSTACLES[0].minX, 99);
  assert.strictEqual(all[0].minX, 0);
});

test('saving one scan\'s zones keeps the other scans\' zones', () => {
  const all = [zone('Classroom Zone', 0, 1, 0, 1, CLASSROOM_SCAN), zone('House Zone', 2, 3, 2, 3, HOUSE)];
  const saved = replaceScanZones(all, HOUSE, [zone('House Zone', 2.5, 3.5, 2, 3), zone('House Zone 2', -3, -2, -3, -2)]);
  assert.deepStrictEqual(saved.map(z => [z.name, z.scan, z.minX]),
    [['Classroom Zone', CLASSROOM_SCAN, 0], ['House Zone', HOUSE, 2.5], ['House Zone 2', HOUSE, -3]]);
  assert.deepStrictEqual(replaceScanZones(all, CLASSROOM_SCAN, []).map(z => z.name), ['House Zone'], 'clearing one scan');
});

test('planner obstacles: the request\'s scan furniture plus its zones (no scan: the classroom)', () => {
  const extra = [zone('Zone', 0, 1, 0, 1)];
  assert.strictEqual(planningObstacles(undefined, undefined).length, CLASSROOM_OBSTACLES.length);
  assert.strictEqual(planningObstacles(CLASSROOM_SCAN, extra).length, CLASSROOM_OBSTACLES.length + 1);
  assert.deepStrictEqual(planningObstacles(HOUSE, extra).map(b => b.name), ['Zone']);
  assert.deepStrictEqual(planningObstacles(HOUSE, undefined), []);
});

// Whether a route's polyline passes through the inside of a box.
function crosses(route, box) {
  const pts = route.waypoints;
  for (let i = 1; i < pts.length; i++) {
    const n = Math.ceil(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z) / 0.02);
    for (let k = 0; k <= n; k++) {
      const x = pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k / n;
      const z = pts[i - 1].z + (pts[i].z - pts[i - 1].z) * k / n;
      if (x > box.minX && x < box.maxX && z > box.minZ && z < box.maxZ) return true;
    }
  }
  return false;
}

test('the AI planner plans each scan around that scan\'s own furniture and zones only', async t => {
  const server = await startServer(PORT);
  t.after(() => server.stop());
  const schedule = async body => (await fetch(`${server.url}/api/schedule/jobs`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bounds: { minX: -2.8, maxX: 2.8, minZ: -1.8, maxZ: 1.8 }, ...body })
  })).json();
  const eta = (res, id) => res.masterSchedule.find(j => j.job_id === id).ml_prediction.predicted_delivery_time_min;

  // A zone drawn on the classroom across the south corridor (JOB-101 drives straight along it),
  // and one drawn on the house in the middle of the floor (JOB-103 crosses it diagonally there).
  const classroomZone = zone('Classroom Zone', -0.2, 0.2, -1.8, -0.9);
  const houseZone = zone('House Zone', -0.3, 0.3, -0.3, 0.3);
  // As the browser sends them: the scan, and the zones drawn on it.
  const classroom = await schedule({ scan: CLASSROOM_SCAN, dynamicObstacles: [classroomZone] });
  const house = await schedule({ scan: HOUSE, dynamicObstacles: [houseZone] });
  const houseEmpty = await schedule({ scan: HOUSE });
  const ids = Object.keys(classroom.jobRoutes);
  assert.ok(ids.length >= 5);

  for (const id of ids) {
    const c = classroom.jobRoutes[id], h = house.jobRoutes[id];
    assert.ok(c.success && h.success, id);
    assert.ok(!crosses(c, classroomZone), `${id} on the classroom avoids the classroom zone`);
    for (const bench of CLASSROOM_OBSTACLES) assert.ok(!crosses(c, bench), `${id} on the classroom avoids ${bench.name}`);
    assert.ok(!crosses(h, houseZone), `${id} on the house avoids the house zone`);
  }
  // The house ignores what belongs to the classroom: JOB-101 goes straight through the classroom
  // zone's spot, and some route goes through where the classroom benches would be.
  assert.strictEqual(house.jobRoutes['JOB-101'].waypoints.length, 2);
  assert.ok(crosses(house.jobRoutes['JOB-101'], classroomZone));
  assert.ok(ids.some(id => CLASSROOM_OBSTACLES.some(b => crosses(house.jobRoutes[id], b))), 'a house route crosses the classroom furniture area');
  // (That the browser sends only the active scan's zones is checked by the smoke test.)

  // ETAs follow the routes: the house zone only changes house ETAs, the classroom zone only
  // classroom ones.
  assert.strictEqual(eta(house, 'JOB-101'), eta(houseEmpty, 'JOB-101'), 'JOB-101 on the house: the classroom zone is not in its way');
  assert.ok(eta(house, 'JOB-103') > eta(houseEmpty, 'JOB-103'), 'JOB-103 on the house goes around the house zone');
  const classroomEmpty = await schedule({ scan: CLASSROOM_SCAN });
  assert.ok(eta(classroom, 'JOB-101') > eta(classroomEmpty, 'JOB-101'), 'JOB-101 on the classroom goes around the classroom zone');
});

test('zones get an id and a name of their own on their scan; exact duplicates are dropped', () => {
  // Names: the lowest unused number on that scan (a delete no longer leads to two "#2"s).
  assert.strictEqual(nextZoneName([]), 'User Zone #1');
  assert.strictEqual(nextZoneName(['User Zone #2']), 'User Zone #1');
  assert.strictEqual(nextZoneName(['User Zone #1', 'User Zone #2']), 'User Zone #3');
  assert.strictEqual(newZoneId(['zone-1', 'zone-3']), 'zone-2');

  const dup = zone('User Zone #2', 0, 1, 0, 1, CLASSROOM_SCAN);
  const { zones, changed } = cleanZones([
    { ...dup, id: 'zone-1' },
    { ...dup, id: 'zone-2' }, // the same box again on the same scan: dropped
    { ...zone('User Zone #2', 2, 3, 0, 1, CLASSROOM_SCAN), id: 'zone-1' }, // same name and id, different box: renamed, new id
    zone('User Zone #2', 0, 1, 0, 1, HOUSE) // the same box on another scan is a different zone
  ]);
  assert.strictEqual(changed, true);
  assert.deepStrictEqual(zones.map(z => [z.id, z.name, z.scan, z.minX]), [
    ['zone-1', 'User Zone #2', CLASSROOM_SCAN, 0],
    ['zone-2', 'User Zone #1', CLASSROOM_SCAN, 2],
    ['zone-3', 'User Zone #2', HOUSE, 0]
  ]);
  assert.strictEqual(cleanZones(zones).changed, false, 'a clean list stays as it is');

  // Loading cleans, and says so, so the cleaned list is saved.
  const loaded = loadZones(JSON.stringify([{ ...dup, id: 'zone-1' }, { ...dup, id: 'zone-1' }]), null);
  assert.strictEqual(loaded.cleaned, true);
  assert.strictEqual(loaded.zones.length, 1);
});

test('calibration and the ribbon setting are kept per scan', () => {
  const { CALIBRATION_DEFAULTS, LEGACY_CALIBRATION_KEY, calibrationKey, loadCalibration, ribbonsKey, ribbonsVisible } = require('../shared/scan_settings.js');
  const store = {};
  const get = k => (k in store ? store[k] : null);

  // Nothing saved: defaults on every scan.
  assert.deepStrictEqual(loadCalibration(HOUSE, get), { calibration: { ...CALIBRATION_DEFAULTS }, source: 'defaults' });

  // The one calibration saved before this change goes to the classroom only. It holds a robot
  // scale, which becomes meters per unit (robot scale 0.7: 1 / 0.7 m per unit).
  const { meshRotY, meshOffsetX, meshOffsetY, meshOffsetZ, boundDepth } = CALIBRATION_DEFAULTS;
  store[LEGACY_CALIBRATION_KEY] = JSON.stringify({ meshRotY, meshOffsetX, meshOffsetY, meshOffsetZ, boundDepth, boundWidth: 20, meshScale: 1.3, robotScale: 0.7 });
  const classroom = loadCalibration(CLASSROOM_SCAN, get);
  assert.strictEqual(classroom.source, 'legacy');
  assert.deepStrictEqual(classroom.calibration, { ...CALIBRATION_DEFAULTS, boundWidth: 20, meshScale: 1.3, metersPerUnit: 1 / 0.7 });
  assert.strictEqual(loadCalibration(HOUSE, get).source, 'defaults', 'the house does not pick up the classroom calibration');

  // A scan's own saved calibration wins; bad or unknown values are ignored.
  store[calibrationKey(HOUSE)] = JSON.stringify({ boundWidth: 12, robotScale: 'big', metersPerUnit: -2, extra: 5 });
  const house = loadCalibration(HOUSE, get);
  assert.strictEqual(house.source, 'scan');
  assert.deepStrictEqual(house.calibration, { ...CALIBRATION_DEFAULTS, boundWidth: 12 });
  // Meters per unit, once saved, wins over an old robot scale saved with it.
  store[calibrationKey(HOUSE)] = JSON.stringify({ robotScale: 0.9, metersPerUnit: 3 });
  assert.strictEqual(loadCalibration(HOUSE, get).calibration.metersPerUnit, 3);
  store[calibrationKey(HOUSE)] = JSON.stringify({ robotScale: 0.9 });
  assert.ok(Math.abs(loadCalibration(HOUSE, get).calibration.metersPerUnit - 1 / 0.9) < 1e-9);
  assert.ok(!('robotScale' in loadCalibration(HOUSE, get).calibration), 'the robot scale is not saved again');
  store[calibrationKey(CLASSROOM_SCAN)] = JSON.stringify({ ...CALIBRATION_DEFAULTS });
  assert.deepStrictEqual(loadCalibration(CLASSROOM_SCAN, get).calibration, { ...CALIBRATION_DEFAULTS }, 'a saved reset wins over the old key');

  // Ribbons: on unless turned off on that scan.
  assert.strictEqual(ribbonsVisible(HOUSE, get), true);
  store[ribbonsKey(HOUSE)] = 'off';
  assert.strictEqual(ribbonsVisible(HOUSE, get), false);
  assert.strictEqual(ribbonsVisible(CLASSROOM_SCAN, get), true, 'turning them off on the house leaves the classroom on');
});

test('furniture edits are saved per scan as differences from the defaults, by box id', () => {
  const { furnitureEditsKey, parseFurnitureEdits, applyFurnitureEdits, furnitureEditsFrom, hasFurnitureEdits } = require('../shared/zones.js');
  const defaults = furnitureForScan(CLASSROOM_SCAN);
  assert.deepStrictEqual(defaults.map(b => b.id), ['classroom-benches', 'classroom-printers', 'classroom-partition']);
  assert.notStrictEqual(furnitureEditsKey(CLASSROOM_SCAN), furnitureEditsKey(HOUSE));

  // No edits: nothing to save.
  assert.strictEqual(hasFurnitureEdits(furnitureEditsFrom(defaults, defaults)), false);

  // Move the benches, rotate the printers, delete the partition.
  const current = furnitureForScan(CLASSROOM_SCAN);
  const benches = current[0];
  benches.minZ -= 1; benches.maxZ -= 1;
  current[1].rotY = 30;
  current.splice(2, 1);
  const edits = furnitureEditsFrom(defaults, current);
  assert.deepStrictEqual(Object.keys(edits.boxes), ['classroom-benches', 'classroom-printers']);
  assert.deepStrictEqual(edits.deleted, ['classroom-partition']);

  // Saved and loaded back, the edits rebuild exactly that furniture; defaults are untouched.
  const reloaded = applyFurnitureEdits(furnitureForScan(CLASSROOM_SCAN), parseFurnitureEdits(JSON.stringify(edits)));
  assert.deepStrictEqual(reloaded.map(b => [b.id, b.minZ, b.rotY ?? 0]), [['classroom-benches', -1.6, 0], ['classroom-printers', -0.5, 30]]);
  assert.strictEqual(CLASSROOM_OBSTACLES[0].minZ, -0.6);
  assert.strictEqual(CLASSROOM_OBSTACLES.length, 3);

  // Through obstaclesForScan: the classroom gets its edits, the house has no furniture either way.
  const zones = [zone('Classroom Zone', 0, 1, 0, 1, CLASSROOM_SCAN)];
  assert.deepStrictEqual(obstaclesForScan(CLASSROOM_SCAN, zones, edits).map(b => b.id || b.name), ['classroom-benches', 'classroom-printers', 'Classroom Zone']);
  assert.deepStrictEqual(obstaclesForScan(HOUSE, zones, edits), []);
  assert.strictEqual(obstaclesForScan(CLASSROOM_SCAN, zones).length, 4, 'no edits: all defaults');

  // Malformed saved edits are ignored; unknown ids change nothing.
  assert.deepStrictEqual(parseFurnitureEdits('not json'), { boxes: {}, deleted: [] });
  const odd = parseFurnitureEdits(JSON.stringify({ boxes: { 'classroom-benches': { minX: 'far', maxX: 5 }, nope: { minX: 1 } }, deleted: [3, 'gone'] }));
  assert.deepStrictEqual(odd, { boxes: { 'classroom-benches': { maxX: 5 }, nope: { minX: 1 } }, deleted: ['gone'] });
  assert.deepStrictEqual(applyFurnitureEdits(furnitureForScan(CLASSROOM_SCAN), odd).map(b => [b.id, b.maxX]),
    [['classroom-benches', 5], ['classroom-printers', 2.1], ['classroom-partition', 1.2]]);

  // Planner: the request's own furniture list replaces the defaults; an empty list means all deleted.
  assert.deepStrictEqual(planningObstacles(CLASSROOM_SCAN, [], [benches]).map(b => b.id), ['classroom-benches']);
  assert.deepStrictEqual(planningObstacles(CLASSROOM_SCAN, [], []), []);
});

test('the AI planner plans around the furniture as edited in the request', async t => {
  const server = await startServer(PORT + 1);
  t.after(() => server.stop());
  const schedule = async body => (await fetch(`${server.url}/api/schedule/jobs`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bounds: { minX: -2.8, maxX: 2.8, minZ: -1.8, maxZ: 1.8 }, scan: CLASSROOM_SCAN, ...body })
  })).json();
  const defaults = furnitureForScan(CLASSROOM_SCAN);

  // The benches moved across JOB-101's straight south route (clear of its stations): it now goes
  // around them.
  const moved = defaults.map(b => (b.id === 'classroom-benches' ? { ...b, minX: -1.0, maxX: 0.8, minZ: -1.8, maxZ: -1.0 } : b));
  const plain = await schedule({});
  const aroundMoved = await schedule({ furniture: moved });
  assert.strictEqual(plain.jobRoutes['JOB-101'].waypoints.length, 2, 'straight with the default furniture');
  assert.ok(!crosses(aroundMoved.jobRoutes['JOB-101'], moved[0]), 'JOB-101 avoids the moved benches');
  assert.ok(aroundMoved.jobRoutes['JOB-101'].waypoints.length > 2);

  // All furniture deleted: routes go straight through where the benches were.
  const none = await schedule({ furniture: [] });
  assert.ok(Object.keys(none.jobRoutes).some(id => defaults.some(b => crosses(none.jobRoutes[id], b))), 'a route crosses the deleted furniture\'s spot');
  // No furniture field (an older client): the defaults, as before.
  for (const id of Object.keys(plain.jobRoutes)) for (const b of defaults) assert.ok(!crosses(plain.jobRoutes[id], b), `${id} avoids ${b.name}`);
});

test('measuring a scan gives its meters per unit, for that scan only', () => {
  const { CALIBRATION_DEFAULTS, calibrationKey, loadCalibration, measureMetersPerUnit, withMetersPerUnit, METERS_PER_UNIT_RANGE } = require('../shared/scan_settings.js');
  const near = (a, b) => Math.abs(a - b) < 1e-9;

  // Across the floor, and up a door frame (2.03 m door, 0.7 units tall on the scan).
  const floor = measureMetersPerUnit({ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 4 }, 15);
  assert.ok(floor.ok && near(floor.units, 5) && near(floor.metersPerUnit, 3));
  const door = measureMetersPerUnit({ x: 1, y: 0.02, z: 1 }, { x: 1, y: 0.72, z: 1 }, 2.03);
  assert.ok(door.ok && near(door.units, 0.7) && near(door.metersPerUnit, 2.9));

  // Not measurable.
  assert.strictEqual(measureMetersPerUnit({ x: 0, y: 0, z: 0 }, { x: 0.03, y: 0, z: 0 }, 1).ok, false, 'points too close');
  for (const bad of [0, -2, NaN, undefined, '2.03']) {
    assert.strictEqual(measureMetersPerUnit({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, bad).ok, false, `real distance ${bad}`);
  }
  const tooBig = measureMetersPerUnit({ x: 0, y: 0, z: 0 }, { x: 0.1, y: 0, z: 0 }, 2.03);
  assert.ok(!tooBig.ok && tooBig.metersPerUnit > METERS_PER_UNIT_RANGE.MAX && /outside/.test(tooBig.reason));
  assert.strictEqual(measureMetersPerUnit({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 2).ok, false, 'below the minimum');

  // Storing it changes only meters per unit, on that scan only.
  const store = { [calibrationKey(HOUSE)]: JSON.stringify({ ...CALIBRATION_DEFAULTS, boundWidth: 20 }) };
  const get = k => (k in store ? store[k] : null);
  store[calibrationKey(HOUSE)] = JSON.stringify(withMetersPerUnit(HOUSE, 2.9, get));
  assert.deepStrictEqual(loadCalibration(HOUSE, get).calibration, { ...CALIBRATION_DEFAULTS, boundWidth: 20, metersPerUnit: 2.9 });
  assert.deepStrictEqual(loadCalibration(CLASSROOM_SCAN, get).calibration, { ...CALIBRATION_DEFAULTS }, 'the classroom is not changed');

  // A stored value out of range is ignored.
  store[calibrationKey(HOUSE)] = JSON.stringify({ metersPerUnit: 9 });
  assert.strictEqual(loadCalibration(HOUSE, get).calibration.metersPerUnit, CALIBRATION_DEFAULTS.metersPerUnit);
  store[calibrationKey(HOUSE)] = JSON.stringify({ metersPerUnit: 0.2, robotScale: 0.9 });
  assert.ok(near(loadCalibration(HOUSE, get).calibration.metersPerUnit, 1 / 0.9), 'falls back to an old robot scale');
});

test('campus 3D buildings and water features are permanently solid exact polygons and robots route along sidewalks', () => {
  const { CAMPUS_OSM_OBSTACLES } = require('../shared/lab_map.js');
  const { CAMPUS_OSM_SCAN, applyFurnitureEdits } = require('../shared/zones.js');
  const { AStarPlanner, isPointInPolygonObstacle, segmentHitsPolygon, resolvePolygonCollision, rayHitsPolygon } = require('../shared/astar.js');

  const solidStructures = CAMPUS_OSM_OBSTACLES.filter(ob => !ob.isWalkwayNetwork);
  const walkwayNetwork = CAMPUS_OSM_OBSTACLES.find(ob => ob.isWalkwayNetwork);
  assert.strictEqual(solidStructures.length, 52, '48 exact 3D building meshes + lake + fountain + 2 pools');
  assert.ok(walkwayNetwork && walkwayNetwork.polylines.length >= 130, '132 sidewalk and crosswalk polylines');

  for (const ob of solidStructures) {
    assert.strictEqual(ob.permanentSolid, true, `${ob.id} is permanently solid`);
    assert.ok(Array.isArray(ob.pts) && ob.pts.length >= 4, `${ob.id} has an exact 2D polygon loop`);
  }

  // Attempting to delete or warp permanentSolid campus buildings via furniture edits is ignored.
  const kept = applyFurnitureEdits(furnitureForScan(CAMPUS_OSM_SCAN), {
    boxes: { 'osm-bldg-1': { minX: 99, maxX: 100 } },
    deleted: ['osm-bldg-1', 'osm-fountain', 'osm-lake']
  });
  assert.strictEqual(kept.length, CAMPUS_OSM_OBSTACLES.length, 'permanentSolid structures cannot be deleted');
  assert.notStrictEqual(kept.find(b => b.id === 'osm-bldg-1').minX, 99, 'permanentSolid structures cannot be warped');

  // Circular 12-sided fountain collision, raycast, and push-out
  const fountain = CAMPUS_OSM_OBSTACLES.find(b => b.id === 'osm-fountain');
  const fcx = (fountain.minX + fountain.maxX) / 2;
  const fcz = (fountain.minZ + fountain.maxZ) / 2;
  assert.strictEqual(isPointInPolygonObstacle(fcx, fcz, fountain, 0), true, 'fountain center is inside polygon');
  const pushed = { x: fcx + 0.01, z: fcz };
  assert.strictEqual(resolvePolygonCollision(pushed, 0.20, fountain), true, 'rover inside fountain is pushed out');
  assert.strictEqual(isPointInPolygonObstacle(pushed.x, pushed.z, fountain, 0.19), false, 'pushed outside fountain radius');
  const hitDist = rayHitsPolygon(fcx - 1.0, fcz, 1, 0, 5.0, fountain);
  assert.ok(hitDist !== null && hitDist > 0.7 && hitDist < 1.0, 'LiDAR ray hits circular fountain wall');

  // A* planner routes around the solid lake, fountain, and buildings using sidewalks
  const planner = new AStarPlanner({ bounds: { minX: -9, maxX: 9, minZ: -8, maxZ: 8 } });
  const route = planner.findPath({ x: -2.55, z: 1.32 }, { x: 2.20, z: -0.05 }, CAMPUS_OSM_OBSTACLES);
  assert.strictEqual(route.success, true, 'finds sidewalk route from West Helipad to East Library');
  assert.ok(route.waypoints.length > 2, 'bends along campus sidewalks around the lake and buildings');
  for (let i = 0; i < route.waypoints.length - 1; i++) {
    const a = route.waypoints[i];
    const b = route.waypoints[i + 1];
    for (const ob of solidStructures) {
      assert.strictEqual(segmentHitsPolygon(a, b, ob, 0.05), false, `segment ${i} clears ${ob.name}`);
    }
  }
});
