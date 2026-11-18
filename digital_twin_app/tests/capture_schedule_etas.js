// Captures the AI planner's schedule (per-job A* route metrics and ML ETAs) for a few fixed
// requests, each on a fresh server, so planner changes can be compared before and after.
//
//   node tests/capture_schedule_etas.js <out.json>                 capture
//   node tests/capture_schedule_etas.js <out.json> <before.json>   capture and print a comparison
const fs = require('node:fs');
const path = require('node:path');
const { startServer } = require('./server_harness');

const PORT = 3190;
const LAB_BOUNDS = { minX: -2.8, maxX: 2.8, minZ: -1.8, maxZ: 1.8 };
const SCENARIOS = {
  // What the browser's AI planner sends with its default settings.
  'browser default (Clear, traffic 0.48)': { weather_condition: 'Clear', pedestrian_traffic_index: 0.48, payload_weight_kg: 4.5, bounds: LAB_BOUNDS },
  'browser, Rain and heavy traffic (0.9)': { weather_condition: 'Rain', pedestrian_traffic_index: 0.9, payload_weight_kg: 4.5, bounds: LAB_BOUNDS },
  'empty request (server defaults)': {}
};

async function capture() {
  const out = {};
  for (const [name, body] of Object.entries(SCENARIOS)) {
    const server = await startServer(PORT);
    try {
      const res = await fetch(`${server.url}/api/schedule/jobs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      out[name] = data.masterSchedule.map(job => {
        const route = data.jobRoutes[job.job_id] || {};
        const ml = job.ml_prediction || {};
        return {
          job_id: job.job_id,
          robot_id: job.robot_id,
          route: `${job.start_station} -> ${job.goal_station}`,
          time_slot: job.time_slot,
          astar_path_len: route.astar_path_len,
          manhattan_dist: route.manhattan_dist,
          num_turns: route.num_turns,
          detour_ratio: route.detour_ratio,
          waypoints: route.waypoints ? route.waypoints.length : 0,
          eta_min: ml.predicted_delivery_time_min,
          buffer_min: ml.recommended_buffer_min,
          energy_wh: ml.predicted_energy_wh
        };
      });
    } finally {
      await server.stop();
    }
  }
  return out;
}

function compare(before, after) {
  for (const name of Object.keys(after)) {
    console.log(`\n${name}`);
    console.log('job      robot   route                     slot      path len        turns     detour          ETA min           buffer min');
    for (const a of after[name]) {
      const b = (before[name] || []).find(x => x.job_id === a.job_id) || {};
      const pair = (x, y, w) => `${x}`.padStart(w) + ' -> ' + `${y}`.padEnd(w);
      console.log(`${a.job_id}  ${a.robot_id.padEnd(6)}  ${a.route.padEnd(24)}  ${pair(b.time_slot, a.time_slot, 5)} ${pair(b.astar_path_len, a.astar_path_len, 5)} ${pair(b.num_turns, a.num_turns, 3)} ${pair(b.detour_ratio, a.detour_ratio, 5)} ${pair(b.eta_min, a.eta_min, 6)} ${pair(b.buffer_min, a.buffer_min, 6)}`);
    }
  }
}

(async () => {
  const [outFile, beforeFile] = process.argv.slice(2);
  if (!outFile) throw new Error('usage: node tests/capture_schedule_etas.js <out.json> [before.json]');
  const result = await capture();
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2) + '\n');
  console.log(`Wrote ${outFile}`);
  if (beforeFile) compare(JSON.parse(fs.readFileSync(beforeFile, 'utf8')), result);
})().catch(err => { console.error(err); process.exit(1); });
