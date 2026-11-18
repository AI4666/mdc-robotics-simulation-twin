const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

const { AStarPlanner } = require('./shared/astar.js');
const { LAB_BOUNDS } = require('./shared/lab_map.js');
const { planningObstacles } = require('./shared/zones.js');
const { clampClearance } = require('./shared/robots.js');
const { TransitPredictor } = require('./ai/transit_predictor.js');
const { CSPScheduler, DEFAULT_SAMPLE_JOBS } = require('./ai/csp_scheduler.js');
const { WorldModel } = require('./world_model.js');
const { createEnvelopeFactory, createAck, needsAck, createSeenIds } = require('./shared/protocol.js');
const { createOutbox } = require('./shared/outbox.js');
const { StateAggregator } = require('./ai/state_aggregator.js');

const astarPlanner = new AStarPlanner({ bounds: LAB_BOUNDS });
const cspScheduler = new CSPScheduler();
const world = new WorldModel();
const envelope = createEnvelopeFactory('s');
const outboxes = new Map(); // WebSocket -> its outbox
// Reliable and critical client message ids already handled, across reconnects.
const seenClientIds = createSeenIds();
// WORLD_STATE to every client at 5 Hz (deltas plus periodic snapshots, section 5.3).
const aggregator = new StateAggregator(world);
setInterval(() => aggregator.tick(), aggregator.intervalMs);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});
app.use(express.static(path.join(__dirname, 'public'), { etag: false, maxAge: 0 }));
app.use('/three', express.static(path.join(__dirname, 'node_modules', 'three')));
app.use('/ai', express.static(path.join(__dirname, 'ai')));
app.use('/shared', express.static(path.join(__dirname, 'shared')));

// Broadcast helper: one message, queued in every client's outbox
function broadcast(type, data) {
  const msg = envelope(type, data);
  outboxes.forEach(outbox => outbox.send(msg));
}

// REST API for AnyLogic or external integration
app.get('/api/robots', (req, res) => {
  res.json({ robots: world.getRobots() });
});

app.get('/api/stations', (req, res) => {
  res.json({ stations: world.getStations(req.query.scan), scan: req.query.scan || world.getActiveScan() });
});

// AnyLogic can POST agent coordinates here directly
app.post('/api/anylogic/update', (req, res) => {
  const { robots, source } = req.body;
  if (Array.isArray(robots)) {
    world.mergeRobots(robots);
    broadcast('ROBOT_UPDATE', { robots: world.getRobots(), source: source || 'AnyLogic' });
    aggregator.tick();
  }
  res.json({ success: true, count: world.getRobots().length });
});

// Sample jobs from benchmark dataset (JOB-101 to JOB-105)
app.get('/api/schedule/sample', (req, res) => {
  res.json({ jobs: DEFAULT_SAMPLE_JOBS });
});

// Each request is planned on its own: within the request's bounds (or the classroom's), around
// the furniture of the request's scan (the request's own edited list when it sends one, otherwise
// the scan's defaults; the classroom when it names none) plus any keep-out boxes the request adds
// (the user's zones on that scan). See shared/zones.js. Routes keep the request's clearance from boxes and
// walls (room for its robots at that scan's size, shared/robots.js), or the minimum when it sends none.

// A* grid path planning endpoint
app.post('/api/plan/astar', (req, res) => {
  const { start, goal, dynamicObstacles, bounds, scan, furniture, clearance } = req.body || {};
  if (!start || !goal) {
    return res.status(400).json({ error: 'Start and goal coordinates required.' });
  }
  astarPlanner.setBounds(bounds || LAB_BOUNDS);
  astarPlanner.safetyMargin = clampClearance(clearance);
  const result = astarPlanner.findPath(start, goal, planningObstacles(scan, dynamicObstacles, furniture));
  res.json(result);
});

// Supervised ML transit latency prediction endpoint
app.post('/api/ml/predict-transit', (req, res) => {
  const params = req.body || {};
  const prediction = TransitPredictor.predict(params);
  res.json(prediction);
});

