// Procedural 3D models for the robot fleet: drone, Unitree G1 humanoid and AMR.
// Each factory returns { group, ...animated parts } for createRobotFleet() in app.js.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ==========================================
// 3D MODEL: INDUSTRIAL DRONE (UAV-01)
// ==========================================
export function createDroneMesh(colorHex, name) {
  const group = new THREE.Group();

  // 1. Central Carbon Fiber Fuselage & Battery Module
  const bodyGeo = new THREE.BoxGeometry(0.34, 0.09, 0.34);
  const carbonMat = new THREE.MeshStandardMaterial({
    color: 0x18181b,
    metalness: 0.65,
    roughness: 0.28
  });
  const body = new THREE.Mesh(bodyGeo, carbonMat);
  body.castShadow = true;
  group.add(body);

  // Top Yellow Avionics & GPS Pod
  const avionicsGeo = new THREE.BoxGeometry(0.14, 0.06, 0.16);
  const yellowMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.3 });
  const avionics = new THREE.Mesh(avionicsGeo, yellowMat);
  avionics.position.set(0, 0.07, -0.02);
  group.add(avionics);

  const domeGeo = new THREE.CylinderGeometry(0.035, 0.04, 0.03, 16);
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.2 });
  const dome = new THREE.Mesh(domeGeo, whiteMat);
  dome.position.set(0, 0.11, -0.02);
  group.add(dome);

  // Twin Telemetry Antennas
  const antGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.16, 8);
  const antMat = new THREE.MeshBasicMaterial({ color: 0x090d16 });
  [-0.07, 0.07].forEach(x => {
    const ant = new THREE.Mesh(antGeo, antMat);
    ant.position.set(x, 0.13, 0.06);
    group.add(ant);
  });

  // Lower Battery Bay (Dual Packs)
  const batGeo = new THREE.BoxGeometry(0.24, 0.07, 0.20);
  const batMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7 });
  const battery = new THREE.Mesh(batGeo, batMat);
  battery.position.set(0, -0.07, 0);
  group.add(battery);

  // 2. Tubular Carbon-Fiber Diagonal Arms & Motor Mounts
  const armAngles = [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4];
  const armLen = 0.42;
  const propellers = [];

  const armGeo = new THREE.CylinderGeometry(0.016, 0.016, armLen, 12);
  const motorGeo = new THREE.CylinderGeometry(0.042, 0.045, 0.05, 16);
  const motorMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, metalness: 0.85, roughness: 0.2 });

  armAngles.forEach((ang, idx) => {
    const armGroup = new THREE.Group();
    armGroup.rotation.y = ang;

    // Arm tube
    const arm = new THREE.Mesh(armGeo, carbonMat);
    arm.rotation.z = Math.PI / 2;
    arm.position.x = armLen / 2;
    arm.castShadow = true;
    armGroup.add(arm);

    // Motor Pod at arm tip
    const motor = new THREE.Mesh(motorGeo, motorMat);
    motor.position.set(armLen, 0.03, 0);
    motor.castShadow = true;
    armGroup.add(motor);

    // Propeller (Dual Aerodynamic Blades)
    const propGroup = new THREE.Group();
    propGroup.position.set(armLen, 0.065, 0);

    const bladeGeo = new THREE.BoxGeometry(0.38, 0.005, 0.025);
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4 });
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.castShadow = true;
    propGroup.add(blade);

    // Central spinner cone
    const spinGeo = new THREE.ConeGeometry(0.018, 0.03, 12);
    const spin = new THREE.Mesh(spinGeo, motorMat);
    spin.position.y = 0.015;
    propGroup.add(spin);

    armGroup.add(propGroup);
    propellers.push(propGroup);

    // Navigation Strobes on arm tips
    // Front-Right (Starboard): Green, Front-Left (Port): Red, Rear: White
    let strobeColor = 0xffffff;
    if (idx === 0) strobeColor = 0x22c55e; // Starboard Green
    if (idx === 1) strobeColor = 0xef4444; // Port Red
    const strobeGeo = new THREE.SphereGeometry(0.015, 8, 8);
    const strobeMat = new THREE.MeshBasicMaterial({ color: strobeColor });
    const strobe = new THREE.Mesh(strobeGeo, strobeMat);
    strobe.position.set(armLen + 0.04, 0.01, 0);
    armGroup.add(strobe);

    group.add(armGroup);
  });

  // 3. Landing Gear Skids
  const legMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5 });
  [-0.14, 0.14].forEach(x => {
    // Horizontal skid
    const skidGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.46, 12);
    skidGeo.rotateX(Math.PI / 2);
    const skid = new THREE.Mesh(skidGeo, legMat);
    skid.position.set(x, -0.22, 0);
    group.add(skid);

    // Vertical angled struts
    [-0.13, 0.13].forEach(z => {
      const strutGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.16, 8);
      strutGeo.rotateZ(x > 0 ? -0.25 : 0.25);
      const strut = new THREE.Mesh(strutGeo, legMat);
      strut.position.set(x * 0.75, -0.14, z);
      group.add(strut);
    });
  });

  // 4. Underside Camera Gimbal
  const gimbalGeo = new THREE.SphereGeometry(0.04, 16, 16);
  const gimbalMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.9, roughness: 0.1 });
  const gimbal = new THREE.Mesh(gimbalGeo, gimbalMat);
  gimbal.position.set(0, -0.11, 0.09);
  group.add(gimbal);

  // Status Beacon Light (Top)
  const beaconGeo = new THREE.SphereGeometry(0.02, 12, 12);
  const beaconMat = new THREE.MeshBasicMaterial({ color: colorHex });
  const beacon = new THREE.Mesh(beaconGeo, beaconMat);
  beacon.position.set(0, 0.13, -0.02);
  group.add(beacon);

  // Sized by the app (shared/robots.js).
  return {
    group,
    propellers,
    statusLight: beacon,
    gimbal
  };
}

