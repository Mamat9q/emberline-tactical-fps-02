// EMBERLINE — boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. ?shot=start|play|plant|end with &seed=N sets up a deterministic
// frame for a capture, renders it, then sets window.__shotReady. No network, no
// external assets: three.js comes from the vendored copy under game/vendor.
import * as THREE from 'three';
import { createWorld, MAP } from './world.js';
import { createPlayer } from './player.js';
import { createInput } from './input.js';
import { createWeaponView, WEAPONS } from './weapons.js';
import { createBots } from './bots.js';
import { createMatch } from './match.js';
import { createEffects } from './effects.js';
import { createHud } from './hud.js';
import { audio } from './audio.js';

const FIXED_DT = 1 / 60;
const PULSE_COOLDOWN = 20;
const PULSE_RADIUS = 30;
const PULSE_REVEAL_SECONDS = 3;
const PLAYER_NAME = 'Ember';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') || '1', 10) || 1;

const canvas = document.getElementById('scene');
const lowfx = params.has('lowfx'); // headless-probe mode: no antialiasing, no
// shadow maps — SwiftShader renders the scene 2-3x faster, so the sim runs
// at 0.2-0.3x instead of 0.05x under load. Inert in normal play (the param
// is never set by the game itself); the shipped game always renders full
// quality.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowfx });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = !lowfx;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#1b1626');
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 400);
camera.rotation.order = 'YXZ';
scene.add(camera);

const world = createWorld(scene, { lowfx });
const effects = createEffects(scene);
const hud = createHud();
const input = createInput(canvas, (locked) => {
  if (!locked && playing && match.state.phase !== 'matchEnd' && match.state.phase !== 'buy' && match.state.phase !== 'roundEnd') hud.showOverlay('paused');
});
canvas.addEventListener('click', () => {
  if (playing && !input.state.locked && match.state.phase !== 'menu') input.requestLock();
});

// --- Player hit boxes: invisible, so bot raycasts can tell body from head ---
const playerBodyMesh = new THREE.Mesh(
  new THREE.BoxGeometry(0.68, 1.72, 0.68),
  new THREE.MeshBasicMaterial({ visible: false }),
);
playerBodyMesh.userData.part = 'torso';
const playerHeadMesh = new THREE.Mesh(
  new THREE.BoxGeometry(0.4, 0.35, 0.4),
  new THREE.MeshBasicMaterial({ visible: false }),
);
playerHeadMesh.userData.part = 'head';
scene.add(playerBodyMesh, playerHeadMesh);
const playerHitMeshes = [playerBodyMesh, playerHeadMesh];

// --- The bomb in the world: a dark case with a blinking amber light ---
const bombMesh = new THREE.Group();
const bombCase = new THREE.Mesh(
  new THREE.BoxGeometry(0.42, 0.24, 0.3),
  new THREE.MeshStandardMaterial({ color: new THREE.Color('#211d1a'), roughness: 0.5, metalness: 0.4 }),
);
const bombLight = new THREE.Mesh(
  new THREE.SphereGeometry(0.06, 10, 8),
  new THREE.MeshBasicMaterial({ color: new THREE.Color('#f0a830') }),
);
bombLight.position.set(0.14, 0.16, 0);
bombMesh.add(bombCase, bombLight);
bombMesh.visible = false;
scene.add(bombMesh);

// --- State ---
const player = createPlayer(world.colliders, MAP.attackerSpawn);
const weaponView = createWeaponView(camera);
const loadout = {
  primary: null,
  grenades: { he: 0, smoke: 0, flash: 0 },
  armor: false,
};
let playing = false;
let frozen = false;
let time = 0;
let pulseCooldownLeft = 0;
let planting = false;
let rightMouse = false;
let shake = 0;
let stepAcc = 0;
let spectateBot = null;
let shotTarget = null;
const noises = [];
const grenades = [];
const raycaster = new THREE.Raycaster();
raycaster.far = 120;
const _dir = new THREE.Vector3();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();

// What the buy menu shows as owned (weapon stats, grenade counts, armour).
function buySnapshot() {
  return {
    primary: loadout.primary,
    grenades: { ...loadout.grenades },
    armor: loadout.armor,
  };
}

