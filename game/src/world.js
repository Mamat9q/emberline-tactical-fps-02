// Kestrel Yard: a decommissioned solar refinery at dusk, 56 x 44 m, built from boxes,
// cylinders and tilted panels. Every solid is a collider for players and bots and a
// surface a bullet stops on. Two bomb sites: A "Solar Array" north-west, B "Pump House"
// north-east. Attackers spawn south, defenders north; three lanes (west, mid, east)
// cross two band walls. Plain geometry only, no models, no textures, no network.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const MAP = {
  minX: -28, maxX: 28, minZ: -22, maxZ: 22,
  siteA: { center: new THREE.Vector3(-20, 0, -14), radius: 4.2, name: 'SOLAR ARRAY' },
  siteB: { center: new THREE.Vector3(20, 0, -14), radius: 4.2, name: 'PUMP HOUSE' },
  attackerSpawn: new THREE.Vector3(0, 0, 18),
  defenderSpawn: new THREE.Vector3(0, 0, -18),
};

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'amber' || name === 'sun' ? 0.5 : 0.92,
      metalness: name === 'steel' ? 0.45 : 0.04,
      emissive: name === 'sun' ? new THREE.Color(PALETTE.sun) : new THREE.Color(0x000000),
      emissiveIntensity: name === 'sun' ? 0.6 : 0,
    });
  }
  const glowTeal = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.hazard), roughness: 0.4, metalness: 0.1,
    emissive: new THREE.Color(PALETTE.hazard), emissiveIntensity: 0.9,
  });
  const glowAmber = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.amber), roughness: 0.4, metalness: 0.1,
    emissive: new THREE.Color(PALETTE.amber), emissiveIntensity: 0.9,
  });
  const panelFace = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#2a4066'), roughness: 0.3, metalness: 0.55,
    emissive: new THREE.Color('#0d1c33'), emissiveIntensity: 0.6,
  });
  // Solar-cell grid lines: thin strips that sit on each panel face so the array
  // reads as photovoltaic cells at dusk instead of a black slab.
  const panelGrid = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#a8c8e8'), roughness: 0.35, metalness: 0.5,
    emissive: new THREE.Color('#6a9ac8'), emissiveIntensity: 1.2,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#17171a'), roughness: 0.95, metalness: 0.05,
  });

  const colliders = [];
  const shootables = [];
  const siteRings = {};

  function register(mesh, solid = true) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (solid) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  function box(w, h, d, x, y, z, material, solid = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material]);
    mesh.position.set(x, y, z);
    return register(mesh, solid);
  }

  function cylinder(radiusTop, radiusBottom, height, x, y, z, material, segments = 14) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
      materials[material],
    );
    mesh.position.set(x, y, z);
    return register(mesh);
  }

  function flat(w, d, x, z, material, y = 0.02) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), materials[material]);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  // --- Ground: sand field, asphalt lanes, painted centre line and site pads ---
  box(56.8, 0.4, 44.8, 0, -0.2, 0, 'sand');
  flat(56, 3.2, 0, 0, 'asphalt');
  flat(3.2, 44, -22, 0, 'asphalt');
  flat(3.2, 44, 22, 0, 'asphalt');
  flat(0.18, 40, 0, 0, 'amber');
  flat(7.5, 7.5, -20, -14, 'asphalt');
  flat(7.5, 7.5, 20, -14, 'asphalt');

  // --- Ground wear: tyre tracks on the lanes, oil stains, hazard chevrons ---
  // (flat decals, no colliders; they sit just above the ground so they never
  // z-fight with the asphalt beneath them)
  function disc(radius, x, z, material, y = 0.03) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.02, 20), materials[material]);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  flat(0.5, 36, -22.8, 0, 'steel', 0.05);
  flat(0.5, 36, -21.2, 0, 'steel', 0.05);
  flat(0.5, 36, 21.2, 0, 'steel', 0.05);
  flat(0.5, 36, 22.8, 0, 'steel', 0.05);
  disc(0.9, -8, 14, 'steel');
  disc(0.7, 10, -14, 'steel');
  disc(0.8, 4, -18, 'steel');
  // Chevron strips marking the two site entrances.
  for (const [cx, cz, dir] of [[-17, -10.5, 1], [17, -10.5, -1]]) {
    for (let i = 0; i < 3; i += 1) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.04, 0.2), materials.amber);
      strip.position.set(cx + dir * i * 0.9, 0.05, cz - i * 0.55);
      strip.rotation.y = dir * 0.6;
      strip.receiveShadow = true;
      group.add(strip);
    }
  }
  // Amber outline around each site pad so the objective reads from afar.
  for (const [px, pz] of [[-20, -14], [20, -14]]) {
    flat(7.9, 0.25, px, pz - 3.85, 'amber', 0.05);
    flat(7.9, 0.25, px, pz + 3.85, 'amber', 0.05);
    flat(0.25, 7.9, px - 3.85, pz, 'amber', 0.05);
    flat(0.25, 7.9, px + 3.85, pz, 'amber', 0.05);
  }

  // --- Perimeter walls, 4.6 m, open to the dusk sky ---
  box(0.5, 4.6, 44.8, -28.2, 2.3, 0, 'steel');
  box(0.5, 4.6, 44.8, 28.2, 2.3, 0, 'steel');
  box(56.8, 4.6, 0.5, 0, 2.3, -22.2, 'steel');
  box(56.8, 4.6, 0.5, 0, 2.3, 22.2, 'steel');

  // --- Band walls with three gaps each (west / mid / east lanes) ---
  function bandWall(z) {
    box(12, 3.4, 0.5, -22, 1.7, z, 'rust');
    box(12, 3.4, 0.5, 22, 1.7, z, 'rust');
    box(8, 3.4, 0.5, -8, 1.7, z, 'rust');
    box(8, 3.4, 0.5, 8, 1.7, z, 'rust');
    // Dark steel base strips so the long orange faces are not one flat slab.
    for (const [bx, bw] of [[-22, 12], [22, 12], [-8, 8], [8, 8]]) {
      const base = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.4, 0.56), materials.steel);
      base.position.set(bx, 0.2, z);
      base.receiveShadow = true;
      group.add(base);
    }
  }
  bandWall(-6);
  bandWall(6);
  // Industrial pipes running along the top of each band wall.
  for (const z of [-6, 6]) {
    const wallPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 56, 10), materials.steel);
    wallPipe.rotation.z = Math.PI / 2;
    wallPipe.position.set(0, 3.7, z);
    register(wallPipe);
  }

  // --- Site A: Solar Array — tilted panel rows on frames, crates, a low wall ---
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 2; col += 1) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 2.2), panelFace);
      panel.position.set(-24 + col * 4.4, 1.5, -17.5 + row * 3.4);
      panel.rotation.x = -0.5;
      panel.rotation.y = 0.12 * (col === 0 ? 1 : -1);
      // Cell grid on the panel face (children, so they inherit the tilt).
      for (const gz of [-0.55, 0, 0.55]) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.03, 0.12), panelGrid);
        strip.position.set(0, 0.08, gz);
        panel.add(strip);
      }
      for (const gx of [-0.85, 0, 0.85]) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 2.1), panelGrid);
        strip.position.set(gx, 0.08, 0);
        panel.add(strip);
      }
      register(panel);
      box(0.18, 1.4, 0.18, -25.4 + col * 4.4, 0.7, -18.2 + row * 3.4, 'steel');
      box(0.18, 1.4, 0.18, -22.6 + col * 4.4, 0.7, -18.2 + row * 3.4, 'steel');
    }
  }
  box(2.2, 1.1, 1.2, -15.5, 0.55, -12.5, 'rust');
  box(1.2, 1.1, 2.4, -24.5, 0.55, -10.5, 'rust');
  box(4.5, 0.9, 0.6, -20, 0.45, -18.6, 'steel');

  // --- Site B: Pump House — tanks, pipes, a walled corner ---
  cylinder(1.5, 1.5, 3.4, 24, 1.7, -17.5, 'rust');
  cylinder(1.1, 1.1, 2.6, 21, 1.3, -19, 'steel');
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 9, 10), materials.steel);
  pipe.rotation.z = Math.PI / 2;
  pipe.position.set(20, 2.9, -19.5);
  register(pipe);
  box(0.5, 3.2, 7, 24.5, 1.6, -12, 'steel');
  box(2.2, 1.1, 1.2, 15.5, 0.55, -12.5, 'rust');
  box(1.2, 1.1, 2.4, 24.5, 0.55, -16.5, 'rust');

  // --- Mid: central pillar, catwalk with step crates, sandbag lines ---
  box(2.2, 3.4, 2.2, 0, 1.7, 0, 'steel');
  // Amber hazard band around the pillar so the dark steel reads at dusk.
  const pillarBand = new THREE.Mesh(new THREE.BoxGeometry(2.26, 0.16, 2.26), materials.amber);
  pillarBand.position.set(0, 1.2, 0);
  pillarBand.receiveShadow = true;
  group.add(pillarBand);
  box(1.2, 1.1, 1.2, -4.5, 0.55, 2.5, 'rust');
  box(1.2, 1.1, 1.2, 4.5, 0.55, -2.5, 'rust');
  box(1.2, 1.1, 1.2, -4.5, 0.55, -2.5, 'rust');
  box(1.2, 1.1, 1.2, 4.5, 0.55, 2.5, 'rust');
  // Catwalk along the north edge of mid (walkable 1.1 m platform, step crates at both ends)
  box(12, 1.1, 2.4, 0, 0.55, -8.6, 'asphalt');
  box(1.6, 0.55, 1.6, -6.4, 0.28, -8.6, 'rust');
  box(1.6, 0.55, 1.6, 6.4, 0.28, -8.6, 'rust');
  box(12, 0.5, 0.18, 0, 1.35, -9.7, 'hazard');

  // --- Lane cover: crates, barrels, containers ---
  box(2.4, 2.4, 2.4, -14, 1.2, 10, 'rust');
  box(1.2, 1.1, 1.2, -11, 0.55, 11.5, 'rust');
  box(2.4, 2.4, 2.4, 14, 1.2, 10, 'rust');
  box(1.2, 1.1, 1.2, 11, 0.55, 11.5, 'rust');
  box(2.4, 2.4, 2.4, -14, 1.2, -2, 'rust');
  box(2.4, 2.4, 2.4, 14, 1.2, -2, 'rust');
  cylinder(0.55, 0.55, 1.1, -8, 0.55, 14, 'steel');
  cylinder(0.55, 0.55, 1.1, -7, 0.55, 15, 'steel');
  cylinder(0.55, 0.55, 1.1, 8, 0.55, 14, 'steel');
  cylinder(0.55, 0.55, 1.1, 9, 0.55, -12, 'rust');
  cylinder(0.55, 0.55, 1.1, -9, 0.55, -12, 'rust');
  box(3.2, 0.7, 1.0, -18, 0.35, 2, 'sand');
  box(3.2, 0.7, 1.0, 18, 0.35, 2, 'sand');
  box(3.2, 0.7, 1.0, -18, 0.35, -10, 'sand');
  box(3.2, 0.7, 1.0, 18, 0.35, -10, 'sand');
  box(3.2, 0.7, 1.0, -10, 0.35, -16, 'sand');
  box(3.2, 0.7, 1.0, 10, 0.35, -16, 'sand');
  // Second-storey crates on the four big lane crates (taller cover, more angles).
  box(1.2, 1.1, 1.2, -14, 2.95, 10, 'rust');
  box(1.2, 1.1, 1.2, 14, 2.95, 10, 'rust');
  box(1.2, 1.1, 1.2, -14, 2.95, -2, 'steel');
  box(1.2, 1.1, 1.2, 14, 2.95, -2, 'steel');
  // Extra barrel clusters near the sites and spawns.
  cylinder(0.55, 0.55, 1.1, -11, 0.55, -14, 'steel');
  cylinder(0.55, 0.55, 1.1, 11, 0.55, -14, 'rust');
  cylinder(0.55, 0.55, 1.1, -6, 0.55, 16, 'rust');
  cylinder(0.55, 0.55, 1.1, 6, 0.55, 16, 'steel');
  // Tyre stacks (three high) marking the spawn approaches.
  for (const [tx, tz] of [[-8, 19], [8, -19]]) {
    for (let i = 0; i < 3; i += 1) {
      const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.24, 14), tireMat);
      tyre.position.set(tx, 0.12 + i * 0.24, tz);
      register(tyre);
    }
  }

  // --- Spawn shelters ---
  box(4, 2.6, 0.5, -4, 1.3, 20.5, 'steel');
  box(4, 2.6, 0.5, 4, 1.3, 20.5, 'steel');
  box(4, 2.6, 0.5, -4, 1.3, -20.5, 'steel');
  box(4, 2.6, 0.5, 4, 1.3, -20.5, 'steel');

  // --- Bomb-site rings and beacons ---
  // Site beacon: small and teal (not a blown-out white ball) so it never hides
  // the HUD text behind it.
  const beaconMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.hazard), roughness: 0.4, metalness: 0.1,
    emissive: new THREE.Color(PALETTE.hazard), emissiveIntensity: 0.5,
  });
  function siteRing(site, material) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(site.radius, 0.09, 8, 48), material);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(site.center.x, 0.06, site.center.z);
    ring.receiveShadow = true;
    group.add(ring);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.4, 8), materials.steel);
    pole.position.set(site.center.x, 1.7, site.center.z);
    register(pole);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), beaconMat);
    beacon.position.set(site.center.x, 3.0, site.center.z);
    group.add(beacon);
    const light = new THREE.PointLight(new THREE.Color(PALETTE.hazard), 30, 22);
    light.position.set(site.center.x, 3.2, site.center.z);
    scene.add(light);
    siteRings[site.name] = { ring, beacon, light };
  }
  siteRing(MAP.siteA, glowTeal);
  siteRing(MAP.siteB, glowTeal);

  // Floating site letters (canvas-texture sprites, always facing the camera)
  // so the objective reads instantly from any lane.
  function siteSign(letter, x, z) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.font = '800 92px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(10, 8, 14, 0.9)';
    ctx.strokeText(letter, 64, 68);
    ctx.fillStyle = '#2fb8a6';
    ctx.fillText(letter, 64, 68);
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
    // Low enough to stay clear of the top-bar text and the centre banner.
    sprite.scale.set(2.2, 2.2, 1);
    sprite.position.set(x, 4.4, z);
    scene.add(sprite);
    return sprite;
  }
  const siteSigns = [
    siteSign('A', MAP.siteA.center.x, MAP.siteA.center.z),
    siteSign('B', MAP.siteB.center.x, MAP.siteB.center.z),
  ];

  // --- Dusk sky: gradient dome, low amber sun disc, sodium lamps ---
  const skyGeo = new THREE.SphereGeometry(160, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color('#14101f') },
      mid: { value: new THREE.Color('#4b2e4d') },
      low: { value: new THREE.Color('#c96a2e') },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 low;
      void main(){ float h = normalize(vP).y; vec3 c = h > 0.25 ? mix(mid, top, smoothstep(0.25, 0.8, h)) : mix(low, mid, smoothstep(-0.05, 0.25, h)); gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);
  scene.fog = new THREE.Fog(new THREE.Color('#2a1e33'), 30, 120);

  // Early stars in the upper sky (static points, no texture, no network).
  const starCount = 220;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i += 1) {
    const theta = Math.random() * Math.PI * 2;
    const y = 0.25 + Math.random() * 0.75;
    const r = Math.sqrt(1 - y * y);
    starPos[i * 3] = Math.cos(theta) * r * 145;
    starPos[i * 3 + 1] = y * 145;
    starPos[i * 3 + 2] = Math.sin(theta) * r * 145;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xcfd8ff, size: 1.4, sizeAttenuation: false, fog: false,
    transparent: true, opacity: 0.8,
  }));
  scene.add(stars);

  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(9, 32),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.sun), fog: false }),
  );
  sunDisc.position.set(-120, 16, -40);
  sunDisc.lookAt(0, 4, 0);
  scene.add(sunDisc);

  const hemi = new THREE.HemisphereLight(new THREE.Color('#6b5790'), new THREE.Color('#7a5638'), 2.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb347'), 2.6);
  sun.position.set(-60, 22, -18);
  sun.target.position.set(10, 0, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  sun.shadow.camera.far = 160;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#8a7cc0'), 1.6);
  fill.position.set(30, 24, 30);
  scene.add(fill);

  // Sodium lamps along the lanes. The two mid-lane lamps sit 2.5 m off the
  // centre line — an earlier (0,12)/(0,-12) placement put a solid pole
  // dead-centre on the mid walkway (spawn -> midSouth), where it blocked
  // the straight lane for the player and for every bot pathing mid.
  const lampPositions = [[-22, 6], [22, 6], [-22, -10], [22, -10], [2.5, 12], [-2.5, -12]];
  for (const [x, z] of lampPositions) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.4, 8), materials.steel);
    post.position.set(x, 2.2, z);
    register(post);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), glowAmber);
    lamp.position.set(x, 4.5, z);
    group.add(lamp);
    const light = new THREE.PointLight(new THREE.Color(PALETTE.amber), 12, 13);
    light.position.set(x, 4.3, z);
    scene.add(light);
  }

  return { colliders, shootables, group, siteRings, siteSigns };
}
