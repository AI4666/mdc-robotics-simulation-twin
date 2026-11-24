// Unit tests for the server-side world model rules not covered by the API snapshots.
const test = require('node:test');
const assert = require('node:assert');
const { WorldModel } = require('../world_model.js');

test('starts with the 10-robot fleet and 11 stations/docks', () => {
  const world = new WorldModel();
  assert.strictEqual(world.getRobots().length, 10);
  assert.deepStrictEqual(world.getRobots().map(r => r.id), [
    'AMR-01', 'AMR-02', 'AMR-03', 'AMR-04', 'AMR-05', 'AMR-06',
    'HUM-01', 'UAV-01', 'UAV-02', 'UAV-03'
  ]);
  assert.deepStrictEqual(Object.keys(world.getStations()), [
    'inventory', 'electronics', 'testing', 'charger', 'helipad',
    'dock1', 'dock2', 'dock3', 'dock4', 'dock5', 'dock6'
  ]);
});

test('separate instances do not share state', () => {
  const a = new WorldModel();
  const b = new WorldModel();
  a.updateRobot({ id: 'AMR-01', x: 9 });
  a.updateStations({ helipad: { x: 9 } });
  assert.strictEqual(b.getRobots()[0].x, -1.5);
  assert.strictEqual(b.getStation('helipad').x, -2.55);
});

test('mergeRobots updates known robots and adds unknown ones', () => {
  const world = new WorldModel();
  world.mergeRobots([{ id: 'AMR-02', status: 'Busy' }, { id: 'NEW-1', x: 1 }]);
  assert.strictEqual(world.getRobots().find(r => r.id === 'AMR-02').status, 'Busy');
  assert.strictEqual(world.getRobots().find(r => r.id === 'AMR-02').name, 'Logistics Beta');
  assert.deepStrictEqual(world.getRobots().at(-1), { id: 'NEW-1', x: 1 });
});

test('updateRobot changes known robots and ignores unknown ids', () => {
  const world = new WorldModel();
  assert.strictEqual(world.updateRobot({ id: 'HUM-01', battery: 50 }), true);
  assert.strictEqual(world.getRobots().find(r => r.id === 'HUM-01').battery, 50);
  assert.strictEqual(world.updateRobot({ id: 'NOPE', battery: 1 }), false);
  assert.strictEqual(world.getRobots().length, 10);
});

test('applyTelemetry mirrors the reported state and records its source and time', () => {
  const world = new WorldModel();
  const ok = world.applyTelemetry({ robotId: 'UAV-01', source: 'sim', x: 0.5, y: 1.75, z: -0.25, heading: 1.5708, speed: 1.1, battery: 87.5, status: 'In Flight / Surveillance' }, 12345);
  assert.strictEqual(ok, true);
  const uav = world.getRobots().find(r => r.id === 'UAV-01');
  assert.deepStrictEqual(
    { x: uav.x, y: uav.y, z: uav.z, heading: uav.heading, speed: uav.speed, battery: uav.battery, status: uav.status, source: uav.source, lastTelemetryAt: uav.lastTelemetryAt },
    { x: 0.5, y: 1.75, z: -0.25, heading: 1.5708, speed: 1.1, battery: 87.5, status: 'In Flight / Surveillance', source: 'sim', lastTelemetryAt: 12345 });
  assert.strictEqual(uav.name, 'SkyWatcher Drone', 'other fields are kept');
});

test('applyTelemetry ignores unknown robots and non-numeric values', () => {
  const world = new WorldModel();
  assert.strictEqual(world.applyTelemetry({ robotId: 'NOPE', x: 1 }, 1), false);
  assert.strictEqual(world.applyTelemetry(null, 1), false);
  world.applyTelemetry({ robotId: 'AMR-01', x: 'far', z: NaN, speed: null, status: 42 }, 2);
  const amr = world.getRobots()[0];
  assert.deepStrictEqual([amr.x, amr.z, amr.speed, amr.status], [-1.5, -1.35, 0.0, 'Docked at Bay 1 (Standby)']);
  assert.strictEqual(world.getRobots().length, 10);
});

test('updateStations ignores unknown stations and non-numeric coordinates', () => {
  const world = new WorldModel();
  world.updateStations({
    testing: { x: 1.5, y: 'high', z: NaN },
    nowhere: { x: 1, y: 1, z: 1 },
    charger: null
  });
  assert.deepStrictEqual(world.getStation('testing'), { name: 'Station C: Testing Table', x: 1.5, y: 0.05, z: -0.05 });
  assert.strictEqual(world.getStation('nowhere'), undefined);
  assert.deepStrictEqual(world.getStation('charger'), { name: 'Station D: AMR Charger Dock', x: 0.8, y: 0.05, z: 1.32 });
});