// --- Match hooks ---
const match = createMatch({
  resetPositions(site) {
    player.reset(MAP.attackerSpawn, 0);
    bots.resetRound(site);
    weaponView.refillAmmo();
    // Armour persists once bought (CS-style): a survivor keeps the vest
    // into the next round, restored to 100. The old code zeroed it in
    // reset() while loadout.armor stayed true, so buy() refused
    // 'Already armoured' and the player could never have armour again
    // after round 1 — a broken one-time item.
    if (loadout.armor) player.state.armor = 100;
    if (loadout.primary) weaponView.equip(loadout.primary);
    else weaponView.equip('p2000');
    hud.setWeaponName(weaponView.def().name);
    grenades.length = 0;
    planting = false;
    spectateBot = null;
    bombMesh.visible = false;
    updatePlayerHitMeshes();
  },
  onRoundStart(round, site) {
    hud.setRound(round);
    hud.setSite(site);
    hud.setScore(match.state.scoreV, match.state.scoreS);
    hud.hideOverlay(); // a stale 'paused' overlay from a death in the previous
    // round must not carry over — the player respawns into the buy phase.
    hud.banner(`ROUND ${round}`, site === 'A' ? 'TARGET: SITE A — SOLAR ARRAY' : 'TARGET: SITE B — PUMP HOUSE');
    hud.showBuyMenu(buySnapshot());
    hud.setHint('B — buy menu • Q — echo pulse • 1/2 — weapons • E — plant (in site)');
    document.exitPointerLock?.();
    audio.beep();
  },
  onRoundLive() {
    hud.hideBuyMenu();
    hud.banner('GO', 'Plant the bomb — or clear the site');
    audio.beep();
  },
  onRoundEnd(winner, reason, v, s) {
    hud.setScore(v, s);
    hud.hideBuyMenu();
    hud.hideProgress();
    if (winner === 'V') {
      hud.banner('ROUND WON', reason, 3400);
      audio.roundWin();
    } else {
      hud.banner('ROUND LOST', reason, 3400);
      audio.roundLose();
    }
    hud.setHint(winner === 'V' ? '+$325 round bonus' : '+$200 round bonus');
    document.exitPointerLock?.();
  },
  onMatchEnd(winner, v, s) {
    const text = winner === 'V'
      ? `Vanguard wins ${v}–${s}. Kestrel Yard is yours.`
      : `Sentinels win ${v}–${s}. The yard holds — try again.`;
    hud.showOverlay('end', text);
    document.exitPointerLock?.();
  },
  onPlantDone(who, site) {
    const name = who === 'player' ? PLAYER_NAME : who.name;
    hud.banner('BOMB PLANTED', `Site ${site} — defend it`, 3000);
    hud.killFeed(`<span class="kf-v">${name}</span> planted the bomb`);
    audio.plantDone();
  },
  onDefuseDone(who) {
    const name = who === 'player' ? PLAYER_NAME : who.name;
    hud.banner('BOMB DEFUSED', `${name} cut the wires`, 3000);
    audio.roundLose();
  },
  onBombExploded(pos) {
    effects.explode(pos);
    audio.explosion();
    shake = 1;
    const victims = [player, ...bots.bots];
    for (const victim of victims) {
      const alive = victim === player ? player.state.alive : victim.alive;
      if (!alive) continue;
      const p = victim === player ? player.state.position : victim.position;
      const d = Math.hypot(p.x - pos.x, p.z - pos.z);
      if (d < 8) {
        if (victim === player) killPlayer(null);
        else bots.damage(victim, 200, null, time, null);
      }
    }
  },
  onBombDropped(pos) {
    bombMesh.visible = true;
    bombMesh.position.set(pos.x, 0.15, pos.z);
    hud.setBombStatus('BOMB DROPPED — RETRIEVE IT');
  },
  onBombPickup(who) {
    bombMesh.visible = false;
    const name = who === 'player' ? PLAYER_NAME : who.name;
    hud.setBombStatus(`${name.toUpperCase()} HAS THE BOMB`);
  },
  grenadeCount(id) {
    return loadout.grenades[id] || 0;
  },
  hasArmor() {
    return loadout.armor;
  },
  onBuy(item) {
    audio.buy();
    if (item.kind === 'gun') {
      loadout.primary = item.id;
      weaponView.equip(item.id);
      hud.setWeaponName(item.label);
    } else if (item.kind === 'grenade') {
      loadout.grenades[item.id] = (loadout.grenades[item.id] || 0) + 1;
    } else if (item.kind === 'armor') {
      loadout.armor = true;
      player.state.armor = 100;
    }
  },
  now() {
    return time;
  },
  playerPosition() {
    return player.state.position;
  },
});

