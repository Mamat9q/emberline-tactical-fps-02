[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/Mamat9q/emberline-tactical-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/Mamat9q/emberline-tactical-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

# EMBERLINE — Tactical FPS at Dusk

A round-based 5v5 tactical FPS in the browser, built on three.js 0.187.0.
One server, no build step, no network requests, no external assets: every
sound is synthesized with WebAudio and every model is procedural geometry.

**The yard.** Kestrel Yard is a decommissioned solar refinery at dusk — indigo
sky, a low amber sun, long shadows, sodium lamps, teal hazard paint. Two bomb
sites: **A — Solar Array** (north-west) and **B — Pump House** (north-east).
Three lanes (west, mid, east) cross the yard between two band walls.

**The game.** Vanguard (you + 4 squad bots) attack; Sentinels (5 bots) defend.
First to 5 rounds (max 9), 100 seconds a round. Plant the bomb at the marked
site (hold **E**, 3 s), defend it for 30 s — or clear the site. Money buys
guns, grenades and armour between rounds: you start with $900, enough for a
full first-round buy (armour $650 + a flash $200), and earn $325 for a round
win, $200 for a loss, $150 per kill and $300 for a plant. The HUD shows health, armour, ammo,
grenades, money, timer, round score, alive counts and your K/D; a red arc
points toward whoever just shot you, and when you go down the camera follows
a living squad mate until the next round.

**The signature move — Echo Pulse (Q).** A sonar ping that reveals every
enemy inside 30 m through walls for 3 seconds: glowing outlines on the field
and red blips on the minimap. Pinged bots know they were pinged and
reposition. One ping per 20 seconds — spend it when it matters.

## Controls

| Key | Action |
| --- | --- |
| WASD / mouse | Move / aim (click to lock the mouse) |
| Click | Fire (hold for automatics) |
| R | Reload |
| 1 / 2 | Primary / sidearm |
| 4 / 5 / 6 | Throw HE / smoke / flash grenade |
| Q | Echo pulse |
| E (hold) | Plant the bomb (in the marked site, while carrying it) |
| B | Buy menu (round start) |
| Ctrl / C | Crouch |
| Space | Jump |
| Right mouse | Aim down sights (DMR) |

## Arsenal

| Weapon | Price | Damage | Mag | Notes |
| --- | --- | --- | --- | --- |
| P2000 | — | 34 | 12 | Sidearm, always with you |
| VK-9 SMG | $900 | 26 | 28 | Fast, close range |
| AR-77 | $2,700 | 33 | 30 | The all-rounder |
| M870 Breacher | $1,600 | 12×8 pellets | 6 | Devastating up close |
| Longshot DMR | $4,200 | 88 | 5 | One-shot headshot, scoped |

Headshots deal double damage. Moving widens your spread; stopping to aim
pays. Armour absorbs 40% of a hit while it lasts. Every weapon has its own
view model with sights, magazine and barrel, a walk bob, and aim-down-sights
on the right mouse (the DMR zooms further). Spent casings fly, bullet hits
leave scorch marks, and your footsteps are audible as you move.

## The bots

Nine squad bots with a real state machine: they patrol routes, hold angles,
rotate on callouts, flank through the far lane, plant the bomb when they carry
it, defuse when you plant, hear gunshots, and fight back when shot. Attackers
smoke their push when a defender is in sight. Reaction time, burst fire and
spread keep them fair — they miss, they reposition, they make mistakes under
pressure. Each bot wears a backpack, shoulder pads and a team-coloured chest
stripe.

## The yard, in detail

Beyond the lanes and sites: the solar panels are gridded photovoltaic cells,
floating A and B letters mark the sites, the ground carries tyre tracks, oil
stains and amber hazard chevrons at the site entrances, crates are stacked
two high, tyre stacks and barrel clusters mark the spawn approaches, pipes
run along the band walls, and early stars are out in the indigo sky.

## Testing

`window.__emberline` is a read-only debug interface (player position and yaw,
bot positions, match state) for automated playtesting. It never writes to the
game and is inert in normal play.

## Run it

```sh
node serve.ts        # then open http://localhost:8080
```

Screenshots (deterministic frames for captures):

```sh
node serve.ts
# open http://localhost:8080/?shot=start&seed=1   (menu over the yard)
# open http://localhost:8080/?shot=play&seed=1    (mid-combat)
# open http://localhost:8080/?shot=plant&seed=1   (bomb plant at site A)
# open http://localhost:8080/?shot=end&seed=1     (round won)
```

## Build the entry

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

This copies `game/` and `screenshots/` to `out/` and writes
`out/dossier.json` (makefun/dossier/v1) with the vendored make.fun library.

## Layout

```
game/
  index.html            page, HUD, import map
  vendor/three/         three.js 0.187.0, byte-for-byte from the kit
  src/
    main.js             boot, fixed 60 Hz loop, shooting, grenades, shots
    world.js            Kestrel Yard map, dusk lighting, bomb sites
    nav.js              waypoint graph + A* for the bots
    bots.js             squad AI (patrol / hold / engage / rotate / plant / defuse)
    match.js            rounds, economy, bomb, win conditions
    weapons.js          the five guns + view models
    effects.js          tracers, impacts, smoke, explosion, echo-pulse ring, casings, decals
    audio.js            WebAudio-synthesized sounds (no audio files)
    hud.js              HUD, minimap, kill feed, buy menu, banners
    player.js           movement, collision, health, armour
    input.js            keyboard, mouse, pointer lock
    palette.js          the dusk colour plan
```

Entry for the make.fun bounty
[threejs-fps-02 — Make the best three.js tactical FPS](https://make.fun/bounty/threejs-fps-02).
MIT licensed.
