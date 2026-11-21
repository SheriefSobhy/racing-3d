import * as THREE from 'three';
import { DS, ROAD_HALF, frame, groundY } from './track.js';
import { GeoBuilder, T, put, mulberry32, col } from './geo.js';

export const CHUNK = 80; // metres of road per scenery section
const AHEAD_HIGH = 560;
const AHEAD_LOW = 400; // Low graphics: shorter view (closer fog) = fewer sections and draw calls
const PERIOD = 4800; // UV wrap period (multiple of every texture tile and of CHUNK)

const ROAD_TILE = 24; // road texture covers 20 m x 24 m
const GRASS_TILE = 7;
const CONCRETE_TILE = 3;
const FACADE_TILE = 14;
const SHOULDER = 12.5; // concrete shoulder from the road edge to here
const BARRIER_O = 10.55;
const BARRIER_LEN = 3.9;
const LAMP_O = 11.7;
const GROUND = [SHOULDER, 16, 22, 32, 46, 65, 90, 125, 170, 240];

const C = {
  gantry: col(0x8d949c),
  signG: col(0x1d7a43),
  signB: col(0x1f5fae),
  white: col(0xffffff),
};

/** Indexed geometry accumulator with uv and optional normals / colours. */
class Buf {
  constructor({ normals = false, colors = false } = {}) {
    this.p = [];
    this.u = [];
    this.n = normals ? [] : null;
    this.c = colors ? [] : null;
    this.i = [];
  }
  get count() {
    return this.p.length / 3;
  }
  v(x, y, z, u, v) {
    this.p.push(x, y, z);
    this.u.push(u, v);
    return this.count - 1;
  }
  quad(a, b, c, d) {
    this.i.push(a, b, d, b, c, d);
  }
  build() {
    if (!this.i.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    if (this.c) g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    if (this.n) g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    else g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

/** Append a transformed template geometry (indexed, with normal + uv). */
const _nm = new THREE.Matrix3();
function appendTemplate(buf, geo, m) {
  const base = buf.count;
  const p = geo.attributes.position.array;
  const n = geo.attributes.normal.array;
  const uv = geo.attributes.uv.array;
  const e = m.elements;
  _nm.getNormalMatrix(m);
  const q = _nm.elements;
  for (let i = 0, j = 0; i < p.length; i += 3, j += 2) {
    const x = p[i], y = p[i + 1], z = p[i + 2];
    buf.p.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
    const nx = n[i], ny = n[i + 1], nz = n[i + 2];
    const tx = q[0] * nx + q[3] * ny + q[6] * nz, ty = q[1] * nx + q[4] * ny + q[7] * nz, tz = q[2] * nx + q[5] * ny + q[8] * nz;
    const l = Math.hypot(tx, ty, tz) || 1;
    buf.n.push(tx / l, ty / l, tz / l);
    buf.u.push(uv[j], uv[j + 1]);
  }
  const idx = geo.index.array;
  for (let i = 0; i < idx.length; i++) buf.i.push(base + idx[i]);
}

/** Merge every mesh of a glTF scene into one geometry in a canonical pose. */
function templateFrom(gltf, fit) {
  const geos = [];
  let material = null;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    material = material || o.material;
    const g = new THREE.BufferGeometry();
    // De-quantise (meshopt) to plain floats before applying node transforms.
    for (const k of ['position', 'normal', 'uv']) {
      const a = o.geometry.attributes[k];
      const out = new Float32Array(a.count * a.itemSize);
      const get = [a.getX, a.getY, a.getZ];
      for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) out[i * a.itemSize + c] = get[c].call(a, i);
      g.setAttribute(k, new THREE.BufferAttribute(out, a.itemSize));
    }
    g.setIndex(o.geometry.index ? Array.from(o.geometry.index.array) : [...Array(g.attributes.position.count).keys()]);
    g.applyMatrix4(o.matrixWorld);
    geos.push(g);
  });
  const buf = new Buf({ normals: true });
  const I = new THREE.Matrix4();
  for (const g of geos) appendTemplate(buf, g, I);
  const geo = buf.build();
  fit(geo);
  geo.computeBoundingBox();
  return { geo, material };
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

function placeMatrix(f, o, dy, yawExtra = 0, sx = 1, sy = 1, sz = 1, pitch = true) {
  _p.set(f.x + f.rx * o, f.y + dy, f.z + f.rz * o);
  _q.setFromEuler(_e.set(pitch ? Math.atan(f.slope) : 0, -f.th + yawExtra, 0));
  return _m.compose(_p, _q, _s.set(sx, sy, sz));
}

/** Materials for both graphics levels; normal maps are only attached in High. */
function makeMaterials(a, barrierMat, lampMat) {
  const lam = (o) => new THREE.MeshLambertMaterial(o);
  const m = {
    road: lam({ map: a.road }),
    concrete: lam({ map: a.concrete, color: 0xd8d8d8 }),
    grass: lam({ map: a.grass, vertexColors: true }),
    barrier: lam({ map: barrierMat?.map || null, color: 0xcfcfcf }),
    lamp: lam({ map: lampMat?.map || null, color: 0xb8bcc2 }),
    trees: lam({ map: a.trees, alphaTest: 0.45, side: THREE.DoubleSide }),
    facades: [a.facade0, a.facade1, a.facade2, a.facade3].map((t) => lam({ map: t })),
    misc: lam({ vertexColors: true }),
  };
  if (barrierMat?.map) barrierMat.map.colorSpace = THREE.SRGBColorSpace;
  if (lampMat?.map) lampMat.map.colorSpace = THREE.SRGBColorSpace;
  return m;
}

function buildBackdrop(haze) {
  const gb = new GeoBuilder();
  const rng = mulberry32(42);
  const baseC = col(0x8fa07e).lerp(haze, 0.55);
  const peakC = col(0x6f8199).lerp(haze, 0.35);
  const N = 36;
  for (let i = 0; i < N; i++) {
    const ang = (i / N) * Math.PI * 2 + rng() * 0.1;
    const R = 700 + rng() * 60;
    const cx = Math.sin(ang) * R;
    const cz = Math.cos(ang) * R;
    const h = 50 + rng() * 140;
    const w = 80 + rng() * 80;
    const base = [];
    const sides = 5;
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2 + rng() * 0.4;
      const r = w * (0.7 + rng() * 0.4);
      base.push([cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r]);
    }
    const peak = [cx + (rng() - 0.5) * 30, h, cz + (rng() - 0.5) * 30];
    const pc = peakC;
    for (let k = 0; k < sides; k++) gb.tri(base[k], base[(k + 1) % sides], peak, baseC, baseC, pc);
  }
  // Haze-coloured floor out to the mountains so no sky shows below the horizon.
  const R = 790;
  for (let k = 0; k < 24; k++) {
    const a0 = (k / 24) * Math.PI * 2, a1 = ((k + 1) / 24) * Math.PI * 2;
    gb.tri([0, 0.5, 0], [Math.sin(a1) * R, 0.5, Math.cos(a1) * R], [Math.sin(a0) * R, 0.5, Math.cos(a0) * R], baseC);
  }
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(gb.build(), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -5;
  return mesh;
}

export class World {
  /** a = core assets from loadAssets(). */
  constructor(scene, tex, a) {
    this.scene = scene;
    this.chunks = new Map();
    this.ahead = AHEAD_HIGH;
    this.high = true;

    const info = a.skyInfo;
    const haze = new THREE.Color().setRGB(info.horizon[0] / 255, info.horizon[1] / 255, info.horizon[2] / 255, THREE.SRGBColorSpace);
    scene.background = a.sky;
    scene.fog = new THREE.Fog(haze.clone(), 140, 620);

    const hemi = new THREE.HemisphereLight(0xdfe9f7, 0x5d6648, 1.7);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
    sun.position.set(info.sunDir[0], Math.max(0.35, info.sunDir[1]), info.sunDir[2]);
    scene.add(sun);
    scene.add(sun.target);

    this.backdrop = buildBackdrop(haze);
    scene.add(this.backdrop);

    // Roadside templates.
    let barrierMat = null;
    let lampMat = null;
    this.barrier = templateFrom(a.barrier, (g) => {
      // Length along Z, base at y = 0, stretched to BARRIER_LEN, ~0.85 m tall.
      g.computeBoundingBox();
      let b = g.boundingBox;
      if (b.max.x - b.min.x > b.max.z - b.min.z) g.rotateY(Math.PI / 2);
      g.computeBoundingBox();
      b = g.boundingBox;
      const c = b.getCenter(new THREE.Vector3());
      g.translate(-c.x, -b.min.y, -c.z);
      const h = b.max.y - b.min.y;
      g.scale(0.6 / (b.max.x - b.min.x), 0.85 / h, BARRIER_LEN / (b.max.z - b.min.z));
    });
    barrierMat = this.barrier.material;
    this.lamp = templateFrom(a.lamp, (g) => {
      // Pole at the origin, arm pointing to -X (towards the road on the right-hand side), 7.5 m tall.
      g.computeBoundingBox();
      const b = g.boundingBox;
      const h = b.max.y - b.min.y;
      const p = g.attributes.position;
      let px = 0, pz = 0, n = 0;
      for (let i = 0; i < p.count; i++) {
        if (p.getY(i) < b.min.y + h * 0.15) {
          px += p.getX(i);
          pz += p.getZ(i);
          n++;
        }
      }
      px /= n || 1;
      pz /= n || 1;
      const c = b.getCenter(new THREE.Vector3());
      const ang = Math.atan2(c.z - pz, c.x - px); // arm direction
      g.translate(-px, -b.min.y, -pz);
      g.rotateY(ang + Math.PI); // arm -> -X
      g.scale(7.5 / h, 7.5 / h, 7.5 / h);
    });
    lampMat = this.lamp.material;
    this.mats = makeMaterials(a, barrierMat, lampMat);
    this.normals = {
      road: null, concrete: null, grass: null, barrier: barrierMat?.normalMap || null,
    };
  }

