import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GeoBuilder, T, put, col } from './geo.js';

/** Player cars. Speeds are in m/s (x3.6 for km/h). */
export const CARS = [
  {
    id: 'vortex', name: 'VORTEX GT', price: 0,
    color: 0xd81f2a, accent: 0x1b1b1f, rim: 0xc9ced6,
    maxSpeed: 70, accel: 13, handling: 1.0, nitro: 1.0, wing: 'lip',
  },
  {
    id: 'kestrel', name: 'KESTREL RS', price: 300,
    color: 0x1c7ce0, accent: 0xf2f2f2, rim: 0x2a2d33,
    maxSpeed: 74, accel: 15, handling: 1.12, nitro: 1.05, wing: 'wing',
  },
  {
    id: 'solaris', name: 'SOLARIS X', price: 800,
    color: 0xffb000, accent: 0x141414, rim: 0x141414,
    maxSpeed: 78, accel: 16, handling: 1.05, nitro: 1.3, wing: 'wing',
  },
  {
    id: 'umbra', name: 'UMBRA Z9', price: 1500,
    color: 0x5a22c8, accent: 0x18181e, rim: 0xe6e6e6,
    maxSpeed: 84, accel: 18, handling: 1.25, nitro: 1.3, wing: 'wing',
  },
];

export function makeTextures() {
  const mk = (size, stops) => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [o, s] of stops) gr.addColorStop(o, s);
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return {
    glow: mk(64, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.65)'], [1, 'rgba(255,255,255,0)']]),
    shadow: mk(64, [[0, 'rgba(0,0,0,0.85)'], [0.55, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,0)']]),
    smoke: mk(64, [[0, 'rgba(255,255,255,0.9)'], [0.5, 'rgba(255,255,255,0.4)'], [1, 'rgba(255,255,255,0)']]),
  };
}

const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
let shadowMat = null;
export function shadowMesh(tex, w, l) {
  if (!shadowMat) {
    shadowMat = new THREE.MeshBasicMaterial({ map: tex.shadow, transparent: true, depthWrite: false, opacity: 0.75 });
  }
  const m = new THREE.Mesh(shadowGeo, shadowMat);
  m.scale.set(w, 1, l);
  m.position.y = 0.04;
  m.renderOrder = 1;
  return m;
}

// ---------- Player car (glTF model) ----------
const CAR_LENGTH = 4.5;
const _box = new THREE.Box3();
let carTemplate = null;

/** Normalise the glTF once: front faces -Z, wheels on y = 0, centred, CAR_LENGTH long. */
function prepareCarTemplate(gltf) {
  const model = gltf.scene;
  const holder = new THREE.Group();
  holder.add(model);
  holder.updateMatrixWorld(true);
  const centre = (name) => _box.setFromObject(model.getObjectByName(name)).getCenter(new THREE.Vector3());
  const dir = centre('BodyHeadlights').sub(centre('BodyTaillights'));
  holder.rotation.y = Math.atan2(dir.x, -dir.z);
  holder.updateMatrixWorld(true);
  _box.setFromObject(holder);
  holder.scale.setScalar(CAR_LENGTH / (_box.max.z - _box.min.z));
  holder.updateMatrixWorld(true);
  _box.setFromObject(holder);
  const c = _box.getCenter(new THREE.Vector3());
  holder.position.set(-c.x, -_box.min.y, -c.z);
  holder.updateMatrixWorld(true);

  // Interior / underbody parts are barely visible through tinted glass: one shared dark material.
  // Tyre side + tread share one rubber material. Fewer materials = fewer draw calls.
  const interior = new THREE.MeshStandardMaterial({ name: 'Interior', color: 0x161616, roughness: 0.85, metalness: 0.1 });
  let rubber = null;
  let rimDark = null;
  holder.traverse((o) => o.isMesh && o.material.name === 'Rim1' && (rimDark = o.material));
  holder.traverse((o) => {
    if (!o.isMesh) return;
    const n = o.material.name;
    if (/^Interior|Floormat|Dashboard|Panel Sides|Mechanical|Hardware/.test(n) || n === '') o.material = interior;
    else if ((n === 'Disc' || n === 'Brake') && rimDark) o.material = rimDark; // brake parts behind the spokes
    else if (/^Tire/.test(n)) {
      rubber = rubber || Object.assign(o.material.clone(), { name: 'Tire' });
      rubber.map = null;
      rubber.color.setHex(0x111111);
      rubber.roughness = 0.9;
      o.material = rubber;
    }
  });

  // Merge parts by material to cut draw calls: one set for the body, one per wheel (wheels spin/steer).
  const template = new THREE.Group();
  const wheelNodes = WHEELS.map((n) => model.getObjectByName(n)).filter(Boolean);
  const inWheel = (o) => {
    for (let p = o; p; p = p.parent) if (wheelNodes.includes(p)) return true;
    return false;
  };
  const bodyMeshes = [];
  holder.traverse((o) => o.isMesh && !inWheel(o) && bodyMeshes.push(o));
  for (const m of mergeByMaterial(bodyMeshes, new THREE.Matrix4())) template.add(m);
  for (const node of wheelNodes) {
    const g = new THREE.Group();
    g.name = node.name;
    new THREE.Box3().setFromObject(node).getCenter(g.position);
    g.updateMatrixWorld();
    const meshes = [];
    node.traverse((o) => o.isMesh && meshes.push(o));
    for (const m of mergeByMaterial(meshes, g.matrixWorld.clone().invert())) g.add(m);
    template.add(g);
  }
  template.traverse((o) => {
    if (o.isMesh) o.frustumCulled = false; // the car is always on screen
  });
  template.updateMatrixWorld(true);
  const lights = new THREE.Box3();
  template.traverse((o) => o.isMesh && o.material.name === 'Brakelight' && lights.expandByObject(o));
  template.userData.taillights = lights;
  template.userData.bounds = new THREE.Box3().setFromObject(template);
  return template;
}

const WHEELS = ['WheelFrontL', 'WheelFrontR', 'WheelRearL', 'WheelRearR'];

/** Plain float copy of a (possibly meshopt-quantised) geometry, transformed by m. */
function floatGeometry(src, m) {
  const g = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(src.attributes)) {
    const out = new Float32Array(a.count * a.itemSize);
    const get = [a.getX, a.getY, a.getZ, a.getW];
    for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) out[i * a.itemSize + c] = get[c].call(a, i);
    g.setAttribute(k, new THREE.BufferAttribute(out, a.itemSize));
  }
  const n = g.attributes.position.count;
  g.setIndex(src.index ? Array.from(src.index.array) : [...Array(n).keys()]);
  g.applyMatrix4(m);
  return g;
}

