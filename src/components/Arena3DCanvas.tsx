import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { ArenaTheme, CharacterState, MatchStateSnapshot, TeamId } from '../shared/types';

interface Arena3DCanvasProps {
  snapshot: MatchStateSnapshot;
  arenaTheme: ArenaTheme;
  vfxQuality: 'Low' | 'Medium' | 'High';
  onFpsSample?: (fps: number) => void;
}

interface FighterRig {
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  trimMat: THREE.MeshStandardMaterial;
  contactShadow: THREE.Mesh;
}

const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();

function createFloorGridTexture(theme: ArenaTheme): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  if (theme === 'ModernStadium') {
    ctx.fillStyle = '#141c2b';
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 512; i += 64) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }
  } else if (theme === 'NeonBattleArena') {
    ctx.fillStyle = '#0c1020';
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 512; i += 48) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = '#1b1f26';
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.18)';
    ctx.lineWidth = 3;
    for (let i = -512; i < 1024; i += 64) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 512, 512);
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 2);
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildAthleticFighter(team: TeamId, shadowTex: THREE.CanvasTexture): FighterRig {
  const isBoy = team === 'BOY';
  const primaryColor = isBoy ? 0x2563eb : 0xec4899;
  const accentColor = isBoy ? 0x38bdf8 : 0xf472b6;
  const skinColor = isBoy ? 0xd9a27c : 0xe8b796;
  const hairColor = isBoy ? 0x1e293b : 0x3b1d2e;

  const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.55, metalness: 0.05 });
  const suitMat = new THREE.MeshStandardMaterial({ color: primaryColor, roughness: 0.35, metalness: 0.25 });
  const trimMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    roughness: 0.2,
    metalness: 0.7,
    emissive: accentColor,
    emissiveIntensity: 0.25,
  });
  const darkGearMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5, metalness: 0.4 });
  const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.65, metalness: 0.08 });

  const root = new THREE.Group();
  root.name = `Fighter_${team}`;

  const contactShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 1.5),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.7 })
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.02;
  root.add(contactShadow);

  const hips = new THREE.Group();
  hips.position.y = 0.96;
  root.add(hips);

  const pelvis = new THREE.Mesh(
    new THREE.CylinderGeometry(isBoy ? 0.21 : 0.19, isBoy ? 0.19 : 0.2, 0.26, 14),
    darkGearMat
  );
  pelvis.castShadow = true;
  hips.add(pelvis);

  const buildLeg = (zOffset: number) => {
    const legGroup = new THREE.Group();
    legGroup.position.set(0, -0.08, zOffset);

    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(isBoy ? 0.095 : 0.085, 0.3, 6, 10), skinMat);
    thigh.position.y = -0.22;
    thigh.castShadow = true;
    legGroup.add(thigh);

    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.072, 0.3, 6, 10), darkGearMat);
    shin.position.y = -0.56;
    shin.castShadow = true;
    legGroup.add(shin);

    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.14), trimMat);
    boot.position.set(0.04, -0.8, 0);
    boot.castShadow = true;
    legGroup.add(boot);

    return legGroup;
  };

  const leftLeg = buildLeg(-0.12);
  const rightLeg = buildLeg(0.12);
  hips.add(leftLeg, rightLeg);

  const torso = new THREE.Group();
  torso.position.y = 0.12;
  hips.add(torso);

  const chest = new THREE.Mesh(
    new THREE.CylinderGeometry(isBoy ? 0.26 : 0.22, isBoy ? 0.19 : 0.17, 0.52, 16),
    suitMat
  );
  chest.position.y = 0.28;
  chest.castShadow = true;
  torso.add(chest);

  const chestPlate = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.26, isBoy ? 0.44 : 0.38),
    trimMat
  );
  chestPlate.position.set(0.05, 0.34, 0);
  chestPlate.castShadow = true;
  torso.add(chestPlate);

  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.08, 16), trimMat);
  belt.position.y = 0.02;
  torso.add(belt);

  const head = new THREE.Group();
  head.position.y = 0.6;
  torso.add(head);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.14, 10), skinMat);
  neck.position.y = 0.04;
  head.add(neck);

  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.165, 16, 14), skinMat);
  cranium.position.y = 0.22;
  cranium.scale.set(1.0, 1.12, 0.94);
  cranium.castShadow = true;
  head.add(cranium);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.055, 0.26), trimMat);
  visor.position.set(0.11, 0.24, 0);
  head.add(visor);

  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.175, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.58),
    hairMat
  );
  hairCap.position.set(-0.02, 0.25, 0);
  head.add(hairCap);

  if (!isBoy) {
    const ponytail = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.34, 10), hairMat);
    ponytail.position.set(-0.2, 0.22, 0);
    ponytail.rotation.z = Math.PI * 0.65;
    head.add(ponytail);
  }

  const buildArm = (zOffset: number) => {
    const armGroup = new THREE.Group();
    armGroup.position.set(0, 0.48, zOffset);

    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 10), trimMat);
    armGroup.add(shoulder);

    const upperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.068, 0.24, 6, 10), skinMat);
    upperArm.position.y = -0.18;
    upperArm.castShadow = true;
    armGroup.add(upperArm);

    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.24, 6, 10), suitMat);
    forearm.position.set(0.08, -0.42, 0);
    forearm.rotation.z = 0.35;
    forearm.castShadow = true;
    armGroup.add(forearm);

    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 10), trimMat);
    glove.position.set(0.18, -0.58, 0);
    glove.castShadow = true;
    armGroup.add(glove);

    return armGroup;
  };

  const leftArm = buildArm(isBoy ? -0.31 : -0.26);
  const rightArm = buildArm(isBoy ? 0.31 : 0.26);
  torso.add(leftArm, rightArm);

  root.rotation.y = isBoy ? 0 : Math.PI;

  return {
    root,
    hips,
    torso,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    trimMat,
    contactShadow,
  };
}

