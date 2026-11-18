// Zone check: AMRs must not get stuck in or against keep-out zones the user draws. Runs the cases
// that used to get stuck, AMR-01 alone (the other robots are taken out), 40 s each, and fails on a
// stall of 10 s or more, the body getting into a zone, or page errors: on the classroom (M8j), and
// on the house with larger robots (M8l: 1.11 m per unit, the AMR 0.74 m wide, wider than the
// planner's minimum clearance allows for) plus one at the default size. A job that arrives must keep showing "At <station>" while it is parked there, also after
// a small nudge (the jitter of a robot parked right at its arrival distance). Run with
// `npm run check:zones`; `npm run check:zones -- job` runs only the cases whose name contains "job".
const fs = require('node:fs');
const puppeteer = require('puppeteer-core');
const { startServer } = require('./server_harness');
const { bodySize, DEFAULT_METERS_PER_UNIT } = require('../shared/robots.js');

const PORT = 3270;
const SECONDS = 40;
const STALL_S = 10;
const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
];
const sleep = ms => new Promise(r => setTimeout(r, ms));

// zones: [x, z, w, d, rotY]; route: AMR-01's waypoints (it starts on the first), or its own
// patrol. Classroom at the default scan scale unless a case says otherwise.
const LARGE = 1 / 0.9; // meters per unit: robot scale 0.9 before
const HOUSE_CORNER = [[2.0, -1.6, 1.2, 0.6, 0]]; // its corner 0.3 m from the Parts Shelf -> Electronics line
const HOUSE_ROUTE = [[0.8, -2.4], [3.2, -2.0]];
const CASES = {
  'rotated 30 deg zone beside the south corridor': { zones: [[0, -1.55, 1.2, 0.3, 30]], route: [[-2.3, -1.3], [2.2, -1.3]] },
  'rotated 45 deg zone beside the south corridor': { zones: [[0, -1.55, 1.2, 0.3, 45]], route: [[-2.3, -1.3], [2.2, -1.3]] },
  'zone drawn on top of the AMR': { zones: [[-2.3, -1.3, 0.8, 0.8, 0]], route: [[-2.3, -1.3], [2.2, -1.3]], zonesAfterStart: true },
  'the only other waypoint inside a zone': { zones: [[2.2, -1.3, 0.6, 0.6, 0]], route: [[-2.3, -1.3], [2.2, -1.3]] },
  'job to a station inside a zone': { zones: [[2.2, -1.3, 0.6, 0.6, 0]], route: [[-2.3, -1.3], [-1.6, -1.3]], dispatch: 'testing', arrivedStatus: 'At Testing Table' },
  'house, default size: past a zone corner': { scan: 'scan_house.glb', zones: HOUSE_CORNER, route: HOUSE_ROUTE },
  'house, large robots: past a zone corner': { scan: 'scan_house.glb', mpu: LARGE, zones: HOUSE_CORNER, route: HOUSE_ROUTE },
  'house, large robots: past a rotated 30 deg zone corner': { scan: 'scan_house.glb', mpu: LARGE, zones: [[2.0, -1.5, 1.2, 0.6, 30]], route: HOUSE_ROUTE },
  'house, large robots: zone near the east wall': { scan: 'scan_house.glb', mpu: LARGE, zones: [[7.6, 0, 1.0, 1.0, 0]], route: [[8.0, -3.0], [8.0, 3.0]] },
  'house, large robots: two zones 0.7 m apart': { scan: 'scan_house.glb', mpu: LARGE, zones: [[1.0, 0, 1.0, 0.5, 0], [1.0, 1.2, 1.0, 0.5, 0]], route: [[-1.0, 0.6], [3.0, 0.6]] },
  'house, large robots: patrol past a zone corner': { scan: 'scan_house.glb', mpu: LARGE, zones: HOUSE_CORNER, patrol: true }
};
const ONLY = process.argv[2];