// ==========================================
// 3D MODEL: UNITREE G1 EDU PLUS HUMANOID SILVER
// ==========================================
// ==========================================
// 3D MODEL: AUTHENTIC UNITREE G1 HUMANOID (FROM UNITREE_ROS DESCRIPTION)
// ==========================================
export function createUnitreeG1Mesh(colorHex, name) {
  const root = new THREE.Group();

  // Materials & Glow
  const visorGlowMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

  // 1. Master Pelvis / Hip Center (height: ~0.76m from ground matching G1 1.32m stature)
  const hipGroup = new THREE.Group();
  hipGroup.position.y = 0.76;
  root.add(hipGroup);

  // 2. Torso Group (joint: torso_joint at [0, 0.054, -0.004])
  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, 0.054, -0.004);
  hipGroup.add(torsoGroup);

  // 3. Head Group (attached to torso at [0, 0.326, 0.004])
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.326, 0.004);
  torsoGroup.add(headGroup);

  // Iconic Cyan LED Visor Strip (Inside G1 hollow halo visor)
  const eyeStripGeo = new THREE.BoxGeometry(0.11, 0.016, 0.025);
  const eyeStrip = new THREE.Mesh(eyeStripGeo, visorGlowMat);
  eyeStrip.position.set(0, 0.0, 0.075);
  headGroup.add(eyeStrip);

  // 4. Arms (Pivoting at shoulders on torso)
  const leftArm = new THREE.Group();
  leftArm.position.set(0.1002, 0.2378, 0.004);
  torsoGroup.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(-0.1002, 0.2378, 0.004);
  torsoGroup.add(rightArm);

  // 5. Legs (Hip Joint -> Thigh -> Knee Joint -> Shin & Foot)
  const leftLeg = new THREE.Group();
  leftLeg.position.set(0.0645, -0.1027, 0);
  hipGroup.add(leftLeg);

  const leftKnee = new THREE.Group();
  leftKnee.position.set(0.0541, -0.3366, 0);
  leftLeg.add(leftKnee);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(-0.0645, -0.1027, 0);
  hipGroup.add(rightLeg);

  const rightKnee = new THREE.Group();
  rightKnee.position.set(-0.0541, -0.3366, 0);
  rightLeg.add(rightKnee);

  // 6. Asynchronously stream authentic Unitree G1 description meshes
  const gltfLoader = new GLTFLoader();
  const setupMeshNode = (gltfScene, parentGroup) => {
    gltfScene.traverse(node => {
      if (node.isMesh) {
        node.castShadow = false; // Relieve GPU from rasterizing 401,124 triangles in shadow pass
        node.receiveShadow = true;
        if (node.material) {
          node.material.roughness = 0.28;
          node.material.metalness = 0.82;
        }
      }
    });
    parentGroup.add(gltfScene);
  };

  const g1PartFiles = [
    { url: 'models/g1/pelvis.glb', group: hipGroup },
    { url: 'models/g1/torso.glb', group: torsoGroup },
    { url: 'models/g1/head.glb', group: headGroup },
    { url: 'models/g1/left_arm.glb', group: leftArm },
    { url: 'models/g1/right_arm.glb', group: rightArm },
    { url: 'models/g1/left_thigh.glb', group: leftLeg },
    { url: 'models/g1/left_shin.glb', group: leftKnee },
    { url: 'models/g1/right_thigh.glb', group: rightLeg },
    { url: 'models/g1/right_shin.glb', group: rightKnee }
  ];

  g1PartFiles.forEach(part => {
    gltfLoader.load(
      part.url,
      (gltf) => setupMeshNode(gltf.scene, part.group),
      undefined,
      (err) => console.warn(`[Unitree G1] Notice loading ${part.url}:`, err)
    );
  });

  // Model at 1.32 m tall; the app sizes it to the scan (shared/robots.js).

  return {
    group: root,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    leftKnee,
    rightKnee,
    head: headGroup,
    statusLight: eyeStrip
  };
}