// CSP Fleet Scheduling with dynamic ML transit buffers
app.post('/api/schedule/jobs', (req, res) => {
  const { jobs, weather_condition, pedestrian_traffic_index, dynamicObstacles, bounds, scan, furniture, clearance } = req.body || {};
  const missionJobs = (Array.isArray(jobs) && jobs.length > 0) ? jobs : DEFAULT_SAMPLE_JOBS;
  const weather = weather_condition || 'Clear';
  const traffic = (pedestrian_traffic_index !== undefined) ? pedestrian_traffic_index : 0.48;

  astarPlanner.setBounds(bounds || LAB_BOUNDS);
  astarPlanner.safetyMargin = clampClearance(clearance);
  const obstacles = planningObstacles(scan, dynamicObstacles, furniture);

  // Calculate A* path and ML predictions for each job
  const mlPredictions = {};
  const jobRoutes = {};

  missionJobs.forEach(job => {
    const startCoord = world.getStation(job.start_station) || { x: -2.0, z: -1.0 };
    const goalCoord = world.getStation(job.goal_station) || { x: 2.0, z: 1.0 };
    
    const route = astarPlanner.findPath(startCoord, goalCoord, obstacles);
    jobRoutes[job.id] = route;
    // No route: no ETA. The predictor would treat it as a zero-length trip.
    if (!route.success) return;

    const pred = TransitPredictor.predict({
      astar_path_len: route.astar_path_len,
      num_turns: route.num_turns,
      manhattan_dist: route.manhattan_dist,
      detour_ratio: route.detour_ratio,
      payload_weight_kg: job.payload_weight_kg || 4.5,
      pedestrian_traffic_index: traffic,
      weather_condition: weather,
      robot_model: job.robot_id
    });

    mlPredictions[job.id] = pred;
  });

  const scheduleResult = cspScheduler.scheduleFleet(missionJobs, mlPredictions);
  (scheduleResult.masterSchedule || []).forEach(item => {
    item.route_status = jobRoutes[item.job_id] && jobRoutes[item.job_id].success ? 'ok' : 'no_route';
  });
  res.json({
    ...scheduleResult,
    jobRoutes,
    weather,
    pedestrian_traffic_index: traffic
  });
});

// Shadow mode: the browser runs the simulation and reports it; the world model mirrors one tab.
// The first tab to send telemetry owns it until it disconnects; other tabs are ignored, so two
// open tabs (two separate simulations) can't overwrite each other.
let telemetryOwner = null;

function handleTelemetry(ws, data) {
  if (!telemetryOwner) {
    telemetryOwner = ws;
    console.log('[Telemetry] A browser tab is now the simulation source for the world model');
  }
  // Never broadcast: browsers apply ROBOT_UPDATE to their robots, which would echo back.
  if (telemetryOwner === ws) world.applyTelemetry(data, Date.now());
}

function handleClientMessage(ws, parsed) {
  if (parsed.type === 'ROBOT_TELEMETRY') {
    handleTelemetry(ws, parsed.data);
  } else if (parsed.type === 'E_STOP') {
    console.log('[E_STOP] Relaying emergency stop:', JSON.stringify(parsed.data || {}));
    broadcast('E_STOP', parsed.data || {});
  } else if (parsed.type === 'DISPATCH_TARGET') {
    broadcast('DISPATCH_TARGET', parsed.data);
  } else if (parsed.type === 'EXECUTE_SCHEDULE') {
    broadcast('EXECUTE_SCHEDULE', parsed.data);
  } else if (parsed.type === 'UPDATE_STATIONS') {
    world.updateStations((parsed.data && parsed.data.stations) || {}, (parsed.data && parsed.data.scan));
    broadcast('STATIONS_UPDATE', { stations: world.getStations(), scan: world.getActiveScan() });
    aggregator.tick();
  } else if (parsed.type === 'UPDATE_ROBOT') {
    if (world.updateRobot(parsed.data)) {
      broadcast('ROBOT_UPDATE', { robots: world.getRobots(), source: 'App' });
      aggregator.tick();
    }
  }
}

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('[WebSocket] New client connected');
  const outbox = createOutbox({
    isOpen: () => ws.readyState === WebSocket.OPEN,
    write: text => ws.send(text),
    bufferedAmount: () => ws.bufferedAmount
  }, {
    // A queued WORLD_STATE replaced by a newer one: re-send what only the old one carried.
    onReplace: (oldMsg, newMsg) => {
      if (oldMsg.type === 'WORLD_STATE') aggregator.replaced(ws, oldMsg.data, newMsg.data);
    }
  });
  outboxes.set(ws, outbox);
  outbox.send(envelope('INIT_FLEET', { robots: world.getRobots() }));
  aggregator.addClient(ws, data => outbox.send(envelope('WORLD_STATE', data)));

  ws.on('message', (message) => {
    const receivedAt = performance.now();
    try {
      const parsed = JSON.parse(message);
      if (parsed.type === 'ACK') {
        outbox.ack(parsed.data && parsed.data.id);
        return;
      }
      const ackNeeded = needsAck(parsed);
      // A reliable or critical message re-sent after a reconnect is ACKed again but handled once.
      if (!ackNeeded || !seenClientIds.has(parsed.id)) {
        if (ackNeeded) seenClientIds.add(parsed.id);
        handleClientMessage(ws, parsed);
      }
      if (ackNeeded) {
        outbox.send(createAck(envelope, parsed, receivedAt));
      }
    } catch (err) {
      console.error('[WebSocket] Message parse error:', err);
    }
  });

  ws.on('close', () => {
    outbox.close();
    outboxes.delete(ws);
    aggregator.removeClient(ws);
    if (telemetryOwner === ws) {
      telemetryOwner = null;
      console.log('[Telemetry] Simulation source disconnected; the next tab that reports takes over');
    }
    console.log('[WebSocket] Client disconnected');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`  Robotics Lab Digital Twin Server running at:`);
  console.log(`  -> http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});
