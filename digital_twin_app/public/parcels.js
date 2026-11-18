// parcels.js — Autonomous Smart Campus Courier Parcel Dispatch & Inductive Charging Logistics
// for MDC North Campus Digital Twin (Option 2 Course Proposal).
// Features a 1,000-package Central Sorting & Distribution Depot with GPU-instanced 3D packages,
// multi-modal delivery dispatch across AMRs, Unitree G1 Humanoid, and SkyWatcher Drones.

import * as THREE from 'three';

// 3 Priority Tiers
export const SLA_TIERS = {
  urgent: { label: 'Urgent Exam/Lab', slaSeconds: 65, color: 0xef4444, badge: '#ef4444' },
  standard: { label: 'Standard Mail', slaSeconds: 120, color: 0x0ea5e9, badge: '#0ea5e9' },
  routine: { label: 'Routine Supplies', slaSeconds: 180, color: 0x10b981, badge: '#10b981' }
};

// ============================================================================
// 1. PROCEDURAL 3D YELLOW CARGO PARCEL BOX
// ============================================================================
export function createParcelBoxMesh(priority = 'standard') {
  const group = new THREE.Group();
  group.name = 'parcel_box';

  const tier = SLA_TIERS[priority] || SLA_TIERS.standard;

  // 1. Bright golden-yellow courier package
  const boxGeo = new THREE.BoxGeometry(0.22, 0.15, 0.18);
  const boxMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b, // Vibrant yellow logistics color
    roughness: 0.45,
    metalness: 0.1
  });
  const box = new THREE.Mesh(boxGeo, boxMat);
  box.castShadow = true;
  group.add(box);

  // 2. Priority indicator tape / band
  const tapeGeo = new THREE.BoxGeometry(0.224, 0.038, 0.184);
  const tapeMat = new THREE.MeshBasicMaterial({ color: tier.color });
  const tape = new THREE.Mesh(tapeGeo, tapeMat);
  group.add(tape);

  // 3. Shipping label
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 128;
  labelCanvas.height = 64;
  const ctx = labelCanvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 64);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 12px monospace';
  ctx.fillText('MDC DEPOT', 6, 16);
  ctx.font = '10px monospace';
  ctx.fillText(tier.label.toUpperCase(), 6, 32);
  // Barcode
  for (let x = 6; x < 120; x += (x % 3 === 0 ? 4 : 2)) {
    ctx.fillRect(x, 40, (x % 4 === 0 ? 2 : 1), 18);
  }

  const labelTex = new THREE.CanvasTexture(labelCanvas);
  const labelGeo = new THREE.PlaneGeometry(0.12, 0.06);
  labelGeo.rotateX(-Math.PI / 2);
  const labelMat = new THREE.MeshBasicMaterial({ map: labelTex });
  const labelMesh = new THREE.Mesh(labelGeo, labelMat);
  labelMesh.position.y = 0.077;
  group.add(labelMesh);

  return group;
}

