import * as THREE from 'three';
import { DS, ROAD_HALF, frame, groundY } from './track.js';
import { GeoBuilder, T, put, mulberry32, col, jitter } from './geo.js';

export const CHUNK = 40; // metres of road per scenery mesh
const AHEAD = 640;

export const SKY_TOP = 0x2f6fd6;
export const HORIZON = 0xcfe4f7;

const C = {
  asphalt: col(0x43474f),
  line: col(0xf2f2f2),
  yellow: col(0xffc928),
  curbR: col(0xd8343a),
  curbW: col(0xf1f1f1),
  rail: col(0xc6cdd5),
  post: col(0x7d848d),
  shoulder: col(0x6f9447),
  grass: [col(0x5f9e3c), col(0x6aab45), col(0x569236), col(0x74b04d), col(0x7fae4a)],
  trunk: col(0x6e4a2c),
  pine: [col(0x2d6a34), col(0x387a3b), col(0x2a5f31)],
  leaf: [col(0x4f9b3a), col(0x67b146), col(0x88b83e), col(0x5aa83c)],
  bld: [0xd8d1c3, 0xa9b9cc, 0xc4b59c, 0x8c9aae, 0xe7e2d8, 0xb98f73, 0x7d8aa0, 0xcfc6b8].map(col),
  win: [col(0x2f4a6b), col(0x3f6290), col(0x24364f), col(0x4a6f9a)],
  roof: col(0x5d636b),
  pole: col(0x5a616b),
  lamp: col(0xfff4c2),
  gantry: col(0x8d949c),
  signG: col(0x1d7a43),
  signB: col(0x1f5fae),
  white: col(0xffffff),
};

const GROUND_L = [-170, -100, -60, -34, -20, -ROAD_HALF];
const GROUND_R = [ROAD_HALF, 20, 34, 60, 100, 170];

const P = (f, o, dy) => [f.x + f.rx * o, f.y + dy, f.z + f.rz * o];
const G = (f, o) => [f.x + f.rx * o, groundY(f.s, o), f.z + f.rz * o];

function strip(gb, a, b, o1, o2, dy, color) {
  gb.quad(P(a, o1, dy), P(a, o2, dy), P(b, o2, dy), P(b, o1, dy), color);
}

function wall(gb, a, b, o, y1, y2, facePositive, color) {
  if (facePositive) gb.quad(P(a, o, y2), P(a, o, y1), P(b, o, y1), P(b, o, y2), color);
  else gb.quad(P(a, o, y1), P(a, o, y2), P(b, o, y2), P(b, o, y1), color);
}

function at(s, o) {
  const f = frame(s, {});
  return { x: f.x + f.rx * o, z: f.z + f.rz * o, y: groundY(s, o), yaw: -f.th, f };
}

function addPine(gb, x, y, z, sc, rng) {
  put(gb, T.cyl, x, y, z, 0.25 * sc, 1.6 * sc, 0.25 * sc, C.trunk);
  const c = C.pine[Math.floor(rng() * C.pine.length)];
  put(gb, T.cone, x, y + 1.1 * sc, z, 1.7 * sc, 3.2 * sc, 1.7 * sc, c, rng() * 3);
  put(gb, T.cone, x, y + 2.7 * sc, z, 1.2 * sc, 2.6 * sc, 1.2 * sc, jitter(c, rng(), 0.12), rng() * 3);
}

function addRoundTree(gb, x, y, z, sc, rng) {
  put(gb, T.cyl, x, y, z, 0.25 * sc, 1.9 * sc, 0.25 * sc, C.trunk);
  const c = C.leaf[Math.floor(rng() * C.leaf.length)];
  put(gb, T.ico, x, y + 2.8 * sc, z, 1.7 * sc, 1.5 * sc, 1.7 * sc, c, rng() * 3);
}

function addBuilding(gb, s, o, w, d, h, rng) {
  const p = at(s, o);
  const yaw = p.yaw + (rng() - 0.5) * 0.1;
  const base = p.y - 2;
  const c = C.bld[Math.floor(rng() * C.bld.length)];
  put(gb, T.boxB, p.x, base, p.z, w, h + 2, d, c, yaw);
  const wc = C.win[Math.floor(rng() * C.win.length)];
  for (let y = base + 4.5; y < base + h - 1; y += 3.6) {
    put(gb, T.boxB, p.x, y, p.z, w + 0.24, 1.3, d + 0.24, wc, yaw);
  }
  put(gb, T.boxB, p.x + (rng() - 0.5) * w * 0.4, base + h + 2, p.z, w * 0.3, 1.6, d * 0.3, C.roof, yaw);
}

