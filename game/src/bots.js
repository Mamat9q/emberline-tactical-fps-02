// EMBERLINE bots: a squad, not target dummies. Each bot walks the waypoint graph,
// holds angles, patrols routes, reacts to what it sees and hears, calls out contacts
// so teammates rotate, plants or defuses the bomb, and sometimes takes the long way
// round to flank. One shared raycaster, staggered perception, no per-frame allocation
// in the hot loop.
import * as THREE from 'three';
import { WEAPONS } from './weapons.js';
import { findPath, nearestNode, nodePosition } from './nav.js';
import { MAP } from './world.js';

const BOT_SPEED = 4.3;
const BOT_RADIUS = 0.34;
const BOT_HEIGHT = 1.72;
const EYE_HEIGHT = 1.5;
const SEE_RANGE = 42;
const HEAR_RANGE = 26;
const FOV_COS = 0.45; // ~126 degrees of vision

const FRIENDLY_NAMES = ['Rook', 'Havoc', 'Sable', 'Wren'];
const ENEMY_NAMES = ['Dagger', 'Vex', 'Onyx', 'Blitz', 'Mira'];

const TEAM_COLORS = {
  V: { body: '#2fb8a6', dark: '#173f3a', visor: '#7df0dd' },
  S: { body: '#c65a2e', dark: '#472012', visor: '#ffb347' },
};

function makeBotMeshes(scene, team) {
  const colors = TEAM_COLORS[team];
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(colors.body), roughness: 0.6, metalness: 0.15 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(colors.dark), roughness: 0.8, metalness: 0.1 });
  const visorMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(colors.visor), roughness: 0.3, metalness: 0.2,
    emissive: new THREE.Color(colors.visor), emissiveIntensity: 0.55,
  });
  const group = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.3), bodyMat);
  torso.position.y = 1.05;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), darkMat);
  head.position.y = 1.58;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.05), visorMat);
  visor.position.set(0, 1.6, -0.16);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.72, 0.2), darkMat);
  legL.position.set(-0.14, 0.36, 0);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.72, 0.2), darkMat);
  legR.position.set(0.14, 0.36, 0);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.12), bodyMat);
  armL.position.set(-0.32, 1.1, -0.05);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.12), bodyMat);
  armR.position.set(0.32, 1.1, -0.05);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), darkMat);
  gun.position.set(0.1, 1.18, -0.42);
  // Kit detail: backpack, shoulder pads and a team-coloured chest stripe, so
  // a bot reads as a soldier at a glance instead of a plain box.
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.12), darkMat);
  pack.position.set(0, 1.15, 0.2);
  const padL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.22), bodyMat);
  padL.position.set(-0.32, 1.44, 0);
  const padR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.22), bodyMat);
  padR.position.set(0.32, 1.44, 0);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.02), visorMat);
  stripe.position.set(0, 1.25, -0.16);
  group.add(torso, head, visor, legL, legR, armL, armR, gun, pack, padL, padR, stripe);
  group.traverse((mesh) => {
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  // Echo-pulse outline: a shell that lights up when the bot is revealed.
  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 1.9, 0.5),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#f0a830'), transparent: true, opacity: 0, depthWrite: false }),
  );
  shell.position.y = 0.95;
  group.add(shell);
  scene.add(group);
  return { group, torso, head, legL, legR, shell, visorMat };
}