function mergeByMaterial(meshes, toLocal) {
  const groups = new Map();
  for (const mesh of meshes) {
    const key = mesh.material.uuid + '|' + Object.keys(mesh.geometry.attributes).sort().join(',');
    if (!groups.has(key)) groups.set(key, { material: mesh.material, geos: [] });
    const m = new THREE.Matrix4().multiplyMatrices(toLocal, mesh.matrixWorld);
    groups.get(key).geos.push(floatGeometry(mesh.geometry, m));
  }
  const out = [];
  for (const { material, geos } of groups.values()) {
    const geo = geos.length > 1 ? mergeGeometries(geos) : geos[0];
    out.push(new THREE.Mesh(geo, material));
  }
  return out;
}

const lowCache = new Map();
/** Cheap material for Low graphics: no PBR, no environment reflections. */
function lowMaterial(m) {
  let L = lowCache.get(m);
  if (L) return L;
  const shiny = /Paint|Glass|Rim2|Mirror/.test(m.name);
  L = shiny
    ? new THREE.MeshPhongMaterial({ shininess: /Glass/.test(m.name) ? 120 : 70, specular: 0x4a4a4a })
    : new THREE.MeshLambertMaterial();
  L.name = m.name;
  L.color.copy(m.color);
  if (m.metalness > 0.5 && !/Paint/.test(m.name)) L.color.multiplyScalar(0.75);
  L.map = m.map;
  L.emissive.copy(m.emissive);
  L.emissiveMap = m.emissiveMap;
  L.emissiveIntensity = m.emissiveIntensity;
  L.transparent = m.transparent;
  L.opacity = m.opacity;
  L.side = m.side;
  L.depthWrite = m.depthWrite;
  lowCache.set(m, L);
  return L;
}

export function setCarQuality(car, high) {
  for (const mesh of car.meshes) mesh.material = high ? mesh.userData.hi : mesh.userData.lo;
}

/**
 * Player car built from the shared glTF model. Front faces -Z.
 * Returns handles used for animation (same shape as before).
 */
