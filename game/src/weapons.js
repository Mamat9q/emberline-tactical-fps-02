// The arsenal: five guns with one job each. Damage, fire rate, spread and recoil are
// tuned so stopping to aim pays and spraying on the move does not. Bots read the
// same table, so a bot's rifle and the player's rifle are the same weapon.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  p2000: {
    id: 'p2000', name: 'P2000', price: 0, damage: 34, headMult: 2, pellets: 1,
    mag: 12, reserve: 48, gap: 0.14, reload: 1.4, auto: false,
    spreadStill: 0.004, spreadMove: 0.03, kick: 0.008, range: 60, zoom: 1,
  },
  vk9: {
    id: 'vk9', name: 'VK-9 SMG', price: 900, damage: 26, headMult: 2, pellets: 1,
    mag: 28, reserve: 112, gap: 0.08, reload: 1.7, auto: true,
    spreadStill: 0.006, spreadMove: 0.034, kick: 0.006, range: 45, zoom: 1,
  },
  ar77: {
    id: 'ar77', name: 'AR-77', price: 2700, damage: 33, headMult: 2, pellets: 1,
    mag: 30, reserve: 90, gap: 0.1, reload: 1.9, auto: true,
    spreadStill: 0.0022, spreadMove: 0.028, kick: 0.009, range: 80, zoom: 1,
  },
  longshot: {
    id: 'longshot', name: 'Longshot DMR', price: 4200, damage: 88, headMult: 2.2, pellets: 1,
    mag: 5, reserve: 20, gap: 0.9, reload: 2.6, auto: false,
    spreadStill: 0.0008, spreadMove: 0.02, kick: 0.02, range: 100, zoom: 1.6,
  },
  m870: {
    id: 'm870', name: 'M870 Breacher', price: 1600, damage: 12, headMult: 1.8, pellets: 8,
    mag: 6, reserve: 24, gap: 0.75, reload: 2.4, auto: false,
    spreadStill: 0.02, spreadMove: 0.05, kick: 0.016, range: 25, zoom: 1,
  },
};

const GRIP = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steel), roughness: 0.7, metalness: 0.2 });
const BODY = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2a2d33'), roughness: 0.45, metalness: 0.5 });
const DARK = new THREE.MeshStandardMaterial({ color: new THREE.Color('#211d1a'), roughness: 0.6, metalness: 0.3 });
const ACCENT = new THREE.MeshStandardMaterial({
  color: new THREE.Color(PALETTE.hazard), roughness: 0.4, metalness: 0.2,
  emissive: new THREE.Color(PALETTE.hazard), emissiveIntensity: 0.25,
});

function part(geometry, material, x, y, z) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  return mesh;
}

// A cylinder lying along the barrel axis (z), for scopes and barrels.
function barrelPart(radius, length, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 10), material);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, z);
  return mesh;
}

// One view model per gun, built from boxes; the silhouette is what tells them apart.
// Dark gunmetal receivers with a teal accent so the gun reads as a rifle, not a plank.
function buildModel(id) {
  const model = new THREE.Group();
  if (id === 'p2000') {
    model.add(part(new THREE.BoxGeometry(0.05, 0.06, 0.26), BODY, 0, 0.01, -0.1));
    model.add(part(new THREE.BoxGeometry(0.045, 0.1, 0.07), DARK, 0, -0.07, 0.06));
    model.add(part(new THREE.BoxGeometry(0.012, 0.02, 0.012), ACCENT, 0, 0.05, -0.22));
    model.add(part(new THREE.BoxGeometry(0.04, 0.02, 0.05), DARK, 0, -0.12, 0.05));
  } else if (id === 'vk9') {
    model.add(part(new THREE.BoxGeometry(0.08, 0.09, 0.34), BODY, 0, 0, -0.08));
    model.add(part(new THREE.BoxGeometry(0.05, 0.05, 0.3), DARK, 0, 0.01, -0.34));
    model.add(part(new THREE.BoxGeometry(0.05, 0.14, 0.05), DARK, 0, -0.1, -0.02));
    model.add(part(new THREE.BoxGeometry(0.06, 0.07, 0.12), BODY, 0, -0.01, 0.18));
    model.add(part(new THREE.BoxGeometry(0.02, 0.03, 0.06), ACCENT, 0, 0.06, -0.08));
  } else if (id === 'ar77') {
    model.add(part(new THREE.BoxGeometry(0.09, 0.09, 0.4), BODY, 0, 0, -0.1));
    model.add(part(new THREE.BoxGeometry(0.08, 0.07, 0.24), DARK, 0, 0, -0.38));
    model.add(barrelPart(0.016, 0.18, GRIP, 0, 0.01, -0.55));
    model.add(part(new THREE.BoxGeometry(0.05, 0.12, 0.09), DARK, 0, -0.1, -0.05));
    model.add(part(new THREE.BoxGeometry(0.07, 0.08, 0.2), BODY, 0, -0.01, 0.2));
    model.add(part(new THREE.BoxGeometry(0.02, 0.035, 0.08), ACCENT, 0, 0.065, -0.08));
    model.add(part(new THREE.BoxGeometry(0.04, 0.08, 0.05), DARK, 0, -0.08, -0.32));
  } else if (id === 'longshot') {
    model.add(part(new THREE.BoxGeometry(0.08, 0.08, 0.5), BODY, 0, 0, -0.16));
    model.add(barrelPart(0.035, 0.16, DARK, 0, 0.08, -0.12));
    model.add(barrelPart(0.018, 0.34, GRIP, 0, 0.01, -0.55));
    model.add(part(new THREE.BoxGeometry(0.05, 0.1, 0.07), DARK, 0, -0.09, -0.02));
    model.add(part(new THREE.BoxGeometry(0.06, 0.08, 0.18), BODY, 0, -0.01, 0.22));
    model.add(part(new THREE.BoxGeometry(0.03, 0.03, 0.06), ACCENT, 0.05, 0.02, 0.05));
  } else {
    model.add(part(new THREE.BoxGeometry(0.1, 0.1, 0.38), BODY, 0, 0, -0.08));
    model.add(barrelPart(0.026, 0.4, GRIP, 0, 0.02, -0.4));
    model.add(part(new THREE.BoxGeometry(0.07, 0.06, 0.14), DARK, 0, -0.03, -0.32));
    model.add(part(new THREE.BoxGeometry(0.06, 0.09, 0.16), BODY, 0, -0.01, 0.2));
    model.add(part(new THREE.BoxGeometry(0.012, 0.02, 0.012), ACCENT, 0, 0.06, -0.58));
  }
  model.position.set(0.26, -0.21, -0.46);
  model.scale.setScalar(0.9);
  return model;
}