// --- Bot events ---
const bots = createBots(scene, world.colliders, world.shootables, effects, audio, {
  onSpotted(bot, pos) {
    if (bot.team === 'S' && bot.target === 'player') {
      hud.setHint('SPOTTED — they know where you are');
      setTimeout(() => hud.setHint(''), 2000);
    }
  },
  onDamage(targetRef, amount, shooter, part) {
    if (targetRef === 'player') {
      if (!player.state.alive) return;
      const dealt = player.damage(amount);
      hud.setHealth(player.state.health, player.state.armor);
      hud.damageFlash();
      // Point the damage-direction ring at the shooter (0 = straight ahead).
      if (shooter && shooter.position) {
        const dx = shooter.position.x - player.state.position.x;
        const dz = shooter.position.z - player.state.position.z;
        const worldAngle = Math.atan2(-dx, -dz);
        let rel = worldAngle - player.state.yaw;
        rel = Math.atan2(Math.sin(rel), Math.cos(rel));
        hud.damageDirection(rel);
      }
      audio.hurt();
      if (!player.state.alive) killPlayer(shooter);
    } else {
      const killed = bots.damage(targetRef, amount, shooter, time, shooter.position);
      if (killed) onBotKilled(targetRef, shooter, part);
    }
  },
  // A bot throws a smoke grenade (at a midpoint toward its contact) to cover
  // its push. Same flight and fuse as the player's grenades.
  onThrowGrenade(bot, type, targetPos) {
    const from = bot.position.clone();
    from.y = 1.4;
    const dir = new THREE.Vector3(targetPos.x - from.x, 0, targetPos.z - from.z);
    const dist = Math.hypot(dir.x, dir.z) || 1;
    dir.multiplyScalar(1 / dist);
    const velocity = dir.multiplyScalar(Math.min(14, 6 + dist * 0.5));
    velocity.y = 4;
    spawnGrenade(type, from, velocity);
  },
  onBotKilled(bot, attacker) {
    const killerName = attacker === 'player' ? PLAYER_NAME : (attacker ? attacker.name : '—');
    const killerClass = attacker === 'player' || (attacker && attacker.team === 'V') ? 'kf-v' : 'kf-s';
    const victimClass = bot.team === 'V' ? 'kf-v' : 'kf-s';
    hud.killFeed(`<span class="${killerClass}">${killerName}</span> ▸ <span class="${victimClass}">${bot.name}</span>`);
    if (bot.hasBomb) match.onBombDroppedBot(bot.position);
    if (bot.team === 'V' && match.state.bomb.state === 'carried' && match.state.bomb.carrier === bot) {
      match.onBombDroppedBot(bot.position);
    }
  },
  onPlantProgress(bot, progress) {
    hud.showProgress(`PLANTING — ${bot.name}`, progress);
    audio.plantBeep(progress, Math.hypot(bot.position.x - player.state.position.x, bot.position.z - player.state.position.z));
  },
  onPlantDone(bot) {
    match.botPlantDone(bot);
    hud.hideProgress();
  },
  onDefuseProgress(bot, progress) {
    hud.showProgress(`DEFUSING — ${bot.name}`, progress);
    audio.defuseBeep(progress, Math.hypot(bot.position.x - player.state.position.x, bot.position.z - player.state.position.z));
  },
  onDefuseDone(bot) {
    match.botDefuseDone(bot);
    hud.hideProgress();
  },
  onBombPickup(bot) {
    match.onBombPickup(bot);
  },
  onBombDropped(bot) {
    match.onBombDroppedBot(bot.position);
  },
});

function onBotKilled(bot, attacker, part) {
  if (attacker === 'player') match.onPlayerKill();
}

function killPlayer(killer) {
  if (!player.state.alive) return;
  player.state.alive = false;
  match.onPlayerDeath();
  const killerName = killer ? killer.name : 'The blast';
  hud.killFeed(`<span class="kf-s">${killerName}</span> ▸ <span class="kf-v">${PLAYER_NAME}</span>`);
  // Death spectate: the camera follows the nearest living friendly bot so the
  // round stays watchable instead of freezing on the corpse.
  spectateBot = bots.bots.find((b) => b.team === 'V' && b.alive) || null;
  hud.setHint(spectateBot ? `You are down — spectating ${spectateBot.name}. Next round to redeploy.` : 'You are down — your squad fights on. Next round to redeploy.');
  hud.hideProgress();
  planting = false;
  document.exitPointerLock?.();
}

function updatePlayerHitMeshes() {
  const p = player.state.position;
  playerBodyMesh.position.set(p.x, p.y + 0.86, p.z);
  playerHeadMesh.position.set(p.x, p.y + 1.5, p.z);
}

