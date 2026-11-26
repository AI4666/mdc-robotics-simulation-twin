/**
 * world_model.js — Server-side world model
 *
 * Single place that holds the robot fleet and lab station state on the server.
 * The REST API, the WebSocket handler and the planners read and write through it.
 * In this phase the browser still runs the simulation; this model mirrors it.
 */

// Initial state of robots in the simulation (full 10-robot campus fleet: 6 AMRs, 3 UAVs, 1 G1)
const INITIAL_ROBOTS = [
  { id: 'AMR-01', name: 'Inspector Alpha', type: 'amr', x: -1.50, y: 0.05, z: -1.35, heading: 0, status: 'Docked at Bay 1 (Standby)', battery: 100, speed: 0.0, homeDockKey: 'dock1' },
  { id: 'AMR-02', name: 'Logistics Beta', type: 'amr', x: -0.90, y: 0.05, z: -1.35, heading: 0, status: 'Docked at Bay 2 (Standby)', battery: 100, speed: 0.0, homeDockKey: 'dock2' },
  { id: 'AMR-03', name: 'Courier Gamma', type: 'amr', x: 0.90, y: 0.05, z: -1.35, heading: 0, status: 'Docked at Bay 3 (Standby)', battery: 100, speed: 0.0, homeDockKey: 'dock3' },
  { id: 'AMR-04', name: 'Express Delta', type: 'amr', x: 1.50, y: 0.05, z: -1.35, heading: 0, status: 'Docked at Bay 4 (Standby)', battery: 100, speed: 0.0, homeDockKey: 'dock4' },
  { id: 'AMR-05', name: 'Rover Epsilon', type: 'amr', x: 1.40, y: 0.05, z: 1.25, heading: 180, status: 'Docked at Bay 5 (Standby)', battery: 100, speed: 0.0, homeDockKey: 'dock5' },
  { id: 'AMR-06', name: 'Security Zeta', type: 'amr', x: 2.20, y: 0.05, z: 1.25, heading: 180, status: 'Docked at Bay 6 (Standby)', battery: 100, speed: 0.0, homeDockKey: 'dock6' },
  { id: 'HUM-01', name: 'Unitree G1 Silver', type: 'humanoid', x: 0.0, y: 0.05, z: 0.8, heading: 0, status: 'Bipedal Walking', battery: 95, speed: 0.85 },
  { id: 'UAV-01', name: 'SkyWatcher Drone', type: 'drone', x: 0.0, y: 1.9, z: 0.0, heading: 0, status: 'In Flight / Surveillance', battery: 88, speed: 1.1 },
  { id: 'UAV-02', name: 'AeroCourier-2', type: 'drone', x: -2.55, y: 2.7, z: 1.32, heading: 45, status: 'In Flight / Surveillance', battery: 95, speed: 1.2 },
  { id: 'UAV-03', name: 'PerimeterEye-3', type: 'drone', x: 2.20, y: 3.1, z: -0.05, heading: 300, status: 'In Flight / Surveillance', battery: 92, speed: 1.15 }
];

// Defined Laboratory Stations (A, B, C, D, E) & Dedicated 6 AMR Home Docks per scan
const INITIAL_CLASSROOM_STATIONS = {
  inventory: { name: 'Station A: Parts Shelf', x: -2.3, y: 0.05, z: -1.3 },
  electronics: { name: 'Station B: Electronics Bench', x: -2.3, y: 0.05, z: 1.2 },
  testing: { name: 'Station C: Testing Table', x: 2.2, y: 0.05, z: -1.3 },
  charger: { name: 'Station D: AMR Charger Dock', x: 2.2, y: 0.05, z: 1.2 },
  helipad: { name: 'Station E: Drone Helipad', x: 0.0, y: 0.05, z: 0.0 },
  dock1: { name: 'Bay 1: AMR-01 Dock', x: -1.50, y: 0.05, z: -1.35, isDock: true, assignedRobotId: 'AMR-01', bayNumber: 1 },
  dock2: { name: 'Bay 2: AMR-02 Dock', x: -0.90, y: 0.05, z: -1.35, isDock: true, assignedRobotId: 'AMR-02', bayNumber: 2 },
  dock3: { name: 'Bay 3: AMR-03 Dock', x: 0.90, y: 0.05, z: -1.35, isDock: true, assignedRobotId: 'AMR-03', bayNumber: 3 },
  dock4: { name: 'Bay 4: AMR-04 Dock', x: 1.50, y: 0.05, z: -1.35, isDock: true, assignedRobotId: 'AMR-04', bayNumber: 4 },
  dock5: { name: 'Bay 5: AMR-05 Dock', x: 1.40, y: 0.05, z: 1.25, isDock: true, assignedRobotId: 'AMR-05', bayNumber: 5 },
  dock6: { name: 'Bay 6: AMR-06 Dock', x: 2.20, y: 0.05, z: 1.25, isDock: true, assignedRobotId: 'AMR-06', bayNumber: 6 }
};

