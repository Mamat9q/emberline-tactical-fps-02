// Battlefield effects, all pooled: nothing is allocated while the game runs. Tracers
// are stretched boxes, impacts are small sparks, smoke is a growing translucent
// sphere, the echo pulse is a ground ring that swells and fades.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_COUNT = 24;
const SPARK_COUNT = 16;
const SMOKE_COUNT = 8;
const CASING_COUNT = 12;
const DECAL_COUNT = 8;

export function createEffects(scene) {
  const tracerMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0.85, depthWrite: false,
  });
  const tracerGeometry = new THREE.BoxGeometry(0.02, 0.02, 1);
  const tracers = [];
  for (let i = 0; i < TRACER_COUNT; i += 1) {
    const mesh = new THREE.Mesh(tracerGeometry, tracerMaterial);
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  let tracerNext = 0;

  const sparkMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd9a0'), transparent: true, opacity: 1, depthWrite: false });
  const sparkGeometry = new THREE.BoxGeometry(0.05, 0.05, 0.05);
  const sparks = [];
  for (let i = 0; i < SPARK_COUNT; i += 1) {
    const mesh = new THREE.Mesh(sparkGeometry, sparkMaterial);
    mesh.visible = false;
    scene.add(mesh);
    sparks.push({ mesh, life: 0, velocity: new THREE.Vector3() });
  }
  let sparkNext = 0;

  const smokeMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#b9b2a4'), transparent: true, opacity: 0.55, depthWrite: false,
  });
  const smokeGeometry = new THREE.SphereGeometry(1, 12, 10);
  const smokes = [];
  for (let i = 0; i < SMOKE_COUNT; i += 1) {
    const mesh = new THREE.Mesh(smokeGeometry, smokeMaterial);
    mesh.visible = false;
    scene.add(mesh);
    smokes.push({ mesh, life: 0, maxLife: 1, radius: 1 });
  }
  let smokeNext = 0;

  const pulseRing = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.06, 8, 48),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.hazard), transparent: true, opacity: 0, depthWrite: false }),
  );
  pulseRing.rotation.x = Math.PI / 2;
  pulseRing.visible = false;
  scene.add(pulseRing);
  const pulse = { active: false, radius: 0, life: 0 };

  // Spent shell casings: tiny brass boxes that pop out to the right, fall with
  // gravity and fade on the ground. Each slot has its own material for fading.
  const casingGeometry = new THREE.BoxGeometry(0.02, 0.02, 0.035);
  const casings = [];
  for (let i = 0; i < CASING_COUNT; i += 1) {
    const material = new THREE.MeshBasicMaterial({ color: new THREE.Color('#c9a227'), transparent: true, opacity: 1 });
    const mesh = new THREE.Mesh(casingGeometry, material);
    mesh.visible = false;
    scene.add(mesh);
    casings.push({ mesh, life: 0, velocity: new THREE.Vector3() });
  }
  let casingNext = 0;

  // Impact decals: dark scorch discs left on walls and ground where bullets hit,
  // so a firefight leaves a visible trace for a few seconds.
  const decalGeometry = new THREE.CircleGeometry(0.09, 12);
  const decals = [];
  for (let i = 0; i < DECAL_COUNT; i += 1) {
    const material = new THREE.MeshBasicMaterial({ color: new THREE.Color('#14100c'), transparent: true, opacity: 0.55, depthWrite: false });
    const mesh = new THREE.Mesh(decalGeometry, material);
    mesh.visible = false;
    scene.add(mesh);
    decals.push({ mesh, life: 0 });
  }
  let decalNext = 0;

  const explosionLight = new THREE.PointLight(new THREE.Color('#ff8c2e'), 0, 26);
  scene.add(explosionLight);
  const explosion = { life: 0, position: new THREE.Vector3() };

  const _mid = new THREE.Vector3();
  const _dir = new THREE.Vector3();

  function tracer(from, to) {
    const slot = tracers[tracerNext];
    tracerNext = (tracerNext + 1) % TRACER_COUNT;
    _mid.addVectors(from, to).multiplyScalar(0.5);
    _dir.subVectors(to, from);
    const length = _dir.length();
    slot.mesh.position.copy(_mid);
    slot.mesh.lookAt(to);
    slot.mesh.scale.set(1, 1, length);
    slot.mesh.visible = true;
    slot.life = 0.07;
  }

  function impact(point, normal) {
    for (let i = 0; i < 3; i += 1) {
      const slot = sparks[sparkNext];
      sparkNext = (sparkNext + 1) % SPARK_COUNT;
      slot.mesh.position.copy(point);
      slot.mesh.visible = true;
      slot.life = 0.22;
      slot.velocity.set(
        normal.x + (Math.random() * 2 - 1) * 0.9,
        Math.abs(normal.y) + Math.random() * 1.4,
        normal.z + (Math.random() * 2 - 1) * 0.9,
      ).multiplyScalar(2.4);
    }
    decal(point, normal);
  }

  function casing(from, yaw) {
    const slot = casings[casingNext];
    casingNext = (casingNext + 1) % CASING_COUNT;
    slot.mesh.position.copy(from);
    slot.mesh.visible = true;
    slot.mesh.material.opacity = 1;
    slot.life = 0.7;
    // Eject to the right of the shooter, slightly up and back.
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    slot.velocity.copy(right).multiplyScalar(1.4 + Math.random() * 0.6)
      .addScaledVector(forward, -0.6)
      .add(new THREE.Vector3(0, 2 + Math.random(), 0));
  }

  function decal(point, normal) {
    if (!normal || normal.lengthSq() < 0.01) return;
    const slot = decals[decalNext];
    decalNext = (decalNext + 1) % DECAL_COUNT;
    slot.mesh.position.copy(point).addScaledVector(normal, 0.01);
    slot.mesh.lookAt(point.x + normal.x, point.y + normal.y, point.z + normal.z);
    slot.mesh.visible = true;
    slot.mesh.material.opacity = 0.55;
    slot.life = 5;
  }

  function smoke(point, radius = 4.5, seconds = 14) {
    const slot = smokes[smokeNext];
    smokeNext = (smokeNext + 1) % SMOKE_COUNT;
    slot.mesh.position.set(point.x, 1.4, point.z);
    slot.mesh.scale.setScalar(0.4);
    slot.mesh.visible = true;
    slot.life = seconds;
    slot.maxLife = seconds;
    slot.radius = radius;
  }

  function startPulse(center) {
    pulseRing.position.set(center.x, 0.12, center.z);
    pulseRing.visible = true;
    pulseRing.scale.setScalar(0.5);
    pulse.active = true;
    pulse.radius = 0.5;
    pulse.life = 1.1;
  }

  function explode(point) {
    explosion.position.copy(point);
    explosion.life = 0.5;
    explosionLight.position.set(point.x, point.y + 1.2, point.z);
    explosionLight.intensity = 60;
    impact(point, new THREE.Vector3(0, 1, 0));
    impact(point, new THREE.Vector3(0, 1, 0));
  }

  function step(dt) {
    for (const slot of tracers) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      if (slot.life <= 0) slot.mesh.visible = false;
    }
    for (const slot of sparks) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      slot.mesh.position.addScaledVector(slot.velocity, dt);
      slot.velocity.y -= 9 * dt;
      slot.mesh.material.opacity = Math.max(0, slot.life / 0.22);
      if (slot.life <= 0) slot.mesh.visible = false;
    }
    for (const slot of smokes) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      const grow = 1 - slot.life / slot.maxLife;
      slot.mesh.scale.setScalar(0.4 + grow * slot.radius);
      slot.mesh.material.opacity = 0.55 * Math.min(1, slot.life / 3);
      if (slot.life <= 0) slot.mesh.visible = false;
    }
    for (const slot of casings) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      slot.mesh.position.addScaledVector(slot.velocity, dt);
      slot.velocity.y -= 12 * dt;
      if (slot.mesh.position.y <= 0.02) {
        slot.mesh.position.y = 0.02;
        slot.velocity.set(0, 0, 0);
      }
      slot.mesh.material.opacity = Math.min(1, slot.life / 0.3);
      if (slot.life <= 0) slot.mesh.visible = false;
    }
    for (const slot of decals) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      slot.mesh.material.opacity = 0.55 * Math.min(1, slot.life / 1);
      if (slot.life <= 0) slot.mesh.visible = false;
    }
    if (pulse.active) {
      pulse.life -= dt;
      pulse.radius += dt * 26;
      pulseRing.scale.setScalar(pulse.radius);
      pulseRing.material.opacity = Math.max(0, pulse.life / 1.1) * 0.85;
      if (pulse.life <= 0 || pulse.radius > 30) {
        pulse.active = false;
        pulseRing.visible = false;
      }
    }
    if (explosion.life > 0) {
      explosion.life -= dt;
      explosionLight.intensity = Math.max(0, explosion.life / 0.5) * 60;
    } else {
      explosionLight.intensity = 0;
    }
  }

  return { tracer, impact, smoke, startPulse, explode, casing, decal, step };
}