// ============================================================================
// 2. CENTRAL SORTING & DISTRIBUTION DEPOT WITH 1,000 SMALL YELLOW PACKAGES
// ============================================================================
export function createCentralDepotMesh(depotCenter = { x: -5.4, z: 2.4 }) {
  const root = new THREE.Group();
  root.name = 'central_logistics_depot';
  root.userData = { isDepot: true, isDraggable: true };

  // 1. Concrete / Asphalt Logistics Foundation Apron
  const padGeo = new THREE.BoxGeometry(2.8, 0.04, 2.2);
  const padMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b, // Dark slate asphalt
    roughness: 0.85,
    metalness: 0.1
  });
  const padMesh = new THREE.Mesh(padGeo, padMat);
  padMesh.position.set(0, 0.02, 0);
  padMesh.receiveShadow = true;
  padMesh.userData = { isDepot: true };
  root.add(padMesh);

  // Large invisible / semi-transparent drag capture plane on the ground
  const dragHitGeo = new THREE.CylinderGeometry(1.5, 1.5, 0.2, 24);
  const dragHitMat = new THREE.MeshBasicMaterial({ visible: false });
  const dragHitMesh = new THREE.Mesh(dragHitGeo, dragHitMat);
  dragHitMesh.position.set(0, 0.1, 0);
  dragHitMesh.userData = { isDepot: true };
  root.add(dragHitMesh);

  // Yellow Hazard Perimeter Warning Stripes
  const borderGeo = new THREE.RingGeometry(1.4, 1.48, 4);
  borderGeo.rotateX(-Math.PI / 2);
  borderGeo.rotateY(Math.PI / 4);
  const borderMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide });
  const borderMesh = new THREE.Mesh(borderGeo, borderMat);
  borderMesh.position.set(0, 0.042, 0);
  borderMesh.scale.set(1.4, 1.1, 1.0);
  borderMesh.userData = { isDepot: true };
  root.add(borderMesh);

  // 2. Drone Takeoff & Landing Helipad (Western half of apron)
  const helipadGroup = new THREE.Group();
  helipadGroup.position.set(-0.75, 0.043, 0);

  const heliCircleGeo = new THREE.CircleGeometry(0.42, 32);
  heliCircleGeo.rotateX(-Math.PI / 2);
  const heliCircleMat = new THREE.MeshBasicMaterial({ color: 0x0284c7 });
  const heliCircle = new THREE.Mesh(heliCircleGeo, heliCircleMat);
  heliCircle.userData = { isDepot: true };
  helipadGroup.add(heliCircle);

  const heliRingGeo = new THREE.RingGeometry(0.38, 0.42, 32);
  heliRingGeo.rotateX(-Math.PI / 2);
  const heliRingMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const heliRing = new THREE.Mesh(heliRingGeo, heliRingMat);
  heliRing.userData = { isDepot: true };
  helipadGroup.add(heliRing);

  // High-contrast 'H' marking for drone landing
  const hCanvas = document.createElement('canvas');
  hCanvas.width = 128;
  hCanvas.height = 128;
  const hCtx = hCanvas.getContext('2d');
  hCtx.fillStyle = '#ffffff';
  hCtx.font = 'bold 96px system-ui, sans-serif';
  hCtx.textAlign = 'center';
  hCtx.textBaseline = 'middle';
  hCtx.fillText('H', 64, 64);

  const hTex = new THREE.CanvasTexture(hCanvas);
  const hPlaneGeo = new THREE.PlaneGeometry(0.46, 0.46);
  hPlaneGeo.rotateX(-Math.PI / 2);
  const hPlaneMat = new THREE.MeshBasicMaterial({ map: hTex, transparent: true });
  const hPlane = new THREE.Mesh(hPlaneGeo, hPlaneMat);
  hPlane.position.y = 0.002;
  hPlane.userData = { isDepot: true };
  helipadGroup.add(hPlane);
  root.add(helipadGroup);

  // 3. Ground Courier AMR & Humanoid Loading Bay (Eastern edge of apron)
  const bayGroup = new THREE.Group();
  bayGroup.position.set(0.95, 0.043, 0);

  const bayCircleGeo = new THREE.CircleGeometry(0.35, 32);
  bayCircleGeo.rotateX(-Math.PI / 2);
  const bayCircleMat = new THREE.MeshBasicMaterial({ color: 0xd97706 });
  const bayCircle = new THREE.Mesh(bayCircleGeo, bayCircleMat);
  bayCircle.userData = { isDepot: true };
  bayGroup.add(bayCircle);

  const bayRingGeo = new THREE.RingGeometry(0.32, 0.36, 32);
  bayRingGeo.rotateX(-Math.PI / 2);
  const bayRingMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const bayRing = new THREE.Mesh(bayRingGeo, bayRingMat);
  bayRing.userData = { isDepot: true };
  bayGroup.add(bayRing);

  const bayCanvas = document.createElement('canvas');
  bayCanvas.width = 128;
  bayCanvas.height = 128;
  const bCtx = bayCanvas.getContext('2d');
  bCtx.fillStyle = '#ffffff';
  bCtx.font = 'bold 36px system-ui, sans-serif';
  bCtx.textAlign = 'center';
  bCtx.textBaseline = 'middle';
  bCtx.fillText('PICKUP', 64, 64);
  const bayTex = new THREE.CanvasTexture(bayCanvas);
  const bayTextPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.50, 0.50).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: bayTex, transparent: true }));
  bayTextPlane.position.y = 0.002;
  bayTextPlane.userData = { isDepot: true };
  bayGroup.add(bayTextPlane);
  root.add(bayGroup);

  // 4. 1,000 SMALL YELLOW PACKAGES (High-Performance THREE.InstancedMesh)
  const TOTAL_PACKAGES = 1000;
  const pkgWidth = 0.095;
  const pkgHeight = 0.065;
  const pkgDepth = 0.085;

  const pkgBoxGeo = new THREE.BoxGeometry(pkgWidth, pkgHeight, pkgDepth);
  const pkgMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b, // Bright golden yellow
    roughness: 0.45,
    metalness: 0.15
  });

  const instancedPackages = new THREE.InstancedMesh(pkgBoxGeo, pkgMat, TOTAL_PACKAGES);
  instancedPackages.name = 'instanced_depot_packages';
  instancedPackages.castShadow = true;
  instancedPackages.receiveShadow = true;
  instancedPackages.userData = { isDepot: true };

  const dummy = new THREE.Object3D();
  let instanceIdx = 0;

  // Staging area local to root group (0, 0)
  const palletRows = 4;
  const palletCols = 2;
  const palletSpacingX = 0.55;
  const palletSpacingZ = 0.46;
  const startX = -0.20;
  const startZ = -0.70;

  // Render wooden pallets under stacks
  const palletGeo = new THREE.BoxGeometry(0.48, 0.03, 0.42);
  const palletMat = new THREE.MeshStandardMaterial({ color: 0x854d0e, roughness: 0.9 });

  for (let r = 0; r < palletRows; r++) {
    for (let c = 0; c < palletCols; c++) {
      const palletX = startX + c * palletSpacingX;
      const palletZ = startZ + r * palletSpacingZ;

      const palletMesh = new THREE.Mesh(palletGeo, palletMat);
      palletMesh.position.set(palletX, 0.055, palletZ);
      palletMesh.userData = { isDepot: true };
      root.add(palletMesh);

      // 5 x 5 x 5 = 125 packages stacked on this pallet
      for (let y = 0; y < 5; y++) {
        for (let ix = 0; ix < 5; ix++) {
          for (let iz = 0; iz < 5; iz++) {
            if (instanceIdx >= TOTAL_PACKAGES) break;

            const boxX = palletX - 0.18 + ix * (pkgWidth * 0.98) + (Math.random() - 0.5) * 0.006;
            const boxY = 0.08 + y * (pkgHeight * 0.98);
            const boxZ = palletZ - 0.16 + iz * (pkgDepth * 0.98) + (Math.random() - 0.5) * 0.006;

            dummy.position.set(boxX, boxY, boxZ);
            dummy.rotation.set(0, (Math.random() - 0.5) * 0.05, 0);
            dummy.updateMatrix();

            instancedPackages.setMatrixAt(instanceIdx, dummy.matrix);
            instanceIdx++;
          }
        }
      }
    }
  }

  instancedPackages.instanceMatrix.needsUpdate = true;
  root.add(instancedPackages);

  // 5. Floating Glass Billboard Label
  const billCanvas = document.createElement('canvas');
  billCanvas.width = 512;
  billCanvas.height = 144;
  const bctx = billCanvas.getContext('2d');

  bctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  bctx.roundRect(8, 8, 496, 128, 16);
  bctx.fill();
  bctx.lineWidth = 4;
  bctx.strokeStyle = '#f59e0b';
  bctx.stroke();

  bctx.fillStyle = '#f59e0b';
  bctx.font = 'bold 32px system-ui, -apple-system, sans-serif';
  bctx.textAlign = 'center';
  bctx.fillText('📦 MDC CENTRAL SORTING DEPOT', 256, 50);

  bctx.fillStyle = '#38bdf8';
  bctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
  bctx.fillText('1,000 Yellow Packages Staged • Automated Hub', 256, 88);

  bctx.fillStyle = '#94a3b8';
  bctx.font = '16px system-ui, -apple-system, sans-serif';
  bctx.fillText('AMR Ground Loading Bay • Drone Helipad Takeoff', 256, 118);

  const billTex = new THREE.CanvasTexture(billCanvas);
  billTex.minFilter = THREE.LinearFilter;
  const billMat = new THREE.SpriteMaterial({ map: billTex, transparent: true, depthTest: false });
  const billboard = new THREE.Sprite(billMat);
  billboard.position.set(0, 1.25, 0);
  billboard.scale.set(1.9, 0.54, 1.0);
  billboard.userData = { isDepot: true };
  root.add(billboard);

  // Position root at depotCenter
  root.position.set(depotCenter.x, 0, depotCenter.z);

  return {
    group: root,
    instancedPackages,
    billboard,
    groundPickupPos: { x: depotCenter.x + 0.95, y: 0.05, z: depotCenter.z },
    dronePickupPos: { x: depotCenter.x - 0.75, y: 0.08, z: depotCenter.z }
  };
}

