// The DOM HUD: crosshair, hit marker, health and armour, ammo, money, timer, scores,
// alive counts, bomb status, kill feed, banners, the buy menu and the minimap. It
// never touches the simulation; main.js pushes numbers in and reads callbacks out.
// Minimap rectangles mirror world.js (perimeter, band walls, big cover).
import { SHOP } from './match.js';
import { WEAPONS } from './weapons.js';

const MINIMAP_RECTS = [
  [-28, -22, 56, 0.5], [-28, 21.5, 56, 0.5], [-28, -22, 0.5, 44], [27.5, -22, 0.5, 44],
  [-28, -6.25, 12, 0.5], [-12, -6.25, 8, 0.5], [4, -6.25, 8, 0.5], [16, -6.25, 12, 0.5],
  [-28, 5.75, 12, 0.5], [-12, 5.75, 8, 0.5], [4, 5.75, 8, 0.5], [16, 5.75, 12, 0.5],
  [-15.2, 8.8, 2.4, 2.4], [12.8, 8.8, 2.4, 2.4], [-15.2, -3.2, 2.4, 2.4], [12.8, -3.2, 2.4, 2.4],
  [-1.1, -1.1, 2.2, 2.2], [-6, -9.8, 12, 2.4],
  [22.5, -19, 3, 3], [19.9, -20.1, 2.2, 2.2],
  [-11.6, -16.5, 3.2, 1], [8.4, -16.5, 3.2, 1],
  [-8.5, 18.5, 1, 1], [7.5, -19.5, 1, 1],
];