function animateFighterRig(
  rig: FighterRig,
  state: CharacterState,
  leanDeg: number,
  t: number,
  dt: number,
  flashIntensity: number
) {
  rig.trimMat.emissiveIntensity = 0.25 + flashIntensity * 1.4;

  let targetTorsoLean = THREE.MathUtils.degToRad(leanDeg) * 0.55;
  let targetLeftArm = 1.1;
  let targetRightArm = 1.1;
  let targetHipsY = 0.96;
  let legStride = 0;

  switch (state) {
    case 'Idle':
      targetTorsoLean = 0.05;
      targetLeftArm = targetRightArm = 0.72 + Math.sin(t * 3) * 0.05;
      targetHipsY = 0.96 + Math.sin(t * 3) * 0.02;
      break;
    case 'Approach':
      targetTorsoLean = 0.25;
      targetLeftArm = targetRightArm = 1.15;
      legStride = Math.sin(t * 11) * 0.45;
      break;
    case 'Attack':
      targetTorsoLean = 0.48;
      targetLeftArm = 1.95 + Math.sin(t * 20) * 0.32;
      targetRightArm = 1.35 - Math.sin(t * 20) * 0.28;
      targetHipsY = 0.88;
      legStride = Math.sin(t * 14) * 0.4;
      break;
    case 'Push':
      targetTorsoLean = 0.38;
      targetLeftArm = targetRightArm = 1.48 + Math.sin(t * 10) * 0.08;
      targetHipsY = 0.88 + Math.abs(Math.sin(t * 8)) * 0.03;
      legStride = Math.sin(t * 9) * 0.35;
      break;
    case 'Resist':
    case 'Slide':
      targetTorsoLean = -0.2;
      targetLeftArm = targetRightArm = 1.35;
      targetHipsY = 0.84;
      legStride = -0.35;
      break;
    case 'Knockback':
      targetTorsoLean = -0.48 + Math.sin(t * 18) * 0.12;
      targetLeftArm = targetRightArm = 0.45;
      targetHipsY = 0.82;
      break;
    case 'Fall':
    case 'Defeat':
      targetTorsoLean = -1.25;
      targetLeftArm = targetRightArm = 0.2;
      targetHipsY = 0.42;
      break;
    case 'Victory':
      targetTorsoLean = -0.05;
      targetLeftArm = targetRightArm = 2.6 + Math.sin(t * 7) * 0.2;
      targetHipsY = 0.98 + Math.abs(Math.sin(t * 6)) * 0.12;
      break;
  }

  rig.torso.rotation.z = THREE.MathUtils.damp(rig.torso.rotation.z, -targetTorsoLean, 10, dt);
  rig.hips.position.y = THREE.MathUtils.damp(rig.hips.position.y, targetHipsY, 10, dt);
  rig.leftArm.rotation.z = THREE.MathUtils.damp(rig.leftArm.rotation.z, targetLeftArm, 12, dt);
  rig.rightArm.rotation.z = THREE.MathUtils.damp(rig.rightArm.rotation.z, targetRightArm, 12, dt);
  rig.leftLeg.rotation.z = THREE.MathUtils.damp(rig.leftLeg.rotation.z, legStride, 12, dt);
  rig.rightLeg.rotation.z = THREE.MathUtils.damp(rig.rightLeg.rotation.z, -legStride, 12, dt);
}