// ============================================================================
// 3. CAMPUS LOGISTICS DISPATCHER CLASS
// ============================================================================
export class CampusLogisticsDispatcher {
  constructor(scene, robotDefs, destinations, labStations, dispatchFn) {
    this.scene = scene;
    this.robotDefs = robotDefs;
    this.destinations = destinations;
    this.labStations = labStations;
    this.dispatchFn = dispatchFn;

    this.active = true;
    this.autoGenerate = true;
    this.autoTimer = 4.0;
    this.orderCounter = 101;
    this.packageStockpile = 1000; // 1,000 packages stockpile

    this.orders = [];
    this.deliveredCount = 0;
    this.onTimeCount = 0;
    this.totalDeliveryTime = 0;

    // Central Sorting Depot Center coordinates (red zone: west lawn)
    this.depotCenter = { x: -5.4, z: 2.4 };
    this.loadSavedDepotPosition();

    // Build the 3D depot facility with 1,000 instanced packages
    this.depotObj = createCentralDepotMesh(this.depotCenter);
    this.depotObj.group.visible = false;
    this.scene.add(this.depotObj.group);

    // Ground rovers and humanoids dock at the eastern loading bay
    this.groundHubPos = this.depotObj.groundPickupPos; // { x: cx + 0.95, y: 0.05, z: cz }
    // Drones take off / land at the western helipad
    this.droneHubPos = this.depotObj.dronePickupPos;   // { x: cx - 0.75, y: 0.08, z: cz }
  }