// --- Player shooting: one ray per pellet, spread from movement and bloom ---
function playerShoot() {
  const def = weaponView.def();
  if (!weaponView.ready()) {
    if (weaponView.state.mag === 0) audio.dryFire();
    return;
  }
  if (!weaponView.takeRound()) return;
  weaponView.pullTrigger();
  audio.shot(def.id);
  const spread = weaponView.spread(player.groundSpeed());
  camera.getWorldDirection(_dir);
  const muzzle = _from.copy(camera.position).addScaledVector(_dir, 0.6);
  muzzle.y -= 0.12;
  muzzle.x += Math.cos(player.state.yaw) * 0.18;
  muzzle.z -= Math.sin(player.state.yaw) * 0.18;
  effects.casing(muzzle, player.state.yaw);
  let hitSomething = false;
  for (let pellet = 0; pellet < def.pellets; pellet += 1) {
    const dir = _to.copy(_dir);
    dir.x += (Math.random() + Math.random() + Math.random() - 1.5) * spread;
    dir.y += (Math.random() + Math.random() + Math.random() - 1.5) * spread * 0.6;
    dir.z += (Math.random() + Math.random() + Math.random() - 1.5) * spread;
    dir.normalize();
    raycaster.set(camera.position, dir);
    raycaster.far = def.range;
    const hits = raycaster.intersectObjects([...bots.hitMeshes(), ...world.shootables], false);
    const end = hits.length > 0 ? hits[0].point : _to.copy(camera.position).addScaledVector(dir, def.range);
    effects.tracer(muzzle, end);
    if (hits.length === 0) continue;
    hitSomething = true;
    const hit = hits[0];
    const bot = hit.object.userData.bot;
    if (bot) {
      const part = hit.object.userData.part || 'torso';
      let amount = def.damage * (part === 'head' ? def.headMult : 1);
      if (hit.distance > 25) amount *= 0.85;
      const killed = bots.damage(bot, amount, 'player', time, player.state.position);
      hud.hitMarker(killed, part === 'head');
      audio.hit(killed);
      if (killed) onBotKilled(bot, 'player', part);
    } else {
      effects.impact(hit.point, hit.face ? hit.face.normal : new THREE.Vector3(0, 1, 0));
    }
  }
  if (hitSomething) player.recoil(def.kick, (Math.random() - 0.5) * def.kick * 0.6);
  else player.recoil(def.kick * 0.7, 0);
  noises.push({ pos: player.state.position.clone(), time, radius: 26 });
  if (noises.length > 24) noises.shift();
}

// --- Grenades: a thrown sphere with a fuse; HE, smoke and flash ---
function spawnGrenade(type, from, velocity) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#211d1a'), roughness: 0.6, metalness: 0.4 }),
  );
  mesh.position.copy(from);
  scene.add(mesh);
  grenades.push({
    type,
    mesh,
    velocity: velocity.clone(),
    fuse: 1.8,
    bounced: false,
  });
}

function throwGrenade(type) {
  if (loadout.grenades[type] <= 0) return;
  loadout.grenades[type] -= 1;
  camera.getWorldDirection(_dir);
  const from = camera.position.clone().addScaledVector(_dir, 0.5);
  const velocity = _dir.clone().multiplyScalar(14).add(new THREE.Vector3(0, 3.5, 0));
  spawnGrenade(type, from, velocity);
  audio.beep();
}

function detonateGrenade(grenade) {
  const pos = grenade.mesh.position;
  scene.remove(grenade.mesh);
  if (grenade.type === 'he') {
    effects.explode(pos);
    audio.explosion();
    shake = Math.max(shake, 0.7);
    const victims = [player, ...bots.bots];
    for (const victim of victims) {
      const alive = victim === player ? player.state.alive : victim.alive;
      if (!alive) continue;
      const p = victim === player ? player.state.position : victim.position;
      const d = Math.hypot(p.x - pos.x, p.z - pos.z);
      if (d < 7) {
        const amount = 95 * (1 - d / 7) + 10;
        if (victim === player) {
          player.damage(amount);
          hud.setHealth(player.state.health, player.state.armor);
          hud.damageFlash();
          if (!player.state.alive) killPlayer(null);
        } else {
          const killed = bots.damage(victim, amount, 'player', time, player.state.position);
          if (killed) onBotKilled(victim, 'player', 'torso');
        }
      }
    }
  } else if (grenade.type === 'smoke') {
    effects.smoke(pos, 4.5, 14);
  } else {
    // Flash: anyone looking at it inside 30 m is blinded; bots stop for 2 s.
    const toFlash = _to.copy(pos).sub(camera.position);
    const dist = toFlash.length();
    camera.getWorldDirection(_dir);
    if (dist < 30 && _dir.dot(toFlash.normalize()) > 0.25) {
      document.getElementById('flash').classList.add('on');
      setTimeout(() => document.getElementById('flash').classList.remove('on'), 700);
    }
    for (const bot of bots.bots) {
      if (!bot.alive) continue;
      const d = Math.hypot(bot.position.x - pos.x, bot.position.z - pos.z);
      if (d < 22) bot.blindedUntil = time + 2;
    }
  }
  noises.push({ pos: pos.clone(), time, radius: 30 });
}

function stepGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    const grenade = grenades[i];
    grenade.velocity.y -= 12 * dt;
    grenade.mesh.position.addScaledVector(grenade.velocity, dt);
    const p = grenade.mesh.position;
    if (p.y < 0.09) {
      p.y = 0.09;
      grenade.velocity.y = Math.abs(grenade.velocity.y) * 0.35;
      grenade.velocity.x *= 0.7;
      grenade.velocity.z *= 0.7;
      if (!grenade.bounced) {
        grenade.bounced = true;
        grenade.fuse = Math.min(grenade.fuse, 0.6);
      }
    }
    grenade.fuse -= dt;
    if (grenade.fuse <= 0) {
      detonateGrenade(grenade);
      grenades.splice(i, 1);
    }
  }
}

// --- Echo pulse: the signature move. One ping, every enemy inside 30 m lights up. ---
function firePulse() {
  if (pulseCooldownLeft > 0 || !player.state.alive) return;
  pulseCooldownLeft = PULSE_COOLDOWN;
  effects.startPulse(player.state.position);
  audio.pulse();
  bots.reveal(player.state.position, PULSE_RADIUS, time + PULSE_REVEAL_SECONDS);
}

// --- Input: keys are read once per fixed step, never in event handlers ---
const pressed = new Set();
window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  pressed.add(event.code);
  if (event.code === 'KeyR') {
    if (weaponView.reload()) audio.reload();
  }
  if (event.code === 'KeyB' && match.state.phase === 'buy') {
    const menu = document.getElementById('buy-menu');
    if (menu.hidden) hud.showBuyMenu(buySnapshot());
    else hud.hideBuyMenu();
  }
  if (event.code === 'KeyQ') firePulse();
  if (event.code === 'Digit1' && loadout.primary) {
    weaponView.equip(loadout.primary);
    hud.setWeaponName(weaponView.def().name);
  }
  if (event.code === 'Digit2') {
    weaponView.equip('p2000');
    hud.setWeaponName(weaponView.def().name);
  }
  if (event.code === 'Digit4') throwGrenade('he');
  if (event.code === 'Digit5') throwGrenade('smoke');
  if (event.code === 'Digit6') throwGrenade('flash');
});
window.addEventListener('keyup', (event) => pressed.delete(event.code));
window.addEventListener('mousedown', (event) => {
  if (event.button === 2) rightMouse = true;
});
window.addEventListener('mouseup', (event) => {
  if (event.button === 2) rightMouse = false;
});
window.addEventListener('contextmenu', (event) => event.preventDefault());
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
hud.onPlay(() => {
  audio.unlock();
  hud.hideOverlay();
  if (!playing) {
    playing = true;
    match.startMatch();
  }
  input.requestLock();
});
hud.onBuy((itemId) => {
  const result = match.buy(itemId);
  if (!result.ok) hud.setHint(result.reason);
  else {
    hud.setHint('');
    // Refresh the money display at once: the buy menu rebuilds its grid
    // but does not touch #buy-money, and the next frame's syncHud is the
    // only other writer — a player who just bought armour would otherwise
    // keep seeing the pre-purchase balance.
    hud.setMoney(match.state.money);
    if (!document.getElementById('buy-menu').hidden) hud.showBuyMenu(buySnapshot());
  }
});

// --- One fixed step: input, player, bots, match, effects, HUD ---
function stepSim(dt) {
  time += dt;
  const phase = match.state.phase;

  if (!frozen && playing && phase !== 'menu' && phase !== 'matchEnd') {
    const look = input.takeLook();
    if (input.state.locked) player.look(look.x, look.y);

    if (player.state.alive && phase !== 'roundEnd') {
      player.step(dt, input.state.keys);
      // Footsteps: one soft step every ~2.4 m of ground travel.
      if (player.state.onGround) {
        stepAcc += player.groundSpeed() * dt;
        if (stepAcc > 2.4) {
          stepAcc = 0;
          audio.step(player.state.position, player.state.position, player.state.yaw);
        }
      }
      // Firing: hold for autos, click per shot for semi-autos.
      const def = weaponView.def();
      const wantFire = def.auto ? input.state.firing : input.state.firing && !stepSim._fired;
      stepSim._fired = input.state.firing;
      if (wantFire && input.state.locked) playerShoot();
      // Plant / defuse channel on E.
      const inSite = match.isPlayerInSite(player.state.position);
      const carrying = match.state.bomb.state === 'carried' && match.state.bomb.carrier === 'player';
      if (input.state.keys.has('KeyE') && carrying && inSite) {
        if (!planting) planting = match.startPlanting('player', true);
        if (planting) {
          const p = match.plantTick(dt, 'player', true);
          hud.showProgress('PLANTING THE BOMB', p);
          audio.plantBeep(p, 0); // plant telegraph: rising beeps, throttled inside
          if (p >= 1) {
            planting = false;
            hud.hideProgress();
          }
        }
      } else if (planting) {
        match.cancelPlanting('player');
        planting = false;
        hud.hideProgress();
      }
    }

    if (phase === 'live') {
      const ctx = {
        time,
        dt,
        player: {
          position: player.state.position,
          yaw: player.state.yaw,
          alive: player.state.alive,
          team: 'V',
          hitMeshes: playerHitMeshes,
        },
        bomb: match.state.bomb,
        noises,
      };
      for (const bot of bots.bots) bots.step(bot, ctx);
      stepGrenades(dt);
    }
    if (phase === 'buy' || phase === 'live') {
      match.update(dt, {
        time,
        attackersAlive: (player.state.alive ? 1 : 0) + bots.aliveCount('V'),
        defendersAlive: bots.aliveCount('S'),
      });
    } else if (phase === 'roundEnd') {
      match.update(dt, { time, attackersAlive: 1, defendersAlive: 1 });
    }
  }

  weaponView.step(dt, player.groundSpeed(), rightMouse && player.state.alive);
  effects.step(dt);
  world.stepRain(dt); // monsoon rain falls even in frozen ?shot= frames
  pulseCooldownLeft = Math.max(0, pulseCooldownLeft - dt);
  if (match.state.bomb.state === 'planted') {
    const remain = match.state.bomb.explodeAt - time;
    bombLight.material.color.setHex(Math.floor(remain * 4) % 2 === 0 ? 0xf0a830 : 0xff2e2e);
    bombMesh.visible = true;
    bombMesh.position.set(match.state.bomb.pos.x, 0.15, match.state.bomb.pos.z);
  } else if (match.state.bomb.state === 'dropped') {
    bombLight.material.color.setHex(0xf0a830);
  }
  updatePlayerHitMeshes();
  shake = Math.max(0, shake - dt * 1.4);
}

