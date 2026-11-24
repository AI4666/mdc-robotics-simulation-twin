// pedestrians.js — Autonomous campus pedestrian simulation for MDC North Campus digital twin.
// Simulates students and faculty walking between campus buildings along physical sidewalks,
// interacting with rover LiDAR and triggering dynamic safety yield behavior.

import * as THREE from 'three';

// ============================================================================
// 1. MDC NORTH CAMPUS SIDEWALK GRAPH & WAYPOINT HUBS
// ============================================================================
export const CAMPUS_SIDEWALK_NODES = {
  // Building Portals / Drop-Off Entrances
  'b1': { id: 'b1', name: 'Building 1 Entrance', x: 2.70, z: 0.00, neighbors: ['ne_lake', 'se_lake', 'e_lake'] },
  'b2': { id: 'b2', name: 'Building 2 Entrance', x: 0.80, z: 1.65, neighbors: ['s_lake_e', 'se_lake'] },
  'b3': { id: 'b3', name: 'Building 3 Entrance', x: -0.25, z: -1.60, neighbors: ['n_lake_mid', 'nw_lake'] },
  'b4': { id: 'b4', name: 'Building 4 Entrance', x: 2.80, z: -2.20, neighbors: ['ne_lake', 'rotunda_junction'] },
  'b5': { id: 'b5', name: 'Building 5 Entrance', x: -1.62, z: 1.60, neighbors: ['s_lake_w', 'sw_lake'] },
  'b6': { id: 'b6', name: 'Building 6 Entrance', x: 1.92, z: -1.65, neighbors: ['rotunda_junction', 'ne_lake'] },
  'b7': { id: 'b7', name: 'Building 7 Entrance', x: -2.70, z: -1.60, neighbors: ['nw_lake', 'w_lake_junction'] },
  'b8': { id: 'b8', name: 'Building 8 Entrance', x: -3.60, z: -1.60, neighbors: ['w_lake_junction', 'lake_rd_north'] },
  'b9': { id: 'b9', name: 'Building 9 Entrance', x: -4.10, z: -2.70, neighbors: ['lake_rd_north', 'west_crosswalk'] },
  'ba': { id: 'ba', name: 'Building A Entrance', x: -4.10, z: 0.50, neighbors: ['west_crosswalk', 'lake_rd_south'] },
  'bj': { id: 'bj', name: 'Building J Entrance', x: -3.05, z: -2.55, neighbors: ['lake_rd_north', 'w_lake_junction'] },

  // Central Lake Loop & Plaza Connectors
  'e_lake': { id: 'e_lake', name: 'East Lake Promenade', x: 2.25, z: 0.00, neighbors: ['b1', 'ne_lake', 'se_lake'] },
  'ne_lake': { id: 'ne_lake', name: 'Northeast Lake Plaza', x: 2.25, z: -1.25, neighbors: ['e_lake', 'b1', 'b4', 'b6', 'rotunda_junction', 'n_lake_mid'] },
  'se_lake': { id: 'se_lake', name: 'Southeast Lake Plaza', x: 2.25, z: 1.25, neighbors: ['e_lake', 'b1', 's_lake_e', 'b2'] },
  'n_lake_mid': { id: 'n_lake_mid', name: 'North Lake Promenade', x: 0.00, z: -1.25, neighbors: ['ne_lake', 'nw_lake', 'b3'] },
  's_lake_e': { id: 's_lake_e', name: 'South Lake East Promenade', x: 0.80, z: 1.25, neighbors: ['se_lake', 'b2', 's_lake_w'] },
  's_lake_w': { id: 's_lake_w', name: 'South Lake West Promenade', x: -1.62, z: 1.25, neighbors: ['s_lake_e', 'sw_lake', 'b5'] },
  'nw_lake': { id: 'nw_lake', name: 'Northwest Lake Plaza', x: -2.20, z: -1.25, neighbors: ['n_lake_mid', 'w_lake_junction', 'b3', 'b7', 'w_lake'] },
  'sw_lake': { id: 'sw_lake', name: 'Southwest Lake Plaza', x: -2.20, z: 1.25, neighbors: ['s_lake_w', 'w_lake', 'b5', 'lake_rd_south'] },
  'w_lake': { id: 'w_lake', name: 'West Lake Promenade', x: -2.20, z: 0.00, neighbors: ['nw_lake', 'sw_lake', 'w_lake_junction'] },

  // West Campus & Lake Road Crosswalks
  'rotunda_junction': { id: 'rotunda_junction', name: 'Rotunda Crosswalk', x: 2.30, z: -1.80, neighbors: ['b4', 'b6', 'ne_lake'] },
  'w_lake_junction': { id: 'w_lake_junction', name: 'West Walkway Hub', x: -2.80, z: -1.25, neighbors: ['nw_lake', 'w_lake', 'b7', 'b8', 'lake_rd_north', 'bj'] },
  'lake_rd_north': { id: 'lake_rd_north', name: 'Lake Rd North Crosswalk', x: -3.50, z: -1.80, neighbors: ['b8', 'w_lake_junction', 'b9', 'west_crosswalk', 'bj'] },
  'lake_rd_south': { id: 'lake_rd_south', name: 'Lake Rd South Crosswalk', x: -3.30, z: 0.60, neighbors: ['sw_lake', 'west_crosswalk', 'ba', 'depot_access'] },
  'west_crosswalk': { id: 'west_crosswalk', name: 'West Campus Promenade', x: -4.00, z: -1.00, neighbors: ['lake_rd_north', 'lake_rd_south', 'b9', 'ba'] },
  'depot_access': { id: 'depot_access', name: 'Depot Sidewalk Access', x: -4.10, z: 1.50, neighbors: ['ba', 'lake_rd_south', 'depot_bay'] },
  'depot_bay': { id: 'depot_bay', name: 'Central Depot Loading Bay', x: -4.45, z: 2.40, neighbors: ['depot_access'] }
};

