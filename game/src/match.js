// The match: rounds, money, the bomb, and who wins. First to 5 rounds, at most 9.
// Attackers (Vanguard, the player included) carry the bomb to site A or B; defenders
// (Sentinels) stop them, or defuse after a plant. Money buys guns, grenades and
// armour between rounds. This module owns the rules; main.js owns the world.
import { MAP } from './world.js';

export const ROUND_TIME = 100;
export const BUY_TIME = 15;
export const PLANT_TIME = 3;
export const DEFUSE_TIME = 5;
export const DETONATE_TIME = 30;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;

export const SHOP = {
  vk9: { id: 'vk9', label: 'VK-9 SMG', price: 900, kind: 'gun' },
  ar77: { id: 'ar77', label: 'AR-77 Rifle', price: 2700, kind: 'gun' },
  m870: { id: 'm870', label: 'M870 Breacher', price: 1600, kind: 'gun' },
  longshot: { id: 'longshot', label: 'Longshot DMR', price: 4200, kind: 'gun' },
  he: { id: 'he', label: 'HE Grenade', price: 300, kind: 'grenade' },
  smoke: { id: 'smoke', label: 'Smoke Grenade', price: 250, kind: 'grenade' },
  flash: { id: 'flash', label: 'Flash Grenade', price: 200, kind: 'grenade' },
  armor: { id: 'armor', label: 'Kevlar Vest', price: 650, kind: 'armor' },
};