const COPY = {
  start: {
    title: 'EMBERLINE',
    copy: 'Kestrel Yard at dusk. Vanguard vs Sentinels, first to 5 rounds. Plant the bomb at the marked site — or hold it. Q fires an echo pulse that reveals enemies through walls. Click to play.',
    action: 'Deploy',
  },
  paused: {
    title: 'EMBERLINE',
    copy: 'Paused. Click to resume.',
    action: 'Resume',
  },
  end: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammo = $('ammo');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const healthValue = $('health-value');
  const healthFill = $('health-fill');
  const armorValue = $('armor-value');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const scoreV = $('score-v');
  const scoreS = $('score-s');
  const aliveV = $('alive-v');
  const aliveS = $('alive-s');
  const roundValue = $('round-value');
  const siteValue = $('site-value');
  const bombStatus = $('bomb-status');
  const weaponName = $('weapon-name');
  const killfeed = $('killfeed');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const buyMenu = $('buy-menu');
  const buyGrid = $('buy-grid');
  const buyMoney = $('buy-money');
  const minimap = $('minimap');
  const minimapCtx = minimap.getContext('2d');
  const hitmarker = $('hitmarker');
  const crosshair = $('crosshair');
  const vignette = $('damage-vignette');
  const progress = $('progress');
  const progressFill = $('progress-fill');
  const progressLabel = $('progress-label');
  const pulseIndicator = $('pulse-indicator');
  const hint = $('hint');
  const grenadesEl = $('grenades');
  const kdK = $('kd-k');
  const kdD = $('kd-d');
  const damageDir = $('damage-dir');

  let hitTimer = 0;
  let bannerTimer = 0;
  let damageDirTimer = 0;
  let lastMag = -1;
  let lastReserve = -1;
  let lastHealth = -1;
  let lastArmor = -1;
  let lastMoney = -1;
  let lastTimer = '';
  let lastScore = '';
  let lastAlive = '';
  let lastGrenades = '';
  let lastKD = '';

  function formatTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  return {
    setAmmo(mag, reserve) {
      if (mag === lastMag && reserve === lastReserve) return;
      lastMag = mag;
      lastReserve = reserve;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      ammo.classList.toggle('empty', mag === 0);
    },
    setHealth(health, armor) {
      if (health === lastHealth && armor === lastArmor) return;
      lastHealth = health;
      lastArmor = armor;
      healthValue.textContent = String(Math.ceil(health));
      healthFill.style.width = `${Math.max(0, health)}%`;
      armorValue.textContent = armor > 0 ? `◈ ${Math.ceil(armor)}` : '';
    },
    setMoney(value) {
      if (value === lastMoney) return;
      lastMoney = value;
      moneyValue.textContent = `$${value}`;
      buyMoney.textContent = `$${value}`;
    },
    setTimer(seconds, phase) {
      const text = phase === 'buy' ? `BUY ${formatTime(seconds)}` : formatTime(seconds);
      if (text === lastTimer) return;
      lastTimer = text;
      timerValue.textContent = text;
      timerValue.classList.toggle('buy', phase === 'buy');
    },
    setScore(v, s) {
      const text = `${v}-${s}`;
      if (text === lastScore) return;
      lastScore = text;
      scoreV.textContent = String(v);
      scoreS.textContent = String(s);
    },
    setAlive(v, s) {
      const text = `${v}|${s}`;
      if (text === lastAlive) return;
      lastAlive = text;
      aliveV.textContent = String(v);
      aliveS.textContent = String(s);
    },
    setKD(k, d) {
      const text = `${k}|${d}`;
      if (text === lastKD) return;
      lastKD = text;
      kdK.textContent = String(k);
      kdD.textContent = String(d);
    },
    setGrenades(he, smoke, flash) {
      const text = `HE ${he} · SMK ${smoke} · FLS ${flash}`;
      if (text === lastGrenades) return;
      lastGrenades = text;
      grenadesEl.textContent = text;
    },
    setRound(n) {
      roundValue.textContent = `ROUND ${n}`;
    },
    setSite(site) {
      siteValue.textContent = site === 'A' ? 'TARGET: SITE A — SOLAR ARRAY' : 'TARGET: SITE B — PUMP HOUSE';
    },
    setBombStatus(text) {
      bombStatus.textContent = text;
    },
    setWeaponName(name) {
      weaponName.textContent = name;
    },
    setPulse(ready, fraction) {
      pulseIndicator.textContent = ready ? 'Q — ECHO PULSE READY' : `ECHO PULSE ${Math.ceil((1 - fraction) * 20)}s`;
      pulseIndicator.classList.toggle('ready', ready);
    },
    setHint(text) {
      hint.textContent = text;
    },
    hitMarker(killed, headshot) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      hitmarker.classList.toggle('head', headshot);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill', 'head'), 120);
    },
    setSpread(spread) {
      const gap = Math.min(26, 5 + spread * 320);
      crosshair.style.setProperty('--gap', `${gap.toFixed(1)}px`);
    },
    damageFlash() {
      vignette.classList.add('on');
      setTimeout(() => vignette.classList.remove('on'), 180);
    },
    // A ring arc that points toward the shooter (rel: 0 = ahead, + = left).
    damageDirection(rel) {
      damageDir.style.transform = `translate(-50%, -50%) rotate(${(-rel).toFixed(3)}rad)`;
      damageDir.classList.add('on');
      clearTimeout(damageDirTimer);
      damageDirTimer = setTimeout(() => damageDir.classList.remove('on'), 450);
    },
    killFeed(html) {
      const entry = document.createElement('div');
      entry.className = 'feed-entry';
      entry.innerHTML = html;
      killfeed.prepend(entry);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => entry.classList.add('fade'), 4200);
    },
    banner(main, sub, ms = 2600) {
      bannerTitle.textContent = main;
      bannerSub.textContent = sub || '';
      banner.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => banner.classList.remove('on'), ms);
    },
    showProgress(label, fraction) {
      progress.hidden = false;
      progressLabel.textContent = label;
      progressFill.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
    },
    hideProgress() {
      progress.hidden = true;
    },
    showBuyMenu(snapshot = {}) {
      buyGrid.innerHTML = '';
      for (const item of Object.values(SHOP)) {
        const button = document.createElement('button');
        button.className = 'buy-item';
        button.dataset.item = item.id;
        let stats = '';
        let owned = false;
        if (item.kind === 'gun') {
          const def = WEAPONS[item.id];
          stats = `DMG ${def.damage} · MAG ${def.mag} · ${def.auto ? 'AUTO' : 'SEMI'}`;
          owned = snapshot.primary === item.id;
        } else if (item.kind === 'grenade') {
          const count = (snapshot.grenades && snapshot.grenades[item.id]) || 0;
          stats = `OWNED ${count} / 2`;
          owned = count >= 2;
        } else if (item.kind === 'armor') {
          stats = snapshot.armor ? 'OWNED — 100 ARMOUR' : '100 ARMOUR';
          owned = !!snapshot.armor;
        }
        if (owned) button.classList.add('owned');
        button.innerHTML = `<span class="buy-name">${item.label}<small>${stats}</small></span><span class="buy-price">$${item.price}</span>`;
        buyGrid.appendChild(button);
      }
      buyMenu.hidden = false;
    },
    hideBuyMenu() {
      buyMenu.hidden = true;
    },
    onBuy(handler) {
      buyGrid.addEventListener('click', (event) => {
        const button = event.target.closest('.buy-item');
        if (button) handler(button.dataset.item);
      });
    },
    drawMinimap(data) {
      const ctx = minimapCtx;
      const scale = 200 / 56;
      const toX = (x) => (x + 28) * scale;
      const toY = (z) => (z + 22) * (160 / 44);
      ctx.clearRect(0, 0, 200, 160);
      ctx.fillStyle = '#241d2b';
      ctx.fillRect(0, 0, 200, 160);
      ctx.fillStyle = '#3a3040';
      for (const [x, z, w, d] of MINIMAP_RECTS) {
        ctx.fillRect(toX(x), toY(z), w * scale, d * (160 / 44));
      }
      ctx.font = 'bold 13px system-ui';
      ctx.fillStyle = '#2fb8a6';
      ctx.fillText('A', toX(-20) - 5, toY(-14) + 5);
      ctx.fillText('B', toX(20) - 5, toY(-14) + 5);
      if (data.bomb && (data.bomb.state === 'dropped' || data.bomb.state === 'planted')) {
        ctx.fillStyle = '#f0a830';
        ctx.beginPath();
        ctx.arc(toX(data.bomb.pos.x), toY(data.bomb.pos.z), 4, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const friend of data.friendlies) {
        ctx.fillStyle = '#2fb8a6';
        ctx.beginPath();
        ctx.arc(toX(friend.x), toY(friend.z), 3, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const enemy of data.enemies) {
        ctx.fillStyle = '#ff5a3c';
        ctx.beginPath();
        ctx.arc(toX(enemy.x), toY(enemy.z), 3, 0, Math.PI * 2);
        ctx.fill();
      }
      const px = toX(data.player.x);
      const py = toY(data.player.z);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(-data.player.yaw);
      ctx.fillStyle = '#f0a830';
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5, 6);
      ctx.lineTo(-5, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    },
    showOverlay(mode, score) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = mode === 'end' ? score : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