const INITIAL_CAMPUS_OSM_STATIONS = {
  inventory: { name: 'Station A: Parts Shelf', x: 6.824, y: 0.05, z: -0.533 },
  electronics: { name: 'Station B: Electronics Bench', x: -6.422, y: 0.05, z: 7.229 },
  testing: { name: 'Station C: Testing Table', x: 5.556, y: 0.05, z: -0.839 },
  charger: { name: 'Station D: AMR Charger Dock', x: -6.378, y: 0.05, z: 7.120 },
  helipad: { name: 'Station E: Drone Helipad', x: -6.420, y: 0.05, z: 7.147 },
  dock1: { name: 'Bay 1: AMR-01 Dock', x: -4.507, y: 0.05, z: -7.496, isDock: true, assignedRobotId: 'AMR-01', bayNumber: 1 },
  dock2: { name: 'Bay 2: AMR-02 Dock', x: -4.478, y: 0.05, z: -8.413, isDock: true, assignedRobotId: 'AMR-02', bayNumber: 2 },
  dock3: { name: 'Bay 3: AMR-03 Dock', x: -7.164, y: 0.05, z: -8.540, isDock: true, assignedRobotId: 'AMR-03', bayNumber: 3 },
  dock4: { name: 'Bay 4: AMR-04 Dock', x: -7.256, y: 0.05, z: -7.631, isDock: true, assignedRobotId: 'AMR-04', bayNumber: 4 },
  dock5: { name: 'Bay 5: AMR-05 Dock', x: -6.061, y: 0.05, z: -7.644, isDock: true, assignedRobotId: 'AMR-05', bayNumber: 5 },
  dock6: { name: 'Bay 6: AMR-06 Dock', x: -5.941, y: 0.05, z: -8.512, isDock: true, assignedRobotId: 'AMR-06', bayNumber: 6 }
};

class WorldModel {
  constructor() {
    this.robots = INITIAL_ROBOTS.map(r => ({ ...r }));
    this.activeScan = 'mdc_north_campus_osm.glb';
    this.stationsByScan = {
      'robotics_lab.glb': JSON.parse(JSON.stringify(INITIAL_CLASSROOM_STATIONS)),
      'mdc_north_campus_osm.glb': JSON.parse(JSON.stringify(INITIAL_CAMPUS_OSM_STATIONS)),
      'mdc_north_campus.glb': JSON.parse(JSON.stringify(INITIAL_CAMPUS_OSM_STATIONS)),
      'scan_house.glb': JSON.parse(JSON.stringify(INITIAL_CLASSROOM_STATIONS))
    };
    this.stations = this.stationsByScan[this.activeScan];
  }

  getActiveScan() {
    return this.activeScan;
  }

  getRobots() {
    return this.robots;
  }

  getStations(scan) {
    const s = scan || this.activeScan;
    return this.stationsByScan[s] || this.stations;
  }

  getStation(key, scan) {
    const stMap = this.getStations(scan);
    return stMap[key];
  }

  /**
   * AnyLogic-style bulk update: merges fields into known robots and adds unknown ones.
   */
  mergeRobots(updates) {
    updates.forEach(updatedRobot => {
      const idx = this.robots.findIndex(r => r.id === updatedRobot.id);
      if (idx >= 0) {
        this.robots[idx] = { ...this.robots[idx], ...updatedRobot };
      } else {
        this.robots.push(updatedRobot);
      }
    });
  }

  /**
   * Merges fields into one known robot. Returns false (and changes nothing) for an unknown id.
   */
  updateRobot(update) {
    const idx = this.robots.findIndex(r => r.id === update.id);
    if (idx < 0) return false;
    this.robots[idx] = { ...this.robots[idx], ...update };
    return true;
  }

  /**
   * Shadow copy of one robot as the browser simulation reports it (ROBOT_TELEMETRY).
   * Non-numeric values are ignored. Returns false (and changes nothing) for an unknown id.
   */
  applyTelemetry(data, receivedAt) {
    const robot = data && this.robots.find(r => r.id === data.robotId);
    if (!robot) return false;
    ['x', 'y', 'z', 'heading', 'speed', 'battery'].forEach(field => {
      if (Number.isFinite(data[field])) robot[field] = data[field];
    });
    if (typeof data.status === 'string') robot.status = data.status;
    robot.source = data.source || 'sim';
    robot.lastTelemetryAt = receivedAt;
    return true;
  }

  /**
   * Moves known stations for the target scan. Unknown station keys and non-numeric coordinates are ignored.
   */
  updateStations(incoming, scan) {
    const targetScan = scan || this.activeScan;
    if (scan) this.activeScan = scan;
    if (!this.stationsByScan[targetScan]) {
      this.stationsByScan[targetScan] = JSON.parse(JSON.stringify(INITIAL_CAMPUS_OSM_STATIONS));
    }
    const targetStations = this.stationsByScan[targetScan];
    Object.keys(incoming).forEach(key => {
      const st = incoming[key];
      if (!targetStations[key] || !st) return;
      ['x', 'y', 'z'].forEach(axis => {
        if (Number.isFinite(st[axis])) targetStations[key][axis] = st[axis];
      });
    });
    this.stations = targetStations;
  }
}

module.exports = { WorldModel };
