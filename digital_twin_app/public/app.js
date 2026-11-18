import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AStarPlanner, isPointInPolygonObstacle, segmentHitsPolygon, resolvePolygonCollision, rayHitsPolygon } from '/shared/astar.js';
import { ZONES_KEY, LEGACY_ZONES_KEY, loadZones, replaceScanZones, obstaclesForScan, furnitureForScan, nextZoneName, newZoneId, furnitureEditsKey, parseFurnitureEdits, furnitureEditsFrom, hasFurnitureEdits } from '/shared/zones.js';
import { CALIBRATION_DEFAULTS, calibrationKey, loadCalibration, ribbonsKey, ribbonsVisible, measureMetersPerUnit, withMetersPerUnit } from '/shared/scan_settings.js';
import { footprint, speedFactor, deadlockWait, SEPARATION } from '/shared/separation.js';
import { modelScale, bodySize, plannerClearance } from '/shared/robots.js';
import { createDroneMesh, createUnitreeG1Mesh, createRobotMesh } from './meshes.js';
import { connect, isOpen, send } from './net.js';
import { createWorldStateMirror } from '/shared/world_state.js';
import { MDC_NORTH_CAMPUS_DESTINATIONS } from '/shared/lab_map.js';
import { CampusPedestrianSwarm } from './pedestrians.js';
import { CampusLogisticsDispatcher } from './parcels.js?v=131';

// ==========================================
// GLOBAL STATE & CALIBRATION
// ==========================================
let scene, camera, renderer, controls;
let mainLight, fillLight, hemiLight, labBlue, labCyan;
let labModel = null;
let activeScan = (() => {
  try {
    const s = localStorage.getItem('active_scan');
    if (s) return s;
  } catch (e) {}
  return 'mdc_north_campus_osm.glb';
})();
let pedestrianSwarm = null;
let logisticsDispatcher = null;
let buildingLabelsVisible = true;
let campusLakeWaterMesh = null;
let simRunning = true;
let selectedRobotId = 'AMR-01';
let activeRoverId = 'AMR-01';
let cameraMode = 'orbit'; // 'orbit', 'top', 'fpv'
let isObserverMode = false; // Spectator view-only mode
let raycaster, mouse;
let targetBeacon = null;
let cardUpdateTimer = 0;
const clock = new THREE.Clock();

// Client-Side AI A* Planner & 3D LiDAR Visualizer
const localAStar = new AStarPlanner();
let lidarBeamsVisible = true;
let lidarVisualizerGroup = null;
const detourRibbons = {}; // robotId -> THREE.Group

// Interactive Boundary Placement & Resizing
let isAddingBoundaryMode = false;
let scanMeasure = null; // measuring the scan in Scale & Align: { points, group, bannerHTML }
let boundaryGhostMesh = null;
let ghostLabelSprite = null;
let selectedObstacleIdx = null;
let pendingZoneSize = { width: 1.20, depth: 0.80, height: 0.85, rotY: 0 };

// Interactive Boundary Drag & Drop
let isDraggingObstacle = false;
let draggedObstacleIdx = null;
let isDraggingStation = false;
let draggedStationKey = null;
let isDraggingWaypoint = false;
let draggedWaypointIdx = null;
let draggedWaypointRobotId = null;
const stationMeshes = {};
const dragOffset = new THREE.Vector2();
const obstacleMeshes = [];

// Dedicated 3D Groups for Stations & Waypoints (Always visible across all scans)
let stationsGroup = null;
let waypointsGroup = null;
let campusBuildingVisualsGroup = null;
let isDraggingBuilding = false;
let draggedBuildingId = null;
let draggedBuildingPart = null; // 'bay' or 'label'
let isDraggingDepot = false;
let campusDestinations = [];
const stationHighlightRipples = [];
let pendingStationPlacementKey = null;
let cameraAnim = null;

// AI & ML Fleet Optimization (A* Search & CSP Planner)
let astarRibbonGroup = null;
let currentAIWeather = 'Clear';
let currentAITraffic = 0.48;
let currentAIPayload = 4.5;
let cachedScheduleData = null;

const readStorage = key => { try { return localStorage.getItem(key); } catch (e) { return null; } };

// Scale & Align calibration (boundary size, scan mesh alignment, meters per app unit) of the active scan.
// Each scan has its own (shared/scan_settings.js); changes not saved yet are kept per scan until
// the page is reloaded, so switching scans neither carries them over nor loses them.
const calibrationByScan = {};
function calibrationForScan(scan) {
  if (!calibrationByScan[scan]) calibrationByScan[scan] = loadCalibration(scan, readStorage).calibration;
  return calibrationByScan[scan];
}
let calibration = calibrationForScan(activeScan);

function saveCalibration() {
  try {
    localStorage.setItem(calibrationKey(activeScan), JSON.stringify(calibration));
  } catch (e) { }
}

// Boundaries & Stations
let boundariesVisible = true;
let boundaryGroup = null;
let boundaryWallsGroup = null;

// The user's keep-out zones on every scan, each tagged with its scan (shared/zones.js). Zones
// saved before zones had a scan are moved to the classroom; that old list is left in the browser,
// untouched, as a backup. Exact duplicates are dropped on load, and every zone has an id and a name
// of its own on its scan.
let allCustomZones = [];
function loadSavedCustomZones() {
  try {
    const { zones, migrated, cleaned } = loadZones(localStorage.getItem(ZONES_KEY), localStorage.getItem(LEGACY_ZONES_KEY));
    allCustomZones = zones;
    if (migrated || cleaned) localStorage.setItem(ZONES_KEY, JSON.stringify(allCustomZones));
  } catch (e) { }
}
loadSavedCustomZones();

// Obstacle keep-out boxes of the active scan only: its furniture (the classroom tables, with the
// user's saved edits to them) plus the zones drawn on it. Rebuilt in place (window.obstacleBoxes
// stays the same array) whenever the scan changes; everything that keeps robots out of boxes reads
// this list.
const loadFurnitureEdits = scan => parseFurnitureEdits(readStorage(furnitureEditsKey(scan)));
let obstacleBoxes = obstaclesForScan(activeScan, allCustomZones, loadFurnitureEdits(activeScan));

// Transforms local 3D scan coordinates (x, z) by the active scan's Scale & Align calibration
// (meshScale, meshRotY, meshOffsetX, meshOffsetZ) so hardcoded 3D building polygons, water features,
// and sidewalk networks stay 100% locked to the visual 3D mesh even when rotated or scaled.
function transformPointByCalibration(x, z) {
  const s = Number.isFinite(calibration.meshScale) ? calibration.meshScale : 1.0;
  const rad = THREE.MathUtils.degToRad(calibration.meshRotY || 0);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const tx = s * (x * cos + z * sin) + (calibration.meshOffsetX || 0);
  const tz = s * (-x * sin + z * cos) + (calibration.meshOffsetZ || 0);
  return [tx, tz];
}

function syncCampusGeometryTransform() {
  const s = Number.isFinite(calibration.meshScale) ? calibration.meshScale : 1.0;
  for (const ob of obstacleBoxes) {
    if (!ob || (!ob.permanentSolid && !ob.isWalkwayNetwork)) continue;

    if (Array.isArray(ob.pts) && !ob._basePts) {
      ob._basePts = ob.pts.map(p => [p[0], p[1]]);
    }
    if (Array.isArray(ob.polylines) && !ob._basePolylines) {
      ob._basePolylines = ob.polylines.map(line => line.map(p => [p[0], p[1]]));
      ob._baseWidth = ob.width || 0.24;
    }

    if (ob._basePts) {
      ob.pts = ob._basePts.map(([px, pz]) => transformPointByCalibration(px, pz));
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const [tx, tz] of ob.pts) {
        if (tx < minX) minX = tx;
        if (tx > maxX) maxX = tx;
        if (tz < minZ) minZ = tz;
        if (tz > maxZ) maxZ = tz;
      }
      ob.minX = minX;
      ob.maxX = maxX;
      ob.minZ = minZ;
      ob.maxZ = maxZ;
    }

    if (ob._basePolylines) {
      ob.polylines = ob._basePolylines.map(line => line.map(([px, pz]) => transformPointByCalibration(px, pz)));
      ob.width = (ob._baseWidth || 0.24) * s;
    }
  }
}

function applyScanObstacles() {
  obstacleBoxes.splice(0, obstacleBoxes.length, ...obstaclesForScan(activeScan, allCustomZones, loadFurnitureEdits(activeScan)));
  syncCampusGeometryTransform();
  updateRestoreDefaultsUI();
}
syncCampusGeometryTransform();

// The active scan's furniture edits as they are now: what differs from the code's defaults.
function currentFurnitureEdits() {
  return furnitureEditsFrom(furnitureForScan(activeScan), obstacleBoxes.filter(b => !b.userCreated));
}

// Saves the active scan's furniture edits (moved, resized, rotated or deleted built-in boxes); with
// none left, the scan's saved edits are removed.
function saveFurnitureEdits() {
  const edits = currentFurnitureEdits();
  try {
    if (hasFurnitureEdits(edits)) localStorage.setItem(furnitureEditsKey(activeScan), JSON.stringify(edits));
    else localStorage.removeItem(furnitureEditsKey(activeScan));
  } catch (e) { }
  replanAllLegs();
  invalidateFleetSchedule();
  updateRestoreDefaultsUI();
}

// Saves an edited box: a zone with the zones, a built-in box with the furniture edits.
function saveObstacleEdit(ob) {
  if (ob.userCreated) saveCustomZones();
  else saveFurnitureEdits();
}

// "Restore Default Tables" is offered while the active scan's furniture differs from the defaults.
function updateRestoreDefaultsUI() {
  const restoreCont = document.getElementById('restore-defaults-container');
  if (restoreCont) restoreCont.style.display = hasFurnitureEdits(currentFurnitureEdits()) ? 'block' : 'none';
}

// Defined Lab Stations
const labStations = {
  inventory: {
    name: 'Station A: Parts Shelf',
    desc: 'Component inventory & hardware bin',
    pos: new THREE.Vector3(-2.3, 0.05, -1.3),
    color: 0x38bdf8
  },
  electronics: {
    name: 'Station B: Electronics Bench',
    desc: 'PCB soldering & wiring workbench',
    pos: new THREE.Vector3(-2.3, 0.05, 1.2),
    color: 0x10b981
  },
  testing: {
    name: 'Station C: Testing Table',
    desc: 'System testing & sensor calibration',
    pos: new THREE.Vector3(2.2, 0.05, -1.3),
    color: 0xa855f7
  },
  charger: {
    name: 'Station D: AMR Charger Dock',
    desc: 'Automatic inductive charging pad',
    pos: new THREE.Vector3(2.2, 0.05, 1.2),
    color: 0xfacc15
  },
  helipad: {
    name: 'Station E: Drone Helipad',
    desc: 'Autonomous UAV take-off & landing zone',
    pos: new THREE.Vector3(0.0, 0.05, 0.0),
    color: 0xf97316
  },
  // Dedicated 6 AMR Home Docks (100% Draggable in 3D across the room)
  dock1: {
    name: 'Bay 1: AMR-01 Dock',
    desc: 'Dedicated home charging dock for Inspector Alpha (AMR-01)',
    pos: new THREE.Vector3(-1.50, 0.05, -1.35),
    color: 0x38bdf8,
    isDock: true,
    assignedRobotId: 'AMR-01',
    bayNumber: 1
  },
  dock2: {
    name: 'Bay 2: AMR-02 Dock',
    desc: 'Dedicated home charging dock for Logistics Beta (AMR-02)',
    pos: new THREE.Vector3(-0.90, 0.05, -1.35),
    color: 0x4ade80,
    isDock: true,
    assignedRobotId: 'AMR-02',
    bayNumber: 2
  },
  dock3: {
    name: 'Bay 3: AMR-03 Dock',
    desc: 'Dedicated home charging dock for Courier Gamma (AMR-03)',
    pos: new THREE.Vector3(0.90, 0.05, -1.35),
    color: 0xfacc15,
    isDock: true,
    assignedRobotId: 'AMR-03',
    bayNumber: 3
  },
  dock4: {
    name: 'Bay 4: AMR-04 Dock',
    desc: 'Dedicated home charging dock for Express Delta (AMR-04)',
    pos: new THREE.Vector3(1.50, 0.05, -1.35),
    color: 0xc084fc,
    isDock: true,
    assignedRobotId: 'AMR-04',
    bayNumber: 4
  },
  dock5: {
    name: 'Bay 5: AMR-05 Dock',
    desc: 'Dedicated home charging dock for Rover Epsilon (AMR-05)',
    pos: new THREE.Vector3(1.40, 0.05, 1.25),
    color: 0x2dd4bf,
    isDock: true,
    assignedRobotId: 'AMR-05',
    bayNumber: 5
  },
  dock6: {
    name: 'Bay 6: AMR-06 Dock',
    desc: 'Dedicated home charging dock for Security Zeta (AMR-06)',
    pos: new THREE.Vector3(2.20, 0.05, 1.25),
    color: 0xf87171,
    isDock: true,
    assignedRobotId: 'AMR-06',
    bayNumber: 6
  }
};

const DEFAULT_CLASSROOM_STATION_POSITIONS = {
  inventory: { x: -2.3, y: 0.05, z: -1.3 },
  electronics: { x: -2.3, y: 0.05, z: 1.2 },
  testing: { x: 2.2, y: 0.05, z: -1.3 },
  charger: { x: 2.2, y: 0.05, z: 1.2 },
  helipad: { x: 0.0, y: 0.05, z: 0.0 },
  dock1: { x: -1.50, y: 0.05, z: -1.35 },
  dock2: { x: -0.90, y: 0.05, z: -1.35 },
  dock3: { x:  0.90, y: 0.05, z: -1.35 },
  dock4: { x:  1.50, y: 0.05, z: -1.35 },
  dock5: { x:  1.40, y: 0.05, z:  1.25 },
  dock6: { x:  2.20, y: 0.05, z:  1.25 }
};

const DEFAULT_HOUSE_STATION_POSITIONS = {
  inventory: { x: 0.8, y: 0.05, z: -2.4 },   // Patio Workshop / Shed
  electronics: { x: 3.2, y: 0.05, z: -2.0 }, // North Lawn Workbench
  testing: { x: 3.5, y: 0.05, z: 2.2 },      // East Lawn Testing Area
  charger: { x: -3.8, y: 0.05, z: 2.8 },     // Driveway Charging Pad
  helipad: { x: 2.0, y: 0.05, z: 0.2 },      // Central Backyard Helipad
  dock1: { x: -3.4, y: 0.05, z: 2.2 },
  dock2: { x: -3.8, y: 0.05, z: 2.2 },
  dock3: { x: -4.2, y: 0.05, z: 2.2 },
  dock4: { x: -3.4, y: 0.05, z: 2.6 },
  dock5: { x: -3.8, y: 0.05, z: 2.6 },
  dock6: { x: -4.2, y: 0.05, z: 2.6 }
};

const DEFAULT_CAMPUS_STATION_POSITIONS = {
  inventory: { x: -0.2, y: 0.05, z: -1.30 },   // Station A: Bldg 1000 North Receiving & Mail Hub
  electronics: { x: -3.50, y: 0.05, z: 0.40 }, // Station B: Science Complex Lab Hub (West)
  testing: { x: 2.20, y: 0.05, z: -0.05 },     // Station C: Paul R. Scott Library & Bldg 3000 (East)
  charger: { x: 0.80, y: 0.05, z: 1.32 },      // Station D: Bldg 4000 Admin & Rover Charging Depot (South)
  helipad: { x: -2.55, y: 0.05, z: 1.32 },     // Station E: Lehman Theater Lakeside Helipad (Southwest)
  dock1: { x: 0.30, y: 0.05, z: 1.30 },
  dock2: { x: 0.60, y: 0.05, z: 1.30 },
  dock3: { x: 0.90, y: 0.05, z: 1.30 },
  dock4: { x: 1.20, y: 0.05, z: 1.30 },
  dock5: { x: 1.50, y: 0.05, z: 1.30 },
  dock6: { x: 1.80, y: 0.05, z: 1.30 }
};

const DEFAULT_CAMPUS_OSM_STATION_POSITIONS = {
  inventory: { x: -0.2, y: 0.05, z: -1.30 },   // Station A: Bldg 1000 North Receiving & Mail Hub
  electronics: { x: -3.50, y: 0.05, z: 0.40 }, // Station B: Science Complex Lab Hub (West)
  testing: { x: 2.20, y: 0.05, z: -0.05 },     // Station C: Paul R. Scott Library & Bldg 3000 (East)
  charger: { x: 0.80, y: 0.05, z: 1.32 },      // Station D: Bldg 4000 Admin & Rover Charging Depot (South)
  helipad: { x: -2.55, y: 0.05, z: 1.32 },     // Station E: Lehman Theater Lakeside Helipad (Southwest)
  dock1: { x: 0.30, y: 0.05, z: 1.30 },
  dock2: { x: 0.60, y: 0.05, z: 1.30 },
  dock3: { x: 0.90, y: 0.05, z: 1.30 },
  dock4: { x: 1.20, y: 0.05, z: 1.30 },
  dock5: { x: 1.50, y: 0.05, z: 1.30 },
  dock6: { x: 1.80, y: 0.05, z: 1.30 }
};

function isCampusScan(scan) {
  return scan === 'mdc_north_campus.glb' || scan === 'mdc_north_campus_osm.glb';
}

function getDefaultStationPositions() {
  if (activeScan === 'mdc_north_campus_osm.glb') return DEFAULT_CAMPUS_OSM_STATION_POSITIONS;
  if (activeScan === 'mdc_north_campus.glb') return DEFAULT_CAMPUS_STATION_POSITIONS;
  return activeScan === 'scan_house.glb' ? DEFAULT_HOUSE_STATION_POSITIONS : DEFAULT_CLASSROOM_STATION_POSITIONS;
}

// The one set of limits for the active scan: the boundary walls are drawn here, robots are
// clamped inside it, the planners use it, and keep-out zones are dragged within it.
function getEnvironmentLimits() {
  const halfW = calibration.boundWidth ? (calibration.boundWidth / 2) : 12.0;
  const halfD = calibration.boundDepth ? (calibration.boundDepth / 2) : 12.0;

  if (activeScan === 'scan_house.glb' || activeScan === 'scan_secondary.glb' || isCampusScan(activeScan)) {
    return {
      minX: -Math.max(halfW, 8.5),
      maxX: Math.max(halfW, 8.5),
      minZ: -Math.max(halfD, 7.5),
      maxZ: Math.max(halfD, 7.5)
    };
  }

  // Classroom Robotics Lab: Floor navigation scales dynamically with perimeter boundaries
  return {
    minX: -halfW,
    maxX: halfW,
    minZ: -halfD,
    maxZ: halfD
  };
}

function saveCustomStationPositions() {
  try {
    const data = {};
    Object.keys(labStations).forEach(k => {
      data[k] = {
        x: parseFloat(labStations[k].pos.x.toFixed(3)),
        y: parseFloat(labStations[k].pos.y.toFixed(3)),
        z: parseFloat(labStations[k].pos.z.toFixed(3))
      };
    });
    localStorage.setItem(`custom_station_positions_${activeScan}`, JSON.stringify(data));
  } catch (e) { }
  syncStationsToServer();
}

// Push current station coordinates to the server so /api/stations and
// server-side A* / CSP scheduling use the same positions the user sees.
function syncStationsToServer() {
  if (!isOpen()) return;
  try {
    const stations = {};
    Object.keys(labStations).forEach(k => {
      const p = labStations[k] && labStations[k].pos;
      if (p) stations[k] = { x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3) };
    });
    send('UPDATE_STATIONS', { stations, scan: activeScan });
  } catch (e) { }
}

function loadSavedStationPositions() {
  try {
    const defaults = getDefaultStationPositions();
    Object.keys(defaults).forEach(k => {
      if (labStations[k]) {
        labStations[k].pos.set(defaults[k].x, defaults[k].y || 0.05, defaults[k].z);
      }
    });

    const key = `custom_station_positions_${activeScan}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      const data = JSON.parse(raw);
      Object.keys(data).forEach(k => {
        if (labStations[k] && data[k]) {
          labStations[k].pos.set(data[k].x, data[k].y || 0.05, data[k].z);
        }
      });
    }
  } catch (e) { }
}
loadSavedStationPositions();

// Station Removal & Visibility Management
let stationVisibility = {
  inventory: true,
  electronics: true,
  testing: true,
  charger: true,
  helipad: true
};

function loadStationVisibility() {
  stationVisibility = { inventory: true, electronics: true, testing: true, charger: true, helipad: true };
  try {
    const raw = localStorage.getItem(`station_visibility_${activeScan}`);
    if (raw) {
      stationVisibility = { ...stationVisibility, ...JSON.parse(raw) };
    }
  } catch (e) { }
}

function saveStationVisibility() {
  try {
    localStorage.setItem(`station_visibility_${activeScan}`, JSON.stringify(stationVisibility));
  } catch (e) { }
}
loadStationVisibility();

function resetStationPositions() {
  localStorage.removeItem(`custom_station_positions_${activeScan}`);
  localStorage.removeItem('custom_station_positions');
  const defaults = getDefaultStationPositions();
  Object.keys(defaults).forEach(k => {
    const def = defaults[k];
    if (labStations[k]) {
      labStations[k].pos.set(def.x, def.y, def.z);
    }
  });
  syncStationsToServer();
  buildBoundariesAndStations();
  const envName = isCampusScan(activeScan) ? (activeScan === 'mdc_north_campus_osm.glb' ? 'MDC North Campus (OSM CAD)' : 'MDC North Campus') : (activeScan === 'scan_house.glb' ? 'House & Yard' : 'Classroom');
  const banner = document.querySelector('.dispatch-banner');
  if (banner) {
    banner.innerHTML = `<span>📍 <b>Stations A, B, C, D, E restored</b> to original default ${envName} locations.</span>`;
    setTimeout(() => {
      banner.innerHTML = `<span>🎯 <b>Interactive Dispatch Mode</b>: Click any point on the floor to route <span id="dispatch-target-name" style="color: #38bdf8;">${selectedRobotId}</span></span>`;
    }, 3500);
  }
}

// Robot Fleet Definitions (Expanded 10-Agent Autonomous Campus Fleet)
const robotDefs = [
  {
    id: 'AMR-01',
    name: 'Inspector Alpha',
    type: 'amr',
    color: 0x38bdf8,
    mesh: null,
    position: new THREE.Vector3(-1.50, 0.05, -1.35),
    target: new THREE.Vector3(-1.50, 0.05, -1.35),
    heading: 0,
    speed: 0.0,
    status: 'Docked at Bay 1 (Standby)',
    battery: 100,
    homeDockKey: 'dock1',
    lidar: null,
    lidarActive: true,
    wheels: [],
    statusLight: null,
    enabled: true,
    waypoints: [
      new THREE.Vector3(-2.3, 0.05, -1.3),
      new THREE.Vector3(2.2, 0.05, -1.3),
      new THREE.Vector3(2.2, 0.05, 1.2),
      new THREE.Vector3(-2.3, 0.05, 1.2)
    ],
    waypointIdx: 0
  },
  {
    id: 'AMR-02',
    name: 'Logistics Beta',
    type: 'amr',
    color: 0x4ade80,
    mesh: null,
    position: new THREE.Vector3(-0.90, 0.05, -1.35),
    target: new THREE.Vector3(-0.90, 0.05, -1.35),
    heading: 0,
    speed: 0.0,
    status: 'Docked at Bay 2 (Standby)',
    battery: 100,
    homeDockKey: 'dock2',
    lidar: null,
    lidarActive: true,
    wheels: [],
    statusLight: null,
    enabled: true,
    waypoints: [
      new THREE.Vector3(2.2, 0.05, 1.2),
      new THREE.Vector3(0.0, 0.05, 0.0),
      new THREE.Vector3(-2.3, 0.05, -1.3),
      new THREE.Vector3(0.0, 0.05, 1.2)
    ],
    waypointIdx: 0
  },
  {
    id: 'AMR-03',
    name: 'Courier Gamma',
    type: 'amr',
    color: 0xfacc15,
    mesh: null,
    position: new THREE.Vector3(0.90, 0.05, -1.35),
    target: new THREE.Vector3(0.90, 0.05, -1.35),
    heading: 0,
    speed: 0.0,
    status: 'Docked at Bay 3 (Standby)',
    battery: 100,
    homeDockKey: 'dock3',
    lidar: null,
    lidarActive: true,
    wheels: [],
    statusLight: null,
    enabled: true,
    waypoints: [
      new THREE.Vector3(2.2, 0.05, 1.2),
      new THREE.Vector3(-2.3, 0.05, 1.2),
      new THREE.Vector3(-2.3, 0.05, -1.3),
      new THREE.Vector3(2.2, 0.05, 1.2)
    ],
    waypointIdx: 0
  },
  {
    id: 'AMR-04',
    name: 'Express Delta',
    type: 'amr',
    color: 0xf97316,
    mesh: null,
    position: new THREE.Vector3(1.50, 0.05, -1.35),
    target: new THREE.Vector3(1.50, 0.05, -1.35),
    heading: 0,
    speed: 0.0,
    status: 'Docked at Bay 4 (Standby)',
    battery: 100,
    homeDockKey: 'dock4',
    lidar: null,
    lidarActive: true,
    wheels: [],
    statusLight: null,
    enabled: true,
    waypoints: [
      new THREE.Vector3(0.80, 0.05, 1.32),
      new THREE.Vector3(2.20, 0.05, -0.05),
      new THREE.Vector3(-0.20, 0.05, -1.30),
      new THREE.Vector3(-3.50, 0.05, 0.40)
    ],
    waypointIdx: 0
  },
  {
    id: 'AMR-05',
    name: 'Rover Epsilon',
    type: 'amr',
    color: 0xf43f5e,
    mesh: null,
    position: new THREE.Vector3(1.40, 0.05, 1.25),
    target: new THREE.Vector3(1.40, 0.05, 1.25),
    heading: Math.PI,
    speed: 0.0,
    status: 'Docked at Bay 5 (Standby)',
    battery: 100,
    homeDockKey: 'dock5',
    lidar: null,
    lidarActive: true,
    wheels: [],
    statusLight: null,
    enabled: true,
    waypoints: [
      new THREE.Vector3(-3.50, 0.05, 0.40),
      new THREE.Vector3(-2.55, 0.05, 1.32),
      new THREE.Vector3(0.80, 0.05, 1.32),
      new THREE.Vector3(-0.20, 0.05, -1.30)
    ],
    waypointIdx: 0
  },
  {
    id: 'AMR-06',
    name: 'Security Zeta',
    type: 'amr',
    color: 0xa855f7,
    mesh: null,
    position: new THREE.Vector3(2.20, 0.05, 1.25),
    target: new THREE.Vector3(2.20, 0.05, 1.25),
    heading: Math.PI,
    speed: 0.0,
    status: 'Docked at Bay 6 (Standby)',
    battery: 100,
    homeDockKey: 'dock6',
    lidar: null,
    lidarActive: true,
    wheels: [],
    statusLight: null,
    enabled: true,
    waypoints: [
      new THREE.Vector3(2.20, 0.05, -0.05),
      new THREE.Vector3(2.20, 0.05, 1.32),
      new THREE.Vector3(-2.55, 0.05, 1.32),
      new THREE.Vector3(-2.55, 0.05, -1.30)
    ],
    waypointIdx: 0
  },
  {
    id: 'UAV-01',
    name: 'SkyWatcher Drone',
    type: 'drone',
    color: 0xc084fc,
    mesh: null,
    position: new THREE.Vector3(0.0, 1.9, 0.0),
    target: new THREE.Vector3(1.8, 1.9, -1.0),
    heading: 0,
    speed: 1.35,
    status: 'In Flight / Surveillance',
    battery: 89,
    hoverAltitude: 1.9,
    propellers: [],
    statusLight: null,
    enabled: true,
    waypoints: [
      new THREE.Vector3(0.0, 1.9, 0.0),
      new THREE.Vector3(2.1, 1.9, -1.2),
      new THREE.Vector3(-2.1, 1.9, -1.2),
      new THREE.Vector3(-2.1, 1.9, 1.1),
      new THREE.Vector3(2.1, 1.9, 1.1)
    ],
    waypointIdx: 0
  },
  {
    id: 'UAV-02',
    name: 'AeroCourier-2',
    type: 'drone',
    color: 0x2dd4bf,
    mesh: null,
    position: new THREE.Vector3(-2.55, 2.7, 1.32),
    target: new THREE.Vector3(2.20, 2.7, -0.05),
    heading: Math.PI / 4,
    speed: 1.5,
    status: 'In Flight / Surveillance',
    battery: 95,
    hoverAltitude: 2.7,
    propellers: [],
    statusLight: null,
    enabled: true,
    waypoints: [
      new THREE.Vector3(-2.55, 2.7, 1.32),
      new THREE.Vector3(2.20, 2.7, -0.05),
      new THREE.Vector3(-0.20, 2.8, -1.30),
      new THREE.Vector3(-3.50, 2.6, 0.40)
    ],
    waypointIdx: 0
  },
  {
    id: 'UAV-03',
    name: 'PerimeterEye-3',
    type: 'drone',
    color: 0xfbbf24,
    mesh: null,
    position: new THREE.Vector3(2.20, 3.1, -0.05),
    target: new THREE.Vector3(-0.20, 3.1, -1.30),
    heading: -Math.PI / 3,
    speed: 1.4,
    status: 'In Flight / Surveillance',
    battery: 92,
    hoverAltitude: 3.1,
    propellers: [],
    statusLight: null,
    enabled: true,
    waypoints: [
      new THREE.Vector3(2.20, 3.1, -0.05),
      new THREE.Vector3(-0.20, 3.1, -1.30),
      new THREE.Vector3(-3.50, 3.0, 0.40),
      new THREE.Vector3(0.80, 2.9, 1.32)
    ],
    waypointIdx: 0
  },
  {
    id: 'HUM-01',
    name: 'Unitree G1 Silver',
    type: 'humanoid',
    color: 0xe2e8f0,
    mesh: null,
    position: new THREE.Vector3(0.0, 0.05, 0.8),
    target: new THREE.Vector3(-2.2, 0.05, 1.1),
    heading: -Math.PI / 2,
    speed: 0.85,
    status: 'Bipedal Inspection',
    battery: 93,
    walkCycle: 0,
    leftLeg: null,
    rightLeg: null,
    leftKnee: null,
    rightKnee: null,
    leftArm: null,
    rightArm: null,
    statusLight: null,
    enabled: true,
    waypoints: [
      new THREE.Vector3(0.0, 0.05, 0.8),
      new THREE.Vector3(-2.2, 0.05, 1.1),
      new THREE.Vector3(-2.2, 0.05, -1.2),
      new THREE.Vector3(0.0, 0.05, -1.2),
      new THREE.Vector3(2.1, 0.05, -1.2),
      new THREE.Vector3(2.1, 0.05, 1.1)
    ],
    waypointIdx: 0
  }
];

let activeEditingWaypointsRobotId = null;
let isWaypointsVisible = false;

const defaultClassroomWaypoints = {
  'AMR-01': [
    new THREE.Vector3(-2.3, 0.05, -1.3),
    new THREE.Vector3(2.2, 0.05, -1.3),
    new THREE.Vector3(-2.3, 0.05, 1.2)
  ],
  'AMR-02': [
    new THREE.Vector3(0.0, 0.05, 0.0),
    new THREE.Vector3(-2.3, 0.05, -1.3),
    new THREE.Vector3(2.2, 0.05, -1.3),
    new THREE.Vector3(-2.3, 0.05, 1.2)
  ],
  'AMR-03': [
    new THREE.Vector3(2.2, 0.05, -1.3),
    new THREE.Vector3(-2.3, 0.05, 1.2),
    new THREE.Vector3(-2.3, 0.05, -1.3)
  ],
  'UAV-01': [
    new THREE.Vector3(0.0, 1.9, 0.0),
    new THREE.Vector3(2.1, 1.9, -1.2),
    new THREE.Vector3(-2.1, 1.9, -1.2),
    new THREE.Vector3(-2.1, 1.9, 1.1),
    new THREE.Vector3(2.1, 1.9, 1.1)
  ],
  'HUM-01': [
    new THREE.Vector3(0.0, 0.05, 0.8),
    new THREE.Vector3(-2.2, 0.05, 1.1),
    new THREE.Vector3(-2.2, 0.05, -1.2),
    new THREE.Vector3(0.0, 0.05, -1.2),
    new THREE.Vector3(2.1, 0.05, -1.2),
    new THREE.Vector3(2.1, 0.05, 1.1)
  ]
};

const defaultHouseWaypoints = {
  'AMR-01': [
    new THREE.Vector3(-4.5, 0.05, -3.5),
    new THREE.Vector3(4.5, 0.05, -3.5),
    new THREE.Vector3(4.5, 0.05, 3.5),
    new THREE.Vector3(-4.5, 0.05, 3.5)
  ],
  'AMR-02': [
    new THREE.Vector3(-3.0, 0.05, 2.0),
    new THREE.Vector3(3.0, 0.05, 2.0),
    new THREE.Vector3(3.0, 0.05, -2.0),
    new THREE.Vector3(-3.0, 0.05, -2.0)
  ],
  'AMR-03': [
    new THREE.Vector3(0.0, 0.05, -4.0),
    new THREE.Vector3(3.5, 0.05, 0.0),
    new THREE.Vector3(0.0, 0.05, 4.0),
    new THREE.Vector3(-3.5, 0.05, 0.0)
  ],
  'UAV-01': [
    new THREE.Vector3(0.0, 3.2, 0.0),
    new THREE.Vector3(5.0, 3.5, -4.0),
    new THREE.Vector3(-5.0, 3.5, -4.0),
    new THREE.Vector3(-5.0, 3.5, 4.0),
    new THREE.Vector3(5.0, 3.5, 4.0)
  ],
  'HUM-01': [
    new THREE.Vector3(0.0, 0.05, 1.5),
    new THREE.Vector3(-3.5, 0.05, 2.5),
    new THREE.Vector3(-3.5, 0.05, -2.5),
    new THREE.Vector3(3.5, 0.05, -2.5),
    new THREE.Vector3(3.5, 0.05, 2.5)
  ]
};

const defaultCampusWaypoints = {
  'AMR-01': [
    new THREE.Vector3(-0.20, 0.05, -1.30),
    new THREE.Vector3(2.20, 0.05, -1.30),
    new THREE.Vector3(2.20, 0.05, 1.32),
    new THREE.Vector3(-2.55, 0.05, 1.32),
    new THREE.Vector3(-2.55, 0.05, -1.30)
  ],
  'AMR-02': [
    new THREE.Vector3(-3.50, 0.05, 0.40),
    new THREE.Vector3(-2.55, 0.05, 1.32),
    new THREE.Vector3(2.20, 0.05, 1.32),
    new THREE.Vector3(2.20, 0.05, -1.30),
    new THREE.Vector3(-2.55, 0.05, -1.30)
  ],
  'AMR-03': [
    new THREE.Vector3(2.20, 0.05, 1.32),
    new THREE.Vector3(2.20, 0.05, -1.30),
    new THREE.Vector3(-0.20, 0.05, -1.30),
    new THREE.Vector3(-2.55, 0.05, -1.30),
    new THREE.Vector3(-2.55, 0.05, 1.32)
  ],
  'AMR-04': [
    new THREE.Vector3(2.20, 0.05, -0.05),
    new THREE.Vector3(-0.20, 0.05, -1.30),
    new THREE.Vector3(-3.50, 0.05, 0.40)
  ],
  'AMR-05': [
    new THREE.Vector3(-3.50, 0.05, 0.40),
    new THREE.Vector3(-2.55, 0.05, 1.32),
    new THREE.Vector3(0.80, 0.05, 1.32),
    new THREE.Vector3(-0.20, 0.05, -1.30)
  ],
  'AMR-06': [
    new THREE.Vector3(2.20, 0.05, -0.05),
    new THREE.Vector3(2.20, 0.05, 1.32),
    new THREE.Vector3(-2.55, 0.05, 1.32),
    new THREE.Vector3(-2.55, 0.05, -1.30)
  ],
  'UAV-01': [
    new THREE.Vector3(-2.55, 2.5, 1.32),
    new THREE.Vector3(-3.50, 2.7, 0.40),
    new THREE.Vector3(-0.20, 2.8, -1.30),
    new THREE.Vector3(2.20, 2.7, -0.05),
    new THREE.Vector3(0.80, 2.6, 1.32)
  ],
  'UAV-02': [
    new THREE.Vector3(-2.55, 2.7, 1.32),
    new THREE.Vector3(2.20, 2.7, -0.05),
    new THREE.Vector3(-0.20, 2.8, -1.30),
    new THREE.Vector3(-3.50, 2.6, 0.40)
  ],
  'UAV-03': [
    new THREE.Vector3(2.20, 3.1, -0.05),
    new THREE.Vector3(-0.20, 3.1, -1.30),
    new THREE.Vector3(-3.50, 3.0, 0.40),
    new THREE.Vector3(0.80, 2.9, 1.32)
  ],
  'HUM-01': [
    new THREE.Vector3(-2.55, 0.05, 1.32),
    new THREE.Vector3(-2.55, 0.05, -1.30),
    new THREE.Vector3(2.20, 0.05, -1.30),
    new THREE.Vector3(2.20, 0.05, 1.32)
  ]
};

function saveCustomWaypoints() {
  try {
    const data = {};
    robotDefs.forEach(r => {
      if (r.waypoints) {
        data[r.id] = r.waypoints.map(p => ({
          x: parseFloat(p.x.toFixed(3)),
          y: parseFloat(p.y.toFixed(3)),
          z: parseFloat(p.z.toFixed(3))
        }));
      }
    });
    localStorage.setItem(`custom_waypoints_${activeScan}`, JSON.stringify(data));
  } catch (e) { }
}

function loadSavedWaypoints() {
  try {
    const key = `custom_waypoints_${activeScan}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      const data = JSON.parse(raw);
      robotDefs.forEach(r => {
        if (data[r.id] && Array.isArray(data[r.id]) && data[r.id].length > 0) {
          r.waypoints = data[r.id].map(p => {
            if (r.type !== 'drone' && isInsideObstacle(p.x, p.z, 0.24)) {
              const safe = findNearestSafePoint(p.x, p.z);
              return new THREE.Vector3(safe.x, p.y, safe.z);
            }
            return new THREE.Vector3(p.x, p.y, p.z);
          });
          r.waypointIdx = 0;
          if (r.type !== 'amr') {
            r.position.copy(r.waypoints[0]);
            r.target.copy(r.waypoints[1 % r.waypoints.length]);
          }
        }
      });
    }
  } catch (e) { }
}

// Park all AMRs squarely inside their assigned Home Docks (Bay 1-6) on startup or environment switch
function parkAmrsAtHomeDocks() {
  robotDefs.forEach(r => {
    if (r.type !== 'amr') return;
    const dockKey = r.homeDockKey || ('dock' + (parseInt(r.id.split('-')[1]) || 1));
    const dockStation = labStations && labStations[dockKey];
    if (!dockStation) return;
    r.position.set(dockStation.pos.x, 0.05, dockStation.pos.z);
    r.target.set(dockStation.pos.x, 0.05, dockStation.pos.z);
    r.heading = (dockStation.pos.z > 0) ? Math.PI : 0;
    r.speed = 0.0;
    r.status = `Docked at Bay ${dockStation.bayNumber || 1} (Standby)`;
    r.isCharging = true;
    r.isCustomMission = false;
    r.hasArrivedMission = true;
    r.isReturningHome = false;
    r.isDetouring = false;
    r.detourWaypoints = null;
    r.plannedLegKey = null;
    r.heldBy = null;
    r.heldTime = 0;
    r.retreatTime = 0;
    r.currentOrder = null;
    if (r.parcelMesh && r.mesh) {
      r.mesh.remove(r.parcelMesh);
      r.parcelMesh = null;
    }
    clearDetourRibbon(r.id);
    if (r.mesh) {
      r.mesh.position.copy(r.position);
      r.mesh.rotation.y = r.heading;
    }
  });
}

function updateWaypointCountsUI() {
  const g1 = robotDefs.find(r => r.id === 'HUM-01');
  const g1El = document.getElementById('g1-waypoint-count');
  if (g1El && g1 && g1.waypoints) {
    g1El.textContent = `${g1.waypoints.length} Waypoints Mapped`;
  }

  const drone = robotDefs.find(r => r.id === 'UAV-01');
  const droneEl = document.getElementById('drone-waypoint-count');
  if (droneEl && drone && drone.waypoints) {
    droneEl.textContent = `${drone.waypoints.length} Flight Waypoints Mapped`;
  }

  const rId = (typeof activeRoverId !== 'undefined' && activeRoverId) ? activeRoverId : 'AMR-01';
  const rover = robotDefs.find(r => r.id === rId) || robotDefs[0];
  const roverEl = document.getElementById('rover-waypoint-count');
  if (roverEl && rover && rover.waypoints) {
    roverEl.textContent = `${rover.waypoints.length} Waypoints Mapped (${rover.id})`;
  }
}

function showAndEditWaypoints(robotId) {
  if (!robotId) robotId = selectedRobotId || 'AMR-01';
  selectedRobotId = robotId;
  activeEditingWaypointsRobotId = robotId;
  isWaypointsVisible = true;

  if (typeof closeG1Dashboard === 'function') closeG1Dashboard();
  if (typeof closeDroneDashboard === 'function') closeDroneDashboard();
  if (typeof closeRoverDashboard === 'function') closeRoverDashboard();

  buildWaypointsVisuals(robotId, true);
  updateFleetCards();
  updateWaypointCountsUI();

  const robot = robotDefs.find(r => r.id === robotId) || robotDefs[0];
  const wpCount = (robot.waypoints ? robot.waypoints.length : 0);

  const banner = document.querySelector('.dispatch-banner');
  if (banner) {
    banner.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 12px; flex-wrap: wrap;">
        <span>📍 <b>Placing Waypoints for ${robot.name} (${robot.id})</b>: Drag WP markers on the floor! (${wpCount} waypoints)</span>
        <div style="display: flex; gap: 6px; align-items: center;">
          <button id="btn-banner-activate-wp" style="background: linear-gradient(135deg, #16a34a, #22c55e); border: 1px solid #4ade80; color: white; padding: 5px 12px; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.3); transition: all 0.2s;">🚀 Activate &amp; Hide Waypoints</button>
          <button id="btn-banner-add-wp" style="background: rgba(56, 189, 248, 0.2); border: 1px solid #38bdf8; color: #38bdf8; padding: 5px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer;">➕ Add WP</button>
          <button id="btn-banner-reset-wp" style="background: rgba(148, 163, 184, 0.2); border: 1px solid #94a3b8; color: #cbd5e1; padding: 5px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer;">🔄 Reset</button>
          <button id="btn-banner-cancel-wp" style="background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; color: #fca5a5; padding: 5px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer;">✕ Hide</button>
        </div>
      </div>
    `;
    wireBannerWaypointButtons(robotId);
  }
}

function activateAndHideWaypoints(robotId) {
  if (!robotId) robotId = activeEditingWaypointsRobotId || selectedRobotId || 'AMR-01';
  const robot = robotDefs.find(r => r.id === robotId) || robotDefs[0];
  if (!robot || !robot.waypoints || robot.waypoints.length === 0) return;

  saveCustomWaypoints();

  // Engage autonomous waypoint patrol for this robot
  if (robot.type === 'drone') {
    robot.isManualFlight = false;
    robot.isCustomMission = false;
    robot.isLanding = false;
    robot.isLanded = false;
    robot.speed = 1.35;
    robot.hoverAltitude = 1.9;
    robot.status = 'In Flight / Surveillance';
    robot.waypointIdx = 0;
    robot.target.copy(robot.waypoints[0]);
    if (typeof appendDroneChatMessage === 'function') {
      appendDroneChatMessage('🚁 SkyWatcher Drone', `🚀 Waypoint flight route activated! Navigating ${robot.waypoints.length} flight waypoints. Markers hidden from 3D view.`);
    }
  } else if (robot.type === 'humanoid') {
    robot.isCustomMission = false;
    robot.speed = 0.85;
    robot.status = 'Bipedal Inspection';
    robot.waypointIdx = 0;
    robot.target.copy(robot.waypoints[0]);
    robot.plannedLegKey = null;
    robot.failedLegKeys = null;
    robot.unreachableLegs = 0;
    if (typeof appendG1ChatMessage === 'function') {
      appendG1ChatMessage('🤖 Unitree G1 Silver', `🚀 Waypoint patrol routine engaged! Walking sequence of ${robot.waypoints.length} waypoints. Markers hidden from 3D view.`);
    }
  } else {
    // Wheeled AMR Rover
    robot.isManualDrive = false;
    robot.isCustomMission = false;
    robot.isDetouring = false;
    robot.detourWaypoints = null;
    clearDetourRibbon(robot.id);
    robot.speed = (robot.id === 'AMR-02' ? 1.0 : (robot.id === 'AMR-03' ? 0.9 : 0.85));
    robot.status = 'Patrolling';
    robot.waypointIdx = 0;
    robot.target.copy(robot.waypoints[0]);
    robot.plannedLegKey = null;
    robot.failedLegKeys = null;
    robot.unreachableLegs = 0;
    if (typeof appendRoverChatMessage === 'function') {
      appendRoverChatMessage(robot.id, `🚜 ${robot.name}`, `🚀 Waypoint route engaged! Navigating ${robot.waypoints.length} SLAM waypoints. Markers hidden from 3D view.`);
    }
  }

  activeEditingWaypointsRobotId = null;
  isWaypointsVisible = false;
  if (waypointsGroup) {
    waypointsGroup.visible = false;
  }

  updateFleetCards();
  if (typeof updateCameraHUDState === 'function') updateCameraHUDState();
  updateWaypointCountsUI();

  const banner = document.querySelector('.dispatch-banner');
  if (banner) {
    banner.innerHTML = `<span>🚀 <b>${robot.name} (${robot.id}):</b> Waypoints activated! Autonomous patrol route started. <i>(Waypoints hidden from map)</i></span>`;
    setTimeout(() => {
      banner.innerHTML = `<span>🎯 <b>Interactive Dispatch Mode</b>: Click any point on the floor to route <span id="dispatch-target-name" style="color: #38bdf8;">${selectedRobotId}</span></span>`;
    }, 4000);
  }
}

function addWaypointForRobot(robotId) {
  const robot = robotDefs.find(r => r.id === robotId) || robotDefs[0];
  if (!robot) return;
  if (!robot.waypoints) robot.waypoints = [];

  const lastWp = robot.waypoints.length > 0 ? robot.waypoints[robot.waypoints.length - 1] : robot.position;
  const newY = robot.type === 'drone' ? 1.9 : 0.05;
  const limits = getEnvironmentLimits();
  let newX = lastWp.x + (Math.random() > 0.5 ? 0.65 : -0.65);
  let newZ = lastWp.z + (Math.random() > 0.5 ? 0.65 : -0.65);
  newX = Math.max(limits.minX + 0.3, Math.min(limits.maxX - 0.3, newX));
  newZ = Math.max(limits.minZ + 0.3, Math.min(limits.maxZ - 0.3, newZ));

  robot.waypoints.push(new THREE.Vector3(newX, newY, newZ));
  saveCustomWaypoints();
  buildWaypointsVisuals(robot.id, true);
  updateWaypointCountsUI();

  if (activeEditingWaypointsRobotId) {
    showAndEditWaypoints(robotId);
  }
}

function resetWaypointsForRobot(robotId) {
  const robot = robotDefs.find(r => r.id === robotId);
  if (!robot) return;

  const defaultDict = isCampusScan(activeScan)
    ? defaultCampusWaypoints
    : (activeScan === 'scan_house.glb' ? defaultHouseWaypoints : defaultClassroomWaypoints);
  if (defaultDict && defaultDict[robot.id]) {
    robot.waypoints = defaultDict[robot.id].map(p => p.clone());
    saveCustomWaypoints();
    buildWaypointsVisuals(robot.id, true);
    updateWaypointCountsUI();
    if (activeEditingWaypointsRobotId) {
      showAndEditWaypoints(robotId);
    }
  }
}

function wireBannerWaypointButtons(robotId) {
  const btnAct = document.getElementById('btn-banner-activate-wp');
  if (btnAct) btnAct.onclick = () => activateAndHideWaypoints(robotId);

  const btnAdd = document.getElementById('btn-banner-add-wp');
  if (btnAdd) btnAdd.onclick = () => addWaypointForRobot(robotId);

  const btnReset = document.getElementById('btn-banner-reset-wp');
  if (btnReset) btnReset.onclick = () => resetWaypointsForRobot(robotId);

  const btnCancel = document.getElementById('btn-banner-cancel-wp');
  if (btnCancel) {
    btnCancel.onclick = () => {
      activeEditingWaypointsRobotId = null;
      isWaypointsVisible = false;
      if (waypointsGroup) waypointsGroup.visible = false;
      const banner = document.querySelector('.dispatch-banner');
      if (banner) {
        banner.innerHTML = `<span>🎯 <b>Interactive Dispatch Mode</b>: Click any point on the floor to route <span id="dispatch-target-name" style="color: #38bdf8;">${selectedRobotId}</span></span>`;
      }
    };
  }
}

// ==========================================
// INITIALIZATION
// ==========================================
function init() {
  const container = document.getElementById('canvas-container');

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0f1d);
  scene.fog = new THREE.FogExp2(0x0a0f1d, 0.015);

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 5.8, 7.2);

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(1.0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.15; // Responsive, crisp stop without sluggish drift
  controls.rotateSpeed = 1.0;
  controls.panSpeed = 1.0;
  controls.enableZoom = false; // Powered by kinetic gradual zoom
  controls.minDistance = 0.5;
  controls.maxDistance = 40;
  controls.target.set(0, 0.5, 0);

  pedestrianSwarm = new CampusPedestrianSwarm(scene);
  window.pedestrianSwarm = pedestrianSwarm;

  logisticsDispatcher = new CampusLogisticsDispatcher(scene, robotDefs, campusDestinations, labStations, dispatchSelectedRobot);
  window.logisticsDispatcher = logisticsDispatcher;

  window.scene = scene;
  window.camera = camera;
  window.controls = controls;
  window.THREE = THREE;
  window.robotDefs = robotDefs;
  window.placeCustomKeepOutZone = placeCustomKeepOutZone;
  window.isInsideObstacle = isInsideObstacle;
  window.updateObstaclePosition = updateObstaclePosition;
  window.obstacleBoxes = obstacleBoxes;
  window.selectObstacleZone = selectObstacleZone;

  window.getBoxScreenPos = function(idx) {
    const ob = obstacleBoxes[idx];
    if (!ob) return null;
    const cx = (ob.minX + ob.maxX) / 2;
    const cz = (ob.minZ + ob.maxZ) / 2;
    const v = new THREE.Vector3(cx, ob.height / 2, cz);
    v.project(camera);
    return {
      x: (v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-(v.y * 0.5) + 0.5) * window.innerHeight
    };
  };

  setupLighting();

  const grid = new THREE.GridHelper(24, 24, 0x0284c7, 0x1e293b);
  grid.position.y = 0.01;
  scene.add(grid);

  try {
    const savedScan = localStorage.getItem('active_scan');
    if (savedScan) {
      activeScan = savedScan;
      const sel = document.getElementById('select-mesh');
      if (sel) sel.value = savedScan;
    }
  } catch (e) { }
  calibration = calibrationForScan(activeScan);
  applyScanObstacles();

  loadSavedStationPositions();

  if (isCampusScan(activeScan)) {
    camera.position.set(0, 12, 16);
    controls.target.set(0, 0.5, 0);
    robotDefs.forEach(r => {
      const defWps = defaultCampusWaypoints[r.id];
      if (defWps && defWps.length > 0) {
        r.waypoints = defWps.map(p => p.clone());
        r.position.copy(r.waypoints[0]);
        r.target.copy(r.waypoints[1 % r.waypoints.length]);
      }
    });
  } else if (activeScan === 'scan_house.glb') {
    robotDefs[0].waypoints = [
      labStations.inventory.pos.clone(),
      labStations.electronics.pos.clone(),
      labStations.testing.pos.clone()
    ];
    robotDefs[1].waypoints = [
      labStations.electronics.pos.clone(),
      labStations.helipad.pos.clone(),
      labStations.testing.pos.clone(),
      labStations.inventory.pos.clone()
    ];
    robotDefs[2].waypoints = [
      labStations.inventory.pos.clone(),
      labStations.electronics.pos.clone(),
      labStations.testing.pos.clone()
    ];
    const hPos = labStations.helipad.pos;
    robotDefs[3].hoverAltitude = 2.2;
    robotDefs[3].waypoints = [
      new THREE.Vector3(hPos.x, 2.1, hPos.z),
      new THREE.Vector3(labStations.electronics.pos.x, 2.4, labStations.electronics.pos.z),
      new THREE.Vector3(labStations.inventory.pos.x, 2.4, labStations.inventory.pos.z),
      new THREE.Vector3(labStations.charger.pos.x, 2.3, labStations.charger.pos.z),
      new THREE.Vector3(labStations.testing.pos.x, 2.3, labStations.testing.pos.z)
    ];
    robotDefs[4].waypoints = [
      new THREE.Vector3(labStations.helipad.pos.x, 0.05, labStations.helipad.pos.z),
      new THREE.Vector3(labStations.electronics.pos.x, 0.05, labStations.electronics.pos.z),
      new THREE.Vector3(labStations.inventory.pos.x, 0.05, labStations.inventory.pos.z),
      new THREE.Vector3(labStations.testing.pos.x, 0.05, labStations.testing.pos.z)
    ];
    robotDefs.forEach(r => {
      r.position.copy(r.waypoints[0]);
      r.target.copy(r.waypoints[1 % r.waypoints.length]);
    });
  }

  loadSavedWaypoints();
  parkAmrsAtHomeDocks();

  createTargetBeacon();
  createGhostBoundaryMesh();
  buildBoundariesAndStations();
  loadLabMesh(activeScan);
  createRobotFleet();
  initLidarVisualizer();

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  setupEventListeners();
  setupDraggableSidebar();
  setupDraggableTopBar();
  setupCalibrationControls();
  setupZoneEditorControls();
  setupSmoothZoom();
  connect({ onOpen: syncStationsToServer, onMessage: handleServerMessage });
  setInterval(sendTelemetry, TELEMETRY_INTERVAL_MS);
  updateFleetCards();
  updateCustomCountUI();
  updateZoneChipsUI();
  setupG1DashboardUI();
  setupDroneDashboardUI();
  setupRoverDashboardUI();
  setupAIPlannerUI();
  setupFleetManagerUI();
  try { localStorage.removeItem('roboticsLab_turbo'); } catch(e) {}

  animate();
}

function setupLighting() {
  hemiLight = new THREE.HemisphereLight(0xffffff, 0x334155, 1.4);
  hemiLight.position.set(0, 20, 0);
  scene.add(hemiLight);

  mainLight = new THREE.DirectionalLight(0xffffff, 1.8);
  mainLight.position.set(8, 14, 10);
  mainLight.castShadow = true;
  mainLight.shadow.mapSize.width = 1024;
  mainLight.shadow.mapSize.height = 1024;
  mainLight.shadow.bias = -0.0005;
  mainLight.shadow.camera.near = 0.5;
  mainLight.shadow.camera.far = 40;
  mainLight.shadow.camera.left = -14;
  mainLight.shadow.camera.right = 14;
  mainLight.shadow.camera.top = 14;
  mainLight.shadow.camera.bottom = -14;
  scene.add(mainLight);

  fillLight = new THREE.DirectionalLight(0x93c5fd, 0.8);
  fillLight.position.set(-8, 10, -8);
  scene.add(fillLight);

  labBlue = new THREE.PointLight(0x38bdf8, 3.0, 20);
  labBlue.position.set(-4, 3.5, -3);
  scene.add(labBlue);

  labCyan = new THREE.PointLight(0x06b6d4, 2.5, 20);
  labCyan.position.set(4, 3.5, 3);
  scene.add(labCyan);
}

// 3D Ghost Cursor for Boundary Placement
let ghostBoxMesh = null;
let ghostWireMesh = null;

function createGhostBoundaryMesh() {
  boundaryGhostMesh = new THREE.Group();

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const boxMat = new THREE.MeshBasicMaterial({
    color: 0xef4444,
    transparent: true,
    opacity: 0.38
  });
  ghostBoxMesh = new THREE.Mesh(boxGeo, boxMat);
  ghostBoxMesh.position.y = 0.5;
  boundaryGhostMesh.add(ghostBoxMesh);

  const wireGeo = new THREE.EdgesGeometry(boxGeo);
  const wireMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
  ghostWireMesh = new THREE.LineSegments(wireGeo, wireMat);
  ghostWireMesh.position.y = 0.5;
  boundaryGhostMesh.add(ghostWireMesh);

  ghostLabelSprite = createTextSprite('➕ Click to Place Keep-Out Zone', 0xef4444);
  ghostLabelSprite.position.set(0, 1.25, 0);
  boundaryGhostMesh.add(ghostLabelSprite);

  updateGhostMeshScale();
  boundaryGhostMesh.visible = false;
  scene.add(boundaryGhostMesh);
}

function updateGhostMeshScale() {
  if (!boundaryGhostMesh || !ghostBoxMesh || !ghostWireMesh) return;
  const w = pendingZoneSize.width;
  const d = pendingZoneSize.depth;
  const h = pendingZoneSize.height;
  ghostBoxMesh.scale.set(w, h, d);
  ghostBoxMesh.position.y = h / 2;
  ghostWireMesh.scale.set(w, h, d);
  ghostWireMesh.position.y = h / 2;
  boundaryGhostMesh.rotation.y = THREE.MathUtils.degToRad(pendingZoneSize.rotY || 0);
  if (ghostLabelSprite) {
    ghostLabelSprite.position.set(0, h + 0.35, 0);
    ghostLabelSprite.scale.set(1.5, 0.38, 1);
  }
}

// ==========================================
// 3D BOUNDARIES & GEOFENCES
// ==========================================
function buildBoundariesAndStations() {
  if (boundaryWallsGroup) {
    scene.remove(boundaryWallsGroup);
  }
  if (boundaryGroup) {
    scene.remove(boundaryGroup);
  }
  obstacleMeshes.length = 0;

  boundaryWallsGroup = new THREE.Group();
  boundaryGroup = new THREE.Group();
  const limits = getEnvironmentLimits();

  const wallMat = new THREE.MeshBasicMaterial({
    color: 0x0284c7,
    transparent: true,
    opacity: 0.12,
    side: THREE.DoubleSide
  });

  const width = limits.maxX - limits.minX;
  const depth = limits.maxZ - limits.minZ;
  const wallH = 1.6;

  // North Wall
  const nGeo = new THREE.PlaneGeometry(width, wallH);
  const nWall = new THREE.Mesh(nGeo, wallMat);
  nWall.position.set(0, wallH / 2, limits.minZ);
  boundaryWallsGroup.add(nWall);

  // South Wall
  const sWall = new THREE.Mesh(nGeo, wallMat);
  sWall.position.set(0, wallH / 2, limits.maxZ);
  boundaryWallsGroup.add(sWall);

  // West Wall
  const wGeo = new THREE.PlaneGeometry(depth, wallH);
  const wWall = new THREE.Mesh(wGeo, wallMat);
  wWall.rotation.y = Math.PI / 2;
  wWall.position.set(limits.minX, wallH / 2, 0);
  boundaryWallsGroup.add(wWall);

  // East Wall
  const eWall = new THREE.Mesh(wGeo, wallMat);
  eWall.rotation.y = Math.PI / 2;
  eWall.position.set(limits.maxX, wallH / 2, 0);
  boundaryWallsGroup.add(eWall);

  // Perimeter Floor Border (Caution Striping)
  const borderPoints = [
    new THREE.Vector3(limits.minX, 0.03, limits.minZ),
    new THREE.Vector3(limits.maxX, 0.03, limits.minZ),
    new THREE.Vector3(limits.maxX, 0.03, limits.maxZ),
    new THREE.Vector3(limits.minX, 0.03, limits.maxZ),
    new THREE.Vector3(limits.minX, 0.03, limits.minZ)
  ];
  const borderGeo = new THREE.BufferGeometry().setFromPoints(borderPoints);
  const borderLine = new THREE.Line(borderGeo, new THREE.LineDashedMaterial({
    color: 0x38bdf8,
    dashSize: 0.3,
    gapSize: 0.15
  }));
  borderLine.computeLineDistances();
  boundaryWallsGroup.add(borderLine);

  boundaryWallsGroup.visible = boundariesVisible;
  scene.add(boundaryWallsGroup);

  // Obstacle Keep-Out Boxes (Permanently solid 3D campus buildings/water features and sidewalk networks
  // use their exact 3D mesh polygon geometry without rendering rectangular Keep-Out Zone boxes)
  obstacleBoxes.forEach((ob, idx) => {
    if (!ob || ob.permanentSolid || ob.isWalkwayNetwork) return;
    const obW = ob.maxX - ob.minX;
    const obD = ob.maxZ - ob.minZ;
    const obCenterX = (ob.minX + ob.maxX) / 2;
    const obCenterZ = (ob.minZ + ob.maxZ) / 2;

    const isSelected = (selectedObstacleIdx === idx);

    const boxGeo = new THREE.BoxGeometry(obW, ob.height, obD);
    const boxMat = new THREE.MeshBasicMaterial({
      color: isSelected ? 0x38bdf8 : ob.color,
      transparent: true,
      opacity: isSelected ? 0.55 : (ob.userCreated ? 0.38 : 0.22),
      wireframe: false
    });
    const rot = (ob.rotY !== undefined && ob.rotY !== null) ? THREE.MathUtils.degToRad(ob.rotY) : 0;

    const boxMesh = new THREE.Mesh(boxGeo, boxMat);
    boxMesh.position.set(obCenterX, ob.height / 2, obCenterZ);
    boxMesh.rotation.y = rot;
    boxMesh.userData = { isObstacle: true, obstacleIdx: idx, isUserCreated: ob.userCreated };
    boundaryGroup.add(boxMesh);

    const wireGeo = new THREE.EdgesGeometry(boxGeo);
    const wireMat = new THREE.LineBasicMaterial({
      color: isSelected ? 0x38bdf8 : (ob.userCreated ? 0xffffff : ob.color),
      linewidth: isSelected ? 3 : 2
    });
    const wireMesh = new THREE.LineSegments(wireGeo, wireMat);
    wireMesh.position.set(obCenterX, ob.height / 2, obCenterZ);
    wireMesh.rotation.y = rot;
    boundaryGroup.add(wireMesh);

    // If selected, display dynamic 3D orientation indicators:
    if (isSelected) {
      // 1) Circular ground compass ring
      const ringRadius = Math.max(0.6, Math.max(obW, obD) * 0.65);
      const ringGeo = new THREE.RingGeometry(ringRadius - 0.05, ringRadius, 48);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.75 });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.set(obCenterX, 0.03, obCenterZ);
      boundaryGroup.add(ringMesh);

      // 2) Heading arrow on top face showing rotation angle
      const arrowLen = Math.max(0.5, Math.min(obW, obD) * 0.65);
      const arrowDir = new THREE.Vector3(Math.sin(rot), 0, Math.cos(rot));
      const arrowHelper = new THREE.ArrowHelper(arrowDir, new THREE.Vector3(obCenterX, ob.height + 0.04, obCenterZ), arrowLen, 0x38bdf8, arrowLen * 0.35, arrowLen * 0.25);
      boundaryGroup.add(arrowHelper);
    }

    let labelSprite = null;
    if (!ob.hideLabel || isSelected) {
      const degDisplay = Math.round(ob.rotY || 0);
      labelSprite = createTextSprite(
        isSelected ? `✏️ [EDITING] ${ob.name} (${degDisplay}°)` : `⚠️ Keep-Out: ${ob.name}`,
        isSelected ? 0x38bdf8 : ob.color
      );
      labelSprite.position.set(obCenterX, ob.height + 0.35, obCenterZ);
      labelSprite.userData = { isObstacle: true, obstacleIdx: idx };
      boundaryGroup.add(labelSprite);
    }

    obstacleMeshes[idx] = { box: boxMesh, wire: wireMesh, label: labelSprite };
  });

  // Keep-Out Obstacles visibility: visible whenever boundaries are ON or user zones exist
  boundaryGroup.visible = (boundariesVisible || isAddingBoundaryMode || selectedObstacleIdx !== null || obstacleBoxes.some(b => b.userCreated));
  scene.add(boundaryGroup);

  // Dedicated Stations Group (Always visible in both Classroom and House & Yard scans)
  if (!stationsGroup) {
    stationsGroup = new THREE.Group();
    scene.add(stationsGroup);
  } else {
    while (stationsGroup.children.length > 0) {
      stationsGroup.remove(stationsGroup.children[0]);
    }
  }

  // Station Landing Pads (Clickable & Draggable in 3D across both environments)
  Object.keys(stationMeshes).forEach(k => delete stationMeshes[k]);
  Object.keys(labStations).forEach(key => {
    const st = labStations[key];
    const padGroup = new THREE.Group();
    padGroup.position.copy(st.pos);
    padGroup.userData = { isStation: true, stationKey: key };

    const ringGeo = new THREE.RingGeometry(0.34, 0.40, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: st.color, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.userData = { isStation: true, stationKey: key };
    padGroup.add(ring);

    const discGeo = new THREE.CircleGeometry(0.32, 32);
    discGeo.rotateX(-Math.PI / 2);
    const discMat = new THREE.MeshBasicMaterial({
      color: st.color,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide
    });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.userData = { isStation: true, stationKey: key };
    padGroup.add(disc);

    // Large invisible click/drag capture cylinder for responsive targeting
    const grabGeo = new THREE.CylinderGeometry(0.58, 0.58, 0.16, 24);
    const grabMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.001, depthWrite: false });
    const grabMesh = new THREE.Mesh(grabGeo, grabMat);
    grabMesh.position.y = 0.08;
    grabMesh.userData = { isStation: true, stationKey: key };
    padGroup.add(grabMesh);

    // Outer subtle dashed indicator ring
    const outerRingGeo = new THREE.RingGeometry(0.44, 0.48, 32);
    outerRingGeo.rotateX(-Math.PI / 2);
    const outerRingMat = new THREE.MeshBasicMaterial({
      color: st.color,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide
    });
    const outerRing = new THREE.Mesh(outerRingGeo, outerRingMat);
    outerRing.userData = { isStation: true, stationKey: key };
    padGroup.add(outerRing);

    // If Drone Helipad, draw outer caution ring and iconic 'H' landing decal
    if (key === 'helipad') {
      const helipadCanvas = document.createElement('canvas');
      helipadCanvas.width = 256;
      helipadCanvas.height = 256;
      const hCtx = helipadCanvas.getContext('2d');

      // Orange landing circle
      hCtx.fillStyle = '#ea580c';
      hCtx.beginPath();
      hCtx.arc(128, 128, 120, 0, Math.PI * 2);
      hCtx.fill();

      // Black perimeter ring
      hCtx.lineWidth = 14;
      hCtx.strokeStyle = '#0f172a';
      hCtx.stroke();

      // Inner dashed ring
      hCtx.lineWidth = 5;
      hCtx.strokeStyle = '#fed7aa';
      hCtx.beginPath();
      hCtx.arc(128, 128, 90, 0, Math.PI * 2);
      hCtx.stroke();

      // Bold white 'H'
      hCtx.fillStyle = '#ffffff';
      hCtx.font = 'bold 100px Arial, sans-serif';
      hCtx.textAlign = 'center';
      hCtx.textBaseline = 'middle';
      hCtx.fillText('H', 128, 128);

      const hTex = new THREE.CanvasTexture(helipadCanvas);
      const hDecalGeo = new THREE.PlaneGeometry(0.72, 0.72);
      hDecalGeo.rotateX(-Math.PI / 2);
      const hDecalMat = new THREE.MeshBasicMaterial({ map: hTex, transparent: true });
      const hDecal = new THREE.Mesh(hDecalGeo, hDecalMat);
      hDecal.position.y = 0.01;
      hDecal.userData = { isStation: true, stationKey: key };
      padGroup.add(hDecal);
    }

    // If AMR Home Docking Station, draw industrial parking bay decal with hazard stripes & robot ID
    if (st.isDock || key.startsWith('dock')) {
      const dockCanvas = document.createElement('canvas');
      dockCanvas.width = 256;
      dockCanvas.height = 256;
      const dCtx = dockCanvas.getContext('2d');

      // Dark industrial floor pad
      dCtx.fillStyle = '#090d16';
      dCtx.fillRect(4, 4, 248, 248);

      // Rover themed perimeter border
      const hexColor = '#' + st.color.toString(16).padStart(6, '0');
      dCtx.lineWidth = 10;
      dCtx.strokeStyle = hexColor;
      dCtx.strokeRect(8, 8, 240, 240);

      // Hazard diagonal striped caution bars top and bottom
      dCtx.fillStyle = hexColor;
      for (let i = 16; i < 235; i += 32) {
        dCtx.fillRect(i, 14, 16, 12);
        dCtx.fillRect(i, 230, 16, 12);
      }

      // Center glowing inductive charging coil
      dCtx.lineWidth = 6;
      dCtx.strokeStyle = '#facc15';
      dCtx.beginPath();
      dCtx.arc(128, 128, 44, 0, Math.PI * 2);
      dCtx.stroke();

      // Bold Bay Label
      dCtx.fillStyle = '#ffffff';
      dCtx.font = 'bold 36px Arial, sans-serif';
      dCtx.textAlign = 'center';
      dCtx.textBaseline = 'middle';
      dCtx.fillText(`BAY ${st.bayNumber || key.replace('dock','')}`, 128, 112);

      // Robot ID sublabel
      dCtx.fillStyle = hexColor;
      dCtx.font = 'bold 24px Arial, sans-serif';
      dCtx.fillText(`[${st.assignedRobotId || 'AMR'}]`, 128, 150);

      const dTex = new THREE.CanvasTexture(dockCanvas);
      const dDecalGeo = new THREE.PlaneGeometry(0.55, 0.68);
      dDecalGeo.rotateX(-Math.PI / 2);
      const dDecalMat = new THREE.MeshBasicMaterial({ map: dTex, transparent: true });
      const dDecal = new THREE.Mesh(dDecalGeo, dDecalMat);
      dDecal.position.y = 0.012;
      dDecal.userData = { isStation: true, stationKey: key };
      padGroup.add(dDecal);
    }

    const sprite = createTextSprite(st.name, st.color);
    sprite.position.set(0, (st.isDock || key.startsWith('dock')) ? 0.45 : 0.60, 0);
    sprite.userData = { isStation: true, stationKey: key };
    padGroup.add(sprite);

    stationMeshes[key] = padGroup;
    padGroup.visible = (stationVisibility[key] !== false);
    stationsGroup.add(padGroup);
  });
  stationsGroup.visible = true;

  // Safe Walkable Corridors between active stations
  const laneMat = new THREE.LineDashedMaterial({
    color: 0x38bdf8,
    dashSize: 0.25,
    gapSize: 0.15,
    transparent: true,
    opacity: 0.5
  });

  const activeStationKeys = (activeScan === 'scan_house.glb' || isCampusScan(activeScan))
    ? ['inventory', 'electronics', 'helipad', 'testing', 'charger']
    : ['inventory', 'testing', 'charger', 'electronics'];
  const visibleKeys = activeStationKeys.filter(k => stationVisibility[k] !== false);

  if (visibleKeys.length >= 2) {
    for (let i = 0; i < visibleKeys.length; i++) {
      const nextIdx = (i + 1) % visibleKeys.length;
      const k1 = visibleKeys[i];
      const k2 = visibleKeys[nextIdx];
      const p1 = labStations[k1].pos;
      const p2 = labStations[k2].pos;
      const pts = [new THREE.Vector3(p1.x, 0.03, p1.z), new THREE.Vector3(p2.x, 0.03, p2.z)];
      const pGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const pLine = new THREE.Line(pGeo, laneMat);
      pLine.computeLineDistances();
      stationsGroup.add(pLine);
    }
  }

  buildWaypointsVisuals();
  updateStationButtonsUI();
  buildCampusBuildingVisuals();
}

function buildWaypointsVisuals(forcedRobotId, forceVisible) {
  if (!waypointsGroup) {
    waypointsGroup = new THREE.Group();
    scene.add(waypointsGroup);
  } else {
    while (waypointsGroup.children.length > 0) {
      waypointsGroup.remove(waypointsGroup.children[0]);
    }
  }

  const shouldBeVisible = forceVisible || isWaypointsVisible || Boolean(activeEditingWaypointsRobotId);
  if (!shouldBeVisible) {
    waypointsGroup.visible = false;
    return;
  }

  const robotId = forcedRobotId || activeEditingWaypointsRobotId || selectedRobotId || 'AMR-01';
  const robot = robotDefs.find(r => r.id === robotId) || robotDefs[0];
  if (!robot || !robot.waypoints || robot.waypoints.length === 0) {
    waypointsGroup.visible = false;
    return;
  }

  const pts = robot.waypoints;
  const color = robot.color || 0x38bdf8;

  // Dotted route line connecting robot waypoints
  const linePts = pts.map(p => new THREE.Vector3(p.x, Math.max(0.04, p.y), p.z));
  if (linePts.length > 2) linePts.push(linePts[0].clone());
  const lineGeo = new THREE.BufferGeometry().setFromPoints(linePts);
  const lineMat = new THREE.LineDashedMaterial({
    color: color,
    dashSize: 0.3,
    gapSize: 0.18,
    transparent: true,
    opacity: 0.7
  });
  const routeLine = new THREE.Line(lineGeo, lineMat);
  routeLine.computeLineDistances();
  waypointsGroup.add(routeLine);

  // Visual waypoint nodes
  pts.forEach((pt, idx) => {
    const nodeGroup = new THREE.Group();
    const nodeY = Math.max(0.04, pt.y);
    nodeGroup.position.set(pt.x, nodeY, pt.z);
    nodeGroup.userData = { isWaypoint: true, waypointPos: pt, index: idx, robotId: robot.id, label: `${robot.name} Waypoint #${idx + 1}` };

    const ringGeo = new THREE.RingGeometry(0.12, 0.20, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.userData = nodeGroup.userData;
    nodeGroup.add(ringMesh);

    const gemGeo = new THREE.OctahedronGeometry(0.11, 0);
    const gemMat = new THREE.MeshBasicMaterial({ color: color });
    const gemMesh = new THREE.Mesh(gemGeo, gemMat);
    gemMesh.position.y = 0.20;
    gemMesh.userData = nodeGroup.userData;
    nodeGroup.add(gemMesh);

    const grabGeo = new THREE.CylinderGeometry(0.40, 0.40, 0.45, 16);
    const grabMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.001, depthWrite: false });
    const grabMesh = new THREE.Mesh(grabGeo, grabMat);
    grabMesh.position.y = 0.2;
    grabMesh.userData = nodeGroup.userData;
    nodeGroup.add(grabMesh);

    const wpSprite = createWaypointTextSprite(`WP-${idx + 1}`, color);
    wpSprite.position.set(0, 0.42, 0);
    wpSprite.userData = nodeGroup.userData;
    nodeGroup.add(wpSprite);

    waypointsGroup.add(nodeGroup);
  });
  waypointsGroup.visible = true;
}

function createWaypointTextSprite(text, colorHex) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.roundRect(4, 4, 120, 56, 10);
  ctx.fill();
  ctx.strokeStyle = `#${colorHex.toString(16).padStart(6, '0')}`;
  ctx.lineWidth = 3;
  ctx.roundRect(4, 4, 120, 56, 10);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 32);

  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.60, 0.30, 1);
  return sprite;
}

function createTextSprite(text, colorHex) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.roundRect(8, 8, 496, 112, 18);
  ctx.fill();
  ctx.strokeStyle = `#${colorHex.toString(16).padStart(6, '0')}`;
  ctx.lineWidth = 4;
  ctx.roundRect(8, 8, 496, 112, 18);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(1.5, 0.38, 1);
  return sprite;
}

function createBuildingBillboardSprite(bldg) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 140;
  const ctx = canvas.getContext('2d');

  // Translucent backdrop pill with cyan/blue glow border
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(8, 8, 496, 124, 20);
  } else {
    ctx.rect(8, 8, 496, 124);
  }
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
  ctx.stroke();

  // Circular Number Badge on the Left (Deep Royal Blue circle with white border)
  ctx.beginPath();
  ctx.arc(72, 70, 48, 0, Math.PI * 2);
  ctx.fillStyle = '#0047ba';
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  // White Centered Number / Code Text
  ctx.fillStyle = '#ffffff';
  ctx.font = bldg.code.length > 1 ? 'bold 40px Arial, sans-serif' : 'bold 54px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(bldg.code, 72, 72);

  // Building Title & Subtitle on the Right
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 30px Arial, sans-serif';
  ctx.fillText(bldg.name, 136, 62);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = 'bold 22px Arial, sans-serif';
  ctx.fillText(bldg.type, 136, 102);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.9, 0.52, 1);
  return sprite;
}

function createGroundBayCanvas(bldg) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Outer dark background disc
  ctx.beginPath();
  ctx.arc(128, 128, 122, 0, Math.PI * 2);
  ctx.fillStyle = '#0f172a';
  ctx.fill();

  // Solid Royal Blue Delivery Disc
  ctx.beginPath();
  ctx.arc(128, 128, 110, 0, Math.PI * 2);
  ctx.fillStyle = '#0047ba';
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#38bdf8';
  ctx.stroke();

  // White inner circular border
  ctx.beginPath();
  ctx.arc(128, 128, 96, 0, Math.PI * 2);
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  // Large White Destination Number
  ctx.fillStyle = '#ffffff';
  ctx.font = bldg.code.length > 1 ? 'bold 84px Arial, sans-serif' : 'bold 112px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(bldg.code, 128, 114);

  // Bottom text: "BAY X"
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 22px Arial, sans-serif';
  ctx.fillText(`BAY ${bldg.code}`, 128, 188);

  return canvas;
}

function drawBayBadge(ctx, bldg) {
  const count = bldg.deliveredCount || 0;
  const w = 320;
  const h = 72;
  ctx.clearRect(0, 0, w, h);

  // Background rounded container box
  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(4, 4, w - 8, h - 8, 14);
  else ctx.rect(4, 4, w - 8, h - 8);
  ctx.fill();

  // Outer border: vibrant sky-blue if packages are delivered, crisp emerald if standby
  ctx.lineWidth = 3;
  ctx.strokeStyle = count > 0 ? '#38bdf8' : '#22c55e';
  ctx.stroke();

  // Left Title: 📍 Bay X Drop-Off
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 18px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`📍 Bay ${bldg.code} Drop-Off`, 16, h / 2);

  // Right pill badge: package count
  const pillW = 94;
  const pillH = 36;
  const pillX = w - pillW - 14;
  const pillY = (h - pillH) / 2;

  ctx.fillStyle = count > 0 ? '#0284c7' : '#334155';
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(pillX, pillY, pillW, pillH, 8);
  else ctx.rect(pillX, pillY, pillW, pillH);
  ctx.fill();

  // Pill border
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = count > 0 ? '#7dd3fc' : '#64748b';
  ctx.stroke();

  // Pill count text: "0 pkgs", "1 pkg", "2 pkgs"
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const pkgStr = `${count} ${count === 1 ? 'pkg' : 'pkgs'}`;
  ctx.fillText(pkgStr, pillX + pillW / 2, h / 2);
}

function createBayBadgeSprite(bldg) {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 72;
  const ctx = canvas.getContext('2d');

  drawBayBadge(ctx, bldg);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.98, 0.22, 1);

  bldg.bayBadgeSprite = sprite;
  bldg.bayCanvas = canvas;
  bldg.bayTexture = texture;
  bldg.updateBayBadge = () => {
    drawBayBadge(ctx, bldg);
    texture.needsUpdate = true;
    updateCampusBuildingsUI();
  };

  return sprite;
}

function initCampusDestinations() {
  const existingCounts = {};
  if (Array.isArray(campusDestinations)) {
    campusDestinations.forEach(b => {
      if (b.id) existingCounts[b.id] = b.deliveredCount || 0;
    });
  }
  campusDestinations = MDC_NORTH_CAMPUS_DESTINATIONS.map(b => ({
    ...b,
    center: { x: b.center.x, y: b.center.y, z: b.center.z },
    dropoff: { x: b.dropoff.x, y: b.dropoff.y, z: b.dropoff.z },
    deliveredCount: existingCounts[b.id] !== undefined ? existingCounts[b.id] : (b.deliveredCount || 0)
  }));
  loadCustomBuildingPositions();
}

function loadCustomBuildingPositions() {
  try {
    const raw = localStorage.getItem(`custom_building_positions_${activeScan}`);
    if (raw) {
      const data = JSON.parse(raw);
      campusDestinations.forEach(b => {
        if (data[b.id]) {
          if (data[b.id].dropoff) {
            b.dropoff.x = data[b.id].dropoff.x;
            b.dropoff.z = data[b.id].dropoff.z;
          }
          if (data[b.id].center) {
            b.center.x = data[b.id].center.x;
            b.center.z = data[b.id].center.z;
          }
        }
      });
    }
  } catch(e) {}
}

function saveCustomBuildingPositions() {
  try {
    const data = {};
    campusDestinations.forEach(b => {
      data[b.id] = {
        dropoff: { x: +b.dropoff.x.toFixed(3), y: +b.dropoff.y.toFixed(3), z: +b.dropoff.z.toFixed(3) },
        center: { x: +b.center.x.toFixed(3), y: +b.center.y.toFixed(3), z: +b.center.z.toFixed(3) }
      };
    });
    localStorage.setItem(`custom_building_positions_${activeScan}`, JSON.stringify(data));
  } catch(e) {}
}

function resetCustomBuildingPositions() {
  try {
    localStorage.removeItem(`custom_building_positions_${activeScan}`);
  } catch(e) {}
  initCampusDestinations();
  buildCampusBuildingVisuals();
  const banner = document.querySelector('.dispatch-banner');
  if (banner) {
    banner.innerHTML = `<span>🔄 <b>All Campus Building Bays &amp; Labels Restored</b> to default CAD coordinates.</span>`;
  }
}
window.resetCustomBuildingPositions = resetCustomBuildingPositions;

function buildCampusBuildingVisuals() {
  if (campusBuildingVisualsGroup) {
    scene.remove(campusBuildingVisualsGroup);
  }
  campusBuildingVisualsGroup = new THREE.Group();
  campusBuildingVisualsGroup.name = 'campusBuildingVisualsGroup';

  const isCampus = isCampusScan(activeScan);
  campusBuildingVisualsGroup.visible = isCampus;
  scene.add(campusBuildingVisualsGroup);

  if (!isCampus) return;
  if (campusDestinations.length === 0) initCampusDestinations();

  campusDestinations.forEach(bldg => {
    const bldgGroup = new THREE.Group();
    bldgGroup.userData = { isBuilding: true, bldgId: bldg.id, bldg };

    // 1) Roof Center: Floating 3D Building Name Billboard (Draggable)
    const roofY = bldg.center.y;
    const labelSprite = createBuildingBillboardSprite(bldg);
    labelSprite.position.set(bldg.center.x, roofY + 0.52, bldg.center.z);
    labelSprite.userData = { isBuilding: true, bldgId: bldg.id, bldg, part: 'label' };
    labelSprite.visible = buildingLabelsVisible;
    bldgGroup.add(labelSprite);

    // 2) Ground Floor Sidewalk: Designated Numbered Courier Delivery Bay (#1, #2, #3...) (Draggable)
    const bayCanvas = createGroundBayCanvas(bldg);
    const bayTex = new THREE.CanvasTexture(bayCanvas);
    const bayGeo = new THREE.PlaneGeometry(0.72, 0.72);
    bayGeo.rotateX(-Math.PI / 2);
    const bayMat = new THREE.MeshBasicMaterial({ map: bayTex, transparent: true, depthWrite: false });
    const bayMesh = new THREE.Mesh(bayGeo, bayMat);
    bayMesh.position.set(bldg.dropoff.x, 0.025, bldg.dropoff.z);
    bayMesh.userData = { isBuilding: true, bldgId: bldg.id, bldg, part: 'bay' };
    bldgGroup.add(bayMesh);

    // Glowing outer ring for the delivery bay
    const bayRingGeo = new THREE.RingGeometry(0.40, 0.46, 32);
    bayRingGeo.rotateX(-Math.PI / 2);
    const bayRingMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
    const bayRing = new THREE.Mesh(bayRingGeo, bayRingMat);
    bayRing.position.set(bldg.dropoff.x, 0.028, bldg.dropoff.z);
    bayRing.userData = { isBuilding: true, bldgId: bldg.id, bldg, part: 'bay' };
    bldgGroup.add(bayRing);

    // Small floating pin above the ground delivery bay
    const bayPin = createBayBadgeSprite(bldg);
    bayPin.position.set(bldg.dropoff.x, 0.38, bldg.dropoff.z);
    bayPin.userData = { isBuilding: true, bldgId: bldg.id, bldg, part: 'bay' };
    bldgGroup.add(bayPin);

    campusBuildingVisualsGroup.add(bldgGroup);
  });

  updateCampusBuildingsUI();
}

function setBoundariesVisible(visible) {
  boundariesVisible = visible;
  if (boundaryWallsGroup) boundaryWallsGroup.visible = boundariesVisible;
  if (boundaryGroup) boundaryGroup.visible = (boundariesVisible || isAddingBoundaryMode || selectedObstacleIdx !== null || obstacleBoxes.some(b => b.userCreated));
  const sw = document.getElementById('switch-boundaries');
  if (sw) sw.checked = boundariesVisible;
  const boundBtn = document.getElementById('btn-toggle-boundaries');
  if (boundBtn) {
    boundBtn.innerText = boundariesVisible ? '🛡️ Boundaries: ON' : '🛡️ Boundaries: OFF';
    boundBtn.classList.toggle('active', boundariesVisible);
  }
}
window.setBoundariesVisible = setBoundariesVisible;

function setBuildingLabelsVisible(visible) {
  buildingLabelsVisible = visible;
  if (campusBuildingVisualsGroup) {
    campusBuildingVisualsGroup.traverse(child => {
      if (child.userData && child.userData.part === 'label') {
        child.visible = visible;
      }
    });
  }
  const sw = document.getElementById('switch-bldg-names');
  if (sw) sw.checked = visible;
  const btnSide = document.getElementById('btn-toggle-bldg-names-side');
  if (btnSide) {
    btnSide.innerText = visible ? '🏷️ Names: ON' : '🏷️ Names: OFF';
    btnSide.classList.toggle('active', visible);
  }
}
window.setBuildingLabelsVisible = setBuildingLabelsVisible;

function syncPedestrianButtons(active) {
  const sw = document.getElementById('switch-students');
  if (sw) sw.checked = active;
  const pedToggle = document.getElementById('pedestrians-toggle');
  if (pedToggle) pedToggle.checked = active;
}

function setupOnOffSwitches() {
  const btnSwitches = document.getElementById('btn-toggle-switches');
  const menuSwitches = document.getElementById('switches-dropdown-menu');
  if (btnSwitches && menuSwitches && !btnSwitches._wired) {
    btnSwitches._wired = true;
    btnSwitches.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = menuSwitches.style.display === 'none' || !menuSwitches.style.display;
      menuSwitches.style.display = isHidden ? 'flex' : 'none';
      btnSwitches.classList.toggle('active', isHidden);
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.switches-dropdown-wrapper')) {
        menuSwitches.style.display = 'none';
        btnSwitches.classList.remove('active');
      }
    });
  }

  const swBoundaries = document.getElementById('switch-boundaries');
  if (swBoundaries && !swBoundaries._wired) {
    swBoundaries._wired = true;
    swBoundaries.addEventListener('change', (e) => {
      setBoundariesVisible(e.target.checked);
    });
  }

  const swBldgNames = document.getElementById('switch-bldg-names');
  if (swBldgNames && !swBldgNames._wired) {
    swBldgNames._wired = true;
    swBldgNames.addEventListener('change', (e) => {
      setBuildingLabelsVisible(e.target.checked);
    });
  }

  const swStudents = document.getElementById('switch-students');
  if (swStudents && !swStudents._wired) {
    swStudents._wired = true;
    swStudents.addEventListener('change', (e) => {
      if (pedestrianSwarm) {
        pedestrianSwarm.setActive(e.target.checked);
        syncPedestrianButtons(e.target.checked);
      }
    });
  }

  const swStudentNames = document.getElementById('switch-student-names');
  if (swStudentNames && !swStudentNames._wired) {
    swStudentNames._wired = true;
    swStudentNames.addEventListener('change', (e) => {
      if (pedestrianSwarm) {
        pedestrianSwarm.setNamesVisible(e.target.checked);
      }
      const sideCb = document.getElementById('ped-names-toggle');
      if (sideCb) sideCb.checked = e.target.checked;
    });
  }

  const swDepot = document.getElementById('switch-depot');
  if (swDepot && !swDepot._wired) {
    swDepot._wired = true;
    swDepot.addEventListener('change', (e) => {
      if (logisticsDispatcher) {
        logisticsDispatcher.setDepotVisible(e.target.checked);
      }
    });
  }
}

function updateCampusBuildingsUI() {
  const box = document.getElementById('campus-buildings-box');
  const grid = document.getElementById('campus-buildings-grid');
  const pedBox = document.getElementById('campus-pedestrians-box');
  if (!box || !grid) return;

  const isCampus = isCampusScan(activeScan);
  box.style.display = isCampus ? 'block' : 'none';
  if (pedBox) pedBox.style.display = isCampus ? 'block' : 'none';

  // Toggle campus-specific switch rows in the On/Off Switches box
  const rowBldg = document.getElementById('switch-bldg-names-row');
  const rowStudents = document.getElementById('switch-students-row');
  const rowStudentNames = document.getElementById('switch-student-names-row');
  const rowDepot = document.getElementById('switch-depot-row');
  if (rowBldg) rowBldg.style.display = isCampus ? 'flex' : 'none';
  if (rowStudents) rowStudents.style.display = isCampus ? 'flex' : 'none';
  if (rowStudentNames) rowStudentNames.style.display = isCampus ? 'flex' : 'none';
  if (rowDepot) rowDepot.style.display = isCampus ? 'flex' : 'none';

  setupOnOffSwitches();

  if (pedestrianSwarm) {
    pedestrianSwarm.setCampusScanActive(isCampus);
  }

  const logBox = document.getElementById('campus-logistics-box');
  if (logBox) logBox.style.display = isCampus ? 'block' : 'none';

  if (logisticsDispatcher) {
    logisticsDispatcher.destinations = campusDestinations;
    logisticsDispatcher.labStations = labStations;
    logisticsDispatcher.setCampusScanActive(isCampus);
  }

  const autoDispatchToggle = document.getElementById('auto-dispatch-toggle');
  if (autoDispatchToggle && !autoDispatchToggle._wired) {
    autoDispatchToggle._wired = true;
    autoDispatchToggle.addEventListener('change', (e) => {
      if (logisticsDispatcher) logisticsDispatcher.autoGenerate = e.target.checked;
    });
  }

  const btnDispatchUrgent = document.getElementById('btn-dispatch-urgent');
  if (btnDispatchUrgent && !btnDispatchUrgent._wired) {
    btnDispatchUrgent._wired = true;
    btnDispatchUrgent.addEventListener('click', () => {
      if (logisticsDispatcher) logisticsDispatcher.generateOrder('urgent');
    });
  }

  const btnDispatchStandard = document.getElementById('btn-dispatch-standard');
  if (btnDispatchStandard && !btnDispatchStandard._wired) {
    btnDispatchStandard._wired = true;
    btnDispatchStandard.addEventListener('click', () => {
      if (logisticsDispatcher) logisticsDispatcher.generateOrder('standard');
    });
  }

  const btnSideBldg = document.getElementById('btn-toggle-bldg-names-side');
  if (btnSideBldg && !btnSideBldg._wired) {
    btnSideBldg._wired = true;
    btnSideBldg.addEventListener('click', () => {
      setBuildingLabelsVisible(!buildingLabelsVisible);
    });
  }
  const pedToggle = document.getElementById('pedestrians-toggle');
  if (pedToggle && !pedToggle._wired) {
    pedToggle._wired = true;
    pedToggle.addEventListener('change', (e) => {
      if (pedestrianSwarm) {
        pedestrianSwarm.setActive(e.target.checked);
        syncPedestrianButtons(e.target.checked);
      }
    });
  }
  const pedNamesToggle = document.getElementById('ped-names-toggle');
  if (pedNamesToggle && !pedNamesToggle._wired) {
    pedNamesToggle._wired = true;
    pedNamesToggle.addEventListener('change', (e) => {
      if (pedestrianSwarm) {
        pedestrianSwarm.setNamesVisible(e.target.checked);
      }
      const topSw = document.getElementById('switch-student-names');
      if (topSw) topSw.checked = e.target.checked;
    });
  }
  const pedDensitySelect = document.getElementById('pedestrian-density-select');
  if (pedDensitySelect && !pedDensitySelect._wired) {
    pedDensitySelect._wired = true;
    pedDensitySelect.addEventListener('change', (e) => {
      if (pedestrianSwarm) pedestrianSwarm.setDensity(e.target.value);
    });
  }

  if (!isCampus) return;
  if (campusDestinations.length === 0) initCampusDestinations();

  grid.innerHTML = '';
  campusDestinations.forEach(bldg => {
    const btn = document.createElement('button');
    btn.className = 'tool-btn';
    btn.style.cssText = 'padding: 5px 4px; font-size: 11px; font-weight: 700; border-radius: 6px; border: 1px solid rgba(56, 189, 248, 0.4); background: rgba(0, 71, 186, 0.25); color: #e2e8f0; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 2px; transition: all 0.2s;';
    const count = bldg.deliveredCount || 0;
    btn.title = `${bldg.name} (${bldg.type}) - ${count} ${count === 1 ? 'package' : 'packages'} delivered. Click to route robot here.`;
    const countBadge = count > 0
      ? `<span style="font-size: 9px; padding: 1px 4px; border-radius: 4px; background: #0284c7; color: #ffffff; font-weight: 800; border: 1px solid #38bdf8;">📦 ${count}</span>`
      : `<span style="font-size: 9px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 50px;">Bldg ${bldg.code}</span>`;
    btn.innerHTML = `<span style="display: inline-block; width: 22px; height: 22px; line-height: 20px; border-radius: 50%; background: #0047ba; border: 2px solid #ffffff; color: #ffffff; font-weight: 800; text-align: center; font-size: 11px;">${bldg.code}</span>${countBadge}`;
    
    btn.onclick = (e) => {
      e.stopPropagation();
      const dropTarget = new THREE.Vector3(bldg.dropoff.x, bldg.dropoff.y, bldg.dropoff.z);
      dispatchSelectedRobot(dropTarget, `${bldg.name} (${bldg.type})`);
      highlightPointIn3D(dropTarget, 0x0047ba);
      focusCameraOn(bldg.center.x, bldg.center.y, bldg.center.z, 6.0);
      const banner = document.querySelector('.dispatch-banner');
      if (banner) {
        banner.innerHTML = `<span>🚚 <b>Dispatching ${selectedRobotId}</b> to <b>${bldg.name}</b> (Bay ${bldg.code}: <b>${count}</b> pkgs delivered)</span>`;
      }
    };
    grid.appendChild(btn);
  });
}

function isOutsideRoom(x, z, padding = 0.25) {
  const limits = getEnvironmentLimits();
  return (x < limits.minX + padding || x > limits.maxX - padding || z < limits.minZ + padding || z > limits.maxZ - padding);
}

function isInsideObstacle(x, z, padding = 0) {
  for (let ob of obstacleBoxes) {
    if (!ob || ob.isWalkwayNetwork) continue;
    if (!boundariesVisible && !ob.userCreated && !ob.hardcoded && !ob.permanentSolid) continue;
    if (Array.isArray(ob.pts) && ob.pts.length >= 3) {
      if (isPointInPolygonObstacle(x, z, ob, padding)) return ob;
      continue;
    }
    const cx = (ob.minX + ob.maxX) / 2;
    const cz = (ob.minZ + ob.maxZ) / 2;
    const halfW = (ob.maxX - ob.minX) / 2 + padding;
    const halfD = (ob.maxZ - ob.minZ) / 2 + padding;

    if (ob.rotY) {
      const rad = THREE.MathUtils.degToRad(-ob.rotY);
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const dx = x - cx;
      const dz = z - cz;
      const lx = dx * cos - dz * sin;
      const lz = dx * sin + dz * cos;
      if (Math.abs(lx) <= halfW && Math.abs(lz) <= halfD) {
        return ob;
      }
    } else {
      if (Math.abs(x - cx) <= halfW && Math.abs(z - cz) <= halfD) {
        return ob;
      }
    }
  }
  return null;
}

// Robot bodies in app units: their real sizes at the active scan's meters per app unit
// (shared/robots.js). Used for collisions, the walls, LiDAR and corner checks.
const robotBody = type => bodySize(type, calibration.metersPerUnit);
const amrHalfWidth = () => robotBody('amr').halfWidth; // outer edge of the wheels
const g1Radius = () => robotBody('humanoid').radius;
const droneReach = () => robotBody('drone').radius; // rotor tips

// Keeps a point at least `radius` inside the environment limits.
function clampInsideLimits(p, radius) {
  const limits = getEnvironmentLimits();
  p.x = Math.max(limits.minX + radius, Math.min(limits.maxX - radius, p.x));
  p.z = Math.max(limits.minZ + radius, Math.min(limits.maxZ - radius, p.z));
}

// Physical Hard Barrier Resolver: Prevents any robot from clipping into an obstacle
function resolveObstacleCollisions(pos, radius = 0.26) {
  const limits = getEnvironmentLimits();

  // Clamp within room walls first
  pos.x = Math.max(limits.minX + radius, Math.min(limits.maxX - radius, pos.x));
  pos.z = Math.max(limits.minZ + radius, Math.min(limits.maxZ - radius, pos.z));

  // Check and push out of every obstacle box or exact 3D building/water polygon
  for (let ob of obstacleBoxes) {
    if (!ob || ob.isWalkwayNetwork) continue;
    if (!boundariesVisible && !ob.userCreated && !ob.hardcoded && !ob.permanentSolid) continue;
    if (Array.isArray(ob.pts) && ob.pts.length >= 3) {
      resolvePolygonCollision(pos, radius, ob);
      continue;
    }
    const cx = (ob.minX + ob.maxX) / 2;
    const cz = (ob.minZ + ob.maxZ) / 2;
    const hw = (ob.maxX - ob.minX) / 2 + radius;
    const hd = (ob.maxZ - ob.minZ) / 2 + radius;

    const dx = pos.x - cx;
    const dz = pos.z - cz;

    if (ob.rotY) {
      const rad = THREE.MathUtils.degToRad(-ob.rotY);
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      let lx = dx * cos - dz * sin;
      let lz = dx * sin + dz * cos;

      if (Math.abs(lx) < hw && Math.abs(lz) < hd) {
        // Overlap detected: push out along the minimum penetration axis
        const penX = hw - Math.abs(lx);
        const penZ = hd - Math.abs(lz);

        if (penX < penZ) {
          lx = (lx >= 0 ? 1 : -1) * hw;
        } else {
          lz = (lz >= 0 ? 1 : -1) * hd;
        }

        const radW = THREE.MathUtils.degToRad(ob.rotY);
        const cosW = Math.cos(radW);
        const sinW = Math.sin(radW);
        pos.x = cx + lx * cosW - lz * sinW;
        pos.z = cz + lx * sinW + lz * cosW;
      }
    } else {
      if (Math.abs(dx) < hw && Math.abs(dz) < hd) {
        const penX = hw - Math.abs(dx);
        const penZ = hd - Math.abs(dz);

        if (penX < penZ) {
          pos.x = cx + (dx >= 0 ? 1 : -1) * hw;
        } else {
          pos.z = cz + (dz >= 0 ? 1 : -1) * hd;
        }
      }
    }
  }

  pos.x = Math.max(limits.minX + radius, Math.min(limits.maxX - radius, pos.x));
  pos.z = Math.max(limits.minZ + radius, Math.min(limits.maxZ - radius, pos.z));
}

// Whether a ground robot can be planned to (x, z): it is clear of every keep-out box (rotation
// included) and wall by the planner's safety margin (shared/astar.js).
function isTargetBlocked(x, z) {
  localAStar.setBounds(getEnvironmentLimits());
  return localAStar.isBlocked(x, z, obstacleBoxes);
}

// The nearest point a ground robot can be planned to (see isTargetBlocked). Searching the
// planner's grid, unlike pushing the point out of one box along one axis, can't end up outside
// the room and be clamped back into the box, or inside a neighboring box.
function findNearestSafePoint(x, z) {
  localAStar.setBounds(getEnvironmentLimits());
  const free = localAStar.nearestFreePoint(x, z, obstacleBoxes);
  if (free) return { x: free.x, z: free.z };
  const limits = getEnvironmentLimits();
  const pt = {
    x: Math.max(limits.minX + 0.35, Math.min(limits.maxX - 0.35, x)),
    z: Math.max(limits.minZ + 0.35, Math.min(limits.maxZ - 0.35, z))
  };
  resolveObstacleCollisions(pt, 0.35);
  return { x: pt.x, z: pt.z };
}

// ============================================================
// 3D REAL-TIME LIDAR RAYCASTER & AI A* DETOUR ENGINE
// ============================================================

// Check if straight line between fromPos and toPos intersects any keep-out obstacle or solid building polygon
function isPathObstructed(fromPos, toPos, boxes, padding = 0.32) {
  const dist = Math.hypot(toPos.x - fromPos.x, toPos.z - fromPos.z);
  if (dist < 0.25) return false;
  if (Array.isArray(boxes)) {
    for (const ob of boxes) {
      if (!ob || ob.isWalkwayNetwork) continue;
      if (!boundariesVisible && !ob.userCreated && !ob.hardcoded && !ob.permanentSolid) continue;
      if (Array.isArray(ob.pts) && ob.pts.length >= 3) {
        if (segmentHitsPolygon(fromPos, toPos, ob, padding)) return true;
      }
    }
  }
  const steps = Math.max(4, Math.ceil(dist / 0.15));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const testX = fromPos.x + t * (toPos.x - fromPos.x);
    const testZ = fromPos.z + t * (toPos.z - fromPos.z);
    if (isInsideObstacle(testX, testZ, padding)) {
      return true;
    }
  }
  return false;
}

// Exact 2D raycaster against boundary walls and oriented 3D obstacle boxes
function castLidarRay(ox, oz, dx, dz, maxDist, boxes, limits) {
  let closestDist = maxDist;
  let hitType = 'none';
  const hitPoint = { x: ox + dx * maxDist, z: oz + dz * maxDist };

  // 1. Raycast against boundary limits
  if (dx > 0) {
    const t = (limits.maxX - ox) / dx;
    if (t > 0 && t < closestDist) {
      const z = oz + dz * t;
      if (z >= limits.minZ && z <= limits.maxZ) {
        closestDist = t;
        hitPoint.x = limits.maxX;
        hitPoint.z = z;
        hitType = 'wall';
      }
    }
  } else if (dx < 0) {
    const t = (limits.minX - ox) / dx;
    if (t > 0 && t < closestDist) {
      const z = oz + dz * t;
      if (z >= limits.minZ && z <= limits.maxZ) {
        closestDist = t;
        hitPoint.x = limits.minX;
        hitPoint.z = z;
        hitType = 'wall';
      }
    }
  }

  if (dz > 0) {
    const t = (limits.maxZ - oz) / dz;
    if (t > 0 && t < closestDist) {
      const x = ox + dx * t;
      if (x >= limits.minX && x <= limits.maxX) {
        closestDist = t;
        hitPoint.x = x;
        hitPoint.z = limits.maxZ;
        hitType = 'wall';
      }
    }
  } else if (dz < 0) {
    const t = (limits.minZ - oz) / dz;
    if (t > 0 && t < closestDist) {
      const x = ox + dx * t;
      if (x >= limits.minX && x <= limits.maxX) {
        closestDist = t;
        hitPoint.x = x;
        hitPoint.z = limits.minZ;
        hitType = 'wall';
      }
    }
  }

  // 2. Raycast against obstacle boxes and exact 3D building/fountain polygons
  for (const ob of boxes) {
    if (!ob || ob.isWalkwayNetwork) continue;
    if (!boundariesVisible && !ob.userCreated && !ob.hardcoded && !ob.permanentSolid) continue;
    if (Array.isArray(ob.pts) && ob.pts.length >= 3) {
      const polyHit = rayHitsPolygon(ox, oz, dx, dz, closestDist, ob);
      if (polyHit !== null && polyHit < closestDist) {
        closestDist = polyHit;
        hitPoint.x = ox + dx * polyHit;
        hitPoint.z = oz + dz * polyHit;
        hitType = 'obstacle';
      }
      continue;
    }
    const hw = (ob.maxX - ob.minX) / 2;
    const hd = (ob.maxZ - ob.minZ) / 2;
    const cx = (ob.minX + ob.maxX) / 2;
    const cz = (ob.minZ + ob.maxZ) / 2;

    const rx = ox - cx;
    const rz = oz - cz;
    let rox = rx;
    let roz = rz;
    let rdx = dx;
    let rdz = dz;

    if (ob.rotY) {
      const rad = THREE.MathUtils.degToRad(-ob.rotY);
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      rox = rx * cos - rz * sin;
      roz = rx * sin + rz * cos;
      rdx = dx * cos - dz * sin;
      rdz = dx * sin + dz * cos;
    }

    let t1x = -Infinity, t2x = Infinity;
    if (Math.abs(rdx) > 1e-6) {
      t1x = (-hw - rox) / rdx;
      t2x = (hw - rox) / rdx;
      if (t1x > t2x) { const tmp = t1x; t1x = t2x; t2x = tmp; }
    } else {
      if (rox < -hw || rox > hw) continue;
    }

    let t1z = -Infinity, t2z = Infinity;
    if (Math.abs(rdz) > 1e-6) {
      t1z = (-hd - roz) / rdz;
      t2z = (hd - roz) / rdz;
      if (t1z > t2z) { const tmp = t1z; t1z = t2z; t2z = tmp; }
    } else {
      if (roz < -hd || roz > hd) continue;
    }

    const tEntry = Math.max(t1x, t1z);
    const tExit = Math.min(t2x, t2z);

    if (tEntry > tExit || tExit < 0) continue;
    const tHit = tEntry > 0 ? tEntry : 0;
    if (tHit < closestDist) {
      closestDist = tHit;
      hitPoint.x = ox + dx * tHit;
      hitPoint.z = oz + dz * tHit;
      hitType = 'obstacle';
    }
  }

  // 3. Raycast against active pedestrians (circular obstacles, radius ~0.24m)
  if (pedestrianSwarm && pedestrianSwarm.active && pedestrianSwarm.activeCampusScan) {
    const peds = pedestrianSwarm.getSeparationBodies();
    for (let i = 0; i < peds.length; i++) {
      const ped = peds[i];
      const fx = ox - ped.x;
      const fz = oz - ped.z;
      const a = dx * dx + dz * dz;
      const b = 2 * (fx * dx + fz * dz);
      const c = (fx * fx + fz * fz) - 0.0576;
      const discriminant = b * b - 4 * a * c;
      if (discriminant >= 0) {
        const sqrtD = Math.sqrt(discriminant);
        const t1 = (-b - sqrtD) / (2 * a);
        if (t1 > 0 && t1 < closestDist) {
          closestDist = t1;
          hitPoint.x = ox + dx * t1;
          hitPoint.z = oz + dz * t1;
          hitType = 'pedestrian';
        }
      }
    }
  }

  return { dist: closestDist, point: hitPoint, hitType };
}

// Renders the AI A* detour ribbon on the floor
function renderDetourRibbon(r) {
  if (!r.detourWaypoints || r.detourWaypoints.length < 2) return;
  clearDetourRibbon(r.id);

  const group = new THREE.Group();
  group.name = `detour_ribbon_${r.id}`;

  const pts = r.detourWaypoints.map(p => new THREE.Vector3(p.x, 0.045, p.z));
  const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
  const lineMat = new THREE.LineDashedMaterial({
    color: 0x10b981, // Neon emerald AI path
    dashSize: 0.25,
    gapSize: 0.12,
    transparent: true,
    opacity: 0.95
  });
  const line = new THREE.Line(lineGeo, lineMat);
  line.computeLineDistances();
  group.add(line);

  // Detour corner waypoint markers
  pts.forEach((pt, idx) => {
    if (idx === 0 || idx === pts.length - 1) return;
    const ringGeo = new THREE.RingGeometry(0.08, 0.14, 16);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(pt.x, 0.046, pt.z);
    group.add(ring);
  });

  scene.add(group);
  detourRibbons[r.id] = group;
}

function clearDetourRibbon(robotId) {
  if (detourRibbons[robotId]) {
    const group = detourRibbons[robotId];
    group.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    });
    scene.remove(group);
    delete detourRibbons[robotId];
  }
}

// Plan an A* path while snapping start/goal points that sit inside a dock/station/building safety margin
// to the nearest walkable sidewalk cell so station/dock departures and arrivals always find a valid route.
function findPathWithStationSnap(startPos, goalPos, boxes, allowGoalSnap = true) {
  localAStar.setBounds(getEnvironmentLimits());
  let plan = localAStar.findPath(startPos, goalPos, boxes);
  if (!plan.success) {
    const startBlocked = localAStar.isBlocked(startPos.x, startPos.z, boxes);
    const goalBlocked = allowGoalSnap && localAStar.isBlocked(goalPos.x, goalPos.z, boxes);
    if (startBlocked || goalBlocked) {
      const safeStart = startBlocked
        ? (localAStar.nearestFreePoint(startPos.x, startPos.z, boxes) || findNearestSafePoint(startPos.x, startPos.z))
        : { x: startPos.x, z: startPos.z };
      const safeGoal = goalBlocked
        ? (localAStar.nearestFreePoint(goalPos.x, goalPos.z, boxes) || findNearestSafePoint(goalPos.x, goalPos.z))
        : { x: goalPos.x, z: goalPos.z };
      plan = localAStar.findPath(safeStart, safeGoal, boxes);
      if (plan.success && plan.waypoints && plan.waypoints.length >= 2) {
        if (Math.hypot(safeStart.x - startPos.x, safeStart.z - startPos.z) > 0.05) {
          plan.waypoints.unshift({ x: startPos.x, y: 0.05, z: startPos.z });
        } else {
          plan.waypoints[0] = { x: startPos.x, y: 0.05, z: startPos.z };
        }
        const last = plan.waypoints[plan.waypoints.length - 1];
        if (!localAStar.isBlocked(goalPos.x, goalPos.z, boxes, 0) && Math.hypot(last.x - goalPos.x, last.z - goalPos.z) > 0.02) {
          plan.waypoints.push({ x: goalPos.x, y: 0.05, z: goalPos.z });
        }
      }
    }
  }
  return plan;
}

// Trigger AI A* Detour around keep-out obstacles
function triggerAStarDetour(r) {
  if (r.type !== 'amr') return;
  // Always throttle detour re-planning to prevent 60Hz loop thrashing
  r.detourCooldown = 2.0;
  const plan = findPathWithStationSnap(r.position, r.target, obstacleBoxes, true);
  if (plan.success && plan.waypoints && plan.waypoints.length > 2) {
    r.detourWaypoints = plan.waypoints;
    r.detourIdx = 1; // 0 is current position
    r.isDetouring = true;
    r.detourSource = 'reactive';
    r.detourCooldown = 3.5; // Longer cooldown while executing active detour
    renderDetourRibbon(r);
    if (typeof appendRoverChatMessage === 'function') {
      appendRoverChatMessage(r.id, `🚜 ${r.name}`, `⚠️ LiDAR Alert: Keep-Out Zone obstructing waypoint! AI A* Heuristic Search computed a ${plan.waypoints.length - 2}-point detour route.`);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Robot-to-robot yielding (rule in shared/separation.js). Each frame an AMR or the G1 slows for,
// and stops short of, robots in its lane; a lower-priority robot stops further back. A robot held
// for 2 s (the higher-priority one of a pair: 4 s) breaks the deadlock: it skips a waypoint another
// robot is parked on, re-plans around the robots near it, or, when there is no way around, retraces
// its own recent path until it is out of the other robot's way (asking a robot behind it to back
// up too). A robot never acts against a robot that is backing away for it; it follows instead.

// A robot as the yielding rule sees it.
function separationBody(r) {
  return {
    id: r.id,
    type: r.type,
    x: r.position.x,
    y: r.position.y,
    z: r.position.z,
    heading: r.heading,
    metersPerUnit: calibration.metersPerUnit,
    manual: !!(r.isManualDrive || r.isManualFlight),
    onMission: !!r.isCustomMission,
    parked: r.speed < 0.05 && !r.heldBy, // stopped for its own reasons (docked, arrived, E-stop)
    heldBy: r.heldBy || null,
    givingWayTo: r.givingWayTime > 0 ? r.givingWayTo : null,
    retreatingFrom: r.retreatTime > 0 && !r.isManualDrive ? r.retreatFrom : null
  };
}

// Returns this frame's forward speed factor (0 to 1) for a ground robot, and runs the deadlock
// breaker and retreating.
function updateYielding(r, delta) {
  if (r.givingWayTime > 0) r.givingWayTime -= delta;
  if (r.retreatTime > 0) {
    retreat(r, delta);
    return 0;
  }
  recordTrail(r);
  const me = separationBody(r);
  const otherBodies = robotDefs.filter(o => {
    if (o === r) return false;
    // Never yield to AMRs that are already parked in their Home Docks (off the active lane)
    if (o.status && o.status.includes('Docked')) return false;
    return true;
  }).map(separationBody);
  if (pedestrianSwarm && pedestrianSwarm.active && pedestrianSwarm.activeCampusScan) {
    const pedBodies = pedestrianSwarm.getSeparationBodies();
    for (let i = 0; i < pedBodies.length; i++) {
      pedBodies[i].metersPerUnit = calibration.metersPerUnit;
      otherBodies.push(pedBodies[i]);
    }
  }
  const { factor, holder } = speedFactor(me, otherBodies);
  if (holder && holder.type === 'pedestrian' && factor < 1) {
    if (r.status !== 'Yielding to Pedestrian') {
      r.statusBeforeYield = r.status;
      r.status = 'Yielding to Pedestrian';
      if (pedestrianSwarm) pedestrianSwarm.recordYield();
    }
  }
  if (factor >= SEPARATION.HELD_FACTOR || !holder) {
    if (r.heldBy) {
      r.heldBy = null;
      r.heldTime = 0;
      if (r.status && r.status.startsWith('Yielding')) r.status = r.statusBeforeYield || r.status;
    }
    if (r.status === 'Yielding to Pedestrian') {
      r.status = r.statusBeforeYield || 'Autonomous Cruising';
    }
    return factor;
  }
  // Held: the timer counts how long this robot has been held at all, even if the robot holding it
  // changes (caught between two robots), so the deadlock breaker still gets its turn.
  if (!r.heldBy) {
    r.heldTime = 0;
    if (!r.status || !r.status.startsWith('Yielding')) r.statusBeforeYield = r.status;
  }
  r.heldBy = holder.id;
  r.status = `Yielding to ${holder.id}`;
  r.heldTime += delta;
  if (r.heldTime >= deadlockWait(me, holder)) {
    r.heldTime = 0; // give the remedy time to work before trying again
    breakDeadlock(r, robotDefs.find(o => o.id === holder.id));
  }
  return factor; // crawling (or stopped) behind the holder
}

// The other robot as a temporary keep-out box, grown so that a route the planner finds around it
// also keeps this robot out of the other's lane check.
function robotKeepOutBox(r, other) {
  const f = footprint(separationBody(other));
  const reach = f.kind === 'rect' ? Math.hypot(f.halfWidth, f.halfLength) : f.radius;
  const myHalfWidth = amrHalfWidth();
  const size = reach + Math.max(0, myHalfWidth + SEPARATION.MIN_GAP - localAStar.safetyMargin);
  return { name: `Robot ${other.id}`, minX: other.position.x - size, maxX: other.position.x + size, minZ: other.position.z - size, maxZ: other.position.z + size };
}

function breakDeadlock(r, other) {
  const otherId = (other && other.id) || r.heldBy || 'obstacle';
  const nearbyRadius = isCampusScan(activeScan) ? 0.85 : 2.0;
  // Every active robot near this one is a temporary keep-out box; a drone only when it is low
  // enough to hit. Ignore AMRs already parked in their Home Docks so they don't wall off adjacent bays.
  const nearby = robotDefs.filter(o => o !== r && (o.type !== 'drone' || o.position.y < 1.4) &&
    !(o.status && o.status.includes('Docked')) &&
    Math.hypot(o.position.x - r.position.x, o.position.z - r.position.z) < nearbyRadius);
  const boxes = nearby.map(o => ({ robot: o, box: robotKeepOutBox(r, o) }));
  const m = localAStar.safetyMargin;
  const t = r.target;
  // 1. Another robot is parked on this robot's next waypoint: skip that waypoint.
  const onTarget = boxes.find(({ box }) => t.x > box.minX - m && t.x < box.maxX + m && t.z > box.minZ - m && t.z < box.maxZ + m);
  if (onTarget && !r.isCustomMission && r.waypoints && r.waypoints.length > 1) {
    robotChat(r, `⏭️ Waypoint #${r.waypointIdx + 1} is occupied by ${onTarget.robot.id}. Skipping to the next one.`);
    r.waypointIdx = (r.waypointIdx + 1) % r.waypoints.length;
    r.target.copy(r.waypoints[r.waypointIdx]);
    return;
  }
  // 2. Re-plan around the robots near it (unless we already tried a yield detour and are still held,
  // or our current position is already inside the blocking robot's keep-out box).
  const alreadyTriedDetour = (r.givingWayTime > 0 && r.detourSource === 'yield');
  const startInRobotBox = boxes.some(({ box }) => localAStar.isBlocked(r.position.x, r.position.z, [box]));
  if (!alreadyTriedDetour && !startInRobotBox) {
    const plan = findPathWithStationSnap(r.position, r.target, [...obstacleBoxes, ...boxes.map(b => b.box)], Boolean(r.isCustomMission));
    if (plan.success) {
      r.isDetouring = plan.waypoints.length > 2;
      r.detourWaypoints = r.isDetouring ? plan.waypoints : null;
      r.detourIdx = 1;
      r.detourSource = 'yield';
      clearDetourRibbon(r.id);
      if (r.isDetouring) renderDetourRibbon(r);
      r.givingWayTo = otherId;
      r.givingWayTime = SEPARATION.GIVE_WAY_S;
      robotChat(r, `↪️ Giving way to ${otherId}: taking another route.`);
      return;
    }
  }
  // 3. No way around: retrace this robot's own path until the other robot can pass.
  startRetreat(r, other);
  robotChat(r, `↩️ Giving way to ${otherId}: backing up the way I came to make room.`);
}

// Starts retracing the trail, making room for `other` (with no trail, backs straight away from it,
// briefly).
function startRetreat(r, other) {
  const otherId = (other && other.id) || r.heldBy || null;
  r.retreatTime = r.trail && r.trail.length ? SEPARATION.RETREAT_MAX_S : SEPARATION.DEADLOCK_S;
  r.retreatFrom = otherId;
  r.retreatBlocked = 0;
  r.retreatPushed = false;
  r.retreatDir = undefined;
  r.retreatLast = null;
  r.givingWayTo = otherId;
  r.givingWayTime = SEPARATION.RETREAT_MAX_S + SEPARATION.GIVE_WAY_S;
  r.heldBy = null;
  r.heldTime = 0;
}

// The robot's recent path, newest last, one point every 10 cm, up to TRAIL_M long. A jump (the
// robot was placed somewhere else) starts a new trail.
function recordTrail(r) {
  const trail = r.trail || (r.trail = []);
  const last = trail[trail.length - 1];
  const d = last ? Math.hypot(r.position.x - last.x, r.position.z - last.z) : Infinity;
  if (d > 0.5) trail.length = 0;
  if (d >= 0.1) trail.push({ x: r.position.x, z: r.position.z });
  if (trail.length > SEPARATION.TRAIL_M / 0.1) trail.shift();
}

// A robot as the yielding rule sees it, facing the way it is actually moving (backwards while
// it retreats).
function movingBody(r) {
  const body = separationBody(r);
  if (r.retreatTime > 0 && r.retreatDir !== undefined) body.heading = r.retreatDir;
  return body;
}

// Retraces the trail (only as fast as nothing is in the way) until this robot is out of the other
// robot's way, or time is up; then plans the current leg again. The path it came by is free of
// walls and keep-out boxes, so retracing it is safe; past its end, the robot backs straight away
// (walls still push it back as usual). A moving robot behind it that blocks it is asked to back up
// too, once; if it is still blocked (by a robot, a wall or a box) DEADLOCK_S later, the retreat
// ends, so the robots waiting for it run their own deadlock breakers.
function retreat(r, delta) {
  r.retreatTime -= delta;
  // How far it actually got since last frame (walls and keep-out boxes push it back as usual).
  const moved = r.retreatLast ? Math.hypot(r.position.x - r.retreatLast.x, r.position.z - r.retreatLast.z) : Infinity;
  r.retreatLast = { x: r.position.x, z: r.position.z };
  const other = robotDefs.find(o => o.id === r.retreatFrom);
  const trail = r.trail || [];
  while (trail.length && Math.hypot(trail[trail.length - 1].x - r.position.x, trail[trail.length - 1].z - r.position.z) < 0.03) trail.pop();
  const clear = !other || speedFactor(movingBody(other), [separationBody(r)]).factor >= 1;
  if (clear || r.retreatTime <= 0) {
    r.retreatTime = 0;
    r.givingWayTime = SEPARATION.GIVE_WAY_S;
    r.plannedLegKey = null;
    r.isDetouring = false;
    r.detourWaypoints = null;
    clearDetourRibbon(r.id);
    if (r.status && r.status.startsWith('Yielding')) {
      r.status = r.statusBeforeYield || ((r.isCustomMission && r.missionStationName) ? `En Route: ${r.missionStationName}` : 'Patrolling');
    }
    if (r.isCustomMission && (r.type === 'amr' || r.type === 'humanoid')) {
      planWaypointLeg(r);
    }
    return;
  }
  // The next trail point back, or straight away from the other robot when the trail is used up or
  // leads toward it (the robot turned around since it came that way).
  const away = { x: 2 * r.position.x - other.position.x, z: 2 * r.position.z - other.position.z };
  let p = trail[trail.length - 1];
  if (p && (p.x - r.position.x) * (other.position.x - r.position.x) + (p.z - r.position.z) * (other.position.z - r.position.z) > 0) {
    trail.length = 0;
    p = null;
  }
  if (!p) {
    p = away;
    r.retreatTime = Math.min(r.retreatTime, SEPARATION.DEADLOCK_S);
  }
  const dist = Math.hypot(p.x - r.position.x, p.z - r.position.z);
  const dir = Math.atan2(p.x - r.position.x, p.z - r.position.z);
  r.retreatDir = dir;
  const { factor: room, holder: behind } = speedFactor({ ...separationBody(r), heading: dir }, robotDefs.filter(o => o !== r).map(separationBody));
  if (room < SEPARATION.HELD_FACTOR || moved < 0.2 * SEPARATION.RETREAT_SPEED * delta) {
    r.retreatBlocked = (r.retreatBlocked || 0) + delta;
    const b = behind && robotDefs.find(o => o.id === behind.id);
    if (room < SEPARATION.HELD_FACTOR && !r.retreatPushed && r.retreatBlocked >= 0.5 && b && b !== other && (b.type === 'amr' || b.type === 'humanoid') &&
        !behind.parked && !(b.retreatTime > 0) && !b.isManualDrive) {
      r.retreatPushed = true;
      r.retreatBlocked = 0;
      startRetreat(b, r);
      robotChat(b, `↩️ ${r.id} is backing up toward me: backing up too to make room.`);
    } else if (r.retreatBlocked >= SEPARATION.DEADLOCK_S) {
      r.retreatTime = Math.min(r.retreatTime, 1e-6);
    }
  } else {
    r.retreatBlocked = 0;
  }
  const step = Math.min(SEPARATION.RETREAT_SPEED * delta * room, dist);
  r.position.x += Math.sin(dir) * step;
  r.position.z += Math.cos(dir) * step;
}

// Posts to the robot's own dashboard chat (rover or G1).
function robotChat(r, text) {
  if (r.type === 'humanoid') {
    if (typeof appendG1ChatMessage === 'function') appendG1ChatMessage(`🤖 ${r.name}`, text);
  } else if (typeof appendRoverChatMessage === 'function') {
    appendRoverChatMessage(r.id, `🚜 ${r.name}`, text);
  }
}

// Waypoint routes (manual ones and the default patrols): each leg to the next waypoint is planned
// with the shared A* planner when it starts, around the same keep-out zones and walls as AI
// planner jobs, instead of driving straight until something is in the way. A leg that bends is
// followed through the detour code; a straight leg is driven directly. Returns false when there
// is no route to the waypoint.
function planWaypointLeg(r) {
  const allowGoalSnap = Boolean(r.isCustomMission || !localAStar.isBlocked(r.target.x, r.target.z, obstacleBoxes, 0));
  const plan = findPathWithStationSnap(r.position, r.target, obstacleBoxes, allowGoalSnap);
  r.isDetouring = false;
  r.detourWaypoints = null;
  clearDetourRibbon(r.id);
  if (!plan.success) return false;
  if (plan.waypoints.length > 2) {
    r.detourWaypoints = plan.waypoints;
    r.detourIdx = 1; // 0 is the current position
    r.isDetouring = true;
    r.detourSource = 'plan';
    renderDetourRibbon(r);
  }
  return true;
}

// 3D LiDAR Visualizer Line & Impact Dot Buffers
let lidarLinesMesh = null;
let lidarPointsMesh = null;
const MAX_LIDAR_RAYS = 120; // up to 4 robots x 30 rays
const lidarLinePositions = new Float32Array(MAX_LIDAR_RAYS * 2 * 3);
const lidarLineColors = new Float32Array(MAX_LIDAR_RAYS * 2 * 3);
const lidarPointPositions = new Float32Array(MAX_LIDAR_RAYS * 3);
const lidarPointColors = new Float32Array(MAX_LIDAR_RAYS * 3);

function initLidarVisualizer() {
  if (lidarVisualizerGroup) return;
  lidarVisualizerGroup = new THREE.Group();
  lidarVisualizerGroup.name = 'lidarVisualizerGroup';

  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(lidarLinePositions, 3));
  lineGeo.setAttribute('color', new THREE.BufferAttribute(lidarLineColors, 3));
  const lineMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.65,
    blending: THREE.AdditiveBlending
  });
  lineGeo.setDrawRange(0, 0);
  lidarLinesMesh = new THREE.LineSegments(lineGeo, lineMat);
  lidarVisualizerGroup.add(lidarLinesMesh);

  const ptsGeo = new THREE.BufferGeometry();
  ptsGeo.setAttribute('position', new THREE.BufferAttribute(lidarPointPositions, 3));
  ptsGeo.setAttribute('color', new THREE.BufferAttribute(lidarPointColors, 3));
  const ptsMat = new THREE.PointsMaterial({
    size: 0.08,
    vertexColors: true,
    transparent: true,
    opacity: 0.95
  });
  ptsGeo.setDrawRange(0, 0);
  lidarPointsMesh = new THREE.Points(ptsGeo, ptsMat);
  lidarVisualizerGroup.add(lidarPointsMesh);

  scene.add(lidarVisualizerGroup);
}

const LIDAR_ANGLES_DEG = [
  -80, -73.3, -66.7, -60, -53.3, -46.7, -40, -33.3, -26.7, -20, -13.3, -6.7, 0,
  6.7, 13.3, 20, 26.7, 33.3, 40, 46.7, 53.3, 60, 66.7, 73.3, 80,
  -135, 180, 135
];

function updateLidarVisualizerAndAI(delta) {
  if (!lidarVisualizerGroup) return;
  lidarVisualizerGroup.visible = lidarBeamsVisible;

  let vertexIdx = 0;
  let ptIdx = 0;

  const limits = getEnvironmentLimits();
  const maxRange = 3.5;

  robotDefs.forEach(r => {
    if (r.type !== 'amr') return;
    if (r.enabled === false) {
      r.minLidarDist = maxRange;
      r.forwardLidarDist = maxRange;
      r.lidarHits = [];
      return;
    }

    const isRobotLidarOn = (r.lidarActive !== false);
    if (!isRobotLidarOn) {
      r.minLidarDist = maxRange;
      r.forwardLidarDist = maxRange;
      r.lidarHits = [];
      return;
    }

    // Show visual beams for selected robot or inspected rover in active dashboard
    const isFocused = (r.id === selectedRobotId || (typeof activeRoverId !== 'undefined' && r.id === activeRoverId));
    const showBeams = lidarBeamsVisible && isFocused && (r.enabled !== false);
    const ox = r.position.x;
    const oz = r.position.z;
    const oy = 0.22;

    let minDist = maxRange;
    let frontDist = maxRange;
    // Where the forward rays hit something, for the safety layer under planned paths.
    const lidarHits = [];

    for (let i = 0; i < LIDAR_ANGLES_DEG.length; i++) {
      const deg = LIDAR_ANGLES_DEG[i];
      const rad = THREE.MathUtils.degToRad(deg);
      const rayAngle = r.heading + rad;
      const dx = Math.sin(rayAngle);
      const dz = Math.cos(rayAngle);

      const hit = castLidarRay(ox, oz, dx, dz, maxRange, obstacleBoxes, limits);

      if (hit.dist < minDist) minDist = hit.dist;
      if (Math.abs(deg) <= 35 && hit.dist < frontDist) {
        frontDist = hit.dist;
      }
      if (Math.abs(deg) < 90 && hit.hitType !== 'none') {
        lidarHits.push({ x: ox + dx * hit.dist, z: oz + dz * hit.dist });
      }

      if (showBeams && vertexIdx + 2 <= MAX_LIDAR_RAYS * 2) {
        // Color classification: Green / Amber / Red
        let cr = 0.29, cg = 0.87, cb = 0.50; // Neon green
        if (hit.dist < 0.9) {
          cr = 0.94; cg = 0.27; cb = 0.27; // Bright red
        } else if (hit.dist < 2.0) {
          cr = 0.96; cg = 0.62; cb = 0.04; // Warning amber
        }

        const v1 = vertexIdx * 3;
        lidarLinePositions[v1] = ox;
        lidarLinePositions[v1 + 1] = oy;
        lidarLinePositions[v1 + 2] = oz;
        lidarLineColors[v1] = cr;
        lidarLineColors[v1 + 1] = cg;
        lidarLineColors[v1 + 2] = cb;

        const v2 = (vertexIdx + 1) * 3;
        lidarLinePositions[v2] = hit.point.x;
        lidarLinePositions[v2 + 1] = oy;
        lidarLinePositions[v2 + 2] = hit.point.z;
        lidarLineColors[v2] = cr;
        lidarLineColors[v2 + 1] = cg;
        lidarLineColors[v2 + 2] = cb;

        vertexIdx += 2;

        if (hit.dist < maxRange - 0.05 && ptIdx < MAX_LIDAR_RAYS) {
          const p = ptIdx * 3;
          lidarPointPositions[p] = hit.point.x;
          lidarPointPositions[p + 1] = oy;
          lidarPointPositions[p + 2] = hit.point.z;
          lidarPointColors[p] = cr;
          lidarPointColors[p + 1] = cg;
          lidarPointColors[p + 2] = cb;
          ptIdx++;
        }
      }
    }

    r.minLidarDist = minDist;
    r.forwardLidarDist = frontDist;
    r.lidarHits = lidarHits;
  });

  // Always update GPU draw range and buffers so disabling LiDAR immediately clears beams
  if (lidarVisualizerGroup) {
    // Zero out unused buffer tail
    for (let i = vertexIdx * 3; i < MAX_LIDAR_RAYS * 2 * 3; i++) {
      lidarLinePositions[i] = 0;
      lidarLineColors[i] = 0;
    }
    for (let i = ptIdx * 3; i < MAX_LIDAR_RAYS * 3; i++) {
      lidarPointPositions[i] = 0;
      lidarPointColors[i] = 0;
    }

    if (lidarLinesMesh) {
      lidarLinesMesh.geometry.setDrawRange(0, vertexIdx);
      lidarLinesMesh.geometry.attributes.position.needsUpdate = true;
      lidarLinesMesh.geometry.attributes.color.needsUpdate = true;
    }
    if (lidarPointsMesh) {
      lidarPointsMesh.geometry.setDrawRange(0, ptIdx);
      lidarPointsMesh.geometry.attributes.position.needsUpdate = true;
      lidarPointsMesh.geometry.attributes.color.needsUpdate = true;
    }
  }
}

function applyMeshTransform() {
  syncCampusGeometryTransform();
  if (!labModel) return;
  labModel.scale.set(calibration.meshScale, calibration.meshScale, calibration.meshScale);
  labModel.rotation.y = THREE.MathUtils.degToRad(calibration.meshRotY);
  labModel.position.x = calibration.meshOffsetX;
  labModel.position.y = (calibration.meshOffsetY !== undefined) ? calibration.meshOffsetY : 0.0;
  labModel.position.z = calibration.meshOffsetZ;
}

// Every robot at its real size on this scan, and the planner's clearance to match.
function applyRobotScale() {
  robotDefs.forEach(r => {
    if (r.mesh) r.mesh.scale.set(...modelScale(r.type, calibration.metersPerUnit));
  });
  applyPlannerClearance();
}

// The planner keeps routes far enough from boxes and walls for the widest ground robot at this
// scan's size (the AI planner gets the same clearance with each request). When it changes, every
// robot's current leg and the AI planner's routes are planned again.
function applyPlannerClearance() {
  const clearance = plannerClearance(calibration.metersPerUnit);
  if (clearance === localAStar.safetyMargin) return;
  localAStar.safetyMargin = clearance;
  replanAllLegs();
  invalidateFleetSchedule();
}

function updateHeaderForScan(scan) {
  const badgeTitle = document.querySelector('.brand-badge h1');
  const badgeSubtitle = document.querySelector('.brand-badge p');
  if (!badgeTitle || !badgeSubtitle) return;
  if (scan === 'mdc_north_campus_osm.glb') {
    badgeTitle.innerHTML = 'MDC North Campus <span>Twin (OSM CAD)</span>';
    badgeSubtitle.textContent = 'Autonomous Fleet Logistics + AnyLogic Bridge';
  } else if (scan === 'mdc_north_campus.glb') {
    badgeTitle.innerHTML = 'MDC North Campus <span>Twin</span>';
    badgeSubtitle.textContent = 'Polycam Photogrammetry + AnyLogic Sim Bridge';
  } else if (scan === 'scan_house.glb') {
    badgeTitle.innerHTML = 'House & Yard <span>Digital Twin</span>';
    badgeSubtitle.textContent = 'Residential Survey + AnyLogic Sim Bridge';
  } else {
    badgeTitle.innerHTML = 'Robotics Lab Classroom <span>Twin</span>';
    badgeSubtitle.textContent = 'Polycam Photogrammetry + AnyLogic Sim Bridge';
  }
}

function loadLabMesh(filename) {
  updateHeaderForScan(filename);
  const overlay = document.getElementById('loading-overlay');
  const progressText = document.getElementById('loading-progress');
  if (overlay) {
    overlay.style.display = 'flex';
    overlay.style.opacity = '1';
  }

  if (labModel) {
    scene.remove(labModel);
  }
  campusLakeWaterMesh = null;

  const loader = new GLTFLoader();
  loader.load(
    filename,
    (gltf) => {
      labModel = gltf.scene;

      const box = new THREE.Box3().setFromObject(labModel);
      const center = box.getCenter(new THREE.Vector3());

      labModel.traverse((child) => {
        if (child.isMesh) {
          child.geometry.translate(-center.x, -box.min.y, -center.z);
          child.castShadow = false;
          child.receiveShadow = false; // Photogrammetry scan already has baked lighting; removes massive GPU shadow shader overhead
          if (child.material) {
            child.material.side = (filename === 'mdc_north_campus_osm.glb') ? THREE.DoubleSide : THREE.FrontSide;
            child.material.roughness = 0.6;
          }

          if (isCampusScan(filename) && (child.name === 'map.osm_water' || (child.material && child.material.name === 'OSM_Lake_Water'))) {
            // Reconstruct pristine water surface matching the exact rectangular basin bounds and fountain center
            // Basin opening: X in [-1.80, 1.30], Z in [-0.59, 0.59]. Tuck 0.02m under rim to [-1.82, 1.32] and [-0.61, 0.61]
            const waterGeom = new THREE.PlaneGeometry(3.14, 1.22, 32, 16);
            waterGeom.rotateX(-Math.PI / 2);
            waterGeom.translate(-0.25, 0.048, 0.0);
            child.geometry.dispose();
            child.geometry = waterGeom;
            child.material = new THREE.MeshStandardMaterial({
              color: 0x0ea5e9, // Vibrant reflection water turquoise
              roughness: 0.08,
              metalness: 0.35,
              side: THREE.DoubleSide
            });
            campusLakeWaterMesh = child;
          }
        }
      });

      applyMeshTransform();
      scene.add(labModel);
      controls.target.set(0, 0.5, 0);

      if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => { overlay.style.display = 'none'; }, 600);
      }
      console.log(`Loaded ${filename} successfully!`);
    },
    (xhr) => {
      if (xhr.lengthComputable && progressText) {
        const percent = Math.round((xhr.loaded / xhr.total) * 100);
        progressText.innerText = `Loading mesh geometry & textures: ${percent}%`;
      }
    },
    (err) => {
      console.error('Error loading mesh:', err);
      if (progressText) progressText.innerText = 'Error loading mesh.';
      if (overlay) setTimeout(() => { overlay.style.display = 'none'; }, 2000);
    }
  );
}

function createRobotFleet() {
  robotDefs.forEach((r) => {
    let robotParts;
    if (r.type === 'drone') {
      robotParts = createDroneMesh(r.color, r.name);
      r.mesh = robotParts.group;
      r.propellers = robotParts.propellers;
      r.statusLight = robotParts.statusLight;
    } else if (r.type === 'humanoid') {
      robotParts = createUnitreeG1Mesh(r.color, r.name);
      r.mesh = robotParts.group;
      r.leftArm = robotParts.leftArm;
      r.rightArm = robotParts.rightArm;
      r.leftLeg = robotParts.leftLeg;
      r.rightLeg = robotParts.rightLeg;
      r.leftKnee = robotParts.leftKnee;
      r.rightKnee = robotParts.rightKnee;
      r.statusLight = robotParts.statusLight;
    } else {
      robotParts = createRobotMesh(r.color, r.name);
      r.mesh = robotParts.group;
      r.lidar = robotParts.lidar;
      r.statusLight = robotParts.statusLight;
      r.wheels = robotParts.wheels;
    }

    r.mesh.position.copy(r.position);
    r.mesh.rotation.y = r.heading;
    scene.add(r.mesh);
  });
  applyRobotScale();
}

function createTargetBeacon() {
  targetBeacon = new THREE.Group();

  const ringGeo = new THREE.RingGeometry(0.2, 0.28, 32);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  targetBeacon.add(ring);

  const light = new THREE.PointLight(0x38bdf8, 2, 4);
  light.position.y = 0.5;
  targetBeacon.add(light);

  targetBeacon.position.set(0, -10, 0);
  scene.add(targetBeacon);
}

// AnyLogic WebSocket Integration
// The server's view of the world, rebuilt from WORLD_STATE (deltas and snapshots). Shadow
// mode: nothing on screen uses it yet; window.getWorldState() shows it for inspection.
const worldMirror = createWorldStateMirror();
window.getWorldState = () => worldMirror.get();

// Applies messages from the simulation server (via net.js) to the local fleet.
function handleServerMessage(msg) {
  if (msg.type === 'WORLD_STATE') {
    worldMirror.apply(msg.data);
  } else if (msg.type === 'E_STOP') {
    emergencyStop(msg.data || {});
  } else if (msg.type === 'ROBOT_UPDATE') {
    const updatedList = msg.data.robots;
    updatedList.forEach(up => {
      const r = robotDefs.find(item => item.id === up.id);
      if (r) {
        r.position.x = up.x;
        r.position.z = up.z;
        if (up.heading !== undefined) r.heading = up.heading;
        if (up.status) r.status = up.status;
        if (up.battery !== undefined) r.battery = up.battery;
        if (up.speed !== undefined) r.speed = up.speed;
      }
    });
    updateFleetCards();
  }
}

// E_STOP from any console, relayed by the server: puts the robot (or every robot when no
// robotId is given) into braked manual standby or a held hover. It moves again only when an
// operator resumes or dispatches it. The manual modes set their own status text every frame,
// so the stop is recorded in r.lastEStop and shown in the dispatch banner.
function emergencyStop({ robotId, reason, source } = {}) {
  const stopped = robotDefs.filter(r => !robotId || r.id === robotId);
  stopped.forEach(r => {
    if (r.isDetouring) {
      r.isDetouring = false;
      r.detourWaypoints = null;
      clearDetourRibbon(r.id);
    }
    r.isCustomMission = false;
    if (r.type === 'drone') hoverDroneManual();
    else stopAmrManual(r.id);
    r.lastEStop = { at: performance.now(), source: source || null, reason: reason || null };
  });
  console.warn(`[E_STOP] ${stopped.map(r => r.id).join(', ') || 'no matching robot'} stopped` +
    (source ? ` by ${source}` : '') + (reason ? `: ${reason}` : ''));
  const banner = document.querySelector('.dispatch-banner');
  if (banner && stopped.length > 0) {
    banner.innerHTML = `<span>🛑 <b>E-STOP:</b> ${stopped.map(r => r.id).join(', ')} stopped${source ? ` by ${source}` : ''}.</span>`;
  }
  updateFleetCards();
}

// Shadow-mode telemetry: each robot's simulated state goes to the server's world model 5 times
// a second (ROBOT_TELEMETRY, latest class keyed by robot). The browser still owns the
// simulation; the server only mirrors it.
const TELEMETRY_INTERVAL_MS = 200;

function sendTelemetry() {
  if (!isOpen()) return; // don't queue stale positions while disconnected
  robotDefs.forEach(r => {
    send('ROBOT_TELEMETRY', {
      robotId: r.id,
      source: 'sim',
      x: +r.position.x.toFixed(3),
      y: +r.position.y.toFixed(3),
      z: +r.position.z.toFixed(3),
      heading: +(r.heading || 0).toFixed(4), // radians
      speed: +(r.speed || 0).toFixed(3),
      battery: +(r.battery || 0).toFixed(1),
      status: r.status
    });
  });
}

function updateFleetCards() {
  const container = document.getElementById('robot-cards-container');
  if (!container) return;

  if (!container.dataset.hasDelegatedListener) {
    container.dataset.hasDelegatedListener = 'true';
    container.addEventListener('click', (e) => {
      const toggleBtn = e.target.closest('.btn-card-toggle-enable');
      if (toggleBtn) {
        e.stopPropagation();
        const rid = toggleBtn.getAttribute('data-robot');
        const targetRobot = robotDefs.find(item => item.id === rid);
        if (targetRobot) {
          toggleRobotEnabled(rid, !(targetRobot.enabled !== false));
        }
        return;
      }
      const editBtn = e.target.closest('.btn-card-edit-wp');
      if (editBtn) {
        e.stopPropagation();
        const rid = editBtn.getAttribute('data-robot');
        if (rid) showAndEditWaypoints(rid);
        return;
      }
      const actBtn = e.target.closest('.btn-card-act-wp');
      if (actBtn) {
        e.stopPropagation();
        const rid = actBtn.getAttribute('data-robot');
        if (rid) activateAndHideWaypoints(rid);
        return;
      }
      const roverBtn = e.target.closest('.btn-open-rover-ctrl');
      if (roverBtn) {
        e.stopPropagation();
        const card = roverBtn.closest('.robot-card');
        const rid = card ? card.id.replace('robot-card-', '') : (selectedRobotId || 'AMR-01');
        selectedRobotId = rid;
        activeRoverId = rid;
        updateFleetCards();
        openRoverDashboard(rid);
        return;
      }
      const g1Btn = e.target.closest('.btn-open-g1-ctrl');
      if (g1Btn) {
        e.stopPropagation();
        selectedRobotId = 'HUM-01';
        updateFleetCards();
        openG1Dashboard();
        return;
      }
      const droneBtn = e.target.closest('.btn-open-drone-ctrl');
      if (droneBtn) {
        e.stopPropagation();
        selectedRobotId = 'UAV-01';
        updateFleetCards();
        openDroneDashboard();
        return;
      }

      const card = e.target.closest('.robot-card');
      if (card) {
        const rid = card.id.replace('robot-card-', '');
        selectedRobotId = rid;
        if (rid.startsWith('AMR-')) activeRoverId = rid;
        const dispatchLabel = document.getElementById('dispatch-target-name');
        const rObj = robotDefs.find(r => r.id === rid);
        if (dispatchLabel && rObj) dispatchLabel.innerText = `${rObj.name} (${rObj.id})`;
        updateFleetCards();
        updateCameraHUDState();
        if (cameraMode === 'fpv') updateFPVCamera();

        if (rid === 'HUM-01') openG1Dashboard();
        else if (rid === 'UAV-01') openDroneDashboard();
        else if (rid.startsWith('AMR-')) openRoverDashboard(rid);
      }
    });
  }

  const existingCards = container.querySelectorAll('.robot-card');
  if (existingCards.length !== robotDefs.length) {
    container.innerHTML = '';
    robotDefs.forEach(r => {
      const isEn = (r.enabled !== false);
      const card = document.createElement('div');
      card.id = `robot-card-${r.id}`;
      card.className = `robot-card ${r.id === selectedRobotId ? 'selected' : ''}`;
      if (!isEn) card.style.opacity = '0.55';
      
      let badgeClass = 'badge-patrolling';
      if (!isEn) badgeClass = 'badge-idle';
      else if (r.status.includes('Transport') || r.status.includes('En Route')) badgeClass = 'badge-transporting';
      else if (r.status.includes('Charging') || r.status.includes('Docked')) badgeClass = 'badge-charging';

      card.innerHTML = `
        <div class="robot-header">
          <div class="robot-name" style="color: #${r.color.toString(16).padStart(6, '0')}">${r.type === 'drone' ? '🚁 ' : (r.type === 'humanoid' ? '🤖 ' : '🚜 ')}${r.name} (${r.id})</div>
          <div style="display: flex; align-items: center; gap: 5px;">
            <button class="btn-card-toggle-enable" data-robot="${r.id}" title="Toggle robot in simulation" style="background: ${isEn ? 'rgba(34, 197, 94, 0.2)' : 'rgba(148, 163, 184, 0.2)'}; border: 1px solid ${isEn ? '#22c55e' : '#64748b'}; color: ${isEn ? '#4ade80' : '#94a3b8'}; border-radius: 4px; font-size: 10px; font-weight: 700; padding: 2px 6px; cursor: pointer; transition: all 0.2s;">
              ${isEn ? '🟢 ON' : '⚪ OFF'}
            </button>
            <span class="robot-badge ${badgeClass}">${!isEn ? 'Inactive' : r.status}</span>
          </div>
        </div>
        <div class="robot-stats">
          <div>Battery: <span class="stat-val stat-battery">${Math.round(r.battery)}%</span></div>
          <div>Speed: <span class="stat-val stat-speed">${r.speed.toFixed(1)} m/s</span></div>
          <div>Pos X: <span class="stat-val stat-x">${r.position.x.toFixed(2)}m</span></div>
          <div>Pos Z: <span class="stat-val stat-z">${r.position.z.toFixed(2)}m</span></div>
        </div>
        <div style="display: flex; gap: 4px; margin-top: 6px;">
          <button class="btn-card-edit-wp" data-robot="${r.id}" style="flex: 1; padding: 4px 6px; font-size: 10px; font-weight: 700; border-radius: 5px; border: 1px solid rgba(56, 189, 248, 0.4); background: rgba(56, 189, 248, 0.12); color: #38bdf8; cursor: pointer; transition: all 0.2s;" title="Show and place waypoints on the floor">
            📍 Place WP
          </button>
          <button class="btn-card-act-wp" data-robot="${r.id}" style="flex: 1; padding: 4px 6px; font-size: 10px; font-weight: 700; border-radius: 5px; border: 1px solid rgba(34, 197, 94, 0.4); background: rgba(34, 197, 94, 0.12); color: #4ade80; cursor: pointer; transition: all 0.2s;" title="Activate waypoint patrol and hide markers">
            🚀 Activate &amp; Hide
          </button>
        </div>
        ${r.id === 'HUM-01' ? `
          <button class="btn-open-g1-ctrl" style="margin-top: 6px; width: 100%; padding: 5px 8px; font-size: 11px; font-weight: 700; border-radius: 6px; border: 1px solid rgba(56, 189, 248, 0.45); background: linear-gradient(135deg, rgba(14, 165, 233, 0.25), rgba(56, 189, 248, 0.1)); color: #38bdf8; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 2px 6px rgba(0,0,0,0.3); transition: all 0.2s;">
            🎮 Unitree G1 Control Dashboard &amp; Chat 💬
          </button>
        ` : ''}
        ${r.type === 'drone' || r.id.startsWith('UAV-') ? `
          <button class="btn-open-drone-ctrl" data-robot="${r.id}" style="margin-top: 6px; width: 100%; padding: 5px 8px; font-size: 11px; font-weight: 700; border-radius: 6px; border: 1px solid rgba(192, 132, 252, 0.45); background: linear-gradient(135deg, rgba(192, 132, 252, 0.25), rgba(168, 85, 247, 0.1)); color: #c084fc; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 2px 6px rgba(0,0,0,0.3); transition: all 0.2s;">
            🎮 Drone Flight Dashboard &amp; Chat 💬
          </button>
        ` : ''}
        ${r.type === 'amr' || r.id.startsWith('AMR-') ? `
          <button class="btn-open-rover-ctrl" data-robot="${r.id}" onclick="event.stopPropagation(); window.openRoverDashboard('${r.id}');" style="margin-top: 6px; width: 100%; padding: 5px 8px; font-size: 11px; font-weight: 700; border-radius: 6px; border: 1px solid rgba(2, 132, 199, 0.45); background: linear-gradient(135deg, rgba(2, 132, 199, 0.25), rgba(16, 185, 129, 0.1)); color: #38bdf8; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 2px 6px rgba(0,0,0,0.3); transition: all 0.2s;">
            🎮 Rover Dashboard &amp; Chat 💬
          </button>
        ` : ''}
      `;

      const editWpBtn = card.querySelector('.btn-card-edit-wp');
      if (editWpBtn) {
        editWpBtn.onclick = (e) => {
          e.stopPropagation();
          showAndEditWaypoints(r.id);
        };
      }
      const actWpBtn = card.querySelector('.btn-card-act-wp');
      if (actWpBtn) {
        actWpBtn.onclick = (e) => {
          e.stopPropagation();
          activateAndHideWaypoints(r.id);
        };
      }
      const openRoverBtn = card.querySelector('.btn-open-rover-ctrl');
      if (openRoverBtn) {
        openRoverBtn.onclick = (e) => {
          e.stopPropagation();
          e.preventDefault();
          selectedRobotId = r.id;
          activeRoverId = r.id;
          const dispatchLabel = document.getElementById('dispatch-target-name');
          if (dispatchLabel) dispatchLabel.innerText = `${r.name} (${r.id})`;
          updateFleetCards();
          openRoverDashboard(r.id);
        };
      }
      const openG1Btn = card.querySelector('.btn-open-g1-ctrl');
      if (openG1Btn) {
        openG1Btn.onclick = (e) => {
          e.stopPropagation();
          e.preventDefault();
          selectedRobotId = r.id;
          const dispatchLabel = document.getElementById('dispatch-target-name');
          if (dispatchLabel) dispatchLabel.innerText = `${r.name} (${r.id})`;
          updateFleetCards();
          openG1Dashboard();
        };
      }
      const openDroneBtn = card.querySelector('.btn-open-drone-ctrl');
      if (openDroneBtn) {
        openDroneBtn.onclick = (e) => {
          e.stopPropagation();
          e.preventDefault();
          selectedRobotId = r.id;
          const dispatchLabel = document.getElementById('dispatch-target-name');
          if (dispatchLabel) dispatchLabel.innerText = `${r.name} (${r.id})`;
          updateFleetCards();
          openDroneDashboard(r.id);
        };
      }

      card.onclick = (e) => {
        if (e.target.closest('button')) return;

        selectedRobotId = r.id;
        if (r.type === 'amr' || r.id.startsWith('AMR-')) {
          activeRoverId = r.id;
        }
        const dispatchLabel = document.getElementById('dispatch-target-name');
        if (dispatchLabel) dispatchLabel.innerText = `${r.name} (${r.id})`;
        updateFleetCards();
        updateCameraHUDState();
        if (cameraMode === 'fpv') updateFPVCamera();

        // Open dashboard of each robot when clicking on fleet telemetry
        if (r.id === 'HUM-01') {
          openG1Dashboard();
        } else if (r.type === 'drone' || r.id.startsWith('UAV-')) {
          openDroneDashboard(r.id);
        } else if (r.type === 'amr' || r.id.startsWith('AMR-')) {
          openRoverDashboard(r.id);
        }
      };

      container.appendChild(card);
    });
    return;
  }

  // Smooth in-place updates: zero garbage collection & zero reflow stutter
  robotDefs.forEach(r => {
    const card = document.getElementById(`robot-card-${r.id}`);
    if (!card) return;

    const isEn = (r.enabled !== false);
    card.className = `robot-card ${r.id === selectedRobotId ? 'selected' : ''}`;
    card.style.opacity = isEn ? '1.0' : '0.55';
    
    let badgeClass = 'badge-patrolling';
    if (!isEn) badgeClass = 'badge-idle';
    else if (r.status.includes('Transport') || r.status.includes('En Route')) badgeClass = 'badge-transporting';
    else if (r.status.includes('Charging') || r.status.includes('Docked')) badgeClass = 'badge-charging';
    else if (r.status.includes('Flight') || r.status.includes('Surveillance')) badgeClass = 'badge-flying';
    else if (r.status.includes('Hovering')) badgeClass = 'badge-hovering';
    else if (r.status.includes('Bipedal') || r.status.includes('Walking')) badgeClass = 'badge-walking';
    else if (r.status.includes('Evading')) badgeClass = 'badge-evading';

    const pwrBtn = card.querySelector('.btn-card-toggle-enable');
    if (pwrBtn) {
      const targetTxt = isEn ? '🟢 ON' : '⚪ OFF';
      if (pwrBtn.innerText !== targetTxt) {
        pwrBtn.innerText = targetTxt;
        pwrBtn.style.background = isEn ? 'rgba(34, 197, 94, 0.2)' : 'rgba(148, 163, 184, 0.2)';
        pwrBtn.style.borderColor = isEn ? '#22c55e' : '#64748b';
        pwrBtn.style.color = isEn ? '#4ade80' : '#94a3b8';
      }
    }

    const badge = card.querySelector('.robot-badge');
    const badgeText = !isEn ? 'Inactive' : r.status;
    if (badge && badge.textContent !== badgeText) {
      badge.className = `robot-badge ${badgeClass}`;
      badge.textContent = badgeText;
    }

    const bat = card.querySelector('.stat-battery');
    if (bat) bat.textContent = `${Math.round(r.battery)}%`;

    const spd = card.querySelector('.stat-speed');
    if (spd) spd.textContent = `${r.speed.toFixed(1)} m/s`;

    const posX = card.querySelector('.stat-x');
    if (posX) posX.textContent = `${r.position.x.toFixed(2)}m`;

    const posZ = card.querySelector('.stat-z');
    if (posZ) posZ.textContent = `${r.position.z.toFixed(2)}m`;
  });
}

// ==========================================
// DRONE & AMR MANUAL PILOTING & FLIGHT INPUT STATE
// ==========================================
let isDroneCockpitCam = true;
let isAmrBumperCam = false;

const droneFlightKeys = {
  forward: false,
  backward: false,
  rotateLeft: false,
  rotateRight: false,
  up: false,
  down: false
};

const amrDriveKeys = {
  forward: false,
  backward: false,
  rotateLeft: false,
  rotateRight: false
};

function getDrone() {
  return robotDefs.find(r => r.id === 'UAV-01');
}

function setDroneManualFlight(enabled = true) {
  const drone = getDrone();
  if (!drone) return;
  drone.isManualFlight = enabled;
  if (enabled) {
    drone.isCustomMission = false;
    drone.isLanding = false;
    drone.isAscending = false;
    drone.hasArrivedMission = false;
    if (drone.isLanded) {
      drone.isLanded = false;
      drone.hoverAltitude = Math.max(0.6, drone.position.y);
    }
  }
  updateCameraHUDState();
}

function hoverDroneManual() {
  const drone = getDrone();
  if (!drone) return;
  drone.isManualFlight = true;
  drone.speed = 0.0;
  drone.hoverAltitude = drone.position.y;
  drone.status = 'Hovering (Manual)';
  drone.target.copy(drone.position);
  updateCameraHUDState();
  const banner = document.querySelector('.dispatch-banner');
  if (banner) {
    banner.innerHTML = `<span>🛑 <b>SkyWatcher Drone:</b> Holding steady hover at ${drone.position.y.toFixed(2)}m AGL.</span>`;
  }
}

function resumeDroneAutoPatrol() {
  const drone = getDrone();
  if (!drone) return;
  drone.isManualFlight = false;
  drone.isCustomMission = false;
  drone.isLanding = false;
  drone.speed = 1.35;
  drone.status = 'In Flight / Surveillance';
  if (drone.waypoints && drone.waypoints.length > 0) {
    drone.waypointIdx = (drone.waypointIdx + 1) % drone.waypoints.length;
    drone.target.copy(drone.waypoints[drone.waypointIdx]);
  }
  updateCameraHUDState();
  const banner = document.querySelector('.dispatch-banner');
  if (banner) {
    banner.innerHTML = `<span>▶️ <b>SkyWatcher Drone:</b> Resumed autonomous waypoint patrol flight.</span>`;
  }
}

function landDroneManual() {
  const drone = getDrone();
  if (!drone) return;
  drone.isManualFlight = false;
  drone.isLanding = true;
  drone.speed = 0.0;
  drone.status = 'Landing...';
  updateCameraHUDState();
}

function setAmrManualDrive(robotId, enabled = true) {
  const amr = robotDefs.find(r => r.id === robotId);
  if (!amr) return;
  amr.isManualDrive = enabled;
  if (enabled) {
    amr.isCustomMission = false;
  }
  updateCameraHUDState();
}

function stopAmrManual(robotId) {
  const amr = robotDefs.find(r => r.id === robotId);
  if (!amr) return;
  amr.isManualDrive = true;
  amr.speed = 0.0;
  amr.status = 'Manual Pilot (Braked)';
  amr.target.copy(amr.position);
  updateCameraHUDState();
  const banner = document.querySelector('.dispatch-banner');
  if (banner) {
    banner.innerHTML = `<span>🛑 <b>${amr.name} (${amr.id}):</b> Brakes locked. Manual standby.</span>`;
  }
}

function resumeAmrAutoPatrol(robotId) {
  const amr = robotDefs.find(r => r.id === robotId);
  if (!amr) return;
  amr.isManualDrive = false;
  amr.isCustomMission = false;
  amr.speed = (amr.type === 'humanoid' ? 0.95 : (amr.id === 'AMR-02' ? 1.0 : (amr.id === 'AMR-03' ? 0.9 : 0.85)));
  amr.status = (amr.type === 'humanoid' ? 'Bipedal Walking' : 'Patrolling');
  if (amr.waypoints && amr.waypoints.length > 0) {
    amr.waypointIdx = (amr.waypointIdx + 1) % amr.waypoints.length;
    amr.target.copy(amr.waypoints[amr.waypointIdx]);
  }
  updateCameraHUDState();
  const banner = document.querySelector('.dispatch-banner');
  if (banner) {
    banner.innerHTML = `<span>▶️ <b>${amr.name} (${amr.id}):</b> Resumed autonomous waypoint patrol routine.</span>`;
  }
}

function updateCameraHUDState() {
  const isFPV = (cameraMode === 'fpv');
  const hud = document.getElementById('drone-fpv-hud');
  if (!hud) return;

  hud.style.display = isFPV ? 'flex' : 'none';
  if (!isFPV) return;

  const sel = robotDefs.find(r => r.id === selectedRobotId) || robotDefs[0];
  const titleEl = document.querySelector('.hud-brand-title');
  const modeEl = document.getElementById('hud-flight-mode');
  const altBox = document.querySelector('.hud-telemetry-readouts .hud-stat-box:nth-child(1)');
  const statLabel1 = altBox ? altBox.querySelector('.hud-stat-label') : null;
  const statVal1 = document.getElementById('hud-stat-alt');
  const spdBox = document.querySelector('.hud-telemetry-readouts .hud-stat-box:nth-child(2)');
  const statLabel2 = spdBox ? spdBox.querySelector('.hud-stat-label') : null;
  const statVal2 = document.getElementById('hud-stat-spd');
  const statVal3 = document.getElementById('hud-stat-hdg');
  const statVal4 = document.getElementById('hud-stat-bat');
  const elevGroup = document.querySelector('.hud-ctrl-group:nth-child(2)');
  const landBtn = document.getElementById('btn-hud-land');
  const camToggleLbl = document.getElementById('hud-cam-toggle-label');
  const kbdStrip = document.querySelector('.hud-keyboard-strip');

  let deg = Math.round((sel.heading * 180 / Math.PI) % 360);
  while (deg < 0) deg += 360;
  let cardinal = 'N';
  if (deg >= 337 || deg < 23) cardinal = 'N';
  else if (deg >= 23 && deg < 68) cardinal = 'NE';
  else if (deg >= 68 && deg < 113) cardinal = 'E';
  else if (deg >= 113 && deg < 158) cardinal = 'SE';
  else if (deg >= 158 && deg < 203) cardinal = 'S';
  else if (deg >= 203 && deg < 248) cardinal = 'SW';
  else if (deg >= 248 && deg < 293) cardinal = 'W';
  else if (deg >= 293 && deg < 337) cardinal = 'NW';

  if (statVal3) statVal3.textContent = `${deg}° [${cardinal}]`;
  if (statVal4) statVal4.textContent = `${Math.round(sel.battery)}%`;

  // Update Robot Switcher Chips in HUD
  document.querySelectorAll('.hud-robot-chip').forEach(chip => {
    chip.classList.toggle('active', chip.getAttribute('data-robot') === sel.id);
  });

  const dpadTitle = document.getElementById('hud-dpad-title');
  const lblFwd = document.getElementById('lbl-hud-fwd');
  const lblBack = document.getElementById('lbl-hud-back');
  const lblRotL = document.getElementById('lbl-hud-rot-l');
  const lblRotR = document.getElementById('lbl-hud-rot-r');
  const lblHover = document.getElementById('lbl-hud-hover');
  const actionsTitle = document.getElementById('hud-actions-title');
  const lblLand = document.getElementById('lbl-hud-land');

  if (sel.type === 'drone') {
    if (titleEl) titleEl.textContent = `🚁 ${sel.name.toUpperCase()} (${sel.id}) COCKPIT CAM`;
    if (statLabel1) statLabel1.textContent = 'ALT (AGL)';
    if (statVal1) statVal1.textContent = `${(sel.position ? sel.position.y : 1.9).toFixed(2)}m`;
    if (statLabel2) statLabel2.textContent = 'AIRSPEED';
    if (statVal2) statVal2.textContent = `${sel.speed.toFixed(1)} m/s`;
    if (elevGroup) elevGroup.style.display = 'flex';
    if (landBtn) {
      landBtn.style.display = 'flex';
      if (lblLand) lblLand.innerHTML = '🛬 Land Now';
    }
    if (dpadTitle) dpadTitle.textContent = '🕹️ AERIAL FLIGHT';
    if (lblFwd) lblFwd.textContent = 'FWD [W]';
    if (lblBack) lblBack.textContent = 'REV [S]';
    if (lblRotL) lblRotL.textContent = 'ROT L [A]';
    if (lblRotR) lblRotR.textContent = 'ROT R [D]';
    if (lblHover) lblHover.textContent = 'HOVER [H]';
    if (actionsTitle) actionsTitle.textContent = '🎯 FLIGHT MODE';
    if (modeEl) {
      modeEl.className = sel.isManualFlight ? 'hud-mode-badge manual' : 'hud-mode-badge auto';
      modeEl.textContent = sel.isManualFlight ? '🎮 MANUAL PILOT' : '🤖 AUTO PATROL';
    }
    if (camToggleLbl) camToggleLbl.textContent = isDroneCockpitCam ? '🎥 View: Cockpit' : '🎥 View: Chase (Back)';
    if (kbdStrip) kbdStrip.innerHTML = '<span>⌨️ <b>Flight Controls:</b> <code>W/S</code>: Fwd/Back &bull; <code>A/D</code>: Rotate &bull; <code>Space/Shift</code>: Climb/Descend &bull; <code>H</code>: Hover &bull; <code>P</code>: Auto &bull; <code>C</code>: Cam View &bull; <code>1-9, 0</code>: Switch Robot &bull; <code>Esc</code>: Exit</span>';
  } else if (sel.type === 'amr' || sel.id.startsWith('AMR-')) {
    if (titleEl) titleEl.textContent = `🚜 ${sel.name.toUpperCase()} (${sel.id}) ROBOT CAM`;
    if (statLabel1) statLabel1.textContent = 'VELOCITY';
    if (statVal1) statVal1.textContent = `${sel.speed.toFixed(1)} m/s`;
    if (statLabel2) statLabel2.textContent = 'STATUS';
    if (statVal2) statVal2.textContent = sel.status.split(' ')[0] || 'Active';
    if (elevGroup) elevGroup.style.display = 'none';
    if (landBtn) {
      landBtn.style.display = 'flex';
      if (lblLand) lblLand.innerHTML = '⚡ Dock Charger';
    }
    if (dpadTitle) dpadTitle.textContent = '🕹️ GROUND DRIVE';
    if (lblFwd) lblFwd.textContent = 'FWD [W]';
    if (lblBack) lblBack.textContent = 'REV [S]';
    if (lblRotL) lblRotL.textContent = 'ROT L [A]';
    if (lblRotR) lblRotR.textContent = 'ROT R [D]';
    if (lblHover) lblHover.textContent = 'BRAKE [Space]';
    if (actionsTitle) actionsTitle.textContent = '🎯 DRIVE MODE';
    if (modeEl) {
      modeEl.className = sel.isManualDrive ? 'hud-mode-badge manual' : 'hud-mode-badge auto';
      modeEl.textContent = sel.isManualDrive ? '🎮 MANUAL DRIVE' : '🤖 AUTO PATROL';
    }
    if (camToggleLbl) camToggleLbl.textContent = isAmrBumperCam ? '🎥 View: Front Bumper' : '🎥 View: Chase (Back)';
    if (kbdStrip) kbdStrip.innerHTML = '<span>⌨️ <b>Drive Controls:</b> <code>W/S</code>: Fwd/Rev &bull; <code>A/D</code>: Turn &bull; <code>Space / H</code>: Brake &bull; <code>P</code>: Auto &bull; <code>C</code>: Cam View &bull; <code>1-5</code>: Switch Robot &bull; <code>Esc</code>: Exit</span>';
  } else if (sel.type === 'humanoid') {
    if (titleEl) titleEl.textContent = '🤖 UNITREE G1 SILVER (HUM-01) VISOR CAM';
    if (statLabel1) statLabel1.textContent = 'GAIT VEL';
    if (statVal1) statVal1.textContent = `${sel.speed.toFixed(1)} m/s`;
    if (statLabel2) statLabel2.textContent = 'JOINTS';
    if (statVal2) statVal2.textContent = '23-DoF OK';
    if (elevGroup) elevGroup.style.display = 'none';
    if (landBtn) {
      landBtn.style.display = 'flex';
      if (lblLand) lblLand.innerHTML = '👋 Wave Gesture';
    }
    if (dpadTitle) dpadTitle.textContent = '🕹️ BIPEDAL WALK';
    if (lblFwd) lblFwd.textContent = 'WALK [W]';
    if (lblBack) lblBack.textContent = 'BACK [S]';
    if (lblRotL) lblRotL.textContent = 'TURN L [A]';
    if (lblRotR) lblRotR.textContent = 'TURN R [D]';
    if (lblHover) lblHover.textContent = 'HALT [Space]';
    if (actionsTitle) actionsTitle.textContent = '🎯 GAIT MODE';
    if (modeEl) {
      modeEl.className = sel.isManualDrive ? 'hud-mode-badge manual' : 'hud-mode-badge auto';
      modeEl.textContent = sel.isManualDrive ? '🎮 MANUAL WALK' : '🤖 AUTO PATROL';
    }
    if (camToggleLbl) camToggleLbl.textContent = isAmrBumperCam ? '🎥 View: Visor First-Person' : '🎥 View: Chase (Back)';
    if (kbdStrip) kbdStrip.innerHTML = '<span>⌨️ <b>Walk Controls:</b> <code>W/S</code>: Walk &bull; <code>A/D</code>: Turn &bull; <code>Space / H</code>: Halt Stance &bull; <code>P</code>: Auto &bull; <code>C</code>: Cam View &bull; <code>1-5</code>: Switch Robot &bull; <code>Esc</code>: Exit</span>';
  }

  // Handle Observer Mode UI state (Clean View-Only Spectator)
  const observerDock = document.getElementById('hud-observer-dock');
  const bottomDock = document.querySelector('.hud-bottom-dock');
  const observerRobotLbl = document.getElementById('observer-robot-label');
  const observerCamToggle = document.getElementById('btn-observer-cam-toggle');

  if (isObserverMode) {
    if (observerDock) observerDock.style.display = 'flex';
    if (bottomDock) bottomDock.style.display = 'none';
    if (kbdStrip) kbdStrip.style.display = 'none';
    if (observerRobotLbl) observerRobotLbl.textContent = `Viewing: ${sel.name} (${sel.id})`;
    if (observerCamToggle) {
      if (sel.type === 'drone') {
        observerCamToggle.textContent = isDroneCockpitCam ? '🎥 View: Cockpit' : '🎥 View: Chase';
      } else if (sel.type === 'humanoid') {
        observerCamToggle.textContent = isAmrBumperCam ? '🎥 View: Visor' : '🎥 View: Chase';
      } else {
        observerCamToggle.textContent = isAmrBumperCam ? '🎥 View: Bumper' : '🎥 View: Chase';
      }
    }
    if (titleEl) {
      titleEl.textContent = `👁️ ${sel.name.toUpperCase()} (${sel.id}) OBSERVER CAM`;
    }
    if (modeEl) {
      modeEl.className = 'hud-mode-badge auto';
      modeEl.textContent = '👁️ OBSERVER (VIEW ONLY)';
    }
  } else {
    if (observerDock) observerDock.style.display = 'none';
    if (bottomDock) bottomDock.style.display = 'flex';
    if (kbdStrip) kbdStrip.style.display = 'flex';
  }
}

const _tempNavGoal = new THREE.Vector3();
const _tempNavDiff = new THREE.Vector3();

function updateSimulation(delta) {
  if (!simRunning) return;

  robotDefs.forEach(r => {
    if (r.enabled === false) {
      if (r.mesh) r.mesh.visible = false;
      return;
    }
    if (r.mesh && !r.mesh.visible) r.mesh.visible = true;

    if (r.lidar) {
      if (r.lidarActive !== false) {
        r.lidar.rotation.y += delta * 12;
        if (r.lidar.material && r.lidar.material.color.getHex() !== 0x38bdf8) {
          r.lidar.material.color.setHex(0x38bdf8);
        }
      } else {
        if (r.lidar.material && r.lidar.material.color.getHex() !== 0x475569) {
          r.lidar.material.color.setHex(0x475569);
        }
      }
    }

    const currentPos = r.position;
    const targetPos = r.target;

    // ============================================================
    // TOP-LEVEL LOW BATTERY AUTO-RETURN WATCHDOG (<= 20%)
    // ============================================================
    // Evaluates every frame for AMRs unconditionally (regardless of yielding, detours, or transit distance)
    if (r.type === 'amr' && r.battery <= 20 && !r.isReturningToCharge && !r.isAutoUndocking && 
        !r.status.includes('Charging') && !r.status.includes('Docked') && !r.isManualDrive) {
      r.isReturningToCharge = true;
      r.isDetouring = false;
      r.detourWaypoints = null;
      r.heldBy = null;
      r.heldTime = 0;
      if (r.currentOrder) {
        if (r.currentOrder.status === 'picking_up') {
          r.currentOrder.status = 'pending';
          r.currentOrder.assignedRobotId = null;
        }
        r.currentOrder = null;
      }
      const stCharger = (labStations && labStations.charger) ? labStations.charger.pos : new THREE.Vector3(2.2, 0.05, 1.2);
      dispatchSelectedRobot(stCharger, 'Station D: AMR Charger Dock', r.id);
      appendRoverChatMessage(r.id, `🚜 ${r.name}`, `⚠️ Low Battery Alert (${r.battery.toFixed(1)}% <= 20%)! Aborting mission and returning directly to Station D for 100% inductive recharge.`);
    }

    // ============================================================
    // AMR IDLE AUTO-RETURN TO ASSIGNED HOME DOCK (BAY 1-6)
    // ============================================================
    // When an AMR is idle with no active delivery orders, it automatically returns to its designated dock
    if (r.type === 'amr' && !r.currentOrder && !r.isManualDrive && !r.isReturningToCharge && !r.isAutoUndocking) {
      const dockKey = r.homeDockKey || ('dock' + (parseInt(r.id.split('-')[1]) || 1));
      const dockStation = (labStations && labStations[dockKey]) ? labStations[dockKey] : null;
      if (dockStation) {
        const distToDock = Math.hypot(currentPos.x - dockStation.pos.x, currentPos.z - dockStation.pos.z);
        if (distToDock <= 0.28) {
          // Centered squarely inside home dock & stay parked in standby
          currentPos.x = THREE.MathUtils.lerp(currentPos.x, dockStation.pos.x, Math.min(1.0, delta * 12.0));
          currentPos.z = THREE.MathUtils.lerp(currentPos.z, dockStation.pos.z, Math.min(1.0, delta * 12.0));
          r.position.x = currentPos.x;
          r.position.z = currentPos.z;
          r.speed = 0.0;
          const targetHeading = (dockStation.pos.z > 0) ? Math.PI : 0;
          r.heading = THREE.MathUtils.lerp(r.heading, targetHeading, Math.min(1.0, delta * 8.0));
          if (r.mesh) {
            r.mesh.position.copy(currentPos);
            r.mesh.rotation.y = r.heading;
          }
          if (!r.status || !r.status.includes('Docked')) {
            r.status = `Docked at Bay ${dockStation.bayNumber || 1} (Standby)`;
          }
          r.isCharging = true;
          r.isCustomMission = false;
          r.hasArrivedMission = true;
          r.battery = Math.min(100, r.battery + delta * 4.0);
          r.isReturningHome = false;

          // Stay parked inside dock: do not execute patrol waypoint routes while waiting for delivery
          return;
        } else {
          // Away from dock with no active delivery:
          // Unless the user manually dispatched this AMR to another destination that it hasn't reached yet,
          // automatically route it directly back to its assigned Home Dock!
          const alreadyHeadingHome = r.isCustomMission && Math.hypot(targetPos.x - dockStation.pos.x, targetPos.z - dockStation.pos.z) < 0.1;
          const isUserCustomMission = r.isCustomMission && !r.isReturningHome && !r.hasArrivedMission && r.missionStationName && !r.missionStationName.includes('Bay') && !r.missionStationName.includes('Dock');

          if (!alreadyHeadingHome && !isUserCustomMission) {
            r.isReturningHome = true;
            r.heldBy = null;
            r.heldTime = 0;
            r.isDetouring = false;
            r.detourWaypoints = null;
            dispatchSelectedRobot(dockStation.pos, dockStation.name, r.id);
            appendRoverChatMessage(r.id, `🚜 ${r.name}`, `No active deliveries. Returning to ${dockStation.name} to park in standby.`);
          } else if (alreadyHeadingHome && !r.heldBy && !(r.retreatTime > 0)) {
            if (r.speed < 0.05) {
              r.speed = (r.id === 'AMR-02' ? 1.0 : 0.9);
            }
            if (!r.isDetouring && (!r.detourCooldown || r.detourCooldown <= 0) && isPathObstructed(currentPos, targetPos, obstacleBoxes, 0.25)) {
              r.detourCooldown = 1.0;
              planWaypointLeg(r);
            }
          }
        }
      }
    }

    // ============================================================
    // SKYWATCHER DRONE (UAV-01) 3D AERIAL & VERTICAL DYNAMICS
    // ============================================================
    if (r.type === 'drone') {
      if (r.isManualFlight) {
        // ============================================================
        // MANUAL FLIGHT MODE (Cockpit / Keyboard / Touch Controls)
        // ============================================================
        const limits = getEnvironmentLimits();
        const maxAlt = isCampusScan(activeScan) ? 8.5 : (activeScan === 'scan_house.glb' ? 7.5 : 2.75);
        const minAlt = 0.08;
        const moveSpeed = 1.6;
        const rotSpeed = 2.2;
        const climbSpeed = 1.2;
        let isTranslating = false;

        // 1. Rotate Left / Right (Yaw Heading)
        if (droneFlightKeys.rotateLeft) {
          r.heading += rotSpeed * delta;
          if (r.mesh) r.mesh.rotation.z = THREE.MathUtils.lerp(r.mesh.rotation.z, 0.28, delta * 10);
        } else if (droneFlightKeys.rotateRight) {
          r.heading -= rotSpeed * delta;
          if (r.mesh) r.mesh.rotation.z = THREE.MathUtils.lerp(r.mesh.rotation.z, -0.28, delta * 10);
        } else {
          if (r.mesh) r.mesh.rotation.z = THREE.MathUtils.lerp(r.mesh.rotation.z, 0, delta * 8);
        }

        // 2. Move Forward / Backward (Pitch & Translation)
        if (droneFlightKeys.forward) {
          isTranslating = true;
          currentPos.x += Math.sin(r.heading) * moveSpeed * delta;
          currentPos.z += Math.cos(r.heading) * moveSpeed * delta;
          if (r.mesh) r.mesh.rotation.x = THREE.MathUtils.lerp(r.mesh.rotation.x, 0.20, delta * 8);
        } else if (droneFlightKeys.backward) {
          isTranslating = true;
          currentPos.x -= Math.sin(r.heading) * (moveSpeed * 0.75) * delta;
          currentPos.z -= Math.cos(r.heading) * (moveSpeed * 0.75) * delta;
          if (r.mesh) r.mesh.rotation.x = THREE.MathUtils.lerp(r.mesh.rotation.x, -0.16, delta * 8);
        } else {
          if (r.mesh) r.mesh.rotation.x = THREE.MathUtils.lerp(r.mesh.rotation.x, 0, delta * 8);
        }

        // 3. Move Up / Down (Altitude Climb / Descend)
        if (droneFlightKeys.up) {
          r.isLanded = false;
          currentPos.y = Math.min(maxAlt, currentPos.y + climbSpeed * delta);
          r.hoverAltitude = currentPos.y;
        } else if (droneFlightKeys.down) {
          currentPos.y = Math.max(minAlt, currentPos.y - climbSpeed * delta);
          r.hoverAltitude = currentPos.y;
          if (currentPos.y <= 0.09) {
            r.isLanded = true;
            r.status = 'Landed / Touchdown';
          }
        } else if (!r.isLanded) {
          // Atmospheric hover buoyancy: smooth altitude hold
          currentPos.y = THREE.MathUtils.lerp(currentPos.y, r.hoverAltitude || 1.9, Math.min(delta * 5, 1.0));
        }

        // 4. Perimeter Boundary Enforcement: rotor tips stay inside the walls
        clampInsideLimits(currentPos, droneReach());

        r.speed = isTranslating ? moveSpeed : 0.0;
        if (!r.isLanded) {
          r.status = isTranslating ? 'Manual Flight: Navigating' : (droneFlightKeys.up || droneFlightKeys.down ? 'Manual Flight: Altitude Adjust' : 'Manual Flight: Hovering');
        }
        r.target.copy(currentPos);
        targetBeacon.position.set(currentPos.x, 0.06, currentPos.z);
      } else {
        // ============================================================
        // AUTONOMOUS FLIGHT DYNAMICS (Waypoint Patrol & Missions)
        // ============================================================
        // A target closer to a wall than the rotor reach is moved in, so it can still be reached.
        clampInsideLimits(targetPos, droneReach());
        const horizontalDiff = new THREE.Vector2(targetPos.x - currentPos.x, targetPos.z - currentPos.z);
        const dist2D = horizontalDiff.length();

        // Determine Target Altitude (tracks waypoint altitude or hover altitude)
        let targetAlt = 1.90;
        if (r.isLanded) {
          targetAlt = 0.22;
        } else if (r.isLanding) {
          // If landing on helipad / designated station, fly horizontally at flight level until overhead
          if (r.landingTarget && dist2D > 0.35) {
            targetAlt = (targetPos && targetPos.y > 0.5) ? targetPos.y : (r.hoverAltitude || 1.90);
          } else {
            targetAlt = 0.22;
            r.speed = 0.0; // Stop horizontal flight during vertical descent
          }
        } else if (r.isAscending) {
          targetAlt = r.hoverAltitude || 1.90;
        } else {
          targetAlt = (targetPos && targetPos.y > 0.5) ? targetPos.y : (r.hoverAltitude || 1.90);
        }

        // Smooth Vertical Climb / Descent (without state chatter or deadband hunting)
        if (currentPos.y < targetAlt - 0.03) {
          currentPos.y += Math.min(targetAlt - currentPos.y, delta * 0.85); // Climb at 0.85 m/s
          if (r.isAscending) {
            r.status = `Ascending (${currentPos.y.toFixed(2)}m AGL)`;
          }
          if (currentPos.y >= targetAlt - 0.03) {
            currentPos.y = targetAlt;
            if (r.isAscending) {
              r.isAscending = false;
              r.status = 'In Flight / Surveillance';
              appendDroneChatMessage(`🚁 ${r.name || r.id}`, `🛫 Airborne! Operational ceiling reached at ${targetAlt.toFixed(2)}m AGL. Ready for flight directives.`);
            }
          }
        } else if (currentPos.y > targetAlt + 0.03) {
          currentPos.y -= Math.min(currentPos.y - targetAlt, delta * 0.65); // Descend at 0.65 m/s
          if (r.isLanding) {
            r.status = `Landing (${currentPos.y.toFixed(2)}m AGL)`;
          }
          if (currentPos.y <= 0.235) {
            currentPos.y = 0.22;
            r.isLanded = true;
            r.isLanding = false;
            r.speed = 0.0;
            r.status = 'Landed / Touchdown';
            if (!r.hasAnnouncedTouchdown) {
              r.hasAnnouncedTouchdown = true;
              appendDroneChatMessage(`🚁 ${r.name || r.id}`, `📍 Touchdown confirmed: ${r.name || r.id} has landed safely. Rotors disengaged, standing by on ground.`);
            }
          }
        } else {
          // At Target Altitude: smoothly damp vertical position without limit cycle jitter
          currentPos.y = THREE.MathUtils.lerp(currentPos.y, targetAlt, Math.min(delta * 5, 1.0));
          if (r.isLanded) {
            currentPos.y = 0.22;
            r.status = 'Landed / Touchdown';
          }
        }

        // Horizontal Aerial Navigation
        if (!r.isLanded && (!r.isLanding || (r.landingTarget && dist2D > 0.35))) {
          // If taking off vertically from ground, clear vertical obstacle zone before lateral movement
          if (r.isAscending && currentPos.y < 0.60) {
            // Ascending vertically first
          } else if (dist2D > 0.28 && r.speed > 0) {
            const desiredAngle = Math.atan2(horizontalDiff.x, horizontalDiff.y);
            let angleDiff = desiredAngle - r.heading;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            r.heading += angleDiff * Math.min(delta * 5, 1.0);

            const moveStep = Math.min(r.speed * delta, dist2D);
            currentPos.x += Math.sin(r.heading) * moveStep;
            currentPos.z += Math.cos(r.heading) * moveStep;
            clampInsideLimits(currentPos, droneReach());

            if (r.mesh) {
              const targetRoll = -Math.sin(angleDiff) * 0.28; // Bank roll into turns
              const targetPitch = Math.min(r.speed * 0.10, 0.12); // Forward pitch
              r.mesh.rotation.z = THREE.MathUtils.lerp(r.mesh.rotation.z, targetRoll, delta * 6);
              r.mesh.rotation.x = THREE.MathUtils.lerp(r.mesh.rotation.x, targetPitch, delta * 6);
            }

            if (!r.status.includes('Landing') && !r.status.includes('Ascending')) {
              r.status = r.isCustomMission ? (r.status || 'En Route') : 'In Flight / Surveillance';
            }
          } else {
            // Reached Horizontal Destination
            if (r.mesh) {
              r.mesh.rotation.z = THREE.MathUtils.lerp(r.mesh.rotation.z, 0, delta * 6);
              r.mesh.rotation.x = THREE.MathUtils.lerp(r.mesh.rotation.x, 0, delta * 6);
            }
            if (r.isLanding && r.landingTarget) {
              // Arrived over landing target pad; initiate vertical touchdown
              targetAlt = 0.22;
              r.speed = 0.0;
            } else if (r.isCustomMission && !r.isLanding) {
              if (!r.hasArrivedMission) {
                r.hasArrivedMission = true;
                const sName = r.missionStationName || 'Target Station';
                const shortName = sName.includes(':') ? sName.split(':')[1].trim() : sName;
                r.status = `Hovering: ${shortName}`;
                r.speed = 0.0;
                appendDroneChatMessage(`🚁 ${r.name || r.id}`, `📍 Waypoint Reached: Holding steady hover above ${sName} at ${(currentPos.y).toFixed(2)}m AGL. Conducting aerial visual scan.`);
              }
            } else if (!r.isCustomMission && !r.isLanding && r.waypoints && r.waypoints.length > 0 && r.speed > 0) {
              r.waypointIdx = (r.waypointIdx + 1) % r.waypoints.length;
              r.target.copy(r.waypoints[r.waypointIdx]);
            }
          }
        } else {
          if (r.mesh) {
            r.mesh.rotation.z = THREE.MathUtils.lerp(r.mesh.rotation.z, 0, delta * 6);
            r.mesh.rotation.x = THREE.MathUtils.lerp(r.mesh.rotation.x, 0, delta * 6);
          }
        }
      }

      // Propeller Rotation
      if (r.propellers) {
        const propSpeed = r.isLanded ? 0 : (r.isLanding ? 28 : (r.speed > 0.1 ? 55 : 40));
        r.propellers.forEach((p, pIdx) => {
          p.rotation.y += (pIdx % 2 === 0 ? 1 : -1) * delta * propSpeed;
        });
      }

      // Strobe Navigation Light
      if (r.statusLight) {
        if (r.isLanded) {
          r.statusLight.visible = true;
          r.statusLight.material.color.setHex(0x10b981); // Solid green when landed
        } else {
          r.statusLight.material.color.setHex(0x38bdf8);
          r.statusLight.visible = (Math.floor(clock.getElapsedTime() * 5) % 2 === 0);
        }
      }

      // Battery Consumption
      r.battery = Math.max(0, r.battery - (r.isLanded ? delta * 0.003 : delta * 0.05));

      // Synchronize 3D Mesh with natural aerodynamic buoyancy
      if (r.mesh) {
        const dronePhase = ((r.id.charCodeAt(r.id.length - 1) || 0) * 1.5);
        const hoverBob = (r.isLanded || r.isLanding) ? 0 : Math.sin(clock.getElapsedTime() * 2.8 + dronePhase) * 0.025;
        r.mesh.position.set(currentPos.x, currentPos.y + hoverBob, currentPos.z);
        r.mesh.rotation.y = r.heading;
      }
      return; // Fully handled SkyWatcher Drone
    }

    // ============================================================
    // 2. AMR ROVER MANUAL DRIVING (AMR-01, AMR-02, AMR-03)
    // ============================================================
    if (r.type === 'amr' && r.isManualDrive) {
      let isMoving = false;
      let driveSpeed = 0;
      const turnSpeed = 2.4;
      const fwdSpeed = 1.15;
      const revSpeed = 0.75;

      if (amrDriveKeys.rotateLeft) {
        r.heading += turnSpeed * delta;
        isMoving = true;
        r.status = 'Manual Steering (Left)';
        if (r.wheels) {
          r.wheels.forEach((w, wIdx) => {
            w.rotation.x += (wIdx % 2 === 0 ? -1 : 1) * delta * 14;
          });
        }
      }
      if (amrDriveKeys.rotateRight) {
        r.heading -= turnSpeed * delta;
        isMoving = true;
        r.status = 'Manual Steering (Right)';
        if (r.wheels) {
          r.wheels.forEach((w, wIdx) => {
            w.rotation.x += (wIdx % 2 === 0 ? 1 : -1) * delta * 14;
          });
        }
      }

      if (amrDriveKeys.forward) {
        driveSpeed = fwdSpeed;
        const fwdX = Math.sin(r.heading);
        const fwdZ = Math.cos(r.heading);
        currentPos.x += fwdX * driveSpeed * delta;
        currentPos.z += fwdZ * driveSpeed * delta;
        isMoving = true;
        r.status = 'Manual Drive (Forward)';
        if (r.wheels) {
          r.wheels.forEach(w => {
            w.rotation.x += delta * 18;
          });
        }
      } else if (amrDriveKeys.backward) {
        driveSpeed = -revSpeed;
        const fwdX = Math.sin(r.heading);
        const fwdZ = Math.cos(r.heading);
        currentPos.x += fwdX * driveSpeed * delta;
        currentPos.z += fwdZ * driveSpeed * delta;
        isMoving = true;
        r.status = 'Manual Drive (Reverse)';
        if (r.wheels) {
          r.wheels.forEach(w => {
            w.rotation.x -= delta * 12;
          });
        }
      }

      r.speed = isMoving ? (Math.abs(driveSpeed) || 0.6) : 0.0;
      if (!isMoving) {
        r.status = 'Manual Pilot (Standby)';
      }

      // Physics barriers: never clip into tables or perimeter walls
      resolveObstacleCollisions(currentPos, 0.28);
      r.target.copy(currentPos);

      // Battery drain
      r.battery = Math.max(0, r.battery - (isMoving ? delta * 0.03 : delta * 0.004));

      if (r.mesh) {
        r.mesh.position.copy(currentPos);
        r.mesh.rotation.y = r.heading;
      }
      return; // Handled manual AMR
    }

    // ============================================================
    // 3. UNITREE G1 HUMANOID MANUAL WALKING (HUM-01)
    // ============================================================
    if (r.type === 'humanoid' && r.isManualDrive) {
      let isMoving = false;
      let walkSpeed = 0;
      const turnSpeed = 2.0;
      const fwdSpeed = 0.95;
      const revSpeed = 0.60;

      if (amrDriveKeys.rotateLeft) {
        r.heading += turnSpeed * delta;
        isMoving = true;
        r.status = 'Manual Turning (Left)';
      }
      if (amrDriveKeys.rotateRight) {
        r.heading -= turnSpeed * delta;
        isMoving = true;
        r.status = 'Manual Turning (Right)';
      }

      if (amrDriveKeys.forward) {
        walkSpeed = fwdSpeed;
        const fwdX = Math.sin(r.heading);
        const fwdZ = Math.cos(r.heading);
        currentPos.x += fwdX * walkSpeed * delta;
        currentPos.z += fwdZ * walkSpeed * delta;
        isMoving = true;
        r.status = 'Manual Walking (Forward)';
      } else if (amrDriveKeys.backward) {
        walkSpeed = -revSpeed;
        const fwdX = Math.sin(r.heading);
        const fwdZ = Math.cos(r.heading);
        currentPos.x += fwdX * walkSpeed * delta;
        currentPos.z += fwdZ * walkSpeed * delta;
        isMoving = true;
        r.status = 'Manual Walking (Backward)';
      }

      // Kinematic bipedal gait & leg swings
      if (isMoving && Math.abs(walkSpeed) > 0.05) {
        r.walkCycle = (r.walkCycle || 0) + Math.abs(walkSpeed) * delta * 8.5;
        const swing = Math.sin(r.walkCycle);
        if (r.leftLeg) r.leftLeg.rotation.x = swing * 0.45;
        if (r.rightLeg) r.rightLeg.rotation.x = -swing * 0.45;
        if (r.leftKnee) r.leftKnee.rotation.x = Math.max(0, -swing) * 0.55;
        if (r.rightKnee) r.rightKnee.rotation.x = Math.max(0, swing) * 0.55;
        if (r.leftArm) r.leftArm.rotation.x = -swing * 0.35;
        if (r.rightArm && !r.isWaving) r.rightArm.rotation.x = swing * 0.35;
      } else {
        if (r.leftLeg) r.leftLeg.rotation.x *= 0.85;
        if (r.rightLeg) r.rightLeg.rotation.x *= 0.85;
        if (r.leftKnee) r.leftKnee.rotation.x *= 0.85;
        if (r.rightKnee) r.rightKnee.rotation.x *= 0.85;
        if (r.leftArm) r.leftArm.rotation.x *= 0.85;
        if (r.rightArm && !r.isWaving) r.rightArm.rotation.x *= 0.85;
      }

      // Waving gesture if active
      if (r.isWaving) {
        r.waveTimer = (r.waveTimer || 3.5) - delta;
        if (r.rightArm) {
          r.rightArm.rotation.x = -2.2;
          r.rightArm.rotation.z = -0.3 + Math.sin(clock.getElapsedTime() * 12) * 0.4;
        }
        if (r.waveTimer <= 0) r.isWaving = false;
      }

      r.speed = isMoving ? (Math.abs(walkSpeed) || 0.6) : 0.0;
      if (!isMoving) {
        r.status = 'Manual Stance (Halt)';
      }

      // Obstacle collision resolution
      resolveObstacleCollisions(currentPos, g1Radius());
      r.target.copy(currentPos);

      // Battery consumption
      r.battery = Math.max(0, r.battery - (isMoving ? delta * 0.025 : delta * 0.003));

      if (r.mesh) {
        r.mesh.position.copy(currentPos);
        r.mesh.rotation.y = r.heading;
      }
      return; // Handled manual Humanoid
    }

    // Safety: a target the planner can't reach (inside a keep-out box or its margin) is moved to
    // the nearest point it can. Stations and docking bays are pre-calibrated so they are exempt.
    const isTargetStation = r.isCustomMission && r.missionStationName && (r.missionStationName.includes('Dock') || r.missionStationName.includes('Bay') || r.missionStationName.includes('Station') || r.missionStationName.includes('Charger'));
    if (!r.isCustomMission && isTargetBlocked(targetPos.x, targetPos.z)) {
      const safe = findNearestSafePoint(targetPos.x, targetPos.z);
      targetPos.x = safe.x;
      targetPos.z = safe.z;

      const distToTarget = Math.hypot(currentPos.x - targetPos.x, currentPos.z - targetPos.z);
      if (!r.isDetouring && r.waypoints && r.waypoints.length > 0 && distToTarget < 0.45) {
        r.waypointIdx = (r.waypointIdx + 1) % r.waypoints.length;
        r.target.copy(r.waypoints[r.waypointIdx]);
      }
    }

    // A target closer to a wall than the planner's safety margin is moved in, so it can still be
    // reached and planned to (the margin is larger than half the AMR's width). Stations/docks stay exact.
    if (r.type === 'amr' && !isTargetStation) clampInsideLimits(targetPos, Math.max(localAStar.safetyMargin, amrHalfWidth()));

    // Waypoint routes: plan the leg to the current waypoint once, when it starts.
    const groundRobot = r.type === 'amr' || r.type === 'humanoid';
    if (groundRobot && !r.isCustomMission && r.waypoints && r.waypoints.length > 0) {
      const legKey = `${r.waypointIdx}|${targetPos.x.toFixed(2)}|${targetPos.z.toFixed(2)}`;
      if (r.failedLegKeys && r.failedLegKeys.has(legKey)) {
        // Back at a waypoint whose leg had no route: skip it again, quietly, instead of driving
        // straight at it unplanned. Legs are tried again once zones or furniture change
        // (replanAllLegs).
        r.waypointIdx = (r.waypointIdx + 1) % r.waypoints.length;
        r.target.copy(r.waypoints[r.waypointIdx]);
      } else if (r.plannedLegKey !== legKey) {
        r.plannedLegKey = legKey;
        r.detourCooldown = 0;
        if (planWaypointLeg(r)) {
          r.unreachableLegs = 0;
        } else if (localAStar.isBlocked(currentPos.x, currentPos.z, obstacleBoxes, 0)) {
          // The robot itself is inside a box (one was just drawn on top of it): the failure says
          // nothing about the waypoint. Collisions push the robot out within a frame; plan again.
          r.plannedLegKey = null;
        } else {
          (r.failedLegKeys = r.failedLegKeys || new Set()).add(legKey);
          // No route to this waypoint (inside or walled in by keep-out zones): skip it, and hold
          // in braked standby if none of the waypoints can be reached.
          r.unreachableLegs = (r.unreachableLegs || 0) + 1;
          if (r.unreachableLegs >= r.waypoints.length) {
            robotChat(r, `⛔ No route to any of my ${r.waypoints.length} waypoints: they are blocked by keep-out zones or walls. Holding position.`);
            stopAmrManual(r.id);
          } else {
            robotChat(r, `⚠️ No route to waypoint #${r.waypointIdx + 1}: it is blocked by a keep-out zone or wall. Skipping to the next one.`);
            r.waypointIdx = (r.waypointIdx + 1) % r.waypoints.length;
            r.target.copy(r.waypoints[r.waypointIdx]);
          }
        }
      }
    }

    // AI A* Sub-Goal Navigation: planned waypoint legs (AMR and G1) and reactive detours (AMR)
    let navGoal = targetPos;
    if (groundRobot) {
      if (r.detourCooldown > 0) r.detourCooldown -= delta;

      // Handle ongoing A* detour route
      if (r.isDetouring && r.detourWaypoints && r.detourWaypoints.length > 0) {
        if (r.detourIdx < r.detourWaypoints.length) {
          const subGoal = r.detourWaypoints[r.detourIdx];
          _tempNavGoal.set(subGoal.x, 0.05, subGoal.z);
          navGoal = _tempNavGoal;
          const distToSub = Math.hypot(currentPos.x - subGoal.x, currentPos.z - subGoal.z);
          // Planned routes keep exactly the safety margin; cutting a corner by more than this
          // would take the robot into it. A robot that comes near a corner off the line (slowed
          // or stopped there by another robot) goes all the way to the corner if cutting straight
          // to the following point would clip a keep-out box.
          const after = r.detourWaypoints[r.detourIdx + 1];
          const cutClips = after && distToSub >= 0.05 &&
            isPathObstructed(currentPos, after, obstacleBoxes, r.type === 'amr' ? amrHalfWidth() : g1Radius());
          if (distToSub < 0.15) {
            r.subGoalTimer = (r.subGoalTimer || 0) + delta;
          } else {
            r.subGoalTimer = 0;
          }
          if (distToSub < 0.15 && (!cutClips || distToSub < 0.08 || r.subGoalTimer > 0.6)) {
            r.subGoalTimer = 0;
            r.detourIdx++;
            if (r.detourIdx >= r.detourWaypoints.length) {
              // Reached end of detour route
              r.isDetouring = false;
              r.detourWaypoints = null;
              clearDetourRibbon(r.id);
              navGoal = targetPos;
              if (r.detourSource === 'reactive' && typeof appendRoverChatMessage === 'function') {
                appendRoverChatMessage(r.id, `🚜 ${r.name}`, `✅ A* Obstacle Detour completed! Rejoining primary patrol route.`);
              }
            } else {
              _tempNavGoal.set(r.detourWaypoints[r.detourIdx].x, 0.05, r.detourWaypoints[r.detourIdx].z);
              navGoal = _tempNavGoal;
            }
          }
        } else {
          r.isDetouring = false;
          r.detourWaypoints = null;
          clearDetourRibbon(r.id);
        }
      } else if (r.type === 'amr' && !r.isDetouring && (!r.detourCooldown || r.detourCooldown <= 0)) {
        // Check if direct path from current position to targetPos is blocked by keep-out box or forward LiDAR detects obstacle
        const distToGoal = Math.hypot(currentPos.x - targetPos.x, currentPos.z - targetPos.z);
        const isDockTarget = (r.isReturningHome || (r.missionStationName && (r.missionStationName.includes('Dock') || r.missionStationName.includes('Bay') || r.missionStationName.includes('Station') || r.missionStationName.includes('Charger'))));
        const isObstructed = isPathObstructed(currentPos, targetPos, obstacleBoxes, 0.32);
        const lidarNear = (r.forwardLidarDist !== undefined && r.forwardLidarDist < Math.min(1.15, distToGoal - 0.15) && !(isDockTarget && distToGoal < 0.85));
        if (isObstructed || lidarNear) {
          triggerAStarDetour(r);
          if (r.isDetouring && r.detourWaypoints && r.detourIdx < r.detourWaypoints.length) {
            _tempNavGoal.set(r.detourWaypoints[r.detourIdx].x, 0.05, r.detourWaypoints[r.detourIdx].z);
            navGoal = _tempNavGoal;
          }
        }
      }

      // LiDAR safety layer under a planned path: something straight ahead on the current
      // segment, closer than the next waypoint, was not on the map the plan used. Brake if it is
      // close, and re-plan the leg around it.
      r.lidarHold = false;
      if (r.type === 'amr' && r.isDetouring && r.detourSource === 'plan' && r.detourWaypoints &&
          r.detourIdx < r.detourWaypoints.length && r.lidarHits) {
        // A LiDAR hit within half the robot's width of the planned segment, ahead of the robot, is
        // something the plan didn't know about. Mapped obstacles are always at least the planner's
        // margin (more than half the width) from a planned segment, so they never count, however
        // the robot wobbles around the line.
        const a = r.detourWaypoints[r.detourIdx - 1];
        const b = r.detourWaypoints[r.detourIdx];
        const segX = b.x - a.x;
        const segZ = b.z - a.z;
        const segLen = Math.hypot(segX, segZ) || 1e-6;
        const along = (px, pz) => ((px - a.x) * segX + (pz - a.z) * segZ) / segLen;
        const robotAlong = along(currentPos.x, currentPos.z);
        const halfWidth = amrHalfWidth();
        let blockAhead = Infinity;
        for (const h of r.lidarHits) {
          const t = along(h.x, h.z);
          const off = Math.abs((h.x - a.x) * segZ - (h.z - a.z) * segX) / segLen;
          if (off <= halfWidth && t > robotAlong && t < segLen) blockAhead = Math.min(blockAhead, t - robotAlong);
        }
        const blocked = blockAhead < 0.8;
        r.lidarHold = blockAhead < 0.4 && (!r.detourCooldown || r.detourCooldown <= 0);
        if (blocked && (!r.detourCooldown || r.detourCooldown <= 0)) {
          r.detourCooldown = 1.0;
          if (planWaypointLeg(r)) {
            r.lidarHold = false;
            robotChat(r, '⚠️ LiDAR: something on my planned path is not on the map. Re-planned around it.');
            const next = r.isDetouring ? r.detourWaypoints[r.detourIdx] : targetPos;
            _tempNavGoal.set(next.x, 0.05, next.z);
            navGoal = _tempNavGoal;
          } else {
            robotChat(r, '⛔ LiDAR: my planned path is blocked and there is no way around. Waiting.');
          }
        }
      }
    }

    _tempNavDiff.subVectors(navGoal, currentPos);
    const dist = _tempNavDiff.length();
    const distToFinal = Math.hypot(currentPos.x - targetPos.x, currentPos.z - targetPos.z);

    // Docking missions use precision landing (0.05 m) so AMRs park squarely centered inside their bay decal.
    const isDockingMission = (r.isCustomMission && r.missionStationName && (r.missionStationName.includes('Dock') || r.missionStationName.includes('Bay') || r.missionStationName.includes('Station') || r.missionStationName.includes('Charger'))) || (r.status && (r.status.includes('Dock') || r.status.includes('Bay') || r.status.includes('Returning to')));
    const arrivalThreshold = r.isDetouring ? 0.04 : (isDockingMission ? 0.05 : 0.28);

    // Do not hold on final approach to a pre-calibrated dock/station bay near a wall or building
    if (isDockingMission && distToFinal < 0.85) {
      r.lidarHold = false;
    }

    if (r.type === 'amr') {
      // Supervised ML Adaptive Throttle based on LiDAR range
      const fwd = (r.forwardLidarDist !== undefined) ? r.forwardLidarDist : 2.5;
      let targetSpeed = (r.id === 'AMR-02' ? 1.0 : (r.id === 'AMR-03' ? 0.9 : 0.85));
      const isReactiveDetour = r.isDetouring && r.detourSource === 'reactive';
      if (isDockingMission && distToFinal < 0.45) {
        targetSpeed = Math.max(0.15, targetSpeed * (distToFinal / 0.45));
      } else if (fwd > 2.2 && !isReactiveDetour) {
        targetSpeed *= 1.20; // Clear open corridor: fast cruise
      } else if (fwd > 1.0 && !isReactiveDetour) {
        targetSpeed *= 0.85; // Proximity caution: gentle decelerate
      } else {
        targetSpeed = 0.45; // Obstacle detected / negotiating reactive A* detour
      }
      r.speed = THREE.MathUtils.lerp(r.speed, targetSpeed, delta * 3.5);
    }

    if (dist > arrivalThreshold) {
      const desiredAngle = Math.atan2(_tempNavDiff.x, _tempNavDiff.z);

      // Virtual LiDAR Lookahead (scans ahead for obstacles in current path). Steering keeps the
      // planner's safety margin, which is larger than the AMR and G1 collision radii, so it never
      // aims where resolveObstacleCollisions would push the robot back.
      const lookahead = 0.55;
      const steerPadding = localAStar.safetyMargin;
      const fwdX = currentPos.x + Math.sin(r.heading) * lookahead;
      const fwdZ = currentPos.z + Math.cos(r.heading) * lookahead;
      // A planned detour is already clear of every keep-out box by the margin; reactive evasion
      // only knows the same boxes, so it is used on direct (patrol) driving only. Docks are pre-cleared.
      const obstacleAhead = !r.isDetouring && !isDockingMission && isInsideObstacle(fwdX, fwdZ, steerPadding);

      let steerAngle = desiredAngle;
      if (obstacleAhead) {
        // Try evasive steer angles: +35°, -35°, +70°, -70°, +105°, -105°
        const steerCandidates = [0.65, -0.65, 1.25, -1.25, 1.8, -1.8];
        for (let off of steerCandidates) {
          const testAngle = desiredAngle + off;
          const testX = currentPos.x + Math.sin(testAngle) * lookahead;
          const testZ = currentPos.z + Math.cos(testAngle) * lookahead;
          if (!isInsideObstacle(testX, testZ, steerPadding) && !isOutsideRoom(testX, testZ, steerPadding)) {
            steerAngle = testAngle;
            break;
          }
        }

        // Visual warning: ring status light flashes amber to indicate active obstacle avoidance
        if (r.statusLight) {
          r.statusLight.material.color.setHex(0xf59e0b);
        }
        // A job that has arrived keeps its arrival status ("At <station>"): parked right at its
        // arrival distance, jitter can bring it back here for a frame while it faces a zone.
        if (!r.status.includes('Evading') && !r.status.includes('Docked') && !(r.isCustomMission && r.hasArrivedMission)) {
          r.status = 'Evading Keep-Out Box';
        }
      } else {
        if (r.statusLight) {
          r.statusLight.material.color.setHex(r.color);
        }
        if (r.status.includes('Evading')) {
          r.status = (r.isCustomMission && r.missionStationName) ? `En Route: ${r.missionStationName}` : 'Patrolling';
        }
      }

      // Smooth heading turn towards the safe steering angle
      let angleDiff = steerAngle - r.heading;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      r.heading += angleDiff * Math.min(delta * 5, 1.0);

      // Step forward. On a planned path, a robot facing away from its next point turns first
      // (forward step scaled by the cosine of the heading error), so sharp turns happen in
      // place on the planned line instead of in a wide swing into the safety margin.
      const turnFactor = r.isDetouring ? Math.max(0, Math.cos(angleDiff)) : 1;
      // Robot-to-robot yielding: slow down for, and stop short of, robots in this robot's lane.
      const yieldFactor = (r.type === 'amr' || r.type === 'humanoid') ? updateYielding(r, delta) : 1;
      const moveStep = r.lidarHold ? 0 : Math.min(r.speed * delta * turnFactor * yieldFactor, dist);
      currentPos.x += Math.sin(r.heading) * moveStep;
      currentPos.z += Math.cos(r.heading) * moveStep;

      if (r.type === 'drone') {
        // Drone Aerial Flight Dynamics
        r.mesh.position.y = r.hoverAltitude + Math.sin(clock.getElapsedTime() * 4) * 0.04;
        r.mesh.rotation.z = -Math.sin(angleDiff) * 0.35; // Bank roll into turns
        r.mesh.rotation.x = Math.min(r.speed * 0.12, 0.15); // Forward pitch

        r.propellers.forEach((p, pIdx) => {
          p.rotation.y += (pIdx % 2 === 0 ? 1 : -1) * delta * 55;
        });

        if (r.statusLight) {
          r.statusLight.visible = (Math.floor(clock.getElapsedTime() * 5) % 2 === 0);
        }
        if (!r.status.includes('Evading')) r.status = 'In Flight / Surveillance';
      } else if (r.type === 'humanoid') {
        // Humanoid Bipedal Walking Kinematics
        resolveObstacleCollisions(currentPos, g1Radius());

        if (r.isWaving) {
          r.waveTimer = (r.waveTimer || 3.5) - delta;
          if (r.rightArm) {
            r.rightArm.rotation.x = -2.2;
            r.rightArm.rotation.z = -0.3 + Math.sin(clock.getElapsedTime() * 12) * 0.4;
          }
          if (r.waveTimer <= 0) {
            r.isWaving = false;
          }
        }

        r.walkCycle = (r.walkCycle || 0) + moveStep * 7.5;
        const swing = Math.sin(r.walkCycle);
        if (r.leftLeg) r.leftLeg.rotation.x = swing * 0.42;
        if (r.rightLeg) r.rightLeg.rotation.x = -swing * 0.42;
        if (r.leftKnee) r.leftKnee.rotation.x = Math.max(0, -swing) * 0.52;
        if (r.rightKnee) r.rightKnee.rotation.x = Math.max(0, swing) * 0.52;
        if (r.leftArm) r.leftArm.rotation.x = -swing * 0.32;
        if (r.rightArm && !r.isWaving) {
          r.rightArm.rotation.x = swing * 0.32;
          r.rightArm.rotation.z = 0;
        }

        r.mesh.position.y = 0.05 + Math.abs(Math.sin(r.walkCycle * 2)) * 0.025;
        if (!r.status.includes('Evading') && !r.status.includes('En Route') && !r.status.startsWith('Yielding')) r.status = 'Bipedal Walking';
      } else {
        // Wheeled AMR Rover Dynamics
        resolveObstacleCollisions(currentPos, amrHalfWidth());

        // Self-healing stuck watchdog: if an AMR trying to reach its target makes < 0.04m progress in 3.0s,
        // clear any stale lock, step out of obstacle margins if needed, and re-plan its A* route.
        if (!r.lastProgressPos) {
          r.lastProgressPos = { x: currentPos.x, z: currentPos.z };
          r.stuckWatchdogTimer = 0;
        } else {
          const prog = Math.hypot(currentPos.x - r.lastProgressPos.x, currentPos.z - r.lastProgressPos.z);
          if (prog >= 0.04) {
            r.lastProgressPos.x = currentPos.x;
            r.lastProgressPos.z = currentPos.z;
            r.stuckWatchdogTimer = 0;
          } else if (!(r.retreatTime > 0) && r.status !== 'Yielding to Pedestrian') {
            r.stuckWatchdogTimer = (r.stuckWatchdogTimer || 0) + delta;
            if (r.stuckWatchdogTimer >= 3.0) {
              r.stuckWatchdogTimer = 0;
              r.lastProgressPos.x = currentPos.x;
              r.lastProgressPos.z = currentPos.z;
              r.heldBy = null;
              r.heldTime = 0;
              r.lidarHold = false;
              r.detourCooldown = 0;
              if (localAStar.isBlocked(currentPos.x, currentPos.z, obstacleBoxes)) {
                const free = findNearestSafePoint(currentPos.x, currentPos.z);
                currentPos.x = THREE.MathUtils.lerp(currentPos.x, free.x, 0.5);
                currentPos.z = THREE.MathUtils.lerp(currentPos.z, free.z, 0.5);
              }
              planWaypointLeg(r);
            }
          }
        }

        if (r.wheels) {
          const wheelRadius = robotBody('amr').wheelRadius;
          r.wheels.forEach(w => {
            w.rotation.x += (moveStep / wheelRadius);
          });
        }
        if (!r.status.includes('Evading') && !r.status.includes('Docked') && !r.status.startsWith('At ')) {
          if (!r.isCustomMission && !r.status.includes('Standby')) r.status = 'Patrolling';
        }
      }

      if (r.status.includes('Charging') || r.status.includes('Docked')) {
        r.battery = Math.min(100, r.battery + delta * 0.6);
      } else {
        r.battery = Math.max(0, r.battery - delta * 0.05);
      }
    } else {
      r.retreatTime = 0; // arrived: a retreat (if any) is over
      if (r.type === 'amr' && isDockingMission) {
        // Centered squarely inside the dock parking bay decal and aligned facing out into aisle
        currentPos.x = THREE.MathUtils.lerp(currentPos.x, targetPos.x, Math.min(1.0, delta * 12.0));
        currentPos.z = THREE.MathUtils.lerp(currentPos.z, targetPos.z, Math.min(1.0, delta * 12.0));
        r.position.x = currentPos.x;
        r.position.z = currentPos.z;
        r.speed = 0.0;
        const targetHeading = (targetPos.z > 0) ? Math.PI : 0;
        r.heading = THREE.MathUtils.lerp(r.heading, targetHeading, Math.min(1.0, delta * 8.0));
      }
      if (r.type === 'drone') {
        r.mesh.position.y = r.hoverAltitude + Math.sin(clock.getElapsedTime() * 3) * 0.03;
        r.mesh.rotation.z *= 0.9;
        r.mesh.rotation.x *= 0.9;
        r.propellers.forEach((p, pIdx) => {
          p.rotation.y += (pIdx % 2 === 0 ? 1 : -1) * delta * 40;
        });
      } else if (r.type === 'humanoid') {
        if (r.leftLeg) r.leftLeg.rotation.x *= 0.85;
        if (r.rightLeg) r.rightLeg.rotation.x *= 0.85;
        if (r.leftKnee) r.leftKnee.rotation.x *= 0.85;
        if (r.rightKnee) r.rightKnee.rotation.x *= 0.85;
        if (r.leftArm) r.leftArm.rotation.x *= 0.85;
        if (r.rightArm && !r.isWaving) {
          r.rightArm.rotation.x *= 0.85;
          r.rightArm.rotation.z = 0;
        }
        r.mesh.position.y = 0.05;

        if (r.isWaving) {
          r.waveTimer = (r.waveTimer || 3.5) - delta;
          if (r.rightArm) {
            r.rightArm.rotation.x = -2.2;
            r.rightArm.rotation.z = -0.3 + Math.sin(clock.getElapsedTime() * 12) * 0.4;
          }
          if (r.waveTimer <= 0) {
            r.isWaving = false;
          }
        }
      }

      if (r.isCustomMission) {
        if (!r.hasArrivedMission) {
          r.hasArrivedMission = true;
          const sName = r.missionStationName || 'Target Station';
          const shortName = sName.includes(':') ? sName.split(':')[1].trim() : sName;
          if (r.type === 'drone') {
            r.status = `Hovering: ${shortName}`;
            r.speed = 0.0;
            appendDroneChatMessage('🚁 SkyWatcher Drone', `📍 Waypoint Reached: Holding steady hover above ${sName} at ${(r.mesh ? r.mesh.position.y : 1.9).toFixed(2)}m AGL. Conducting aerial visual scan.`);
          } else if (r.type === 'humanoid') {
            r.status = `Inspecting: ${shortName}`;
            r.speed = 0.0;
            appendG1ChatMessage('🤖 Unitree G1 Silver', `📍 Target Reached: Arrived at ${sName}! Standing by at inspection point.`);
          } else {
            // Autonomous Mobile Robot (AMR)
            if (r.missionStationKey === 'charger' || sName.includes('Charger') || sName.includes('Dock') || sName.includes('Bay')) {
              r.status = sName.includes('Bay') ? `Docked at ${shortName} (Standby)` : 'Docked / Charging';
              r.speed = 0.0;
              r.isCharging = true;
              appendRoverChatMessage(r.id, `🚜 ${r.name}`, `⚡ Docked at ${sName}! Inductive magnetic lock engaged. Battery recharging active.`);
            } else {
              r.status = `At ${shortName}`;
              r.speed = 0.0;
              appendRoverChatMessage(r.id, `🚜 ${r.name}`, `📍 Target Reached: Arrived at ${sName}! Brakes locked. Ready for payload transfer.`);
            }
          }
        }
      }

      // Automatic Dock Clearing & Standby: When at Station D and 100% full, return to assigned Home Dock!
      if (r.status && (r.status.includes('Docked') || r.status.includes('Charging') || r.isCharging)) {
        r.battery = Math.min(100, r.battery + delta * 8.0);
        if (r.battery >= 99.5 && !r.isAutoUndocking) {
          r.battery = 100;
          r.isCharging = false;
          r.isReturningToCharge = false;

          // If currently at the shared fast-charger Station D, undock and return to assigned Home Dock!
          if (r.missionStationKey === 'charger' || (r.missionStationName && r.missionStationName.includes('Station D'))) {
            r.isAutoUndocking = true;
            setTimeout(() => { r.isAutoUndocking = false; }, 4000);
            r.isCustomMission = false;
            r.hasArrivedMission = false;
            r.missionStationKey = null;
            r.missionStationName = null;
            r.speed = (r.id === 'AMR-02' ? 1.0 : 0.85);

            // Return to its assigned Home Dock to free the rapid charger!
            const dockKey = r.homeDockKey || ('dock' + (parseInt(r.id.split('-')[1]) || 1));
            const homeDock = (labStations && labStations[dockKey]) ? labStations[dockKey] : labStations.inventory;
            dispatchSelectedRobot(homeDock.pos, homeDock.name, r.id);
            appendRoverChatMessage(r.id, `🚜 ${r.name}`, `⚡ 100% Fully Charged! Undocked from Station D and returning to ${homeDock.name}.`);

            const banner = document.querySelector('.dispatch-banner');
            if (banner) {
              banner.innerHTML = `<span>⚡ <b>${r.name} 100% Fully Charged:</b> Undocked from Station D and returning to ${homeDock.name}!</span>`;
              setTimeout(() => {
                banner.innerHTML = `<span>🎯 <b>Interactive Dispatch Mode</b>: Click any point on the floor to route <span id="dispatch-target-name" style="color: #38bdf8;">${selectedRobotId}</span></span>`;
              }, 3500);
            }
          } else {
            // Already at assigned home dock: stay in standby!
            r.speed = 0.0;
            const bayNum = r.homeDockKey ? r.homeDockKey.replace('dock', '') : '1';
            r.status = `Docked at Bay ${bayNum} (Standby)`;
          }
        }
      } else if (!r.isDetouring && r.waypoints && r.waypoints.length > 0 && r.speed > 0) {
        r.waypointIdx = (r.waypointIdx + 1) % r.waypoints.length;
        r.target.copy(r.waypoints[r.waypointIdx]);
      }
    }

    if (r.mesh) {
      r.mesh.position.copy(currentPos);
      r.mesh.rotation.y = r.heading;
    }
  });

  if (targetBeacon && targetBeacon.position.y > -5) {
    const scale = 1.0 + Math.sin(clock.getElapsedTime() * 6) * 0.15;
    targetBeacon.scale.set(scale, 1, scale);
  }
}

function updateFPVCamera() {
  const sel = robotDefs.find(r => r.id === selectedRobotId);
  if (!sel || !sel.mesh) return;

  const robotPos = sel.position;
  const forwardX = Math.sin(sel.heading);
  const forwardZ = Math.cos(sel.heading);

  if (sel.type === 'drone') {
    if (isDroneCockpitCam) {
      // First-Person Cockpit View: Right at drone front nose looking ahead
      camera.position.set(
        robotPos.x + forwardX * 0.16,
        robotPos.y + 0.08,
        robotPos.z + forwardZ * 0.16
      );
      const pitchOffset = (sel.mesh ? -sel.mesh.rotation.x * 0.45 : 0) - 0.08;
      camera.lookAt(
        robotPos.x + forwardX * 8.0,
        robotPos.y + pitchOffset,
        robotPos.z + forwardZ * 8.0
      );
    } else {
      // Third-Person Chase View: elevated behind drone looking forward
      camera.position.set(
        robotPos.x - forwardX * 0.85,
        robotPos.y + 0.38,
        robotPos.z - forwardZ * 0.85
      );
      camera.lookAt(
        robotPos.x + forwardX * 4.5,
        robotPos.y + 0.05,
        robotPos.z + forwardZ * 4.5
      );
    }
  } else if (sel.type === 'humanoid') {
    // Humanoid Eye-Level (1.15m) Halo Visor FPV
    if (isAmrBumperCam) {
      camera.position.set(
        robotPos.x + forwardX * 0.12,
        robotPos.y + 1.15,
        robotPos.z + forwardZ * 0.12
      );
      camera.lookAt(
        robotPos.x + forwardX * 5.0,
        robotPos.y + 1.05,
        robotPos.z + forwardZ * 5.0
      );
    } else {
      camera.position.set(
        robotPos.x - forwardX * 1.5,
        robotPos.y + 1.6,
        robotPos.z - forwardZ * 1.5
      );
      camera.lookAt(
        robotPos.x + forwardX * 3.5,
        robotPos.y + 0.9,
        robotPos.z + forwardZ * 3.5
      );
    }
  } else {
    // Wheeled AMR (AMR-01, AMR-02, AMR-03): camera offsets follow its model's scale.
    const s = modelScale('amr', calibration.metersPerUnit)[1];
    if (isAmrBumperCam) {
      // Front Bumper / Lidar Cockpit View:
      camera.position.set(
        robotPos.x + forwardX * (0.35 * s),
        robotPos.y + (0.28 * s),
        robotPos.z + forwardZ * (0.35 * s)
      );
      camera.lookAt(
        robotPos.x + forwardX * 6.0,
        robotPos.y + (0.24 * s),
        robotPos.z + forwardZ * 6.0
      );
    } else {
      // Third-Person Elevated Chase View:
      camera.position.set(
        robotPos.x - forwardX * (1.6 * s),
        robotPos.y + (0.85 * s),
        robotPos.z - forwardZ * (1.6 * s)
      );
      camera.lookAt(
        robotPos.x + forwardX * 5.0,
        robotPos.y + 0.30,
        robotPos.z + forwardZ * 5.0
      );
    }
  }
}

// ==========================================
// CALIBRATION & ALIGNMENT CONTROLS
// ==========================================
function setupCalibrationControls() {
  const tunerPanel = document.getElementById('calibration-panel');
  const btnToggle = document.getElementById('btn-toggle-tuner');
  const btnClose = document.getElementById('btn-close-tuner');

  if (btnToggle) {
    btnToggle.onclick = () => {
      const isVisible = tunerPanel.style.display !== 'none';
      tunerPanel.style.display = isVisible ? 'none' : 'flex';
      btnToggle.classList.toggle('active', !isVisible);
      if (isVisible) cancelScanMeasure();
    };
  }

  if (btnClose) {
    btnClose.onclick = () => {
      tunerPanel.style.display = 'none';
      if (btnToggle) btnToggle.classList.remove('active');
      cancelScanMeasure();
    };
  }

  // Scan scale: real meters per app unit. Every robot is drawn and simulated at its real size on it.
  const sScanScale = document.getElementById('slider-meters-per-unit');
  const vScanScale = document.getElementById('val-meters-per-unit');
  if (sScanScale) {
    sScanScale.value = calibration.metersPerUnit;
    if (vScanScale) vScanScale.innerText = `${calibration.metersPerUnit.toFixed(2)} m`;
    sScanScale.oninput = (e) => {
      calibration.metersPerUnit = parseFloat(e.target.value);
      if (vScanScale) vScanScale.innerText = `${calibration.metersPerUnit.toFixed(2)} m`;
      applyRobotScale();
    };
  }

  const btnMeasure = document.getElementById('btn-measure-scan');
  if (btnMeasure) btnMeasure.onclick = startScanMeasure;
  const btnMeasureCancel = document.getElementById('btn-measure-cancel');
  if (btnMeasureCancel) btnMeasureCancel.onclick = cancelScanMeasure;
  const btnMeasureSave = document.getElementById('btn-measure-save');
  if (btnMeasureSave) btnMeasureSave.onclick = saveScanMeasure;
  const inputMeasureReal = document.getElementById('input-measure-real');
  if (inputMeasureReal) inputMeasureReal.oninput = updateScanMeasurePanel;

  const sMeshScale = document.getElementById('slider-mesh-scale');
  const vMeshScale = document.getElementById('val-mesh-scale');
  if (sMeshScale) {
    sMeshScale.value = calibration.meshScale;
    if (vMeshScale) vMeshScale.innerText = `${calibration.meshScale.toFixed(2)}x`;
    sMeshScale.oninput = (e) => {
      calibration.meshScale = parseFloat(e.target.value);
      if (vMeshScale) vMeshScale.innerText = `${calibration.meshScale.toFixed(2)}x`;
      applyMeshTransform();
    };
  }

  const sMeshRot = document.getElementById('slider-mesh-rot');
  const vMeshRot = document.getElementById('val-mesh-rot');
  if (sMeshRot) {
    sMeshRot.value = calibration.meshRotY;
    if (vMeshRot) vMeshRot.innerText = `${calibration.meshRotY}°`;
    sMeshRot.oninput = (e) => {
      calibration.meshRotY = parseFloat(e.target.value);
      if (vMeshRot) vMeshRot.innerText = `${calibration.meshRotY}°`;
      applyMeshTransform();
    };
  }

  const sMeshX = document.getElementById('slider-mesh-x');
  const vMeshX = document.getElementById('val-mesh-x');
  if (sMeshX) {
    sMeshX.value = calibration.meshOffsetX;
    if (vMeshX) vMeshX.innerText = `${calibration.meshOffsetX.toFixed(2)}m`;
    sMeshX.oninput = (e) => {
      calibration.meshOffsetX = parseFloat(e.target.value);
      if (vMeshX) vMeshX.innerText = `${calibration.meshOffsetX.toFixed(2)}m`;
      applyMeshTransform();
    };
  }

  const sMeshY = document.getElementById('slider-mesh-y');
  const vMeshY = document.getElementById('val-mesh-y');
  if (sMeshY) {
    const curY = (calibration.meshOffsetY !== undefined) ? calibration.meshOffsetY : 0.0;
    sMeshY.value = curY;
    if (vMeshY) vMeshY.innerText = `${curY.toFixed(2)}m`;
    sMeshY.oninput = (e) => {
      calibration.meshOffsetY = parseFloat(e.target.value);
      if (vMeshY) vMeshY.innerText = `${calibration.meshOffsetY.toFixed(2)}m`;
      applyMeshTransform();
    };
  }

  const sMeshZ = document.getElementById('slider-mesh-z');
  const vMeshZ = document.getElementById('val-mesh-z');
  if (sMeshZ) {
    sMeshZ.value = calibration.meshOffsetZ;
    if (vMeshZ) vMeshZ.innerText = `${calibration.meshOffsetZ.toFixed(2)}m`;
    sMeshZ.oninput = (e) => {
      calibration.meshOffsetZ = parseFloat(e.target.value);
      if (vMeshZ) vMeshZ.innerText = `${calibration.meshOffsetZ.toFixed(2)}m`;
      applyMeshTransform();
    };
  }

  const sBoundW = document.getElementById('slider-bound-w');
  const vBoundW = document.getElementById('val-bound-w');
  if (sBoundW) {
    sBoundW.value = calibration.boundWidth;
    if (vBoundW) vBoundW.innerText = `${calibration.boundWidth.toFixed(1)}m`;
    sBoundW.oninput = (e) => {
      calibration.boundWidth = parseFloat(e.target.value);
      if (vBoundW) vBoundW.innerText = `${calibration.boundWidth.toFixed(1)}m`;
      buildBoundariesAndStations();
      invalidateFleetSchedule();
    };
  }

  const sBoundD = document.getElementById('slider-bound-d');
  const vBoundD = document.getElementById('val-bound-d');
  if (sBoundD) {
    sBoundD.value = calibration.boundDepth;
    if (vBoundD) vBoundD.innerText = `${calibration.boundDepth.toFixed(1)}m`;
    sBoundD.oninput = (e) => {
      calibration.boundDepth = parseFloat(e.target.value);
      if (vBoundD) vBoundD.innerText = `${calibration.boundDepth.toFixed(1)}m`;
      buildBoundariesAndStations();
      invalidateFleetSchedule();
    };
  }

  // Snap Boundaries to Full 24m × 24m Floor Grid
  const btnSnapGrid = document.getElementById('btn-snap-grid-bounds');
  if (btnSnapGrid) {
    btnSnapGrid.onclick = () => {
      calibration.boundWidth = 24.0;
      calibration.boundDepth = 24.0;
      if (sBoundW) sBoundW.value = 24.0;
      if (vBoundW) vBoundW.innerText = '24.0m';
      if (sBoundD) sBoundD.value = 24.0;
      if (vBoundD) vBoundD.innerText = '24.0m';
      buildBoundariesAndStations();
      invalidateFleetSchedule();
      saveCalibration();
      btnSnapGrid.innerText = '✅ Snapped to Grid (24m × 24m)';
      setTimeout(() => {
        btnSnapGrid.innerText = '📐 Expand to Full Grid Size (24m × 24m)';
      }, 2000);
    };
  }

  const btnReset = document.getElementById('btn-reset-alignment');
  if (btnReset) {
    btnReset.onclick = () => {
      // Resets the active scan only, and saves the defaults for it (so an older saved calibration
      // is not picked up again on reload).
      calibration = { ...CALIBRATION_DEFAULTS };
      calibrationByScan[activeScan] = calibration;
      saveCalibration();
      setupCalibrationControls();
      applyMeshTransform();
      applyRobotScale();
      buildBoundariesAndStations();
      invalidateFleetSchedule();
    };
  }

  const btnLock = document.getElementById('btn-lock-alignment');
  if (btnLock) {
    btnLock.onclick = () => {
      saveCalibration(); // the active scan's calibration only
      btnLock.innerText = '✅ Saved!';
      setTimeout(() => { btnLock.innerText = '💾 Save'; }, 1500);
    };
  }
}

// Measuring the scan (Scale & Align): two points clicked on the scan mesh and the real distance
// between them give the active scan's meters per app unit, which sizes every robot on it. While
// measuring, clicks on the scene only place points. Nothing changes until Save.
function startScanMeasure() {
  cancelScanMeasure();
  const group = new THREE.Group();
  group.name = 'scanMeasure';
  scene.add(group);
  const banner = document.querySelector('.dispatch-banner');
  scanMeasure = { points: [], group, bannerHTML: banner ? banner.innerHTML : null };
  document.body.style.cursor = 'crosshair';
  const panel = document.getElementById('scan-measure-panel');
  if (panel) panel.style.display = 'flex';
  updateScanMeasurePanel();
}

function clearScanMeasureMarks() {
  while (scanMeasure.group.children.length > 0) {
    const c = scanMeasure.group.children[0];
    if (c.geometry) c.geometry.dispose();
    if (c.material) c.material.dispose();
    scanMeasure.group.remove(c);
  }
}

function cancelScanMeasure() {
  if (!scanMeasure) return;
  clearScanMeasureMarks();
  scene.remove(scanMeasure.group);
  const banner = document.querySelector('.dispatch-banner');
  if (banner && scanMeasure.bannerHTML !== null) banner.innerHTML = scanMeasure.bannerHTML;
  scanMeasure = null;
  document.body.style.cursor = 'default';
  const panel = document.getElementById('scan-measure-panel');
  if (panel) panel.style.display = 'none';
}

// A click while measuring: the point on the scan under it is the next point (a third click starts
// a new measurement from it).
function addScanMeasurePoint() {
  const hits = labModel ? raycaster.intersectObject(labModel, true) : [];
  if (hits.length === 0) {
    setScanMeasureBanner('📏 No scan surface there: click on the scan.');
    return;
  }
  if (scanMeasure.points.length === 2) {
    scanMeasure.points = [];
    clearScanMeasureMarks();
  }
  const p = hits[0].point.clone();
  scanMeasure.points.push(p);
  const marker = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfacc15, depthTest: false }));
  marker.position.copy(p);
  marker.renderOrder = 10;
  scanMeasure.group.add(marker);
  if (scanMeasure.points.length === 2) {
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(scanMeasure.points), new THREE.LineBasicMaterial({ color: 0xfacc15, depthTest: false }));
    line.renderOrder = 10;
    scanMeasure.group.add(line);
  }
  updateScanMeasurePanel();
}

function setScanMeasureBanner(html) {
  const banner = document.querySelector('.dispatch-banner');
  if (banner) banner.innerHTML = `<span>${html}</span>`;
}

// The measurement so far: null until both points are placed.
function currentScanMeasure() {
  if (!scanMeasure || scanMeasure.points.length < 2) return null;
  const input = document.getElementById('input-measure-real');
  const [a, b] = scanMeasure.points;
  return measureMetersPerUnit(a, b, input ? parseFloat(input.value) : NaN);
}

function updateScanMeasurePanel() {
  if (!scanMeasure) return;
  const m = currentScanMeasure();
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.innerText = text; };
  const step = scanMeasure.points.length === 0 ? 'Click the first point on the scan.'
    : scanMeasure.points.length === 1 ? 'Click the second point on the scan.'
      : 'Enter the real distance between the points, then Save.';
  set('scan-measure-step', step);
  setScanMeasureBanner(`📏 <b>Measuring the ${isCampusScan(activeScan) ? (activeScan === 'mdc_north_campus_osm.glb' ? 'MDC North Campus (OSM CAD)' : 'MDC North Campus') : (activeScan === 'scan_house.glb' ? 'House & Yard' : 'Classroom')} scan</b>: ${step} Esc cancels.`);
  set('scan-measure-units', m ? `${m.units.toFixed(3)} units` : '–');
  set('scan-measure-result', m && m.metersPerUnit ? `1 unit = ${m.metersPerUnit.toFixed(2)} m` : '–');
  set('scan-measure-error', m && !m.ok ? m.reason : '');
  const save = document.getElementById('btn-measure-save');
  if (save) save.disabled = !(m && m.ok);
}

// Stores the measured meters per unit for the active scan only (its other unsaved Scale & Align
// changes stay unsaved), and sizes every robot to it.
function saveScanMeasure() {
  const m = currentScanMeasure();
  if (!m || !m.ok) return;
  calibration.metersPerUnit = m.metersPerUnit;
  try {
    localStorage.setItem(calibrationKey(activeScan), JSON.stringify(withMetersPerUnit(activeScan, m.metersPerUnit, readStorage)));
  } catch (e) { }
  cancelScanMeasure();
  applyRobotScale();
  setupCalibrationControls();
  setScanMeasureBanner(`✅ <b>Scan scale saved</b>: 1 unit = ${m.metersPerUnit.toFixed(2)} m. Every robot is shown at its real size.`);
}

// Update Custom Zones UI Count
function updateCustomCountUI() {
  const customCount = obstacleBoxes.filter(b => b.userCreated).length;
  const countEl = document.getElementById('custom-count');
  const clearBtn = document.getElementById('btn-clear-custom');
  if (countEl) countEl.innerText = customCount;
  if (clearBtn) clearBtn.style.display = customCount > 0 ? 'flex' : 'none';
}

// Waypoint legs are planned once, when they start: after the boxes change, plan every robot's
// current leg again (a leg that had no route may have one now, and the other way round).
function replanAllLegs() {
  robotDefs.forEach(r => {
    r.plannedLegKey = null;
    r.failedLegKeys = null;
  });
}

// Saves the active scan's zones; the other scans' zones are kept as they are.
function saveCustomZones() {
  allCustomZones = replaceScanZones(allCustomZones, activeScan, obstacleBoxes.filter(b => b.userCreated));
  try {
    localStorage.setItem(ZONES_KEY, JSON.stringify(allCustomZones));
  } catch (e) { }
  replanAllLegs();
  invalidateFleetSchedule();
  updateCustomCountUI();
  updateZoneChipsUI();
}

function setupEventListeners() {
  window.addEventListener('resize', onWindowResize);

  // Interactive 3D Drag & Drop and Hover for Boundary Boxes
  let pointerDownPos = { x: 0, y: 0 };
  let pointerDownTime = 0;
  let didDragBox = false;

  window.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return; // Only primary left-click
    if (e.target.closest('.sidebar') || e.target.closest('.top-bar') || e.target.closest('.calibration-panel') || e.target.closest('.zone-editor-panel') || e.target.closest('button') || e.target.closest('select') || e.target.closest('input')) return;

    pointerDownPos = { x: e.clientX, y: e.clientY };
    pointerDownTime = performance.now();
    didDragBox = false;
    if (scanMeasure) return; // measuring the scan: the click places a point (on pointer up)

    // Check if an obstacle box, station, or waypoint is clicked
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    // 1. Check if a station is clicked for dragging
    if (stationsGroup && !isAddingBoundaryMode) {
      const stationHits = raycaster.intersectObjects(stationsGroup.children, true);
      for (let hit of stationHits) {
        if (hit.object && hit.object.userData && hit.object.userData.isStation) {
          const sKey = hit.object.userData.stationKey;
          isDraggingStation = true;
          draggedStationKey = sKey;
          controls.enabled = false;
          document.body.style.cursor = 'grabbing';

          const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
          const hitPoint = new THREE.Vector3();
          if (raycaster.ray.intersectPlane(groundPlane, hitPoint)) {
            const st = labStations[sKey];
            dragOffset.set(st.pos.x - hitPoint.x, st.pos.z - hitPoint.z);
          }
          return;
        }
      }
    }

    // 1.5. Check if a campus building ground bay or floating label is clicked for dragging
    if (campusBuildingVisualsGroup && campusBuildingVisualsGroup.visible && !isAddingBoundaryMode) {
      const bldgHits = raycaster.intersectObjects(campusBuildingVisualsGroup.children, true);
      for (let hit of bldgHits) {
        let obj = hit.object;
        while (obj && (!obj.userData || !obj.userData.isBuilding) && obj.parent) {
          obj = obj.parent;
        }
        if (obj && obj.userData && obj.userData.isBuilding && obj.userData.bldg) {
          const bldg = obj.userData.bldg;
          isDraggingBuilding = true;
          draggedBuildingId = bldg.id;
          draggedBuildingPart = obj.userData.part || (hit.point.y > 0.4 ? 'label' : 'bay');
          controls.enabled = false;
          document.body.style.cursor = 'grabbing';

          const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
          const hitPoint = new THREE.Vector3();
          if (raycaster.ray.intersectPlane(groundPlane, hitPoint)) {
            const refPos = (draggedBuildingPart === 'bay') ? bldg.dropoff : bldg.center;
            dragOffset.set(refPos.x - hitPoint.x, refPos.z - hitPoint.z);
          }
          return;
        }
      }
    }

    // 1.75. Check if Central Storage & Sorting Depot is clicked for dragging
    if (logisticsDispatcher && logisticsDispatcher.depotObj && logisticsDispatcher.depotObj.group && logisticsDispatcher.depotObj.group.visible && !isAddingBoundaryMode) {
      const depotHits = raycaster.intersectObjects(logisticsDispatcher.depotObj.group.children, true);
      if (depotHits.length > 0) {
        isDraggingDepot = true;
        controls.enabled = false;
        document.body.style.cursor = 'grabbing';

        const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const hitPoint = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(groundPlane, hitPoint)) {
          const dc = logisticsDispatcher.depotCenter;
          dragOffset.set(dc.x - hitPoint.x, dc.z - hitPoint.z);
        }
        return;
      }
    }

    // 2. Check if a waypoint node is clicked for dragging or dispatch
    if (waypointsGroup && waypointsGroup.visible && !isAddingBoundaryMode) {
      const wpHits = raycaster.intersectObjects(waypointsGroup.children, true);
      for (let hit of wpHits) {
        if (hit.object && hit.object.userData && hit.object.userData.isWaypoint) {
          const wpIdx = hit.object.userData.index;
          const targetRid = hit.object.userData.robotId || activeEditingWaypointsRobotId || selectedRobotId;
          const robot = robotDefs.find(r => r.id === targetRid) || robotDefs[0];
          if (robot && robot.waypoints && robot.waypoints[wpIdx]) {
            isDraggingWaypoint = true;
            draggedWaypointIdx = wpIdx;
            draggedWaypointRobotId = robot.id;
            controls.enabled = false;
            document.body.style.cursor = 'grabbing';

            const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
            const hitPoint = new THREE.Vector3();
            if (raycaster.ray.intersectPlane(groundPlane, hitPoint)) {
              const wpPos = robot.waypoints[wpIdx];
              dragOffset.set(wpPos.x - hitPoint.x, wpPos.z - hitPoint.z);
            }
            return;
          }
        }
      }
    }

    // 3. Check if an obstacle box is clicked for dragging or selection
    if (boundaryGroup && boundaryGroup.visible && !isAddingBoundaryMode) {
      const obHits = raycaster.intersectObjects(boundaryGroup.children, true);
      for (let hit of obHits) {
        if (hit.object && hit.object.userData && hit.object.userData.isObstacle) {
          const idx = hit.object.userData.obstacleIdx;
          selectObstacleZone(idx);
          isDraggingObstacle = true;
          draggedObstacleIdx = idx;
          controls.enabled = false; // Freeze OrbitControls so camera doesn't spin during drag
          document.body.style.cursor = 'grabbing';

          const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
          const hitPoint = new THREE.Vector3();
          if (raycaster.ray.intersectPlane(groundPlane, hitPoint)) {
            const ob = obstacleBoxes[idx];
            const cx = (ob.minX + ob.maxX) / 2;
            const cz = (ob.minZ + ob.maxZ) / 2;
            dragOffset.set(cx - hitPoint.x, cz - hitPoint.z);
          }
          return;
        }
      }
    }
  });

  window.addEventListener('pointermove', (e) => {
    // 0. Actively dragging a station pad across the classroom or yard floor
    if (isDraggingStation && draggedStationKey && labStations[draggedStationKey]) {
      const dragDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (dragDist > 4) didDragBox = true;

      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const hitPoint = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(groundPlane, hitPoint)) {
        const limits = getEnvironmentLimits();
        let newX = hitPoint.x + dragOffset.x;
        let newZ = hitPoint.z + dragOffset.y;

        // Clamp inside environment limits
        newX = Math.max(limits.minX + 0.35, Math.min(limits.maxX - 0.35, newX));
        newZ = Math.max(limits.minZ + 0.35, Math.min(limits.maxZ - 0.35, newZ));

        labStations[draggedStationKey].pos.set(newX, 0.05, newZ);
        if (stationMeshes[draggedStationKey]) {
          stationMeshes[draggedStationKey].position.set(newX, 0.05, newZ);
        }

        const banner = document.querySelector('.dispatch-banner');
        if (banner) {
          const sName = labStations[draggedStationKey].name;
          const envName = isCampusScan(activeScan) ? 'Campus' : (activeScan === 'scan_house.glb' ? 'Yard' : 'Classroom');
          banner.innerHTML = `<span>📍 <b>Relocating ${sName} in ${envName}</b>: [X: ${newX.toFixed(2)}m, Z: ${newZ.toFixed(2)}m] — Release to set position</span>`;
        }
      }
      return;
    }

    // 0.05 Actively dragging a Campus Building Bay (#1..#9, A) or Floating Roof Label
    if (isDraggingBuilding && draggedBuildingId) {
      const bldg = campusDestinations.find(b => b.id === draggedBuildingId);
      if (bldg) {
        const dragDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
        if (dragDist > 4) didDragBox = true;

        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const hitPoint = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(groundPlane, hitPoint)) {
          const limits = getEnvironmentLimits();
          let newX = hitPoint.x + dragOffset.x;
          let newZ = hitPoint.z + dragOffset.y;

          newX = Math.max(limits.minX + 0.25, Math.min(limits.maxX - 0.25, newX));
          newZ = Math.max(limits.minZ + 0.25, Math.min(limits.maxZ - 0.25, newZ));

          if (draggedBuildingPart === 'bay') {
            bldg.dropoff.x = newX;
            bldg.dropoff.z = newZ;
          } else {
            bldg.center.x = newX;
            bldg.center.z = newZ;
          }

          buildCampusBuildingVisuals();

          const banner = document.querySelector('.dispatch-banner');
          if (banner) {
            const partDesc = (draggedBuildingPart === 'bay') ? `Ground Bay #${bldg.code}` : `Floating Name (${bldg.name})`;
            banner.innerHTML = `<span>📍 <b>Relocating ${partDesc}</b>: [X: ${newX.toFixed(2)}m, Z: ${newZ.toFixed(2)}m] — Release to set position</span>`;
          }
        }
      }
      return;
    }

    // 0.08 Actively dragging MDC Central Storage & Sorting Depot in 3D
    if (isDraggingDepot && logisticsDispatcher) {
      const dragDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (dragDist > 4) didDragBox = true;

      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const hitPoint = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(groundPlane, hitPoint)) {
        const limits = getEnvironmentLimits();
        let newX = hitPoint.x + dragOffset.x;
        let newZ = hitPoint.z + dragOffset.y;

        newX = Math.max(limits.minX + 0.8, Math.min(limits.maxX - 0.8, newX));
        newZ = Math.max(limits.minZ + 0.8, Math.min(limits.maxZ - 0.8, newZ));

        logisticsDispatcher.setDepotPosition(newX, newZ);

        const banner = document.querySelector('.dispatch-banner');
        if (banner) {
          banner.innerHTML = `<span>📦 <b>Relocating Central Storage Depot</b>: [X: ${newX.toFixed(2)}m, Z: ${newZ.toFixed(2)}m] — Release to set new facility hub</span>`;
        }
      }
      return;
    }

    // 0.1 Actively dragging a Waypoint (WP-1, WP-2, WP-3, WP-4...) across the floor / area
    if (isDraggingWaypoint && draggedWaypointIdx !== null) {
      const dragDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (dragDist > 4) didDragBox = true;

      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const hitPoint = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(groundPlane, hitPoint)) {
        const robot = robotDefs.find(r => r.id === draggedWaypointRobotId) || robotDefs[0];
        if (robot && robot.waypoints && robot.waypoints[draggedWaypointIdx]) {
          const limits = getEnvironmentLimits();
          let newX = hitPoint.x + dragOffset.x;
          let newZ = hitPoint.z + dragOffset.y;

          newX = Math.max(limits.minX + 0.25, Math.min(limits.maxX - 0.25, newX));
          newZ = Math.max(limits.minZ + 0.25, Math.min(limits.maxZ - 0.25, newZ));

          robot.waypoints[draggedWaypointIdx].x = newX;
          robot.waypoints[draggedWaypointIdx].z = newZ;

          buildWaypointsVisuals();

          const banner = document.querySelector('.dispatch-banner');
          if (banner) {
            banner.innerHTML = `<span>📍 <b>Moving WP-${draggedWaypointIdx + 1} (${robot.name})</b>: [X: ${newX.toFixed(2)}m, Z: ${newZ.toFixed(2)}m] — Release to set position</span>`;
          }
        }
      }
      return;
    }

    // 1. Actively dragging an obstacle box across the floor
    if (isDraggingObstacle && draggedObstacleIdx !== null) {
      const dragDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (dragDist > 4) didDragBox = true;

      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const hitPoint = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(groundPlane, hitPoint)) {
        const ob = obstacleBoxes[draggedObstacleIdx];
        const halfW = (ob.maxX - ob.minX) / 2;
        const halfD = (ob.maxZ - ob.minZ) / 2;
        const limits = getEnvironmentLimits();
        let newCx = hitPoint.x + dragOffset.x;
        let newCz = hitPoint.z + dragOffset.y;

        // Clamp inside lab walls
        newCx = Math.max(limits.minX + halfW + 0.1, Math.min(limits.maxX - halfW - 0.1, newCx));
        newCz = Math.max(limits.minZ + halfD + 0.1, Math.min(limits.maxZ - halfD - 0.1, newCz));

        updateObstaclePosition(draggedObstacleIdx, newCx, newCz);
      }
      return;
    }

    // 2. Placing new boundary in Ghost Mode
    if (isAddingBoundaryMode && boundaryGhostMesh) {
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const hitPoint = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(groundPlane, hitPoint)) {
        boundaryGhostMesh.position.set(hitPoint.x, 0.05, hitPoint.z);
      }
      return;
    }

    // 3. Hover Feedback: Show 'grab' cursor
    if (!isAddingBoundaryMode && !isDraggingObstacle && !isDraggingStation && !isDraggingWaypoint && !isDraggingBuilding && !isDraggingDepot) {
      if (e.target.closest('.sidebar') || e.target.closest('.top-bar') || e.target.closest('.calibration-panel') || e.target.closest('.zone-editor-panel')) {
        document.body.style.cursor = 'default';
        return;
      }
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      const hitStations = stationsGroup ? raycaster.intersectObjects(stationsGroup.children, true) : [];
      const isOverStation = hitStations.some(h => h.object?.userData?.isStation);
      const hitWps = waypointsGroup ? raycaster.intersectObjects(waypointsGroup.children, true) : [];
      const isOverWp = hitWps.some(h => h.object?.userData?.isWaypoint);
      const hitObs = (boundaryGroup && boundaryGroup.visible) ? raycaster.intersectObjects(boundaryGroup.children, true) : [];
      const isOverOb = hitObs.some(h => h.object?.userData?.isObstacle);
      const hitBldgs = (campusBuildingVisualsGroup && campusBuildingVisualsGroup.visible)
        ? raycaster.intersectObjects(campusBuildingVisualsGroup.children, true)
        : [];
      const isOverBldg = hitBldgs.some(h => {
        let o = h.object;
        while (o && (!o.userData || !o.userData.isBuilding) && o.parent) o = o.parent;
        return o && o.userData && o.userData.isBuilding;
      });
      const hitDepot = (logisticsDispatcher && logisticsDispatcher.depotObj && logisticsDispatcher.depotObj.group && logisticsDispatcher.depotObj.group.visible)
        ? raycaster.intersectObjects(logisticsDispatcher.depotObj.group.children, true)
        : [];
      const isOverDepot = hitDepot.length > 0;

      if (isOverStation || isOverOb || isOverWp || isOverBldg || isOverDepot) {
        document.body.style.cursor = 'grab';
      } else {
        document.body.style.cursor = 'default';
      }
    }
  });

  window.addEventListener('pointerup', (e) => {
    // Finalize MDC Central Storage Depot Drag & Drop
    if (isDraggingDepot) {
      isDraggingDepot = false;
      controls.enabled = true;
      document.body.style.cursor = 'default';

      if (logisticsDispatcher) {
        if (didDragBox) {
          logisticsDispatcher.saveDepotPosition();
          const banner = document.querySelector('.dispatch-banner');
          if (banner) {
            banner.innerHTML = `<span>✅ <b>Central Storage Depot Relocated & Saved</b>! [X: ${logisticsDispatcher.depotCenter.x.toFixed(2)}m, Z: ${logisticsDispatcher.depotCenter.z.toFixed(2)}m]</span>`;
            setTimeout(() => {
              banner.innerHTML = `<span>🎯 <b>Interactive Dispatch Mode</b>: Click any point on the floor to route <span id="dispatch-target-name" style="color: #38bdf8;">${selectedRobotId}</span></span>`;
            }, 3500);
          }
        }
      }
      return;
    }
    // Finalize Campus Building Bay or Roof Label Drag & Drop
    if (isDraggingBuilding) {
      isDraggingBuilding = false;
      const bldg = campusDestinations.find(b => b.id === draggedBuildingId);
      const draggedPart = draggedBuildingPart;
      draggedBuildingId = null;
      draggedBuildingPart = null;
      controls.enabled = true;
      document.body.style.cursor = 'default';

      if (bldg) {
        if (didDragBox) {
          saveCustomBuildingPositions();
          const banner = document.querySelector('.dispatch-banner');
          if (banner) {
            const partDesc = (draggedPart === 'bay') ? `Ground Bay #${bldg.code}` : `Floating Name (${bldg.name})`;
            banner.innerHTML = `<span>✅ <b>${partDesc} Relocated & Saved</b>! Delivery routes updated.</span>`;
            setTimeout(() => {
              banner.innerHTML = `<span>🎯 <b>Interactive Dispatch Mode</b>: Click any point on the floor to route <span id="dispatch-target-name" style="color: #38bdf8;">${selectedRobotId}</span></span>`;
            }, 3500);
          }
        } else {
          // Quick click without drag -> dispatch selected robot to this building's dropoff bay
          const dropPos = bldg.dropoff;
          dispatchSelectedRobot(dropPos, `Building ${bldg.code} (${bldg.name}) Bay`);
          highlightPointIn3D(dropPos, 0x0284c7);
        }
      }
      buildCampusBuildingVisuals();
      return;
    }

    // Finalize Waypoint Drag & Drop
    if (isDraggingWaypoint) {
      isDraggingWaypoint = false;
      const wpIdx = draggedWaypointIdx;
      const robotId = draggedWaypointRobotId;
      draggedWaypointIdx = null;
      draggedWaypointRobotId = null;
      controls.enabled = true;
      document.body.style.cursor = 'default';

      const robot = robotDefs.find(r => r.id === robotId) || robotDefs[0];
      if (robot && robot.waypoints && robot.waypoints[wpIdx]) {
        if (didDragBox) {
          saveCustomWaypoints();
          updateWaypointCountsUI();
          const wpPos = robot.waypoints[wpIdx];
          if (activeEditingWaypointsRobotId) {
            showAndEditWaypoints(robotId);
          } else {
            const banner = document.querySelector('.dispatch-banner');
            if (banner) {
              banner.innerHTML = `<span>✅ <b>${robot.name} WP-${wpIdx + 1} Relocated</b> to [X: ${wpPos.x.toFixed(2)}m, Z: ${wpPos.z.toFixed(2)}m].</span>`;
              setTimeout(() => {
                banner.innerHTML = `<span>🎯 <b>Interactive Dispatch Mode</b>: Click any point on the floor to route <span id="dispatch-target-name" style="color: #38bdf8;">${selectedRobotId}</span></span>`;
              }, 3000);
            }
          }
        } else {
          // Quick click without drag -> dispatch selected robot to this waypoint
          const wpPos = robot.waypoints[wpIdx];
          dispatchSelectedRobot(wpPos, `${robot.name} Waypoint #${wpIdx + 1}`);
          highlightPointIn3D(wpPos, robot.color || 0x38bdf8);
        }
      }
      buildWaypointsVisuals(robotId, true);
      return;
    }

    // Finalize Station Drag & Drop
    if (isDraggingStation) {
      isDraggingStation = false;
      const sKey = draggedStationKey;
      draggedStationKey = null;
      controls.enabled = true;
      document.body.style.cursor = 'default';

      if (sKey && labStations[sKey]) {
        saveCustomStationPositions();
        const st = labStations[sKey];
        const envName = isCampusScan(activeScan) ? (activeScan === 'mdc_north_campus_osm.glb' ? 'MDC North Campus (OSM CAD)' : 'MDC North Campus') : (activeScan === 'scan_house.glb' ? 'House Yard' : 'Classroom');
        const banner = document.querySelector('.dispatch-banner');
        if (banner) {
          banner.innerHTML = `<span>✅ <b>${st.name} Relocated in ${envName}</b> to [X: ${st.pos.x.toFixed(2)}m, Z: ${st.pos.z.toFixed(2)}m]. All robot routes updated!</span>`;
          setTimeout(() => {
            banner.innerHTML = `<span>🎯 <b>Interactive Dispatch Mode</b>: Click any point on the floor to route <span id="dispatch-target-name" style="color: #38bdf8;">${selectedRobotId}</span></span>`;
          }, 3500);
        }

        // If this station is an AMR home dock, update its assigned robot to navigate to its new dock position!
        if (st.isDock && st.assignedRobotId) {
          const rover = robotDefs.find(r => r.id === st.assignedRobotId);
          if (rover && (!rover.currentOrder || rover.status.includes('Docked') || rover.status.includes('Standby'))) {
            dispatchSelectedRobot(st.pos, st.name, rover.id);
          }
        }
      }
      buildBoundariesAndStations();
      return;
    }

    // Finalize Obstacle Drag & Drop
    if (isDraggingObstacle) {
      isDraggingObstacle = false;
      const idx = draggedObstacleIdx;
      draggedObstacleIdx = null;
      controls.enabled = true; // Restore OrbitControls
      document.body.style.cursor = 'default';

      if (idx !== null && obstacleBoxes[idx]) {
        saveObstacleEdit(obstacleBoxes[idx]);
      }
      buildBoundariesAndStations();
      return;
    }

    if (e.button !== 0) return;
    if (e.target.closest('.sidebar') || e.target.closest('.top-bar') || e.target.closest('.calibration-panel') || e.target.closest('.zone-editor-panel') || e.target.closest('.dashboard-modal') || e.target.closest('button') || e.target.closest('select') || e.target.closest('input')) return;

    const dragDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
    const dragDur = performance.now() - pointerDownTime;

    // If mouse moved noticeably, it was an Orbit/Pan gesture
    if (dragDist > 6 || dragDur > 450) return;

    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    if (scanMeasure) {
      addScanMeasurePoint();
      return;
    }

    // 1. Raycast direct click onto robot models in 3D scene
    const robotMeshes = robotDefs.filter(r => r.mesh).map(r => r.mesh);
    const robotHits = raycaster.intersectObjects(robotMeshes, true);
    if (robotHits.length > 0) {
      let hitMesh = robotHits[0].object;
      while (hitMesh.parent && !robotDefs.some(r => r.mesh === hitMesh)) {
        hitMesh = hitMesh.parent;
      }
      const hitRobot = robotDefs.find(r => r.mesh === hitMesh);
      if (hitRobot) {
        selectedRobotId = hitRobot.id;
        const dispatchLabel = document.getElementById('dispatch-target-name');
        if (dispatchLabel) dispatchLabel.innerText = `${hitRobot.name} (${hitRobot.id})`;
        updateFleetCards();
        buildWaypointsVisuals();
        if (cameraMode === 'fpv') updateFPVCamera();
        if (hitRobot.id === 'HUM-01') {
          openG1Dashboard();
        } else if (hitRobot.id === 'UAV-01') {
          openDroneDashboard();
        } else if (hitRobot.type === 'amr' || hitRobot.id.startsWith('AMR-')) {
          openRoverDashboard(hitRobot.id);
        }
        return;
      }
    }

    // 2. Raycast direct click onto a Station Pad in 3D scene
    if (stationsGroup) {
      const sHits = raycaster.intersectObjects(stationsGroup.children, true);
      for (let hit of sHits) {
        if (hit.object && hit.object.userData && hit.object.userData.isStation) {
          selectAndFocusStation(hit.object.userData.stationKey);
          return;
        }
      }
    }

    // 2.5. Raycast direct click onto a Campus Building Badge or Roof Decal
    if (campusBuildingVisualsGroup && campusBuildingVisualsGroup.visible) {
      const bHits = raycaster.intersectObjects(campusBuildingVisualsGroup.children, true);
      for (let hit of bHits) {
        let obj = hit.object;
        while (obj && (!obj.userData || !obj.userData.isBuilding) && obj.parent) {
          obj = obj.parent;
        }
        if (obj && obj.userData && obj.userData.isBuilding && obj.userData.bldg) {
          const bldg = obj.userData.bldg;
          const dropTarget = new THREE.Vector3(bldg.dropoff.x, bldg.dropoff.y, bldg.dropoff.z);
          dispatchSelectedRobot(dropTarget, `${bldg.name} (${bldg.type})`);
          highlightPointIn3D(dropTarget, 0x0047ba);
          const banner = document.querySelector('.dispatch-banner');
          if (banner) {
            banner.innerHTML = `<span>🚚 <b>Dispatching ${selectedRobotId}</b> to <b>${bldg.name}</b> (Building ${bldg.code}) delivery drop-off!</span>`;
          }
          return;
        }
      }
    }

    // 3. Raycast direct click onto a Waypoint Node in 3D scene
    if (waypointsGroup) {
      const wpHits = raycaster.intersectObjects(waypointsGroup.children, true);
      for (let hit of wpHits) {
        if (hit.object && hit.object.userData && hit.object.userData.isWaypoint) {
          const wpPos = hit.object.userData.waypointPos;
          const label = hit.object.userData.label || 'Waypoint';
          dispatchSelectedRobot(wpPos, label);
          highlightPointIn3D(wpPos, 0x38bdf8);
          return;
        }
      }
    }

    // 4. If pending station placement (user clicked station in sidebar to relocate it in the yard):
    if (pendingStationPlacementKey && labStations[pendingStationPlacementKey]) {
      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const hitPoint = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(groundPlane, hitPoint)) {
        const sKey = pendingStationPlacementKey;
        pendingStationPlacementKey = null;
        document.querySelectorAll('.station-btn').forEach(b => b.classList.remove('active-station'));

        const limits = getEnvironmentLimits();
        const clampX = Math.max(limits.minX + 0.35, Math.min(limits.maxX - 0.35, hitPoint.x));
        const clampZ = Math.max(limits.minZ + 0.35, Math.min(limits.maxZ - 0.35, hitPoint.z));

        labStations[sKey].pos.set(clampX, 0.05, clampZ);
        if (stationMeshes[sKey]) {
          stationMeshes[sKey].position.set(clampX, 0.05, clampZ);
        }
        saveCustomStationPositions();
        buildBoundariesAndStations();
        highlightStationIn3D(sKey);
        dispatchSelectedRobot(labStations[sKey].pos, labStations[sKey].name);

        const envName = isCampusScan(activeScan) ? (activeScan === 'mdc_north_campus_osm.glb' ? 'MDC North Campus (OSM CAD)' : 'MDC North Campus') : (activeScan === 'scan_house.glb' ? 'House Yard' : 'Classroom');
        const banner = document.querySelector('.dispatch-banner');
        if (banner) {
          banner.innerHTML = `<span>✅ <b>${labStations[sKey].name}</b> relocated to [X: ${clampX.toFixed(2)}m, Z: ${clampZ.toFixed(2)}m] in ${envName}!</span>`;
        }
        return;
      }
    }

    if (isAddingBoundaryMode) {
      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const hitPoint = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(groundPlane, hitPoint)) {
        placeCustomKeepOutZone(hitPoint.x, hitPoint.z, pendingZoneSize.width, pendingZoneSize.depth, pendingZoneSize.height, pendingZoneSize.rotY || 0);
      }
      return;
    }

    // Mathematical plane intersection for robot dispatch / deselect
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hitPoint = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(groundPlane, hitPoint)) {
      if (selectedObstacleIdx !== null) {
        deselectObstacleZone();
      }
      dispatchSelectedRobot(hitPoint);
    }
  });

  // Keyboard shortcut: Delete or Backspace key to delete selected boundary
  window.addEventListener('keydown', (e) => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

    // Robot Cockpit Driving & Flight Controls (Active in FPV Camera mode)
    if (cameraMode === 'fpv') {
      const sel = robotDefs.find(r => r.id === selectedRobotId);
      let handled = false;
      if (e.code === 'KeyW' || e.key === 'ArrowUp') {
        if (sel && sel.type === 'drone') {
          droneFlightKeys.forward = true;
          setDroneManualFlight(true);
        } else if (sel) {
          amrDriveKeys.forward = true;
          setAmrManualDrive(sel.id, true);
        }
        const b = document.getElementById('btn-hud-fwd');
        if (b) b.classList.add('active-pressed');
        handled = true;
      } else if (e.code === 'KeyS' || e.key === 'ArrowDown') {
        if (sel && sel.type === 'drone') {
          droneFlightKeys.backward = true;
          setDroneManualFlight(true);
        } else if (sel) {
          amrDriveKeys.backward = true;
          setAmrManualDrive(sel.id, true);
        }
        const b = document.getElementById('btn-hud-back');
        if (b) b.classList.add('active-pressed');
        handled = true;
      } else if (e.code === 'KeyA' || e.key === 'ArrowLeft') {
        if (sel && sel.type === 'drone') {
          droneFlightKeys.rotateLeft = true;
          setDroneManualFlight(true);
        } else if (sel) {
          amrDriveKeys.rotateLeft = true;
          setAmrManualDrive(sel.id, true);
        }
        const b = document.getElementById('btn-hud-rot-l');
        if (b) b.classList.add('active-pressed');
        handled = true;
      } else if (e.code === 'KeyD' || e.key === 'ArrowRight') {
        if (sel && sel.type === 'drone') {
          droneFlightKeys.rotateRight = true;
          setDroneManualFlight(true);
        } else if (sel) {
          amrDriveKeys.rotateRight = true;
          setAmrManualDrive(sel.id, true);
        }
        const b = document.getElementById('btn-hud-rot-r');
        if (b) b.classList.add('active-pressed');
        handled = true;
      } else if (e.code === 'Space' || e.code === 'KeyR' || e.code === 'KeyE') {
        if (sel && sel.type === 'drone') {
          droneFlightKeys.up = true;
          setDroneManualFlight(true);
          const b = document.getElementById('btn-hud-up');
          if (b) b.classList.add('active-pressed');
          handled = true;
        } else if (sel) {
          stopAmrManual(sel.id);
          handled = true;
        }
      } else if (e.key === 'Shift' || e.code === 'KeyF') {
        if (sel && sel.type === 'drone') {
          droneFlightKeys.down = true;
          setDroneManualFlight(true);
          const b = document.getElementById('btn-hud-down');
          if (b) b.classList.add('active-pressed');
          handled = true;
        }
      } else if (e.code === 'KeyC') {
        // Toggle Cockpit / Chase View
        const camBtn = document.getElementById('btn-hud-cam-toggle');
        if (camBtn) camBtn.click();
        handled = true;
      } else if (['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'].includes(e.code)) {
        // Quick switch active robot cam with keys 1 to 9 and 0
        const digitVal = parseInt(e.code.replace('Digit', ''));
        const rIndex = (digitVal === 0 ? 9 : digitVal - 1);
        if (robotDefs[rIndex]) {
          selectedRobotId = robotDefs[rIndex].id;
          if (robotDefs[rIndex].type === 'amr' || robotDefs[rIndex].id.startsWith('AMR-')) {
            activeRoverId = robotDefs[rIndex].id;
          } else if (robotDefs[rIndex].type === 'drone' || robotDefs[rIndex].id.startsWith('UAV-')) {
            activeDroneId = robotDefs[rIndex].id;
          }
          if (isObserverMode) {
            robotDefs[rIndex].isManualDrive = false;
            robotDefs[rIndex].isManualFlight = false;
          }
          const dispatchLabel = document.getElementById('dispatch-target-name');
          if (dispatchLabel) dispatchLabel.innerText = `${robotDefs[rIndex].name} (${robotDefs[rIndex].id})`;
          updateFleetCards();
          updateCameraHUDState();
          updateFPVCamera();
          handled = true;
        }
      } else if (e.code === 'KeyH') {
        if (sel && sel.type === 'drone') {
          hoverDroneManual();
        } else if (sel) {
          stopAmrManual(sel.id);
        }
        handled = true;
      } else if (e.code === 'KeyP') {
        if (sel && sel.type === 'drone') {
          resumeDroneAutoPatrol();
        } else if (sel) {
          resumeAmrAutoPatrol(sel.id);
        }
        handled = true;
      } else if (e.code === 'KeyL') {
        if (sel && sel.type === 'drone') {
          landDroneManual();
          handled = true;
        } else if (sel && sel.type === 'humanoid') {
          sel.isWaving = true;
          sel.waveTimer = 3.5;
          handled = true;
        } else if (sel) {
          selectAndFocusStation('charger');
          handled = true;
        }
      }
      if (handled) {
        e.preventDefault();
        return;
      }
    }

    // Keep-Out Zone 3D Hotkeys: 'R' to rotate by 15°, '+' and '-' to scale
    if (e.key === 'r' || e.key === 'R') {
      const step = e.shiftKey ? -15 : 15;
      if (isAddingBoundaryMode) {
        e.preventDefault();
        pendingZoneSize.rotY = ((((pendingZoneSize.rotY || 0) + step) % 360) + 360) % 360;
        if (pendingZoneSize.rotY > 180) pendingZoneSize.rotY -= 360;
        syncZoneEditorValues(pendingZoneSize.width, pendingZoneSize.depth, pendingZoneSize.height, pendingZoneSize.rotY);
        updateGhostMeshScale();
      } else if (selectedObstacleIdx !== null && obstacleBoxes[selectedObstacleIdx]) {
        e.preventDefault();
        const ob = obstacleBoxes[selectedObstacleIdx];
        let newRot = ((((ob.rotY || 0) + step) % 360) + 360) % 360;
        if (newRot > 180) newRot -= 360;
        ob.rotY = newRot;
        const cx = (ob.minX + ob.maxX) / 2;
        const cz = (ob.minZ + ob.maxZ) / 2;
        const w = ob.maxX - ob.minX;
        const d = ob.maxZ - ob.minZ;
        syncZoneEditorValues(w, d, ob.height, ob.rotY, cx, cz);
        saveObstacleEdit(ob);
        buildBoundariesAndStations();
      }
    } else if (e.key === '+' || e.key === '=') {
      if (selectedObstacleIdx !== null && obstacleBoxes[selectedObstacleIdx]) {
        e.preventDefault();
        scaleSelectedObstacle(1.2);
      } else if (isAddingBoundaryMode) {
        e.preventDefault();
        scalePendingZone(1.2);
      }
    } else if (e.key === '-' || e.key === '_') {
      if (selectedObstacleIdx !== null && obstacleBoxes[selectedObstacleIdx]) {
        e.preventDefault();
        scaleSelectedObstacle(0.833);
      } else if (isAddingBoundaryMode) {
        e.preventDefault();
        scalePendingZone(0.833);
      }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedObstacleIdx !== null) {
        e.preventDefault();
        deleteSelectedObstacleZone();
      }
    } else if (e.key === 'Escape') {
      if (scanMeasure) {
        cancelScanMeasure();
        return;
      }
      if (cameraMode === 'fpv') {
        setCameraMode('orbit');
        setActiveToolBtn('btn-camera-orbit');
        return;
      }
      const g1Modal = document.getElementById('g1-dashboard-modal');
      if (g1Modal && g1Modal.style.display !== 'none') {
        closeG1Dashboard();
        return;
      }
      const droneModal = document.getElementById('drone-dashboard-modal');
      if (droneModal && droneModal.style.display !== 'none') {
        closeDroneDashboard();
        return;
      }
      const roverModal = document.getElementById('rover-dashboard-modal');
      if (roverModal && roverModal.style.display !== 'none') {
        closeRoverDashboard();
        return;
      }
      deselectObstacleZone();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyW' || e.key === 'ArrowUp') {
      droneFlightKeys.forward = false;
      amrDriveKeys.forward = false;
      const b = document.getElementById('btn-hud-fwd');
      if (b) b.classList.remove('active-pressed');
    }
    if (e.code === 'KeyS' || e.key === 'ArrowDown') {
      droneFlightKeys.backward = false;
      amrDriveKeys.backward = false;
      const b = document.getElementById('btn-hud-back');
      if (b) b.classList.remove('active-pressed');
    }
    if (e.code === 'KeyA' || e.key === 'ArrowLeft') {
      droneFlightKeys.rotateLeft = false;
      amrDriveKeys.rotateLeft = false;
      const b = document.getElementById('btn-hud-rot-l');
      if (b) b.classList.remove('active-pressed');
    }
    if (e.code === 'KeyD' || e.key === 'ArrowRight') {
      droneFlightKeys.rotateRight = false;
      amrDriveKeys.rotateRight = false;
      const b = document.getElementById('btn-hud-rot-r');
      if (b) b.classList.remove('active-pressed');
    }
    if (e.code === 'Space' || e.code === 'KeyR' || e.code === 'KeyE') {
      droneFlightKeys.up = false;
      const b = document.getElementById('btn-hud-up');
      if (b) b.classList.remove('active-pressed');
    }
    if (e.key === 'Shift' || e.code === 'KeyF' || e.code === 'KeyC') {
      droneFlightKeys.down = false;
      const b = document.getElementById('btn-hud-down');
      if (b) b.classList.remove('active-pressed');
    }
  });

  // Add Boundary Button
  const btnAdd = document.getElementById('btn-add-boundary');
  if (btnAdd) {
    btnAdd.onclick = () => {
      if (!boundariesVisible) {
        boundariesVisible = true;
        const boundBtn = document.getElementById('btn-toggle-boundaries');
        if (boundBtn) {
          boundBtn.innerText = '🛡️ Boundaries: ON';
          boundBtn.classList.add('active');
        }
      }
      isAddingBoundaryMode = !isAddingBoundaryMode;
      if (boundaryGhostMesh) {
        boundaryGhostMesh.visible = isAddingBoundaryMode;
        updateGhostMeshScale();
      }
      btnAdd.classList.toggle('active-mode', isAddingBoundaryMode);
      btnAdd.innerText = isAddingBoundaryMode ? '❌ Cancel Adding' : '➕ Add Keep-Out Zone';

      const banner = document.querySelector('.dispatch-banner');
      const panel = document.getElementById('zone-editor-panel');
      if (isAddingBoundaryMode) {
        selectedObstacleIdx = null;
        if (panel) {
          panel.style.display = 'flex';
          document.getElementById('zone-editor-title').innerText = '➕ New Zone Sizing';
          document.getElementById('zone-status-text').innerText = 'Set size/rotation below, or press R to rotate in 3D:';
          syncZoneEditorValues(pendingZoneSize.width, pendingZoneSize.depth, pendingZoneSize.height, pendingZoneSize.rotY || 0);
          const delBtn = document.getElementById('btn-delete-zone');
          if (delBtn) delBtn.style.display = 'none';
        }
        banner.innerHTML = `<span>✏️ <b>Boundary Creation Mode</b>: Press <b>R</b> to rotate, <b>+ / -</b> to scale, click floor to drop!</span>`;
      } else {
        if (panel) panel.style.display = 'none';
        banner.innerHTML = `<span>🎯 <b>Interactive Dispatch Mode</b>: Click any point on the classroom floor to route <span id="dispatch-target-name" style="color: #38bdf8;">AMR-01</span></span>`;
      }
      buildBoundariesAndStations();
    };
  }

  // Edit / Resize Boundary Button in Toolbar
  const btnEditBoundary = document.getElementById('btn-edit-boundary');
  if (btnEditBoundary) {
    btnEditBoundary.onclick = () => {
      const panel = document.getElementById('zone-editor-panel');
      const isVisible = panel && panel.style.display === 'flex';
      if (isVisible && selectedObstacleIdx !== null) {
        deselectObstacleZone();
      } else {
        const firstCustom = obstacleBoxes.findIndex(b => b.userCreated);
        if (firstCustom !== -1) {
          selectObstacleZone(firstCustom);
        } else {
          selectObstacleZone(0);
        }
      }
    };
  }

  // Reset Station Positions
  const btnResetStations = document.getElementById('btn-reset-stations');
  if (btnResetStations) {
    btnResetStations.onclick = () => {
      resetStationPositions();
    };
  }

  // Clear Custom Zones Button
  const btnClear = document.getElementById('btn-clear-custom');
  if (btnClear) {
    btnClear.onclick = () => {
      // Clears the active scan's zones only.
      obstacleBoxes.splice(0, obstacleBoxes.length, ...obstacleBoxes.filter(b => !b.userCreated));
      saveCustomZones();
      buildBoundariesAndStations();
      updateCustomCountUI();

      const banner = document.querySelector('.dispatch-banner');
      banner.innerHTML = `<span>🗑️ <b>Cleared all custom keep-out zones.</b></span>`;
      setTimeout(() => {
        banner.innerHTML = `<span>🎯 <b>Interactive Dispatch Mode</b>: Click any point on the classroom floor to route <span id="dispatch-target-name" style="color: #38bdf8;">AMR-01</span></span>`;
      }, 2500);
    };
  }

  document.getElementById('btn-camera-orbit').onclick = () => {
    setCameraMode('orbit');
    setActiveToolBtn('btn-camera-orbit');
  };

  document.getElementById('btn-camera-top').onclick = () => {
    setCameraMode('top');
    setActiveToolBtn('btn-camera-top');
  };

  const btnCameraFpv = document.getElementById('btn-camera-fpv');
  const btnCameraFpvArrow = document.getElementById('btn-camera-fpv-arrow');
  const robotCamDropdown = document.getElementById('robot-cam-dropdown');

  // Direct Click on "Robot Cam (FPV)": IMMEDIATELY enter clean Observer Mode on active robot!
  if (btnCameraFpv) {
    btnCameraFpv.onclick = (e) => {
      e.stopPropagation();
      enterObserverMode(selectedRobotId || 'AMR-01');
    };
  }

  // Click on Arrow "▾": Toggle dropdown list to select any specific robot
  if (btnCameraFpvArrow && robotCamDropdown) {
    btnCameraFpvArrow.onclick = (e) => {
      e.stopPropagation();
      const isOpen = robotCamDropdown.style.display === 'flex';
      robotCamDropdown.style.display = isOpen ? 'none' : 'flex';
    };

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.cam-dropdown-wrapper')) {
        robotCamDropdown.style.display = 'none';
      }
    });

    robotCamDropdown.addEventListener('click', (e) => {
      const item = e.target.closest('.rc-dropdown-item');
      if (item) {
        e.stopPropagation();
        const robotId = item.getAttribute('data-robot');
        enterObserverMode(robotId);
      }
    });
  }

  // Drone & AMR Rover Cockpit FPV HUD Control Buttons
  const bindHoldButton = (btnId, keyName) => {
    const el = document.getElementById(btnId);
    if (!el) return;
    const start = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const sel = robotDefs.find(r => r.id === selectedRobotId);
      if (sel && sel.type === 'drone') {
        droneFlightKeys[keyName] = true;
        setDroneManualFlight(true);
      } else if (sel) {
        amrDriveKeys[keyName] = true;
        setAmrManualDrive(sel.id, true);
      }
      el.classList.add('active-pressed');
    };
    const end = (e) => {
      e.preventDefault();
      e.stopPropagation();
      droneFlightKeys[keyName] = false;
      amrDriveKeys[keyName] = false;
      el.classList.remove('active-pressed');
    };
    el.addEventListener('pointerdown', start);
    window.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  };

  bindHoldButton('btn-hud-fwd', 'forward');
  bindHoldButton('btn-hud-back', 'backward');
  bindHoldButton('btn-hud-rot-l', 'rotateLeft');
  bindHoldButton('btn-hud-rot-r', 'rotateRight');
  bindHoldButton('btn-hud-up', 'up');
  bindHoldButton('btn-hud-down', 'down');

  const btnHudExit = document.getElementById('btn-hud-exit-fpv');
  if (btnHudExit) {
    btnHudExit.onclick = () => {
      setCameraMode('orbit');
      setActiveToolBtn('btn-camera-orbit');
    };
  }

  const btnHudHover = document.getElementById('btn-hud-hover');
  if (btnHudHover) {
    btnHudHover.onclick = (e) => {
      e.preventDefault();
      const sel = robotDefs.find(r => r.id === selectedRobotId);
      if (sel && sel.type === 'drone') {
        hoverDroneManual();
      } else if (sel) {
        stopAmrManual(sel.id);
      }
    };
  }

  const btnHudPatrol = document.getElementById('btn-hud-patrol');
  if (btnHudPatrol) {
    btnHudPatrol.onclick = (e) => {
      e.preventDefault();
      const sel = robotDefs.find(r => r.id === selectedRobotId);
      if (sel && sel.type === 'drone') {
        resumeDroneAutoPatrol();
      } else if (sel) {
        resumeAmrAutoPatrol(sel.id);
      }
    };
  }

  const btnHudLand = document.getElementById('btn-hud-land');
  if (btnHudLand) {
    btnHudLand.onclick = (e) => {
      e.preventDefault();
      const sel = robotDefs.find(r => r.id === selectedRobotId);
      if (sel && sel.type === 'drone') {
        landDroneManual();
      } else if (sel && sel.type === 'humanoid') {
        sel.isWaving = true;
        sel.waveTimer = 3.5;
        const banner = document.querySelector('.dispatch-banner');
        if (banner) banner.innerHTML = `<span>👋 <b>${sel.name}:</b> Executing friendly operator wave gesture!</span>`;
      } else if (sel) {
        selectAndFocusStation('charger');
      }
    };
  }

  const btnHudCamToggle = document.getElementById('btn-hud-cam-toggle');
  if (btnHudCamToggle) {
    btnHudCamToggle.onclick = (e) => {
      e.preventDefault();
      const sel = robotDefs.find(r => r.id === selectedRobotId);
      if (sel && sel.type === 'drone') {
        isDroneCockpitCam = !isDroneCockpitCam;
      } else {
        isAmrBumperCam = !isAmrBumperCam;
      }
      updateCameraHUDState();
      updateFPVCamera();
    };
  }

  const btnHudOpenDash = document.getElementById('btn-hud-open-dash');
  if (btnHudOpenDash) {
    btnHudOpenDash.onclick = (e) => {
      e.preventDefault();
      const sel = robotDefs.find(r => r.id === selectedRobotId);
      if (sel && sel.id === 'HUM-01') {
        openG1Dashboard();
      } else if (sel && sel.id === 'UAV-01') {
        openDroneDashboard();
      } else if (sel) {
        openRoverDashboard(sel.id);
      }
    };
  }

  // Observer Mode Dock Button Event Listeners
  const btnObserverPrev = document.getElementById('btn-observer-prev');
  if (btnObserverPrev) {
    btnObserverPrev.onclick = (e) => {
      e.preventDefault();
      cycleObserverRobot(-1);
    };
  }

  const btnObserverNext = document.getElementById('btn-observer-next');
  if (btnObserverNext) {
    btnObserverNext.onclick = (e) => {
      e.preventDefault();
      cycleObserverRobot(1);
    };
  }

  const btnObserverCamToggle = document.getElementById('btn-observer-cam-toggle');
  if (btnObserverCamToggle) {
    btnObserverCamToggle.onclick = (e) => {
      e.preventDefault();
      const sel = robotDefs.find(r => r.id === selectedRobotId);
      if (sel && sel.type === 'drone') {
        isDroneCockpitCam = !isDroneCockpitCam;
      } else {
        isAmrBumperCam = !isAmrBumperCam;
      }
      updateCameraHUDState();
      updateFPVCamera();
    };
  }

  const btnObserverPilot = document.getElementById('btn-observer-pilot');
  if (btnObserverPilot) {
    btnObserverPilot.onclick = (e) => {
      e.preventDefault();
      isObserverMode = false;
      const sel = robotDefs.find(r => r.id === selectedRobotId);
      if (sel) {
        if (sel.type === 'drone') {
          setDroneManualFlight(true);
        } else {
          setAmrManualDrive(sel.id, true);
        }
      }
      updateCameraHUDState();
    };
  }

  const btnObserverExit = document.getElementById('btn-observer-exit');
  if (btnObserverExit) {
    btnObserverExit.onclick = (e) => {
      e.preventDefault();
      setCameraMode('orbit');
      setActiveToolBtn('btn-camera-orbit');
    };
  }

  const btnHudObserverToggle = document.getElementById('btn-hud-observer-toggle');
  if (btnHudObserverToggle) {
    btnHudObserverToggle.onclick = (e) => {
      e.preventDefault();
      enterObserverMode(selectedRobotId);
    };
  }

  const btnHudToggleSidebar = document.getElementById('btn-hud-toggle-sidebar');
  if (btnHudToggleSidebar) {
    btnHudToggleSidebar.onclick = (e) => {
      e.preventDefault();
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) {
        const isHidden = sidebar.style.display === 'none' || getComputedStyle(sidebar).display === 'none';
        sidebar.style.display = isHidden ? 'flex' : 'none';
        btnHudToggleSidebar.style.background = isHidden ? 'rgba(56, 189, 248, 0.35)' : 'rgba(56, 189, 248, 0.15)';
      }
    };
  }

  // Quick Robot Switcher Chips in Robot Cam HUD
  document.querySelectorAll('.hud-robot-chip').forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      const rId = btn.getAttribute('data-robot');
      if (rId) {
        selectedRobotId = rId;
        const dispatchLabel = document.getElementById('dispatch-target-name');
        if (dispatchLabel) {
          const rObj = robotDefs.find(r => r.id === rId);
          dispatchLabel.innerText = rObj ? `${rObj.name} (${rObj.id})` : rId;
        }
        updateFleetCards();
        updateCameraHUDState();
        if (cameraMode === 'fpv') updateFPVCamera();
      }
    };
  });

  // Quick Dispatch Chips in Robot Cam HUD
  document.querySelectorAll('.hud-nav-chip').forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      const target = btn.getAttribute('data-target');
      if (target) {
        selectAndFocusStation(target);
      }
    };
  });

  const playBtn = document.getElementById('btn-sim-play');
  playBtn.onclick = () => {
    simRunning = !simRunning;
    playBtn.innerText = simRunning ? '⏸ Pause Sim' : '▶ Resume Sim';
  };

  const boundBtn = document.getElementById('btn-toggle-boundaries');
  if (boundBtn) {
    boundBtn.onclick = () => {
      setBoundariesVisible(!boundariesVisible);
    };
  }
  setupOnOffSwitches();

  const lidarBtn = document.getElementById('btn-toggle-lidar');
  if (lidarBtn) {
    lidarBtn.onclick = () => {
      lidarBeamsVisible = !lidarBeamsVisible;
      if (lidarVisualizerGroup) lidarVisualizerGroup.visible = lidarBeamsVisible;
      lidarBtn.innerText = lidarBeamsVisible ? '📡 LiDAR: ON' : '📡 LiDAR: OFF';
      lidarBtn.classList.toggle('active', lidarBeamsVisible);
    };
  }

  document.querySelectorAll('.station-btn').forEach(btn => {
    btn.onclick = (e) => {
      const stationKey = btn.getAttribute('data-station');
      // If user clicked the toggle icon specifically:
      if (e.target.closest('.station-btn-toggle')) {
        e.stopPropagation();
        toggleStationVisibility(stationKey);
        return;
      }
      // If the station is currently removed/hidden, clicking restores it
      if (stationVisibility[stationKey] === false) {
        toggleStationVisibility(stationKey);
        return;
      }
      // If it is already the active selected station, clicking it again removes it
      if (btn.classList.contains('active-station')) {
        toggleStationVisibility(stationKey);
        return;
      }
      // Otherwise, focus, highlight, and dispatch
      selectAndFocusStation(stationKey);
    };
  });

  const btnToggleAll = document.getElementById('btn-toggle-all-stations');
  if (btnToggleAll) {
    btnToggleAll.onclick = () => {
      toggleAllStations();
    };
  }

  const selectMesh = document.getElementById('select-mesh');
  if (selectMesh) {
    selectMesh.onchange = (e) => {
      switchEnvironment(e.target.value);
    };
  }
}

// User Places a Custom Keep-Out Zone with Chosen Dimensions
function placeCustomKeepOutZone(x, z, w = pendingZoneSize.width, d = pendingZoneSize.depth, h = pendingZoneSize.height, rotY = pendingZoneSize.rotY || 0) {
  if (!boundariesVisible) {
    boundariesVisible = true;
    const boundBtn = document.getElementById('btn-toggle-boundaries');
    if (boundBtn) {
      boundBtn.innerText = '🛡️ Boundaries: ON';
      boundBtn.classList.add('active');
    }
  }

  // A name not used yet on this scan, and an id not used on any scan.
  const zoneName = nextZoneName(obstacleBoxes.filter(b => b.userCreated).map(b => b.name));
  const zoneId = newZoneId([...allCustomZones, ...obstacleBoxes].map(b => b.id).filter(Boolean));
  const newZone = {
    id: zoneId,
    name: zoneName,
    minX: x - w / 2,
    maxX: x + w / 2,
    minZ: z - d / 2,
    maxZ: z + d / 2,
    height: h,
    rotY: rotY,
    color: 0xef4444,
    userCreated: true
  };

  obstacleBoxes.push(newZone);
  saveCustomZones();

  // Exit placement mode, select newly placed zone for live resizing
  isAddingBoundaryMode = false;
  if (boundaryGhostMesh) boundaryGhostMesh.visible = false;
  const btnAdd = document.getElementById('btn-add-boundary');
  if (btnAdd) {
    btnAdd.classList.remove('active-mode');
    btnAdd.innerText = '➕ Add Keep-Out Zone';
  }

  selectObstacleZone(obstacleBoxes.length - 1);

  const banner = document.querySelector('.dispatch-banner');
  banner.innerHTML = `<span>🛡️ <b>Created ${newZone.name} (${w.toFixed(2)}m × ${d.toFixed(2)}m)</b>! Use the sliders on the right to resize it anytime.</span>`;
  setTimeout(() => {
    banner.innerHTML = `<span>🎯 <b>Interactive Dispatch Mode</b>: Click any point on the classroom floor to route <span id="dispatch-target-name" style="color: #38bdf8;">AMR-01</span></span>`;
  }, 4000);
}

// ==========================================
// DRAGGABLE FLEET TELEMETRY SIDEBAR
// ==========================================
function setupDraggableSidebar() {
  const sidebar = document.getElementById('fleet-sidebar') || document.querySelector('.sidebar');
  const header = document.getElementById('fleet-sidebar-header');
  const resetBtn = document.getElementById('btn-reset-sidebar-pos');
  if (!sidebar || !header) return;

  // Restore saved position from localStorage
  try {
    const saved = localStorage.getItem('fleet_sidebar_pos');
    if (saved) {
      const pos = JSON.parse(saved);
      const maxLeft = Math.max(8, window.innerWidth - sidebar.offsetWidth - 8);
      const maxTop = Math.max(8, window.innerHeight - 80);
      const left = Math.max(8, Math.min(pos.left, maxLeft));
      const top = Math.max(8, Math.min(pos.top, maxTop));
      sidebar.style.left = `${left}px`;
      sidebar.style.top = `${top}px`;
      sidebar.style.right = 'auto';
      sidebar.style.bottom = 'auto';
    }
  } catch (err) {
    console.warn('Could not restore sidebar position:', err);
  }

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initialLeft = 0;
  let initialTop = 0;

  header.addEventListener('pointerdown', (e) => {
    // Ignore clicks on buttons inside header (such as reset button)
    if (e.target.closest('button')) return;

    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;

    const rect = sidebar.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;

    sidebar.classList.add('is-dragging');
    header.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  header.addEventListener('pointermove', (e) => {
    if (!isDragging) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    let newLeft = initialLeft + dx;
    let newTop = initialTop + dy;

    // Viewport clamping bounds
    const maxLeft = Math.max(8, window.innerWidth - sidebar.offsetWidth - 8);
    const maxTop = Math.max(8, window.innerHeight - 80);
    newLeft = Math.max(8, Math.min(newLeft, maxLeft));
    newTop = Math.max(8, Math.min(newTop, maxTop));

    sidebar.style.left = `${newLeft}px`;
    sidebar.style.top = `${newTop}px`;
    sidebar.style.right = 'auto';
    sidebar.style.bottom = 'auto';
  });

  const endDrag = (e) => {
    if (!isDragging) return;
    isDragging = false;
    sidebar.classList.remove('is-dragging');
    try {
      header.releasePointerCapture(e.pointerId);
    } catch (_) {}

    // Persist position
    const rect = sidebar.getBoundingClientRect();
    try {
      localStorage.setItem('fleet_sidebar_pos', JSON.stringify({ left: Math.round(rect.left), top: Math.round(rect.top) }));
    } catch (_) {}
  };

  header.addEventListener('pointerup', endDrag);
  header.addEventListener('pointercancel', endDrag);

  // Double-click header to reset position to default
  header.addEventListener('dblclick', (e) => {
    if (e.target.closest('button')) return;
    resetSidebarPos();
  });

  if (resetBtn) {
    resetBtn.onclick = (e) => {
      e.stopPropagation();
      resetSidebarPos();
    };
  }

  function resetSidebarPos() {
    sidebar.style.left = '16px';
    sidebar.style.top = '80px';
    sidebar.style.right = 'auto';
    sidebar.style.bottom = 'auto';
    localStorage.removeItem('fleet_sidebar_pos');
  }

  window.resetSidebarPos = resetSidebarPos;
}

// ==========================================
// DRAGGABLE BRAND BADGE & CONTROLS TOOLBAR
// ==========================================
function makeFloatingPanelDraggable(panelEl, storageKey, defaultOptions) {
  if (!panelEl) return;

  function applyDefaultPos() {
    if (defaultOptions.right !== undefined) {
      panelEl.style.left = 'auto';
      panelEl.style.right = `${defaultOptions.right}px`;
    } else {
      panelEl.style.left = `${defaultOptions.left || 16}px`;
      panelEl.style.right = 'auto';
    }
    panelEl.style.top = `${defaultOptions.top || 16}px`;
    panelEl.style.bottom = 'auto';
  }

  // Restore saved position from localStorage
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const pos = JSON.parse(saved);
      const maxLeft = Math.max(8, window.innerWidth - panelEl.offsetWidth - 8);
      const maxTop = Math.max(8, window.innerHeight - panelEl.offsetHeight - 8);
      const left = Math.max(8, Math.min(pos.left, maxLeft));
      const top = Math.max(8, Math.min(pos.top, maxTop));
      panelEl.style.left = `${left}px`;
      panelEl.style.top = `${top}px`;
      panelEl.style.right = 'auto';
      panelEl.style.bottom = 'auto';
    } else {
      applyDefaultPos();
    }
  } catch (err) {
    applyDefaultPos();
  }

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initialLeft = 0;
  let initialTop = 0;

  panelEl.addEventListener('pointerdown', (e) => {
    // Ignore interactive elements: buttons, selects, inputs, dropdown menus
    if (e.target.closest('button') || e.target.closest('select') || e.target.closest('input') || e.target.closest('.robot-cam-dropdown-menu')) {
      return;
    }

    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;

    const rect = panelEl.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;

    panelEl.classList.add('is-dragging');
    panelEl.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  panelEl.addEventListener('pointermove', (e) => {
    if (!isDragging) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    let newLeft = initialLeft + dx;
    let newTop = initialTop + dy;

    // Viewport clamping bounds
    const maxLeft = Math.max(8, window.innerWidth - panelEl.offsetWidth - 8);
    const maxTop = Math.max(8, window.innerHeight - panelEl.offsetHeight - 8);
    newLeft = Math.max(8, Math.min(newLeft, maxLeft));
    newTop = Math.max(8, Math.min(newTop, maxTop));

    panelEl.style.left = `${newLeft}px`;
    panelEl.style.top = `${newTop}px`;
    panelEl.style.right = 'auto';
    panelEl.style.bottom = 'auto';
  });

  const endDrag = (e) => {
    if (!isDragging) return;
    isDragging = false;
    panelEl.classList.remove('is-dragging');
    try {
      panelEl.releasePointerCapture(e.pointerId);
    } catch (_) {}

    // Persist position
    const rect = panelEl.getBoundingClientRect();
    try {
      localStorage.setItem(storageKey, JSON.stringify({ left: Math.round(rect.left), top: Math.round(rect.top) }));
    } catch (_) {}
  };

  panelEl.addEventListener('pointerup', endDrag);
  panelEl.addEventListener('pointercancel', endDrag);

  // Double-click to reset position to factory default
  panelEl.addEventListener('dblclick', (e) => {
    if (e.target.closest('button') || e.target.closest('select') || e.target.closest('input')) return;
    applyDefaultPos();
    try {
      localStorage.removeItem(storageKey);
    } catch (_) {}
  });
}

function setupDraggableTopBar() {
  const brandBadge = document.getElementById('brand-badge-panel') || document.querySelector('.brand-badge');
  const controlsToolbar = document.getElementById('controls-toolbar-panel') || document.querySelector('.controls-toolbar');

  if (brandBadge) {
    makeFloatingPanelDraggable(brandBadge, 'brand_badge_pos', { left: 16, top: 16 });
  }

  if (controlsToolbar) {
    makeFloatingPanelDraggable(controlsToolbar, 'controls_toolbar_pos', { right: 16, top: 16 });
  }
}


// Universal Delete for ANY Selected Boundary Box
function deleteSelectedObstacleZone() {
  if (selectedObstacleIdx === null || !obstacleBoxes[selectedObstacleIdx]) return;

  const deleted = obstacleBoxes[selectedObstacleIdx];
  const deletedName = deleted.name;
  obstacleBoxes.splice(selectedObstacleIdx, 1);
  selectedObstacleIdx = null;

  // A deleted built-in box stays deleted on this scan until its tables are restored.
  saveObstacleEdit(deleted);
  updateCustomCountUI();
  updateZoneChipsUI();
  buildBoundariesAndStations();

  const panel = document.getElementById('zone-editor-panel');
  if (panel) panel.style.display = 'none';

  updateRestoreDefaultsUI();

  const banner = document.querySelector('.dispatch-banner');
  banner.innerHTML = `<span>🗑️ <b>Deleted boundary "${deletedName}"</b></span>`;
  setTimeout(() => {
    banner.innerHTML = `<span>🎯 <b>Interactive Dispatch Mode</b>: Click any point on the classroom floor to route <span id="dispatch-target-name" style="color: #38bdf8;">AMR-01</span></span>`;
  }, 3000);
}

// Select an Obstacle Zone to Edit, Resize, or Delete

function updateObstaclePosition(idx, cx, cz) {
  if (idx === null || idx < 0 || idx >= obstacleBoxes.length) return;
  if (isNaN(cx) || isNaN(cz)) return;
  const ob = obstacleBoxes[idx];
  const halfW = (ob.maxX - ob.minX) / 2;
  const halfD = (ob.maxZ - ob.minZ) / 2;

  ob.minX = cx - halfW;
  ob.maxX = cx + halfW;
  ob.minZ = cz - halfD;
  ob.maxZ = cz + halfD;

  // Real-time 60fps mesh translation
  if (obstacleMeshes[idx]) {
    const { box, wire, label } = obstacleMeshes[idx];
    if (box) box.position.set(cx, ob.height / 2, cz);
    if (wire) wire.position.set(cx, ob.height / 2, cz);
    if (label) label.position.set(cx, ob.height + 0.32, cz);
  }

  // Allow robots to dynamically recalculate paths around the moved obstacle
  robotDefs.forEach(r => {
    if (r.type === 'amr' && r.isDetouring) {
      r.isDetouring = false;
      r.detourWaypoints = null;
      clearDetourRibbon(r.id);
      r.detourCooldown = 0;
    }
  });

  // Update UI readouts if Zone Editor is open
  const sPosX = document.getElementById('slider-zone-posx');
  const sPosZ = document.getElementById('slider-zone-posz');
  const vPosX = document.getElementById('val-zone-posx');
  const vPosZ = document.getElementById('val-zone-posz');
  if (sPosX) sPosX.value = cx.toFixed(2);
  if (sPosZ) sPosZ.value = cz.toFixed(2);
  if (vPosX) vPosX.innerText = `${cx.toFixed(2)}m`;
  if (vPosZ) vPosZ.innerText = `${cz.toFixed(2)}m`;

  const banner = document.querySelector('.dispatch-banner');
  if (banner && selectedObstacleIdx === idx) {
    banner.innerHTML = `<span>🛡️ Moving: <b>${ob.name}</b> to (X: ${cx.toFixed(2)}m, Z: ${cz.toFixed(2)}m) &nbsp; <button id="btn-banner-delete" class="tool-btn" style="border-color: #ef4444; color: #fca5a5; padding: 2px 10px; font-size: 11px; margin-left: 8px; cursor: pointer; pointer-events: auto;">🗑️ Delete</button></span>`;
    const bannerDelBtn = document.getElementById('btn-banner-delete');
    if (bannerDelBtn) {
      bannerDelBtn.onclick = (e) => {
        e.stopPropagation();
        deleteSelectedObstacleZone();
      };
    }
  }
}

function selectObstacleZone(idx) {
  if (idx === null || idx < 0 || idx >= obstacleBoxes.length) {
    deselectObstacleZone();
    return;
  }

  if (!boundariesVisible) {
    boundariesVisible = true;
    const boundBtn = document.getElementById('btn-toggle-boundaries');
    if (boundBtn) {
      boundBtn.innerText = '🛡️ Boundaries: ON';
      boundBtn.classList.add('active');
    }
  }

  selectedObstacleIdx = idx;
  const ob = obstacleBoxes[idx];
  const w = ob.maxX - ob.minX;
  const d = ob.maxZ - ob.minZ;
  const h = ob.height;
  const rotVal = (ob.rotY !== undefined && ob.rotY !== null) ? ob.rotY : 0;
  const cx = (ob.minX + ob.maxX) / 2;
  const cz = (ob.minZ + ob.maxZ) / 2;

  const panel = document.getElementById('zone-editor-panel');
  if (panel) {
    panel.style.display = 'flex';
    document.getElementById('zone-editor-title').innerText = `✏️ Edit: ${ob.name}`;
    document.getElementById('zone-status-text').innerText = ob.userCreated
      ? `Editing dimensions & orientation for ${ob.name} (Live Saved):`
      : `Editing dimensions & orientation for ${ob.name}:`;

    syncZoneEditorValues(w, d, h, rotVal, cx, cz);

    // Always show the Delete Boundary button for ANY selected obstacle!
    const delBtn = document.getElementById('btn-delete-zone');
    if (delBtn) {
      delBtn.style.display = 'flex';
      delBtn.innerText = '🗑️ Delete Boundary';
    }
  }

  // Update bottom banner with direct instant Delete button & shortcut reminder
  const banner = document.querySelector('.dispatch-banner');
  if (banner) {
    banner.innerHTML = `<span>🛡️ Selected: <b>${ob.name}</b> (${w.toFixed(2)}m × ${d.toFixed(2)}m, Heading: ${Math.round(rotVal)}°) &nbsp; <button id="btn-banner-delete" class="tool-btn" style="border-color: #ef4444; color: #fca5a5; padding: 2px 10px; font-size: 11px; margin-left: 8px; cursor: pointer; pointer-events: auto;">🗑️ Delete</button> &nbsp; <span style="font-size: 11px; color: #94a3b8;">(or press Del &bull; R to rotate)</span></span>`;
    const bannerDelBtn = document.getElementById('btn-banner-delete');
    if (bannerDelBtn) {
      bannerDelBtn.onclick = (e) => {
        e.stopPropagation();
        deleteSelectedObstacleZone();
      };
    }
  }

  updateZoneChipsUI();
  buildBoundariesAndStations();
}

function syncZoneEditorValues(w, d, h, rot, cx = 0, cz = 0) {
  const sW = document.getElementById('slider-zone-w');
  const sD = document.getElementById('slider-zone-d');
  const sH = document.getElementById('slider-zone-h');
  const sRot = document.getElementById('slider-zone-rot');
  const sPosX = document.getElementById('slider-zone-posx');
  const sPosZ = document.getElementById('slider-zone-posz');

  const numW = document.getElementById('input-zone-w');
  const numD = document.getElementById('input-zone-d');
  const numH = document.getElementById('input-zone-h');
  const numRot = document.getElementById('input-zone-rot');
  const numPosX = document.getElementById('input-zone-posx');
  const numPosZ = document.getElementById('input-zone-posz');

  if (sW) sW.value = w;
  if (sD) sD.value = d;
  if (sH) sH.value = h;
  if (sRot) sRot.value = rot;
  if (sPosX) sPosX.value = cx;
  if (sPosZ) sPosZ.value = cz;

  if (numW) numW.value = parseFloat(w).toFixed(2);
  if (numD) numD.value = parseFloat(d).toFixed(2);
  if (numH) numH.value = parseFloat(h).toFixed(2);
  if (numRot) numRot.value = Math.round(rot);
  if (numPosX) numPosX.value = parseFloat(cx).toFixed(2);
  if (numPosZ) numPosZ.value = parseFloat(cz).toFixed(2);
}

function scaleSelectedObstacle(factor) {
  if (selectedObstacleIdx === null || !obstacleBoxes[selectedObstacleIdx]) return;
  const ob = obstacleBoxes[selectedObstacleIdx];
  const cx = (ob.minX + ob.maxX) / 2;
  const cz = (ob.minZ + ob.maxZ) / 2;
  const w = Math.min(50.0, Math.max(0.2, (ob.maxX - ob.minX) * factor));
  const d = Math.min(50.0, Math.max(0.2, (ob.maxZ - ob.minZ) * factor));
  ob.minX = cx - w / 2;
  ob.maxX = cx + w / 2;
  ob.minZ = cz - d / 2;
  ob.maxZ = cz + d / 2;
  saveObstacleEdit(ob);
  selectObstacleZone(selectedObstacleIdx);
}

function scalePendingZone(factor) {
  pendingZoneSize.width = Math.min(50.0, Math.max(0.2, pendingZoneSize.width * factor));
  pendingZoneSize.depth = Math.min(50.0, Math.max(0.2, pendingZoneSize.depth * factor));
  syncZoneEditorValues(pendingZoneSize.width, pendingZoneSize.depth, pendingZoneSize.height, pendingZoneSize.rotY || 0);
  updateGhostMeshScale();
}

function deselectObstacleZone() {
  selectedObstacleIdx = null;
  const panel = document.getElementById('zone-editor-panel');
  if (panel && !isAddingBoundaryMode) {
    panel.style.display = 'none';
  }
  updateZoneChipsUI();
  buildBoundariesAndStations();
}

// Real-Time Slider & Numeric Input Listener for Zone Resizing
function onZoneSliderInput(fromInput = false) {
  const sW = document.getElementById('slider-zone-w');
  const sD = document.getElementById('slider-zone-d');
  const sH = document.getElementById('slider-zone-h');
  const sRot = document.getElementById('slider-zone-rot');
  const sPosX = document.getElementById('slider-zone-posx');
  const sPosZ = document.getElementById('slider-zone-posz');

  const numW = document.getElementById('input-zone-w');
  const numD = document.getElementById('input-zone-d');
  const numH = document.getElementById('input-zone-h');
  const numRot = document.getElementById('input-zone-rot');
  const numPosX = document.getElementById('input-zone-posx');
  const numPosZ = document.getElementById('input-zone-posz');

  let w, d, h, rot, posX, posZ;

  if (fromInput) {
    w = numW ? parseFloat(numW.value) : 1.2;
    d = numD ? parseFloat(numD.value) : 0.8;
    h = numH ? parseFloat(numH.value) : 0.85;
    rot = numRot ? parseFloat(numRot.value) : 0;
    posX = numPosX ? parseFloat(numPosX.value) : 0;
    posZ = numPosZ ? parseFloat(numPosZ.value) : 0;

    if (sW) sW.value = w;
    if (sD) sD.value = d;
    if (sH) sH.value = h;
    if (sRot) sRot.value = rot;
    if (sPosX) sPosX.value = posX;
    if (sPosZ) sPosZ.value = posZ;
  } else {
    w = sW ? parseFloat(sW.value) : 1.2;
    d = sD ? parseFloat(sD.value) : 0.8;
    h = sH ? parseFloat(sH.value) : 0.85;
    rot = sRot ? parseFloat(sRot.value) : 0;
    posX = sPosX ? parseFloat(sPosX.value) : 0;
    posZ = sPosZ ? parseFloat(sPosZ.value) : 0;

    if (numW) numW.value = parseFloat(w).toFixed(2);
    if (numD) numD.value = parseFloat(d).toFixed(2);
    if (numH) numH.value = parseFloat(h).toFixed(2);
    if (numRot) numRot.value = Math.round(rot);
    if (numPosX) numPosX.value = parseFloat(posX).toFixed(2);
    if (numPosZ) numPosZ.value = parseFloat(posZ).toFixed(2);
  }

  if (isNaN(w) || w <= 0.05) w = 0.5;
  if (isNaN(d) || d <= 0.05) d = 0.5;
  if (isNaN(h) || h <= 0.05) h = 0.5;
  if (isNaN(rot)) rot = 0;

  if (isAddingBoundaryMode) {
    pendingZoneSize.width = w;
    pendingZoneSize.depth = d;
    pendingZoneSize.height = h;
    pendingZoneSize.rotY = rot;
    updateGhostMeshScale();
    return;
  }

  if (selectedObstacleIdx !== null && obstacleBoxes[selectedObstacleIdx]) {
    const ob = obstacleBoxes[selectedObstacleIdx];
    const curCx = (ob.minX + ob.maxX) / 2;
    const curCz = (ob.minZ + ob.maxZ) / 2;
    const targetCx = !isNaN(posX) ? posX : curCx;
    const targetCz = !isNaN(posZ) ? posZ : curCz;

    ob.minX = targetCx - w / 2;
    ob.maxX = targetCx + w / 2;
    ob.minZ = targetCz - d / 2;
    ob.maxZ = targetCz + d / 2;
    ob.height = h;
    ob.rotY = rot;

    saveObstacleEdit(ob);
    buildBoundariesAndStations();
  }
}

// Update Zone Chips (Tags for Quick Selection)
function updateZoneChipsUI() {
  const container = document.getElementById('zone-chips');
  if (!container) return;
  container.innerHTML = '';

  const customZones = obstacleBoxes.map((ob, idx) => ({ ob, idx })).filter(item => item.ob.userCreated);
  if (customZones.length === 0) {
    container.innerHTML = `<span style="font-size: 11px; color: #64748b;">No custom zones yet. Click 'Add Keep-Out Zone' to place one.</span>`;
    return;
  }

  customZones.forEach(({ ob, idx }) => {
    const chip = document.createElement('button');
    chip.className = `zone-chip ${selectedObstacleIdx === idx ? 'active' : ''}`;
    chip.innerText = ob.name;
    chip.onclick = () => {
      selectObstacleZone(idx);
    };
    container.appendChild(chip);
  });
}

// Setup Zone Editor Panel & Preset Controls
function setupZoneEditorControls() {
  const panel = document.getElementById('zone-editor-panel');
  const btnClose = document.getElementById('btn-close-zone-editor');
  const btnDone = document.getElementById('btn-done-zone');
  const btnDelete = document.getElementById('btn-delete-zone');

  const sW = document.getElementById('slider-zone-w');
  const sD = document.getElementById('slider-zone-d');
  const sH = document.getElementById('slider-zone-h');
  const sRot = document.getElementById('slider-zone-rot');
  const sPosX = document.getElementById('slider-zone-posx');
  const sPosZ = document.getElementById('slider-zone-posz');

  const numW = document.getElementById('input-zone-w');
  const numD = document.getElementById('input-zone-d');
  const numH = document.getElementById('input-zone-h');
  const numRot = document.getElementById('input-zone-rot');
  const numPosX = document.getElementById('input-zone-posx');
  const numPosZ = document.getElementById('input-zone-posz');

  if (btnClose) {
    btnClose.onclick = () => {
      deselectObstacleZone();
    };
  }

  if (btnDone) {
    btnDone.onclick = () => {
      deselectObstacleZone();
    };
  }

  [sW, sD, sH, sRot, sPosX, sPosZ].forEach(slider => {
    if (slider) {
      slider.oninput = () => onZoneSliderInput(false);
      slider.onchange = () => onZoneSliderInput(false);
    }
  });

  [numW, numD, numH, numRot, numPosX, numPosZ].forEach(numInput => {
    if (numInput) {
      numInput.oninput = () => onZoneSliderInput(true);
      numInput.onchange = () => onZoneSliderInput(true);
    }
  });

  // Scale Multiplier Buttons (0.5x, 1.5x, 2.0x, +1m, -1m)
  document.querySelectorAll('.scale-mult-btn').forEach(btn => {
    btn.onclick = () => {
      if (btn.dataset.scale) {
        const factor = parseFloat(btn.dataset.scale);
        if (isAddingBoundaryMode) scalePendingZone(factor);
        else scaleSelectedObstacle(factor);
      } else if (btn.dataset.add) {
        const delta = parseFloat(btn.dataset.add);
        if (isAddingBoundaryMode) {
          pendingZoneSize.width = Math.max(0.2, pendingZoneSize.width + delta);
          pendingZoneSize.depth = Math.max(0.2, pendingZoneSize.depth + delta);
          updateGhostMeshScale();
          syncZoneEditorValues(pendingZoneSize.width, pendingZoneSize.depth, pendingZoneSize.height, pendingZoneSize.rotY || 0);
        } else if (selectedObstacleIdx !== null && obstacleBoxes[selectedObstacleIdx]) {
          const ob = obstacleBoxes[selectedObstacleIdx];
          const cx = (ob.minX + ob.maxX) / 2;
          const cz = (ob.minZ + ob.maxZ) / 2;
          const newW = Math.max(0.2, (ob.maxX - ob.minX) + delta);
          const newD = Math.max(0.2, (ob.maxZ - ob.minZ) + delta);
          ob.minX = cx - newW / 2;
          ob.maxX = cx + newW / 2;
          ob.minZ = cz - newD / 2;
          ob.maxZ = cz + newD / 2;
          saveObstacleEdit(ob);
          selectObstacleZone(selectedObstacleIdx);
        }
      }
    };
  });

  // Quick Angle Presets (-90°, -45°, -15°, 0°, +15°, +45°, +90°, 180°)
  document.querySelectorAll('.preset-rot-btn').forEach(btn => {
    btn.onclick = () => {
      const rot = parseFloat(btn.dataset.rot);
      if (sRot) sRot.value = rot;
      if (numRot) numRot.value = rot;
      onZoneSliderInput(false);
    };
  });

  // Quick Dimension Presets
  document.querySelectorAll('.preset-btn:not(.preset-rot-btn)').forEach(btn => {
    btn.onclick = () => {
      const w = parseFloat(btn.dataset.w);
      const d = parseFloat(btn.dataset.d);
      const h = parseFloat(btn.dataset.h);
      if (sW) sW.value = w.toFixed(2);
      if (sD) sD.value = d.toFixed(2);
      if (sH) sH.value = h.toFixed(2);
      if (numW) numW.value = w.toFixed(2);
      if (numD) numD.value = d.toFixed(2);
      if (numH) numH.value = h.toFixed(2);
      onZoneSliderInput(false);
    };
  });

  if (btnDelete) {
    btnDelete.onclick = () => {
      deleteSelectedObstacleZone();
    };
  }

  // Restore Default Obstacles Button
  const btnRestore = document.getElementById('btn-restore-obstacles');
  if (btnRestore) {
    btnRestore.onclick = () => {
      // Clears the active scan's furniture edits only (zones and other scans are untouched) and
      // brings back the default tables.
      try {
        localStorage.removeItem(furnitureEditsKey(activeScan));
      } catch (e) { }
      selectedObstacleIdx = null;
      const panel = document.getElementById('zone-editor-panel');
      if (panel) panel.style.display = 'none';
      applyScanObstacles();
      updateZoneChipsUI();
      buildBoundariesAndStations();
      invalidateFleetSchedule();
      const banner = document.querySelector('.dispatch-banner');
      banner.innerHTML = `<span>🔄 <b>Restored default classroom tables!</b></span>`;
      setTimeout(() => {
        banner.innerHTML = `<span>🎯 <b>Interactive Dispatch Mode</b>: Click any point on the classroom floor to route <span id="dispatch-target-name" style="color: #38bdf8;">AMR-01</span></span>`;
      }, 2500);
    };
  }
}

function switchEnvironment(scanFile) {
  // Zone indices are per scan: drop the selection before the boxes change. A zone being placed
  // belongs to the scan it was started on: placing is cancelled, and so is measuring the scan.
  cancelScanMeasure();
  selectedObstacleIdx = null;
  const zonePanel = document.getElementById('zone-editor-panel');
  if (zonePanel) zonePanel.style.display = 'none';
  if (isAddingBoundaryMode) {
    isAddingBoundaryMode = false;
    if (boundaryGhostMesh) boundaryGhostMesh.visible = false;
    const btnAdd = document.getElementById('btn-add-boundary');
    if (btnAdd) {
      btnAdd.classList.remove('active-mode');
      btnAdd.innerText = '➕ Add Keep-Out Zone';
    }
  }

  activeScan = scanFile;
  try {
    localStorage.setItem('active_scan', scanFile);
  } catch (e) { }

  // This scan's own calibration (boundary, mesh alignment, robot scale).
  calibration = calibrationForScan(activeScan);
  setupCalibrationControls();
  applyMeshTransform();
  applyRobotScale();

  // The other scan's planner routes are not this scan's: clear them until it plans again, and
  // show or hide ribbons as set for this scan.
  clearAStarRibbons();
  applyRibbonSetting();

  // Only this scan's furniture and zones from now on; routes planned around the other scan's
  // boxes are planned again.
  applyScanObstacles();
  robotDefs.forEach(r => {
    r.plannedLegKey = null;
    r.failedLegKeys = null;
    r.isDetouring = false;
    r.detourWaypoints = null;
    r.trail = [];
    clearDetourRibbon(r.id);
  });
  invalidateFleetSchedule();
  updateCustomCountUI();
  updateZoneChipsUI();

  loadSavedStationPositions();
  loadStationVisibility();
  syncStationsToServer();

  if (pedestrianSwarm) {
    pedestrianSwarm.setCampusScanActive(isCampusScan(activeScan));
  }
  if (logisticsDispatcher) {
    logisticsDispatcher.destinations = campusDestinations;
    logisticsDispatcher.labStations = labStations;
    logisticsDispatcher.setCampusScanActive(isCampusScan(activeScan));
  }

  if (isCampusScan(activeScan)) {
    if (boundaryWallsGroup) boundaryWallsGroup.visible = boundariesVisible;
    if (boundaryGroup) boundaryGroup.visible = (boundariesVisible || isAddingBoundaryMode || selectedObstacleIdx !== null || obstacleBoxes.some(b => b.userCreated));
    camera.position.set(0, 12, 16);
    controls.target.set(0, 0.5, 0);
    robotDefs.forEach(r => {
      const defWps = defaultCampusWaypoints[r.id];
      if (defWps && defWps.length > 0) {
        r.waypoints = defWps.map(p => p.clone());
        r.target.copy(r.waypoints[0]);
      }
    });
  } else if (activeScan === 'scan_house.glb') {
    if (boundaryWallsGroup) boundaryWallsGroup.visible = boundariesVisible;
    if (boundaryGroup) boundaryGroup.visible = (boundariesVisible || isAddingBoundaryMode || selectedObstacleIdx !== null || obstacleBoxes.some(b => b.userCreated));
    camera.position.set(0, 11, 15);
    controls.target.set(0, 0.5, 0);

    // Inspector Alpha (AMR-01) - Yard Perimeter
    robotDefs[0].waypoints = [
      labStations.inventory.pos.clone(),
      labStations.electronics.pos.clone(),
      labStations.testing.pos.clone(),
      labStations.charger.pos.clone()
    ];
    // Logistics Beta (AMR-02) - Cross-Yard Patrol
    robotDefs[1].waypoints = [
      labStations.electronics.pos.clone(),
      labStations.helipad.pos.clone(),
      labStations.testing.pos.clone(),
      labStations.inventory.pos.clone()
    ];
    // Courier Gamma (AMR-03) - Driveway to Shed
    robotDefs[2].waypoints = [
      labStations.charger.pos.clone(),
      labStations.inventory.pos.clone(),
      labStations.testing.pos.clone(),
      labStations.charger.pos.clone()
    ];
    // SkyWatcher Drone (UAV-01) - Aerial Lawn & Roof Survey
    const hPos = labStations.helipad.pos;
    robotDefs[3].hoverAltitude = 2.2;
    robotDefs[3].waypoints = [
      new THREE.Vector3(hPos.x, 2.1, hPos.z),
      new THREE.Vector3(labStations.electronics.pos.x, 2.4, labStations.electronics.pos.z),
      new THREE.Vector3(labStations.inventory.pos.x, 2.4, labStations.inventory.pos.z),
      new THREE.Vector3(labStations.charger.pos.x, 2.3, labStations.charger.pos.z),
      new THREE.Vector3(labStations.testing.pos.x, 2.3, labStations.testing.pos.z)
    ];
    // Unitree G1 Humanoid (HUM-01) - Bipedal Yard Walk
    robotDefs[4].waypoints = [
      new THREE.Vector3(labStations.helipad.pos.x, 0.05, labStations.helipad.pos.z),
      new THREE.Vector3(labStations.electronics.pos.x, 0.05, labStations.electronics.pos.z),
      new THREE.Vector3(labStations.inventory.pos.x, 0.05, labStations.inventory.pos.z),
      new THREE.Vector3(labStations.testing.pos.x, 0.05, labStations.testing.pos.z)
    ];
  } else {
    if (boundaryWallsGroup) boundaryWallsGroup.visible = boundariesVisible;
    if (boundaryGroup) boundaryGroup.visible = (boundariesVisible || isAddingBoundaryMode || selectedObstacleIdx !== null || obstacleBoxes.some(b => b.userCreated));
    camera.position.set(0, 5.8, 7.2);
    controls.target.set(0, 0.5, 0);

    robotDefs[0].waypoints = [
      new THREE.Vector3(-2.3, 0.05, -1.3),
      new THREE.Vector3(2.2, 0.05, -1.3),
      new THREE.Vector3(2.2, 0.05, 1.2),
      new THREE.Vector3(-2.3, 0.05, 1.2)
    ];
    robotDefs[1].waypoints = [
      new THREE.Vector3(2.2, 0.05, 1.2),
      new THREE.Vector3(0.0, 0.05, 0.0),
      new THREE.Vector3(-2.3, 0.05, -1.3),
      new THREE.Vector3(0.0, 0.05, 1.2)
    ];
    robotDefs[2].waypoints = [
      new THREE.Vector3(2.2, 0.05, 1.2),
      new THREE.Vector3(-2.3, 0.05, 1.2),
      new THREE.Vector3(-2.3, 0.05, -1.3),
      new THREE.Vector3(2.2, 0.05, 1.2)
    ];
    robotDefs[3].hoverAltitude = 1.9;
    robotDefs[3].waypoints = [
      new THREE.Vector3(0.0, 1.9, 0.0),
      new THREE.Vector3(2.1, 1.9, -1.2),
      new THREE.Vector3(-2.1, 1.9, -1.2),
      new THREE.Vector3(-2.1, 1.9, 1.1),
      new THREE.Vector3(2.1, 1.9, 1.1)
    ];
    robotDefs[4].waypoints = [
      new THREE.Vector3(0.0, 0.05, 0.8),
      new THREE.Vector3(-2.2, 0.05, 1.1),
      new THREE.Vector3(-2.2, 0.05, -1.2),
      new THREE.Vector3(0.0, 0.05, -1.2),
      new THREE.Vector3(2.1, 0.05, -1.2),
      new THREE.Vector3(2.1, 0.05, 1.1)
    ];
  }

  robotDefs.forEach(r => {
    r.waypointIdx = 0;
    if (r.type !== 'amr') {
      r.position.copy(r.waypoints[0]);
      r.target.copy(r.waypoints[1 % r.waypoints.length]);
    }
  });
  parkAmrsAtHomeDocks();

  buildBoundariesAndStations();
  loadLabMesh(activeScan);
}

// Dispatch with Collision & Boundary Checks
function dispatchSelectedRobot(rawPoint, stationName = null, overrideRobotId = null) {
  const targetId = overrideRobotId || selectedRobotId;
  const robot = robotDefs.find(r => r.id === targetId);
  if (!robot) return;

  const banner = document.querySelector('.dispatch-banner');
  const limits = getEnvironmentLimits();

  let safeTarget = { x: rawPoint.x, z: rawPoint.z };
  let warningMessage = null;

  const isDockOrStation = stationName && (stationName.includes('Dock') || stationName.includes('Station') || stationName.includes('Charger') || stationName.includes('Helipad'));

  if (activeScan === 'robotics_lab.glb' || isCampusScan(activeScan)) {
    const isOutOfBounds = (rawPoint.x < limits.minX || rawPoint.x > limits.maxX || rawPoint.z < limits.minZ || rawPoint.z > limits.maxZ);
    const hitObstacle = isInsideObstacle(rawPoint.x, rawPoint.z);

    if (isOutOfBounds) {
      safeTarget = findNearestSafePoint(rawPoint.x, rawPoint.z);
      warningMessage = `⚠️ Target was outside Perimeter! Clamped to safe boundary.`;
    } else if (hitObstacle && !isDockOrStation) {
      safeTarget = findNearestSafePoint(rawPoint.x, rawPoint.z);
      if (!stationName) warningMessage = `⚠️ Target inside ${hitObstacle.name}! Rerouted to nearest safe lane.`;
    } else if (isTargetBlocked(rawPoint.x, rawPoint.z) && !isDockOrStation) {
      // Not inside a box but within its margin: moved quietly to where the planner can reach.
      safeTarget = findNearestSafePoint(rawPoint.x, rawPoint.z);
    }
  } else {
    if (!isDockOrStation) {
      safeTarget.x = Math.max(limits.minX + 0.25, Math.min(limits.maxX - 0.25, rawPoint.x));
      safeTarget.z = Math.max(limits.minZ + 0.25, Math.min(limits.maxZ - 0.25, rawPoint.z));
    }
  }

  const targetY = (robot.type === 'drone') ? (stationName && (stationName.includes('Helipad') || stationName.includes('Depot')) ? 0.22 : (robot.hoverAltitude || 2.0)) : 0.05;
  robot.target.set(safeTarget.x, targetY, safeTarget.z);
  robot.status = stationName ? `En Route: ${stationName}` : 'Transporting';
  robot.isManualDrive = false;
  robot.isManualFlight = false;
  robot.isCustomMission = true;
  robot.hasArrivedMission = false;
  robot.missionStationName = stationName;
  robot.isReturningHome = Boolean(stationName && stationName.includes('Bay ') && stationName.includes('Dock'));
  robot.plannedLegKey = null;
  if (robot.type === 'drone') {
    robot.isLanded = false;
    robot.isLanding = false;
    robot.landingTarget = null;
    robot.isAscending = (robot.position.y < (robot.hoverAltitude || 1.90) - 0.2);
  } else if (robot.type === 'amr' || robot.type === 'humanoid') {
    planWaypointLeg(robot);
  }
  robot.speed = (robot.type === 'drone' ? 1.4 : (robot.type === 'humanoid' ? 0.95 : (robot.id === 'AMR-02' ? 1.0 : 0.9)));
  updateCameraHUDState();

  targetBeacon.position.set(safeTarget.x, 0.06, safeTarget.z);
  updateFleetCards();

  if (warningMessage) {
    banner.classList.add('warning');
    banner.innerHTML = `<span><b>Boundary Enforcement:</b> ${warningMessage}</span>`;
    setTimeout(() => {
      banner.classList.remove('warning');
      banner.innerHTML = `<span>🎯 <b>Interactive Dispatch Mode</b>: Click any point on the floor to route <span id="dispatch-target-name" style="color: #38bdf8;">${robot.name} (${robot.id})</span></span>`;
    }, 3200);
  } else {
    banner.classList.remove('warning');
    const dest = stationName ? stationName : `(X: ${safeTarget.x.toFixed(2)}m, Z: ${safeTarget.z.toFixed(2)}m)`;
    banner.innerHTML = `<span>🚀 <b>Dispatched:</b> Sent <b>${robot.name}</b> to <b>${dest}</b></span>`;
  }

  send('DISPATCH_TARGET', { id: robot.id, targetX: safeTarget.x, targetZ: safeTarget.z });
}

// Select, Highlight, and Focus Station in 3D Yard or Classroom
function selectAndFocusStation(stationKey) {
  const st = labStations[stationKey];
  if (!st) return;

  // If station was previously removed, restore it first
  if (stationVisibility[stationKey] === false) {
    stationVisibility[stationKey] = true;
    saveStationVisibility();
    if (stationMeshes[stationKey]) stationMeshes[stationKey].visible = true;
    buildBoundariesAndStations();
    updateStationButtonsUI();
    updateRobotWaypointsForActiveStations();
  }

  // Highlight button in sidebar
  document.querySelectorAll('.station-btn').forEach(b => {
    b.classList.toggle('active-station', b.getAttribute('data-station') === stationKey);
  });
  pendingStationPlacementKey = stationKey;

  // Make sure stationsGroup is visible
  if (stationsGroup) stationsGroup.visible = true;
  if (stationMeshes[stationKey]) stationMeshes[stationKey].visible = true;

  // Trigger holographic 3D beacon and ripple animation
  highlightStationIn3D(stationKey);

  // Smooth camera glide to frame the station if in orbit mode
  if (cameraMode !== 'fpv') {
    focusCameraOn(st.pos.x, st.pos.y + 0.2, st.pos.z, ((activeScan === 'scan_house.glb' || isCampusScan(activeScan)) ? 5.2 : 4.0));
  }

  // Dispatch selected robot to the station
  dispatchSelectedRobot(st.pos, st.name);

  const envName = isCampusScan(activeScan) ? (activeScan === 'mdc_north_campus_osm.glb' ? 'MDC North Campus (OSM CAD)' : 'MDC North Campus') : (activeScan === 'scan_house.glb' ? 'House Yard' : 'Classroom');
  const banner = document.querySelector('.dispatch-banner');
  if (banner) {
    banner.innerHTML = `<span>📍 <b>${st.name}</b> active in ${envName}! Navigating <b>${selectedRobotId}</b>. (Click floor to reposition)</span>`;
  }
}

// Remove or Restore a specific Station
function toggleStationVisibility(stationKey) {
  const isCurrentlyVisible = (stationVisibility[stationKey] !== false);
  const nextVisible = !isCurrentlyVisible;
  stationVisibility[stationKey] = nextVisible;
  saveStationVisibility();

  if (stationMeshes[stationKey]) {
    stationMeshes[stationKey].visible = nextVisible;
  }

  buildBoundariesAndStations();
  updateStationButtonsUI();
  updateRobotWaypointsForActiveStations();

  const st = labStations[stationKey];
  const sName = st ? st.name : stationKey;
  const envName = isCampusScan(activeScan) ? (activeScan === 'mdc_north_campus_osm.glb' ? 'MDC North Campus (OSM CAD)' : 'MDC North Campus') : (activeScan === 'scan_house.glb' ? 'House Yard' : 'Classroom');
  const banner = document.querySelector('.dispatch-banner');

  if (nextVisible) {
    selectAndFocusStation(stationKey);
    if (banner) {
      banner.innerHTML = `<span>👁️ <b>${sName} Restored</b> in ${envName}! Showing in 3D & routes active.</span>`;
      setTimeout(() => {
        banner.innerHTML = `<span>🎯 <b>Interactive Dispatch Mode</b>: Click any point on the floor to route <span id="dispatch-target-name" style="color: #38bdf8;">${selectedRobotId}</span></span>`;
      }, 3000);
    }
  } else {
    document.querySelectorAll(`.station-btn[data-station="${stationKey}"]`).forEach(b => {
      b.classList.remove('active-station');
    });
    if (pendingStationPlacementKey === stationKey) {
      pendingStationPlacementKey = null;
    }
    if (banner) {
      banner.innerHTML = `<span>🚫 <b>${sName} Removed</b> from ${envName}. Click station again in dashboard to restore.</span>`;
      setTimeout(() => {
        banner.innerHTML = `<span>🎯 <b>Interactive Dispatch Mode</b>: Click any point on the floor to route <span id="dispatch-target-name" style="color: #38bdf8;">${selectedRobotId}</span></span>`;
      }, 3000);
    }
  }
}

// Toggle All Stations ON or OFF
function toggleAllStations() {
  const allKeys = Object.keys(labStations);
  const anyVisible = allKeys.some(k => stationVisibility[k] !== false);
  const newState = !anyVisible;

  allKeys.forEach(k => {
    stationVisibility[k] = newState;
  });
  saveStationVisibility();

  allKeys.forEach(k => {
    if (stationMeshes[k]) stationMeshes[k].visible = newState;
  });

  if (!newState) {
    document.querySelectorAll('.station-btn').forEach(b => b.classList.remove('active-station'));
    pendingStationPlacementKey = null;
  }

  buildBoundariesAndStations();
  updateStationButtonsUI();
  updateRobotWaypointsForActiveStations();

  const banner = document.querySelector('.dispatch-banner');
  const envName = isCampusScan(activeScan) ? (activeScan === 'mdc_north_campus_osm.glb' ? 'MDC North Campus (OSM CAD)' : 'MDC North Campus') : (activeScan === 'scan_house.glb' ? 'House Yard' : 'Classroom');
  if (banner) {
    banner.innerHTML = newState
      ? `<span>👁️ <b>All Stations Restored</b> in ${envName}!</span>`
      : `<span>🚫 <b>All Stations Removed</b> from ${envName}. Click individual stations or "All ON" to restore.</span>`;
    setTimeout(() => {
      banner.innerHTML = `<span>🎯 <b>Interactive Dispatch Mode</b>: Click any point on the floor to route <span id="dispatch-target-name" style="color: #38bdf8;">${selectedRobotId}</span></span>`;
    }, 3200);
  }
}

// Keep Sidebar Station Buttons & Toggle Icons Synchronized
function updateStationButtonsUI() {
  const allKeys = Object.keys(labStations);
  let visibleCount = 0;

  document.querySelectorAll('.station-btn').forEach(btn => {
    const key = btn.getAttribute('data-station');
    const isVisible = (stationVisibility[key] !== false);
    if (isVisible) visibleCount++;

    btn.classList.toggle('removed-station', !isVisible);
    const toggleIcon = btn.querySelector('.station-btn-toggle');
    if (toggleIcon) {
      toggleIcon.textContent = isVisible ? '👁️' : '🚫';
      toggleIcon.title = isVisible ? 'Click to remove station from scene' : 'Click to restore station to scene';
    }
  });

  const btnToggleAll = document.getElementById('btn-toggle-all-stations');
  if (btnToggleAll) {
    if (visibleCount === 0) {
      btnToggleAll.textContent = '👁️ All ON';
      btnToggleAll.style.color = '#38bdf8';
      btnToggleAll.style.borderColor = 'rgba(56, 189, 248, 0.4)';
    } else {
      btnToggleAll.textContent = '🚫 All OFF';
      btnToggleAll.style.color = '#f87171';
      btnToggleAll.style.borderColor = 'rgba(248, 113, 113, 0.4)';
    }
  }
}

// Dynamically Route Robots only through Visible / Active Stations
function updateRobotWaypointsForActiveStations() {
  const visibleKeys = Object.keys(labStations).filter(k => stationVisibility[k] !== false);

  if (visibleKeys.length === 0) {
    const limits = getEnvironmentLimits();
    const fallbackPts = [
      new THREE.Vector3(limits.minX + 0.8, 0.05, limits.minZ + 0.8),
      new THREE.Vector3(limits.maxX - 0.8, 0.05, limits.minZ + 0.8),
      new THREE.Vector3(limits.maxX - 0.8, 0.05, limits.maxZ - 0.8),
      new THREE.Vector3(limits.minX + 0.8, 0.05, limits.maxZ - 0.8)
    ];

    robotDefs.forEach(r => {
      if (r.type === 'drone') {
        const alt = r.hoverAltitude || 1.9;
        r.waypoints = fallbackPts.map(p => new THREE.Vector3(p.x, alt, p.z));
      } else {
        r.waypoints = fallbackPts.map(p => p.clone());
      }
      r.waypointIdx = 0;
      if (r.waypoints.length > 0) {
        r.target.copy(r.waypoints[0]);
      }
    });
    buildWaypointsVisuals();
    return;
  }

  // For ground AMRs, routine patrol only cycles through workstations (A, B, C).
  // Station D (AMR Charger Dock) is an offline service bay reserved strictly for low battery (<= 20%) or manual command.
  const groundWorkKeys = visibleKeys.filter(k => k !== 'charger' && k !== 'helipad');
  const groundPositions = groundWorkKeys.length > 0 ? groundWorkKeys.map(k => labStations[k].pos) : visibleKeys.map(k => labStations[k].pos);
  const dronePositions = visibleKeys.filter(k => k !== 'charger').map(k => labStations[k].pos);

  robotDefs.forEach((r, rIdx) => {
    let pts = [];
    const activePositions = (r.type === 'drone') ? (dronePositions.length > 0 ? dronePositions : visibleKeys.map(k => labStations[k].pos)) : groundPositions;
    if (activePositions.length === 1) {
      const p = activePositions[0];
      pts = [p.clone(), new THREE.Vector3(p.x + 0.6, p.y, p.z + 0.6)];
    } else {
      pts = activePositions.map((_, i) => activePositions[(i + rIdx) % activePositions.length].clone());
    }

    if (r.type === 'drone') {
      const alt = r.hoverAltitude || 1.9;
      r.waypoints = pts.map(p => new THREE.Vector3(p.x, alt, p.z));
    } else {
      r.waypoints = pts.map(p => new THREE.Vector3(p.x, 0.05, p.z));
    }
    r.waypointIdx = r.waypointIdx % r.waypoints.length;
    r.target.copy(r.waypoints[r.waypointIdx]);
  });

  buildWaypointsVisuals();
}

function highlightStationIn3D(stationKey) {
  const st = labStations[stationKey];
  if (!st) return;
  highlightPointIn3D(st.pos, st.color);
}

function highlightPointIn3D(pos, colorHex = 0x38bdf8) {
  // Expanding ground ripple ring
  const rippleGeo = new THREE.RingGeometry(0.25, 0.40, 32);
  rippleGeo.rotateX(-Math.PI / 2);
  const rippleMat = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const rippleMesh = new THREE.Mesh(rippleGeo, rippleMat);
  rippleMesh.position.set(pos.x, 0.08, pos.z);
  scene.add(rippleMesh);

  // Holographic vertical beacon cylinder beam
  const beamGeo = new THREE.CylinderGeometry(0.12, 0.38, 3.5, 16, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.40,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const beamMesh = new THREE.Mesh(beamGeo, beamMat);
  beamMesh.position.set(pos.x, 1.8, pos.z);
  scene.add(beamMesh);

  stationHighlightRipples.push({
    mesh: rippleMesh,
    beam: beamMesh,
    created: performance.now(),
    duration: 1800,
    startScale: 1.0,
    endScale: 3.8
  });
}

function updateStationAndWaypointEffects(delta) {
  const now = performance.now();
  for (let i = stationHighlightRipples.length - 1; i >= 0; i--) {
    const item = stationHighlightRipples[i];
    const age = now - item.created;
    const progress = Math.min(1, age / item.duration);
    if (progress >= 1) {
      scene.remove(item.mesh);
      scene.remove(item.beam);
      item.mesh.geometry.dispose();
      item.mesh.material.dispose();
      item.beam.geometry.dispose();
      item.beam.material.dispose();
      stationHighlightRipples.splice(i, 1);
    } else {
      const s = item.startScale + (item.endScale - item.startScale) * progress;
      item.mesh.scale.set(s, s, s);
      item.mesh.material.opacity = (1 - progress) * 0.95;
      item.beam.material.opacity = (1 - progress) * 0.40;
      item.beam.rotation.y += delta * 2.5;
    }
  }
}

function updateLakeWater(delta) {
  if (!campusLakeWaterMesh || !campusLakeWaterMesh.geometry || !isCampusScan(activeScan)) return;
  const pos = campusLakeWaterMesh.geometry.attributes.position;
  if (!pos) return;
  const time = clock.getElapsedTime();
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i);
    const w = pos.getZ(i);
    const dist = Math.hypot(u - (-0.25), w - 0.0);
    // Subtle fountain water ripple radiating outwards from center plinth (-0.25, 0.0)
    const ripple = Math.sin(dist * 14.0 - time * 3.2) * 0.0022 * Math.max(0, 1.0 - dist * 0.65);
    const wave = Math.sin(u * 3.5 + time * 1.5) * 0.0012;
    pos.setY(i, 0.048 + ripple + wave);
  }
  pos.needsUpdate = true;
  campusLakeWaterMesh.geometry.computeVertexNormals();
}

function focusCameraOn(targetX, targetY, targetZ, distance = 4.5) {
  const startPos = camera.position.clone();
  const startTarget = controls.target.clone();
  const endTarget = new THREE.Vector3(targetX, targetY, targetZ);

  const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
  if (offset.lengthSq() < 0.001) offset.set(0, 4, 4);
  offset.normalize().multiplyScalar(distance);
  if (offset.y < 2.0) offset.y = 2.0;
  const endPos = new THREE.Vector3().copy(endTarget).add(offset);

  cameraAnim = {
    startPos,
    endPos,
    startTarget,
    endTarget,
    startTime: performance.now(),
    duration: 650
  };
}

function enterObserverMode(robotId) {
  isObserverMode = true;
  if (robotId) selectedRobotId = robotId;

  // Ensure robot stays in autonomous patrol/flight (NOT manual)
  const sel = robotDefs.find(r => r.id === selectedRobotId);
  if (sel) {
    sel.isManualDrive = false;
    sel.isManualFlight = false;
    if (sel.type === 'amr' || sel.id.startsWith('AMR-')) activeRoverId = sel.id;
    else if (sel.type === 'drone' || sel.id.startsWith('UAV-')) activeDroneId = sel.id;
    const dispatchLabel = document.getElementById('dispatch-target-name');
    if (dispatchLabel) dispatchLabel.innerText = `${sel.name} (${sel.id})`;
  }

  const dd = document.getElementById('robot-cam-dropdown');
  if (dd) dd.style.display = 'none';

  updateFleetCards();
  setCameraMode('fpv');
  setActiveToolBtn('btn-camera-fpv');
  updateCameraHUDState();
  updateFPVCamera();
}

function cycleObserverRobot(direction = 1) {
  const currentIndex = robotDefs.findIndex(r => r.id === selectedRobotId);
  let nextIndex = (currentIndex + direction + robotDefs.length) % robotDefs.length;
  selectedRobotId = robotDefs[nextIndex].id;
  const nextRobot = robotDefs[nextIndex];
  if (isObserverMode) {
    nextRobot.isManualDrive = false;
    nextRobot.isManualFlight = false;
  }
  const dispatchLabel = document.getElementById('dispatch-target-name');
  if (dispatchLabel) dispatchLabel.innerText = `${nextRobot.name} (${nextRobot.id})`;
  updateFleetCards();
  updateCameraHUDState();
  updateFPVCamera();
}

function setCameraMode(mode) {
  cameraMode = mode;
  const hud = document.getElementById('drone-fpv-hud');
  const dd = document.getElementById('robot-cam-dropdown');
  const sidebar = document.querySelector('.sidebar');
  const topBar = document.querySelector('.top-bar');
  const dispatchBanner = document.querySelector('.dispatch-banner');

  if (dd) dd.style.display = 'none';

  if (mode === 'orbit') {
    if (hud) hud.style.display = 'none';
    if (sidebar) sidebar.style.display = 'flex';
    if (topBar) topBar.style.display = 'flex';
    if (dispatchBanner) dispatchBanner.style.display = 'block';
    controls.enabled = true;
    controls.target.set(0, 0.5, 0);
    camera.position.set(0, 5.8, 7.2);
  } else if (mode === 'top') {
    if (hud) hud.style.display = 'none';
    if (sidebar) sidebar.style.display = 'flex';
    if (topBar) topBar.style.display = 'flex';
    if (dispatchBanner) dispatchBanner.style.display = 'block';
    controls.enabled = true;
    controls.target.set(0, 0, 0);
    camera.position.set(0, 16, 0.001);
  } else if (mode === 'fpv') {
    if (hud) hud.style.display = 'block';
    // Clean, unobstructed view in Robot Cam (hide sidebar, top bar, and floor dispatch banner)
    if (sidebar) sidebar.style.display = 'none';
    if (topBar) topBar.style.display = 'none';
    if (dispatchBanner) dispatchBanner.style.display = 'none';
    controls.enabled = false;
  }
  updateCameraHUDState();
}

function setActiveToolBtn(id) {
  document.querySelectorAll('.tool-btn').forEach(b => {
    if (b.id.startsWith('btn-camera')) b.classList.remove('active');
  });
  const btn = document.getElementById(id);
  if (btn) btn.classList.add('active');
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);

  // Clamp floating panels if window shrunk
  const panels = [
    document.getElementById('brand-badge-panel') || document.querySelector('.brand-badge'),
    document.getElementById('controls-toolbar-panel') || document.querySelector('.controls-toolbar'),
    document.getElementById('fleet-sidebar') || document.querySelector('.sidebar')
  ];
  panels.forEach(el => {
    if (!el || el.style.left === 'auto' || !el.style.left) return;
    const rect = el.getBoundingClientRect();
    const maxLeft = Math.max(8, window.innerWidth - el.offsetWidth - 8);
    const maxTop = Math.max(8, window.innerHeight - el.offsetHeight - 8);
    if (rect.left > maxLeft) el.style.left = `${maxLeft}px`;
    if (rect.top > maxTop) el.style.top = `${maxTop}px`;
  });
}

// ==========================================
// KINETIC GRADUAL SMOOTH ZOOM
// ==========================================
let zoomTargetFactor = 1.0;

function setupSmoothZoom() {
  const dom = renderer.domElement;

  dom.addEventListener('wheel', (e) => {
    if (cameraMode === 'fpv') return;
    e.preventDefault();

    // Subtle 7% zoom step per notch with continuous inertia stacking
    const sign = e.deltaY < 0 ? -1 : 1;
    const zoomStep = sign < 0 ? 0.925 : 1.081;

    zoomTargetFactor *= zoomStep;
    // Keep target factor bounded to avoid runaway values
    zoomTargetFactor = Math.max(0.2, Math.min(5.0, zoomTargetFactor));
  }, { passive: false });
}

function updateSmoothZoom(delta) {
  if (cameraMode === 'fpv') return;

  if (Math.abs(zoomTargetFactor - 1.0) > 0.0005) {
    // Easing factor: delta * 8.0 creates a buttery 250ms gradual glide to destination
    const factor = Math.min(1.0, delta * 8.0);
    const step = THREE.MathUtils.lerp(1.0, zoomTargetFactor, factor);

    const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
    const currentDist = offset.length();
    const newDist = currentDist * step;

    if (newDist >= controls.minDistance && newDist <= controls.maxDistance) {
      offset.multiplyScalar(step);
      camera.position.addVectors(controls.target, offset);
    } else {
      zoomTargetFactor = 1.0;
    }

    zoomTargetFactor /= step;
  }
}

function animate() {
  requestAnimationFrame(animate);

  // At most 0.1 s of simulation per frame: after a stall (a busy or memory-starved browser) the
  // simulation catches up slowly instead of moving robots in one big jump, past the gaps they keep
  // from each other and from walls.
  const delta = Math.min(clock.getDelta(), 0.1);
  updateSimulation(delta);
  if (pedestrianSwarm) pedestrianSwarm.update(delta);
  if (logisticsDispatcher) logisticsDispatcher.update(delta);
  updateLidarVisualizerAndAI(delta);

  // Smooth camera glide animation towards focused stations/waypoints
  if (cameraAnim) {
    const elapsed = performance.now() - cameraAnim.startTime;
    const progress = Math.min(1, elapsed / cameraAnim.duration);
    const ease = 0.5 - 0.5 * Math.cos(Math.PI * progress);
    camera.position.lerpVectors(cameraAnim.startPos, cameraAnim.endPos, ease);
    controls.target.lerpVectors(cameraAnim.startTarget, cameraAnim.endTarget, ease);
    controls.update();
    if (progress >= 1) cameraAnim = null;
  }

  // Update animated 3D beacons and ripple effects
  updateStationAndWaypointEffects(delta);
  updateLakeWater(delta);

  if (cameraMode === 'fpv') {
    updateFPVCamera();
  } else {
    updateSmoothZoom(delta);
    controls.update();
  }

  cardUpdateTimer += delta;
  if (cardUpdateTimer > 0.25) {
    updateFleetCards();
    if (cameraMode === 'fpv') updateCameraHUDState();
    updateG1DashboardTelemetry();
    updateDroneDashboardTelemetry();
    updateRoverDashboardTelemetry();
    cardUpdateTimer = 0;
  }

  renderer.render(scene, camera);
}

// ==========================================
// UNITREE G1 EDU PLUS DASHBOARD & AI CHAT
// ==========================================

function openG1Dashboard() {
  if (typeof closeRoverDashboard === 'function') closeRoverDashboard();
  if (typeof closeDroneDashboard === 'function') closeDroneDashboard();
  const modal = document.getElementById('g1-dashboard-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  updateG1DashboardTelemetry();
  updateWaypointCountsUI();
  const input = document.getElementById('g1-chat-input');
  if (input) setTimeout(() => input.focus(), 80);
}

function closeG1Dashboard() {
  const modal = document.getElementById('g1-dashboard-modal');
  if (!modal) return;
  modal.style.display = 'none';
}

function updateG1DashboardTelemetry() {
  const modal = document.getElementById('g1-dashboard-modal');
  if (!modal || modal.style.display === 'none') return;

  const g1 = robotDefs.find(r => r.id === 'HUM-01');
  if (!g1) return;

  // Battery & Voltage
  const batVal = Math.round(g1.battery);
  const batElem = document.getElementById('g1-stat-battery');
  const barElem = document.getElementById('g1-battery-bar');
  const voltElem = document.getElementById('g1-stat-voltage');
  if (batElem) batElem.textContent = `${batVal}%`;
  if (barElem) barElem.style.width = `${batVal}%`;
  if (voltElem) voltElem.textContent = `${(44.0 + batVal * 0.08).toFixed(1)} V`;

  // Locomotion
  const spdElem = document.getElementById('g1-stat-speed');
  const stateElem = document.getElementById('g1-stat-state');
  const cadElem = document.getElementById('g1-stat-cadence');
  const coordElem = document.getElementById('g1-stat-coords');
  const headElem = document.getElementById('g1-stat-heading');

  if (spdElem) spdElem.textContent = `${g1.speed.toFixed(2)} m/s`;
  if (stateElem) stateElem.textContent = g1.status;
  if (cadElem) cadElem.textContent = `${(g1.speed * 2.1).toFixed(1)} Hz`;
  if (coordElem) coordElem.textContent = `${g1.position.x.toFixed(2)}m, ${g1.position.z.toFixed(2)}m`;
  if (headElem) {
    const deg = Math.round((g1.heading * 180 / Math.PI) % 360);
    headElem.textContent = `${deg}°`;
  }

  // LiDAR Clearance
  const lidarElem = document.getElementById('g1-stat-lidar-dist');
  if (lidarElem) {
    let minObsDist = 999;
    obstacleBoxes.forEach(ob => {
      if (!ob || ob.isWalkwayNetwork) return;
      const cx = (ob.minX + ob.maxX) / 2;
      const cz = (ob.minZ + ob.maxZ) / 2;
      const d = Math.hypot(g1.position.x - cx, g1.position.z - cz);
      if (d < minObsDist) minObsDist = d;
    });
    if (minObsDist < 0.85) {
      lidarElem.style.color = '#f59e0b';
      lidarElem.textContent = `Proximity (${minObsDist.toFixed(2)}m)`;
    } else {
      lidarElem.style.color = '#38bdf8';
      lidarElem.textContent = `Clear (> 2.5m)`;
    }
  }
}

function appendG1ChatMessage(sender, text, isUser = false) {
  const stream = document.getElementById('g1-chat-stream');
  if (!stream) return;
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${isUser ? 'user-bubble' : 'g1-bubble'}`;
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  bubble.innerHTML = `
    <div class="bubble-sender">${sender}</div>
    <div class="bubble-text">${text}</div>
    <div class="bubble-time">${timeStr}</div>
  `;
  stream.appendChild(bubble);
  stream.scrollTop = stream.scrollHeight;
}

function dispatchG1ToStation(stationKey, station) {
  const g1 = robotDefs.find(r => r.id === 'HUM-01');
  if (!g1) return;

  let targetX = station.pos.x;
  let targetZ = station.pos.z;
  if (isTargetBlocked(targetX, targetZ)) {
    const safe = findNearestSafePoint(targetX, targetZ);
    targetX = safe.x;
    targetZ = safe.z;
  }

  g1.target.set(targetX, 0.05, targetZ);
  g1.speed = 0.85;
  g1.isCustomMission = true;
  g1.hasArrivedMission = false;
  g1.missionStationKey = stationKey;
  g1.missionStationName = station.name;
  g1.plannedLegKey = null;
  planWaypointLeg(g1);
  const shortName = station.name.includes(':') ? station.name.split(':')[1].trim() : station.name;
  g1.status = `En Route: ${shortName}`;
}

function executeG1Command(rawCmd) {
  if (!rawCmd || !rawCmd.trim()) return;
  const g1 = robotDefs.find(r => r.id === 'HUM-01');
  if (!g1) return;

  appendG1ChatMessage('👤 Pilot / Operator', rawCmd, true);
  const cmd = rawCmd.toLowerCase().trim();

  // 1. Station Navigation Commands
  if (cmd.includes('test') || cmd.includes('calibration') || cmd.includes('table')) {
    dispatchG1ToStation('testing', labStations.testing);
    appendG1ChatMessage('🤖 Unitree G1 Silver', 'Roger that! Plotting optimal collision-free bipedal route to Station C: Testing Table. Walking now...');
    return;
  }
  if (cmd.includes('elect') || cmd.includes('pcb') || cmd.includes('solder') || cmd.includes('bench') || cmd.includes('circuit')) {
    dispatchG1ToStation('electronics', labStations.electronics);
    appendG1ChatMessage('🤖 Unitree G1 Silver', 'Affirmative. Routing to Station B: Electronics Bench for circuit inspection. Striding ahead...');
    return;
  }
  if (cmd.includes('part') || cmd.includes('shelf') || cmd.includes('inventory') || cmd.includes('bin') || cmd.includes('hardware')) {
    dispatchG1ToStation('inventory', labStations.inventory);
    appendG1ChatMessage('🤖 Unitree G1 Silver', 'Command received. Navigating to Station A: Parts Shelf to audit component inventory...');
    return;
  }
  if (cmd.includes('charg') || cmd.includes('dock') || cmd.includes('power pad')) {
    dispatchG1ToStation('charger', labStations.charger);
    appendG1ChatMessage('🤖 Unitree G1 Silver', 'Heading to Station D: AMR Charger Dock for power coupling check...');
    return;
  }
  if (cmd.includes('heli') || cmd.includes('drone') || cmd.includes('uav') || cmd.includes('skywatcher')) {
    dispatchG1ToStation('helipad', labStations.helipad);
    appendG1ChatMessage('🤖 Unitree G1 Silver', 'Navigating to Station E: Drone Helipad to coordinate mission status with UAV-01 SkyWatcher...');
    return;
  }

  // 1.5 Waypoint Patrol Commands
  if (cmd.includes('waypoint') || cmd.includes('route') || cmd.includes('circuit')) {
    if (cmd.includes('act') || cmd.includes('start') || cmd.includes('hide') || cmd.includes('follow') || cmd.includes('run')) {
      activateAndHideWaypoints('HUM-01');
      return;
    } else if (cmd.includes('reset') || cmd.includes('default')) {
      resetWaypointsForRobot('HUM-01');
      appendG1ChatMessage('🤖 Unitree G1 Silver', 'Waypoints reset to default laboratory inspection circuit.');
      return;
    } else {
      showAndEditWaypoints('HUM-01');
      appendG1ChatMessage('🤖 Unitree G1 Silver', 'Waypoints displayed on the floor! Drag nodes in 3D, then click [Activate & Hide Waypoints] to commence bipedal patrol.');
      return;
    }
  }

  // 2. Interactive Gestures
  if (cmd.includes('wave') || cmd.includes('hello') || cmd.includes('hi') || cmd.includes('greet')) {
    g1.isWaving = true;
    g1.waveTimer = 3.5;
    appendG1ChatMessage('🤖 Unitree G1 Silver', 'Acknowledged! Raising right manipulator and waving to the laboratory team. Hello everyone! 👋');
    return;
  }

  // 3. Locomotion Control
  if (cmd.includes('stop') || cmd.includes('halt') || cmd.includes('pause') || cmd.includes('stay') || cmd.includes('freeze')) {
    g1.isCustomMission = false;
    g1.speed = 0;
    g1.target.copy(g1.position);
    g1.status = 'Standing Idle';
    appendG1ChatMessage('🤖 Unitree G1 Silver', 'Immediate halt executed. Bipedal joints locked in stable standing stance. Standing by for instructions.');
    return;
  }
  if (cmd.includes('resume') || cmd.includes('continue') || cmd.includes('patrol')) {
    g1.isCustomMission = false;
    g1.speed = 0.85;
    g1.status = 'Bipedal Walking';
    if (g1.waypoints && g1.waypoints.length > 0) {
      g1.waypointIdx = (g1.waypointIdx + 1) % g1.waypoints.length;
      g1.target.copy(g1.waypoints[g1.waypointIdx]);
    }
    appendG1ChatMessage('🤖 Unitree G1 Silver', 'Resuming standard patrol routine across laboratory zones.');
    return;
  }
  if (cmd.includes('faster') || cmd.includes('speed up') || cmd.includes('run')) {
    g1.speed = Math.min(1.4, g1.speed + 0.3);
    appendG1ChatMessage('🤖 Unitree G1 Silver', `Gait frequency boosted! Walking velocity increased to ${g1.speed.toFixed(2)} m/s.`);
    return;
  }
  if (cmd.includes('slower') || cmd.includes('slow down')) {
    g1.speed = Math.max(0.4, g1.speed - 0.25);
    appendG1ChatMessage('🤖 Unitree G1 Silver', `Gait paced down for high-precision motion. Walking speed: ${g1.speed.toFixed(2)} m/s.`);
    return;
  }

  // 4. Diagnostics & Status
  if (cmd.includes('status') || cmd.includes('health') || cmd.includes('report') || cmd.includes('diagnost')) {
    const v = (44.0 + g1.battery * 0.08).toFixed(1);
    appendG1ChatMessage('🤖 Unitree G1 Silver', `Diagnostics Report:
• Battery: ${Math.round(g1.battery)}% (${v}V)
• Status: ${g1.status}
• Location: [X: ${g1.position.x.toFixed(2)}m, Z: ${g1.position.z.toFixed(2)}m]
• Actuators: 23/23 DoF Nominal (100% OK)
• Speed: ${g1.speed.toFixed(2)} m/s`);
    return;
  }

  // Fallback
  appendG1ChatMessage('🤖 Unitree G1 Silver', `Command received: "${rawCmd}". You can command me to go to any station ("Go to Testing Table", "Go to Electronics Bench", "Go to Parts Shelf", "Go to Charger Dock", "Go to Drone Helipad"), "Place waypoints", "Activate waypoints", "Wave hello", "Stop", or "Resume".`);
}

function setupG1DashboardUI() {
  const closeBtn = document.getElementById('btn-close-g1-modal');
  if (closeBtn) closeBtn.addEventListener('click', closeG1Dashboard);

  const backdrop = document.getElementById('g1-dashboard-backdrop');
  if (backdrop) backdrop.addEventListener('click', closeG1Dashboard);

  const btnEditWp = document.getElementById('btn-g1-edit-waypoints');
  if (btnEditWp) btnEditWp.onclick = () => showAndEditWaypoints('HUM-01');

  const btnActWp = document.getElementById('btn-g1-activate-waypoints');
  if (btnActWp) btnActWp.onclick = () => activateAndHideWaypoints('HUM-01');

  const chipEditWp = document.getElementById('btn-chip-g1-edit-wp');
  if (chipEditWp) chipEditWp.onclick = () => showAndEditWaypoints('HUM-01');

  const chipActWp = document.getElementById('btn-chip-g1-act-wp');
  if (chipActWp) chipActWp.onclick = () => activateAndHideWaypoints('HUM-01');

  const chatForm = document.getElementById('g1-chat-form');
  const chatInput = document.getElementById('g1-chat-input');
  if (chatForm && chatInput) {
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = chatInput.value.trim();
      if (val) {
        executeG1Command(val);
        chatInput.value = '';
      }
    });
  }

  const handleG1CockpitCam = (e) => {
    e.stopPropagation();
    e.preventDefault();
    closeG1Dashboard();
    selectedRobotId = 'HUM-01';
    const dispatchLabel = document.getElementById('dispatch-target-name');
    if (dispatchLabel) dispatchLabel.innerText = 'Unitree G1 Silver (HUM-01)';
    updateFleetCards();
    setCameraMode('fpv');
    setActiveToolBtn('btn-camera-fpv');
    setAmrManualDrive('HUM-01', true);
  };

  const btnCockpitG1 = document.getElementById('btn-g1-cockpit-cam');
  if (btnCockpitG1) btnCockpitG1.onclick = handleG1CockpitCam;

  const btnHeaderG1 = document.getElementById('btn-header-g1-cam');
  if (btnHeaderG1) btnHeaderG1.onclick = handleG1CockpitCam;

  document.querySelectorAll('#g1-dashboard-modal .quick-cmd-btn:not(#btn-g1-cockpit-cam):not(#btn-chip-g1-edit-wp):not(#btn-chip-g1-act-wp)').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const cmd = btn.getAttribute('data-cmd') || btn.innerText;
      executeG1Command(cmd);
    });
  });
}

// Window exports for debugging & programmatic control
window.openG1Dashboard = openG1Dashboard;
window.closeG1Dashboard = closeG1Dashboard;
window.executeG1Command = executeG1Command;
window.dispatchG1ToStation = dispatchG1ToStation;

// ==========================================
// DRONE DASHBOARD & AI CHAT (Multi-UAV)
// ==========================================
let activeDroneId = 'UAV-01';

function switchDroneDashboard(droneId) {
  if (droneId && robotDefs.some(r => r.id === droneId)) {
    activeDroneId = droneId;
    selectedRobotId = droneId;
    updateFleetCards();
  }
  document.querySelectorAll('.drone-pill-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-drone') === activeDroneId);
  });
  const drone = robotDefs.find(r => r.id === activeDroneId);
  const titleEl = document.querySelector('.drone-header .dashboard-title');
  const subEl = document.querySelector('.drone-header .dashboard-subtitle');
  if (titleEl && drone) titleEl.textContent = drone.name;
  if (subEl && drone) subEl.innerHTML = `Autonomous Quadcopter Scout &bull; ID: <code>${drone.id}</code> &bull; <span class="status-online" style="color: #${drone.color.toString(16).padStart(6, '0')};">● FLIGHT TELEMETRY LINKED</span>`;
  updateDroneDashboardTelemetry();
  updateWaypointCountsUI();
}
window.switchDroneDashboard = switchDroneDashboard;

function openDroneDashboard(droneId) {
  if (droneId && robotDefs.some(r => r.id === droneId)) {
    activeDroneId = droneId;
    selectedRobotId = droneId;
  }
  if (typeof closeRoverDashboard === 'function') closeRoverDashboard();
  if (typeof closeG1Dashboard === 'function') closeG1Dashboard();
  const modal = document.getElementById('drone-dashboard-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  switchDroneDashboard(activeDroneId);
  const input = document.getElementById('drone-chat-input');
  if (input) setTimeout(() => input.focus(), 80);
}

function closeDroneDashboard() {
  const modal = document.getElementById('drone-dashboard-modal');
  if (!modal) return;
  modal.style.display = 'none';
}

function updateDroneDashboardTelemetry() {
  const modal = document.getElementById('drone-dashboard-modal');
  if (!modal || modal.style.display === 'none') return;

  const drone = robotDefs.find(r => r.id === (activeDroneId || 'UAV-01'));
  if (!drone) return;

  // Altitude & Speed
  const altElem = document.getElementById('drone-stat-alt');
  const climbElem = document.getElementById('drone-stat-climb');
  const speedElem = document.getElementById('drone-stat-speed');
  const stateElem = document.getElementById('drone-stat-state');
  const bankElem = document.getElementById('drone-stat-bank');
  const coordsElem = document.getElementById('drone-stat-coords');
  const headingElem = document.getElementById('drone-stat-heading');

  const curAlt = drone.position ? drone.position.y : (drone.mesh ? drone.mesh.position.y : 1.9);
  if (altElem) altElem.textContent = `${curAlt.toFixed(2)} m AGL`;
  if (climbElem) {
    const climbRate = (drone.isAscending) ? '+0.85 m/s' : (drone.isLanding ? '-0.65 m/s' : (drone.isLanded || curAlt < 0.10 ? '0.0 m/s (Landed)' : '±0.02 m/s (Level)'));
    climbElem.textContent = `Climb: ${climbRate}`;
  }
  if (speedElem) speedElem.textContent = `${drone.speed.toFixed(2)} m/s`;
  if (stateElem) stateElem.textContent = drone.status;

  if (bankElem && drone.mesh) {
    const rollDeg = (drone.mesh.rotation.z * 180 / Math.PI).toFixed(1);
    const pitchDeg = (drone.mesh.rotation.x * 180 / Math.PI).toFixed(1);
    bankElem.textContent = `R: ${rollDeg}° | P: ${pitchDeg}°`;
  }
  if (coordsElem) coordsElem.textContent = `${drone.position.x.toFixed(2)}m, ${drone.position.z.toFixed(2)}m`;
  if (headingElem) {
    const deg = Math.round((drone.heading * 180 / Math.PI) % 360);
    headingElem.textContent = `Heading: ${deg}°`;
  }

  // Battery & Voltage
  const batVal = Math.round(drone.battery);
  const batElem = document.getElementById('drone-stat-battery');
  const barElem = document.getElementById('drone-battery-bar');
  const voltElem = document.getElementById('drone-stat-voltage');
  const curDrawElem = document.getElementById('drone-stat-current');
  const pwrElem = document.getElementById('drone-stat-power');
  const runElem = document.getElementById('drone-stat-runtime');

  if (batElem) batElem.textContent = `${batVal}%`;
  if (barElem) barElem.style.width = `${batVal}%`;
  const lipoVolts = (14.0 + batVal * 0.028).toFixed(1);
  if (voltElem) voltElem.textContent = `${lipoVolts} V`;

  const amps = (drone.isLanded || curAlt < 0.10) ? '0.4' : (drone.speed > 0.1 ? (11.5 + drone.speed * 1.8).toFixed(1) : (drone.isLanding ? '4.2' : '3.8'));
  if (curDrawElem) curDrawElem.textContent = `${amps} A`;
  if (pwrElem) pwrElem.textContent = `${(parseFloat(lipoVolts) * parseFloat(amps)).toFixed(0)} Watts`;
  if (runElem) {
    const mins = Math.max(0, (batVal * 0.18)).toFixed(1);
    runElem.textContent = `${mins} min`;
  }

  // Quad-Rotor Brushless Motor RPMs
  const baseRPM = (drone.isLanded || curAlt < 0.10) ? 0 : (drone.isLanding ? 2800 : (drone.speed > 0.1 ? 6800 : 4500));
  const m1 = document.getElementById('drone-m1-rpm');
  const m2 = document.getElementById('drone-m2-rpm');
  const m3 = document.getElementById('drone-m3-rpm');
  const m4 = document.getElementById('drone-m4-rpm');
  const t = clock.getElapsedTime();
  if (m1) m1.textContent = baseRPM === 0 ? '● 0 RPM (Idle)' : `● ${baseRPM + Math.round(Math.sin(t * 7) * 40)} RPM`;
  if (m2) m2.textContent = baseRPM === 0 ? '● 0 RPM (Idle)' : `● ${baseRPM + Math.round(Math.cos(t * 8) * 35)} RPM`;
  if (m3) m3.textContent = baseRPM === 0 ? '● 0 RPM (Idle)' : `● ${baseRPM + Math.round(Math.sin(t * 9) * 45)} RPM`;
  if (m4) m4.textContent = baseRPM === 0 ? '● 0 RPM (Idle)' : `● ${baseRPM + Math.round(Math.cos(t * 6) * 30)} RPM`;
}

function appendDroneChatMessage(sender, text, isUser = false) {
  const stream = document.getElementById('drone-chat-stream');
  if (!stream) return;
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${isUser ? 'user-bubble' : 'drone-bubble'}`;
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  bubble.innerHTML = `
    <div class="bubble-sender">${sender}</div>
    <div class="bubble-text">${text}</div>
    <div class="bubble-time">${timeStr}</div>
  `;
  stream.appendChild(bubble);
  stream.scrollTop = stream.scrollHeight;
}

function dispatchDroneToStation(stationKey, station) {
  const drone = robotDefs.find(r => r.id === (activeDroneId || 'UAV-01'));
  if (!drone) return;

  drone.hoverAltitude = drone.hoverAltitude || 2.2;
  drone.target.set(station.pos.x, drone.hoverAltitude, station.pos.z);
  drone.speed = 1.35;
  drone.isCustomMission = true;
  drone.hasArrivedMission = false;
  drone.isLanded = false;
  drone.isLanding = false;
  drone.isAscending = (drone.position.y < (drone.hoverAltitude - 0.2));
  drone.landingTarget = null;
  drone.missionStationKey = stationKey;
  drone.missionStationName = station.name;
  const shortName = station.name.includes(':') ? station.name.split(':')[1].trim() : station.name;
  drone.status = drone.isAscending ? `Ascending to ${drone.hoverAltitude.toFixed(1)}m: ${shortName}` : `En Route: ${shortName}`;
}

function executeDroneCommand(rawCmd) {
  if (!rawCmd || !rawCmd.trim()) return;
  const drone = robotDefs.find(r => r.id === (activeDroneId || 'UAV-01'));
  if (!drone) return;

  appendDroneChatMessage('👤 Pilot / Operator', rawCmd, true);
  const cmd = rawCmd.toLowerCase().trim();

  // 1. Landing Directives: "land", "touchdown", "descend", "land on helipad"
  if (cmd.includes('land') || cmd.includes('touchdown') || cmd.includes('descend')) {
    if (cmd.includes('heli') || cmd.includes('pad') || cmd.includes('home') || cmd.includes('rtl')) {
      // Return and land precision protocol on Station E: Drone Helipad
      const hPos = (labStations && labStations.helipad) ? labStations.helipad.pos : new THREE.Vector3(0, 0.05, 0);
      drone.landingTarget = new THREE.Vector3(hPos.x, 0.05, hPos.z);
      drone.target.set(hPos.x, drone.hoverAltitude || 2.2, hPos.z);
      drone.speed = 1.35;
      drone.isLanding = true;
      drone.isLanded = false;
      drone.isAscending = false;
      drone.isCustomMission = true;
      drone.hasArrivedMission = false;
      drone.hasAnnouncedTouchdown = false;
      drone.missionStationName = 'Station E: Drone Helipad';
      drone.status = 'En Route to Helipad for Landing';
      appendDroneChatMessage(`🚁 ${drone.name}`, 'Return-to-launch (RTL) landing protocol engaged. Routing to Station E: Drone Helipad for vertical touchdown.');
    } else {
      // Immediate Vertical Descent Landing in place
      drone.landingTarget = new THREE.Vector3(drone.position.x, 0.05, drone.position.z);
      drone.target.copy(drone.landingTarget);
      drone.speed = 0.0;
      drone.isLanding = true;
      drone.isLanded = false;
      drone.isAscending = false;
      drone.isCustomMission = true;
      drone.hasArrivedMission = false;
      drone.hasAnnouncedTouchdown = false;
      drone.hoverAltitude = 0.05;
      drone.status = 'Landing / Vertical Descent';
      appendDroneChatMessage(`🚁 ${drone.name}`, 'Initiating vertical descent directly to the floor. Ground optical flow tracking active for soft touchdown.');
    }
    return;
  }

  // 2. Take Off / Ascend
  if (cmd.includes('take off') || cmd.includes('takeoff') || cmd.includes('ascend') || cmd.includes('climb') || cmd.includes('launch')) {
    drone.isLanded = false;
    drone.isLanding = false;
    drone.isAscending = true;
    drone.hoverAltitude = 2.4;
    drone.target.y = 2.4;
    drone.status = 'Ascending to 2.4m';
    appendDroneChatMessage(`🚁 ${drone.name}`, 'Throttling quad-rotors to climb power! Ascending to 2.4m operational cruise ceiling.');
    return;
  }

  // 3. Station Flight Commands
  if (cmd.includes('test') || cmd.includes('calibration') || cmd.includes('table')) {
    dispatchDroneToStation('testing', labStations.testing);
    appendDroneChatMessage(`🚁 ${drone.name}`, 'Flight plan plotted to Station C: Testing Table. Banking towards target.');
    return;
  }
  if (cmd.includes('elect') || cmd.includes('pcb') || cmd.includes('solder') || cmd.includes('bench') || cmd.includes('circuit')) {
    dispatchDroneToStation('electronics', labStations.electronics);
    appendDroneChatMessage(`🚁 ${drone.name}`, 'Vectoring to Station B: Electronics Bench. Commencing aerial transit.');
    return;
  }
  if (cmd.includes('part') || cmd.includes('shelf') || cmd.includes('inventory') || cmd.includes('bin') || cmd.includes('hardware')) {
    dispatchDroneToStation('inventory', labStations.inventory);
    appendDroneChatMessage(`🚁 ${drone.name}`, 'Flight route locked: Station A: Parts Shelf. Accelerating to 1.35 m/s.');
    return;
  }
  if (cmd.includes('charg') || cmd.includes('dock') || cmd.includes('power pad')) {
    dispatchDroneToStation('charger', labStations.charger);
    appendDroneChatMessage(`🚁 ${drone.name}`, 'Navigating aerial vector to Station D: AMR Charger Dock.');
    return;
  }
  if (cmd.includes('heli') || cmd.includes('pad') || cmd.includes('home') || cmd.includes('rtl')) {
    dispatchDroneToStation('helipad', labStations.helipad);
    appendDroneChatMessage(`🚁 ${drone.name}`, 'Returning to Station E: Drone Helipad. Hovering AGL above the pad.');
    return;
  }

  // 3.5 Aerial Waypoint Commands
  if (cmd.includes('waypoint') || cmd.includes('flight path') || cmd.includes('flight route')) {
    if (cmd.includes('act') || cmd.includes('start') || cmd.includes('hide') || cmd.includes('follow') || cmd.includes('run')) {
      activateAndHideWaypoints(drone.id);
      return;
    } else if (cmd.includes('reset') || cmd.includes('default')) {
      resetWaypointsForRobot(drone.id);
      appendDroneChatMessage(`🚁 ${drone.name}`, 'Flight waypoints reset to default aerial surveillance perimeter.');
      return;
    } else {
      showAndEditWaypoints(drone.id);
      appendDroneChatMessage(`🚁 ${drone.name}`, 'Flight waypoints displayed in 3D! Drag markers, then click [Activate & Hide Waypoints] to engage aerial patrol.');
      return;
    }
  }

  // 4. Flight Maneuvers: Hover, Hold, Resume, Speed
  if (cmd.includes('hover') || cmd.includes('stop') || cmd.includes('hold') || cmd.includes('stay') || cmd.includes('pause')) {
    drone.isCustomMission = false;
    drone.speed = 0.0;
    drone.isLanding = false;
    drone.isAscending = false;
    drone.target.copy(drone.position);
    if (drone.isLanded) {
      drone.status = 'Landed / Touchdown';
      appendDroneChatMessage(`🚁 ${drone.name}`, 'Drone is safely landed on the floor with rotors disengaged.');
    } else {
      drone.status = 'Stationary Hover';
      appendDroneChatMessage(`🚁 ${drone.name}`, `Position hold engaged. Maintaining stationary hover at ${(drone.position.y).toFixed(2)}m AGL.`);
    }
    return;
  }
  if (cmd.includes('resume') || cmd.includes('continue') || cmd.includes('patrol')) {
    drone.isCustomMission = false;
    drone.isLanded = false;
    drone.isLanding = false;
    drone.isAscending = (drone.position.y < (drone.hoverAltitude || 2.2) - 0.2);
    drone.speed = 1.35;
    drone.status = drone.isAscending ? 'Ascending to Cruise' : 'In Flight / Surveillance';
    if (drone.waypoints && drone.waypoints.length > 0) {
      drone.waypointIdx = (drone.waypointIdx + 1) % drone.waypoints.length;
      drone.target.copy(drone.waypoints[drone.waypointIdx]);
    }
    appendDroneChatMessage(`🚁 ${drone.name}`, 'Resuming autonomous aerial surveillance patrol across campus airspace.');
    return;
  }
  if (cmd.includes('faster') || cmd.includes('speed up')) {
    drone.speed = Math.min(2.5, drone.speed + 0.35);
    appendDroneChatMessage(`🚁 ${drone.name}`, `Pitch forward angle increased. Cruise velocity: ${drone.speed.toFixed(2)} m/s.`);
    return;
  }
  if (cmd.includes('slower') || cmd.includes('slow down')) {
    drone.speed = Math.max(0.5, drone.speed - 0.3);
    appendDroneChatMessage(`🚁 ${drone.name}`, `Airspeed trimmed for close-range surveillance. Velocity: ${drone.speed.toFixed(2)} m/s.`);
    return;
  }

  // 3. Diagnostics & Status
  if (cmd.includes('status') || cmd.includes('health') || cmd.includes('report') || cmd.includes('diagnost') || cmd.includes('telemetry')) {
    const v = (14.0 + drone.battery * 0.028).toFixed(1);
    const alt = drone.mesh ? drone.mesh.position.y.toFixed(2) : (drone.hoverAltitude || 2.2).toFixed(2);
    appendDroneChatMessage(`🚁 ${drone.name}`, `${drone.id} Avionics Report:
• Altitude: ${alt}m AGL (${drone.status})
• 4S LiPo Battery: ${Math.round(drone.battery)}% (${v}V)
• Ground Speed: ${drone.speed.toFixed(2)} m/s
• Position: [X: ${drone.position.x.toFixed(2)}m, Z: ${drone.position.z.toFixed(2)}m]
• GNSS: RTK Fixed (19 Sats)
• Motors: 4x Brushless 100% Synced`);
    return;
  }

  // Fallback
  appendDroneChatMessage(`🚁 ${drone.name}`, `Flight command acknowledged: "${rawCmd}". Available directives: "Fly to Drone Helipad", "Fly to Testing Table", "Fly to Electronics Bench", "Fly to Parts Shelf", "Place waypoints", "Activate waypoints", "Hover", "Land", or "Resume patrol".`);
}

function setupDroneDashboardUI() {
  const closeBtn = document.getElementById('btn-close-drone-modal');
  if (closeBtn) closeBtn.addEventListener('click', closeDroneDashboard);

  const backdrop = document.getElementById('drone-dashboard-backdrop');
  if (backdrop) backdrop.addEventListener('click', closeDroneDashboard);

  const btnEditWp = document.getElementById('btn-drone-edit-waypoints');
  if (btnEditWp) btnEditWp.onclick = () => showAndEditWaypoints('UAV-01');

  const btnActWp = document.getElementById('btn-drone-activate-waypoints');
  if (btnActWp) btnActWp.onclick = () => activateAndHideWaypoints('UAV-01');

  const chipEditWp = document.getElementById('btn-chip-drone-edit-wp');
  if (chipEditWp) chipEditWp.onclick = () => showAndEditWaypoints('UAV-01');

  const chipActWp = document.getElementById('btn-chip-drone-act-wp');
  if (chipActWp) chipActWp.onclick = () => activateAndHideWaypoints('UAV-01');

  const chatForm = document.getElementById('drone-chat-form');
  const chatInput = document.getElementById('drone-chat-input');
  if (chatForm && chatInput) {
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = chatInput.value.trim();
      if (val) {
        executeDroneCommand(val);
        chatInput.value = '';
      }
    });
  }

  const handleDroneCockpitCam = (e) => {
    e.stopPropagation();
    e.preventDefault();
    closeDroneDashboard();
    selectedRobotId = 'UAV-01';
    const dispatchLabel = document.getElementById('dispatch-target-name');
    if (dispatchLabel) dispatchLabel.innerText = 'SkyWatcher Drone (UAV-01)';
    updateFleetCards();
    setCameraMode('fpv');
    setActiveToolBtn('btn-camera-fpv');
    setDroneManualFlight(true);
  };

  const btnCockpit = document.getElementById('btn-drone-cockpit-cam');
  if (btnCockpit) btnCockpit.onclick = handleDroneCockpitCam;

  const btnHeaderDrone = document.getElementById('btn-header-drone-cam');
  if (btnHeaderDrone) btnHeaderDrone.onclick = handleDroneCockpitCam;

  document.querySelectorAll('#drone-dashboard-modal .drone-cmd-btn:not(#btn-drone-cockpit-cam):not(#btn-chip-drone-edit-wp):not(#btn-chip-drone-act-wp)').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const cmd = btn.getAttribute('data-cmd') || btn.innerText;
      executeDroneCommand(cmd);
    });
  });
}

// Window exports
window.openDroneDashboard = openDroneDashboard;
window.closeDroneDashboard = closeDroneDashboard;
window.executeDroneCommand = executeDroneCommand;
window.dispatchDroneToStation = dispatchDroneToStation;

// ==========================================
// AUTONOMOUS AMR ROVER DASHBOARD & AI CHAT
// ==========================================

const roverChatHistories = {
  'AMR-01': [
    { sender: '🚜 Inspector Alpha', text: 'Inspector Alpha (AMR-01) online and SLAM localized! 360° LiDAR active, differential drive ready. Standing by for station dispatch.', time: 'Just now' }
  ],
  'AMR-02': [
    { sender: '🚜 Logistics Beta', text: 'Logistics Beta (AMR-02) initialized! High-payload chassis ready for warehouse and station transfer operations.', time: 'Just now' }
  ],
  'AMR-03': [
    { sender: '🚜 Courier Gamma', text: 'Courier Gamma (AMR-03) systems nominal! Navigation nodes mapped. Ready to receive waypoint directives.', time: 'Just now' }
  ],
  'AMR-04': [
    { sender: '🚜 Express Delta', text: 'Express Delta (AMR-04) online! Priority courier ready for rush parcel transit across campus.', time: 'Just now' }
  ],
  'AMR-05': [
    { sender: '🚜 Rover Epsilon', text: 'Rover Epsilon (AMR-05) initialized! High-stability chassis ready for cafeteria and campus services.', time: 'Just now' }
  ],
  'AMR-06': [
    { sender: '🚜 Security Zeta', text: 'Security Zeta (AMR-06) patrol systems operational! Autonomous perimeter perimeter security linked.', time: 'Just now' }
  ]
};

function updateRoverLidarUI() {
  const rover = robotDefs.find(r => r.id === activeRoverId);
  if (!rover) return;

  const isLidarOn = (rover.lidarActive !== false);

  const btnHdr = document.getElementById('btn-rover-toggle-lidar');
  if (btnHdr) {
    btnHdr.textContent = isLidarOn ? '📡 LiDAR: ON' : '📡 LiDAR: OFF';
    btnHdr.style.background = isLidarOn ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)';
    btnHdr.style.borderColor = isLidarOn ? '#4ade80' : '#ef4444';
    btnHdr.style.color = isLidarOn ? '#4ade80' : '#ef4444';
    btnHdr.title = isLidarOn ? `360° LiDAR Active for ${rover.id} (Click to Turn OFF)` : `360° LiDAR Disabled for ${rover.id} (Click to Turn ON)`;
  }

  const btnSec = document.getElementById('btn-rover-toggle-lidar-sec');
  if (btnSec) {
    btnSec.textContent = isLidarOn ? '📡 LiDAR: ON' : '📡 LiDAR: OFF';
    btnSec.style.background = isLidarOn ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)';
    btnSec.style.borderColor = isLidarOn ? '#4ade80' : '#ef4444';
    btnSec.style.color = isLidarOn ? '#4ade80' : '#ef4444';
    btnSec.title = isLidarOn ? `Click to Disable LiDAR for ${rover.id}` : `Click to Enable LiDAR for ${rover.id}`;
  }

  const beamsEl = document.getElementById('rover-stat-lidar-beams-state');
  if (beamsEl) {
    beamsEl.textContent = isLidarOn ? '● 28 Beams Active' : '○ Disabled (Off)';
    beamsEl.style.color = isLidarOn ? '#4ade80' : '#ef4444';
  }

  const rpmEl = document.getElementById('rover-stat-lidar-rpm');
  if (rpmEl) {
    rpmEl.textContent = isLidarOn ? '● Active (12 rad/s)' : '○ Standby (0 rad/s)';
    rpmEl.style.color = isLidarOn ? '#4ade80' : '#94a3b8';
  }
}

function toggleRoverLidar(roverId) {
  const targetId = roverId || activeRoverId || 'AMR-01';
  const rover = robotDefs.find(r => r.id === targetId);
  if (!rover) return;

  rover.lidarActive = (rover.lidarActive === false) ? true : false;
  updateRoverLidarUI();

  const stateStr = rover.lidarActive ? 'ONLINE (ACTIVE)' : 'OFFLINE (STANDBY)';
  appendRoverChatMessage(
    targetId,
    `🚜 ${rover.name}`,
    `360° Safety LiDAR scanner has been switched ${stateStr}. ${rover.lidarActive ? 'Obstacle avoidance laser rays emitting.' : 'LiDAR lasers disabled for this unit.'}`
  );
}

function openRoverDashboard(roverId) {
  try {
    if (roverId && typeof roverId === 'string' && roverId.startsWith('AMR-')) {
      activeRoverId = roverId;
    } else if (!activeRoverId || !activeRoverId.startsWith('AMR-')) {
      activeRoverId = 'AMR-01';
    }
    selectedRobotId = activeRoverId;

    const modal = document.getElementById('rover-dashboard-modal');
    if (!modal) {
      console.error('[Digital Twin] rover-dashboard-modal not found!');
      return;
    }

    if (typeof closeG1Dashboard === 'function') closeG1Dashboard();
    if (typeof closeDroneDashboard === 'function') closeDroneDashboard();

    const rover = robotDefs.find(r => r.id === activeRoverId) || robotDefs[0];
    if (rover) {
      const titleEl = document.getElementById('rover-header-title');
      const idEl = document.getElementById('rover-header-id');
      const chatHeaderTitle = document.getElementById('rover-chat-header-title');
      const windowEl = document.getElementById('rover-window-el');
      const avatarEl = document.getElementById('rover-header-avatar');

      if (titleEl) titleEl.textContent = rover.name;
      if (idEl) idEl.textContent = rover.id;
      if (chatHeaderTitle) chatHeaderTitle.textContent = `🚜 ${rover.name} (${rover.id})`;

      const hexColor = '#' + rover.color.toString(16).padStart(6, '0');
      if (windowEl) {
        windowEl.style.borderColor = hexColor;
        windowEl.style.boxShadow = `0 25px 60px -15px rgba(0, 0, 0, 0.8), 0 0 35px ${hexColor}40`;
      }
      if (avatarEl) {
        avatarEl.style.borderColor = hexColor;
        avatarEl.style.color = hexColor;
      }

      try { renderRoverChatStream(); } catch (_) {}

      // Highlight active rover switcher pill
      document.querySelectorAll('.rover-pill-btn').forEach(pill => {
        if (pill.getAttribute('data-rover') === activeRoverId) {
          pill.classList.add('active');
        } else {
          pill.classList.remove('active');
        }
      });

      try { updateRoverLidarUI(); } catch (_) {}
    }

    modal.style.display = 'flex';
    modal.style.zIndex = '9999';
    try { updateRoverLidarUI(); } catch (_) {}
    try { updateRoverDashboardTelemetry(); } catch (_) {}
    try { updateWaypointCountsUI(); } catch (_) {}
    const input = document.getElementById('rover-chat-input');
    if (input) setTimeout(() => input.focus(), 80);
  } catch (err) {
    console.error('[Digital Twin] Error in openRoverDashboard:', err);
  }
}

function closeRoverDashboard() {
  const modal = document.getElementById('rover-dashboard-modal');
  if (!modal) return;
  modal.style.display = 'none';
}

function renderRoverChatStream() {
  const stream = document.getElementById('rover-chat-stream');
  if (!stream) return;
  stream.innerHTML = '';
  const history = roverChatHistories[activeRoverId] || [];
  history.forEach(msg => {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${msg.isUser ? 'user-bubble' : 'rover-bubble'}`;
    bubble.innerHTML = `
      <div class="bubble-sender">${msg.sender}</div>
      <div class="bubble-text">${msg.text}</div>
      <div class="bubble-time">${msg.time}</div>
    `;
    stream.appendChild(bubble);
  });
  stream.scrollTop = stream.scrollHeight;
}

function appendRoverChatMessage(roverId, sender, text, isUser = false) {
  if (!roverChatHistories[roverId]) roverChatHistories[roverId] = [];
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  roverChatHistories[roverId].push({ sender, text, time: timeStr, isUser });

  if (activeRoverId === roverId) {
    const stream = document.getElementById('rover-chat-stream');
    if (stream) {
      const bubble = document.createElement('div');
      bubble.className = `chat-bubble ${isUser ? 'user-bubble' : 'rover-bubble'}`;
      bubble.innerHTML = `
        <div class="bubble-sender">${sender}</div>
        <div class="bubble-text">${text}</div>
        <div class="bubble-time">${timeStr}</div>
      `;
      stream.appendChild(bubble);
      stream.scrollTop = stream.scrollHeight;
    }
  }
}

function updateRoverDashboardTelemetry() {
  const modal = document.getElementById('rover-dashboard-modal');
  if (!modal || modal.style.display === 'none') return;

  const rover = robotDefs.find(r => r.id === activeRoverId);
  if (!rover) return;

  // 1. Drivetrain & Differential Wheels
  const spdElem = document.getElementById('rover-stat-speed');
  const stateElem = document.getElementById('rover-stat-state');
  const wheelsElem = document.getElementById('rover-stat-wheels');
  const coordsElem = document.getElementById('rover-stat-coords');
  const headingElem = document.getElementById('rover-stat-heading');
  const odoElem = document.getElementById('rover-stat-odometer');

  if (spdElem) spdElem.textContent = `${rover.speed.toFixed(2)} m/s`;
  if (stateElem) stateElem.textContent = rover.status;

  const wheelRadius = robotBody('amr').wheelRadius;
  const baseRPM = rover.speed > 0.05 ? Math.round((rover.speed / (2 * Math.PI * wheelRadius)) * 60) : 0;
  if (wheelsElem) wheelsElem.textContent = `L: ${baseRPM} | R: ${baseRPM}`;
  if (coordsElem) coordsElem.textContent = `${rover.position.x.toFixed(2)}m, ${rover.position.z.toFixed(2)}m`;
  if (headingElem) {
    const deg = Math.round((rover.heading * 180 / Math.PI) % 360);
    headingElem.textContent = `Heading: ${deg}°`;
  }
  rover.odometer = (rover.odometer || 18.5) + (rover.speed * 0.005);
  if (odoElem) odoElem.textContent = `${rover.odometer.toFixed(1)} m`;

  // 2. Battery & Power
  const batVal = Math.round(rover.battery);
  const batElem = document.getElementById('rover-stat-battery');
  const barElem = document.getElementById('rover-battery-bar');
  const voltElem = document.getElementById('rover-stat-voltage');
  const chargeStateElem = document.getElementById('rover-stat-charge-state');
  const curElem = document.getElementById('rover-stat-current');
  const pwrElem = document.getElementById('rover-stat-power');
  const runElem = document.getElementById('rover-stat-runtime');

  if (batElem) batElem.textContent = `${batVal}%`;
  if (barElem) {
    barElem.style.width = `${batVal}%`;
    barElem.style.background = '#' + rover.color.toString(16).padStart(6, '0');
  }
  const volts = (24.0 + batVal * 0.048).toFixed(1);
  if (voltElem) voltElem.textContent = `${volts} V`;

  const isCharging = rover.status.includes('Charging') || rover.status.includes('Docked');
  if (chargeStateElem) {
    chargeStateElem.textContent = isCharging ? '⚡ Inductive Recharging' : (rover.speed > 0.1 ? 'Active Transit' : 'Standby / Idle');
    chargeStateElem.style.color = isCharging ? '#facc15' : '#4ade80';
  }
  const amps = isCharging ? '-6.5 A (Charge)' : (rover.speed > 0.1 ? (4.2 + rover.speed * 1.5).toFixed(1) + ' A' : '0.8 A');
  if (curElem) curElem.textContent = amps;
  const watts = isCharging ? '170 W (In)' : (rover.speed > 0.1 ? (parseFloat(volts) * (4.2 + rover.speed * 1.5)).toFixed(0) + ' W' : '20 W');
  if (pwrElem) pwrElem.textContent = watts;
  if (runElem) {
    const hours = (batVal * 0.075).toFixed(1);
    runElem.textContent = `${hours} hrs`;
  }

  // 3. 360° LiDAR & Safety Field
  const warnEl = document.getElementById('rover-stat-safety-warn');
  const stopEl = document.getElementById('rover-stat-safety-stop');
  if (warnEl || stopEl) {
    const fwdDist = (rover.forwardLidarDist !== undefined) ? rover.forwardLidarDist : 2.5;

    if (warnEl) {
      if (rover.isDetouring) {
        warnEl.textContent = '⚡ AI A* Detour Active';
        warnEl.style.color = '#38bdf8';
      } else if (fwdDist < 1.0) {
        warnEl.textContent = `● Warning Zone (${fwdDist.toFixed(2)}m)`;
        warnEl.style.color = '#f59e0b';
      } else {
        warnEl.textContent = `● Clear (${fwdDist.toFixed(2)}m)`;
        warnEl.style.color = '#4ade80';
      }
    }
    if (stopEl) {
      if (rover.isDetouring) {
        stopEl.textContent = '● Avoidance Engaged';
        stopEl.style.color = '#38bdf8';
      } else if (fwdDist < 0.55) {
        stopEl.textContent = '🛑 Emergency Buffer Active';
        stopEl.style.color = '#ef4444';
      } else {
        stopEl.textContent = '● Clear Barrier (100% Shield)';
        stopEl.style.color = '#4ade80';
      }
    }
  }
}

function dispatchRoverToStation(rover, stationKey, station) {
  if (!rover) return;

  let targetX = station.pos.x;
  let targetZ = station.pos.z;
  const isDock = stationKey.startsWith('dock') || station.name.includes('Dock') || station.name.includes('Bay') || stationKey === 'charger';
  if (!isDock && isTargetBlocked(targetX, targetZ)) {
    const safe = findNearestSafePoint(targetX, targetZ);
    targetX = safe.x;
    targetZ = safe.z;
  }

  rover.target.set(targetX, 0.05, targetZ);
  rover.speed = 0.85;
  rover.isCustomMission = true;
  rover.hasArrivedMission = false;
  rover.missionStationKey = stationKey;
  rover.missionStationName = station.name;
  rover.plannedLegKey = null;
  if (rover.type === 'amr' || rover.type === 'humanoid') {
    planWaypointLeg(rover);
  }
  const shortName = station.name.includes(':') ? station.name.split(':')[1].trim() : station.name;
  rover.status = `En Route: ${shortName}`;
}

function executeRoverCommand(rawCmd) {
  if (!rawCmd || !rawCmd.trim()) return;
  const rover = robotDefs.find(r => r.id === activeRoverId);
  if (!rover) return;

  appendRoverChatMessage(activeRoverId, '👤 Fleet Operator', rawCmd, true);
  const cmd = rawCmd.toLowerCase().trim();

  // 1. Station Navigation Commands
  if (cmd.includes('test') || cmd.includes('calibration') || cmd.includes('table')) {
    dispatchRoverToStation(rover, 'testing', labStations.testing);
    appendRoverChatMessage(activeRoverId, `🚜 ${rover.name}`, `Nav2 trajectory calculated to Station C: Testing Table. Engaging differential drive motors.`);
    return;
  }
  if (cmd.includes('elect') || cmd.includes('pcb') || cmd.includes('solder') || cmd.includes('bench') || cmd.includes('circuit')) {
    dispatchRoverToStation(rover, 'electronics', labStations.electronics);
    appendRoverChatMessage(activeRoverId, `🚜 ${rover.name}`, `En route to Station B: Electronics Bench. LiDAR obstacle clearance scanning active.`);
    return;
  }
  if (cmd.includes('part') || cmd.includes('shelf') || cmd.includes('inventory') || cmd.includes('bin') || cmd.includes('hardware')) {
    dispatchRoverToStation(rover, 'inventory', labStations.inventory);
    appendRoverChatMessage(activeRoverId, `🚜 ${rover.name}`, `Routing to Station A: Parts Shelf for inventory transfer.`);
    return;
  }
  if (cmd.includes('home') || cmd.includes('my dock') || cmd.includes('bay')) {
    const dockKey = rover.homeDockKey || ('dock' + (parseInt(rover.id.split('-')[1]) || 1));
    const dockStation = labStations[dockKey] || labStations.charger;
    dispatchSelectedRobot(dockStation.pos, dockStation.name, rover.id);
    appendRoverChatMessage(activeRoverId, `🚜 ${rover.name}`, `Routing directly to assigned ${dockStation.name}.`);
    return;
  }
  if (cmd.includes('charg') || cmd.includes('dock') || cmd.includes('power pad') || cmd.includes('recharge')) {
    dispatchRoverToStation(rover, 'charger', labStations.charger);
    appendRoverChatMessage(activeRoverId, `🚜 ${rover.name}`, `Returning to Station D: AMR Charger Dock. Will engage automatic inductive charging pad upon arrival.`);
    return;
  }
  if (cmd.includes('heli') || cmd.includes('drone') || cmd.includes('uav') || cmd.includes('skywatcher')) {
    dispatchRoverToStation(rover, 'helipad', labStations.helipad);
    appendRoverChatMessage(activeRoverId, `🚜 ${rover.name}`, `Navigating to Station E: Drone Helipad to rendezvous with SkyWatcher UAV.`);
    return;
  }

  // 1.5 AMR Waypoint Patrol Commands
  if (cmd.includes('waypoint') || cmd.includes('route') || cmd.includes('circuit')) {
    if (cmd.includes('act') || cmd.includes('start') || cmd.includes('hide') || cmd.includes('follow') || cmd.includes('run')) {
      activateAndHideWaypoints(activeRoverId);
      return;
    } else if (cmd.includes('reset') || cmd.includes('default')) {
      resetWaypointsForRobot(activeRoverId);
      appendRoverChatMessage(activeRoverId, `🚜 ${rover.name}`, 'Waypoints reset to default laboratory circuit.');
      return;
    } else {
      showAndEditWaypoints(activeRoverId);
      appendRoverChatMessage(activeRoverId, `🚜 ${rover.name}`, 'SLAM waypoints displayed in 3D! Drag nodes on the floor, then click [Activate & Hide Waypoints] to commence autonomous patrol.');
      return;
    }
  }

  // 2. Movement Directives
  if (cmd.includes('stop') || cmd.includes('halt') || cmd.includes('e-stop') || cmd.includes('pause') || cmd.includes('stay') || cmd.includes('freeze')) {
    rover.isCustomMission = false;
    rover.speed = 0.0;
    rover.target.copy(rover.position);
    rover.status = 'Standing Idle';
    appendRoverChatMessage(activeRoverId, `🚜 ${rover.name}`, `E-Stop / Hold executed. Differential brakes engaged. Standing by.`);
    return;
  }
  if (cmd.includes('resume') || cmd.includes('continue') || cmd.includes('patrol')) {
    rover.isCustomMission = false;
    rover.speed = 0.85;
    rover.status = 'Patrolling';
    if (rover.waypoints && rover.waypoints.length > 0) {
      rover.waypointIdx = (rover.waypointIdx + 1) % rover.waypoints.length;
      rover.target.copy(rover.waypoints[rover.waypointIdx]);
    }
    appendRoverChatMessage(activeRoverId, `🚜 ${rover.name}`, `Resuming standard patrol routine across laboratory zones.`);
    return;
  }
  if (cmd.includes('faster') || cmd.includes('speed up')) {
    rover.speed = Math.min(1.5, rover.speed + 0.3);
    appendRoverChatMessage(activeRoverId, `🚜 ${rover.name}`, `Wheel RPM throttled up! Drive velocity: ${rover.speed.toFixed(2)} m/s.`);
    return;
  }
  if (cmd.includes('slower') || cmd.includes('slow down')) {
    rover.speed = Math.max(0.3, rover.speed - 0.25);
    appendRoverChatMessage(activeRoverId, `🚜 ${rover.name}`, `Paced down for high-precision indoor maneuvers. Velocity: ${rover.speed.toFixed(2)} m/s.`);
    return;
  }

  // 2.5 LiDAR Toggle Commands
  if (cmd.includes('lidar on') || cmd.includes('enable lidar') || cmd.includes('start lidar')) {
    rover.lidarActive = true;
    updateRoverLidarUI();
    appendRoverChatMessage(activeRoverId, `🚜 ${rover.name}`, `360° Safety LiDAR scanner activated! 28 laser scan beams emitting.`);
    return;
  }
  if (cmd.includes('lidar off') || cmd.includes('disable lidar') || cmd.includes('stop lidar')) {
    rover.lidarActive = false;
    updateRoverLidarUI();
    appendRoverChatMessage(activeRoverId, `🚜 ${rover.name}`, `360° Safety LiDAR scanner disabled.`);
    return;
  }
  if (cmd.includes('toggle lidar')) {
    toggleRoverLidar(activeRoverId);
    return;
  }

  // 3. Diagnostics & Status
  if (cmd.includes('status') || cmd.includes('health') || cmd.includes('report') || cmd.includes('diagnost') || cmd.includes('telemetry')) {
    const v = (24.0 + rover.battery * 0.048).toFixed(1);
    appendRoverChatMessage(activeRoverId, `🚜 ${rover.name}`, `AMR Telemetry Diagnostics:
• Battery: ${Math.round(rover.battery)}% (${v}V LiFePO4)
• Status: ${rover.status}
• Ground Speed: ${rover.speed.toFixed(2)} m/s
• Position: [X: ${rover.position.x.toFixed(2)}m, Z: ${rover.position.z.toFixed(2)}m]
• 360° LiDAR: 12 rad/s Active
• Odometer: ${(rover.odometer || 18.5).toFixed(1)}m Traveled`);
    return;
  }

  // Fallback
  appendRoverChatMessage(activeRoverId, `🚜 ${rover.name}`, `Directive received: "${rawCmd}". Available station targets: "Go to Testing Table", "Go to Electronics Bench", "Go to Parts Shelf", "Go to Charger Dock", "Go to Drone Helipad", "Place waypoints", "Activate waypoints", "Halt", "Resume patrol", or "Report status".`);
}

function setupRoverDashboardUI() {
  const closeBtn = document.getElementById('btn-close-rover-modal');
  if (closeBtn) closeBtn.addEventListener('click', closeRoverDashboard);

  const backdrop = document.getElementById('rover-dashboard-backdrop');
  if (backdrop) backdrop.addEventListener('click', closeRoverDashboard);

  const btnEditWp = document.getElementById('btn-rover-edit-waypoints');
  if (btnEditWp) btnEditWp.onclick = () => showAndEditWaypoints(activeRoverId);

  const btnActWp = document.getElementById('btn-rover-activate-waypoints');
  if (btnActWp) btnActWp.onclick = () => activateAndHideWaypoints(activeRoverId);

  const chipEditWp = document.getElementById('btn-chip-rover-edit-wp');
  if (chipEditWp) chipEditWp.onclick = () => showAndEditWaypoints(activeRoverId);

  const chipActWp = document.getElementById('btn-chip-rover-act-wp');
  if (chipActWp) chipActWp.onclick = () => activateAndHideWaypoints(activeRoverId);

  const chatForm = document.getElementById('rover-chat-form');
  const chatInput = document.getElementById('rover-chat-input');
  const sendBtn = document.getElementById('btn-send-rover-cmd');

  const sendRoverMsg = () => {
    if (!chatInput) return;
    const val = chatInput.value.trim();
    if (val) {
      executeRoverCommand(val);
      chatInput.value = '';
    }
  };

  if (chatForm) {
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      sendRoverMsg();
    });
  }
  if (sendBtn) {
    sendBtn.addEventListener('click', (e) => {
      e.preventDefault();
      sendRoverMsg();
    });
  }

  const handleRoverCockpitCam = (e) => {
    e.stopPropagation();
    e.preventDefault();
    closeRoverDashboard();
    selectedRobotId = activeRoverId || 'AMR-01';
    const rObj = robotDefs.find(r => r.id === selectedRobotId);
    const dispatchLabel = document.getElementById('dispatch-target-name');
    if (dispatchLabel && rObj) dispatchLabel.innerText = `${rObj.name} (${rObj.id})`;
    updateFleetCards();
    setCameraMode('fpv');
    setActiveToolBtn('btn-camera-fpv');
    setAmrManualDrive(selectedRobotId, true);
  };

  const btnCockpitRover = document.getElementById('btn-rover-cockpit-cam');
  if (btnCockpitRover) btnCockpitRover.onclick = handleRoverCockpitCam;

  const btnHeaderRover = document.getElementById('btn-header-rover-cam');
  if (btnHeaderRover) btnHeaderRover.onclick = handleRoverCockpitCam;

  document.querySelectorAll('#rover-dashboard-modal .rover-cmd-btn:not(#btn-rover-cockpit-cam):not(#btn-chip-rover-edit-wp):not(#btn-chip-rover-act-wp)').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const cmd = btn.getAttribute('data-cmd') || btn.innerText;
      executeRoverCommand(cmd);
    });
  });

  const btnToggleLidar = document.getElementById('btn-rover-toggle-lidar');
  if (btnToggleLidar) {
    btnToggleLidar.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      toggleRoverLidar(activeRoverId);
    };
  }

  const btnToggleLidarSec = document.getElementById('btn-rover-toggle-lidar-sec');
  if (btnToggleLidarSec) {
    btnToggleLidarSec.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      toggleRoverLidar(activeRoverId);
    };
  }

  document.querySelectorAll('.rover-pill-btn').forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.preventDefault();
      const rid = pill.getAttribute('data-rover');
      if (rid) openRoverDashboard(rid);
    });
  });

  const btnOpenModalTop = document.getElementById('btn-open-rover-modal-top');
  if (btnOpenModalTop) {
    btnOpenModalTop.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      openRoverDashboard(activeRoverId || selectedRobotId || 'AMR-01');
    };
  }

  const btnOpenSidebarHdr = document.getElementById('btn-open-rover-sidebar-hdr');
  if (btnOpenSidebarHdr) {
    btnOpenSidebarHdr.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      openRoverDashboard(activeRoverId || selectedRobotId || 'AMR-01');
    };
  }

  const dispatchBanner = document.querySelector('.dispatch-banner');
  if (dispatchBanner) {
    dispatchBanner.style.cursor = 'pointer';
    dispatchBanner.onclick = (e) => {
      e.stopPropagation();
      const target = (selectedRobotId && selectedRobotId.startsWith('AMR-')) ? selectedRobotId : (activeRoverId || 'AMR-01');
      openRoverDashboard(target);
    };
  }
}

// Window exports
window.openRoverDashboard = openRoverDashboard;
window.closeRoverDashboard = closeRoverDashboard;
window.executeRoverCommand = executeRoverCommand;
window.dispatchRoverToStation = dispatchRoverToStation;
window.toggleRoverLidar = toggleRoverLidar;
window.updateRoverLidarUI = updateRoverLidarUI;

window.showAndEditWaypoints = showAndEditWaypoints;
window.activateAndHideWaypoints = activateAndHideWaypoints;
window.addWaypointForRobot = addWaypointForRobot;
window.resetWaypointsForRobot = resetWaypointsForRobot;

window.saveCustomStationPositions = saveCustomStationPositions;
window.resetStationPositions = resetStationPositions;
window.labStations = labStations;
window.enterObserverMode = enterObserverMode;
window.cycleObserverRobot = cycleObserverRobot;

// ==========================================
// AI & ML FLEET PLANNER: A* SEARCH & CSP ENGINE
// ==========================================

function setupAIPlannerUI() {
  if (!astarRibbonGroup) {
    astarRibbonGroup = new THREE.Group();
    astarRibbonGroup.name = 'astarRibbons';
    scene.add(astarRibbonGroup);
  }
  applyRibbonSetting();

  const btnOpen = document.getElementById('btn-open-ai-planner');
  const btnClose = document.getElementById('btn-close-ai-planner');
  const backdrop = document.getElementById('ai-planner-backdrop');
  const modal = document.getElementById('ai-planner-modal');

  const openModal = () => {
    if (modal) modal.style.display = 'flex';
    if (!cachedScheduleData) {
      recalculateFleetSchedule();
    }
  };

  const closeModal = () => {
    if (modal) modal.style.display = 'none';
  };

  if (btnOpen) btnOpen.onclick = openModal;
  if (btnClose) btnClose.onclick = closeModal;
  if (backdrop) backdrop.onclick = closeModal;

  // Weather selector chips
  document.querySelectorAll('.weather-chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.weather-chip-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentAIWeather = btn.getAttribute('data-weather') || 'Clear';
      recalculateFleetSchedule();
    });
  });

  // Pedestrian Traffic Slider
  const sliderTraffic = document.getElementById('ai-slider-traffic');
  const lblTraffic = document.getElementById('ai-traffic-val');
  if (sliderTraffic) {
    sliderTraffic.addEventListener('input', (e) => {
      currentAITraffic = parseFloat(e.target.value);
      let desc = 'Low';
      if (currentAITraffic > 0.35) desc = 'Moderate';
      if (currentAITraffic > 0.70) desc = 'High Congestion';
      if (lblTraffic) lblTraffic.textContent = `${currentAITraffic.toFixed(2)} (${desc})`;
      debouncedRecalculate();
    });
  }

  // Payload Slider
  const sliderPayload = document.getElementById('ai-slider-payload');
  const lblPayload = document.getElementById('ai-payload-val');
  if (sliderPayload) {
    sliderPayload.addEventListener('input', (e) => {
      currentAIPayload = parseFloat(e.target.value);
      if (lblPayload) lblPayload.textContent = `${currentAIPayload.toFixed(1)} kg`;
      debouncedRecalculate();
    });
  }

  // Recalculate Button
  const btnRecalc = document.getElementById('btn-recalc-schedule');
  if (btnRecalc) {
    btnRecalc.onclick = () => recalculateFleetSchedule();
  }

  // Ribbon Toggle Button
  const btnRibbonToggle = document.getElementById('btn-toggle-astar-ribbons');
  if (btnRibbonToggle) {
    btnRibbonToggle.onclick = () => {
      try {
        localStorage.setItem(ribbonsKey(activeScan), ribbonsVisible(activeScan, readStorage) ? 'off' : 'on');
      } catch (e) { }
      applyRibbonSetting();
    };
  }

  // Execute Master Schedule Button
  const btnExec = document.getElementById('btn-execute-schedule');
  if (btnExec) {
    btnExec.onclick = executeMasterSchedule;
  }
}

// The AI planner's schedule was planned for one scan's boxes and bounds: after the scan, its zones
// or its boundary change, plan again in the background, so the table, ETAs, ribbons and Execute
// always match what is on screen.
function invalidateFleetSchedule() {
  cachedScheduleData = null;
  debouncedRecalculate();
}

// Whether the 3D A* ribbons are shown is set per scan (on unless turned off there); the button
// always says what is shown.
function applyRibbonSetting() {
  const on = ribbonsVisible(activeScan, readStorage);
  if (astarRibbonGroup) astarRibbonGroup.visible = on;
  const btn = document.getElementById('btn-toggle-astar-ribbons');
  if (btn) {
    btn.classList.toggle('active', on);
    btn.textContent = on ? '📍 3D A* Ribbons: ON' : '📍 3D A* Ribbons: OFF';
  }
}

function clearAStarRibbons() {
  if (!astarRibbonGroup) return;
  while (astarRibbonGroup.children.length > 0) {
    const child = astarRibbonGroup.children[0];
    if (child.geometry) child.geometry.dispose();
    if (child.material) child.material.dispose();
    astarRibbonGroup.remove(child);
  }
}

// Only the latest schedule request is shown: an answer for an earlier scan or zone layout that
// arrives late is dropped.
let scheduleRequestSeq = 0;

let debounceTimer = null;
function debouncedRecalculate() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    recalculateFleetSchedule();
  }, 250);
}

async function recalculateFleetSchedule() {
  const seq = ++scheduleRequestSeq;
  try {
    const res = await fetch('/api/schedule/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        weather_condition: currentAIWeather,
        pedestrian_traffic_index: currentAITraffic,
        payload_weight_kg: currentAIPayload,
        bounds: getEnvironmentLimits(),
        // The same clearance from boxes and walls as the robots' own planner, for this scan's size.
        clearance: localAStar.safetyMargin,
        // Plan for this scan: its furniture as edited here (empty if all of it was deleted), and the
        // zones drawn on it.
        scan: activeScan,
        // Rotation, exact building polygons, and sidewalk networks included:
        furniture: obstacleBoxes.filter(b => !b.userCreated)
          .map(b => ({
            name: b.name, minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, rotY: b.rotY || 0,
            pts: b.pts, isWalkwayNetwork: b.isWalkwayNetwork, polylines: b.polylines, width: b.width,
            permanentSolid: b.permanentSolid, hardcoded: b.hardcoded
          })),
        dynamicObstacles: obstacleBoxes.filter(b => b.userCreated)
          .map(b => ({ name: b.name, minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, rotY: b.rotY || 0 }))
      })
    });

    if (!res.ok) throw new Error('Schedule API error: ' + res.statusText);
    const data = await res.json();
    if (seq !== scheduleRequestSeq) return; // a newer request is on its way
    cachedScheduleData = data;

    // Update CSP diagnostics banner
    const elConflicts = document.getElementById('csp-conflicts-val');
    const elBacktracks = document.getElementById('csp-backtracks-val');
    const elTime = document.getElementById('csp-time-val');
    if (elConflicts) elConflicts.textContent = '0';
    if (elBacktracks && data.stats) elBacktracks.textContent = data.stats.backtracks;
    if (elTime && data.stats) elTime.textContent = `${data.stats.solveTimeMs} ms`;

    // Update ML prediction display (first job as representative exemplar)
    if (data.masterSchedule && data.masterSchedule.length > 0) {
      const exemplar = data.masterSchedule[0];
      const pred = exemplar.ml_prediction;
      if (!pred && exemplar.route_status === 'no_route') {
        const elPredTime = document.getElementById('ai-pred-time');
        const elPredEnergy = document.getElementById('ai-pred-energy');
        const elNominal = document.getElementById('ai-nominal-compare');
        if (elPredTime) elPredTime.textContent = 'no route';
        if (elPredEnergy) elPredEnergy.textContent = '--';
        if (elNominal) elNominal.textContent = `${exemplar.start_station} ➔ ${exemplar.goal_station} is blocked`;
        const xaiContainer = document.getElementById('ai-xai-breakdown');
        if (xaiContainer) xaiContainer.innerHTML = '';
      }
      if (pred) {
        const elPredTime = document.getElementById('ai-pred-time');
        const elPredEnergy = document.getElementById('ai-pred-energy');
        const elNominal = document.getElementById('ai-nominal-compare');

        if (elPredTime) elPredTime.textContent = `${pred.predicted_delivery_time_min} min`;
        if (elPredEnergy) elPredEnergy.textContent = `${pred.predicted_energy_wh} Wh`;
        if (elNominal) {
          const delta = (pred.predicted_delivery_time_min - 8.22).toFixed(1);
          const sign = delta >= 0 ? `+${delta}` : delta;
          elNominal.textContent = `vs 8.22 min nominal (${sign}m buffer)`;
        }

        // Render Explainable AI (XAI) feature attribution breakdown
        const xai = pred.feature_contributions;
        const xaiContainer = document.getElementById('ai-xai-breakdown');
        if (xaiContainer && xai) {
          xaiContainer.innerHTML = `
            <div class="xai-bar-row">
              <span style="width: 130px;">A* Path Length:</span>
              <div class="xai-bar-track"><div class="xai-bar-fill" style="width: ${Math.min(100, Math.max(10, Math.abs(xai.path_length_delta_min) * 10))}%; background: #38bdf8;"></div></div>
              <span style="color: #38bdf8; font-weight: 700; width: 45px; text-align: right;">+${xai.path_length_delta_min}m</span>
            </div>
            <div class="xai-bar-row">
              <span style="width: 130px;">Weather Friction:</span>
              <div class="xai-bar-track"><div class="xai-bar-fill" style="width: ${Math.min(100, Math.max(5, Math.abs(xai.weather_delta_min) * 14))}%; background: #f87171;"></div></div>
              <span style="color: #f87171; font-weight: 700; width: 45px; text-align: right;">+${xai.weather_delta_min}m</span>
            </div>
            <div class="xai-bar-row">
              <span style="width: 130px;">Pedestrian Crowd:</span>
              <div class="xai-bar-track"><div class="xai-bar-fill" style="width: ${Math.min(100, Math.max(5, Math.abs(xai.pedestrian_traffic_delta_min) * 18))}%; background: #f59e0b;"></div></div>
              <span style="color: #fbbf24; font-weight: 700; width: 45px; text-align: right;">+${xai.pedestrian_traffic_delta_min}m</span>
            </div>
            <div class="xai-bar-row">
              <span style="width: 130px;">Cornering Turns:</span>
              <div class="xai-bar-track"><div class="xai-bar-fill" style="width: ${Math.min(100, Math.max(5, Math.abs(xai.turns_cornering_delta_min) * 22))}%; background: #a78bfa;"></div></div>
              <span style="color: #c084fc; font-weight: 700; width: 45px; text-align: right;">+${xai.turns_cornering_delta_min}m</span>
            </div>
            <div class="xai-bar-row">
              <span style="width: 130px;">Vehicle Efficiency:</span>
              <div class="xai-bar-track"><div class="xai-bar-fill" style="width: ${Math.min(100, Math.max(5, Math.abs(xai.vehicle_efficiency_delta_min) * 22))}%; background: #4ade80;"></div></div>
              <span style="color: #4ade80; font-weight: 700; width: 45px; text-align: right;">${xai.vehicle_efficiency_delta_min}m</span>
            </div>
          `;
        }
      }
    }

    // Populate Master CSP Timetable
    const tbody = document.getElementById('csp-schedule-tbody');
    if (tbody && data.masterSchedule) {
      tbody.innerHTML = '';
      data.masterSchedule.forEach((item, idx) => {
        const route = data.jobRoutes ? data.jobRoutes[item.job_id] : null;
        const noRoute = item.route_status === 'no_route';
        const steps = route ? route.astar_path_len : '--';
        const turns = route ? route.num_turns : '--';
        const transitMin = noRoute ? 'no route' : (item.ml_prediction ? `${item.ml_prediction.predicted_delivery_time_min}m` : '--');
        
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
        if (idx === 0) tr.className = 'csp-row-highlight';

        tr.innerHTML = `
          <td style="padding: 10px; font-weight: 700; color: #38bdf8;">${item.time_slot} - ${item.end_time_slot}</td>
          <td style="padding: 10px;">
            <b style="color: #ffffff;">${item.job_id}</b><br>
            <span style="color: #94a3b8; font-size: 11px;">${item.cargo} (${item.payload_weight_kg} kg)</span>
          </td>
          <td style="padding: 10px;"><span style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; padding: 2px 8px; border-radius: 4px; font-weight: 700;">${item.robot_id}</span></td>
          <td style="padding: 10px; color: #cbd5e1;">${item.start_station} ➔ ${item.goal_station}</td>
          <td style="padding: 10px; color: #f59e0b;">${noRoute ? '<b style="color: #f87171;">no route</b>' : `<b>${steps}</b> steps / <b>${turns}</b> turns`}</td>
          <td style="padding: 10px; color: ${noRoute ? '#f87171' : '#4ade80'}; font-weight: 700;">${transitMin}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    // Render 3D A* Route Ribbons in WebGL scene
    if (data.jobRoutes) {
      render3DAStarRibbons(data.jobRoutes);
    }

  } catch (err) {
    console.error('[AI Planner] Schedule calculation failed:', err);
  }
}

function render3DAStarRibbons(jobRoutes) {
  if (!astarRibbonGroup) return;
  clearAStarRibbons();

  const jobColors = {
    'JOB-101': 0x38bdf8, // Cyan
    'JOB-102': 0x10b981, // Emerald
    'JOB-103': 0xf59e0b, // Amber
    'JOB-104': 0xf43f5e, // Rose
    'JOB-105': 0xa855f7  // Purple
  };

  Object.keys(jobRoutes).forEach(jobId => {
    const route = jobRoutes[jobId];
    if (!route || !route.waypoints || route.waypoints.length < 2) return;

    const color = jobColors[jobId] || 0x38bdf8;
    const points = route.waypoints.map(p => new THREE.Vector3(p.x, 0.055, p.z));

    // 1. Draw glowing path line
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const lineMat = new THREE.LineBasicMaterial({
      color: color,
      linewidth: 3,
      transparent: true,
      opacity: 0.85
    });
    const line = new THREE.Line(lineGeo, lineMat);
    astarRibbonGroup.add(line);

    // 2. Draw waypoint dot markers
    const sphereGeo = new THREE.SphereGeometry(0.04, 8, 8);
    const sphereMat = new THREE.MeshBasicMaterial({ color: color });
    
    // Add start and end beacon
    const startMesh = new THREE.Mesh(sphereGeo, sphereMat);
    startMesh.position.copy(points[0]);
    astarRibbonGroup.add(startMesh);

    const goalMesh = new THREE.Mesh(sphereGeo, sphereMat);
    goalMesh.position.copy(points[points.length - 1]);
    astarRibbonGroup.add(goalMesh);
  });

  applyRibbonSetting(); // shown only if this scan has them on
}

function executeMasterSchedule() {
  if (!cachedScheduleData || !cachedScheduleData.masterSchedule) {
    alert('Please wait for the schedule to compute first.');
    return;
  }

  const master = cachedScheduleData.masterSchedule;
  const routes = cachedScheduleData.jobRoutes;

  // Assign routes to robots
  master.forEach(item => {
    const robot = robotDefs.find(r => r.id === item.robot_id);
    const route = routes ? routes[item.job_id] : null;

    if (robot && route && route.success !== false && route.waypoints && route.waypoints.length > 0) {
      robot.waypoints = route.waypoints.map(p => new THREE.Vector3(p.x, p.y, p.z));
      robot.waypointIndex = 0;
      robot.isPatrolling = true;
      robot.status = `Mission: ${item.job_id} (${item.cargo})`;
      if (robot.statStatusEl) {
        robot.statStatusEl.textContent = robot.status;
      }
    }
  });

  updateFleetCards();

  // Close modal
  const modal = document.getElementById('ai-planner-modal');
  if (modal) modal.style.display = 'none';

  // Broadcast to other connected clients via WebSocket if available
  send('EXECUTE_SCHEDULE', { masterSchedule: master });

  // Display user notification in the dispatch banner
  const banner = document.querySelector('.dispatch-banner');
  if (banner) {
    banner.innerHTML = `<span style="color: #6ee7b7;">🚀 <b>A* & CSP Master Schedule Active:</b> 5 missions coordinated with 0 conflicts!</span>`;
    setTimeout(() => {
      banner.innerHTML = `<span>🧭 <b>Interactive Dispatch Mode</b>: Click any point on the floor to route <span id="dispatch-target-name" style="color: #38bdf8;">${selectedRobotId}</span></span>`;
    }, 7000);
  }
}

window.openAIPlannerModal = () => {
  const modal = document.getElementById('ai-planner-modal');
  if (modal) modal.style.display = 'flex';
};

// ==========================================
// DYNAMIC FLEET MANAGER: ADD & REMOVE ROBOTS
// ==========================================
const FLEET_STORAGE_KEY = 'active_sim_fleet_enabled';

function loadFleetEnabledState() {
  try {
    const raw = localStorage.getItem(FLEET_STORAGE_KEY);
    if (raw) {
      const map = JSON.parse(raw);
      robotDefs.forEach(r => {
        if (map[r.id] !== undefined) r.enabled = Boolean(map[r.id]);
      });
    }
  } catch (e) { }
}
loadFleetEnabledState();

function saveFleetEnabledState() {
  try {
    const map = {};
    robotDefs.forEach(r => { map[r.id] = (r.enabled !== false); });
    localStorage.setItem(FLEET_STORAGE_KEY, JSON.stringify(map));
  } catch (e) { }
}

function updateFleetManagerUI() {
  const activeCount = robotDefs.filter(r => r.enabled !== false).length;
  const countBadge = document.getElementById('btn-active-robot-count');
  if (countBadge) countBadge.textContent = activeCount;

  const fmCount = document.getElementById('fm-active-count');
  if (fmCount) fmCount.textContent = `${activeCount} / ${robotDefs.length} Active`;

  const sidebarCount = document.getElementById('fleet-count');
  if (sidebarCount) sidebarCount.textContent = `${activeCount} Active`;

  const list = document.getElementById('fleet-manager-list');
  if (!list) return;

  list.innerHTML = '';
  robotDefs.forEach(r => {
    const isEn = (r.enabled !== false);
    const card = document.createElement('div');
    card.className = 'fm-card';
    const typeIcon = r.type === 'drone' ? '🚁' : (r.type === 'humanoid' ? '🤖' : '🚜');
    const colorHex = '#' + r.color.toString(16).padStart(6, '0');

    card.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 20px;">${typeIcon}</span>
        <div>
          <div style="font-weight: 700; color: ${colorHex}; font-size: 13px;">${r.name} (${r.id})</div>
          <div style="font-size: 11px; color: #94a3b8;">${r.type.toUpperCase()} &bull; Battery: ${Math.round(r.battery)}% &bull; Status: ${r.status}</div>
        </div>
      </div>
      <label class="fm-switch">
        <input type="checkbox" data-robot="${r.id}" ${isEn ? 'checked' : ''}>
        <span class="fm-slider"></span>
      </label>
    `;

    const input = card.querySelector('input');
    input.onchange = (e) => {
      toggleRobotEnabled(r.id, e.target.checked);
    };

    list.appendChild(card);
  });
}

function toggleRobotEnabled(robotId, enable) {
  const r = robotDefs.find(item => item.id === robotId);
  if (!r) return;

  r.enabled = enable;
  if (r.mesh) r.mesh.visible = enable;
  if (!enable) {
    if (r.isDetouring) {
      r.isDetouring = false;
      r.detourWaypoints = null;
      clearDetourRibbon(r.id);
    }
    r.lidarHits = [];
    if (r.id === selectedRobotId || r.id === activeRoverId) {
      if (lidarLinesMesh) {
        lidarLinesMesh.geometry.setDrawRange(0, 0);
        lidarLinesMesh.geometry.attributes.position.needsUpdate = true;
      }
      if (lidarPointsMesh) {
        lidarPointsMesh.geometry.setDrawRange(0, 0);
        lidarPointsMesh.geometry.attributes.position.needsUpdate = true;
      }
    }
  }

  // If currently selected robot is disabled, pick first enabled robot
  if (!enable && selectedRobotId === robotId) {
    const firstActive = robotDefs.find(item => item.enabled !== false);
    if (firstActive) {
      selectedRobotId = firstActive.id;
      if (firstActive.type === 'amr') activeRoverId = firstActive.id;
      else if (firstActive.type === 'drone') activeDroneId = firstActive.id;
    }
  }

  saveFleetEnabledState();
  updateFleetCards();
  updateFleetManagerUI();

  const banner = document.querySelector('.dispatch-banner');
  if (banner) {
    banner.innerHTML = `<span>🤖 <b>Fleet Manager:</b> ${r.name} (${r.id}) ${enable ? '🟢 Activated into Campus Simulation' : '🔴 Deactivated & Removed from Simulation'}</span>`;
  }
}
window.toggleRobotEnabled = toggleRobotEnabled;

function setupFleetManagerUI() {
  const btnOpen = document.getElementById('btn-fleet-manager');
  const btnClose = document.getElementById('btn-close-fleet-manager');
  const backdrop = document.getElementById('fleet-manager-backdrop');
  const modal = document.getElementById('fleet-manager-modal');

  const openModal = () => {
    if (modal) modal.style.display = 'flex';
    updateFleetManagerUI();
  };

  const closeModal = () => {
    if (modal) modal.style.display = 'none';
  };

  if (btnOpen) btnOpen.onclick = openModal;
  if (btnClose) btnClose.onclick = closeModal;
  if (backdrop) backdrop.onclick = closeModal;

  const btnAll = document.getElementById('btn-fm-enable-all');
  if (btnAll) {
    btnAll.onclick = () => {
      robotDefs.forEach(r => {
        r.enabled = true;
        if (r.mesh) r.mesh.visible = true;
      });
      saveFleetEnabledState();
      updateFleetCards();
      updateFleetManagerUI();
    };
  }

  const btnNone = document.getElementById('btn-fm-disable-all');
  if (btnNone) {
    btnNone.onclick = () => {
      robotDefs.forEach(r => {
        r.enabled = false;
        if (r.mesh) r.mesh.visible = false;
        if (r.isDetouring) clearDetourRibbon(r.id);
        r.lidarHits = [];
      });
      if (lidarLinesMesh) {
        lidarLinesMesh.geometry.setDrawRange(0, 0);
        lidarLinesMesh.geometry.attributes.position.needsUpdate = true;
      }
      if (lidarPointsMesh) {
        lidarPointsMesh.geometry.setDrawRange(0, 0);
        lidarPointsMesh.geometry.attributes.position.needsUpdate = true;
      }
      saveFleetEnabledState();
      updateFleetCards();
      updateFleetManagerUI();
    };
  }

  updateFleetManagerUI();
}

// Run last, so every top-level declaration above is initialized before init() starts the first frame.
init();
