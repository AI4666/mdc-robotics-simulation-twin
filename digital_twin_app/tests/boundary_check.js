// Boundary check: runs the app for 60 s on the classroom and the house scans (Boundaries ON)
// and fails if any robot's body crosses the drawn boundary. Run with `npm run check:boundary`.
// Pass a number of seconds to run longer or shorter: `node tests/boundary_check.js 30`.
const fs = require('node:fs');
const puppeteer = require('puppeteer-core');
const { startServer } = require('./server_harness');

const PORT = 3191;
const SECONDS = Number(process.argv[2]) || 60;
const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
];
// app.js getEnvironmentLimits() with the default 5.6 x 3.6 m calibration.
const SCANS = {
  'robotics_lab.glb': { minX: -2.8, maxX: 2.8, minZ: -1.8, maxZ: 1.8 },
  'scan_house.glb': { minX: -8.5, maxX: 8.5, minZ: -7.5, maxZ: 7.5 }
};
// How far each body reaches from its center, on a scan of default size (shared/robots.js).
const { bodySize } = require('../shared/robots.js');
const REACH = { amr: bodySize('amr').halfWidth, drone: bodySize('drone').radius, humanoid: bodySize('humanoid').radius };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const executablePath = BROWSERS.find(p => fs.existsSync(p));
  const server = await startServer(PORT);
  const browser = await puppeteer.launch({ executablePath, headless: true, defaultViewport: { width: 1400, height: 800 } });
  let failed = false;
  try {
    for (const [scan, limits] of Object.entries(SCANS)) {
      const ctx = await browser.createBrowserContext();
      const page = await ctx.newPage();
      await page.evaluateOnNewDocument(s => localStorage.setItem('active_scan', s), scan);
      await page.goto(server.url, { waitUntil: 'networkidle2', timeout: 60000 });
      const boundariesOn = await page.evaluate(() => /ON/.test([...document.querySelectorAll('button')].find(b => /Boundaries:/.test(b.textContent)).textContent));
      const worst = {};
      const traveled = {};
      let last = null;
      for (let i = 0; i < SECONDS * 10; i++) {
        const robots = await page.evaluate(() => window.robotDefs.map(r => ({ id: r.id, type: r.type, x: r.position.x, z: r.position.z })));
        for (const r of robots) {
          const reach = REACH[r.type] || 0;
          // How far the body sticks out past the nearest wall (negative: inside, with room to spare).
          const out = Math.max(limits.minX - (r.x - reach), (r.x + reach) - limits.maxX, limits.minZ - (r.z - reach), (r.z + reach) - limits.maxZ);
          worst[r.id] = Math.max(worst[r.id] ?? -Infinity, out);
          const prev = last && last.find(p => p.id === r.id);
          if (prev) traveled[r.id] = (traveled[r.id] || 0) + Math.hypot(r.x - prev.x, r.z - prev.z);
        }
        last = robots;
        await sleep(100);
      }
      const crossed = Object.entries(worst).filter(([, out]) => out > 1e-6);
      if (crossed.length || !boundariesOn) failed = true;
      console.log(`${crossed.length || !boundariesOn ? 'FAIL' : 'PASS'}  ${scan} for ${SECONDS} s, Boundaries ${boundariesOn ? 'ON' : 'OFF'}: ` +
        Object.entries(worst).map(([id, out]) => `${id} ${out > 1e-6 ? `crossed by ${out.toFixed(3)} m` : `closest ${(-out).toFixed(2)} m inside`} (drove ${(traveled[id] || 0).toFixed(1)} m)`).join(', '));
      await ctx.close();
    }
  } finally {
    await browser.close();
    await server.stop();
  }
  console.log(failed ? '\nBOUNDARY CHECK FAILED' : '\nBOUNDARY CHECK PASSED');
  process.exit(failed ? 1 : 0);
})().catch(err => { console.error('BOUNDARY CHECK CRASHED:', err); process.exit(1); });