  loadSavedDepotPosition() {
    try {
      const raw = localStorage.getItem('custom_mdc_depot_position');
      if (raw) {
        const saved = JSON.parse(raw);
        if (typeof saved.x === 'number' && typeof saved.z === 'number') {
          this.depotCenter.x = saved.x;
          this.depotCenter.z = saved.z;
        }
      }
    } catch(e) {}
  }

  saveDepotPosition() {
    try {
      localStorage.setItem('custom_mdc_depot_position', JSON.stringify({
        x: +this.depotCenter.x.toFixed(3),
        z: +this.depotCenter.z.toFixed(3)
      }));
    } catch(e) {}
  }

  setDepotPosition(newX, newZ) {
    this.depotCenter.x = newX;
    this.depotCenter.z = newZ;
    if (this.depotObj && this.depotObj.group) {
      this.depotObj.group.position.set(newX, 0, newZ);
    }
    this.groundHubPos = { x: newX + 0.95, y: 0.05, z: newZ };
    this.droneHubPos = { x: newX - 0.75, y: 0.08, z: newZ };
    this.depotObj.groundPickupPos = this.groundHubPos;
    this.depotObj.dronePickupPos = this.droneHubPos;
  }

  setDepotVisible(visible) {
    if (this.depotObj && this.depotObj.group) {
      this.depotObj.group.visible = visible && this.active;
    }
    this.depotVisible = visible;
  }

  setCampusScanActive(isCampus) {
    const modeChanged = (this.isCampus !== undefined && this.isCampus !== isCampus);
    this.isCampus = isCampus;
    this.active = true; // Always active: handles Station A->B/C in classroom, and Depot->Buildings in campus!
    if (this.depotObj && this.depotObj.group) {
      this.depotObj.group.visible = isCampus && (this.depotVisible !== false);
    }
    if (modeChanged && this.robotDefs) {
      this.orders = [];
      this.robotDefs.forEach(r => {
        r.currentOrder = null;
        if (r.parcelMesh && r.mesh) {
          r.mesh.remove(r.parcelMesh);
          r.parcelMesh = null;
        }
      });
    }
    // Set pickup hub: Station A in classroom, Depot in campus
    if (!isCampus && this.labStations && this.labStations.inventory) {
      this.groundHubPos = { x: this.labStations.inventory.pos.x, y: 0.05, z: this.labStations.inventory.pos.z };
      this.droneHubPos = (this.labStations.helipad) ? { x: this.labStations.helipad.pos.x, y: 0.08, z: this.labStations.helipad.pos.z } : this.groundHubPos;
    } else {
      this.groundHubPos = this.depotObj.groundPickupPos;
      this.droneHubPos = this.depotObj.dronePickupPos;
    }
    this.updateUI();
  }

  generateOrder(tierKey = null) {
    if (!this.active) return null;

    if (!tierKey) {
      const rand = Math.random();
      if (rand < 0.25) tierKey = 'urgent';
      else if (rand < 0.70) tierKey = 'standard';
      else tierKey = 'routine';
    }

    // Pick destination: in campus use buildings; in classroom use Station B (Electronics) or Station C (Testing)
    let candidates = [];
    if (this.isCampus && this.destinations && this.destinations.length > 0) {
      candidates = this.destinations;
    } else if (this.labStations) {
      if (this.labStations.electronics) {
        candidates.push({ name: 'Station B: Electronics Bench', code: 'B', dropoff: this.labStations.electronics.pos });
      }
      if (this.labStations.testing) {
        candidates.push({ name: 'Station C: QA Testing Table', code: 'C', dropoff: this.labStations.testing.pos });
      }
    }
    if (candidates.length === 0) return null;
    const dest = candidates[Math.floor(Math.random() * candidates.length)];

    const tier = SLA_TIERS[tierKey];
    const order = {
      id: `PKG-${this.orderCounter++}`,
      priority: tierKey,
      label: tier.label,
      slaSeconds: tier.slaSeconds,
      elapsedSeconds: 0,
      createdAt: performance.now(),
      status: 'pending',
      destBldg: dest,
      assignedRobotId: null
    };

    this.orders.unshift(order);
    if (this.orders.length > 8) {
      this.orders.pop();
    }

    this.updateUI();
    return order;
  }

