// Separation check: runs the app with all robots active on the classroom and house scans and
// reports how close any two robots' bodies get, whether any overlap, and whether any robot gets
// stuck. Fails on an overlap or a robot stuck for 20 s. Run with `npm run check:separation`.
// Pass a number of seconds to change the 60 s default: `node tests/separation_check.js 30`.
const fs = require('node:fs');
const puppeteer = require('puppeteer-core');
const { startServer } = require('./server_harness');
const { bodyGap } = require('../shared/separation.js');

const PORT = 3220;
const SECONDS = Number(process.argv[2]) || 60;
const STUCK_S = 20;
const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
];
const SCANS = ['robotics_lab.glb', 'scan_house.glb'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const executablePath = BROWSERS.find(p => fs.existsSync(p));
  const server = await startServer(PORT);
  const browser = await puppeteer.launch({ executablePath, headless: true });
  let failed = false;
  try {
    for (const scan of SCANS) {
      const ctx = await browser.createBrowserContext();
      const page = await ctx.newPage();
      await page.evaluateOnNewDocument(s => localStorage.setItem('active_scan', s), scan);
      await page.goto(server.url, { waitUntil: 'networkidle2', timeout: 60000 });
      const closest = {};
      const still = {}; // id -> { since, longest, anchor, why }
      for (let i = 0; i < SECONDS * 10; i++) {
        const robots = await page.evaluate(() => window.robotDefs.map(r => ({
          id: r.id, type: r.type, x: r.position.x, y: r.position.y, z: r.position.z, heading: r.heading,
          status: r.status, idle: r.speed === 0 && /Dock|Charg|Standby|Braked|Landed|Hover/.test(r.status || '')
        })));
        for (let a = 0; a < robots.length; a++) {
          for (let b = a + 1; b < robots.length; b++) {
            const key = `${robots[a].id} / ${robots[b].id}`;
            const g = bodyGap(robots[a], robots[b]);
            const c = closest[key] || (closest[key] = { gap: Infinity, t: 0, overlapS: 0 });
            if (g < c.gap) { c.gap = g; c.t = i / 10; }
            if (g < 0) c.overlapS += 0.1;
          }
        }
        const t = i / 10;
        for (const r of robots) {
          const s = still[r.id] || (still[r.id] = { since: t, longest: 0, anchor: r, status: '' });
          if (Math.hypot(r.x - s.anchor.x, r.z - s.anchor.z) > 0.05 || r.idle) {
            s.since = t;
            s.anchor = r;
          } else if (t - s.since > s.longest) {
            s.longest = t - s.since;
            s.status = r.status;
          }
        }
        await sleep(100);
      }
      const pairs = Object.entries(closest).sort((p, q) => p[1].gap - q[1].gap);
      const overlaps = pairs.filter(([, v]) => v.gap < 0);
      const stuck = Object.entries(still).filter(([, s]) => s.longest >= STUCK_S);
      if (overlaps.length || stuck.length) failed = true;
      console.log(`${overlaps.length || stuck.length ? 'FAIL' : 'PASS'}  ${scan}, ${SECONDS} s, all robots active`);
      console.log(`      closest pairs: ${pairs.slice(0, 4).map(([k, v]) => `${k} ${(v.gap * 100).toFixed(1)} cm at ${v.t.toFixed(1)} s`).join(', ')}`);
      console.log(`      overlapping pairs: ${overlaps.length ? overlaps.map(([k, v]) => `${k} by up to ${(-v.gap * 100).toFixed(1)} cm, ${v.overlapS.toFixed(1)} s in total`).join(', ') : 'none'}`);
      const drone = pairs.filter(([k]) => k.includes('UAV'));
      console.log(`      drone: closest ${drone.length ? `${drone[0][0]} ${(drone[0][1].gap * 100).toFixed(1)} cm` : '-'}`);
      console.log(`      longest time without moving 5 cm (not docked or on standby): ${Object.entries(still).map(([id, s]) => `${id} ${s.longest.toFixed(1)} s`).join(', ')}`);
      await ctx.close();
    }
    // Forced head-on meetings in the classroom's narrow gaps. The two robots start at opposite
    // ends of a gap and each must reach the other end; everyone else is sent far away.
    const MEETINGS = [
      { name: 'AMR-01 vs AMR-02 in the 0.6 m left-wall gap', a: 'AMR-01', b: 'AMR-02', x: -2.5, others: { 'AMR-03': [[2.2, 1.2], [2.2, 0.9]], 'HUM-01': [[1.0, -1.3], [1.6, -1.3]] } },
      { name: 'AMR-01 vs G1 in the 0.7 m right-wall gap', a: 'AMR-01', b: 'HUM-01', x: 2.45, others: { 'AMR-02': [[-2.3, 1.2], [-1.6, 1.2]], 'AMR-03': [[-2.3, -1.3], [-1.6, -1.3]] } }
    ];
    for (const m of MEETINGS) {
      const ctx = await browser.createBrowserContext();
      const page = await ctx.newPage();
      await page.evaluateOnNewDocument(() => localStorage.setItem('active_scan', 'robotics_lab.glb'));
      await page.goto(server.url, { waitUntil: 'networkidle2', timeout: 60000 });
      await sleep(1000);
      await page.evaluate(m => {
        const route = (id, pts) => {
          const r = window.robotDefs.find(d => d.id === id);
          r.position.set(pts[pts.length - 1][0], r.position.y, pts[pts.length - 1][1]);
          r.waypoints = pts.map(([x, z]) => new window.THREE.Vector3(x, 0.05, z));
          window.activateAndHideWaypoints(id);
        };
        for (const [id, pts] of Object.entries(m.others)) route(id, pts);
        route(m.a, [[m.x, 0.9], [m.x, -1.3]]); // starts south, heads north first
        route(m.b, [[m.x, -1.3], [m.x, 0.9]]); // starts north, heads south first
        window.openRoverDashboard(m.a === 'HUM-01' || m.b === 'HUM-01' ? m.a : m.b); // so a rover chat is on screen
      }, m);
      let minGap = Infinity;
      const reached = { [m.a]: null, [m.b]: null };
      const start = Date.now();
      while (Date.now() - start < 40000 && (reached[m.a] === null || reached[m.b] === null)) {
        const rs = await page.evaluate(ids => ids.map(id => { const r = window.robotDefs.find(d => d.id === id); return { id, type: r.type, x: r.position.x, y: r.position.y, z: r.position.z, heading: r.heading, wp: r.waypointIdx }; }), [m.a, m.b]);
        minGap = Math.min(minGap, bodyGap(rs[0], rs[1]));
        for (const r of rs) if (reached[r.id] === null && r.wp === 1) reached[r.id] = (Date.now() - start) / 1000;
        await sleep(100);
      }
      const chat = await page.evaluate(() => [...document.querySelectorAll('#rover-dashboard-modal *, #g1-dashboard-modal *')]
        .filter(el => el.children.length === 0 && /Giving way|occupied by/.test(el.textContent)).map(el => el.textContent.trim()));
      const ok = minGap >= 0 && reached[m.a] !== null && reached[m.b] !== null;
      if (!ok) failed = true;
      console.log(`${ok ? 'PASS' : 'FAIL'}  head-on: ${m.name}`);
      console.log(`      closest body gap ${(minGap * 100).toFixed(1)} cm; ${m.a} reached the far end ${reached[m.a] === null ? 'NEVER' : `after ${reached[m.a].toFixed(1)} s`}, ${m.b} ${reached[m.b] === null ? 'NEVER' : `after ${reached[m.b].toFixed(1)} s`}`);
      console.log(`      chat: ${chat.length ? [...new Set(chat)].join(' / ') : '(no give-way message on the open dashboard)'}`);
      await ctx.close();
    }
  } finally {
    await browser.close();
    await server.stop();
  }
  console.log(failed ? '\nSEPARATION CHECK FAILED' : '\nSEPARATION CHECK PASSED');
  process.exit(failed ? 1 : 0);
})().catch(err => { console.error('SEPARATION CHECK CRASHED:', err); process.exit(1); });