function syncHud() {
  const p = player.state;
  hud.setAmmo(weaponView.state.mag, weaponView.state.reserve);
  hud.setHealth(p.health, p.armor);
  hud.setMoney(match.state.money);
  hud.setTimer(match.state.timer, match.state.phase);
  hud.setAlive(
    (p.alive ? 1 : 0) + bots.aliveCount('V'),
    bots.aliveCount('S'),
  );
  hud.setKD(match.state.kills, match.state.deaths);
  hud.setGrenades(loadout.grenades.he || 0, loadout.grenades.smoke || 0, loadout.grenades.flash || 0);
  hud.setSpread(weaponView.spread(player.groundSpeed()));
  hud.setPulse(pulseCooldownLeft <= 0, 1 - pulseCooldownLeft / PULSE_COOLDOWN);
  const bomb = match.state.bomb;
  if (bomb.state === 'planted') {
    hud.setBombStatus(`BOMB PLANTED — SITE ${bomb.site} — ${Math.max(0, Math.ceil(bomb.explodeAt - time))}s`);
  } else if (bomb.state === 'dropped') {
    hud.setBombStatus('BOMB DROPPED — RETRIEVE IT');
  } else if (bomb.state === 'carried') {
    hud.setBombStatus(bomb.carrier === 'player' ? 'YOU HAVE THE BOMB — REACH THE SITE' : `${bomb.carrier.name || ''} HAS THE BOMB`);
  } else {
    hud.setBombStatus('');
  }
  hud.drawMinimap({
    player: { x: p.position.x, z: p.position.z, yaw: p.yaw },
    friendlies: bots.bots.filter((b) => b.team === 'V' && b.alive).map((b) => ({ x: b.position.x, z: b.position.z })),
    enemies: bots.bots.filter((b) => b.team === 'S' && b.alive && time < b.revealedUntil).map((b) => ({ x: b.position.x, z: b.position.z })),
    bomb: { state: bomb.state, pos: bomb.pos },
  });
  // Aim-down-sights: right mouse centres the view model and narrows the FOV
  // for every weapon (the scope zooms further).
  const zoom = weaponView.def().zoom;
  const targetFov = rightMouse ? 75 / Math.max(zoom, 1.18) : 75;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * 0.3;
    camera.updateProjectionMatrix();
  }
}

let accumulator = 0;
let lastFrame = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const frameDt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  accumulator += frameDt;
  let steps = 0;
  while (accumulator >= FIXED_DT && steps < 5) {
    stepSim(FIXED_DT);
    accumulator -= FIXED_DT;
    steps += 1;
  }
  if (steps === 5) accumulator = 0;
  const p = player.state;
  if (!p.alive && spectateBot && spectateBot.alive) {
    // Death spectate: watch the round through a living friendly bot.
    camera.position.set(spectateBot.position.x, 1.6, spectateBot.position.z);
    camera.rotation.y = spectateBot.yaw;
    camera.rotation.x = 0;
  } else {
    camera.position.set(
      p.position.x + (Math.random() - 0.5) * shake * 0.08,
      p.position.y + p.eye + (Math.random() - 0.5) * shake * 0.08,
      p.position.z + (Math.random() - 0.5) * shake * 0.08,
    );
    camera.rotation.y = p.yaw;
    camera.rotation.x = p.pitch;
  }
  syncHud();
  // Staged action frame (?shot=play): keep the tracer, hit marker and muzzle
  // flash live so the capture reads as a firefight in progress.
  if (shotTarget && shotTarget.alive) {
    camera.getWorldDirection(_dir);
    const muzzle = _from.copy(camera.position).addScaledVector(_dir, 0.6);
    muzzle.y -= 0.12;
    const target = _to.copy(shotTarget.position);
    target.y = 1.2;
    effects.tracer(muzzle, target);
    hud.hitMarker(false, false);
    weaponView.pullTrigger();
  }
  renderer.render(scene, camera);
}

