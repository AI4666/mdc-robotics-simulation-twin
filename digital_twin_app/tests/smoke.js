// Browser smoke test: starts the server, opens the app in headless Edge (or Chrome) and
// exits with code 1 if the page logs an error or a basic feature stops working.
// Run with `npm run smoke`. Pass --headed to watch it.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const WebSocket = require('ws');
const { startServer } = require('./server_harness');

const PORT = 3101;
const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
];
const ROBOT_IDS = ['AMR-01', 'AMR-02', 'AMR-03', 'HUM-01', 'UAV-01'];
const DASHBOARDS = [
  ['AMR-01', '#rover-dashboard-modal', '#btn-close-rover-modal'],
  ['HUM-01', '#g1-dashboard-modal', '#btn-close-g1-modal'],
  ['UAV-01', '#drone-dashboard-modal', '#btn-close-drone-modal']
];

// A fresh browser always starts on the classroom scan; the others are only reached through
// the scan saved in localStorage, so each is loaded once from saved settings.
const SCANS = ['robotics_lab.glb', 'scan_house.glb', 'scan_secondary.glb'];
// Functions index.html calls from inline onclick handlers. They are assigned near the end of
// app.js, so a missing one means the module stopped evaluating partway through.
const INLINE_HANDLERS = [...new Set([...fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8')
  .matchAll(/onclick="[^"]*?window\.(\w+)/g)].map(m => m[1]))];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
}

async function isVisible(page, selector) {
  return page.$eval(selector, el => getComputedStyle(el).display !== 'none');
}