  update(delta) {
    if (!this.active) return;
    const dt = Math.min(delta, 0.1);

    if (this.autoGenerate) {
      this.autoTimer -= dt;
      if (this.autoTimer <= 0) {
        this.generateOrder();
        this.autoTimer = 16.0 + Math.random() * 10.0;
      }
    }

    this.updateBatteryAndCharging(dt);
    this.processOrders(dt);
    this.uiTimer = (this.uiTimer || 0) + dt;
    if (this.uiTimer >= 0.25) {
      this.uiTimer = 0;
      this.updateUI();
    }
  }

  updateBatteryAndCharging(dt) {
    const chargerStation = this.labStations && this.labStations.charger ? this.labStations.charger.pos : { x: 0.8, z: 1.6 };

    this.robotDefs.forEach(r => {
      if (r.enabled === false) return;

      if (r.speed > 0.05) {
        const dischargeRate = (r.parcelMesh ? 0.05 : 0.035);
        r.battery = Math.max(0, r.battery - dischargeRate * dt);
      }

      // AMRs parked in their own Home Dock (Bay 1-6) stay in standby until assigned an order
      const isAtHomeBay = r.status && r.status.includes('Docked at Bay');
      if (isAtHomeBay) {
        r.battery = Math.min(100, r.battery + 4.0 * dt);
        return;
      }

      const distToCharger = Math.hypot(r.position.x - chargerStation.x, r.position.z - chargerStation.z);
      const isChargingAtStationD = distToCharger < 0.45 && (
        r.isReturningToCharge ||
        r.missionStationKey === 'charger' ||
        (r.missionStationName && r.missionStationName.includes('Station D')) ||
        (r.status && (r.status.includes('Charging') || r.status === 'Docked / Charging'))
      );

      if (isChargingAtStationD) {
        r.isCharging = true;
        r.battery = Math.min(100, r.battery + 4.5 * dt);
        if (!r.status.includes('Charging') && !r.status.includes('Docked')) {
          r.status = '⚡ Inductive Fast Charging';
        }
        if (r.battery >= 99.5 && !r.isAutoUndocking) {
          r.battery = 100;
          r.isCharging = false;
          r.isReturningToCharge = false;
          r.isAutoUndocking = true;
          setTimeout(() => { r.isAutoUndocking = false; }, 4000);
          r.isCustomMission = false;
          r.hasArrivedMission = false;
          r.speed = (r.type === 'drone' ? 1.4 : (r.type === 'humanoid' ? 0.85 : (r.id === 'AMR-02' ? 1.0 : 0.85)));

          if (this.dispatchFn) {
            const dockKey = r.homeDockKey || ('dock' + (parseInt(r.id.split('-')[1]) || 1));
            const homeDock = this.labStations && this.labStations[dockKey];
            if (homeDock) {
              this.dispatchFn(homeDock.pos, homeDock.name, r.id);
              r.isReturningHome = true;
            } else {
              const stA = this.labStations && this.labStations.inventory ? this.labStations.inventory.pos : null;
              const targetPos = stA ? stA : (r.waypoints && r.waypoints.length > 0 ? r.waypoints[0] : new THREE.Vector3(0, 0.05, 0));
              this.dispatchFn(targetPos, 'Station A: Parts Shelf', r.id);
            }
          }
        }
      } else {
        r.isCharging = false;
      }

      if (r.battery <= 20 && !r.isManualDrive && r.type === 'amr' && !r.isReturningToCharge && !r.isCharging && !r.status.includes('Docked') && !r.status.includes('Charging')) {
        r.isReturningToCharge = true;
        r.status = '⚡ Low Battery Return (<=20%)';
        if (r.currentOrder) {
          if (r.currentOrder.status === 'picking_up') {
            r.currentOrder.status = 'pending';
            r.currentOrder.assignedRobotId = null;
          }
          r.currentOrder = null;
        }
        const targetPos = new THREE.Vector3(chargerStation.x, 0.05, chargerStation.z);
        if (this.dispatchFn) {
          this.dispatchFn(targetPos, 'Station D: AMR Charger Dock', r.id);
        }
      }

      if (r.isReturningToCharge && r.battery >= 99.5) {
        r.isReturningToCharge = false;
      }
    });
  }

