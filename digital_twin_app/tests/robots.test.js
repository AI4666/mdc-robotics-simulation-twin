// Tests for the robots' real sizes and their sizes in the app (shared/robots.js).
const test = require('node:test');
const assert = require('node:assert');
const { ROBOT_SPECS, DEFAULT_METERS_PER_UNIT, CLEARANCE, modelScale, bodySize, plannerClearance, clampClearance } = require('../shared/robots.js');

const near = (a, b, tol = 1e-4) => Math.abs(a - b) <= tol;

test('on a scan of default size the AMRs and the planner are as they were before real sizes', () => {
  // Before: AMR model at robot scale 0.55, half-width 0.41 x 0.55, half-length 0.48 x 0.55, top
  // 0.49 x 0.55, wheel radius 0.12 x 0.55, planner clearance 0.25.
  assert.ok(near(DEFAULT_METERS_PER_UNIT, 1 / 0.55));
  for (const v of modelScale('amr', DEFAULT_METERS_PER_UNIT)) assert.ok(near(v, 0.55));
  const amr = bodySize('amr', DEFAULT_METERS_PER_UNIT);
  assert.ok(near(amr.halfWidth, 0.41 * 0.55) && near(amr.halfLength, 0.48 * 0.55) && near(amr.height, 0.49 * 0.55) && near(amr.wheelRadius, 0.12 * 0.55));
  assert.strictEqual(plannerClearance(DEFAULT_METERS_PER_UNIT), 0.25);
  assert.deepStrictEqual(bodySize('amr'), amr, 'no meters per unit: a scan of default size');
  assert.deepStrictEqual(bodySize('amr', NaN), amr);
});

test('every robot is its real size at the scan scale', () => {
  for (const m of [1, DEFAULT_METERS_PER_UNIT, 3]) {
    // The G1: 1.32 m tall, a circle around its 0.45 x 0.20 m standing box.
    const g1 = bodySize('humanoid', m);
    assert.ok(near(g1.height * m, 1.32));
    assert.ok(near(g1.radius * m, Math.hypot(0.225, 0.1)));
    assert.ok(near(modelScale('humanoid', m)[1] * 1.323 * m, 1.32), 'its model is drawn 1.32 m tall');
    // The AMR and drone placeholders: the models' own sizes.
    const amr = bodySize('amr', m);
    assert.ok(near(amr.halfWidth * 2 * m, ROBOT_SPECS.amr.width) && near(amr.height * m, ROBOT_SPECS.amr.height));
    assert.ok(near(bodySize('drone', m).radius * m, ROBOT_SPECS.drone.rotorReach));
    // One scan scale for all: the same factor for each model.
    assert.ok(near(modelScale('drone', m)[0], modelScale('amr', m)[0]));
  }
});

test('the planner clearance gives the widest ground robot room, within limits', () => {
  // Robot scale 0.9 before: 1 / 0.9 m per unit, AMR half-width 0.369.
  assert.ok(near(plannerClearance(1 / 0.9), 0.41 * 0.9 + CLEARANCE.EXTRA));
  assert.ok(plannerClearance(1 / 0.9) > bodySize('amr', 1 / 0.9).halfWidth);
  assert.ok(plannerClearance(1 / 0.9) > bodySize('humanoid', 1 / 0.9).radius);
  assert.strictEqual(plannerClearance(3), CLEARANCE.MIN, 'a smaller robot keeps the minimum');
  assert.strictEqual(plannerClearance(0.1), CLEARANCE.MAX);
  assert.strictEqual(clampClearance(0.4), 0.4);
  assert.strictEqual(clampClearance(0.1), CLEARANCE.MIN);
  assert.strictEqual(clampClearance(7), CLEARANCE.MAX);
  assert.strictEqual(clampClearance(undefined), CLEARANCE.MIN);
  assert.strictEqual(clampClearance('0.4'), CLEARANCE.MIN);
});