export function createMatch(hooks) {
  const state = {
    phase: 'menu',
    round: 0,
    scoreV: 0,
    scoreS: 0,
    money: 900,
    kills: 0,
    deaths: 0,
    timer: 0,
    site: 'A',
    bomb: {
      state: 'none',
      carrier: null,
      pos: MAP.attackerSpawn.clone(),
      site: null,
      explodeAt: 0,
    },
    plantProgress: 0,
    defuseProgress: 0,
    planting: null,
    defusing: null,
    roundEndAt: 0,
    endReason: '',
    winner: null,
  };

  function siteCenter(site) {
    return site === 'A' ? MAP.siteA.center : MAP.siteB.center;
  }

  function startMatch() {
    state.scoreV = 0;
    state.scoreS = 0;
    state.round = 0;
    state.money = 900;
    state.kills = 0;
    state.deaths = 0;
    state.winner = null;
    startRound();
  }

  function startRound() {
    state.round += 1;
    state.site = Math.random() < 0.5 ? 'A' : 'B';
    state.phase = 'buy';
    state.timer = BUY_TIME;
    state.bomb.state = 'carried';
    state.bomb.carrier = 'player';
    state.bomb.site = null;
    state.bomb.pos.copy(MAP.attackerSpawn);
    state.plantProgress = 0;
    state.defuseProgress = 0;
    state.planting = null;
    state.defusing = null;
    hooks.resetPositions(state.site);
    hooks.onRoundStart(state.round, state.site);
  }

  function endRound(winner, reason) {
    if (state.phase === 'roundEnd' || state.phase === 'matchEnd') return;
    state.phase = 'roundEnd';
    state.endReason = reason;
    if (winner === 'V') {
      state.scoreV += 1;
      state.money += 325;
    } else {
      state.scoreS += 1;
      state.money += 200;
    }
    hooks.onRoundEnd(winner, reason, state.scoreV, state.scoreS);
  }

  function endMatch() {
    state.phase = 'matchEnd';
    state.winner = state.scoreV > state.scoreS ? 'V' : 'S';
    hooks.onMatchEnd(state.winner, state.scoreV, state.scoreS);
  }

  function update(dt, ctx) {
    if (state.phase === 'buy') {
      state.timer -= dt;
      if (state.timer <= 0) {
        state.phase = 'live';
        state.timer = ROUND_TIME;
        hooks.onRoundLive();
      }
      return;
    }
    if (state.phase === 'live') {
      state.timer -= dt;
      if (state.bomb.state === 'planted' && ctx.time >= state.bomb.explodeAt) {
        hooks.onBombExploded(state.bomb.pos);
        endRound('V', 'Bomb detonated');
        return;
      }
      if (state.timer <= 0) {
        endRound('S', 'Time expired — site held');
        return;
      }
      if (ctx.attackersAlive === 0) {
        endRound('S', 'Vanguard eliminated');
        return;
      }
      if (ctx.defendersAlive === 0 && state.bomb.state !== 'planted') {
        endRound('V', 'Sentinels eliminated');
        return;
      }
      if (ctx.defendersAlive === 0 && state.bomb.state === 'planted') {
        // No one left to defuse; the bomb still has to go off.
        state.timer = Math.min(state.timer, Math.max(1, state.bomb.explodeAt - ctx.time));
      }
      return;
    }
    if (state.phase === 'roundEnd') {
      state.roundEndAt += dt;
      if (state.roundEndAt > 4) {
        state.roundEndAt = 0;
        if (state.scoreV >= WIN_ROUNDS || state.scoreS >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
          endMatch();
        } else {
          startRound();
        }
      }
    }
  }

  function buy(itemId) {
    const item = SHOP[itemId];
    if (!item) return { ok: false, reason: 'Unknown item' };
    if (state.phase !== 'buy' && state.phase !== 'live') return { ok: false, reason: 'Not now' };
    if (state.phase === 'live' && state.timer < ROUND_TIME - 2) {
      return { ok: false, reason: 'Buy time is over' };
    }
    if (state.money < item.price) return { ok: false, reason: 'Not enough money' };
    if (item.kind === 'grenade') {
      const count = hooks.grenadeCount(itemId);
      if (count >= 2) return { ok: false, reason: 'Max 2 of each grenade' };
    }
    if (item.kind === 'armor' && hooks.hasArmor()) return { ok: false, reason: 'Already armoured' };
    state.money -= item.price;
    hooks.onBuy(item);
    return { ok: true };
  }

  // --- Bomb: planting (player or bot) ---
  function plantTick(dt, who, inSite) {
    if (state.bomb.state !== 'carried') return 0;
    if (state.phase !== 'live') return 0;
    if (!inSite || state.planting !== who) {
      state.planting = null;
      state.plantProgress = 0;
      return 0;
    }
    state.plantProgress += dt / PLANT_TIME;
    if (state.plantProgress >= 1) {
      state.bomb.state = 'planted';
      state.bomb.site = state.site;
      state.bomb.explodeAt = hooks.now() + DETONATE_TIME;
      state.plantProgress = 0;
      state.planting = null;
      if (who === 'player') state.money += 300;
      hooks.onPlantDone(who, state.site);
      return 1;
    }
    return state.plantProgress;
  }

  function startPlanting(who, inSite) {
    if (state.bomb.state !== 'carried' || state.phase !== 'live') return false;
    if (!inSite) return false;
    if (state.bomb.carrier !== who) return false;
    state.planting = who;
    state.plantProgress = 0;
    return true;
  }

  function botPlantDone(bot) {
    if (state.bomb.state !== 'carried') return;
    state.bomb.state = 'planted';
    state.bomb.site = state.site;
    state.bomb.pos.copy(bot.position);
    state.bomb.explodeAt = hooks.now() + DETONATE_TIME;
    state.plantProgress = 0;
    state.planting = null;
    hooks.onPlantDone(bot, state.site);
  }

  function botDefuseDone(bot) {
    if (state.bomb.state !== 'planted') return;
    state.bomb.state = 'none';
    state.defuseProgress = 0;
    state.defusing = null;
    hooks.onDefuseDone(bot);
    endRound('S', 'Bomb defused');
  }

  function cancelPlanting(who) {
    if (state.planting === who) {
      state.planting = null;
      state.plantProgress = 0;
    }
  }

  // --- Bomb: defusing (player or bot) ---
  function defuseTick(dt, who, nearBomb) {
    if (state.bomb.state !== 'planted') return 0;
    if (state.phase !== 'live') return 0;
    if (!nearBomb || state.defusing !== who) {
      state.defusing = null;
      state.defuseProgress = 0;
      return 0;
    }
    state.defuseProgress += dt / DEFUSE_TIME;
    if (state.defuseProgress >= 1) {
      state.bomb.state = 'none';
      state.defuseProgress = 0;
      state.defusing = null;
      hooks.onDefuseDone(who);
      endRound('S', 'Bomb defused');
      return 1;
    }
    return state.defuseProgress;
  }

  function startDefusing(who, nearBomb) {
    if (state.bomb.state !== 'planted' || state.phase !== 'live') return false;
    if (!nearBomb) return false;
    state.defusing = who;
    state.defuseProgress = 0;
    return true;
  }

  function cancelDefusing(who) {
    if (state.defusing === who) {
      state.defusing = null;
      state.defuseProgress = 0;
    }
  }

  function onPlayerKill() {
    state.kills += 1;
    state.money += 150;
  }

  function onPlayerDeath() {
    state.deaths += 1;
    if (state.bomb.state === 'carried' && state.bomb.carrier === 'player') {
      state.bomb.state = 'dropped';
      state.bomb.carrier = null;
      state.bomb.pos.copy(hooks.playerPosition());
      hooks.onBombDropped(state.bomb.pos);
    }
    cancelPlanting('player');
  }

  function onBombPickup(who) {
    if (state.bomb.state !== 'dropped') return;
    state.bomb.state = 'carried';
    state.bomb.carrier = who;
    hooks.onBombPickup(who);
  }

  function onBombDroppedBot(pos) {
    if (state.bomb.state !== 'carried') return;
    state.bomb.state = 'dropped';
    state.bomb.carrier = null;
    state.bomb.pos.copy(pos);
    hooks.onBombDropped(state.bomb.pos);
  }

  return {
    state,
    startMatch,
    startRound,
    update,
    buy,
    plantTick,
    startPlanting,
    cancelPlanting,
    botPlantDone,
    botDefuseDone,
    defuseTick,
    startDefusing,
    cancelDefusing,
    onPlayerKill,
    onPlayerDeath,
    onBombPickup,
    onBombDroppedBot,
    siteCenter,
    isPlayerInSite(pos) {
      const center = siteCenter(state.site);
      return Math.hypot(pos.x - center.x, pos.z - center.z) < MAP.siteA.radius;
    },
    isNearBomb(pos) {
      if (state.bomb.state !== 'planted') return false;
      return Math.hypot(pos.x - state.bomb.pos.x, pos.z - state.bomb.pos.z) < 2.2;
    },
  };
}