export function createRobotMesh(colorHex, name) {
  const group = new THREE.Group();

  const chassisGeo = new THREE.BoxGeometry(0.7, 0.16, 0.9);
  const chassisMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.6,
    roughness: 0.3
  });
  const chassis = new THREE.Mesh(chassisGeo, chassisMat);
  chassis.position.y = 0.14;
  chassis.castShadow = true;
  chassis.receiveShadow = true;
  group.add(chassis);

  const coverGeo = new THREE.BoxGeometry(0.66, 0.08, 0.86);
  const coverMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    metalness: 0.4,
    roughness: 0.2
  });
  const cover = new THREE.Mesh(coverGeo, coverMat);
  cover.position.y = 0.24;
  cover.castShadow = true;
  group.add(cover);

  const wheelGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.06, 24);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 });
  wheelGeo.rotateZ(Math.PI / 2);

  const leftWheel = new THREE.Mesh(wheelGeo, wheelMat);
  leftWheel.position.set(0.38, 0.12, 0.0);
  leftWheel.castShadow = true;
  group.add(leftWheel);

  const rightWheel = new THREE.Mesh(wheelGeo, wheelMat);
  rightWheel.position.set(-0.38, 0.12, 0.0);
  rightWheel.castShadow = true;
  group.add(rightWheel);

  const lidarBaseGeo = new THREE.CylinderGeometry(0.08, 0.09, 0.06, 16);
  const lidarBaseMat = new THREE.MeshStandardMaterial({ color: 0x090d16, metalness: 0.8 });
  const lidarBase = new THREE.Mesh(lidarBaseGeo, lidarBaseMat);
  lidarBase.position.set(0, 0.30, 0.25);
  group.add(lidarBase);

  const lidarPuckGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.05, 16);
  const lidarPuckMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.1, metalness: 0.9 });
  const lidarPuck = new THREE.Mesh(lidarPuckGeo, lidarPuckMat);
  lidarPuck.position.set(0, 0.35, 0.25);
  group.add(lidarPuck);

  const ringGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.02, 16);
  const ringMat = new THREE.MeshBasicMaterial({ color: colorHex });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.set(0, 0.32, 0.25);
  group.add(ring);

  const cargoGeo = new THREE.BoxGeometry(0.5, 0.22, 0.45);
  const cargoMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.2, roughness: 0.6 });
  const cargo = new THREE.Mesh(cargoGeo, cargoMat);
  cargo.position.set(0, 0.38, -0.15);
  cargo.castShadow = true;
  group.add(cargo);

  const lightL = new THREE.PointLight(0xffffff, 0.8, 4);
  lightL.position.set(0.2, 0.18, 0.48);
  group.add(lightL);

  const lightR = new THREE.PointLight(0xffffff, 0.8, 4);
  lightR.position.set(-0.2, 0.18, 0.48);
  group.add(lightR);

  // Sized by the app (shared/robots.js).
  return {
    group,
    lidar: lidarPuck,
    statusLight: ring,
    wheels: [leftWheel, rightWheel]
  };
}