// --- Deterministic frames for screenshots ---
function setupShot(name) {
  playing = true;
  frozen = true;
  shotTarget = null;
  // The floating site letters are hidden in the end frame so they cannot sit
  // behind the centre banner; every other frame keeps them.
  for (const sign of world.siteSigns) sign.visible = name !== 'end';
  bots.spawnTeams();
  const vBots = bots.bots.filter((b) => b.team === 'V');
  const sBots = bots.bots.filter((b) => b.team === 'S');
  const setBot = (bot, x, z, yaw, alive = true) => {
    bot.position.set(x, 0, z);
    bot.yaw = yaw;
    bot.alive = alive;
    bot.meshes.group.position.set(x, 0, z);
    bot.meshes.group.rotation.set(alive ? 0 : -1.45, yaw, 0);
  };
  if (name === 'start') {
    match.state.phase = 'menu';
    match.state.round = 1;
    match.state.scoreV = 0;
    match.state.scoreS = 0;
    match.state.money = 800;
    player.reset(new THREE.Vector3(0, 0, 20), 0.35);
    player.state.yaw = 0.35;
    player.state.pitch = 0.04;
    setBot(vBots[0], -3, 16, 0.2);
    setBot(vBots[1], 3, 17, -0.2);
    setBot(sBots[0], -14, -8, Math.PI);
    setBot(sBots[1], 14, -8, Math.PI);
    hud.showOverlay('start');
    hud.setRound(1);
    hud.setSite('A');
    hud.setScore(0, 0);
  } else if (name === 'play') {
    match.state.phase = 'live';
    match.state.round = 3;
    match.state.scoreV = 2;
    match.state.scoreS = 1;
    match.state.money = 2450;
    match.state.timer = 84;
    match.state.site = 'A';
    match.state.kills = 1;
    match.state.deaths = 0;
    match.state.bomb.state = 'carried';
    match.state.bomb.carrier = 'player';
    loadout.primary = 'ar77';
    weaponView.equip('ar77');
    weaponView.state.mag = 24;
    weaponView.state.reserve = 90;
    // Mid-lane view: the player stands in the lane south of the band wall and
    // looks north — the pillar sits left of frame, the target Sentinel stands
    // in the open down the lane with a tracer on it.
    player.reset(new THREE.Vector3(2.5, 0, 10), 0);
    player.state.yaw = -0.08;
    player.state.pitch = -0.02;
    setBot(sBots[0], 6, -6, Math.PI * 0.9);
    setBot(sBots[1], -5, -12, Math.PI * 1.1);
    setBot(sBots[2], 1, -8, Math.PI);
    setBot(vBots[0], -6, 8, 0);
    setBot(vBots[1], -3, 4, -0.5);
    sBots[0].revealedUntil = time + 60;
    sBots[1].revealedUntil = time + 60;
    sBots[2].revealedUntil = time + 60;
    shotTarget = sBots[2];
    effects.startPulse(player.state.position);
    hud.hideOverlay();
    hud.setRound(3);
    hud.setSite('A');
    hud.setScore(2, 1);
    hud.setWeaponName('AR-77');
    hud.setBombStatus('YOU HAVE THE BOMB — REACH THE SITE');
  } else if (name === 'plant') {
    match.state.phase = 'live';
    match.state.round = 4;
    match.state.scoreV = 2;
    match.state.scoreS = 1;
    match.state.money = 1800;
    match.state.timer = 42;
    match.state.site = 'A';
    match.state.kills = 1;
    match.state.deaths = 1;
    match.state.bomb.state = 'carried';
    match.state.bomb.carrier = 'player';
    loadout.primary = 'ar77';
    weaponView.equip('ar77');
    // South-east of the site, 7 m out: the beacon and the site ring are clear
    // of the HUD text, the panels sit in the background (not on the lens), and
    // a defender stands at the far edge of the site.
    player.reset(new THREE.Vector3(-15, 0, -9), 0.785);
    player.state.yaw = 0.785;
    player.state.pitch = -0.04;
    setBot(vBots[0], -17, -16, 0.6);
    setBot(sBots[0], -18, -18, Math.PI * 0.8);
    setBot(sBots[1], -22, -16, Math.PI);
    hud.hideOverlay();
    hud.setRound(4);
    hud.setSite('A');
    hud.setScore(2, 1);
    hud.setWeaponName('AR-77');
    hud.setBombStatus('YOU HAVE THE BOMB — REACH THE SITE');
    hud.showProgress('PLANTING THE BOMB', 0.6);
  } else {
    // end
    match.state.phase = 'roundEnd';
    match.state.round = 4;
    match.state.scoreV = 3;
    match.state.scoreS = 1;
    match.state.money = 3100;
    match.state.timer = 0;
    match.state.site = 'A';
    match.state.kills = 2;
    match.state.deaths = 1;
    match.state.bomb.state = 'planted';
    match.state.bomb.site = 'A';
    match.state.bomb.pos.set(-20, 0, -14);
    match.state.bomb.explodeAt = time + 12;
    player.reset(new THREE.Vector3(-14, 0, -6), 0.5);
    player.state.yaw = 0.5;
    player.state.pitch = -0.03;
    setBot(sBots[0], -18, -12, Math.PI, false);
    setBot(sBots[1], -22, -16, Math.PI * 0.5, false);
    setBot(sBots[2], -13, -9, Math.PI);
    setBot(vBots[0], -16, -10, 0.3);
    hud.hideOverlay();
    hud.setRound(4);
    hud.setSite('A');
    hud.setScore(3, 1);
    hud.setWeaponName('AR-77');
    hud.banner('ROUND WON', 'Site A secured — Sentinels eliminated', 60000);
  }
  updatePlayerHitMeshes();
  window.__shotReady = false;
  setTimeout(() => {
    renderer.render(scene, camera);
    window.__shotReady = true;
  }, 1200);
}