export function createWeaponView(camera) {
  // Muzzle flash: a 4-point starburst drawn on a canvas, additively blended so
  // it reads as a flash of light instead of a flat amber card.
  const flashCanvas = document.createElement('canvas');
  flashCanvas.width = 128;
  flashCanvas.height = 128;
  const fctx = flashCanvas.getContext('2d');
  fctx.fillStyle = 'rgba(255, 220, 130, 1)';
  fctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    const r = i % 2 === 0 ? 62 : 14;
    const x = 64 + Math.cos(angle) * r;
    const y = 64 + Math.sin(angle) * r;
    if (i === 0) fctx.moveTo(x, y);
    else fctx.lineTo(x, y);
  }
  fctx.closePath();
  fctx.fill();
  const core = fctx.createRadialGradient(64, 64, 0, 64, 64, 18);
  core.addColorStop(0, 'rgba(255, 250, 230, 1)');
  core.addColorStop(1, 'rgba(255, 220, 130, 0)');
  fctx.fillStyle = core;
  fctx.beginPath();
  fctx.arc(64, 64, 18, 0, Math.PI * 2);
  fctx.fill();
  const flashTexture = new THREE.CanvasTexture(flashCanvas);
  flashTexture.colorSpace = THREE.SRGBColorSpace;
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({
      map: flashTexture, transparent: true, opacity: 0.95, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.amber), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const models = {};
  let model = null;
  const state = {
    id: 'p2000', mag: 12, reserve: 48, cooldown: 0, reloadLeft: 0,
    flash: 0, kick: 0, bloom: 0, walkPhase: 0,
  };

  function equip(id) {
    if (model) camera.remove(model);
    if (!models[id]) models[id] = buildModel(id);
    model = models[id];
    camera.add(model);
    const def = WEAPONS[id];
    state.id = id;
    state.mag = def.mag;
    state.reserve = def.reserve;
    state.cooldown = 0;
    state.reloadLeft = 0;
    state.flash = 0;
    state.kick = 0;
    state.bloom = 0;
  }
  equip('p2000');

  // speed: player ground speed (m/s) for the walk bob; ads: aim-down-sights,
  // which centres the model, steadies the bob and (in main.js) narrows the FOV.
  function step(dt, speed = 0, ads = false) {
    const def = WEAPONS[state.id];
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.bloom = Math.max(0, state.bloom - dt * 1.6);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    state.walkPhase += dt * (2 + speed * 1.6);
    if (model) {
      const bob = Math.min(1, speed / 5.2);
      const targetX = ads ? 0.02 : 0.26;
      const targetY = ads ? -0.16 : -0.21;
      model.position.x += (targetX - model.position.x) * Math.min(1, dt * 10);
      model.position.y = targetY + Math.sin(state.walkPhase * 2) * 0.006 * bob;
      model.position.z = -0.46 + state.kick + Math.cos(state.walkPhase) * 0.004 * bob;
      model.rotation.x = state.kick * 2.2;
      model.rotation.z = Math.sin(state.walkPhase) * 0.008 * bob;
      if (state.reloadLeft > 0) model.rotation.x = -0.55 * Math.min(1, (def.reload - state.reloadLeft) * 2);
      // The muzzle flash rides with the model so it stays on the barrel.
      flash.position.x = model.position.x;
      flash.position.y = model.position.y + 0.03;
      flashLight.position.set(model.position.x, model.position.y + 0.05, -0.6);
    }
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      if (state.reloadLeft === 0) {
        const need = def.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    step,
    equip,
    def() {
      return WEAPONS[state.id];
    },
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = WEAPONS[state.id].gap;
      state.flash = 0.06;
      state.kick = 0.055;
      state.bloom = Math.min(1, state.bloom + 0.14);
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      const def = WEAPONS[state.id];
      if (state.reloadLeft > 0 || state.mag === def.mag || state.reserve === 0) return false;
      state.reloadLeft = def.reload;
      return true;
    },
    spread(speed) {
      const def = WEAPONS[state.id];
      const move = def.spreadStill + Math.min(1, speed / 5.2) * def.spreadMove;
      return move + state.bloom * 0.02;
    },
    refillAmmo() {
      const def = WEAPONS[state.id];
      state.mag = def.mag;
      state.reserve = def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.bloom = 0;
    },
  };
}