// Breadth-First-Search shortest path over sidewalk graph
export function findSidewalkPath(startNodeId, targetNodeId) {
  if (startNodeId === targetNodeId) return [CAMPUS_SIDEWALK_NODES[startNodeId]];
  const queue = [[startNodeId]];
  const visited = new Set([startNodeId]);

  while (queue.length > 0) {
    const path = queue.shift();
    const curr = path[path.length - 1];
    const node = CAMPUS_SIDEWALK_NODES[curr];
    if (!node) continue;

    for (const neighborId of node.neighbors) {
      if (neighborId === targetNodeId) {
        return path.concat(neighborId).map(id => CAMPUS_SIDEWALK_NODES[id]);
      }
      if (!visited.has(neighborId)) {
        visited.add(neighborId);
        queue.push(path.concat(neighborId));
      }
    }
  }

  // Fallback direct line if no graph route
  return [CAMPUS_SIDEWALK_NODES[startNodeId] || { x: 0, z: 0 }, CAMPUS_SIDEWALK_NODES[targetNodeId] || { x: 0, z: 0 }];
}

// ============================================================================
// 2. PEDESTRIAN ROSTER (STUDENTS & FACULTY)
// ============================================================================
export const PEDESTRIAN_ROSTER = [
  { id: 'ped-1', name: 'Alex Rivera', role: 'Student (Computer Science)', color: 0x3b82f6, bagColor: 0x1e293b, speed: 0.42 },
  { id: 'ped-2', name: 'Maya Patel', role: 'Student (Robotics & AI)', color: 0x10b981, bagColor: 0x064e3b, speed: 0.46 },
  { id: 'ped-3', name: 'Carlos Diaz', role: 'Student (Engineering)', color: 0xf59e0b, bagColor: 0x78350f, speed: 0.40 },
  { id: 'ped-4', name: 'Sarah Jenkins', role: 'Student (Biotechnology)', color: 0xec4899, bagColor: 0x831843, speed: 0.44 },
  { id: 'ped-5', name: 'Prof. Torres', role: 'Faculty (Applied AI)', color: 0x6366f1, bagColor: 0x312e81, speed: 0.36 },
  { id: 'ped-6', name: 'David Kim', role: 'Student (Cybersecurity)', color: 0x06b6d4, bagColor: 0x164e63, speed: 0.48 },
  { id: 'ped-7', name: 'Elena Rostova', role: 'Student (Data Science)', color: 0x8b5cf6, bagColor: 0x4c1d95, speed: 0.43 },
  { id: 'ped-8', name: 'Marcus Washington', role: 'Student (Aviation & Logistics)', color: 0x14b8a6, bagColor: 0x134e4a, speed: 0.45 },
  { id: 'ped-9', name: 'Dr. Chen', role: 'Faculty (School of Science)', color: 0x64748b, bagColor: 0x0f172a, speed: 0.35 },
  { id: 'ped-10', name: 'Jessica Morales', role: 'Student (Nursing & Health)', color: 0xef4444, bagColor: 0x7f1d1d, speed: 0.41 },
  { id: 'ped-11', name: 'Jordan Taylor', role: 'AI Lab Research Fellow', color: 0x0ea5e9, bagColor: 0x0369a1, speed: 0.47 },
  { id: 'ped-12', name: 'Samira Khan', role: 'Student (Architecture & BIM)', color: 0xd97706, bagColor: 0x451a03, speed: 0.42 },
  { id: 'ped-13', name: 'Lucas Silva', role: 'Student (Autonomous Systems)', color: 0x22c55e, bagColor: 0x14532d, speed: 0.45 },
  { id: 'ped-14', name: 'Olivia Bennett', role: 'Student (Digital Media)', color: 0xa855f7, bagColor: 0x581c87, speed: 0.43 },
  { id: 'ped-15', name: 'Mateo Gomez', role: 'Robotics Club President', color: 0xf97316, bagColor: 0x7c2d12, speed: 0.46 },
  { id: 'ped-16', name: 'Chloe Dupont', role: 'Student (Exchange Student)', color: 0x38bdf8, bagColor: 0x0c4a6e, speed: 0.44 },
  { id: 'ped-17', name: 'Prof. Joseph Weathers', role: 'Faculty (Simulation Lead)', color: 0x1e3a8a, bagColor: 0x0284c7, speed: 0.38 },
  { id: 'ped-18', name: 'Gabriel Santos', role: 'Student (Mechatronics)', color: 0x84cc16, bagColor: 0x365314, speed: 0.45 },
  { id: 'ped-19', name: 'Hannah Wright', role: 'Student (Environmental Science)', color: 0x2dd4bf, bagColor: 0x115e59, speed: 0.42 },
  { id: 'ped-20', name: 'Noah Martinez', role: 'Student (Software Engineering)', color: 0x3b82f6, bagColor: 0x1e3a8a, speed: 0.47 },
  { id: 'ped-21', name: 'Dr. Evelyn Vance', role: 'Faculty (Dean of Technology)', color: 0x475569, bagColor: 0x1e293b, speed: 0.36 },
  { id: 'ped-22', name: 'Liam O\'Connor', role: 'Student (Industrial IoT)', color: 0x059669, bagColor: 0x064e3b, speed: 0.43 },
  { id: 'ped-23', name: 'Sofia Ramirez', role: 'Student (Student Government)', color: 0xe11d48, bagColor: 0x881337, speed: 0.44 },
  { id: 'ped-24', name: 'Ethan Brooks', role: 'Student (Rover Technician)', color: 0x2563eb, bagColor: 0x172554, speed: 0.46 }
];