// --- Boot ---
bots.spawnTeams();
updatePlayerHitMeshes();
hud.setHealth(100, 0);
hud.setMoney(800);
hud.setAmmo(12, 48);
hud.setWeaponName('P2000');
hud.setRound(1);
hud.setSite('A');
hud.setScore(0, 0);
hud.showOverlay('start');
// Debug interface for automated testing (read-only): it exposes live state so
// a test driver can aim and navigate from real positions instead of reading the
// minimap by eye. It never writes to the game and is inert in normal play.
window.__emberline = {
  get player() {
    return {
      x: player.state.position.x, z: player.state.position.z,
      yaw: player.state.yaw, pitch: player.state.pitch,
      health: player.state.health, alive: player.state.alive,
    };
  },
  get bots() {
    return bots.bots.map((b) => ({
      name: b.name, team: b.team,
      x: b.position.x, z: b.position.z,
      alive: b.alive, health: Math.ceil(b.health),
    }));
  },
  get match() {
    return {
      phase: match.state.phase, round: match.state.round,
      scoreV: match.state.scoreV, scoreS: match.state.scoreS,
      timer: match.state.timer, kills: match.state.kills, deaths: match.state.deaths,
      site: match.state.site, money: match.state.money,
      bomb: { state: match.state.bomb.state, site: match.state.bomb.site, carrier: match.state.bomb.carrier === 'player' ? 'player' : (match.state.bomb.carrier ? match.state.bomb.carrier.name : null) },
    };
  },
  get monsoon() {
    return {
      rainDrops: world.rainCount,
      rainY0: world.rain.geometry.attributes.position.array[1],
      lampIntensity: world.lampIntensity,
      lampCount: 6,
    };
  },
  // Read-only LOS query (eye 1.62 -> torso 1.05). Never writes to the game.
  los(x1, z1, x2, z2) { return bots.los(x1, z1, x2, z2); },
  // Read-only FIRE-line query (muzzle 1.35 -> head 1.6). See bots.losFire.
  losFire(x1, z1, x2, z2) { return bots.losFire(x1, z1, x2, z2); },
  // Read-only HEAD-line query (eye 1.62 -> head 1.55). See bots.losHead.
  losHead(x1, z1, x2, z2) { return bots.losHead(x1, z1, x2, z2); },
  // Read-only collider query for the test harness: which world colliders
  // intersect the box around (x,z) with the given half-extents. Used to
  // diagnose why a walkable-looking lane is blocked.
  collidersNear(x, z, r) {
    return world.colliders
      .filter((c) => c.min.x - r < x && x < c.max.x + r && c.min.z - r < z && z < c.max.z + r)
      .map((c) => ({ min: [c.min.x, c.min.y, c.min.z].map((v) => +v.toFixed(2)), max: [c.max.x, c.max.y, c.max.z].map((v) => +v.toFixed(2)) }));
  },
};
if (shot) {
  setupShot(shot);
} else {
  window.__shotReady = true;
}
requestAnimationFrame(frame);