export const Arena3DCanvas: React.FC<Arena3DCanvasProps> = ({
  snapshot,
  arenaTheme,
  vfxQuality,
  onFpsSample,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const snapshotRef = useRef(snapshot);
  const themeRef = useRef(arenaTheme);
  const vfxRef = useRef(vfxQuality);
  const onFpsRef = useRef(onFpsSample);
  const [contextLost, setContextLost] = useState(false);

  snapshotRef.current = snapshot;
  themeRef.current = arenaTheme;
  vfxRef.current = vfxQuality;
  onFpsRef.current = onFpsSample;

  useEffect(() => {
    const mount = containerRef.current;
    if (!mount) return;

    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(mount.clientWidth || 405, mount.clientHeight || 720);

    mount.innerHTML = '';
    mount.appendChild(renderer.domElement);

    const handleLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const handleRestored = () => setContextLost(false);
    renderer.domElement.addEventListener('webglcontextlost', handleLost);
    renderer.domElement.addEventListener('webglcontextrestored', handleRestored);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070b14);
    scene.fog = new THREE.FogExp2(0x070b14, 0.028);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(
      42,
      (mount.clientWidth || 405) / (mount.clientHeight || 720),
      0.1,
      120
    );
    camera.position.set(0, 3.85, 11.4);
    camera.lookAt(0, 0.9, 0);

    const hemi = new THREE.HemisphereLight(0x93c5fd, 0x1e1b4b, 0.75);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.9);
    keyLight.position.set(5, 11, 7);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -8;
    keyLight.shadow.camera.right = 8;
    keyLight.shadow.camera.top = 6;
    keyLight.shadow.camera.bottom = -6;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const boyRimLight = new THREE.PointLight(0x3b82f6, 3.5, 14);
    boyRimLight.position.set(-5.5, 3.2, -3);
    scene.add(boyRimLight);

    const girlRimLight = new THREE.PointLight(0xec4899, 3.5, 14);
    girlRimLight.position.set(5.5, 3.2, -3);
    scene.add(girlRimLight);

    const stageGroup = new THREE.Group();
    scene.add(stageGroup);

    let floorTex: THREE.CanvasTexture | null = null;
    const disposableGeos: THREE.BufferGeometry[] = [];
    const disposableMats: THREE.Material[] = [];
    let boyLineMesh: THREE.Mesh | null = null;
    let girlLineMesh: THREE.Mesh | null = null;
    let boyBoundMat: THREE.MeshBasicMaterial | null = null;
    let girlBoundMat: THREE.MeshBasicMaterial | null = null;

    const buildArenaStage = (theme: ArenaTheme) => {
      while (stageGroup.children.length > 0) {
        stageGroup.remove(stageGroup.children[0]);
      }
      floorTex?.dispose();
      floorTex = createFloorGridTexture(theme);
      floorTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

      const bgHex =
        theme === 'ModernStadium' ? 0x080d1a : theme === 'NeonBattleArena' ? 0x050814 : 0x120f14;
      scene.background = new THREE.Color(bgHex);
      (scene.fog as THREE.FogExp2).color.setHex(bgHex);

      const deckGeo = new THREE.BoxGeometry(13.2, 0.6, 6.2);
      const deckMat = new THREE.MeshStandardMaterial({
        map: floorTex,
        roughness: theme === 'NeonBattleArena' ? 0.25 : 0.62,
        metalness: theme === 'ExtremePlatformArena' ? 0.55 : 0.25,
      });
      disposableGeos.push(deckGeo);
      disposableMats.push(deckMat);
      const deck = new THREE.Mesh(deckGeo, deckMat);
      deck.position.y = -0.3;
      deck.receiveShadow = true;
      stageGroup.add(deck);

      const centerGeo = new THREE.PlaneGeometry(0.14, 5.8);
      const centerMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
      disposableGeos.push(centerGeo);
      disposableMats.push(centerMat);
      const centerLine = new THREE.Mesh(centerGeo, centerMat);
      centerLine.rotation.x = -Math.PI / 2;
      centerLine.position.y = 0.015;
      stageGroup.add(centerLine);

      const boundGeo = new THREE.PlaneGeometry(0.32, 5.95);
      boyBoundMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6 });
      girlBoundMat = new THREE.MeshBasicMaterial({ color: 0xec4899 });
      disposableGeos.push(boundGeo);
      disposableMats.push(boyBoundMat, girlBoundMat);

      boyLineMesh = new THREE.Mesh(boundGeo, boyBoundMat);
      boyLineMesh.rotation.x = -Math.PI / 2;
      boyLineMesh.position.set(-5.5, 0.018, 0);
      stageGroup.add(boyLineMesh);

      girlLineMesh = new THREE.Mesh(boundGeo, girlBoundMat);
      girlLineMesh.rotation.x = -Math.PI / 2;
      girlLineMesh.position.set(5.5, 0.018, 0);
      stageGroup.add(girlLineMesh);

      const standGeo = new THREE.BoxGeometry(16, 2.2, 3.2);
      const standMat = new THREE.MeshStandardMaterial({
        color: theme === 'NeonBattleArena' ? 0x0f172a : 0x1e293b,
        roughness: 0.75,
        metalness: 0.2,
      });
      disposableGeos.push(standGeo);
      disposableMats.push(standMat);
      const backStand = new THREE.Mesh(standGeo, standMat);
      backStand.position.set(0, 0.6, -5.8);
      stageGroup.add(backStand);

      const pylonGeo = new THREE.CylinderGeometry(0.12, 0.18, 6.2, 10);
      const pylonMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.3 });
      disposableGeos.push(pylonGeo);
      disposableMats.push(pylonMat);

      [-6.2, -2.2, 2.2, 6.2].forEach((px, idx) => {
        const pylon = new THREE.Mesh(pylonGeo, pylonMat);
        pylon.position.set(px, 2.8, -4.1);
        stageGroup.add(pylon);

        const beaconGeo = new THREE.BoxGeometry(0.7, 0.25, 0.25);
        const beaconMat = new THREE.MeshBasicMaterial({ color: idx < 2 ? 0x38bdf8 : 0xf472b6 });
        disposableGeos.push(beaconGeo);
        disposableMats.push(beaconMat);
        const beacon = new THREE.Mesh(beaconGeo, beaconMat);
        beacon.position.set(px, 5.7, -4.0);
        stageGroup.add(beacon);
      });
    };

    let activeBuiltTheme: ArenaTheme = themeRef.current;
    buildArenaStage(activeBuiltTheme);

    const shadowTex = createContactShadowTexture();
    const boyRig = buildAthleticFighter('BOY', shadowTex);
    const girlRig = buildAthleticFighter('GIRL', shadowTex);
    boyRig.root.position.set(-0.75, 0, 0);
    girlRig.root.position.set(0.75, 0, 0);
    scene.add(boyRig.root, girlRig.root);

    // Expanding Push Shockwave Ring triggered on every Chat/Gift push!
    const waveGeo = new THREE.RingGeometry(0.45, 0.62, 32);
    const waveMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const shockwaveMesh = new THREE.Mesh(waveGeo, waveMat);
    shockwaveMesh.rotation.x = -Math.PI / 2;
    shockwaveMesh.position.y = 0.05;
    scene.add(shockwaveMesh);

    // Pooled Impact Sparks
    const PARTICLE_COUNT = 48;
    const sparkGeo = new THREE.OctahedronGeometry(0.065, 0);
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    const sparkPool = new THREE.InstancedMesh(sparkGeo, sparkMat, PARTICLE_COUNT);
    sparkPool.frustumCulled = false;
    scene.add(sparkPool);

    const sparkState = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      angle: (i / PARTICLE_COUNT) * Math.PI * 2,
      speed: 1.4 + (i % 5) * 0.45,
      heightOffset: (i % 4) * 0.35 + 0.6,
      phase: (i * 0.37) % 1,
    }));
    const dummy = new THREE.Object3D();

    if (!isSoftwareGl) renderer.compile(scene, camera);

    const clock = new THREE.Clock();
    let frameId = 0;
    let destroyed = false;
    let fpsFrames = 0;
    let fpsAccum = 0;

    let lastCalloutId: string | null = null;
    let shockwaveTimer = 0;
    let boyFlashTimer = 0;
    let girlFlashTimer = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (destroyed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) frameId = window.setTimeout(poll, 5);
        else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (destroyed) return;
      const dt = Math.min(0.08, clock.getDelta());
      const elapsed = clock.getElapsedTime();

      fpsFrames += 1;
      fpsAccum += dt;
      if (fpsAccum >= 1.0) {
        onFpsRef.current?.(Math.round(fpsFrames / fpsAccum));
        fpsFrames = 0;
        fpsAccum = 0;
      }

      if (themeRef.current !== activeBuiltTheme) {
        activeBuiltTheme = themeRef.current;
        buildArenaStage(activeBuiltTheme);
      }

      const snap = snapshotRef.current;

      // Detect new Chat or Gift action to fire shockwave & flash feedback
      if (snap.lastActionCallout && snap.lastActionCallout.id !== lastCalloutId) {
        lastCalloutId = snap.lastActionCallout.id;
        shockwaveTimer = snap.lastActionCallout.kind === 'GIFT' ? 0.55 : 0.38;
        if (snap.lastActionCallout.team === 'BOY') {
          waveMat.color.setHex(0x38bdf8);
          boyFlashTimer = 0.45;
        } else if (snap.lastActionCallout.team === 'GIRL') {
          waveMat.color.setHex(0xf472b6);
          girlFlashTimer = 0.45;
        } else {
          waveMat.color.setHex(0xfacc15);
        }
      }

      boyFlashTimer = Math.max(0, boyFlashTimer - dt);
      girlFlashTimer = Math.max(0, girlFlashTimer - dt);

      // Update expanding shockwave ring
      const clashMidX = (boyRig.root.position.x + girlRig.root.position.x) * 0.5;
      if (shockwaveTimer > 0) {
        shockwaveTimer = Math.max(0, shockwaveTimer - dt);
        const progress = 1 - shockwaveTimer / 0.55;
        const scale = 0.7 + progress * 3.4;
        shockwaveMesh.position.x = clashMidX;
        shockwaveMesh.scale.set(scale, scale, 1);
        waveMat.opacity = (1 - progress) * 0.85;
      } else {
        waveMat.opacity = 0;
      }

      // Near-win boundary warning glow
      if (boyLineMesh && girlLineMesh && boyBoundMat && girlBoundMat) {
        boyLineMesh.position.x = -snap.boundaryHalfWidth;
        girlLineMesh.position.x = snap.boundaryHalfWidth;
        const pulse = 0.5 + 0.5 * Math.sin(elapsed * 14);
        if (snap.nearWinTeam === 'GIRL') {
          // GIRL pushing BOY toward left edge (-boundary)
          boyBoundMat.color.setHex(pulse > 0.5 ? 0xef4444 : 0xfacc15);
          girlBoundMat.color.setHex(0xec4899);
        } else if (snap.nearWinTeam === 'BOY') {
          // BOY pushing GIRL toward right edge (+boundary)
          girlBoundMat.color.setHex(pulse > 0.5 ? 0xef4444 : 0xfacc15);
          boyBoundMat.color.setHex(0x3b82f6);
        } else {
          boyBoundMat.color.setHex(0x3b82f6);
          girlBoundMat.color.setHex(0xec4899);
        }
      }

      // Fighters
      boyRig.root.position.x = THREE.MathUtils.damp(boyRig.root.position.x, snap.boy.positionX, 14, dt);
      girlRig.root.position.x = THREE.MathUtils.damp(girlRig.root.position.x, snap.girl.positionX, 14, dt);

      animateFighterRig(boyRig, snap.boy.state, snap.boy.leanAngleDeg, elapsed, dt, boyFlashTimer);
      animateFighterRig(girlRig, snap.girl.state, snap.girl.leanAngleDeg, elapsed, dt, girlFlashTimer);

      // Contact sparks
      const inClash = snap.phase === 'Clash' || snap.phase === 'Overtime';
      const activeSparks =
        vfxRef.current === 'Low' ? 12 : vfxRef.current === 'Medium' ? 28 : PARTICLE_COUNT;

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        if (!inClash || i >= activeSparks) {
          dummy.scale.setScalar(0);
          dummy.updateMatrix();
          sparkPool.setMatrixAt(i, dummy.matrix);
          continue;
        }
        const sp = sparkState[i];
        const p = (elapsed * sp.speed + sp.phase) % 1;
        const radius = p * (shockwaveTimer > 0 ? 1.45 : 0.9);
        dummy.position.set(
          clashMidX + Math.cos(sp.angle) * radius * 0.65,
          sp.heightOffset + Math.sin(p * Math.PI) * 0.55,
          Math.sin(sp.angle) * radius
        );
        dummy.scale.setScalar((1 - p) * (shockwaveTimer > 0 ? 1.45 : 1.05));
        dummy.rotation.set(elapsed * 4, elapsed * 3, 0);
        dummy.updateMatrix();
        sparkPool.setMatrixAt(i, dummy.matrix);
      }
      sparkPool.instanceMatrix.needsUpdate = true;

      _vec3A.set(clashMidX * 0.45, 3.8, 10.4);
      camera.position.lerp(_vec3A, 1 - Math.exp(-4 * dt));
      _vec3B.set(clashMidX * 0.65, 1.15, 0);
      camera.lookAt(_vec3B);

      renderer.render(scene, camera);

      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    }

    tick();

    const handleResize = () => {
      if (!mount) return;
      const w = mount.clientWidth || 405;
      const h = mount.clientHeight || 720;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      destroyed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('webglcontextlost', handleLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleRestored);
      floorTex?.dispose();
      shadowTex.dispose();
      waveGeo.dispose();
      waveMat.dispose();
      sparkGeo.dispose();
      sparkMat.dispose();
      disposableGeos.forEach((g) => g.dispose());
      disposableMats.forEach((m) => m.dispose());
      renderer.dispose();
    };
  }, []);

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-950">
      <div ref={containerRef} className="w-full h-full" />
      {contextLost && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90 text-sm text-slate-200 p-4 text-center">
          WebGL context tạm ngưng. Đang khôi phục đấu trường 3D...
        </div>
      )}
    </div>
  );
};