  processOrders(dt) {
    this.orders.forEach(order => {
      if (order.status === 'in_transit' || order.status === 'picking_up') {
        order.elapsedSeconds += dt;
      }
    });

    // Assign pending orders to idle AMRs, Humanoids, or Drones (drones alleviate waiting queues!)
    const pendingOrders = this.orders.filter(o => o.status === 'pending');
    for (const pendingOrder of pendingOrders) {
      let eligibleRobot = null;

      // 1. If urgent priority, prioritize high-speed aerial surveillance drones (UAV-01, UAV-02, UAV-03)
      if (pendingOrder.priority === 'urgent') {
        eligibleRobot = this.robotDefs.find(r => 
          r.enabled !== false &&
          r.type === 'drone' &&
          r.battery > 25 &&
          !r.currentOrder &&
          !r.isManualFlight
        );
      }

      // 2. If no drone yet or standard/routine tier: ALL robots (AMRs, Humanoid, AND Drones) are eligible!
      // This allows drones to step in dynamically and alleviate order waiting queues across campus!
      if (!eligibleRobot) {
        const availableRobots = this.robotDefs.filter(r => 
          r.enabled !== false &&
          r.battery > 25 &&
          !r.currentOrder &&
          !r.isManualDrive &&
          !r.isManualFlight &&
          !r.isReturningToCharge
        );

        if (availableRobots.length > 0) {
          // Sort by proximity to pickup hub so closest available robot is dispatched
          availableRobots.sort((a, b) => {
            const hubA = (a.type === 'drone') ? this.droneHubPos : this.groundHubPos;
            const hubB = (b.type === 'drone') ? this.droneHubPos : this.groundHubPos;
            const distA = Math.hypot(a.position.x - hubA.x, a.position.z - hubA.z);
            const distB = Math.hypot(b.position.x - hubB.x, b.position.z - hubB.z);
            return distA - distB;
          });
          eligibleRobot = availableRobots[0];
        }
      }

      if (eligibleRobot) {
        pendingOrder.status = 'picking_up';
        pendingOrder.assignedRobotId = eligibleRobot.id;
        eligibleRobot.currentOrder = pendingOrder;
        const pickupName = this.isCampus 
          ? (eligibleRobot.type === 'drone' ? 'Central Depot Helipad' : 'Central Depot Loading Bay')
          : (eligibleRobot.type === 'drone' ? 'Station E: Drone Helipad' : 'Station A: Parts Shelf');
        eligibleRobot.status = `Routing to ${pickupName} (${pendingOrder.id})`;

        // Route to appropriate pickup point (helipad for drone, bay for ground rover)
        const pickupPos = (eligibleRobot.type === 'drone') ? this.droneHubPos : this.groundHubPos;
        const pickupVec = new THREE.Vector3(pickupPos.x, pickupPos.y, pickupPos.z);
        if (this.dispatchFn) {
          this.dispatchFn(pickupVec, pickupName, eligibleRobot.id);
        }
      }
    }

    // Check robots picking up or delivering parcels
    this.robotDefs.forEach(r => {
      if (!r.currentOrder || r.enabled === false) return;
      const order = r.currentOrder;
      const pickupPos = (r.type === 'drone') ? this.droneHubPos : this.groundHubPos;

      // 1. At Central Depot: Pick up small yellow parcel
      if (order.status === 'picking_up') {
        const distToDepot = Math.min(
          Math.hypot(r.position.x - pickupPos.x, r.position.z - pickupPos.z),
          (r.type !== 'drone' && r.isCustomMission && r.target) ? Math.hypot(r.position.x - r.target.x, r.position.z - r.target.z) : Infinity
        );
        if (distToDepot < 0.65) {
          // Aerial Drones must touch down vertically on Central Depot Helipad before cargo loading
          if (r.type === 'drone') {
            if (!r.isLanded && r.position.y > 0.24) {
              r.isLanding = true;
              r.landingTarget = pickupPos;
              r.target.set(pickupPos.x, 0.22, pickupPos.z);
              r.status = 'Landing at Central Depot Helipad';
              return; // Wait for physical touchdown
            }
          }

          // Mount yellow parcel onto robot
          if (!r.parcelMesh && r.mesh) {
            const pMesh = createParcelBoxMesh(order.priority);
            if (r.type === 'drone') {
              pMesh.position.set(0, -0.12, 0); // slung underneath drone
            } else if (r.type === 'humanoid') {
              pMesh.position.set(0, 0.48, 0.16); // held at torso
            } else {
              pMesh.position.set(0, 0.26, 0); // AMR top cargo deck
            }
            r.mesh.add(pMesh);
            r.parcelMesh = pMesh;
          }

          // If drone, launch vertical takeoff climb before transit
          if (r.type === 'drone') {
            r.isLanded = false;
            r.isLanding = false;
            r.isAscending = true;
            r.landingTarget = null;
            r.speed = 1.4;
          }

          order.status = 'in_transit';
          this.packageStockpile = Math.max(0, this.packageStockpile - 1);
          if (this.depotObj && this.depotObj.instancedPackages) {
            this.depotObj.instancedPackages.count = Math.max(0, this.packageStockpile);
            this.depotObj.instancedPackages.instanceMatrix.needsUpdate = true;
          }
          r.status = `Delivering ${order.id} ➔ ${order.destBldg.name}`;

          // Dispatch to destination building drop-off bay or workstation
          const dropVec = new THREE.Vector3(order.destBldg.dropoff.x, order.destBldg.dropoff.y, order.destBldg.dropoff.z);
          const dropName = order.destBldg.name.includes('Station') ? order.destBldg.name : `${order.destBldg.name} Bay`;
          if (this.dispatchFn) {
            this.dispatchFn(dropVec, dropName, r.id);
          }
        }
      }

      // 2. At Destination Bay: Drop off parcel
      else if (order.status === 'in_transit') {
        const distToDest = Math.min(
          Math.hypot(r.position.x - order.destBldg.dropoff.x, r.position.z - order.destBldg.dropoff.z),
          (r.type !== 'drone' && r.isCustomMission && r.target) ? Math.hypot(r.position.x - r.target.x, r.position.z - r.target.z) : Infinity
        );
        if (distToDest < 0.65) {
          // Aerial Drones must touch down vertically on the ground at the destination building bay before drop-off
          if (r.type === 'drone') {
            if (!r.isLanded && r.position.y > 0.24) {
              r.isLanding = true;
              r.landingTarget = order.destBldg.dropoff;
              r.target.set(order.destBldg.dropoff.x, 0.22, order.destBldg.dropoff.z);
              r.status = `Landing at ${order.destBldg.name} Bay`;
              return; // Wait for physical touchdown
            }
          }

          order.status = 'delivered';
          order.deliveredAt = performance.now();
          this.deliveredCount++;
          if (order.elapsedSeconds <= order.slaSeconds) {
            this.onTimeCount++;
          }
          this.totalDeliveryTime += order.elapsedSeconds;

          // Increment package count at this specific destination building drop-off bay
          if (order.destBldg) {
            order.destBldg.deliveredCount = (order.destBldg.deliveredCount || 0) + 1;
            if (typeof order.destBldg.updateBayBadge === 'function') {
              order.destBldg.updateBayBadge();
            }
          }

          // Detach parcel from robot and place it at the destination building drop-off pad
          if (r.parcelMesh) {
            const deliveredMesh = r.parcelMesh;
            r.mesh.remove(deliveredMesh);
            r.parcelMesh = null;

            deliveredMesh.position.set(
              order.destBldg.dropoff.x + (Math.random() - 0.5) * 0.18,
              0.08,
              order.destBldg.dropoff.z + (Math.random() - 0.5) * 0.18
            );
            deliveredMesh.rotation.set(0, Math.random() * Math.PI, 0);
            this.scene.add(deliveredMesh);

            this.deliveredParcels = this.deliveredParcels || [];
            this.deliveredParcels.push({ mesh: deliveredMesh, createdAt: performance.now() });

            // Retain up to 25 delivered packages staged at drop-off bays across campus
            if (this.deliveredParcels.length > 25) {
              const oldest = this.deliveredParcels.shift();
              if (oldest && oldest.mesh && oldest.mesh.parent) {
                oldest.mesh.parent.remove(oldest.mesh);
              }
            }
          }

          // If drone, launch vertical takeoff climb to resume campus patrol
          if (r.type === 'drone') {
            r.isLanded = false;
            r.isLanding = false;
            r.isAscending = true;
            r.landingTarget = null;
          }

          r.currentOrder = null;
          r.isCustomMission = false;
          r.speed = (r.type === 'drone' ? 1.4 : (r.type === 'humanoid' ? 0.85 : (r.id === 'AMR-02' ? 1.0 : 0.85)));

          // AMRs return directly to their assigned Home Dock when delivery is completed
          if (r.type === 'amr') {
            const dockKey = r.homeDockKey || ('dock' + (parseInt(r.id.split('-')[1]) || 1));
            const dockStation = this.labStations && this.labStations[dockKey];
            if (dockStation && this.dispatchFn) {
              this.dispatchFn(dockStation.pos, dockStation.name, r.id);
              r.status = `Returning to ${dockStation.name}`;
              r.missionStationName = dockStation.name;
              r.isCustomMission = true;
              r.isReturningHome = true;
            } else if (r.waypoints && r.waypoints.length > 0) {
              r.waypointIdx = (r.waypointIdx + 1) % r.waypoints.length;
              r.target.copy(r.waypoints[r.waypointIdx]);
              r.status = 'Autonomous Cruising';
            }
          } else if (r.waypoints && r.waypoints.length > 0) {
            r.waypointIdx = (r.waypointIdx + 1) % r.waypoints.length;
            r.target.copy(r.waypoints[r.waypointIdx]);
            r.status = (r.type === 'drone' ? 'Ascending / Resuming Patrol' : 'Autonomous Cruising');
          }

          const banner = document.querySelector('.dispatch-banner');
          if (banner) {
            const onTimeStr = (order.elapsedSeconds <= order.slaSeconds) ? '⚡ On-Time SLA Met!' : '⚠️ SLA Delayed';
            const bayCount = order.destBldg ? (order.destBldg.deliveredCount || 1) : 1;
            banner.innerHTML = `<span>📦 <b>Delivered from Depot:</b> ${order.id} arrived at <b>${order.destBldg.name}</b> (Bay ${order.destBldg.code}: <b>${bayCount}</b> ${bayCount === 1 ? 'pkg' : 'pkgs'} received) • ${order.elapsedSeconds.toFixed(1)}s • ${onTimeStr}</span>`;
            setTimeout(() => {
              banner.innerHTML = `<span>🎯 <b>Interactive Dispatch Mode</b>: Click any point on the floor to route <span id="dispatch-target-name" style="color: #38bdf8;">${r.id}</span></span>`;
            }, 4000);
          }
        }
      }
    });
  }