// ============================================================================
// 3. 3D PROCEDURAL PEDESTRIAN AVATAR BUILDER
// ============================================================================
export function createPedestrianMesh(ped) {
  const root = new THREE.Group();
  root.name = `pedestrian_${ped.id}`;

  const outfitMat = new THREE.MeshStandardMaterial({ color: ped.color, roughness: 0.5 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xffdfba, roughness: 0.6 });
  const darkPantsMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 });
  const shoesMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 });
  const bagMat = new THREE.MeshStandardMaterial({ color: ped.bagColor || 0x1e293b, roughness: 0.6 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x2d1a09, roughness: 0.8 });

  // Scale down pedestrian model to fit campus map scale (~0.28m height scale in scene)
  const scale = 0.22;
  const humanGroup = new THREE.Group();
  humanGroup.scale.set(scale, scale, scale);
  root.add(humanGroup);

  // 1. Torso
  const torsoGeo = new THREE.CylinderGeometry(0.20, 0.17, 0.48, 12);
  const torso = new THREE.Mesh(torsoGeo, outfitMat);
  torso.position.y = 0.82;
  torso.castShadow = true;
  humanGroup.add(torso);

  // 2. Backpack / Messenger Bag
  const bagGeo = new THREE.BoxGeometry(0.24, 0.30, 0.14);
  const bag = new THREE.Mesh(bagGeo, bagMat);
  bag.position.set(0, 0.82, -0.16);
  bag.castShadow = true;
  humanGroup.add(bag);

  // 3. Head & Hair
  const headGeo = new THREE.SphereGeometry(0.13, 14, 14);
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.y = 1.18;
  humanGroup.add(head);

  const hairGeo = new THREE.SphereGeometry(0.135, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const hair = new THREE.Mesh(hairGeo, hairMat);
  hair.position.y = 1.20;
  humanGroup.add(hair);

  // 4. Arms (Pivoted at shoulders)
  const armGeo = new THREE.CylinderGeometry(0.05, 0.045, 0.38, 8);
  armGeo.translate(0, -0.16, 0);

  const leftArmGroup = new THREE.Group();
  leftArmGroup.position.set(0.25, 1.02, 0);
  const leftArm = new THREE.Mesh(armGeo, outfitMat);
  leftArm.castShadow = true;
  leftArmGroup.add(leftArm);
  humanGroup.add(leftArmGroup);

  const rightArmGroup = new THREE.Group();
  rightArmGroup.position.set(-0.25, 1.02, 0);
  const rightArm = new THREE.Mesh(armGeo, outfitMat);
  rightArm.castShadow = true;
  rightArmGroup.add(rightArm);
  humanGroup.add(rightArmGroup);

  // 5. Legs (Pivoted at hips)
  const legGeo = new THREE.CylinderGeometry(0.065, 0.055, 0.52, 8);
  legGeo.translate(0, -0.24, 0);

  const leftLegGroup = new THREE.Group();
  leftLegGroup.position.set(0.10, 0.56, 0);
  const leftLeg = new THREE.Mesh(legGeo, darkPantsMat);
  leftLeg.castShadow = true;
  leftLegGroup.add(leftLeg);

  const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.16), shoesMat);
  shoeL.position.set(0, -0.50, 0.03);
  leftLegGroup.add(shoeL);
  humanGroup.add(leftLegGroup);

  const rightLegGroup = new THREE.Group();
  rightLegGroup.position.set(-0.10, 0.56, 0);
  const rightLeg = new THREE.Mesh(legGeo, darkPantsMat);
  rightLeg.castShadow = true;
  rightLegGroup.add(rightLeg);

  const shoeR = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.16), shoesMat);
  shoeR.position.set(0, -0.50, 0.03);
  rightLegGroup.add(shoeR);
  humanGroup.add(rightLegGroup);

  // 6. Name / Role Overhead Glass Billboard
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 72;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.roundRect(4, 4, 248, 64, 12);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = `#${ped.color.toString(16).padStart(6, '0')}`;
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(ped.name, 128, 30);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '15px system-ui, -apple-system, sans-serif';
  ctx.fillText(ped.role.split('(')[0].trim(), 128, 54);

  const badgeTex = new THREE.CanvasTexture(canvas);
  badgeTex.minFilter = THREE.LinearFilter;
  const badgeMat = new THREE.SpriteMaterial({ map: badgeTex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(badgeMat);
  sprite.position.y = 0.36; // meters above ground
  sprite.scale.set(0.60, 0.17, 1);
  root.add(sprite);

  return {
    group: root,
    humanGroup,
    leftLegGroup,
    rightLegGroup,
    leftArmGroup,
    rightArmGroup,
    sprite
  };
}

// ============================================================================
// 4. CAMPUS PEDESTRIAN SWARM SIMULATOR CLASS
// ============================================================================
export class CampusPedestrianSwarm {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'campusPedestriansSwarm';
    this.scene.add(this.group);

    this.active = true;
    this.namesVisible = true;
    this.density = 'normal'; // 'low' (6), 'normal' (12), 'rush' (24)
    this.pedestrians = [];
    this.yieldCount = 0;
    this.activeCampusScan = false;

    this.buildingPortalKeys = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9', 'ba', 'bj'];
    this.initPool();
  }

  initPool() {
    PEDESTRIAN_ROSTER.forEach((def, idx) => {
      const meshObj = createPedestrianMesh(def);
      meshObj.group.visible = false;
      this.group.add(meshObj.group);

      // Random starting building and target
      const startKey = this.buildingPortalKeys[idx % this.buildingPortalKeys.length];
      const startNode = CAMPUS_SIDEWALK_NODES[startKey];

      const ped = {
        ...def,
        meshObj,
        x: startNode.x + (Math.random() - 0.5) * 0.15,
        z: startNode.z + (Math.random() - 0.5) * 0.15,
        heading: 0,
        currentNodeId: startKey,
        targetNodeId: null,
        route: [],
        routeIdx: 0,
        walkCycle: Math.random() * Math.PI * 2,
        isWaiting: true,
        waitTimer: Math.random() * 2.5 + 0.5,
        enabled: false
      };

      this.pedestrians.push(ped);
    });
  }

  setCampusScanActive(isCampus) {
    this.activeCampusScan = isCampus;
    this.updateVisibility();
  }

  setDensity(density) {
    this.density = density;
    this.updateVisibility();
  }

  setActive(active) {
    this.active = active;
    this.updateVisibility();
  }

  setNamesVisible(visible) {
    this.namesVisible = visible;
    this.pedestrians.forEach(p => {
      if (p.meshObj && p.meshObj.sprite) {
        p.meshObj.sprite.visible = visible;
      }
    });
  }

  getTargetCount() {
    if (!this.active || !this.activeCampusScan) return 0;
    if (this.density === 'low') return 6;
    if (this.density === 'rush') return 24;
    return 12; // normal
  }

  updateVisibility() {
    const targetCount = this.getTargetCount();
    this.pedestrians.forEach((p, idx) => {
      const shouldBeActive = idx < targetCount;
      p.enabled = shouldBeActive;
      p.meshObj.group.visible = shouldBeActive;
      if (p.meshObj && p.meshObj.sprite) {
        p.meshObj.sprite.visible = this.namesVisible !== false;
      }
      if (shouldBeActive && !p.route.length && !p.isWaiting) {
        this.assignNewRoute(p);
      }
    });
    this.updateUI();
  }

  assignNewRoute(ped) {
    let nextDestKey = ped.currentNodeId;
    while (nextDestKey === ped.currentNodeId) {
      const randIdx = Math.floor(Math.random() * this.buildingPortalKeys.length);
      nextDestKey = this.buildingPortalKeys[randIdx];
    }

    ped.targetNodeId = nextDestKey;
    ped.route = findSidewalkPath(ped.currentNodeId, nextDestKey);
    ped.routeIdx = 0;
    ped.isWaiting = false;
  }

  // ==========================================================================
  // AnyLogic mode: the walking students come from the AnyLogic model (POST /api/anylogic/update).
  // Each AnyLogic walker id keeps one figure from the pool (up to PEDESTRIAN_ROSTER.length); the figure
  // walks smoothly toward the latest position instead of following its own random routes.
  // ==========================================================================
  setExternalTargets(list) {
    this.external = true;
    this.externalTargets = Array.isArray(list) ? list : [];
    if (!this.externalSlots) this.externalSlots = new Map();   // AnyLogic id -> pool index
    const seen = new Set();
    this.externalTargets.forEach(t => {
      if (!t || t.id === undefined) return;
      seen.add(t.id);
      if (this.externalSlots.has(t.id)) return;
      const used = new Set(this.externalSlots.values());
      const free = this.pedestrians.findIndex((_p, i) => !used.has(i));
      if (free < 0) return;                       // more walkers than figures: show the first ones
      this.externalSlots.set(t.id, free);
      const ped = this.pedestrians[free];
      ped.x = t.x; ped.z = t.z;                    // new walker: appear where AnyLogic put it
    });
    for (const id of [...this.externalSlots.keys()]) if (!seen.has(id)) this.externalSlots.delete(id);
  }

  clearExternal() {
    this.external = false;
    this.externalTargets = [];
    if (this.externalSlots) this.externalSlots.clear();
    this.updateVisibility();
  }

  updateExternal(dt) {
    const byIndex = new Map();
    this.externalTargets.forEach(t => {
      const i = this.externalSlots.get(t && t.id);
      if (i !== undefined) byIndex.set(i, t);
    });
    this.pedestrians.forEach((ped, i) => {
      const t = byIndex.get(i);
      ped.enabled = !!t;
      ped.meshObj.group.visible = !!t;
      if (!t) return;
      const dx = t.x - ped.x, dz = t.z - ped.z, dist = Math.hypot(dx, dz);
      const step = Math.min(dist, Math.max(ped.speed, dist * 3) * dt);
      if (dist > 1e-4) {
        ped.x += dx / dist * step;
        ped.z += dz / dist * step;
        ped.heading = Math.atan2(dx, dz);
      }
      const moving = dist > 0.01;
      ped.walkCycle += moving ? dt * (ped.speed * 18) : 0;
      const swing = moving ? Math.sin(ped.walkCycle) * 0.42 : 0;
      ped.meshObj.leftLegGroup.rotation.x = swing;
      ped.meshObj.rightLegGroup.rotation.x = -swing;
      ped.meshObj.leftArmGroup.rotation.x = -swing * 0.75;
      ped.meshObj.rightArmGroup.rotation.x = swing * 0.75;
      ped.meshObj.humanGroup.position.y = 0.01 + (moving ? Math.abs(Math.sin(ped.walkCycle * 2)) * 0.012 : 0);
      ped.meshObj.group.position.set(ped.x, 0.02, ped.z);
      ped.meshObj.group.rotation.y = ped.heading;
    });
  }

  update(delta) {
    if (!this.active || !this.activeCampusScan) return;
    const dt = Math.min(delta, 0.1);
    if (this.external) { this.updateExternal(dt); return; }

    this.pedestrians.forEach(ped => {
      if (!ped.enabled) return;

      if (ped.isWaiting) {
        ped.waitTimer -= dt;
        // Idle breathing / slight sway
        ped.meshObj.leftLegGroup.rotation.x = 0;
        ped.meshObj.rightLegGroup.rotation.x = 0;
        ped.meshObj.leftArmGroup.rotation.x = Math.sin(performance.now() * 0.002) * 0.05;
        ped.meshObj.rightArmGroup.rotation.x = -Math.sin(performance.now() * 0.002) * 0.05;
        ped.meshObj.humanGroup.position.y = 0.01;

        if (ped.waitTimer <= 0) {
          this.assignNewRoute(ped);
        }
        return;
      }

      // Moving along route
      if (!ped.route || ped.routeIdx >= ped.route.length) {
        ped.isWaiting = true;
        ped.waitTimer = 1.5 + Math.random() * 3.0; // 1.5 - 4.5s pause at destination
        ped.currentNodeId = ped.targetNodeId || ped.currentNodeId;
        return;
      }

      const targetWaypoint = ped.route[ped.routeIdx];
      const dx = targetWaypoint.x - ped.x;
      const dz = targetWaypoint.z - ped.z;
      const dist = Math.hypot(dx, dz);

      if (dist < 0.12) {
        ped.currentNodeId = targetWaypoint.id || ped.currentNodeId;
        ped.routeIdx++;
        return;
      }

      // Walk towards target waypoint
      const dirX = dx / dist;
      const dirZ = dz / dist;
      const moveDist = ped.speed * dt;
      ped.x += dirX * moveDist;
      ped.z += dirZ * moveDist;
      ped.heading = Math.atan2(dirX, dirZ);

      // Walk cycle animation (swing legs and arms)
      ped.walkCycle += dt * (ped.speed * 18);
      const swing = Math.sin(ped.walkCycle) * 0.42;
      ped.meshObj.leftLegGroup.rotation.x = swing;
      ped.meshObj.rightLegGroup.rotation.x = -swing;
      ped.meshObj.leftArmGroup.rotation.x = -swing * 0.75;
      ped.meshObj.rightArmGroup.rotation.x = swing * 0.75;

      // Vertical bounce
      ped.meshObj.humanGroup.position.y = 0.01 + Math.abs(Math.sin(ped.walkCycle * 2)) * 0.012;

      // Update 3D position
      ped.meshObj.group.position.set(ped.x, 0.02, ped.z);
      ped.meshObj.group.rotation.y = ped.heading;
    });
  }

  // Returns array of separation bodies for robot collision / yield checks
  getSeparationBodies() {
    if (!this.active || !this.activeCampusScan) return [];
    return this.pedestrians
      .filter(p => p.enabled)
      .map(p => ({
        id: p.id,
        name: p.name,
        type: 'pedestrian',
        x: p.x,
        z: p.z,
        y: 0.05,
        heading: p.heading,
        metersPerUnit: 1.0,
        manual: false,
        onMission: false
      }));
  }

  recordYield() {
    this.yieldCount++;
    this.updateUI();
  }

  updateUI() {
    const activeEl = document.getElementById('ped-active-count');
    const yieldEl = document.getElementById('ped-yield-count');
    const safetyEl = document.getElementById('ped-safety-rate');
    const targetCount = this.getTargetCount();

    if (activeEl) activeEl.innerText = targetCount;
    if (yieldEl) yieldEl.innerText = this.yieldCount;
    if (safetyEl) safetyEl.innerText = '100%';
  }
}