(async () => {
  const executablePath = BROWSERS.find(p => fs.existsSync(p));
  if (!executablePath) throw new Error('Neither Edge nor Chrome was found.');

  const server = await startServer(PORT);
  const browser = await puppeteer.launch({
    executablePath,
    headless: !process.argv.includes('--headed'),
    defaultViewport: { width: 1600, height: 900 }
  });

  const pageErrors = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', err => pageErrors.push(`page error: ${err.message}`));
    // "Failed to load resource" console lines are skipped: the response handler reports the URL.
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().startsWith('Failed to load resource')) pageErrors.push(`console error: ${msg.text()}`);
    });
    page.on('requestfailed', req => pageErrors.push(`request failed: ${req.url()} ${req.failure()?.errorText}`));
    // The app has no favicon; browsers request it automatically.
    page.on('response', res => {
      if (res.status() >= 400 && !res.url().endsWith('/favicon.ico')) pageErrors.push(`HTTP ${res.status()}: ${res.url()}`);
    });

    // Messages the page receives over its WebSocket (type, size, time), for the shadow-mode
    // echo check and the WORLD_STATE size and rate check.
    const received = [];
    const cdp = await page.target().createCDPSession();
    await cdp.send('Network.enable');
    cdp.on('Network.webSocketFrameReceived', e => {
      try { received.push({ type: JSON.parse(e.response.payloadData).type, bytes: e.response.payloadData.length, at: Date.now() }); } catch (err) { }
    });

    await page.goto(server.url, { waitUntil: 'networkidle2', timeout: 60000 });

    // 1. Fleet cards render for every robot.
    const cards = await page.$$eval('#robot-cards-container [id^="robot-card-"]', els => els.map(e => e.id));
    const missing = ROBOT_IDS.filter(id => !cards.includes(`robot-card-${id}`));
    check('robot cards render', missing.length === 0, missing.length ? `missing ${missing.join(', ')}` : `${cards.length} cards`);

    // 2. The browser opened a WebSocket to the server.
    let connected = false;
    for (let i = 0; i < 20 && !connected; i++) {
      connected = server.logs.some(l => l.includes('New client connected'));
      if (!connected) await sleep(250);
    }
    check('WebSocket connects', connected);

    // 3. The simulation is running: robots change position over 3 seconds.
    const positions = () => page.evaluate(() => window.robotDefs.map(r => ({ id: r.id, x: r.position.x, z: r.position.z })));
    const before = await positions();
    await sleep(3000);
    const after = await positions();
    const moved = after.filter(a => {
      const b = before.find(p => p.id === a.id);
      return b && Math.hypot(a.x - b.x, a.z - b.z) > 0.01;
    }).map(r => r.id);
    check('robots move', moved.length >= 2, `moved: ${moved.join(', ') || 'none'}`);

    // 4. Each dashboard opens from its fleet card and closes again.
    for (const [robotId, modal, closeBtn] of DASHBOARDS) {
      const name = `${robotId} dashboard opens and closes`;
      try {
        await page.click(`#robot-card-${robotId}`);
        await sleep(400);
        const opened = await isVisible(page, modal);
        await page.click(closeBtn);
        await sleep(400);
        const closed = !(await isVisible(page, modal));
        check(name, opened && closed, `opened=${opened} closed=${closed}`);
      } catch (err) {
        check(name, false, err.message);
        await page.keyboard.press('Escape');
      }
    }

    // 5. The AI planner fetches a schedule from the server and fills its table.
    try {
      await page.click('#btn-open-ai-planner');
      let rows = 0;
      for (let i = 0; i < 40 && rows === 0; i++) {
        rows = await page.$$eval('#csp-schedule-tbody tr', trs => trs.length);
        if (rows === 0) await sleep(250);
      }
      check('AI planner shows a schedule', rows > 0, `${rows} rows`);
      await page.click('#btn-close-ai-planner');
    } catch (err) {
      check('AI planner shows a schedule', false, err.message);
    }

    // 6. Shadow mode: with the simulation paused, the server's world model holds the same robot
    //    positions as the browser, from fresh telemetry, and none of it was echoed back.
    try {
      await page.click('#btn-sim-play'); // pause
      await sleep(600); // at least two 200 ms telemetry ticks
      const browserPos = await page.evaluate(() => window.robotDefs.map(r => ({ id: r.id, x: r.position.x, y: r.position.y, z: r.position.z })));
      const serverRobots = (await (await fetch(`${server.url}/api/robots`)).json()).robots;
      const now = Date.now();
      let worst = 0;
      const stale = [];
      for (const b of browserPos) {
        const s = serverRobots.find(r => r.id === b.id);
        if (!s || s.source !== 'sim' || !(now - s.lastTelemetryAt < 1000)) { stale.push(b.id); continue; }
        worst = Math.max(worst, Math.abs(s.x - b.x), Math.abs(s.y - b.y), Math.abs(s.z - b.z));
      }
      const echoes = received.filter(m => m.type === 'ROBOT_UPDATE').length;
      await page.click('#btn-sim-play'); // resume
      check('server world model matches the browser', stale.length === 0 && worst <= 0.001 && echoes === 0,
        `largest difference ${(worst * 1000).toFixed(2)} mm over ${browserPos.length} robots, ` +
        `stale: ${stale.join(', ') || 'none'}, ROBOT_UPDATE echoes: ${echoes}`);
    } catch (err) {
      check('server world model matches the browser', false, err.message);
    }

    // 7. The page rebuilds the server's WORLD_STATE from its deltas: with the simulation paused,
    //    the rebuilt robots match /api/robots within the 1 cm / 1° deadband; messages arrive at
    //    about 5 Hz and every one is under 8 KB.
    try {
      await page.click('#btn-sim-play'); // pause
      const windowStart = Date.now();
      await sleep(2000);
      const rebuilt = await page.evaluate(() => window.getWorldState());
      const serverRobots = (await (await fetch(`${server.url}/api/robots`)).json()).robots;
      await page.click('#btn-sim-play'); // resume
      const problems = [];
      for (const r of serverRobots) {
        const m = rebuilt.robots[r.id];
        if (!m) { problems.push(`${r.id} missing`); continue; }
        const off = Math.max(Math.abs(m.x - r.x), Math.abs(m.y - r.y), Math.abs(m.z - r.z));
        const turn = Math.abs(Math.atan2(Math.sin(m.heading - r.heading), Math.cos(m.heading - r.heading)));
        if (off >= 0.01 || turn >= Math.PI / 180 || m.status !== r.status) problems.push(`${r.id} off by ${(off * 1000).toFixed(1)} mm / ${(turn * 180 / Math.PI).toFixed(2)}°`);
      }
      if (!rebuilt.complete) problems.push('not complete');
      const frames = received.filter(m => m.type === 'WORLD_STATE');
      const inWindow = frames.filter(m => m.at >= windowStart && m.at < windowStart + 2000).length;
      const largest = Math.max(...frames.map(m => m.bytes));
      if (inWindow < 8 || inWindow > 13) problems.push(`${inWindow} messages in 2 s`);
      if (largest > 8 * 1024) problems.push(`largest message ${largest} bytes`);
      check('page rebuilds WORLD_STATE from deltas', problems.length === 0,
        problems.join(' | ') || `${Object.keys(rebuilt.robots).length} robots match, ${inWindow} messages in 2 s, largest ${largest} bytes, ${rebuilt.messages} applied, ${rebuilt.resets} snapshot(s)`);
    } catch (err) {
      check('page rebuilds WORLD_STATE from deltas', false, err.message);
    }

    // 8. E_STOP from another console reaches the page: AMR-01 stops and stays put, others keep moving.
    try {
      const consoleWs = await new Promise((resolve, reject) => {
        const ws = new WebSocket(`${server.url.replace('http', 'ws')}/ws`);
        ws.once('message', () => resolve(ws)); // INIT_FLEET
        ws.once('error', reject);
      });
      const acked = new Promise(resolve => consoleWs.on('message', raw => {
        const m = JSON.parse(raw.toString());
        if (m.type === 'ACK' && m.data.id === 'smoke-stop') resolve(true);
      }));
      const sentAt = Date.now();
      consoleWs.send(JSON.stringify({ type: 'E_STOP', id: 'smoke-stop', t: 0, data: { robotId: 'AMR-01', source: 'smoke test' } }));
      await page.waitForFunction(() => !!window.robotDefs.find(r => r.id === 'AMR-01').lastEStop, { timeout: 2000, polling: 5 });
      const stopMs = Date.now() - sentAt;
      const gotAck = await Promise.race([acked, sleep(1000).then(() => false)]);
      const where = () => page.evaluate(() => window.robotDefs.map(r => ({ id: r.id, x: r.position.x, z: r.position.z })));
      const p0 = await where();
      await sleep(1500);
      const p1 = await where();
      const movedBy = id => { const a = p0.find(p => p.id === id), b = p1.find(p => p.id === id); return Math.hypot(b.x - a.x, b.z - a.z); };
      const others = ['AMR-02', 'UAV-01', 'HUM-01'].filter(id => movedBy(id) > 0.01);
      consoleWs.close();
      check('E_STOP stops only the named robot', gotAck && movedBy('AMR-01') < 0.01 && others.length > 0,
        `stopped in ${stopMs} ms, ACK=${gotAck}, AMR-01 moved ${movedBy('AMR-01').toFixed(3)} m in 1.5 s, still moving: ${others.join(', ') || 'none'}`);
    } catch (err) {
      check('E_STOP stops only the named robot', false, err.message);
    }

    // 9. Manual waypoints are planned: the G1, given a two-point route diagonally across both bench
    //    blocks, follows a planned path around them and keeps reaching its waypoints.
    try {
      await page.evaluate(() => {
        const r = window.robotDefs.find(d => d.id === 'HUM-01');
        r.position.set(-2.3, r.position.y, -1.3);
        r.waypoints = [[-2.3, -1.3], [2.2, 1.2]].map(([x, z]) => new window.THREE.Vector3(x, 0.05, z));
        window.activateAndHideWaypoints('HUM-01');
      });
      const started = Date.now();
      let reached = 0;
      let planned = false;
      let lastIdx = 0;
      while (Date.now() - started < 25000 && reached < 2) {
        const s = await page.evaluate(() => { const r = window.robotDefs.find(d => d.id === 'HUM-01'); return { idx: r.waypointIdx, planned: !!r.isDetouring }; });
        planned = planned || s.planned;
        if (s.idx !== lastIdx) { reached++; lastIdx = s.idx; }
        await sleep(100);
      }
      check('manual waypoint route is planned around keep-out zones', planned && reached >= 2,
        `G1 reached ${reached} waypoint(s) in ${((Date.now() - started) / 1000).toFixed(1)} s, planned path used: ${planned}`);
    } catch (err) {
      check('manual waypoint route is planned around keep-out zones', false, err.message);
    }

    // 10. Each scan loads from saved settings with no page errors and with app.js fully evaluated.
    for (const scan of SCANS) {
      const ctx = await browser.createBrowserContext();
      const scanPage = await ctx.newPage();
      const errors = [];
      scanPage.on('pageerror', err => errors.push(err.message.split('\n')[0]));
      await scanPage.evaluateOnNewDocument(s => localStorage.setItem('active_scan', s), scan);
      await scanPage.goto(server.url, { waitUntil: 'networkidle2', timeout: 60000 });
      await sleep(3000);
      const missingHandlers = await scanPage.evaluate(names => names.filter(n => typeof window[n] !== 'function'), INLINE_HANDLERS);
      const problems = [...new Set(errors)].concat(missingHandlers.length ? [`missing window.${missingHandlers.join(', window.')}`] : []);
      check(`${scan} loads from saved settings`, problems.length === 0, problems.join(' | '));
      await ctx.close();
    }

    // 11. Keep-out zones belong to the scan they were drawn on. A zone saved before zones had a
    //     scan moves to the classroom (the old list stays as it was); a zone drawn on the house is
    //     only on the house; switching scans swaps them; the AI planner gets only the active
    //     scan's zones; everything survives a reload.
    {
      const name = 'keep-out zones belong to their scan';
      const ctx = await browser.createBrowserContext();
      try {
        const zp = await ctx.newPage();
        const legacy = JSON.stringify([{ name: 'Old Zone', minX: 0.6, maxX: 1.0, minZ: -1.5, maxZ: -1.1, height: 0.8, rotY: 0, color: 0xef4444, userCreated: true }]);
        await zp.evaluateOnNewDocument(old => {
          if (!sessionStorage.getItem('seeded')) {
            sessionStorage.setItem('seeded', '1');
            localStorage.setItem('active_scan', 'robotics_lab.glb');
            localStorage.setItem('custom_keepout_zones', old);
          }
        }, legacy);
        const plannerBodies = [];
        zp.on('request', req => { if (req.url().endsWith('/api/schedule/jobs')) plannerBodies.push(JSON.parse(req.postData() || '{}')); });
        await zp.goto(server.url, { waitUntil: 'networkidle2', timeout: 60000 });
        await sleep(1000);
        const state = () => zp.evaluate(() => ({
          boxes: window.obstacleBoxes.map(b => b.name),
          stored: JSON.parse(localStorage.getItem('keepout_zones_by_scan') || '[]').map(z => `${z.name}@${z.scan}`),
          legacy: localStorage.getItem('custom_keepout_zones')
        }));
        const switchTo = async scan => {
          await zp.select('#select-mesh', scan);
          await sleep(1500);
        };
        // The planner plans again after the scan or its zones change; the last request it sent is
        // the one its schedule shows.
        const planWith = async () => {
          await zp.evaluate(() => document.getElementById('btn-open-ai-planner').click());
          await sleep(1000);
          await zp.evaluate(() => document.getElementById('btn-close-ai-planner').click());
          const b = plannerBodies[plannerBodies.length - 1] || {};
          return `${b.scan}: ${(b.dynamicObstacles || []).map(z => z.name).join(', ') || 'none'}`;
        };
        const problems = [];
        const expect = (what, ok) => { if (!ok) problems.push(what); };

        const c1 = await state();
        expect('old zone loaded on the classroom', c1.boxes.includes('Old Zone') && c1.boxes.includes('Electronics & Soldering Benches'));
        expect('old zone stored for the classroom', c1.stored.join() === 'Old Zone@robotics_lab.glb');
        const p1 = await planWith();
        expect(`classroom planner request (${p1})`, p1 === 'robotics_lab.glb: Old Zone');

        await switchTo('scan_house.glb');
        const h1 = await state();
        expect(`house has no classroom boxes (${h1.boxes.join(', ')})`, h1.boxes.length === 0);
        await zp.evaluate(() => window.placeCustomKeepOutZone(2.0, 2.0, 0.8, 0.8));
        const h2 = await state();
        const houseZone = h2.boxes[0];
        expect('zone drawn on the house', h2.boxes.length === 1);
        const p2 = await planWith();
        expect(`house planner request (${p2})`, p2 === `scan_house.glb: ${houseZone}`);

        await switchTo('robotics_lab.glb');
        const c2 = await state();
        expect('house zone gone on the classroom, old zone back', !c2.boxes.includes(houseZone) && c2.boxes.includes('Old Zone'));
        const p3 = await planWith();
        expect(`classroom planner request after switching back (${p3})`, p3 === 'robotics_lab.glb: Old Zone');

        await zp.reload({ waitUntil: 'networkidle2', timeout: 60000 });
        await sleep(1000);
        const c3 = await state();
        expect('after a reload: same zones per scan', c3.boxes.includes('Old Zone') && !c3.boxes.includes(houseZone) &&
          c3.stored.join() === `Old Zone@robotics_lab.glb,${houseZone}@scan_house.glb`);
        expect('old zone list left untouched as a backup', c3.legacy === legacy);
        check(name, problems.length === 0, problems.length ? problems.join(' | ') : `classroom: ${p3}; house: ${p2}`);
      } catch (err) {
        check(name, false, err.message);
      } finally {
        await ctx.close();
      }
    }

    // 12. Scale & Align calibration and the planner's ribbon setting belong to their scan: a saved
    //     house calibration and ribbons turned off on the house leave the classroom as it was, and
    //     both survive a reload. The scan scale sizes every robot alike (shared/robots.js), at page
    //     load and after a switch: the AMR at 1 / (meters per unit), the G1 and drone with it.
    {
      const name = 'calibration and ribbons belong to their scan';
      const ctx = await browser.createBrowserContext();
      try {
        const sp = await ctx.newPage();
        await sp.evaluateOnNewDocument(() => {
          if (!sessionStorage.getItem('seeded')) {
            sessionStorage.setItem('seeded', '1');
            localStorage.setItem('active_scan', 'robotics_lab.glb');
          }
        });
        await sp.goto(server.url, { waitUntil: 'networkidle2', timeout: 60000 });
        await sleep(1000);
        const read = () => sp.evaluate(() => ({
          scan: localStorage.getItem('active_scan'),
          width: document.getElementById('slider-bound-w').value,
          robot: window.robotDefs.find(r => r.id === 'AMR-01').mesh.scale.x.toFixed(2),
          others: ['HUM-01', 'UAV-01'].map(id => window.robotDefs.find(r => r.id === id).mesh.scale.x.toFixed(2)).join(','),
          ribbons: document.getElementById('btn-toggle-astar-ribbons').textContent.includes('ON'),
          ribbonsShown: window.scene.getObjectByName('astarRibbons').visible
        }));
        const set = (id, v) => sp.evaluate((id, v) => { const s = document.getElementById(id); s.value = v; s.dispatchEvent(new Event('input')); }, id, v);
        const switchTo = async scan => { await sp.select('#select-mesh', scan); await sleep(1500); };
        const problems = [];
        const expect = (what, ok) => { if (!ok) problems.push(what); };

        await switchTo('scan_house.glb');
        await set('slider-bound-w', 20);
        await set('slider-meters-per-unit', 1.11); // robot scale 0.9 before
        await sp.evaluate(() => { document.getElementById('btn-lock-alignment').click(); document.getElementById('btn-toggle-astar-ribbons').click(); });
        const h1 = await read();
        expect(`house set (${JSON.stringify(h1)})`, h1.width === '20' && h1.robot === '0.90' && h1.others === '0.90,0.90' && !h1.ribbons && !h1.ribbonsShown);
        await switchTo('robotics_lab.glb');
        const c1 = await read();
        expect(`classroom unchanged (${JSON.stringify(c1)})`, c1.width === '5.6' && c1.robot === '0.55' && c1.others === '0.55,0.55' && c1.ribbons && c1.ribbonsShown);
        await sp.reload({ waitUntil: 'networkidle2', timeout: 60000 });
        await sleep(1000);
        const c2 = await read();
        expect(`classroom after a reload (${JSON.stringify(c2)})`, c2.width === '5.6' && c2.robot === '0.55' && c2.others === '0.55,0.55' && c2.ribbons);
        await switchTo('scan_house.glb');
        const h2 = await read();
        expect(`house after a reload (${JSON.stringify(h2)})`, h2.width === '20' && h2.robot === '0.90' && h2.others === '0.90,0.90' && !h2.ribbons && !h2.ribbonsShown);
        check(name, problems.length === 0, problems.length ? problems.join(' | ') : 'house: 20 m, 1.11 m per unit (all robots 0.90), ribbons off; classroom: 5.6 m, 1.82 m per unit (all robots 0.55, also at page load), ribbons on');
      } catch (err) {
        check(name, false, err.message);
      } finally {
        await ctx.close();
      }
    }

    // 13. Edits to the built-in furniture are saved per scan: moved, rotated and deleted boxes stay
    //     that way across a scan switch and a reload, the house is not affected, the planner gets
    //     the edited furniture, and "Restore Default Tables" brings the defaults back without
    //     touching zones.
    {
      const name = 'furniture edits belong to their scan';
      const ctx = await browser.createBrowserContext();
      try {
        const fp = await ctx.newPage();
        await fp.evaluateOnNewDocument(() => {
          if (!sessionStorage.getItem('seeded')) {
            sessionStorage.setItem('seeded', '1');
            localStorage.setItem('active_scan', 'robotics_lab.glb');
          }
        });
        const plannerBodies = [];
        fp.on('request', req => { if (req.url().endsWith('/api/schedule/jobs')) plannerBodies.push(JSON.parse(req.postData() || '{}')); });
        await fp.goto(server.url, { waitUntil: 'networkidle2', timeout: 60000 });
        await sleep(1000);
        const furniture = () => fp.evaluate(() => window.obstacleBoxes.filter(b => !b.userCreated)
          .map(b => `${b.id}@${((b.minX + b.maxX) / 2).toFixed(2)},${((b.minZ + b.maxZ) / 2).toFixed(2)},${Math.round(b.rotY || 0)}`).join(' '));
        const editAt = (id, fn) => fp.evaluate((id, fn) => {
          window.selectObstacleZone(window.obstacleBoxes.findIndex(b => b.id === id));
          new Function(fn)();
        }, id, fn);
        const switchTo = async scan => { await fp.select('#select-mesh', scan); await sleep(1200); };
        const restoreShown = () => fp.evaluate(() => document.getElementById('restore-defaults-container').style.display === 'block');
        const problems = [];
        const expect = (what, ok) => { if (!ok) problems.push(what); };
        const defaults = await furniture();

        await fp.evaluate(() => window.placeCustomKeepOutZone(2.0, -1.3, 0.4, 0.4)); // a zone, to check Restore leaves it alone
        await editAt('classroom-benches', "const s = document.getElementById('slider-zone-posz'); s.value = -1.0; s.dispatchEvent(new Event('input'));");
        await editAt('classroom-printers', "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }));");
        await editAt('classroom-partition', "document.getElementById('btn-delete-zone').click();");
        await sleep(800);
        const edited = await furniture();
        expect(`edited (${edited})`, /^classroom-benches@-1\.30,-1\.00,0 classroom-printers@[^ ]+,15$/.test(edited));
        expect('restore offered', await restoreShown());
        const body = plannerBodies[plannerBodies.length - 1] || {};
        expect(`planner gets the edited furniture (${JSON.stringify(body.furniture)})`,
          Array.isArray(body.furniture) && body.furniture.length === 2 && body.furniture[0].minZ < -1.4);

        await switchTo('scan_house.glb');
        expect('house has no furniture', (await furniture()) === '');
        expect('no house furniture edits saved', await fp.evaluate(() => localStorage.getItem('furniture_edits_scan_house.glb') === null));
        await switchTo('robotics_lab.glb');
        expect(`edits back after switching (${await furniture()})`, (await furniture()) === edited);
        await fp.reload({ waitUntil: 'networkidle2', timeout: 60000 });
        await sleep(1000);
        expect(`edits back after a reload (${await furniture()})`, (await furniture()) === edited);
        expect('restore offered after a reload', await restoreShown());

        await fp.evaluate(() => document.getElementById('btn-restore-obstacles').click());
        await sleep(500);
        expect(`defaults restored (${await furniture()})`, (await furniture()) === defaults);
        expect('edits cleared', await fp.evaluate(() => localStorage.getItem('furniture_edits_robotics_lab.glb') === null));
        expect('zone untouched by restore', await fp.evaluate(() => window.obstacleBoxes.filter(b => b.userCreated).length === 1));
        expect('restore no longer offered', !(await restoreShown()));
        await fp.reload({ waitUntil: 'networkidle2', timeout: 60000 });
        await sleep(1000);
        expect('defaults after a reload', (await furniture()) === defaults);
        check(name, problems.length === 0, problems.length ? problems.join(' | ') : 'moved, rotated, deleted; kept across switch and reload; restored');
      } catch (err) {
        check(name, false, err.message);
      } finally {
        await ctx.close();
      }
    }

    // 14. Measuring a scan's scale in Scale & Align: two points clicked on the house scan and the
    //     real distance between them set the house's meters per unit. Cancel and Esc change
    //     nothing; Save resizes all five robots and the planner's clearance, leaves zones,
    //     furniture and stations as they are, and is kept on the house only, across a scan switch
    //     and a reload. The slider still overrides it.
    {
      const name = 'scan scale measured per scan';
      const ctx = await browser.createBrowserContext();
      try {
        const mp = await ctx.newPage();
        mp.on('pageerror', err => pageErrors.push(`page error: ${err.message}`));
        await mp.evaluateOnNewDocument(() => {
          if (!sessionStorage.getItem('seeded')) {
            sessionStorage.setItem('seeded', '1');
            localStorage.setItem('active_scan', 'scan_house.glb');
          }
        });
        const plannerBodies = [];
        mp.on('request', req => { if (req.url().endsWith('/api/schedule/jobs')) plannerBodies.push(JSON.parse(req.postData() || '{}')); });
        await mp.goto(server.url, { waitUntil: 'networkidle2', timeout: 60000 });
        await sleep(2500);
        const problems = [];
        const expect = (what, ok) => { if (!ok) problems.push(what); };
        const scales = () => mp.evaluate(() => ['AMR-01', 'AMR-02', 'AMR-03', 'HUM-01', 'UAV-01']
          .map(id => window.robotDefs.find(r => r.id === id).mesh.scale.x.toFixed(2)).join(','));
        const text = id => mp.evaluate(id => document.getElementById(id).innerText, id);
        const layout = () => mp.evaluate(() => JSON.stringify({
          boxes: window.obstacleBoxes.map(b => [b.name, b.minX, b.maxX, b.minZ, b.maxZ, b.rotY || 0]),
          stations: Object.entries(window.labStations).map(([k, s]) => [k, s.pos.x, s.pos.z])
        }));
        const stored = () => mp.evaluate(() => JSON.parse(localStorage.getItem('lab_calibration_scan_house.glb') || 'null'));
        // Click a floor point (x, z) of the house, seen from above.
        const clickAt = async (x, z) => {
          const p = await mp.evaluate((x, z) => {
            const v = new window.THREE.Vector3(x, 0, z).project(window.camera);
            return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight };
          }, x, z);
          await mp.mouse.click(p.x, p.y);
          await sleep(300);
        };
        const measure = async () => {
          await mp.click('#btn-measure-scan');
          await clickAt(-1.5, -1);
          await clickAt(1.5, -1);
        };

        await mp.evaluate(() => {
          window.placeCustomKeepOutZone(-3, 3, 1.0, 0.6, 0.8, 0);
          const close = document.getElementById('btn-close-zone-editor');
          if (close) close.click();
          window.camera.position.set(0, 14, 0.01);
          window.controls.target.set(0, 0, 0);
          window.controls.update();
          document.getElementById('btn-toggle-tuner').click();
        });
        await sleep(500);
        const before = await layout();
        expect(`default size first (${await scales()})`, (await scales()) === '0.55,0.55,0.55,0.55,0.55');

        // Measure, then Cancel: nothing changes.
        await measure();
        const units = parseFloat(await text('scan-measure-units'));
        expect(`two points measured (${units} units)`, units > 2 && units < 5);
        await mp.click('#btn-measure-cancel');
        await sleep(300);
        expect('Cancel leaves the robots as they were', (await scales()) === '0.55,0.55,0.55,0.55,0.55');
        expect('Cancel stores nothing', (await stored()) === null);
        expect('Cancel removes the markers', await mp.evaluate(() => !window.scene.getObjectByName('scanMeasure')));

        // Esc stops measuring too.
        await mp.click('#btn-measure-scan');
        await clickAt(-1.5, -1);
        await mp.keyboard.press('Escape');
        await sleep(300);
        expect('Esc stops measuring', await mp.evaluate(() => document.getElementById('scan-measure-panel').style.display === 'none' && !window.scene.getObjectByName('scanMeasure')));

        // Measure and Save, with a real distance of 1.11 m per unit: robot scale 0.90.
        await measure();
        const u = parseFloat(await text('scan-measure-units'));
        await mp.evaluate(v => { const i = document.getElementById('input-measure-real'); i.value = String(v); i.dispatchEvent(new Event('input')); }, +(u * 1.11).toFixed(4));
        const result = await text('scan-measure-result');
        expect(`result shown before saving ("${result}")`, result === '1 unit = 1.11 m');
        const requestsBefore = plannerBodies.length;
        await mp.click('#btn-measure-save');
        await sleep(1500);
        const saved = await stored();
        expect(`stored for the house (${JSON.stringify(saved)})`, saved && Math.abs(saved.metersPerUnit - 1.11) < 0.001);
        expect(`all five robots resized (${await scales()})`, (await scales()) === '0.90,0.90,0.90,0.90,0.90');
        expect(`slider shows it (${await text('val-meters-per-unit')})`, (await text('val-meters-per-unit')) === '1.11 m');
        const replanned = plannerBodies.slice(requestsBefore);
        expect(`AI planner re-plans with the larger clearance (${replanned.map(b => b.clearance).join(', ')})`,
          replanned.length > 0 && Math.abs(replanned[replanned.length - 1].clearance - (0.41 / 1.11 + 0.02)) < 0.002);
        expect('zones, furniture and stations unchanged', (await layout()) === before);

        // The house only, across a switch and a reload.
        await mp.select('#select-mesh', 'robotics_lab.glb');
        await sleep(1500);
        expect(`classroom keeps its own (${await scales()}, ${await text('val-meters-per-unit')})`,
          (await scales()) === '0.55,0.55,0.55,0.55,0.55' && (await text('val-meters-per-unit')) === '1.82 m');
        await mp.reload({ waitUntil: 'networkidle2', timeout: 60000 });
        await sleep(1500);
        expect(`classroom after a reload (${await scales()})`, (await scales()) === '0.55,0.55,0.55,0.55,0.55');
        await mp.select('#select-mesh', 'scan_house.glb');
        await sleep(1500);
        expect(`house after a reload (${await scales()})`, (await scales()) === '0.90,0.90,0.90,0.90,0.90');

        // The slider still overrides it.
        await mp.evaluate(() => { const s = document.getElementById('slider-meters-per-unit'); s.value = 2.2; s.dispatchEvent(new Event('input')); });
        expect(`slider override (${await scales()})`, (await scales()) === '0.45,0.45,0.45,0.45,0.45');
        check(name, problems.length === 0, problems.length ? problems.join(' | ')
          : `${u.toFixed(3)} units measured; Cancel and Esc change nothing; saved 1.11 m per unit on the house (all robots 0.90, clearance 0.39), classroom stays 1.82; kept after a reload; slider overrides`);
      } catch (err) {
        check(name, false, err.message);
      } finally {
        await ctx.close();
      }
    }

    const shot = path.join(os.tmpdir(), 'digital_twin_smoke.png');
    await page.screenshot({ path: shot });
    console.log(`Screenshot: ${shot}`);
  } finally {
    await browser.close();
    await server.stop();
  }

  check('no page errors', pageErrors.length === 0, pageErrors.length ? `${pageErrors.length} errors` : '');
  pageErrors.forEach(e => console.log('   ' + e));

  const failed = results.filter(r => !r.ok).length;
  console.log(failed ? `\nSMOKE TEST FAILED (${failed} of ${results.length} checks)` : `\nSMOKE TEST PASSED (${results.length} checks)`);
  process.exit(failed ? 1 : 0);
})().catch(err => {
  console.error('SMOKE TEST CRASHED:', err);
  process.exit(1);
});