export function createBots(scene, colliders, shootables, effects, audio, events) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  const probe = new THREE.Box3();
  const _v = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _to = new THREE.Vector3();

  const bots = [];

  function overlaps(x, z) {
    probe.min.set(x - BOT_RADIUS, 0.04, z - BOT_RADIUS);
    probe.max.set(x + BOT_RADIUS, BOT_HEIGHT - 0.04, z + BOT_RADIUS);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return true;
    return false;
  }

  function hasLineOfSight(from, to) {
    _dir.subVectors(to, from);
    const dist = _dir.length();
    if (dist < 0.01) return true;
    _dir.multiplyScalar(1 / dist);
    raycaster.set(from, _dir);
    raycaster.far = dist - 0.4;
    return raycaster.intersectObjects(shootables, false).length === 0;
  }

  function spawnBot(team, index, weaponId, spawn) {
    const meshes = makeBotMeshes(scene, team);
    const name = (team === 'V' ? FRIENDLY_NAMES : ENEMY_NAMES)[index];
    const bot = {
      id: `${team}${index}`,
      name,
      team,
      weaponId,
      meshes,
      position: new THREE.Vector3(spawn.x, 0, spawn.z),
      yaw: team === 'V' ? Math.PI : 0,
      health: 100,
      alive: true,
      mode: 'hold',
      path: [],
      pathIndex: 0,
      target: null,
      lastSeen: new THREE.Vector3(),
      lastSeenTime: -100,
      alertPos: null,
      alertTime: -100,
      reactionLeft: 0,
      burstLeft: 0,
      burstGap: 0,
      fireGap: 0,
      scanTimer: Math.random() * 0.15,
      holdNode: null,
      holdUntil: 0,
      assignedSite: team === 'V' ? 'A' : 'A',
      hasBomb: false,
      plantProgress: 0,
      defuseProgress: 0,
      grenades: 1,
      mag: WEAPONS[weaponId].mag,
      reloadLeft: 0,
      blindedUntil: 0,
      revealedUntil: 0,
      walkPhase: Math.random() * 6,
      fall: 0,
      flankAt: 8 + Math.random() * 8,
      strafeDir: 1,
      strafeTimer: 0,
    };
    meshes.torso.userData.bot = bot;
    meshes.torso.userData.part = 'torso';
    meshes.head.userData.bot = bot;
    meshes.head.userData.part = 'head';
    bots.push(bot);
    return bot;
  }

  function spawnTeams() {
    bots.length = 0;
    const vSpawn = MAP.attackerSpawn;
    const sSpawn = MAP.defenderSpawn;
    const vWeapons = ['ar77', 'ar77', 'vk9', 'longshot'];
    const sWeapons = ['ar77', 'ar77', 'vk9', 'longshot', 'ar77'];
    for (let i = 0; i < 4; i += 1) {
      const bot = spawnBot('V', i, vWeapons[i], { x: vSpawn.x - 3 + i * 2, z: vSpawn.z + (i % 2) * 1.5 });
      bot.yaw = Math.PI;
    }
    for (let i = 0; i < 5; i += 1) {
      const bot = spawnBot('S', i, sWeapons[i], { x: sSpawn.x - 4 + i * 2, z: sSpawn.z - (i % 2) * 1.5 });
      bot.yaw = 0;
    }
  }

  function setPath(bot, toX, toZ) {
    const path = findPath(bot.position.x, bot.position.z, toX, toZ);
    bot.path = path;
    bot.pathIndex = 0;
  }

  function followPath(bot, dt, speed) {
    if (bot.pathIndex >= bot.path.length) return true;
    const node = nodePosition(bot.path[bot.pathIndex]);
    const dx = node.x - bot.position.x;
    const dz = node.z - bot.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.7) {
      bot.pathIndex += 1;
      return bot.pathIndex >= bot.path.length;
    }
    const step = Math.min(dist, speed * dt);
    const nx = bot.position.x + (dx / dist) * step;
    const nz = bot.position.z + (dz / dist) * step;
    if (!overlaps(nx, bot.position.z)) bot.position.x = nx;
    if (!overlaps(bot.position.x, nz)) bot.position.z = nz;
    bot.yaw = Math.atan2(-dx, -dz);
    bot.walkPhase += dt * 9;
    return false;
  }

  function separate(bot) {
    for (const other of bots) {
      if (other === bot || !other.alive) continue;
      const dx = bot.position.x - other.position.x;
      const dz = bot.position.z - other.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.01 && d < 0.85) {
        const push = (0.85 - d) * 0.5;
        bot.position.x += (dx / d) * push;
        bot.position.z += (dz / d) * push;
      }
    }
  }

  // --- The mind: perception, then one state machine per bot ---
  function acquireTarget(bot, ctx) {
    bot.scanTimer -= ctx.dt;
    if (bot.scanTimer > 0) return;
    bot.scanTimer = 0.15 + Math.random() * 0.05;
    const eye = _v.set(bot.position.x, EYE_HEIGHT, bot.position.z);
    const forward = _dir.set(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
    let best = null;
    let bestDist = Infinity;
    const candidates = [];
    if (ctx.player.alive && ctx.player.team !== bot.team) {
      candidates.push({ ref: 'player', pos: ctx.player.position, chest: 1.1 });
    }
    for (const other of bots) {
      if (other.team !== bot.team && other.alive) {
        candidates.push({ ref: other, pos: other.position, chest: 1.1 });
      }
    }
    for (const candidate of candidates) {
      _to.set(candidate.pos.x, candidate.chest, candidate.pos.z);
      const dist = _to.clone().sub(eye).length();
      if (dist > SEE_RANGE) continue;
      const facing = _to.clone().sub(eye).normalize().dot(forward);
      if (dist > 6 && facing < FOV_COS) continue;
      if (!hasLineOfSight(eye, _to)) continue;
      if (dist < bestDist) {
        bestDist = dist;
        best = candidate;
      }
    }
    if (best) {
      const newly = bot.target !== best.ref;
      bot.target = best.ref;
      bot.lastSeen.set(best.pos.x, 0, best.pos.z);
      bot.lastSeenTime = ctx.time;
      if (newly) {
        bot.reactionLeft = 0.35 + Math.random() * 0.35;
        bot.burstLeft = 0;
        bot.burstGap = 0;
        events.onSpotted(bot, bot.lastSeen);
      }
    } else if (bot.target && ctx.time - bot.lastSeenTime > 0.6) {
      bot.target = null;
    }
  }

  function hear(bot, ctx) {
    for (const noise of ctx.noises) {
      if (ctx.time - noise.time > 1.2) continue;
      const d = Math.hypot(noise.pos.x - bot.position.x, noise.pos.z - bot.position.z);
      if (d < noise.radius) {
        bot.alertPos = noise.pos;
        bot.alertTime = ctx.time;
      }
    }
  }

  function fireAt(bot, ctx, targetPos, targetRef) {
    const def = WEAPONS[bot.weaponId];
    if (bot.mag <= 0) {
      bot.reloadLeft = def.reload;
      return;
    }
    bot.mag -= 1;
    const muzzle = _v.set(
      bot.position.x - Math.sin(bot.yaw) * 0.5,
      1.35,
      bot.position.z - Math.cos(bot.yaw) * 0.5,
    ).clone();
    // Spread grows with range: a bot is still deadly up close, but at 15 m
    // it lands roughly one shot in four instead of nearly every round.
    // (The old 0.02 + dist*0.0009 made bots hit ~83% at 15 m — a lone player
    // died in ~3 s of exposure on any open lane, which no cover or peeking
    // could fix. Range falloff is what makes the yard playable.)
    const spread = 0.08 + Math.hypot(targetPos.x - bot.position.x, targetPos.z - bot.position.z) * 0.004;
    _dir.set(targetPos.x - muzzle.x, 1.1 - muzzle.y, targetPos.z - muzzle.z).normalize();
    _dir.x += (Math.random() + Math.random() + Math.random() - 1.5) * spread;
    _dir.y += (Math.random() + Math.random() + Math.random() - 1.5) * spread * 0.6;
    _dir.z += (Math.random() + Math.random() + Math.random() - 1.5) * spread;
    _dir.normalize();
    raycaster.set(muzzle, _dir);
    raycaster.far = def.range;
    const meshes = targetRef === 'player' ? ctx.player.hitMeshes : [targetRef.meshes.torso, targetRef.meshes.head];
    const hits = raycaster.intersectObjects([...meshes, ...shootables], false);
    const end = hits.length > 0 ? hits[0].point : muzzle.clone().addScaledVector(_dir, def.range);
    effects.tracer(muzzle, end);
    if (hits.length > 0 && meshes.includes(hits[0].object)) {
      const part = hits[0].object.userData.part || 'torso';
      const dist = hits[0].distance;
      let amount = def.damage * (part === 'head' ? def.headMult : 1);
      if (dist > 25) amount *= 0.85;
      events.onDamage(targetRef, amount, bot, part);
    } else if (hits.length > 0) {
      effects.impact(hits[0].point, hits[0].face ? hits[0].face.normal : new THREE.Vector3(0, 1, 0));
    }
    const playerDist = Math.hypot(muzzle.x - ctx.player.position.x, muzzle.z - ctx.player.position.z);
    if (playerDist < 45) audio.shot('bot');
    ctx.noises.push({ pos: muzzle.clone(), time: ctx.time, radius: HEAR_RANGE });
  }

  function engageStep(bot, ctx) {
    const targetPos = bot.target === 'player' ? ctx.player.position : bot.target.position;
    const dx = targetPos.x - bot.position.x;
    const dz = targetPos.z - bot.position.z;
    bot.yaw = Math.atan2(-dx, -dz);
    // Strafe sideways so the bot is a moving target, not a turret.
    bot.strafeTimer -= ctx.dt;
    if (bot.strafeTimer <= 0) {
      bot.strafeDir = Math.random() < 0.5 ? -1 : 1;
      bot.strafeTimer = 0.6 + Math.random() * 0.8;
    }
    const px = -dz / Math.max(0.01, Math.hypot(dx, dz)) * bot.strafeDir * 1.7 * ctx.dt;
    const pz = dx / Math.max(0.01, Math.hypot(dx, dz)) * bot.strafeDir * 1.7 * ctx.dt;
    if (!overlaps(bot.position.x + px, bot.position.z)) bot.position.x += px;
    if (!overlaps(bot.position.x, bot.position.z + pz)) bot.position.z += pz;
    if (bot.reloadLeft > 0) {
      bot.reloadLeft -= ctx.dt;
      if (bot.reloadLeft <= 0) bot.mag = WEAPONS[bot.weaponId].mag;
      return;
    }
    if (bot.reactionLeft > 0) {
      bot.reactionLeft -= ctx.dt;
      return;
    }
    bot.fireGap -= ctx.dt;
    if (bot.burstLeft > 0) {
      if (bot.fireGap <= 0) {
        fireAt(bot, ctx, targetPos, bot.target);
        bot.burstLeft -= 1;
        bot.fireGap = WEAPONS[bot.weaponId].gap;
      }
    } else {
      bot.burstGap -= ctx.dt;
      if (bot.burstGap <= 0) {
        bot.burstLeft = 3 + Math.floor(Math.random() * 3);
        bot.burstGap = 0.9 + Math.random() * 0.7;
      }
    }
  }

  function assignHold(bot, ctx) {
    const site = bot.assignedSite === 'A' ? MAP.siteA : MAP.siteB;
    const jitter = () => (Math.random() - 0.5) * 7;
    const holdX = site.center.x + jitter();
    const holdZ = site.center.z + jitter();
    bot.holdNode = { x: holdX, z: holdZ };
    bot.holdUntil = ctx.time + 6 + Math.random() * 6;
    setPath(bot, holdX, holdZ);
  }

  function step(bot, ctx) {
    const meshes = bot.meshes;
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + ctx.dt / 0.4);
      meshes.group.rotation.x = -bot.fall * 1.45;
      meshes.group.position.y = -bot.fall * 0.08;
      meshes.shell.material.opacity = 0;
      return;
    }
    // Echo-pulse reveal: the shell glows while revealed, and a pinged bot repositions.
    const revealed = ctx.time < bot.revealedUntil;
    meshes.shell.material.opacity = revealed ? 0.45 : 0;
    if (revealed && bot.mode !== 'engage' && bot.holdUntil > ctx.time) bot.holdUntil = 0;

    // Flash-blinded: stand still, see nothing, shoot nothing.
    if (ctx.time < bot.blindedUntil) {
      meshes.group.position.set(bot.position.x, 0, bot.position.z);
      meshes.group.rotation.y = bot.yaw;
      return;
    }

    acquireTarget(bot, ctx);
    hear(bot, ctx);
    const bomb = ctx.bomb;

    // --- State selection ---
    if (bot.target && ctx.time - bot.lastSeenTime < 0.6) {
      bot.mode = 'engage';
    } else if (bomb.state === 'planted' && bot.team === 'S') {
      bot.mode = 'defuse';
    } else if (bot.hasBomb && bot.team === 'V') {
      bot.mode = 'plant';
    } else if (bomb.state === 'dropped' && bot.team === 'V' && !bomb.carrier) {
      bot.mode = 'fetch';
    } else if (bot.alertPos && ctx.time - bot.alertTime < 3 && bot.mode !== 'engage') {
      bot.mode = 'rotate';
    } else if (bot.mode === 'engage' && ctx.time - bot.lastSeenTime > 4) {
      bot.mode = bot.team === 'V' ? 'push' : 'hold';
    } else if (bot.mode === 'engage') {
      bot.mode = 'rotate';
    }

    // --- State behaviour ---
    if (bot.mode === 'engage') {
      engageStep(bot, ctx);
    } else if (bot.mode === 'defuse') {
      const dist = Math.hypot(bomb.pos.x - bot.position.x, bomb.pos.z - bot.position.z);
      if (dist < 1.4) {
        bot.defuseProgress += ctx.dt / 5;
        bot.yaw = Math.atan2(-(bomb.pos.x - bot.position.x), -(bomb.pos.z - bot.position.z));
        events.onDefuseProgress(bot, bot.defuseProgress);
        if (bot.defuseProgress >= 1) events.onDefuseDone(bot);
      } else {
        bot.defuseProgress = 0;
        if (bot.pathIndex >= bot.path.length) setPath(bot, bomb.pos.x, bomb.pos.z);
        followPath(bot, ctx.dt, BOT_SPEED);
      }
    } else if (bot.mode === 'plant') {
      const site = bot.assignedSite === 'A' ? MAP.siteA : MAP.siteB;
      const dist = Math.hypot(site.center.x - bot.position.x, site.center.z - bot.position.z);
      if (dist < site.radius * 0.8) {
        bot.plantProgress += ctx.dt / 3;
        events.onPlantProgress(bot, bot.plantProgress);
        if (bot.plantProgress >= 1) events.onPlantDone(bot);
      } else {
        if (bot.pathIndex >= bot.path.length) setPath(bot, site.center.x, site.center.z);
        followPath(bot, ctx.dt, BOT_SPEED);
      }
    } else if (bot.mode === 'fetch') {
      const dist = Math.hypot(bomb.pos.x - bot.position.x, bomb.pos.z - bot.position.z);
      if (dist < 1.2) {
        bot.hasBomb = true;
        events.onBombPickup(bot);
      } else {
        if (bot.pathIndex >= bot.path.length) setPath(bot, bomb.pos.x, bomb.pos.z);
        followPath(bot, ctx.dt, BOT_SPEED);
      }
    } else if (bot.mode === 'rotate') {
      const goal = bot.alertPos || bot.lastSeen;
      if (bot.pathIndex >= bot.path.length) setPath(bot, goal.x, goal.z);
      const arrived = followPath(bot, ctx.dt, BOT_SPEED);
      if (arrived) {
        bot.alertPos = null;
        bot.mode = bot.team === 'V' ? 'push' : 'hold';
      }
    } else if (bot.mode === 'push') {
      // Attackers push their site; sometimes take the far lane to flank.
      if (bot.pathIndex >= bot.path.length) {
        if (ctx.time > bot.flankAt && !bot.flanked) {
          bot.flanked = true;
          const detour = bot.assignedSite === 'A' ? nodePosition('connEast') : nodePosition('connWest');
          setPath(bot, detour.x, detour.z);
          bot.detouring = true;
        } else if (bot.detouring) {
          bot.detouring = false;
          const site = bot.assignedSite === 'A' ? MAP.siteA : MAP.siteB;
          setPath(bot, site.center.x, site.center.z);
        } else {
          const site = bot.assignedSite === 'A' ? MAP.siteA : MAP.siteB;
          setPath(bot, site.center.x + (Math.random() - 0.5) * 3, site.center.z + (Math.random() - 0.5) * 3);
        }
      }
      followPath(bot, ctx.dt, BOT_SPEED);
      // Smoke the advance: when an enemy is in sight and the bot still has its
      // one smoke, drop cover halfway to the contact and push through it.
      if (bot.grenades > 0 && bot.target) {
        const targetPos = bot.target === 'player' ? ctx.player.position : bot.target.position;
        const d = Math.hypot(targetPos.x - bot.position.x, targetPos.z - bot.position.z);
        if (d < 20 && Math.random() < ctx.dt * 0.2) {
          bot.grenades -= 1;
          events.onThrowGrenade(bot, 'smoke', {
            x: (bot.position.x + targetPos.x) / 2,
            z: (bot.position.z + targetPos.z) / 2,
          });
        }
      }
    } else {
      // Defenders hold: walk to a hold spot near their site, scan, then pick another.
      if (ctx.time > bot.holdUntil || bot.pathIndex >= bot.path.length) {
        if (bot.pathIndex >= bot.path.length && bot.holdNode) {
          bot.yaw += Math.sin(ctx.time * 0.7 + bot.walkPhase) * 0.012;
        } else if (ctx.time > bot.holdUntil) {
          assignHold(bot, ctx);
        }
      }
      followPath(bot, ctx.dt, BOT_SPEED * 0.8);
    }

    separate(bot);
    bot.position.x = Math.max(MAP.minX + 0.5, Math.min(MAP.maxX - 0.5, bot.position.x));
    bot.position.z = Math.max(MAP.minZ + 0.5, Math.min(MAP.maxZ - 0.5, bot.position.z));

    // --- Pose ---
    meshes.group.position.set(bot.position.x, 0, bot.position.z);
    meshes.group.rotation.y = bot.yaw;
    const swing = Math.sin(bot.walkPhase) * 0.35;
    meshes.legL.rotation.x = swing;
    meshes.legR.rotation.x = -swing;
    if (bot.mode === 'engage') {
      meshes.group.rotation.x = 0;
    }
  }

  function damage(bot, amount, attacker, time, attackerPos) {
    if (!bot.alive) return false;
    bot.health -= amount;
    if (bot.health > 0) {
      // Being shot is information: the bot now knows roughly where the shooter is.
      if (attackerPos) {
        bot.alertPos = attackerPos;
        bot.alertTime = time;
        bot.lastSeen.copy(attackerPos);
        bot.lastSeenTime = time;
        bot.target = attacker === 'player' ? 'player' : attacker;
      }
      return false;
    }
    bot.alive = false;
    bot.fall = 0;
    if (bot.hasBomb) {
      bot.hasBomb = false;
      events.onBombDropped(bot);
    }
    events.onBotKilled(bot, attacker);
    return true;
  }

  function reveal(center, radius, until) {
    for (const bot of bots) {
      if (!bot.alive) continue;
      const d = Math.hypot(bot.position.x - center.x, bot.position.z - center.z);
      if (d < radius) bot.revealedUntil = until;
    }
  }

  function resetRound(attackerSite) {
    for (const bot of bots) {
      bot.health = 100;
      bot.alive = true;
      bot.mode = bot.team === 'V' ? 'push' : 'hold';
      bot.path = [];
      bot.pathIndex = 0;
      bot.target = null;
      bot.lastSeenTime = -100;
      bot.alertPos = null;
      bot.alertTime = -100;
      bot.reactionLeft = 0;
      bot.burstLeft = 0;
      bot.burstGap = 0;
      bot.fireGap = 0;
      bot.reloadLeft = 0;
      bot.mag = WEAPONS[bot.weaponId].mag;
      bot.holdNode = null;
      bot.holdUntil = 0;
      bot.assignedSite = bot.team === 'V' ? attackerSite : (Math.random() < 0.5 ? 'A' : 'B');
      bot.hasBomb = false;
      bot.plantProgress = 0;
      bot.defuseProgress = 0;
      bot.grenades = 1;
      bot.revealedUntil = 0;
      bot.fall = 0;
      bot.flanked = false;
      bot.detouring = false;
      bot.flankAt = 10 + Math.random() * 10;
      const spawn = bot.team === 'V' ? MAP.attackerSpawn : MAP.defenderSpawn;
      const index = bot.team === 'V' ? FRIENDLY_NAMES.indexOf(bot.name) : ENEMY_NAMES.indexOf(bot.name);
      bot.position.set(spawn.x - 3 + index * 2, 0, spawn.z + (bot.team === 'V' ? (index % 2) * 1.5 : -(index % 2) * 1.5));
      bot.yaw = bot.team === 'V' ? Math.PI : 0;
      bot.meshes.group.rotation.set(0, bot.yaw, 0);
      bot.meshes.group.position.copy(bot.position);
      bot.meshes.shell.material.opacity = 0;
      if (bot.team === 'S') assignHold(bot, { time: 0 });
    }
  }

  return {
    bots,
    spawnTeams,
    hasLineOfSight,
    setPath,
    followPath,
    separate,
    overlaps,
    raycaster,
    step,
    damage,
    reveal,
    resetRound,
    aliveCount(team) {
      return bots.filter((bot) => bot.team === team && bot.alive).length;
    },
    hitMeshes() {
      const meshes = [];
      for (const bot of bots) {
        if (bot.alive) meshes.push(bot.meshes.torso, bot.meshes.head);
      }
      return meshes;
    },
    // Read-only line-of-sight query for the test harness (window.__emberline):
    // eye (1.62) to torso (1.05), same raycast the bots use to spot. Inert in
    // normal play — it never writes to game state.
    los(x1, z1, x2, z2) {
      return hasLineOfSight(_v.set(x1, 1.62, z1), _to.set(x2, 1.05, z2));
    },
    // The HEAD line: eye 1.62 -> the bot's head 1.55. The player's shots
    // are raycast from the camera (eye), so this is the line a headshot
    // travels. A low wall blocks the torso line but not this one — and a
    // P2000 headshot deals 68 damage (headMult 2), so 2 headshots kill.
    // The probe aims at the head when the torso line is blocked.
    losHead(x1, z1, x2, z2) {
      return hasLineOfSight(_v.set(x1, 1.62, z1), _to.set(x2, 1.55, z2));
    },
    // The bot's FIRE line: muzzle 1.35 -> the player's head 1.6. A low
    // wall (~1.1 m) blocks the acquisition line (eye 1.62 -> torso 1.05)
    // but NOT this line — the bot shoots over the wall while the probe's
    // LOS check says 'blocked', so Ember bled 100->8 HP with no visible
    // enemy. The threat scan uses this line; the burst still uses los()
    // (her own shot goes to the torso).
    losFire(x1, z1, x2, z2) {
      return hasLineOfSight(_v.set(x1, 1.35, z1), _to.set(x2, 1.6, z2));
    },
  };
}