export function buildPlayerCar(spec, tex, gltf) {
  if (!carTemplate) carTemplate = prepareCarTemplate(gltf);
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const body = new THREE.Group();
  root.add(body);
  const model = carTemplate.clone(true);
  body.add(model);

  // Per-car colours on cloned materials; other materials stay shared.
  const custom = new Map();
  const recolor = (m) => {
    if (custom.has(m)) return custom.get(m);
    let c = m;
    if (/^Paint 1/.test(m.name)) c = m.clone(), c.color.setHex(spec.color);
    else if (/^Paint 2/.test(m.name)) c = m.clone(), c.color.setHex(spec.accent);
    else if (m.name === 'Rim2') c = m.clone(), c.color.setHex(spec.rim);
    else if (m.name === 'Brakelight') c = m.clone(), c.emissive.setHex(0xff1a1a), (c.emissiveIntensity = 2.2), c.color.setHex(0x550000);
    else if (m.name === 'Headlight') c = m.clone(), c.emissive.setHex(0xfff2d6), (c.emissiveIntensity = 1.6);
    else if (m.name === 'Signallight') c = m.clone(), c.emissive.setHex(0xff8a00), (c.emissiveIntensity = 0.5);
    if (c !== m && 'envMapIntensity' in c) c.envMapIntensity = /Paint/.test(c.name) ? 1.15 : 1;
    custom.set(m, c);
    return c;
  };
  const meshes = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.material = recolor(o.material);
    o.userData.hi = o.material;
    o.userData.lo = lowMaterial(o.material);
    meshes.push(o);
  });

  root.updateMatrixWorld(true);
  const whole = carTemplate.userData.bounds;

  // Wheels: steer (yaw) group at the hub -> spin group -> merged wheel meshes.
  const steers = [];
  const spins = [];
  let wheelR = 0.34;
  for (const name of WHEELS) {
    const node = model.getObjectByName(name);
    if (!node) continue;
    const b = new THREE.Box3().setFromObject(node);
    wheelR = (b.max.y - b.min.y) / 2;
    const steer = new THREE.Group();
    steer.position.copy(node.position);
    const spin = new THREE.Group();
    steer.add(spin);
    root.add(steer);
    node.position.set(0, 0, 0);
    spin.add(node);
    spins.push(spin);
    if (name.includes('Front')) steers.push(steer);
  }

  // Tail-light glow sprites on the real tail-light positions.
  const glowMat = new THREE.SpriteMaterial({
    map: tex.glow, color: 0xff2a3a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const tl = carTemplate.userData.taillights;
  const tlW = (tl.max.x - tl.min.x) / 2;
  const tlY = (tl.min.y + tl.max.y) / 2;
  const glows = [];
  for (const s of [-1, 1]) {
    const sp = new THREE.Sprite(glowMat);
    sp.position.set(s * tlW * 0.78, tlY, tl.max.z + 0.06);
    sp.scale.set(0.9, 0.45, 1);
    body.add(sp);
    glows.push(sp);
  }

  // Nitro flames (tip points backwards, +Z) from the rear diffuser.
  const rearZ = whole.max.z - 0.05;
  const flames = new THREE.Group();
  const flameGeo = (r, l) => new THREE.ConeGeometry(r, l, 8, 1, true).translate(0, l / 2, 0).rotateX(Math.PI / 2);
  const outer = [], inner = [];
  for (const x of [-0.42, 0.42]) {
    outer.push(flameGeo(0.14, 1.1).translate(x, 0.32, rearZ));
    inner.push(flameGeo(0.07, 0.6).translate(x, 0.32, rearZ));
  }
  const flameMat = (c, o) => new THREE.MeshBasicMaterial({
    color: c, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  flames.add(new THREE.Mesh(mergeGeometries(outer), flameMat(0x3a9cff, 0.85)));
  flames.add(new THREE.Mesh(mergeGeometries(inner), flameMat(0xe0f6ff, 0.95)));
  flames.visible = false;
  body.add(flames);

  root.add(shadowMesh(tex, 2.5, 5.3));

  const height = whole.max.y;
  return { root, body, steers, spins, flames, glows, glowMat, spec, meshes, wheelR, height };
}

/** Simple traffic vehicles: body (tinted per car), details and lights. */
export function buildTrafficTemplates() {
  const K = {
    glass: col(0x1a2533), tire: col(0x18191c), bumper: col(0x2a2c30), tail: col(0xff2030),
    head: col(0xfff3d0), trailer: col(0xe4e6e8), chassis: col(0x303236), amber: col(0xffa21f),
  };
  const W = col(0xffffff);
  const bx = (gb, x, y, z, sx, sy, sz, c) => put(gb, T.box, x, y, z, sx, sy, sz, c);
  const wh = (gb, x, z, r, w) => put(gb, T.wheel, x, r, z, w, r, r, K.tire);
  const make = (type, length, width, weight, fn) => {
    const b = new GeoBuilder(), d = new GeoBuilder(), l = new GeoBuilder();
    fn(b, d, l);
    return { type, length, width, weight, body: b.build(), det: d.build(), lit: l.build() };
  };
  const lights = (l, x, yT, yH, zr, zf, sx = 0.44, sy = 0.13) => {
    for (const s of [-1, 1]) {
      bx(l, s * x, yT, zr, sx, sy, 0.05, K.tail);
      bx(l, s * x, yH, zf, 0.4, 0.1, 0.05, K.head);
    }
  };

  return [
    make('sedan', 4.4, 1.84, 0.45, (b, d, l) => {
      bx(b, 0, 0.58, 0, 1.84, 0.6, 4.4, W);
      bx(d, 0, 1.12, 0.25, 1.62, 0.5, 2.2, K.glass);
      bx(b, 0, 1.39, 0.3, 1.64, 0.06, 1.8, W);
      bx(d, 0, 0.33, -2.18, 1.88, 0.16, 0.14, K.bumper);
      bx(d, 0, 0.33, 2.18, 1.88, 0.16, 0.14, K.bumper);
      for (const x of [-0.84, 0.84]) for (const z of [-1.35, 1.35]) wh(d, x, z, 0.33, 0.26);
      lights(l, 0.6, 0.74, 0.66, 2.21, -2.21);
    }),
    make('suv', 4.7, 1.96, 0.25, (b, d, l) => {
      bx(b, 0, 0.76, 0, 1.96, 0.82, 4.7, W);
      bx(d, 0, 1.47, 0.25, 1.78, 0.62, 2.7, K.glass);
      bx(b, 0, 1.8, 0.3, 1.8, 0.07, 2.5, W);
      bx(d, 0, 0.42, -2.34, 2.0, 0.2, 0.14, K.bumper);
      bx(d, 0, 0.42, 2.34, 2.0, 0.2, 0.14, K.bumper);
      for (const x of [-0.9, 0.9]) for (const z of [-1.5, 1.5]) wh(d, x, z, 0.38, 0.28);
      lights(l, 0.66, 0.98, 0.86, 2.36, -2.36);
    }),
    make('van', 5.2, 2.0, 0.18, (b, d, l) => {
      bx(b, 0, 1.3, 0, 2.0, 1.95, 5.2, W);
      bx(d, 0, 1.75, -2.6, 1.8, 0.72, 0.05, K.glass);
      bx(d, 0, 1.8, -1.75, 2.03, 0.55, 1.1, K.glass);
      bx(d, 0, 0.38, -2.6, 2.04, 0.2, 0.14, K.bumper);
      bx(d, 0, 0.38, 2.6, 2.04, 0.2, 0.14, K.bumper);
      for (const x of [-0.92, 0.92]) for (const z of [-1.75, 1.75]) wh(d, x, z, 0.36, 0.28);
      for (const s of [-1, 1]) {
        bx(l, s * 0.85, 1.0, 2.61, 0.22, 0.55, 0.05, K.tail);
        bx(l, s * 0.7, 0.8, -2.61, 0.4, 0.12, 0.05, K.head);
      }
    }),
    make('truck', 10.3, 2.45, 0.12, (b, d, l) => {
      bx(b, 0, 1.6, -4.0, 2.4, 2.3, 2.4, W);
      bx(d, 0, 2.15, -5.21, 2.2, 0.85, 0.05, K.glass);
      bx(d, 0, 2.05, 1.3, 2.5, 3.0, 7.6, K.trailer);
      bx(d, 0, 0.6, 0, 2.2, 0.3, 10.2, K.chassis);
      bx(d, 0, 0.55, 5.12, 2.4, 0.2, 0.1, K.bumper);
      bx(d, 0, 0.5, -5.2, 2.44, 0.25, 0.12, K.bumper);
      for (const x of [-1.0, 1.0]) for (const z of [-4.0, 2.6, 3.9]) wh(d, x, z, 0.5, 0.34);
      for (const s of [-1, 1]) {
        bx(l, s * 1.0, 0.85, 5.18, 0.32, 0.2, 0.04, K.tail);
        bx(l, s * 0.8, 1.0, -5.22, 0.4, 0.14, 0.04, K.head);
        bx(l, s * 1.2, 3.5, 5.11, 0.1, 0.1, 0.05, K.amber);
      }
    }),
  ];
}