/** Build one 40 m section of road + scenery as a single vertex-coloured mesh. */
function buildChunk(idx) {
  const s0 = idx * CHUNK;
  const n = CHUNK / DS;
  const F = [];
  for (let i = 0; i <= n; i++) F.push(frame(s0 + i * DS, {}));
  const rng = mulberry32(idx * 7919 + 13);
  const gb = new GeoBuilder();

  for (let i = 0; i < n; i++) {
    const a = F[i];
    const b = F[i + 1];
    const s = a.s;

    // Asphalt
    strip(gb, a, b, -ROAD_HALF, ROAD_HALF, 0, jitter(C.asphalt, rng(), 0.03));

    // Markings: solid edge lines, dashed lane dividers
    strip(gb, a, b, -8.2, -8.0, 0.02, C.yellow);
    strip(gb, a, b, 8.0, 8.2, 0.02, C.line);
    if (Math.floor(s / 4) % 3 === 0) {
      for (const o of [-4, 0, 4]) strip(gb, a, b, o - 0.1, o + 0.1, 0.02, C.line);
    }

    // Curbs
    const curb = Math.floor(s / 4) % 2 === 0 ? C.curbR : C.curbW;
    strip(gb, a, b, -ROAD_HALF, -9.4, 0.03, curb);
    strip(gb, a, b, 9.4, ROAD_HALF, 0.03, curb);

    // Guard rails (inner face, outer face, top)
    wall(gb, a, b, 10.32, 0.45, 0.82, false, C.rail);
    wall(gb, a, b, 10.48, 0.45, 0.82, true, C.rail);
    strip(gb, a, b, 10.32, 10.48, 0.82, C.rail);
    wall(gb, a, b, -10.32, 0.45, 0.82, true, C.rail);
    wall(gb, a, b, -10.48, 0.45, 0.82, false, C.rail);
    strip(gb, a, b, -10.48, -10.32, 0.82, C.rail);
    if (i % 2 === 0) {
      for (const o of [-10.55, 10.55]) {
        const p = P(a, o, -0.05);
        put(gb, T.boxB, p[0], p[1], p[2], 0.14, 0.85, 0.14, C.post, -a.th);
      }
    }

    // Terrain
    for (const offs of [GROUND_L, GROUND_R]) {
      for (let k = 0; k < offs.length - 1; k++) {
        const o1 = offs[k];
        const o2 = offs[k + 1];
        const near = Math.min(Math.abs(o1), Math.abs(o2)) <= ROAD_HALF;
        const c = near ? jitter(C.shoulder, rng(), 0.05) : jitter(C.grass[Math.floor(rng() * C.grass.length)], rng(), 0.06);
        gb.quad(G(a, o1), G(a, o2), G(b, o2), G(b, o1), c);
      }
    }
  }

  // City zones: buildings come and go with a slow wave along the road.
  const city = Math.sin(s0 / 700 + 1.5);
  const isCity = city > 0.3;

  if (isCity) {
    for (const side of [-1, 1]) {
      const count = 2 + Math.floor(rng() * 2);
      for (let k = 0; k < count; k++) {
        const s = s0 + ((k + 0.5) / count) * CHUNK;
        const w = 9 + rng() * (CHUNK / count - 10);
        const d = 10 + rng() * 12;
        const h = 10 + rng() * 45 * city;
        const o = side * (34 + d / 2 + rng() * 60);
        addBuilding(gb, s, o, w, d, h, rng);
      }
    }
  }

  // Trees
  const trees = isCity ? 4 : 14;
  for (let k = 0; k < trees; k++) {
    const side = rng() < 0.5 ? -1 : 1;
    const o = side * (15 + Math.pow(rng(), 1.5) * (isCity ? 16 : 110));
    const p = at(s0 + rng() * CHUNK, o);
    const sc = 0.8 + rng() * 0.8;
    if (rng() < 0.55) addPine(gb, p.x, p.y, p.z, sc, rng);
    else addRoundTree(gb, p.x, p.y, p.z, sc, rng);
  }

  // Street lamp
  {
    const side = idx % 2 === 0 ? 1 : -1;
    const f = F[0];
    const base = P(f, side * 11.2, -0.05);
    put(gb, T.cyl, base[0], base[1], base[2], 0.12, 8, 0.12, C.pole);
    const arm = P(f, side * 10.1, 7.9);
    put(gb, T.boxB, arm[0], arm[1], arm[2], 2.4, 0.15, 0.18, C.pole, -f.th);
    const lamp = P(f, side * 9.0, 7.75);
    put(gb, T.boxB, lamp[0], lamp[1], lamp[2], 0.8, 0.18, 0.36, C.lamp, -f.th);
  }

  // Overhead sign gantry every 800 m
  if (idx % 20 === 10) {
    const f = F[Math.floor(n / 2)];
    for (const o of [-11.5, 11.5]) {
      const p = P(f, o, -0.05);
      put(gb, T.boxB, p[0], p[1], p[2], 0.45, 7.2, 0.45, C.gantry, -f.th);
    }
    const beam = P(f, 0, 6.6);
    put(gb, T.boxB, beam[0], beam[1], beam[2], 23.4, 0.6, 0.6, C.gantry, -f.th);
    for (const [o, c] of [[-4.6, C.signG], [4.6, C.signB]]) {
      const p = P(f, o, 4.5);
      put(gb, T.boxB, p[0], p[1], p[2], 7.6, 2.3, 0.22, c, -f.th);
      const q = P(f, o, 5.5);
      put(gb, T.boxB, q[0], q[1], q[2], 5.8, 0.28, 0.3, C.white, -f.th);
      const r = P(f, o - 2.2, 4.85);
      put(gb, T.boxB, r[0], r[1], r[2], 1.4, 0.4, 0.3, C.white, -f.th);
    }
  }

  return gb.build();
}

function skyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      top: { value: new THREE.Color(SKY_TOP) },
      horizon: { value: new THREE.Color(HORIZON) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top;
      uniform vec3 horizon;
      varying vec3 vDir;
      void main() {
        float h = max(vDir.y, 0.0);
        gl_FragColor = vec4(mix(horizon, top, pow(h, 0.55)), 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
}

function buildBackdrop() {
  const gb = new GeoBuilder();
  const rng = mulberry32(42);
  const baseC = col(0xa8c0da);
  const peakC = col(0x6a87aa);
  const snowC = col(0xd9e4ef);
  const N = 36;
  for (let i = 0; i < N; i++) {
    const ang = (i / N) * Math.PI * 2 + rng() * 0.1;
    const R = 700 + rng() * 60;
    const cx = Math.sin(ang) * R;
    const cz = Math.cos(ang) * R;
    const h = 60 + rng() * 150;
    const w = 80 + rng() * 80;
    const base = [];
    const sides = 5;
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2 + rng() * 0.4;
      const r = w * (0.7 + rng() * 0.4);
      base.push([cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r]);
    }
    const peak = [cx + (rng() - 0.5) * 30, h, cz + (rng() - 0.5) * 30];
    const pc = h > 190 ? snowC : peakC;
    for (let k = 0; k < sides; k++) gb.tri(base[k], base[(k + 1) % sides], peak, baseC, baseC, pc);
  }
  // Clouds: flattened low-poly blobs
  const cloudC = col(0xffffff);
  const cloudS = col(0xe3ecf6);
  const geo = T.ico.attributes.position.array;
  for (let i = 0; i < 16; i++) {
    const ang = rng() * Math.PI * 2;
    const R = 420 + rng() * 260;
    const cx = Math.sin(ang) * R;
    const cz = Math.cos(ang) * R;
    const cy = 150 + rng() * 120;
    const puffs = 3 + Math.floor(rng() * 3);
    for (let p = 0; p < puffs; p++) {
      const sx = 30 + rng() * 30, sy = 10 + rng() * 8, sz = 20 + rng() * 20;
      const ox = cx + (p - puffs / 2) * 28, oy = cy + rng() * 8, oz = cz + (rng() - 0.5) * 20;
      for (let v = 0; v < geo.length; v += 9) {
        const pt = (j) => [ox + geo[v + j] * sx, oy + geo[v + j + 1] * sy, oz + geo[v + j + 2] * sz];
        const a = pt(0), b = pt(3), c = pt(6);
        const shade = (y) => (y < oy ? cloudS : cloudC);
        gb.tri(a, b, c, shade(a[1]), shade(b[1]), shade(c[1]));
      }
    }
  }
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(gb.build(), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -5;
  return mesh;
}

export class World {
  constructor(scene, tex) {
    this.scene = scene;
    this.chunks = new Map();
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });

    scene.background = new THREE.Color(HORIZON);
    scene.fog = new THREE.Fog(HORIZON, 150, 600);

    const hemi = new THREE.HemisphereLight(0xe4f0ff, 0x6c7d4e, 2.0);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
    sun.position.set(0.45, 1, 0.75);
    scene.add(sun);
    scene.add(sun.target);

    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 24, 12), skyMaterial());
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    this.backdrop = buildBackdrop();
    scene.add(this.backdrop);

    this.sunSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: tex.glow,
        color: 0xfff1c4,
        fog: false,
        depthWrite: false,
        transparent: true,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.sunSprite.scale.setScalar(220);
    this.sunDir = new THREE.Vector3(-0.35, 0.32, -1).normalize();
    scene.add(this.sunSprite);
  }

  /** Keep chunks from `behind` metres back to AHEAD metres ahead of s. */
  update(s, behind = 40, budget = 1) {
    const first = Math.max(0, Math.floor((s - behind) / CHUNK));
    const last = Math.floor((s + AHEAD) / CHUNK);
    for (const [i, mesh] of this.chunks) {
      if (i < first || i > last) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        this.chunks.delete(i);
      }
    }
    // Build nearest missing chunks first.
    const cur = Math.max(first, Math.floor(s / CHUNK));
    for (let d = 0; budget > 0 && (cur + d <= last || cur - d >= first); d++) {
      for (const i of d === 0 ? [cur] : [cur + d, cur - d]) {
        if (i < first || i > last || this.chunks.has(i) || budget <= 0) continue;
        const mesh = new THREE.Mesh(buildChunk(i), this.mat);
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        this.scene.add(mesh);
        this.chunks.set(i, mesh);
        budget--;
      }
    }
  }

  follow(camera) {
    const p = camera.position;
    this.sky.position.copy(p);
    this.backdrop.position.set(p.x, p.y - 45, p.z);
    this.sunSprite.position.copy(p).addScaledVector(this.sunDir, 900);
  }
}