  /** High: normal maps on road, ground and barriers. Low: plain textures. */
  setQuality(high, h) {
    if (h) {
      h.roadN.repeat.set(3, 3);
      h.grassN.repeat.set(1, 1);
      Object.assign(this.normals, { road: h.roadN, concrete: h.concreteN, grass: h.grassN });
    }
    for (const k of ['road', 'concrete', 'grass', 'barrier']) {
      const m = this.mats[k];
      const nm = high ? this.normals[k] : null;
      if (m.normalMap !== nm) {
        m.normalMap = nm;
        m.normalScale.set(0.8, 0.8);
        m.needsUpdate = true;
      }
    }
    if (this.high !== high) {
      this.high = high;
      this.ahead = high ? AHEAD_HIGH : AHEAD_LOW;
      this.scene.fog.near = high ? 140 : 100;
      this.scene.fog.far = high ? 620 : 440;
      // Rebuild sections with the new tree density / view distance.
      for (const group of this.chunks.values()) {
        this.scene.remove(group);
        for (const m of group.children) m.geometry.dispose();
      }
      this.chunks.clear();
      this.dirty = true;
    }
  }

  buildChunk(idx) {
    const s0 = idx * CHUNK;
    const base = Math.floor(s0 / PERIOD) * PERIOD;
    const n = CHUNK / DS;
    const F = [];
    for (let i = 0; i <= n; i++) F.push(frame(s0 + i * DS, {}));
    const rng = mulberry32(idx * 7919 + 13);

    const road = new Buf();
    const concrete = new Buf();
    const grass = new Buf({ colors: true });
    const barrier = new Buf({ normals: true });
    const lamp = new Buf({ normals: true });
    const trees = new Buf({ normals: true });
    const facades = [new Buf(), new Buf(), new Buf(), new Buf()];
    const misc = new GeoBuilder();

    // Road surface: one textured strip, lane markings are in the texture.
    for (let i = 0; i <= n; i++) {
      const f = F[i];
      const v = (f.s - base) / ROAD_TILE;
      road.v(f.x - f.rx * ROAD_HALF, f.y, f.z - f.rz * ROAD_HALF, 0, v);
      road.v(f.x + f.rx * ROAD_HALF, f.y, f.z + f.rz * ROAD_HALF, 1, v);
      if (i) road.quad(2 * i - 2, 2 * i - 1, 2 * i + 1, 2 * i);
    }

    // Concrete shoulders and grass terrain as grids.
    for (const side of [-1, 1]) {
      const grid = (buf, offs, tile, yFn, colorFn) => {
        const start = buf.count;
        const w = offs.length;
        for (let i = 0; i <= n; i++) {
          const f = F[i];
          const v = (f.s - base) / tile;
          for (const o0 of offs) {
            const o = side * o0;
            buf.v(f.x + f.rx * o, yFn(f, o), f.z + f.rz * o, o / tile, v);
            if (colorFn) colorFn(buf, f, o);
          }
          if (i) {
            for (let k = 0; k < w - 1; k++) {
              const a = start + (i - 1) * w + k, b = a + 1, c = start + i * w + k + 1, d = start + i * w + k;
              if (side > 0) buf.quad(a, b, c, d);
              else buf.quad(b, a, d, c);
            }
          }
        }
      };
      grid(concrete, [ROAD_HALF, SHOULDER], CONCRETE_TILE, (f) => f.y - 0.02);
      grid(grass, GROUND, GRASS_TILE, (f, o) => groundY(f.s, o), (buf, f, o) => {
        const t = 0.5 + 0.5 * Math.sin(f.s * 0.013 + o * 0.05) * Math.cos(f.s * 0.007 - o * 0.031);
        buf.c.push(0.6 + t * 0.1, 0.8 + t * 0.08, 0.46 + t * 0.06);
      });
    }

    // Concrete barriers along both edges.
    const bg = this.barrier.geo;
    for (let s = s0 + BARRIER_LEN / 2; s < s0 + CHUNK; s += BARRIER_LEN + 0.04) {
      const f = frame(s, {});
      for (const side of [-1, 1]) appendTemplate(barrier, bg, placeMatrix(f, side * BARRIER_O, -0.02));
    }

    // Street lamps: every 40 m, alternating sides; the arm reaches over the road.
    for (let k = 0; k < CHUNK / 40; k++) {
      const f = F[(k * 40) / DS];
      const side = (idx * 2 + k) % 2 === 0 ? 1 : -1;
      appendTemplate(lamp, this.lamp.geo, placeMatrix(f, side * LAMP_O, -0.02, side > 0 ? 0 : Math.PI, 1, 1, 1, false));
    }

    // City zones: textured buildings come and go with a slow wave along the road.
    const city = Math.sin(s0 / 700 + 1.5);
    const isCity = city > 0.3;
    if (isCity) {
      for (const side of [-1, 1]) {
        const count = 3 + Math.floor(rng() * 3);
        for (let k = 0; k < count; k++) {
          const s = s0 + ((k + 0.5) / count) * CHUNK;
          const w = 10 + rng() * (CHUNK / count - 11);
          const d = 10 + rng() * 12;
          const h = 12 + rng() * 45 * city;
          const o = side * (36 + d / 2 + rng() * 60);
          this.addBuilding(facades[Math.floor(rng() * 4)], concrete, s, o, w, d, h, rng);
        }
      }
    }

    // Trees (billboards from the tree atlas).
    const treeCount = Math.round((isCity ? 8 : 30) * (this.high ? 1 : 0.6));
    for (let k = 0; k < treeCount; k++) {
      const side = rng() < 0.5 ? -1 : 1;
      const o = side * (16 + Math.pow(rng(), 1.4) * (isCity ? 16 : 140));
      const s = s0 + rng() * CHUNK;
      const f = frame(s, {});
      const x = f.x + f.rx * o, z = f.z + f.rz * o, y = groundY(s, o) - 0.1;
      const sc = 0.8 + rng() * 0.7;
      if (rng() < 0.55) addPine(trees, x, y, z, sc, rng() * Math.PI);
      else addLeafy(trees, x, y, z, sc, rng() * Math.PI);
    }

    // Overhead sign gantry every 800 m.
    if (idx % 10 === 5) {
      const f = F[Math.floor(n / 2)];
      const P = (o, dy) => [f.x + f.rx * o, f.y + dy, f.z + f.rz * o];
      for (const o of [-11.5, 11.5]) {
        const p = P(o, -0.05);
        put(misc, T.boxB, p[0], p[1], p[2], 0.45, 7.2, 0.45, C.gantry, -f.th);
      }
      const beam = P(0, 6.6);
      put(misc, T.boxB, beam[0], beam[1], beam[2], 23.4, 0.6, 0.6, C.gantry, -f.th);
      for (const [o, c] of [[-4.6, C.signG], [4.6, C.signB]]) {
        const p = P(o, 4.5);
        put(misc, T.boxB, p[0], p[1], p[2], 7.6, 2.3, 0.22, c, -f.th);
        const q = P(o, 5.5);
        put(misc, T.boxB, q[0], q[1], q[2], 5.8, 0.28, 0.3, C.white, -f.th);
        const r = P(o - 2.2, 4.85);
        put(misc, T.boxB, r[0], r[1], r[2], 1.4, 0.4, 0.3, C.white, -f.th);
      }
    }

    const group = new THREE.Group();
    const add = (buf, mat) => {
      const g = buf.build();
      if (!g) return;
      const mesh = new THREE.Mesh(g, mat);
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    };
    add(road, this.mats.road);
    add(concrete, this.mats.concrete);
    add(grass, this.mats.grass);
    add(barrier, this.mats.barrier);
    add(lamp, this.mats.lamp);
    add(trees, this.mats.trees);
    facades.forEach((b, i) => add(b, this.mats.facades[i]));
    if (misc.pos.length) {
      const mesh = new THREE.Mesh(misc.build(), this.mats.misc);
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
    group.matrixAutoUpdate = false;
    return group;
  }

  addBuilding(fb, roof, s, o, w, d, h, rng) {
    const f = frame(s, {});
    const cx = f.x + f.rx * o, cz = f.z + f.rz * o;
    const y0 = groundY(s, o) - 2;
    const y1 = y0 + h + 2;
    const yaw = -f.th + (rng() - 0.5) * 0.1;
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    // local corners (x across, z along), rotated by yaw
    const L = (lx, lz) => [cx + lx * cs + lz * sn, cz - lx * sn + lz * cs];
    const hw = d / 2, hl = w / 2;
    const corners = [L(-hw, -hl), L(hw, -hl), L(hw, hl), L(-hw, hl)];
    const lens = [d, w, d, w];
    const u0 = rng() * 4;
    let u = u0;
    for (let k = 0; k < 4; k++) {
      const a = corners[k], b = corners[(k + 1) % 4];
      const ua = u / FACADE_TILE, ub = (u + lens[k]) / FACADE_TILE;
      const v0 = 0, v1 = (y1 - y0) / FACADE_TILE;
      const i0 = fb.v(a[0], y0, a[1], ua, v0);
      const i1 = fb.v(b[0], y0, b[1], ub, v0);
      const i2 = fb.v(b[0], y1, b[1], ub, v1);
      const i3 = fb.v(a[0], y1, a[1], ua, v1);
      fb.quad(i1, i0, i3, i2);
      u += lens[k];
    }
    const r = corners.map((c) => roof.v(c[0], y1, c[1], c[0] / CONCRETE_TILE, c[1] / CONCRETE_TILE));
    roof.quad(r[3], r[2], r[1], r[0]);
  }

  /** Keep chunks from `behind` metres back to `this.ahead` metres ahead of s. */
  update(s, behind = 40, budget = 1) {
    if (this.dirty) {
      budget = Infinity; // quality changed: rebuild everything visible at once
      this.dirty = false;
    }
    const first = Math.max(0, Math.floor((s - behind) / CHUNK));
    const last = Math.floor((s + this.ahead) / CHUNK);
    for (const [i, group] of this.chunks) {
      if (i < first || i > last) {
        this.scene.remove(group);
        for (const m of group.children) m.geometry.dispose();
        this.chunks.delete(i);
      }
    }
    const cur = Math.max(first, Math.floor(s / CHUNK));
    for (let d = 0; budget > 0 && (cur + d <= last || cur - d >= first); d++) {
      for (const i of d === 0 ? [cur] : [cur + d, cur - d]) {
        if (i < first || i > last || this.chunks.has(i) || budget <= 0) continue;
        const group = this.buildChunk(i);
        group.updateMatrixWorld(true);
        this.scene.add(group);
        this.chunks.set(i, group);
        budget--;
      }
    }
  }

  follow(camera) {
    const p = camera.position;
    this.backdrop.position.set(p.x, p.y - 45, p.z);
  }
}

// ---------- Tree billboards (atlas: left half pine, right-top crown, right-bottom bark) ----------
function card(buf, x, y, z, w, h, ang, u0, u1, v0, v1) {
  const dx = (Math.cos(ang) * w) / 2, dz = (Math.sin(ang) * w) / 2;
  const a = buf.v(x - dx, y, z - dz, u0, v0);
  const b = buf.v(x + dx, y, z + dz, u1, v0);
  const c = buf.v(x + dx, y + h, z + dz, u1, v1);
  const d = buf.v(x - dx, y + h, z - dz, u0, v1);
  // foliage lit from above so every card shades the same
  for (let i = 0; i < 4; i++) buf.n.push(0, 1, 0);
  buf.quad(a, b, c, d);
}

function addPine(buf, x, y, z, sc, rot) {
  const h = 13 * sc, w = h * 0.5;
  card(buf, x, y, z, w, h, rot, 0, 0.5, 0, 1);
  card(buf, x, y, z, w, h, rot + Math.PI / 2, 0, 0.5, 0, 1);
}

function addLeafy(buf, x, y, z, sc, rot) {
  // trunk: 5-sided prism with bark
  const r = 0.28 * sc, th = 4.2 * sc, sides = 5;
  for (let k = 0; k < sides; k++) {
    const a0 = (k / sides) * Math.PI * 2, a1 = ((k + 1) / sides) * Math.PI * 2;
    const p0 = [x + Math.cos(a0) * r, z + Math.sin(a0) * r], p1 = [x + Math.cos(a1) * r, z + Math.sin(a1) * r];
    const u0 = 0.5 + (k / sides) * 0.5, u1 = 0.5 + ((k + 1) / sides) * 0.5;
    const i0 = buf.v(p0[0], y, p0[1], u0, 0), i1 = buf.v(p1[0], y, p1[1], u1, 0);
    const i2 = buf.v(p1[0] * 0.7 + x * 0.3, y + th, p1[1] * 0.7 + z * 0.3, u1, 0.48), i3 = buf.v(p0[0] * 0.7 + x * 0.3, y + th, p0[1] * 0.7 + z * 0.3, u0, 0.48);
    const am = (a0 + a1) / 2;
    for (let i = 0; i < 4; i++) buf.n.push(Math.cos(am), 0, Math.sin(am));
    buf.quad(i1, i0, i3, i2);
  }
  const cw = 7.5 * sc, ch = 7.5 * sc, cy = y + th - 1.6 * sc;
  for (let k = 0; k < 3; k++) card(buf, x, cy, z, cw, ch, rot + (k * Math.PI) / 3, 0.5, 1, 0.5, 1);
}