  updateUI() {
    const box = document.getElementById('campus-logistics-box');
    if (!box) return;
    box.style.display = this.active ? 'block' : 'none';
    if (!this.active) return;

    const delCountEl = document.getElementById('logistics-delivered-count');
    const onTimeRateEl = document.getElementById('logistics-ontime-rate');
    const avgTimeEl = document.getElementById('logistics-avg-time');
    const activeOrdersEl = document.getElementById('logistics-active-orders');
    const stockEl = document.getElementById('logistics-stockpile-count');

    if (delCountEl) delCountEl.textContent = this.deliveredCount;
    if (stockEl) stockEl.textContent = this.packageStockpile;
    if (onTimeRateEl) {
      const rate = this.deliveredCount > 0 ? Math.round((this.onTimeCount / this.deliveredCount) * 100) : 100;
      onTimeRateEl.textContent = `${rate}%`;
    }
    if (avgTimeEl) {
      const avg = this.deliveredCount > 0 ? Math.round(this.totalDeliveryTime / this.deliveredCount) : 0;
      avgTimeEl.textContent = `${avg}s`;
    }
    if (activeOrdersEl) {
      const activeCount = this.orders.filter(o => o.status === 'in_transit' || o.status === 'picking_up').length;
      activeOrdersEl.textContent = activeCount;
    }

    const baySummaryEl = document.getElementById('logistics-bays-summary');
    if (baySummaryEl && this.destinations) {
      const activeBays = this.destinations.filter(d => (d.deliveredCount || 0) > 0);
      if (activeBays.length > 0) {
        baySummaryEl.style.display = 'block';
        baySummaryEl.innerHTML = `<span style="color: #38bdf8; font-weight: 700; margin-right: 4px;">📍 Bay Deliveries:</span> ` + 
          activeBays.map(b => `<span style="display: inline-block; background: rgba(14, 165, 233, 0.2); border: 1px solid rgba(14, 165, 233, 0.4); padding: 1px 5px; border-radius: 4px; color: #e0f2fe; margin: 1px 2px; font-weight: 600;">Bay ${b.code}: <b style="color: #38bdf8;">${b.deliveredCount}</b></span>`).join('');
      } else {
        baySummaryEl.style.display = 'none';
      }
    }

    const listEl = document.getElementById('logistics-orders-list');
    if (listEl) {
      if (this.orders.length === 0) {
        listEl.innerHTML = '<div style="font-size: 10px; color: #64748b; text-align: center; padding: 6px;">Depot inventory staged. Click "+ Dispatch" below.</div>';
      } else {
        listEl.innerHTML = this.orders.slice(0, 4).map(o => {
          const tier = SLA_TIERS[o.priority] || SLA_TIERS.standard;
          const pct = Math.min(100, Math.round((o.elapsedSeconds / o.slaSeconds) * 100));
          const isOver = o.elapsedSeconds > o.slaSeconds;
          const statusDesc = o.status === 'picking_up' ? `📦 Staging (${o.assignedRobotId})` : (o.status === 'in_transit' ? `🚚 In Transit (${o.assignedRobotId})` : (o.status === 'delivered' ? '✅ Delivered' : '⏳ Pending'));
          return `
            <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 5px 8px; margin-bottom: 4px; font-size: 10px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                <span style="font-weight: 700; color: ${tier.badge};">📦 ${o.id} • ${o.label}</span>
                <span style="font-size: 9px; color: ${isOver ? '#ef4444' : '#94a3b8'}; font-weight: 600;">${o.elapsedSeconds.toFixed(0)}s / ${o.slaSeconds}s</span>
              </div>
              <div style="display: flex; justify-content: space-between; color: #cbd5e1; font-size: 9px; margin-bottom: 3px;">
                <span>➔ Bldg ${o.destBldg.code}</span>
                <span>${statusDesc}</span>
              </div>
              <div style="height: 3px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden;">
                <div style="height: 100%; width: ${pct}%; background: ${isOver ? '#ef4444' : tier.badge}; transition: width 0.3s;"></div>
              </div>
            </div>
          `;
        }).join('');
      }
    }
  }
}