async function run(browser, server, name, c) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message.split('\n')[0]));
  const scan = c.scan || 'robotics_lab.glb';
  const halfWidth = bodySize('amr', c.mpu || DEFAULT_METERS_PER_UNIT).halfWidth;
  await page.evaluateOnNewDocument((scan, mpu) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    localStorage.setItem('active_scan', scan);
    if (mpu) localStorage.setItem(`lab_calibration_${scan}`, JSON.stringify({ metersPerUnit: mpu }));
  }, scan, c.mpu);
  await page.goto(server.url, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(1200);
  await page.evaluate(c => {
    for (const id of ['AMR-02', 'AMR-03', 'HUM-01']) {
      const i = window.robotDefs.findIndex(d => d.id === id);
      window.robotDefs[i].mesh.visible = false;
      window.robotDefs.splice(i, 1);
    }
    const place = () => c.zones.forEach(([x, z, w, d, rot]) => window.placeCustomKeepOutZone(x, z, w, d, 0.8, rot));
    if (!c.zonesAfterStart) place();
    const r = window.robotDefs.find(d => d.id === 'AMR-01');
    if (!c.patrol) {
      r.position.set(c.route[0][0], r.position.y, c.route[0][1]);
      r.waypoints = c.route.map(([x, z]) => new window.THREE.Vector3(x, 0.05, z));
      window.activateAndHideWaypoints('AMR-01');
    }
    if (c.zonesAfterStart) place();
    if (c.dispatch) window.dispatchRoverToStation(r, c.dispatch, window.labStations[c.dispatch]);
  }, c);

  let longest = 0, since = 0, anchor = null, deepest = 0, reached = 0, lastWp = null, arrived = false;
  let arrivedAt = null, nudged = false;
  const wrongStatus = new Set();
  for (let i = 0; i < SECONDS * 5; i++) {
    const t = i / 5;
    const s = await page.evaluate(halfWidth => {
      const r = window.robotDefs.find(d => d.id === 'AMR-01');
      let worst = Infinity;
      for (const ob of window.obstacleBoxes.filter(b => b.userCreated)) {
        const dx = r.position.x - (ob.minX + ob.maxX) / 2, dz = r.position.z - (ob.minZ + ob.maxZ) / 2;
        const a = -(ob.rotY || 0) * Math.PI / 180;
        const lx = dx * Math.cos(a) - dz * Math.sin(a), lz = dx * Math.sin(a) + dz * Math.cos(a);
        const ox = Math.abs(lx) - (ob.maxX - ob.minX) / 2, oz = Math.abs(lz) - (ob.maxZ - ob.minZ) / 2;
        worst = Math.min(worst, ((ox <= 0 && oz <= 0) ? Math.max(ox, oz) : Math.hypot(Math.max(ox, 0), Math.max(oz, 0))) - halfWidth);
      }
      return { x: r.position.x, z: r.position.z, wp: r.waypointIdx, worst, arrived: !!(r.isCustomMission && r.hasArrivedMission), status: r.status };
    }, halfWidth);
    if (s.arrived && arrivedAt === null) arrivedAt = t;
    if (arrivedAt !== null && c.arrivedStatus && s.status !== c.arrivedStatus) wrongStatus.add(s.status);
    // 2 s after arriving: nudge the parked robot 5 cm back from its target, just past its arrival
    // distance, as parking jitter does.
    if (c.arrivedStatus && arrivedAt !== null && !nudged && t >= arrivedAt + 2) {
      nudged = await page.evaluate(() => {
        const r = window.robotDefs.find(d => d.id === 'AMR-01');
        const dx = r.position.x - r.target.x, dz = r.position.z - r.target.z, d = Math.hypot(dx, dz) || 1;
        r.position.x += dx / d * 0.05;
        r.position.z += dz / d * 0.05;
        return true;
      });
    }
    deepest = Math.min(deepest, s.worst);
    if (lastWp !== null && s.wp !== lastWp) reached++;
    lastWp = s.wp;
    arrived = arrived || s.arrived;
    // A job that has arrived parks at its target: that is not a stall.
    if (!anchor || s.arrived || Math.hypot(s.x - anchor.x, s.z - anchor.z) > 0.05) {
      anchor = { x: s.x, z: s.z };
      since = t;
    }
    longest = Math.max(longest, t - since);
    await sleep(200);
  }
  await ctx.close();
  // Touching a zone (its collision push-out keeps the body at its face) is allowed; getting into
  // it is not.
  const ok = longest < STALL_S && deepest > -0.01 && errors.length === 0 && (c.dispatch ? arrived : reached > 0) &&
    wrongStatus.size === 0 && (!c.arrivedStatus || nudged);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  console.log(`      longest stall ${longest.toFixed(1)} s, deepest into a zone ${(-deepest * 100).toFixed(1)} cm, ` +
    (c.dispatch ? `job ${arrived ? 'arrived' : 'did not arrive'}` : `waypoints reached ${reached}`) +
    (c.arrivedStatus ? `, status after arriving and a 5 cm nudge: ${wrongStatus.size ? [...wrongStatus].map(x => `"${x}"`).join(', ') + ` (expected "${c.arrivedStatus}")` : `"${c.arrivedStatus}" throughout`}` : '') +
    (errors.length ? `, page errors: ${[...new Set(errors)].join(' | ')}` : ''));
  return ok;
}

(async () => {
  const executablePath = BROWSERS.find(p => fs.existsSync(p));
  const server = await startServer(PORT);
  const browser = await puppeteer.launch({ executablePath, headless: true });
  let failed = false;
  try {
    for (const [name, c] of Object.entries(CASES)) {
      if (ONLY && !name.includes(ONLY)) continue;
      if (!(await run(browser, server, name, c))) failed = true;
    }
  } finally {
    await browser.close();
    await server.stop();
  }
  console.log(failed ? '\nZONE CHECK FAILED' : '\nZONE CHECK PASSED');
  process.exit(failed ? 1 : 0);
})().catch(err => { console.error('ZONE CHECK CRASHED:', err); process.exit(1); });
